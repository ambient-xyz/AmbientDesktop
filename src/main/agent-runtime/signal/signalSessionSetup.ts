import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const PROVIDER_ID = "signal-cli";
const SESSION_METADATA_FILE = "bridge-session.json";

export interface SignalSessionSetupInput {
  providerId?: string;
  profileId: string;
  signalCliConfigDir?: string;
  accountIdentifierPresent?: boolean;
  linkedDevicePresent?: boolean;
  registrationMetadataPresent?: boolean;
}

export interface SignalSessionSetupOptions {
  workspacePath?: string;
  stateRoot?: string;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  homeDir?: string;
}

export interface SignalSessionSetupPreview {
  providerId: "signal-cli";
  profileId: string;
  signalCliConfigDir: string;
  signalCliConfigDirPresent: boolean;
  stateRoot: string;
  metadataPath: string;
  existingMetadataReadable: boolean;
  existingBridgeSessionReadable: boolean;
  accountIdentifierPresent: boolean;
  linkedDevicePresent: boolean;
  registrationMetadataPresent: boolean;
  bridgeSessionReadable: false;
  approvalRequired: true;
  canApplyNow: boolean;
  missingInputs: string[];
  wouldWriteMetadata: boolean;
  wouldRunProviderCli: false;
  wouldInspectSignalDesktop: false;
  wouldStartBridge: false;
  wouldReadProviderMessages: false;
  wouldReadProviderHistory: false;
  wouldSendProviderMessages: false;
  policyNotes: string[];
  nextSteps: string[];
}

export interface SignalSessionSetupResult extends SignalSessionSetupPreview {
  applyStatus: "applied" | "blocked";
  applied: boolean;
  checkedAt: string;
  blockedReason?: string;
}

interface SignalBridgeSessionMetadata {
  profileId?: unknown;
  signalCliConfigDir?: unknown;
  accountIdentifierPresent?: unknown;
  linkedDevicePresent?: unknown;
  registrationMetadataPresent?: unknown;
  bridgeSessionReadable?: unknown;
}

export async function previewSignalSessionSetup(
  input: SignalSessionSetupInput,
  options: SignalSessionSetupOptions = {},
): Promise<SignalSessionSetupPreview> {
  const normalized = normalizeSignalSessionSetupInput(input);
  const env = options.env ?? process.env;
  const homePath = options.homeDir ?? env.HOME ?? homedir();
  const workspacePath = options.workspacePath ?? process.cwd();
  const stateRoot = path.resolve(options.stateRoot ?? stateRootFromEnv(env, workspacePath));
  const signalCliConfigDir = path.resolve(expandHome(
    normalized.signalCliConfigDir
      ?? env.AMBIENT_SIGNAL_CLI_CONFIG_DIR
      ?? env.SIGNAL_CLI_CONFIG_DIR
      ?? path.join(homePath, ".local", "share", "signal-cli"),
    homePath,
  ));
  const metadataPath = path.join(stateRoot, normalized.profileId, SESSION_METADATA_FILE);
  const existingMetadata = await readExistingMetadata(metadataPath);
  const signalCliConfigDirPresent = await directoryExists(signalCliConfigDir);
  const missingInputs = [
    signalCliConfigDirPresent ? undefined : "signal-cli config directory",
  ].filter((item): item is string => Boolean(item));
  const accountIdentifierPresent = normalized.accountIdentifierPresent === true
    || existingMetadata.metadata?.accountIdentifierPresent === true;
  const linkedDevicePresent = normalized.linkedDevicePresent === true
    || existingMetadata.metadata?.linkedDevicePresent === true;
  const registrationMetadataPresent = normalized.registrationMetadataPresent === true
    || existingMetadata.metadata?.registrationMetadataPresent === true;

  return {
    providerId: PROVIDER_ID,
    profileId: normalized.profileId,
    signalCliConfigDir,
    signalCliConfigDirPresent,
    stateRoot,
    metadataPath,
    existingMetadataReadable: existingMetadata.readable,
    existingBridgeSessionReadable: existingMetadata.metadata?.bridgeSessionReadable === true,
    accountIdentifierPresent,
    linkedDevicePresent,
    registrationMetadataPresent,
    bridgeSessionReadable: false,
    approvalRequired: true,
    canApplyNow: missingInputs.length === 0,
    missingInputs,
    wouldWriteMetadata: true,
    wouldRunProviderCli: false,
    wouldInspectSignalDesktop: false,
    wouldStartBridge: false,
    wouldReadProviderMessages: false,
    wouldReadProviderHistory: false,
    wouldSendProviderMessages: false,
    policyNotes: [
      "Signal session setup records Ambient-owned metadata only; it does not install Signal, link a device, or validate account identity.",
      "Signal Desktop being installed is not a supported runtime signal for Ambient messaging gateway operation.",
      "This path never runs signal-cli, inspects Signal Desktop, reads Signal messages/history/contacts/groups/attachments, starts bridges, sends replies, or creates bindings.",
      "The recorded metadata is safe readiness context for a future reviewed local bridge adapter; Signal purpose support and lifecycle remain disabled in this build.",
      "Do not paste phone numbers, Signal service ids, identity keys, registration ids, session keys, device names, contact names, or message text into this setup metadata.",
    ],
    nextSteps: nextStepsFor(missingInputs),
  };
}

export async function applySignalSessionSetup(
  input: SignalSessionSetupInput,
  options: SignalSessionSetupOptions = {},
): Promise<SignalSessionSetupResult> {
  const preview = await previewSignalSessionSetup(input, options);
  const now = options.now ?? (() => new Date());
  if (preview.missingInputs.length) {
    return blocked(preview, now, `Missing required setup input: ${preview.missingInputs.join(", ")}.`);
  }

  const checkedAt = now().toISOString();
  const metadata = {
    profileId: preview.profileId,
    signalCliConfigDir: preview.signalCliConfigDir,
    accountIdentifierPresent: preview.accountIdentifierPresent,
    linkedDevicePresent: preview.linkedDevicePresent,
    registrationMetadataPresent: preview.registrationMetadataPresent,
    bridgeSessionReadable: false,
    updatedAt: checkedAt,
  };
  try {
    await mkdir(path.dirname(preview.metadataPath), { recursive: true });
    await writeFile(preview.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } catch (error) {
    return blocked(preview, now, errorMessage(error));
  }

  return {
    ...preview,
    applyStatus: "applied",
    applied: true,
    checkedAt,
  };
}

export function signalSessionSetupInput(params: unknown): SignalSessionSetupInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId);
  if (providerId && providerId !== PROVIDER_ID) throw new Error(`providerId must be ${PROVIDER_ID} when supplied.`);
  const profileId = optionalString(raw?.profileId);
  if (!profileId) throw new Error("profileId is required.");
  return normalizeSignalSessionSetupInput({
    providerId,
    profileId,
    signalCliConfigDir: optionalString(raw?.signalCliConfigDir),
    accountIdentifierPresent: raw?.accountIdentifierPresent === true,
    linkedDevicePresent: raw?.linkedDevicePresent === true,
    registrationMetadataPresent: raw?.registrationMetadataPresent === true,
  });
}

export function signalSessionSetupPreviewText(preview: SignalSessionSetupPreview): string {
  return [
    "Signal session setup preview",
    `Provider: ${preview.providerId}`,
    `Profile: ${preview.profileId}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `signal-cli config dir present: ${preview.signalCliConfigDirPresent ? "yes" : "no"}`,
    `State root: ${preview.stateRoot}`,
    `Metadata path: ${preview.metadataPath}`,
    `Existing metadata readable: ${preview.existingMetadataReadable ? "yes" : "no"}`,
    `Existing bridge session readable: ${preview.existingBridgeSessionReadable ? "yes" : "no"}`,
    `Account identifier marker present: ${preview.accountIdentifierPresent ? "yes" : "no"}`,
    `Linked device marker present: ${preview.linkedDevicePresent ? "yes" : "no"}`,
    `Registration metadata marker present: ${preview.registrationMetadataPresent ? "yes" : "no"}`,
    `Bridge session readable after apply: ${preview.bridgeSessionReadable ? "yes" : "no"}`,
    preview.missingInputs.length ? `Missing inputs: ${preview.missingInputs.join(", ")}` : "Missing inputs: none",
    "",
    "Safety:",
    "- Runs signal-cli: no",
    "- Inspects Signal Desktop: no",
    "- Starts bridge: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Sends Signal messages: no",
    "- Creates bindings: no",
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].join("\n");
}

export function signalSessionSetupResultText(result: SignalSessionSetupResult): string {
  return [
    "Signal session setup apply",
    `Provider: ${result.providerId}`,
    `Profile: ${result.profileId}`,
    `Apply status: ${result.applyStatus}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    result.blockedReason ? `Blocked reason: ${result.blockedReason}` : undefined,
    `Metadata path: ${result.metadataPath}`,
    `Bridge session readable: ${result.bridgeSessionReadable ? "yes" : "no"}`,
    "",
    "Safety:",
    "- Runs signal-cli: no",
    "- Inspects Signal Desktop: no",
    "- Starts bridge: no",
    "- Reads Signal messages: no",
    "- Reads Signal history: no",
    "- Sends Signal messages: no",
    "- Creates bindings: no",
    "- Sensitive Signal identifiers, keys, contacts, and message text are not written or returned.",
    "",
    "Next steps:",
    ...result.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

function normalizeSignalSessionSetupInput(input: SignalSessionSetupInput): Required<Pick<SignalSessionSetupInput, "profileId">> & Omit<SignalSessionSetupInput, "profileId"> {
  const profileId = normalizeProfileId(input.profileId);
  return {
    ...input,
    profileId,
  };
}

function normalizeProfileId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("profileId is required.");
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(trimmed)) {
    throw new Error("profileId must be 1-64 characters using letters, numbers, dot, underscore, or hyphen.");
  }
  if (trimmed === "." || trimmed === "..") throw new Error("profileId cannot be . or ...");
  return trimmed;
}

function nextStepsFor(missingInputs: string[]): string[] {
  if (missingInputs.length) {
    return [
      "Install or configure a headless signal-cli-style local runtime before recording Ambient Signal bridge metadata.",
      "If signal-cli is installed in a nonstandard location, pass signalCliConfigDir only after confirming it is not Signal Desktop storage.",
      "Do not scrape Signal Desktop or run provider CLI commands from Pi to discover this path.",
    ];
  }
  return [
    "After approval, apply will write Ambient-owned Signal setup metadata only.",
    "Call ambient_messaging_gateway_status after apply to refresh Signal readiness.",
    "Signal conversation directory, bindings, lifecycle, inbound ingestion, and replies remain blocked until a reviewed local bridge adapter exists.",
  ];
}

function stateRootFromEnv(env: Record<string, string | undefined>, workspacePath: string): string {
  return env.AMBIENT_AGENT_SIGNAL_STATE_ROOT?.trim()
    || path.resolve(workspacePath, ".ambient-agent-state", "signal");
}

async function readExistingMetadata(metadataPath: string): Promise<{
  readable: boolean;
  metadata?: SignalBridgeSessionMetadata;
}> {
  try {
    const raw = await readFile(metadataPath, "utf8");
    const metadata = JSON.parse(raw) as SignalBridgeSessionMetadata;
    return { readable: true, metadata };
  } catch {
    return { readable: false };
  }
}

async function directoryExists(candidatePath: string): Promise<boolean> {
  try {
    return (await stat(candidatePath)).isDirectory();
  } catch {
    return false;
  }
}

function expandHome(candidatePath: string, homePath: string): string {
  if (candidatePath === "~") return homePath;
  if (candidatePath.startsWith("~/")) return path.join(homePath, candidatePath.slice(2));
  return candidatePath;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function blocked(
  preview: SignalSessionSetupPreview,
  now: () => Date,
  blockedReason: string,
): SignalSessionSetupResult {
  return {
    ...preview,
    applyStatus: "blocked",
    applied: false,
    checkedAt: now().toISOString(),
    blockedReason,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
