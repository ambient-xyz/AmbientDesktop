import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { redactString } from "./diagnostics";
import { buildSafeProcessEnv } from "./safeProcessEnv";
import type { GoogleSidecarRequest } from "./googleSidecarSupervisor";

export type GoogleWorkspaceCliAdapterKind = "gws";
export type GoogleWorkspaceCliState = "missing" | "available" | "running";

export interface GoogleWorkspaceCliStatus {
  adapter: GoogleWorkspaceCliAdapterKind;
  state: GoogleWorkspaceCliState;
  binaryPath: string;
  configDir: string;
  pending: number;
  setupCommands: string[];
  unavailableReason?: string;
}

export interface GoogleWorkspaceCliDiagnosticEntry {
  level: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface GoogleWorkspaceCliCommandInvocation {
  binaryPath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  stdin?: string;
  cwd?: string;
  timeoutMs: number;
}

export interface GoogleWorkspaceCliCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GoogleWorkspaceCliAdapterOptions {
  binaryPath?: string;
  managedBinaryPath?: string | (() => string | undefined);
  configRoot?: string;
  appUserDataPath?: string;
  env?: NodeJS.ProcessEnv;
  spawnProcess?: typeof spawn;
  fileExists?: (path: string) => boolean;
  runner?: (invocation: GoogleWorkspaceCliCommandInvocation) => Promise<GoogleWorkspaceCliCommandResult>;
  onDiagnostic?: (entry: GoogleWorkspaceCliDiagnosticEntry) => void;
}

interface GwsCommandSpec {
  args: string[];
  stdin?: string;
  isolatedDownloadCwd?: boolean;
  downloadMimeType?: string;
}

interface GwsUploadSpec {
  path: string;
  mimeType?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ACCOUNT_HANDLE = "default";
export const GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export class GoogleWorkspaceCliAdapter {
  private readonly env: NodeJS.ProcessEnv;
  private readonly spawnProcess: typeof spawn;
  private readonly fileExists: (path: string) => boolean;
  private readonly runner: (invocation: GoogleWorkspaceCliCommandInvocation) => Promise<GoogleWorkspaceCliCommandResult>;
  private pending = 0;

  constructor(private readonly options: GoogleWorkspaceCliAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fileExists = options.fileExists ?? existsSync;
    this.runner = options.runner ?? ((invocation) => runProcess(this.spawnProcess, invocation));
  }

  binaryPath(): string {
    const configured = this.options.binaryPath ?? this.env.AMBIENT_GWS_CLI_PATH ?? this.env.GOOGLE_WORKSPACE_CLI_PATH;
    if (configured?.trim()) return resolve(configured.trim());
    const managed = typeof this.options.managedBinaryPath === "function" ? this.options.managedBinaryPath() : this.options.managedBinaryPath;
    if (managed?.trim() && this.fileExists(resolve(managed.trim()))) return resolve(managed.trim());
    return findExecutableOnPath("gws", this.env.PATH ?? "", this.fileExists) ?? "";
  }

  configRoot(): string {
    const configured = this.options.configRoot ?? this.env.AMBIENT_GWS_CONFIG_ROOT;
    if (configured?.trim()) return resolve(configured.trim());
    const base = this.options.appUserDataPath?.trim() || this.env.AMBIENT_E2E_USER_DATA?.trim() || process.cwd();
    return join(base, "google-workspace-cli");
  }

  configDir(accountHint?: string): string {
    return join(this.configRoot(), safeAccountHandle(accountHint));
  }

  status(accountHint?: string): GoogleWorkspaceCliStatus {
    const binaryPath = this.binaryPath();
    const configDir = this.configDir(accountHint);
    const setupCommands = googleWorkspaceCliSetupCommands(configDir);
    if (!binaryPath || !this.fileExists(binaryPath)) {
      return {
        adapter: "gws",
        state: "missing",
        binaryPath,
        configDir,
        pending: this.pending,
        setupCommands,
        unavailableReason: "Install the Google Workspace CLI (`gws`) before enabling first-party Google connectors.",
      };
    }
    return {
      adapter: "gws",
      state: this.pending > 0 ? "running" : "available",
      binaryPath,
      configDir,
      pending: this.pending,
      setupCommands,
    };
  }

  async invoke<T = unknown>(request: GoogleSidecarRequest): Promise<T> {
    const binaryPath = this.binaryPath();
    if (!binaryPath || !this.fileExists(binaryPath)) throw new Error("Google Workspace CLI (`gws`) is not installed or not on PATH.");
    const command = gwsCommandForRequest(request);
    const timeoutMs = Math.max(1_000, request.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const env = googleWorkspaceCliEnv({
      base: this.env,
      configDir: this.configDir(request.accountHint),
      accessToken: request.accessToken,
    });
    this.pending += 1;
    this.emitDiagnostic("info", "Running Google Workspace CLI command.", {
      method: request.method,
      args: command.args.map(redactString),
      configDir: env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR,
    });
    let isolatedDownloadCwd: string | undefined;
    try {
      isolatedDownloadCwd = command.isolatedDownloadCwd ? await mkdtemp(join(tmpdir(), "ambient-gws-export-")) : undefined;
      const result = await this.runner({
        binaryPath,
        args: command.args,
        env,
        stdin: command.stdin,
        cwd: isolatedDownloadCwd ?? request.options?.cwd,
        timeoutMs,
      });
      if (result.exitCode !== 0) {
        throw new Error(`gws exited with ${result.exitCode}: ${redactString(result.stderr || result.stdout || "no output")}`);
      }
      const parsed = parseGoogleWorkspaceCliOutput(result.stdout);
      const output = isolatedDownloadCwd
        ? await readIsolatedDownloadOutput(parsed, { cwd: isolatedDownloadCwd, mimeType: command.downloadMimeType })
        : parsed;
      return output as T;
    } finally {
      if (isolatedDownloadCwd) await rm(isolatedDownloadCwd, { recursive: true, force: true });
      this.pending = Math.max(0, this.pending - 1);
    }
  }

  private emitDiagnostic(level: GoogleWorkspaceCliDiagnosticEntry["level"], message: string, details?: Record<string, unknown>): void {
    this.options.onDiagnostic?.({ level, message, details });
  }
}

export function googleWorkspaceCliSetupCommands(configDir: string): string[] {
  const scopes = GOOGLE_WORKSPACE_CLI_OAUTH_SCOPES.join(",");
  return [
    `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=${shellQuote(configDir)} gws auth setup`,
    `GOOGLE_WORKSPACE_CLI_CONFIG_DIR=${shellQuote(configDir)} gws auth login --scopes ${shellQuote(scopes)}`,
  ];
}

export function gwsCommandForRequest(request: GoogleSidecarRequest): GwsCommandSpec {
  const input = objectInput(request.input);
  const dryRun = request.options?.dryRun === true;
  switch (request.method) {
    case "workspace.schema":
      return { args: ["schema", requiredMethodId(input.methodId, "methodId")] };
    case "workspace.call":
      return workspaceCallCommand(input, { dryRun });
    case "gmail.search":
      return commandWithParams(["gmail", "users", "messages", "list"], {
        userId: "me",
        q: optionalString(input.query),
        maxResults: optionalNumber(input.maxResults ?? input.max),
        pageToken: optionalString(input.pageToken),
      });
    case "gmail.readThread":
      return commandWithParams(["gmail", "users", "threads", "get"], {
        userId: "me",
        id: requiredString(input.threadId ?? input.id, "threadId"),
        format: optionalString(input.format) ?? "full",
      });
    case "gmail.listLabels":
      return commandWithParams(["gmail", "users", "labels", "list"], { userId: "me" });
    case "gmail.createDraft":
      return commandWithParamsAndBody(
        ["gmail", "users", "drafts", "create"],
        { userId: "me" },
        { message: { raw: gmailRawMessage(input) } },
        { dryRun },
      );
    case "gmail.updateDraft":
      return commandWithParamsAndBody(
        ["gmail", "users", "drafts", "update"],
        {
          userId: "me",
          id: requiredString(input.draftId ?? input.id, "draftId"),
        },
        { message: { raw: gmailRawMessage(input) } },
        { dryRun },
      );
    case "gmail.deleteDraft":
      return commandWithParams(
        ["gmail", "users", "drafts", "delete"],
        {
          userId: "me",
          id: requiredString(input.draftId ?? input.id, "draftId"),
        },
        { dryRun },
      );
    case "gmail.getProfile":
      return commandWithParams(["gmail", "users", "getProfile"], { userId: "me" });
    case "calendar.listCalendars":
      return commandWithParams(["calendar", "calendarList", "list"], {
        maxResults: optionalNumber(input.maxResults ?? input.max),
        pageToken: optionalString(input.pageToken),
      });
    case "calendar.listEvents":
      return commandWithParams(["calendar", "events", "list"], {
        calendarId: optionalString(input.calendarId) ?? "primary",
        timeMin: optionalString(input.timeMin ?? input.from),
        timeMax: optionalString(input.timeMax ?? input.to),
        timeZone: optionalString(input.timeZone),
        maxResults: optionalNumber(input.maxResults ?? input.max),
        singleEvents: input.singleEvents ?? true,
        orderBy: optionalString(input.orderBy) ?? "startTime",
        pageToken: optionalString(input.pageToken),
        fields: optionalString(input.fields),
      });
    case "calendar.readEvent":
      return commandWithParams(["calendar", "events", "get"], {
        calendarId: optionalString(input.calendarId) ?? "primary",
        eventId: requiredString(input.eventId ?? input.id, "eventId"),
        fields: optionalString(input.fields),
      });
    case "calendar.freeBusy":
      return commandWithBody(["calendar", "freebusy", "query"], {
        timeMin: requiredString(input.timeMin ?? input.from, "timeMin"),
        timeMax: requiredString(input.timeMax ?? input.to, "timeMax"),
        items: normalizeFreeBusyItems(input.items ?? input.calendarIds ?? ["primary"]),
      });
    case "drive.search":
      return commandWithParams(["drive", "files", "list"], {
        q: optionalString(input.query ?? input.q),
        pageSize: optionalNumber(input.pageSize ?? input.max),
        pageToken: optionalString(input.pageToken),
        fields: optionalString(input.fields) ?? "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size)",
        includeItemsFromAllDrives: input.includeItemsFromAllDrives ?? true,
        supportsAllDrives: input.supportsAllDrives ?? true,
      });
    case "drive.readFile":
      if (optionalString(input.exportMimeType ?? input.exportAs ?? input.mimeTypeOut)) {
        return commandWithParams(
          ["drive", "files", "export"],
          {
            fileId: requiredString(input.fileId ?? input.id, "fileId"),
            mimeType: optionalString(input.exportMimeType ?? input.exportAs ?? input.mimeTypeOut),
          },
          { isolatedDownloadCwd: true, downloadMimeType: optionalString(input.exportMimeType ?? input.exportAs ?? input.mimeTypeOut) },
        );
      }
      return commandWithParams(["drive", "files", "get"], {
        fileId: requiredString(input.fileId ?? input.id, "fileId"),
        fields: optionalString(input.fields) ?? "*",
        supportsAllDrives: input.supportsAllDrives ?? true,
      });
    case "drive.listSharedDrives":
      return commandWithParams(["drive", "drives", "list"], {
        pageSize: optionalNumber(input.pageSize ?? input.max),
        pageToken: optionalString(input.pageToken),
      });
    case "drive.about":
      return commandWithParams(["drive", "about", "get"], {
        fields: optionalString(input.fields) ?? "user(emailAddress,displayName,permissionId),storageQuota",
      });
    default:
      throw new Error(`Google Workspace CLI adapter does not yet support ${request.method}.`);
  }
}

function commandWithParams(
  command: string[],
  params: Record<string, unknown>,
  options: { dryRun?: boolean; isolatedDownloadCwd?: boolean; downloadMimeType?: string } = {},
): GwsCommandSpec {
  return {
    args: [...command, ...dryRunArgs(options), "--params", JSON.stringify(compactObject(params))],
    ...(options.isolatedDownloadCwd ? { isolatedDownloadCwd: true } : {}),
    ...(options.downloadMimeType ? { downloadMimeType: options.downloadMimeType } : {}),
  };
}

function commandWithBody(command: string[], body: Record<string, unknown>, options: { dryRun?: boolean } = {}): GwsCommandSpec {
  return {
    args: [...command, ...dryRunArgs(options), "--json", JSON.stringify(compactObject(body))],
  };
}

function commandWithParamsAndBody(
  command: string[],
  params: Record<string, unknown>,
  body: Record<string, unknown>,
  options: { dryRun?: boolean } = {},
): GwsCommandSpec {
  return {
    args: [...command, ...dryRunArgs(options), "--params", JSON.stringify(compactObject(params)), "--json", JSON.stringify(compactObject(body))],
  };
}

function dryRunArgs(options: { dryRun?: boolean }): string[] {
  return options.dryRun ? ["--dry-run"] : [];
}

function workspaceCallCommand(input: Record<string, unknown>, options: { dryRun?: boolean }): GwsCommandSpec {
  const methodId = requiredMethodId(input.methodId, "methodId");
  const params = input.params === undefined ? undefined : objectInput(input.params);
  const body = input.body;
  const upload = uploadInput(input.upload);
  const args = [...methodId.split("."), ...dryRunArgs(options)];
  if (params && Object.keys(params).length > 0) {
    args.push("--params", JSON.stringify(compactObject(params)));
  }
  if (body !== undefined) {
    args.push("--json", JSON.stringify(body));
  }
  if (upload) {
    args.push("--upload", upload.path);
    if (upload.mimeType) args.push("--upload-content-type", upload.mimeType);
  }
  return { args };
}

export function googleWorkspaceCliEnv(input: { base: NodeJS.ProcessEnv; configDir: string; accessToken?: string }): NodeJS.ProcessEnv {
  const clientId = envString(input.base.GOOGLE_WORKSPACE_CLI_CLIENT_ID) ?? envString(input.base.AMBIENT_GOOGLE_CLIENT_ID) ?? envString(input.base.AMBIENT_AGENT_GOOGLE_CLIENT_ID);
  const clientSecret =
    envString(input.base.GOOGLE_WORKSPACE_CLI_CLIENT_SECRET) ??
    envString(input.base.AMBIENT_GOOGLE_CLIENT_SECRET) ??
    envString(input.base.AMBIENT_AGENT_GOOGLE_CLIENT_SECRET);
  return {
    ...buildSafeProcessEnv(input.base),
    GOOGLE_WORKSPACE_CLI_CONFIG_DIR: input.configDir,
    NO_COLOR: "1",
    PATH: googleWorkspaceCliPath(input.base),
    ...(clientId ? { GOOGLE_WORKSPACE_CLI_CLIENT_ID: clientId } : {}),
    ...(clientSecret ? { GOOGLE_WORKSPACE_CLI_CLIENT_SECRET: clientSecret } : {}),
    ...(input.accessToken ? { GOOGLE_WORKSPACE_CLI_TOKEN: input.accessToken } : {}),
  };
}

function envString(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function googleWorkspaceCliPath(env: NodeJS.ProcessEnv): string {
  const entries = new Set((env.PATH ?? "").split(delimiter).map((entry) => entry.trim()).filter(Boolean));
  const home = envString(env.HOME);
  if (home) {
    entries.add(join(home, "gcloud", "google-cloud-sdk", "bin"));
    entries.add(join(home, "google-cloud-sdk", "bin"));
  }
  entries.add("/opt/homebrew/bin");
  entries.add("/usr/local/bin");
  entries.add("/usr/bin");
  entries.add("/bin");
  entries.add("/usr/sbin");
  entries.add("/sbin");
  return [...entries].join(delimiter);
}

async function runProcess(
  spawnProcess: typeof spawn,
  invocation: GoogleWorkspaceCliCommandInvocation,
): Promise<GoogleWorkspaceCliCommandResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnProcess(invocation.binaryPath, invocation.args, {
      env: invocation.env,
      cwd: invocation.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks = { stdout: "", stderr: "" };
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectRun(new Error(`gws command timed out after ${invocation.timeoutMs}ms`));
    }, invocation.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      chunks.stdout = `${chunks.stdout}${chunk}`.slice(-10 * 1024 * 1024);
    });
    child.stderr.on("data", (chunk: string) => {
      chunks.stderr = `${chunks.stderr}${chunk}`.slice(-2 * 1024 * 1024);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ stdout: chunks.stdout, stderr: chunks.stderr, exitCode: code ?? 1 });
    });
    writeStdin(child, invocation.stdin);
  });
}

function writeStdin(child: ChildProcessWithoutNullStreams, stdin: string | undefined): void {
  if (stdin === undefined) {
    child.stdin.end();
    return;
  }
  child.stdin.end(stdin);
}

function parseGoogleWorkspaceCliOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    if (lines.length > 1) {
      const parsedLines: unknown[] = [];
      for (const line of lines) {
        try {
          parsedLines.push(JSON.parse(line));
        } catch {
          return { stdout: trimmed };
        }
      }
      return { items: parsedLines };
    }
    return { stdout: trimmed };
  }
}

async function readIsolatedDownloadOutput(result: unknown, input: { cwd: string; mimeType?: string }): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  const savedFile = typeof record.saved_file === "string" && record.saved_file.trim() ? record.saved_file.trim() : undefined;
  if (!savedFile) return result;
  const downloadPath = resolve(input.cwd, savedFile);
  if (!isPathInside(input.cwd, downloadPath)) return stripSavedFile(record);
  if (input.mimeType === "text/plain" || record.mimeType === "text/plain") {
    const text = await readFile(downloadPath, "utf8");
    return {
      ...stripSavedFile(record),
      exportedFileName: basename(savedFile),
      text,
      content: text,
      contentText: text,
    };
  }
  return {
    ...stripSavedFile(record),
    exportedFileName: basename(savedFile),
  };
}

function stripSavedFile(record: Record<string, unknown>): Record<string, unknown> {
  const { saved_file: _savedFile, ...safeRecord } = record;
  return safeRecord;
}

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function findExecutableOnPath(name: string, pathValue: string, fileExists: (path: string) => boolean): string | undefined {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (fileExists(candidate)) return candidate;
  }
  return undefined;
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function compactObject(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== ""));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, name: string): string {
  const text = optionalString(value);
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function requiredMethodId(value: unknown, name: string): string {
  const text = requiredString(value, name);
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(text)) throw new Error(`${name} is not a safe Google Workspace method id.`);
  return text;
}

function uploadInput(value: unknown): GwsUploadSpec | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const path = requiredString(record.path, "upload.path");
  const mimeType = optionalString(record.mimeType);
  return {
    path,
    ...(mimeType ? { mimeType } : {}),
  };
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizeFreeBusyItems(value: unknown): Array<{ id: string }> {
  if (!Array.isArray(value)) return [{ id: "primary" }];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: item };
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") return { id: (item as { id: string }).id };
      return undefined;
    })
    .filter((item): item is { id: string } => Boolean(item?.id));
}

function gmailRawMessage(input: Record<string, unknown>): string {
  const raw = optionalString(input.raw);
  if (raw) return raw;
  const to = headerAddressList(input.to);
  const cc = headerAddressList(input.cc);
  const bcc = headerAddressList(input.bcc);
  const subject = optionalString(input.subject);
  const textBody = optionalString(input.textBody ?? input.body) ?? "";
  const htmlBody = optionalString(input.htmlBody);
  if (!to && !cc && !bcc && !subject && !textBody && !htmlBody) {
    throw new Error("Gmail draft input requires raw, recipients, subject, textBody, htmlBody, or body.");
  }
  return base64UrlEncode(gmailMimeMessage({
    to,
    cc,
    bcc,
    from: headerAddressList(input.from),
    replyTo: headerAddressList(input.replyTo),
    subject,
    textBody,
    htmlBody,
  }));
}

function gmailMimeMessage(input: {
  to?: string;
  cc?: string;
  bcc?: string;
  from?: string;
  replyTo?: string;
  subject?: string;
  textBody: string;
  htmlBody?: string;
}): string {
  const headers = [
    ["To", input.to],
    ["Cc", input.cc],
    ["Bcc", input.bcc],
    ["From", input.from],
    ["Reply-To", input.replyTo],
    ["Subject", input.subject ? encodeMimeHeader(input.subject) : undefined],
    ["MIME-Version", "1.0"],
  ].flatMap(([name, value]) => (value ? [`${name}: ${sanitizeHeader(value)}`] : []));
  if (!input.htmlBody) {
    return crlf([
      ...headers,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeBody(input.textBody),
    ]);
  }
  const boundary = `ambient-${createStableBoundary(input)}`;
  return crlf([
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(input.textBody),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(input.htmlBody),
    `--${boundary}--`,
    "",
  ]);
}

function headerAddressList(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;
  const addresses = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return addresses.length ? addresses.join(", ") : undefined;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeMimeHeader(value: string): string {
  const sanitized = sanitizeHeader(value);
  return /^[\x20-\x7E]*$/.test(sanitized) ? sanitized : `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

function normalizeBody(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

function crlf(lines: string[]): string {
  return lines.join("\r\n");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createStableBoundary(input: { subject?: string; textBody: string; htmlBody?: string }): string {
  return base64UrlEncode(`${input.subject ?? ""}\n${input.textBody}\n${input.htmlBody ?? ""}`).slice(0, 24) || "message";
}

function safeAccountHandle(accountHint: string | undefined): string {
  const value = accountHint?.trim() || DEFAULT_ACCOUNT_HANDLE;
  return value.replace(/[^A-Za-z0-9_.@-]/g, "_").slice(0, 120) || DEFAULT_ACCOUNT_HANDLE;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
