import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { redactString } from "./googleWorkspaceDiagnosticsFacade";
import { GoogleWorkspaceCliAdapter, type GoogleWorkspaceCliAdapterOptions } from "./googleWorkspaceCliAdapter";

export type GoogleWorkspaceLiveDogfoodProbe = "gmail" | "calendar" | "drive" | "workspace";

export interface GoogleWorkspaceLiveDogfoodProbeAttempt {
  source: string;
  accountHint?: string;
  status: "skipped" | "failed";
  reason: string;
}

export interface GoogleWorkspaceLiveDogfoodRuntime {
  binaryPath: string;
  configRoot: string;
  accountHint: string;
  source: string;
  adapter: GoogleWorkspaceCliAdapter;
  attempts: GoogleWorkspaceLiveDogfoodProbeAttempt[];
}

export interface GoogleWorkspaceLiveDogfoodRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  adapterOptions?: Omit<GoogleWorkspaceCliAdapterOptions, "binaryPath" | "configRoot">;
}

interface GoogleWorkspaceRuntimeCandidate {
  source: string;
  binaryPath: string;
  configRoot: string;
}

const GWS_VERSION = "v0.22.3";

export async function resolveGoogleWorkspaceLiveDogfoodRuntime(
  probe: GoogleWorkspaceLiveDogfoodProbe,
  options: GoogleWorkspaceLiveDogfoodRuntimeOptions = {},
): Promise<GoogleWorkspaceLiveDogfoodRuntime> {
  const env = options.env ?? process.env;
  const candidates = await googleWorkspaceRuntimeCandidates({ env, homeDir: options.homeDir ?? homedir() });
  const attempts: GoogleWorkspaceLiveDogfoodProbeAttempt[] = [];
  if (candidates.length === 0) {
    throw new Error("No Google Workspace CLI runtime candidates found. Set AMBIENT_GWS_CLI_PATH and AMBIENT_GWS_CONFIG_ROOT, install Ambient's managed gws binary, or restore a validated hardening snapshot.");
  }

  for (const candidate of candidates) {
    const accounts = await googleWorkspaceAccountHints(candidate.configRoot, env);
    if (accounts.length === 0) {
      attempts.push({ source: candidate.source, status: "skipped", reason: "no account handles found" });
      continue;
    }
    for (const accountHint of accounts) {
      const adapter = new GoogleWorkspaceCliAdapter({ ...options.adapterOptions, binaryPath: candidate.binaryPath, configRoot: candidate.configRoot });
      try {
        await probeGoogleWorkspaceAccount(adapter, accountHint, probe);
        return {
          binaryPath: candidate.binaryPath,
          configRoot: candidate.configRoot,
          accountHint,
          source: candidate.source,
          adapter,
          attempts,
        };
      } catch (error) {
        attempts.push({
          source: candidate.source,
          accountHint,
          status: "failed",
          reason: classifyGoogleWorkspaceProbeError(error),
        });
      }
    }
  }

  const attempted = attempts.map((attempt) => {
    const account = attempt.accountHint ? ` account=${attempt.accountHint}` : "";
    return `${attempt.source}${account}: ${attempt.reason}`;
  });
  throw new Error(`No usable Google Workspace CLI ${probe} account found. Tried ${attempted.join("; ") || "no account handles"}.`);
}

async function googleWorkspaceRuntimeCandidates(input: { env: NodeJS.ProcessEnv; homeDir: string }): Promise<GoogleWorkspaceRuntimeCandidate[]> {
  const configuredBinary = stringField(input.env.AMBIENT_GWS_CLI_PATH) ?? stringField(input.env.GOOGLE_WORKSPACE_CLI_PATH);
  const configuredRoot = stringField(input.env.AMBIENT_GWS_CONFIG_ROOT);
  const managedBinaryPath = join(
    input.homeDir,
    "Library",
    "Application Support",
    "Ambient Desktop",
    "tools",
    "google-workspace-cli",
    GWS_VERSION,
    `${process.platform}-${process.arch}`,
    "gws",
  );
  const managedConfigRoot = join(input.homeDir, "Library", "Application Support", "Ambient Desktop", "google-workspace-cli");
  if (configuredBinary || configuredRoot) {
    const binaryPath = configuredBinary ?? managedBinaryPath;
    const configRoot = configuredRoot ?? managedConfigRoot;
    return existsSync(binaryPath) && existsSync(configRoot) ? [{ source: "env", binaryPath: resolve(binaryPath), configRoot: resolve(configRoot) }] : [];
  }

  const candidates: GoogleWorkspaceRuntimeCandidate[] = [];
  if (existsSync(managedBinaryPath) && existsSync(managedConfigRoot)) {
    candidates.push({ source: "ambient-desktop", binaryPath: managedBinaryPath, configRoot: managedConfigRoot });
  }
  candidates.push(...(await googleWorkspaceHardeningSnapshotCandidates(input.homeDir)));
  return dedupeRuntimeCandidates(candidates);
}

async function googleWorkspaceHardeningSnapshotCandidates(homeDir: string): Promise<GoogleWorkspaceRuntimeCandidate[]> {
  const snapshotRoot = join(homeDir, ".ambient-example", "snapshots", "google-workspace-cli");
  const entries = await readdir(snapshotRoot, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const root = join(snapshotRoot, entry.name);
        const manifest = await readJsonObject(join(root, "meta", "manifest.json"));
        const gws = objectField(manifest?.gws);
        const binaryRelativePath = stringField(gws?.binaryRelativePath);
        const binaryPath = binaryRelativePath ? join(root, binaryRelativePath) : undefined;
        const configRoot = join(root, "userData", "google-workspace-cli");
        if (!binaryPath || !existsSync(binaryPath) || !existsSync(configRoot)) return undefined;
        const snapshotId = stringField(manifest?.snapshotId) ?? entry.name;
        const createdAt = stringField(manifest?.createdAt);
        return {
          source: `hardening-snapshot:${snapshotId}`,
          binaryPath,
          configRoot,
          createdAt,
        };
      }),
  );
  const present = candidates.filter((candidate): candidate is NonNullable<(typeof candidates)[number]> => Boolean(candidate));
  return present
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
    .map(({ createdAt: _createdAt, ...candidate }) => candidate);
}

async function googleWorkspaceAccountHints(configRoot: string, env: NodeJS.ProcessEnv): Promise<string[]> {
  const configured = stringField(env.AMBIENT_GOOGLE_DOGFOOD_ACCOUNT);
  if (configured) return [configured];
  const accounts = new Set<string>();
  const accountsJson = await readJsonObject(join(configRoot, "accounts.json"));
  const records = Array.isArray(accountsJson?.accounts) ? accountsJson.accounts : [];
  for (const record of records) {
    const account = objectField(record);
    const accountId = stringField(account?.accountId);
    if (accountId) accounts.add(accountId);
    const configDir = stringField(account?.configDir);
    if (configDir) accounts.add(basename(configDir));
  }

  const entries = await readdir(configRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "cache") continue;
    const accountRoot = join(configRoot, entry.name);
    if (["client_secret.json", "credentials.enc", "token_cache.json"].some((fileName) => existsSync(join(accountRoot, fileName)))) {
      accounts.add(entry.name);
    }
  }
  return [...accounts].sort((left, right) => {
    if (left === "default") return -1;
    if (right === "default") return 1;
    return left.localeCompare(right);
  });
}

async function probeGoogleWorkspaceAccount(
  adapter: GoogleWorkspaceCliAdapter,
  accountHint: string,
  probe: GoogleWorkspaceLiveDogfoodProbe,
): Promise<void> {
  switch (probe) {
    case "gmail":
      await adapter.invoke({ method: "gmail.listLabels", accountHint, input: {}, options: { timeoutMs: 20_000 } });
      return;
    case "calendar":
      await adapter.invoke({ method: "calendar.listCalendars", accountHint, input: { maxResults: 5 }, options: { timeoutMs: 20_000 } });
      return;
    case "drive":
      await adapter.invoke({
        method: "drive.search",
        accountHint,
        input: { query: "trashed = false", pageSize: 1, fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)" },
        options: { timeoutMs: 20_000 },
      });
      return;
    case "workspace":
      await adapter.invoke({
        method: "workspace.call",
        accountHint,
        input: { methodId: "calendar.colors.get", params: {} },
        options: { timeoutMs: 20_000 },
      });
      return;
  }
}

function classifyGoogleWorkspaceProbeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = redactString(raw.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"));
  const lower = message.toLowerCase();
  if (lower.includes("invalid_grant")) return "invalid_grant";
  if (lower.includes("invalid_client")) return "invalid_client";
  if (lower.includes("no credentials") || lower.includes("access denied")) return "no_credentials";
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  return message.split(/\r?\n/)[0]?.slice(0, 240) || "unknown";
}

function dedupeRuntimeCandidates(candidates: GoogleWorkspaceRuntimeCandidate[]): GoogleWorkspaceRuntimeCandidate[] {
  const seen = new Set<string>();
  const result: GoogleWorkspaceRuntimeCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${resolve(candidate.binaryPath)}\n${resolve(candidate.configRoot)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return objectField(parsed);
  } catch {
    return undefined;
  }
}

function objectField(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
