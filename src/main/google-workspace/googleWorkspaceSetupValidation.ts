import type {
  AmbientPluginAuthAccountSummary,
  GoogleWorkspaceAccountIdentity,
  GoogleWorkspaceValidationCheck,
  GoogleWorkspaceValidationResult,
} from "../../shared/pluginTypes";
import type { GoogleWorkspaceCliAdapter } from "./googleWorkspaceCliAdapter";

export interface GoogleWorkspaceCliAccountRecord extends AmbientPluginAuthAccountSummary {
  configDir: string;
}

export interface GoogleWorkspaceSetupValidationInput {
  adapter: GoogleWorkspaceCliAdapter;
  accountHint: string;
  configDir: string;
  accounts: readonly GoogleWorkspaceCliAccountRecord[];
  now: () => Date;
}

export interface GoogleWorkspaceSetupValidationOutput {
  account: GoogleWorkspaceCliAccountRecord;
  result: GoogleWorkspaceValidationResult;
}

export async function validateGoogleWorkspaceSetupAccount(
  input: GoogleWorkspaceSetupValidationInput,
): Promise<GoogleWorkspaceSetupValidationOutput> {
  const checks: GoogleWorkspaceValidationCheck[] = [];
  const identity = await discoverIdentity(input.adapter, input.accountHint);
  if (identity) checks.push({ service: "identity", label: "Account identity", ok: true });
  checks.push(await runValidationCheck("gmail", "Gmail labels", () =>
    input.adapter.invoke({ method: "gmail.listLabels", accountHint: input.accountHint, options: { timeoutMs: 20_000 } }),
  ));
  checks.push(await runValidationCheck("calendar", "Calendar list", () =>
    input.adapter.invoke({
      method: "calendar.listCalendars",
      accountHint: input.accountHint,
      input: { max: 1 },
      options: { timeoutMs: 20_000 },
    }),
  ));
  checks.push(await runValidationCheck("drive", "Drive search", () =>
    input.adapter.invoke({
      method: "drive.search",
      accountHint: input.accountHint,
      input: { max: 1 },
      options: { timeoutMs: 20_000 },
    }),
  ));
  const duplicate = identity?.email
    ? input.accounts.find((account) => account.email === identity.email && account.accountId !== input.accountHint)
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
  const now = input.now().toISOString();
  const previous = input.accounts.find((account) => account.accountId === input.accountHint);
  const email = identity?.email ?? previous?.email;
  const account: GoogleWorkspaceCliAccountRecord = {
    id: `gws:${input.accountHint}`,
    accountId: input.accountHint,
    label: email ?? (input.accountHint === "default" ? "Google Workspace CLI default account" : input.accountHint),
    email,
    status: ok ? "available" : "error",
    grantedScopes: ["gws:gmail", "gws:calendar", "gws:drive"],
    connectedAt: previous?.connectedAt ?? now,
    updatedAt: now,
    lastValidatedAt: now,
    validationError: ok ? undefined : checks.find((check) => !check.ok)?.message,
    configDir: input.configDir,
  };
  return { account, result: { account: stripConfigDir(account), checks, identity } };
}

async function runValidationCheck(
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

async function discoverIdentity(
  adapter: GoogleWorkspaceCliAdapter,
  accountHint: string,
): Promise<GoogleWorkspaceAccountIdentity | undefined> {
  const fromGmail = await tryGmailProfileIdentity(adapter, accountHint);
  if (fromGmail) return fromGmail;
  return tryDriveAboutIdentity(adapter, accountHint);
}

async function tryGmailProfileIdentity(
  adapter: GoogleWorkspaceCliAdapter,
  accountHint: string,
): Promise<GoogleWorkspaceAccountIdentity | undefined> {
  try {
    const profile = await adapter.invoke<{ emailAddress?: unknown }>({
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

async function tryDriveAboutIdentity(
  adapter: GoogleWorkspaceCliAdapter,
  accountHint: string,
): Promise<GoogleWorkspaceAccountIdentity | undefined> {
  try {
    const about = await adapter.invoke<{ user?: { emailAddress?: unknown; displayName?: unknown } }>({
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripConfigDir(record: GoogleWorkspaceCliAccountRecord): AmbientPluginAuthAccountSummary {
  return {
    id: record.id,
    accountId: record.accountId,
    label: record.label,
    email: record.email,
    status: record.status,
    grantedScopes: record.grantedScopes,
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
    lastValidatedAt: record.lastValidatedAt,
    validationError: record.validationError,
  };
}
