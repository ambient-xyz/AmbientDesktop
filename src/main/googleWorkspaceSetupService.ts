import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  AmbientPluginAuthAccountSummary,
  GoogleWorkspaceOAuthClientImportInput,
  GoogleWorkspaceSetupCommand,
  GoogleWorkspaceSetupInput,
  GoogleWorkspaceSetupState,
  GoogleWorkspaceAccountIdentity,
  GoogleWorkspaceValidationCheck,
  GoogleWorkspaceValidationResult,
} from "../shared/types";
import { redactString } from "./diagnostics";
import {
  GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES,
  GoogleWorkspaceCliAdapter,
  googleWorkspaceCliEnv,
} from "./googleWorkspaceCliAdapter";

export interface GoogleWorkspaceSetupServiceOptions {
  adapter: GoogleWorkspaceCliAdapter;
  accountsPath: string;
  env?: NodeJS.ProcessEnv;
  spawnProcess?: typeof spawn;
  openExternal?: (url: string) => Promise<unknown> | unknown;
  now?: () => Date;
}

interface GoogleWorkspaceCliAccountRecord extends AmbientPluginAuthAccountSummary {
  configDir: string;
}

interface GoogleWorkspaceChildExitOptions {
  openAuthUrl: boolean;
  loginAfterSetup: boolean;
}

const DEFAULT_ACCOUNT_HANDLE = "default";
const OUTPUT_TAIL_LIMIT = 8_000;

export class GoogleWorkspaceSetupService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly spawnProcess: typeof spawn;
  private readonly now: () => Date;
  private activeChild?: ChildProcessWithoutNullStreams;
  private setupState: GoogleWorkspaceSetupState = { status: "idle" };
  private accounts: GoogleWorkspaceCliAccountRecord[] = [];

  constructor(private readonly options: GoogleWorkspaceSetupServiceOptions) {
    this.env = options.env ?? process.env;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.now = options.now ?? (() => new Date());
  }

  async loadAccounts(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.options.accountsPath, "utf8")) as { accounts?: GoogleWorkspaceCliAccountRecord[] };
      this.accounts = Array.isArray(parsed.accounts) ? parsed.accounts.map(normalizeAccountRecord) : [];
    } catch (error) {
      if (!isNotFound(error)) throw error;
      this.accounts = [];
    }
  }

  accountSummaries(): AmbientPluginAuthAccountSummary[] {
    return this.accounts.map(({ configDir: _configDir, ...account }) => ({ ...account }));
  }

  resolveAccountHintForCall(accountHint?: string): string {
    const normalized = normalizeAccountHandle(accountHint);
    const explicit = Boolean(accountHint?.trim());
    const existing = this.findAccount(normalized);
    if (explicit) return existing?.accountId ?? normalized;

    const available = this.accounts.filter((account) => account.status === "available");
    if (available.length === 1) return available[0]!.accountId;
    if (available.length > 1) {
      throw new Error(
        `Google Workspace call requires accountHint because multiple accounts are connected: ${available.map((account) => account.accountId).join(", ")}.`,
      );
    }
    return normalized;
  }

  state(): GoogleWorkspaceSetupState {
    return this.stateWithCurrentAccountConfig();
  }

  start(input: GoogleWorkspaceSetupInput = {}): GoogleWorkspaceSetupState {
    if (this.activeChild) throw new Error("Google Workspace setup is already running.");
    const requestedCommand = input.command ?? "login";
    const binaryPath = this.options.adapter.binaryPath();
    const status = this.options.adapter.status(input.accountHint);
    if (status.state === "missing") throw new Error(status.unavailableReason ?? "Google Workspace CLI is missing.");
    const accountHint = this.resolveAccountHandle(input.accountHint);
    const configDir = this.options.adapter.configDir(accountHint);
    const oauthClientConfigured = hasOAuthClientConfig(configDir, this.env);
    if (requestedCommand === "login" && !oauthClientConfigured) {
      const now = this.now().toISOString();
      this.setupState = {
        status: "error",
        command: "login",
        accountHint,
        configDir,
        oauthClientConfigured,
        requiredAction: "oauth_client_config",
        startedAt: now,
        finishedAt: now,
        error:
          "Google Workspace needs a Desktop OAuth client config before account sign-in can start. Create a Desktop OAuth client in Google Cloud Console, then import the downloaded client_secret JSON.",
        outputTail: status.setupCommands.join("\n"),
      };
      return this.state();
    }
    const command = requestedCommand;
    const args = setupArgs(command);
    const startedAt = this.now().toISOString();
    this.setupState = {
      status: "running",
      command,
      accountHint,
      configDir,
      oauthClientConfigured,
      startedAt,
      outputTail: "",
    };
    const exitOptions = {
      openAuthUrl: input.openAuthUrl !== false,
      loginAfterSetup: false,
    };
    this.spawnSetupChild(binaryPath, args, command, accountHint, configDir, exitOptions);
    return this.state();
  }

  private spawnSetupChild(
    binaryPath: string,
    args: string[],
    command: GoogleWorkspaceSetupCommand,
    accountHint: string,
    configDir: string,
    exitOptions: GoogleWorkspaceChildExitOptions,
  ): void {
    const child = this.spawnProcess(binaryPath, args, {
      env: googleWorkspaceCliEnv({ base: this.env, configDir }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.activeChild = child;
    child.stdin.end();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleOutput(chunk, exitOptions.openAuthUrl));
    child.stderr.on("data", (chunk: string) => this.handleOutput(chunk, exitOptions.openAuthUrl));
    child.on("error", (error) => {
      if (this.activeChild === child) this.activeChild = undefined;
      this.setupState = {
        ...this.setupState,
        status: "error",
        finishedAt: this.now().toISOString(),
        error: error.message,
      };
    });
    child.on("exit", (code, signal) => {
      if (this.activeChild === child) this.activeChild = undefined;
      void this.handleExit(command, accountHint, configDir, code, signal, exitOptions);
    });
  }

  cancel(): GoogleWorkspaceSetupState {
    const child = this.activeChild;
    if (!child) return this.state();
    child.kill();
    this.activeChild = undefined;
    this.setupState = {
      ...this.setupState,
      status: "canceled",
      finishedAt: this.now().toISOString(),
    };
    return this.state();
  }

  async forgetAccount(input: { accountHint?: string } = {}): Promise<AmbientPluginAuthAccountSummary[]> {
    if (this.activeChild) throw new Error("Cancel the active Google Workspace setup before disconnecting an account.");
    const accountHint = this.resolveAccountHandle(input.accountHint);
    this.accounts = this.accounts.filter((account) => account.accountId !== accountHint);
    await this.saveAccounts();
    if (this.setupState.accountHint === accountHint) {
      this.setupState = { status: "idle" };
    }
    return this.accountSummaries();
  }

  async importOAuthClientConfig(input: GoogleWorkspaceOAuthClientImportInput & { sourcePath: string }): Promise<GoogleWorkspaceSetupState> {
    if (this.activeChild) throw new Error("Cancel the active Google Workspace setup before importing OAuth client config.");
    const accountHint = this.resolveAccountHandle(input.accountHint);
    const configDir = this.options.adapter.configDir(accountHint);
    const clientSecret = await readGoogleWorkspaceOAuthClientConfig(input.sourcePath);
    await mkdir(configDir, { recursive: true });
    const targetPath = join(configDir, "client_secret.json");
    await writeFile(targetPath, `${JSON.stringify(clientSecret, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(targetPath, 0o600).catch(() => undefined);
    const now = this.now().toISOString();
    this.setupState = {
      status: "completed",
      command: "setup",
      accountHint,
      configDir,
      oauthClientConfigured: true,
      startedAt: now,
      finishedAt: now,
      outputTail: `Imported Google Workspace OAuth client config from ${basename(input.sourcePath)}. Secret value not printed.`,
    };
    return this.state();
  }

  async validate(input: { accountHint?: string } = {}): Promise<GoogleWorkspaceValidationResult> {
    const accountHint = this.resolveAccountHandle(input.accountHint);
    const configDir = this.options.adapter.configDir(accountHint);
    const checks: GoogleWorkspaceValidationCheck[] = [];
    const identity = await this.discoverIdentity(accountHint);
    if (identity) checks.push({ service: "identity", label: "Account identity", ok: true });
    checks.push(await this.runValidationCheck("gmail", "Gmail labels", () =>
      this.options.adapter.invoke({ method: "gmail.listLabels", accountHint, options: { timeoutMs: 20_000 } }),
    ));
    checks.push(await this.runValidationCheck("calendar", "Calendar list", () =>
      this.options.adapter.invoke({ method: "calendar.listCalendars", accountHint, input: { max: 1 }, options: { timeoutMs: 20_000 } }),
    ));
    checks.push(await this.runValidationCheck("drive", "Drive search", () =>
      this.options.adapter.invoke({ method: "drive.search", accountHint, input: { max: 1 }, options: { timeoutMs: 20_000 } }),
    ));
    const duplicate = identity?.email
      ? this.accounts.find((account) => account.email === identity.email && account.accountId !== accountHint)
      : undefined;
    if (duplicate) {
      checks.push({
        service: "identity",
        label: "Unique account",
        ok: false,
        message: `${identity!.email} is already registered as ${duplicate.accountId}. Use that account handle or forget the duplicate before continuing.`,
      });
    }
    const ok = checks.every((check) => check.ok);
    const now = this.now().toISOString();
    const previous = this.accounts.find((account) => account.accountId === accountHint);
    const email = identity?.email ?? previous?.email;
    const account: GoogleWorkspaceCliAccountRecord = {
      id: `gws:${accountHint}`,
      accountId: accountHint,
      label: email ?? (accountHint === DEFAULT_ACCOUNT_HANDLE ? "Google Workspace CLI default account" : accountHint),
      email,
      status: ok ? "available" : "error",
      grantedScopes: ["gws:gmail", "gws:calendar", "gws:drive"],
      connectedAt: previous?.connectedAt ?? now,
      updatedAt: now,
      lastValidatedAt: now,
      validationError: ok ? undefined : checks.find((check) => !check.ok)?.message,
      configDir,
    };
    this.accounts = [...this.accounts.filter((existing) => existing.accountId !== accountHint), account].sort((left, right) =>
      left.accountId.localeCompare(right.accountId),
    );
    await this.saveAccounts();
    return { account: stripConfigDir(account), checks, identity };
  }

  private handleOutput(chunk: string, openAuthUrl: boolean): void {
    const outputTail = this.appendOutputTail(chunk);
    const authUrl = this.setupState.authUrl ?? extractAuthUrl(chunk);
    const oauthClientConfigUrl = this.setupState.oauthClientConfigUrl ?? extractOAuthClientConfigUrl(chunk);
    const shouldOpen = openAuthUrl && authUrl && !this.setupState.openedAuthUrl;
    this.setupState = {
      ...this.setupState,
      outputTail,
      ...(authUrl ? { authUrl } : {}),
      ...(oauthClientConfigUrl ? { oauthClientConfigUrl } : {}),
      ...(shouldOpen ? { openedAuthUrl: true } : {}),
    };
    if (shouldOpen) {
      void Promise.resolve(this.options.openExternal?.(authUrl)).catch((error) => {
        this.setupState = {
          ...this.setupState,
          error: `Failed to open Google auth URL: ${error instanceof Error ? error.message : String(error)}`,
        };
      });
    }
  }

  private stateWithCurrentAccountConfig(): GoogleWorkspaceSetupState {
    const state = structuredClone(this.setupState);
    if (state.configDir && state.oauthClientConfigured === undefined) {
      state.oauthClientConfigured = hasOAuthClientConfig(state.configDir, this.env);
    }
    return state;
  }

  private async handleExit(
    command: GoogleWorkspaceSetupCommand,
    accountHint: string,
    configDir: string,
    code: number | null,
    signal: NodeJS.Signals | null,
    exitOptions: GoogleWorkspaceChildExitOptions,
  ): Promise<void> {
    if (this.setupState.status === "canceled") return;
    if (code !== 0) {
      const outputTail = this.setupState.outputTail ?? "";
      const needsOAuthClient = googleWorkspaceSetupNeedsManualOAuthClient(outputTail);
      const oauthClientConfigUrl = needsOAuthClient
        ? this.setupState.oauthClientConfigUrl ?? extractOAuthClientConfigUrl(outputTail)
        : undefined;
      const shouldOpenOAuthClientConfigUrl = Boolean(exitOptions.openAuthUrl && oauthClientConfigUrl && !this.setupState.openedOAuthClientConfigUrl);
      this.setupState = {
        ...this.setupState,
        status: "error",
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        finishedAt: this.now().toISOString(),
        ...(needsOAuthClient ? { requiredAction: "oauth_client_config" as const } : {}),
        oauthClientConfigured: hasOAuthClientConfig(configDir, this.env),
        ...(oauthClientConfigUrl ? { oauthClientConfigUrl } : {}),
        ...(shouldOpenOAuthClientConfigUrl ? { openedOAuthClientConfigUrl: true } : {}),
        error: needsOAuthClient
          ? "Google Cloud login completed, but Google Workspace still needs a Desktop OAuth client config. Create a Desktop OAuth client in Google Cloud Console, then import the downloaded client_secret JSON."
          : `gws auth ${command} exited with ${code ?? signal ?? "unknown"}.`,
      };
      if (shouldOpenOAuthClientConfigUrl && oauthClientConfigUrl) {
        void Promise.resolve(this.options.openExternal?.(oauthClientConfigUrl)).catch((error) => {
          this.setupState = {
            ...this.setupState,
            error: `Failed to open Google Cloud OAuth client setup URL: ${error instanceof Error ? error.message : String(error)}`,
          };
        });
      }
      return;
    }
    if (command === "setup") {
      if (!hasOAuthClientConfig(configDir, this.env)) {
        this.setupState = {
          ...this.setupState,
          status: "error",
          exitCode: 0,
          finishedAt: this.now().toISOString(),
          accountHint,
          configDir,
          oauthClientConfigured: false,
          requiredAction: "oauth_client_config",
          error:
            "Google Workspace setup completed, but no OAuth client config was created. Create a Desktop OAuth client in Google Cloud Console, then import the downloaded client_secret JSON.",
        };
        return;
      }
      if (!exitOptions.loginAfterSetup) {
        this.setupState = {
          ...this.setupState,
          status: "completed",
          exitCode: 0,
          finishedAt: this.now().toISOString(),
          accountHint,
          configDir,
          oauthClientConfigured: true,
        };
        return;
      }
      this.setupState = {
        ...this.setupState,
        status: "running",
        command: "login",
        accountHint,
        configDir,
        startedAt: this.now().toISOString(),
        finishedAt: undefined,
        exitCode: undefined,
        signal: undefined,
        error: undefined,
        requiredAction: undefined,
        oauthClientConfigured: true,
      };
      this.spawnSetupChild(this.options.adapter.binaryPath(), setupArgs("login"), "login", accountHint, configDir, {
        openAuthUrl: exitOptions.openAuthUrl,
        loginAfterSetup: false,
      });
      return;
    }
    this.setupState = {
      ...this.setupState,
      status: "validating",
      exitCode: 0,
      finishedAt: this.now().toISOString(),
      accountHint,
      configDir,
      oauthClientConfigured: true,
    };
    try {
      const validation = await this.validate({ accountHint });
      this.setupState = {
        ...this.setupState,
        status: validation.checks.every((check) => check.ok) ? "completed" : "error",
        validation,
        discoveredEmail: validation.identity?.email,
        error: validation.checks.find((check) => !check.ok)?.message,
      };
    } catch (error) {
      this.setupState = {
        ...this.setupState,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private appendOutputTail(chunk: string): string {
    const cleanChunk = redactString(chunk);
    const outputTail = `${this.setupState.outputTail ?? ""}${cleanChunk}`.slice(-OUTPUT_TAIL_LIMIT);
    this.setupState = {
      ...this.setupState,
      outputTail,
    };
    return outputTail;
  }

  private async runValidationCheck(
    service: GoogleWorkspaceValidationCheck["service"],
    label: string,
    run: () => Promise<unknown>,
  ): Promise<GoogleWorkspaceValidationCheck> {
    try {
      await run();
      return { service, label, ok: true };
    } catch (error) {
      return {
        service,
        label,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async discoverIdentity(accountHint: string): Promise<GoogleWorkspaceAccountIdentity | undefined> {
    const fromGmail = await this.tryGmailProfileIdentity(accountHint);
    if (fromGmail) return fromGmail;
    return this.tryDriveAboutIdentity(accountHint);
  }

  private async tryGmailProfileIdentity(accountHint: string): Promise<GoogleWorkspaceAccountIdentity | undefined> {
    try {
      const profile = await this.options.adapter.invoke<{ emailAddress?: unknown }>({
        method: "gmail.getProfile",
        accountHint,
        options: { timeoutMs: 20_000 },
      });
      const email = optionalString(profile.emailAddress);
      if (!email) return undefined;
      return { email, source: "gmail.profile" };
    } catch {
      return undefined;
    }
  }

  private async tryDriveAboutIdentity(accountHint: string): Promise<GoogleWorkspaceAccountIdentity | undefined> {
    try {
      const about = await this.options.adapter.invoke<{ user?: { emailAddress?: unknown; displayName?: unknown } }>({
        method: "drive.about",
        accountHint,
        options: { timeoutMs: 20_000 },
      });
      const email = optionalString(about.user?.emailAddress);
      const displayName = optionalString(about.user?.displayName);
      if (!email && !displayName) return undefined;
      return { email, displayName, source: "drive.about" };
    } catch {
      return undefined;
    }
  }

  private resolveAccountHandle(accountHint: string | undefined): string {
    const normalized = normalizeAccountHandle(accountHint);
    const existing = this.findAccount(normalized);
    return existing?.accountId ?? normalized;
  }

  private findAccount(normalized: string): GoogleWorkspaceCliAccountRecord | undefined {
    return this.accounts.find(
      (account) => account.accountId === normalized || account.email === normalized || account.label === normalized,
    );
  }

  private async saveAccounts(): Promise<void> {
    await mkdir(dirname(this.options.accountsPath), { recursive: true });
    await writeFile(this.options.accountsPath, `${JSON.stringify({ accounts: this.accounts }, null, 2)}\n`, "utf8");
  }
}

async function readGoogleWorkspaceOAuthClientConfig(sourcePath: string): Promise<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid Google Workspace OAuth client JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!hasGoogleWorkspaceOAuthClientShape(parsed)) {
    throw new Error("Selected file is not a Google OAuth client JSON for a Desktop app.");
  }
  return parsed;
}

function hasGoogleWorkspaceOAuthClientShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const client = isRecord(value.installed) ? value.installed : isRecord(value.web) ? value.web : value;
  return (
    isRecord(client) &&
    typeof client.client_id === "string" &&
    client.client_id.trim().length > 0 &&
    typeof client.client_secret === "string" &&
    client.client_secret.trim().length > 0 &&
    typeof client.auth_uri === "string" &&
    typeof client.token_uri === "string"
  );
}

function googleWorkspaceSetupNeedsManualOAuthClient(output: string): boolean {
  return /OAuth client creation requires manual setup|Create an OAuth client ID|GOOGLE_WORKSPACE_CLI_CLIENT_ID|client_secret_\*?\\.json|client_secret\.json/i.test(output);
}

function setupArgs(command: GoogleWorkspaceSetupCommand): string[] {
  if (command === "setup") return ["auth", "setup"];
  return ["auth", "login", "--scopes", GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES.join(",")];
}

function extractAuthUrl(value: string): string | undefined {
  return extractUrls(value).find((url) => /accounts\.google\.com|oauth|auth/i.test(url));
}

function extractOAuthClientConfigUrl(value: string): string | undefined {
  const urls = extractUrls(value);
  return (
    urls.find((url) => /console\.cloud\.google\.com\/apis\/credentials\?/.test(url)) ??
    urls.find((url) => /console\.cloud\.google\.com\/apis\/credentials\/consent\?/.test(url)) ??
    urls.find((url) => /console\.cloud\.google\.com\/apis\/credentials/.test(url))
  );
}

function extractUrls(value: string): string[] {
  return (
    value
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .match(/https?:\/\/[^\s"'<>]+/g)
      ?.map((url) => url.replace(/[\\)\].,;]+$/g, ""))
      .filter((url) => url.length > 0) ?? []
  );
}

function normalizeAccountHandle(value: string | undefined): string {
  return value?.trim() || DEFAULT_ACCOUNT_HANDLE;
}

function hasOAuthClientConfig(configDir: string, env: NodeJS.ProcessEnv): boolean {
  if (existsSync(join(configDir, "client_secret.json"))) return true;
  return Boolean(
    (envString(env.GOOGLE_WORKSPACE_CLI_CLIENT_ID) && envString(env.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET)) ||
      (envString(env.AMBIENT_GOOGLE_CLIENT_ID) && envString(env.AMBIENT_GOOGLE_CLIENT_SECRET)) ||
      (envString(env.AMBIENT_AGENT_GOOGLE_CLIENT_ID) && envString(env.AMBIENT_AGENT_GOOGLE_CLIENT_SECRET)),
  );
}

function envString(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeAccountRecord(record: GoogleWorkspaceCliAccountRecord): GoogleWorkspaceCliAccountRecord {
  return {
    ...record,
    status: record.status ?? "not_configured",
    grantedScopes: Array.isArray(record.grantedScopes) ? record.grantedScopes : [],
  };
}

function stripConfigDir(record: GoogleWorkspaceCliAccountRecord): AmbientPluginAuthAccountSummary {
  const { configDir: _configDir, ...summary } = record;
  return summary;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
