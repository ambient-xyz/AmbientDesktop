import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { GoogleWorkspaceCallInput, GoogleWorkspaceCallResult, GoogleWorkspaceDescribeMethodInput, GoogleWorkspaceDriveFileContentWriteResult, GoogleWorkspaceGmailDraftAttachmentSummary, GoogleWorkspaceGmailDraftInput, GoogleWorkspaceGmailDraftWriteResult, GoogleWorkspaceManagedFileResult, GoogleWorkspaceMaterializeFileInput, GoogleWorkspaceMaterializeFileResult, GoogleWorkspaceMethodParameterSummary, GoogleWorkspaceMethodRequestBodySummary, GoogleWorkspaceMethodSideEffect, GoogleWorkspaceMethodSummary, GoogleWorkspaceSearchMethodsInput, GoogleWorkspaceSearchMethodsResult } from "../../shared/pluginTypes";
import type { GoogleWorkspaceCliAdapter } from "./googleWorkspaceCliAdapter";
import {
  GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG,
  GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG_VERSION,
} from "./googleWorkspaceMethodCatalog.generated";

export const GOOGLE_WORKSPACE_METHOD_CATALOG_VERSION = GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG_VERSION;

export interface GoogleWorkspaceMethodBrokerOptions {
  resolveAccountHint?: (accountHint?: string) => string;
}

interface GoogleWorkspaceManagedFileRecord extends GoogleWorkspaceManagedFileResult {
  absolutePath: string;
}

interface GoogleWorkspaceResolvedUpload {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  bytes: number;
  mimeType?: string;
}

interface GoogleWorkspaceResolvedGmailDraft {
  raw: string;
  subject?: string;
  attachments: GoogleWorkspaceGmailDraftAttachmentSummary[];
}

interface GoogleWorkspaceResolvedGmailDraftAttachment extends GoogleWorkspaceGmailDraftAttachmentSummary {
  content: Buffer;
}

interface GoogleWorkspaceMethodSchema {
  description?: string;
  httpMethod?: string;
  parameterOrder?: string[];
  parameters?: Record<string, GoogleWorkspaceMethodSchemaParameter>;
  path?: string;
  requestBody?: GoogleWorkspaceMethodSchemaRequestBody;
  scopes?: string[];
}

interface GoogleWorkspaceMethodSchemaParameter {
  default?: string;
  deprecated?: boolean;
  description?: string;
  enum?: string[];
  format?: string;
  items?: GoogleWorkspaceMethodSchemaParameter;
  location?: string;
  required?: boolean;
  type?: string;
  $ref?: string;
}

interface GoogleWorkspaceMethodSchemaRequestBody {
  required?: boolean;
  schemaRef?: string;
  schema?: {
    $ref?: string;
    description?: string;
    properties?: Record<string, GoogleWorkspaceMethodSchemaParameter>;
    required?: string[];
  };
}

export class GoogleWorkspaceMethodBroker {
  private readonly managedFiles = new Map<string, GoogleWorkspaceManagedFileRecord>();

  constructor(
    private readonly adapter: GoogleWorkspaceCliAdapter,
    private readonly options: GoogleWorkspaceMethodBrokerOptions = {},
  ) {}

  searchMethods(input: GoogleWorkspaceSearchMethodsInput = {}): GoogleWorkspaceSearchMethodsResult {
    return searchGoogleWorkspaceMethods(input);
  }

  async describeMethod(input: GoogleWorkspaceDescribeMethodInput): Promise<GoogleWorkspaceMethodSummary> {
    return describeGoogleWorkspaceMethod(this.adapter, input.methodId);
  }

  async call(input: GoogleWorkspaceCallInput & { workspacePath?: string }): Promise<GoogleWorkspaceCallResult> {
    const method = await this.describeMethod({ methodId: input.methodId });
    const accountHint = this.options.resolveAccountHint?.(input.accountHint) ?? input.accountHint;
    const exportDir = googleWorkspaceCallNeedsIsolatedDownloadCwd(method.id, input.params) && input.dryRun !== true ? await mkdtemp(join(tmpdir(), "ambient-gws-export-")) : undefined;
    const upload = await resolveGoogleWorkspaceUpload(method.id, input);
    const gmailDraft = await resolveGoogleWorkspaceGmailDraft(method.id, input);
    try {
      const result = await this.adapter.invoke({
        method: "workspace.call",
        accountHint,
        input: {
          methodId: method.id,
          params: input.params ?? {},
          ...(gmailDraft ? { body: { message: { raw: gmailDraft.raw } } } : input.body === undefined ? {} : { body: input.body }),
          ...(upload ? { upload: { path: upload.relativePath, ...(upload.mimeType ? { mimeType: upload.mimeType } : {}) } } : {}),
        },
        options: { dryRun: input.dryRun === true, ...(exportDir ? { cwd: exportDir } : upload ? { cwd: input.workspacePath } : {}) },
      }).catch((error) => {
        throw normalizeGoogleWorkspaceCallError(method.id, error);
      });
      const managedResult = await managedGoogleWorkspaceCallResult(result, {
        params: input.params,
        exportDir,
        methodId: method.id,
        managedFiles: this.managedFiles,
        upload,
        gmailDraft,
      });
      return {
        accountHint,
        method,
        dryRun: input.dryRun === true,
        result: managedResult,
      };
    } finally {
      if (exportDir) await rm(exportDir, { recursive: true, force: true });
    }
  }

  async materializeFile(
    input: GoogleWorkspaceMaterializeFileInput & { workspacePath: string },
  ): Promise<GoogleWorkspaceMaterializeFileResult> {
    const handle = input.handle.trim();
    const record = this.managedFiles.get(handle);
    if (!record) throw new Error(`Google Workspace managed file handle is not available: ${handle}`);
    if (!existsSync(record.absolutePath)) throw new Error(`Google Workspace managed file has expired or was removed: ${handle}`);
    const requestedPath = input.path?.trim() || join("Google Workspace Downloads", record.fileName);
    const workspace = resolve(input.workspacePath);
    const absolutePath = resolve(workspace, requestedPath);
    if (!isPathInside(workspace, absolutePath)) throw new Error("Materialized Google Workspace file path is outside the current workspace.");
    const overwritten = existsSync(absolutePath);
    if (overwritten && input.overwrite !== true) {
      throw new Error(`Workspace file already exists: ${relative(workspace, absolutePath)}. Set overwrite=true to replace it.`);
    }
    await mkdir(dirname(absolutePath), { recursive: true });
    await copyFile(record.absolutePath, absolutePath);
    return {
      handle,
      path: relative(workspace, absolutePath),
      bytes: record.bytes,
      fileName: record.fileName,
      ...(record.mimeType ? { mimeType: record.mimeType } : {}),
      overwritten,
    };
  }
}

function googleWorkspaceCallNeedsIsolatedDownloadCwd(methodId: string, params: Record<string, unknown> | undefined): boolean {
  if (methodId === "drive.files.export") return true;
  return methodId === "drive.files.get" && params?.alt === "media";
}

function normalizeGoogleWorkspaceCallError(methodId: string, error: unknown): Error {
  const message = errorMessage(error);
  if (methodId === "docs.documents.get" && isGoogleDocsApiUnavailableMessage(message)) {
    return new Error(
      [
        "Google Docs API is not available for docs.documents.get in this local gws OAuth project.",
        'Fallback: use google_workspace_call with methodId drive.files.export and params {"fileId":"<document id>","mimeType":"text/plain"} to read Google Docs text content.',
        "Do not keep retrying docs.documents.get unless the Google Docs API has been enabled for the OAuth project and had time to propagate.",
        `Original error: ${message}`,
      ].join("\n"),
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function isGoogleDocsApiUnavailableMessage(message: string): boolean {
  return /google docs api/i.test(message) && /(?:disabled|has not been used|service_disabled|accessnotconfigured|access_not_configured|api has not been used)/i.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function managedGoogleWorkspaceCallResult(
  result: unknown,
  input: {
    params: Record<string, unknown> | undefined;
    exportDir: string | undefined;
    methodId: string;
    managedFiles: Map<string, GoogleWorkspaceManagedFileRecord>;
    upload?: GoogleWorkspaceResolvedUpload;
    gmailDraft?: GoogleWorkspaceResolvedGmailDraft;
  },
): Promise<unknown> {
  const downloaded = input.exportDir
    ? await managedDownloadResult(result, { params: input.params, exportDir: input.exportDir, methodId: input.methodId, managedFiles: input.managedFiles })
    : result;
  if (input.upload) return driveFileContentWriteResult(downloaded, { methodId: input.methodId, upload: input.upload });
  if (input.gmailDraft) return gmailDraftWriteResult(downloaded, { methodId: input.methodId, draft: input.gmailDraft });
  if (input.methodId === "gmail.users.messages.attachments.get") {
    return managedGmailAttachmentResult(downloaded, {
      params: input.params,
      methodId: input.methodId,
      managedFiles: input.managedFiles,
    });
  }
  return downloaded;
}

async function resolveGoogleWorkspaceUpload(
  methodId: string,
  input: GoogleWorkspaceCallInput & { workspacePath?: string },
): Promise<GoogleWorkspaceResolvedUpload | undefined> {
  if (!input.upload) return undefined;
  if (!googleWorkspaceMethodSupportsUpload(methodId)) {
    throw new Error(`Google Workspace upload is only supported for Drive file create/update methods, not ${methodId}.`);
  }
  if (!input.workspacePath?.trim()) throw new Error("Google Workspace upload requires a current workspace.");
  const requestedPath = input.upload.path.trim();
  if (!requestedPath) throw new Error("Google Workspace upload path is required.");
  if (isAbsolute(requestedPath)) throw new Error("Google Workspace upload path must be workspace-relative.");
  const workspace = resolve(input.workspacePath);
  const absolutePath = resolve(workspace, requestedPath);
  if (!isPathInside(workspace, absolutePath)) throw new Error("Google Workspace upload path is outside the current workspace.");
  const stats = await stat(absolutePath);
  if (!stats.isFile()) throw new Error(`Google Workspace upload path is not a file: ${requestedPath}`);
  const body = input.body && typeof input.body === "object" && !Array.isArray(input.body) ? input.body as Record<string, unknown> : undefined;
  const mimeType = input.upload.mimeType?.trim() || (typeof body?.mimeType === "string" && body.mimeType.trim() ? body.mimeType.trim() : undefined);
  return {
    absolutePath,
    relativePath: relative(workspace, absolutePath),
    fileName: basename(absolutePath),
    bytes: stats.size,
    ...(mimeType ? { mimeType } : {}),
  };
}

function googleWorkspaceMethodSupportsUpload(methodId: string): boolean {
  return methodId === "drive.files.create" || methodId === "drive.files.update";
}

async function resolveGoogleWorkspaceGmailDraft(
  methodId: string,
  input: GoogleWorkspaceCallInput & { workspacePath?: string },
): Promise<GoogleWorkspaceResolvedGmailDraft | undefined> {
  if (!input.gmailDraft) return undefined;
  if (!googleWorkspaceMethodSupportsGmailDraft(methodId)) {
    throw new Error(`Google Workspace gmailDraft is only supported for Gmail draft create/update methods, not ${methodId}.`);
  }
  if (input.body !== undefined && !isEmptyRecord(input.body)) throw new Error("Google Workspace gmailDraft cannot be combined with a raw body.");
  const draft = input.gmailDraft;
  const attachments = await resolveGoogleWorkspaceGmailDraftAttachments(draft, input.workspacePath);
  const subject = draft.subject?.trim() || undefined;
  const raw = buildGmailDraftRawMessage(draft, attachments);
  return {
    raw,
    ...(subject ? { subject } : {}),
    attachments: attachments.map(({ content: _content, ...summary }) => summary),
  };
}

function googleWorkspaceMethodSupportsGmailDraft(methodId: string): boolean {
  return methodId === "gmail.users.drafts.create" || methodId === "gmail.users.drafts.update";
}

async function resolveGoogleWorkspaceGmailDraftAttachments(
  draft: GoogleWorkspaceGmailDraftInput,
  workspacePath: string | undefined,
): Promise<GoogleWorkspaceResolvedGmailDraftAttachment[]> {
  const inputs = draft.attachments ?? [];
  if (!inputs.length) return [];
  if (!workspacePath?.trim()) throw new Error("Google Workspace Gmail draft attachments require a current workspace.");
  const workspace = resolve(workspacePath);
  const attachments: GoogleWorkspaceResolvedGmailDraftAttachment[] = [];
  for (const input of inputs) {
    const requestedPath = input.path.trim();
    if (!requestedPath) throw new Error("Google Workspace Gmail draft attachment path is required.");
    if (isAbsolute(requestedPath)) throw new Error("Google Workspace Gmail draft attachment path must be workspace-relative.");
    const absolutePath = resolve(workspace, requestedPath);
    if (!isPathInside(workspace, absolutePath)) throw new Error("Google Workspace Gmail draft attachment path is outside the current workspace.");
    const stats = await stat(absolutePath);
    if (!stats.isFile()) throw new Error(`Google Workspace Gmail draft attachment path is not a file: ${requestedPath}`);
    const content = await readFile(absolutePath);
    const mimeType = input.mimeType?.trim() || "application/octet-stream";
    const fileName = safeGoogleWorkspaceFileName(input.fileName?.trim() || basename(absolutePath), mimeType);
    attachments.push({
      path: relative(workspace, absolutePath),
      fileName,
      bytes: stats.size,
      mimeType,
      content,
    });
  }
  return attachments;
}

async function managedDownloadResult(
  result: unknown,
  input: {
    params: Record<string, unknown> | undefined;
    exportDir: string;
    methodId: string;
    managedFiles: Map<string, GoogleWorkspaceManagedFileRecord>;
  },
): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  const savedFile = typeof record.saved_file === "string" && record.saved_file.trim() ? record.saved_file.trim() : undefined;
  if (!savedFile) return result;
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : typeof input.params?.mimeType === "string" ? input.params.mimeType : undefined;
  const absolutePath = resolve(input.exportDir, savedFile);
  if (!isPathInside(input.exportDir, absolutePath)) return stripSavedFile(record);
  if (mimeType === "text/plain") {
    const text = await readFile(absolutePath, "utf8");
    return {
      ...stripSavedFile(record),
      exportedFileName: safeGoogleWorkspaceFileName(savedFile, mimeType),
      text,
    };
  }
  const file = await storeManagedGoogleWorkspaceFile({
    sourcePath: absolutePath,
    savedFile,
    mimeType,
    methodId: input.methodId,
    managedFiles: input.managedFiles,
  });
  return {
    ...stripSavedFile(record),
    exportedFileName: file.fileName,
    file,
  };
}

async function managedGmailAttachmentResult(
  result: unknown,
  input: {
    params: Record<string, unknown> | undefined;
    methodId: string;
    managedFiles: Map<string, GoogleWorkspaceManagedFileRecord>;
  },
): Promise<unknown> {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  const data = typeof record.data === "string" && record.data.trim() ? record.data.trim() : undefined;
  if (!data) return result;
  const bytes = decodeGoogleWorkspaceBase64Url(data);
  const mimeType = typeof record.mimeType === "string" && record.mimeType.trim() ? record.mimeType.trim() : "application/octet-stream";
  const file = await storeManagedGoogleWorkspaceBuffer({
    content: bytes,
    fileName: gmailAttachmentFileName(input.params, mimeType),
    mimeType,
    methodId: input.methodId,
    managedFiles: input.managedFiles,
  });
  const { data: _data, ...safeRecord } = record;
  return {
    ...safeRecord,
    file,
  };
}

function driveFileContentWriteResult(
  response: unknown,
  input: {
    methodId: string;
    upload: GoogleWorkspaceResolvedUpload;
  },
): GoogleWorkspaceDriveFileContentWriteResult {
  return {
    kind: "google_workspace_drive_file_content_write",
    sourceMethodId: input.methodId,
    operation: input.methodId === "drive.files.update" ? "update" : "create",
    upload: {
      path: input.upload.relativePath,
      fileName: input.upload.fileName,
      bytes: input.upload.bytes,
      ...(input.upload.mimeType ? { mimeType: input.upload.mimeType } : {}),
    },
    response,
    createdAt: new Date().toISOString(),
  };
}

function gmailDraftWriteResult(
  response: unknown,
  input: {
    methodId: string;
    draft: GoogleWorkspaceResolvedGmailDraft;
  },
): GoogleWorkspaceGmailDraftWriteResult {
  return {
    kind: "google_workspace_gmail_draft_write",
    sourceMethodId: input.methodId,
    operation: input.methodId === "gmail.users.drafts.update" ? "update" : "create",
    ...(input.draft.subject ? { subject: input.draft.subject } : {}),
    attachments: input.draft.attachments,
    response,
    createdAt: new Date().toISOString(),
  };
}

function buildGmailDraftRawMessage(
  draft: GoogleWorkspaceGmailDraftInput,
  attachments: GoogleWorkspaceResolvedGmailDraftAttachment[],
): string {
  const textBody = draft.textBody ?? draft.body ?? "";
  const htmlBody = draft.htmlBody;
  const subject = draft.subject?.trim();
  const headers = gmailDraftHeaders(draft, subject);
  if (!headers.length && !textBody && !htmlBody && !attachments.length) {
    throw new Error("Gmail draft input requires recipients, subject, textBody, htmlBody, body, or attachments.");
  }
  if (!attachments.length) return base64UrlEncode(gmailDraftBody(headers, textBody, htmlBody));
  const boundary = `ambient-mixed-${createStableBoundary({ subject, textBody, htmlBody, attachmentNames: attachments.map((attachment) => attachment.fileName) })}`;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...gmailDraftBodyPart(textBody, htmlBody),
    ...attachments.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${quoteMimeParameter(attachment.fileName)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${quoteMimeParameter(attachment.fileName)}"`,
      "",
      wrapBase64(attachment.content.toString("base64")),
    ]),
    `--${boundary}--`,
    "",
  ];
  return base64UrlEncode(crlf(lines));
}

function gmailDraftHeaders(draft: GoogleWorkspaceGmailDraftInput, subject: string | undefined): string[] {
  return [
    ["To", headerAddressList(draft.to)],
    ["Cc", headerAddressList(draft.cc)],
    ["Bcc", headerAddressList(draft.bcc)],
    ["From", headerAddressList(draft.from)],
    ["Reply-To", headerAddressList(draft.replyTo)],
    ["Subject", subject ? encodeMimeHeader(subject) : undefined],
    ["MIME-Version", "1.0"],
  ].flatMap(([name, value]) => (value ? [`${name}: ${sanitizeHeader(value)}`] : []));
}

function gmailDraftBody(headers: string[], textBody: string, htmlBody: string | undefined): string {
  return crlf([...headers, ...gmailDraftBodyPart(textBody, htmlBody)]);
}

function gmailDraftBodyPart(textBody: string, htmlBody: string | undefined): string[] {
  if (!htmlBody) {
    return [
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeBody(textBody),
    ];
  }
  const boundary = `ambient-alt-${createStableBoundary({ textBody, htmlBody })}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(textBody),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizeBody(htmlBody),
    `--${boundary}--`,
    "",
  ];
}

async function storeManagedGoogleWorkspaceFile(input: {
  sourcePath: string;
  savedFile: string;
  mimeType?: string;
  methodId: string;
  managedFiles: Map<string, GoogleWorkspaceManagedFileRecord>;
}): Promise<GoogleWorkspaceManagedFileResult> {
  const handle = randomUUID();
  const fileName = safeGoogleWorkspaceFileName(input.savedFile, input.mimeType);
  const targetDir = join(tmpdir(), "ambient-google-workspace-managed-files", handle);
  const targetPath = join(targetDir, fileName);
  await mkdir(targetDir, { recursive: true });
  await copyFile(input.sourcePath, targetPath);
  const stats = await stat(targetPath);
  const result: GoogleWorkspaceManagedFileResult = {
    kind: "google_workspace_managed_file",
    handle,
    fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    bytes: stats.size,
    storage: "ambient_managed_temp",
    sourceMethodId: input.methodId,
    availableToModel: false,
    materializeWith: "google_workspace_materialize_file",
    createdAt: new Date().toISOString(),
  };
  input.managedFiles.set(handle, { ...result, absolutePath: targetPath });
  return result;
}

async function storeManagedGoogleWorkspaceBuffer(input: {
  content: Buffer;
  fileName: string;
  mimeType?: string;
  methodId: string;
  managedFiles: Map<string, GoogleWorkspaceManagedFileRecord>;
}): Promise<GoogleWorkspaceManagedFileResult> {
  const handle = randomUUID();
  const fileName = safeGoogleWorkspaceFileName(input.fileName, input.mimeType);
  const targetDir = join(tmpdir(), "ambient-google-workspace-managed-files", handle);
  const targetPath = join(targetDir, fileName);
  await mkdir(targetDir, { recursive: true });
  await writeFile(targetPath, input.content);
  const stats = await stat(targetPath);
  const result: GoogleWorkspaceManagedFileResult = {
    kind: "google_workspace_managed_file",
    handle,
    fileName,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    bytes: stats.size,
    storage: "ambient_managed_temp",
    sourceMethodId: input.methodId,
    availableToModel: false,
    materializeWith: "google_workspace_materialize_file",
    createdAt: new Date().toISOString(),
  };
  input.managedFiles.set(handle, { ...result, absolutePath: targetPath });
  return result;
}

function stripSavedFile(record: Record<string, unknown>): Record<string, unknown> {
  const { saved_file: _savedFile, ...safeRecord } = record;
  return safeRecord;
}

function safeGoogleWorkspaceFileName(savedFile: string, mimeType?: string): string {
  const candidate = basename(savedFile).replace(/[^\w.\- ]+/g, "_").trim() || "google-workspace-download";
  if (extname(candidate)) return candidate;
  if (mimeType === "application/pdf") return `${candidate}.pdf`;
  if (mimeType === "text/csv") return `${candidate}.csv`;
  if (mimeType === "text/plain") return `${candidate}.txt`;
  if (mimeType === "application/octet-stream") return `${candidate}.bin`;
  return candidate;
}

function gmailAttachmentFileName(params: Record<string, unknown> | undefined, mimeType: string): string {
  const attachmentId = typeof params?.id === "string" && params.id.trim()
    ? params.id.trim()
    : typeof params?.attachmentId === "string" && params.attachmentId.trim()
      ? params.attachmentId.trim()
      : "attachment";
  const safeId = attachmentId.replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "attachment";
  return safeGoogleWorkspaceFileName(`gmail-attachment-${safeId}`, mimeType);
}

function decodeGoogleWorkspaceBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function headerAddressList(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;
  const addresses = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
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

function createStableBoundary(input: { subject?: string; textBody?: string; htmlBody?: string; attachmentNames?: string[] }): string {
  return base64UrlEncode(`${input.subject ?? ""}\n${input.textBody ?? ""}\n${input.htmlBody ?? ""}\n${(input.attachmentNames ?? []).join("\n")}`).slice(0, 24) || "message";
}

function quoteMimeParameter(value: string): string {
  return sanitizeHeader(value).replace(/["\\]/g, "_");
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function isPathInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

export function searchGoogleWorkspaceMethods(input: GoogleWorkspaceSearchMethodsInput = {}): GoogleWorkspaceSearchMethodsResult {
  const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 12), 50));
  const query = normalizeSearchText(input.query);
  const service = input.service?.trim().toLowerCase();
  const sideEffect = input.sideEffect;
  const httpMethod = input.httpMethod?.trim().toUpperCase();
  const scope = input.scope?.trim().toLowerCase();
  const scored = GOOGLE_WORKSPACE_METHOD_CATALOG
    .filter((method) => !service || method.service === service)
    .filter((method) => !sideEffect || method.sideEffect === sideEffect)
    .filter((method) => !httpMethod || method.httpMethod === httpMethod)
    .filter((method) => !scope || method.scopes.some((candidate) => candidate.toLowerCase().includes(scope)))
    .map((method) => ({ method, score: query ? scoreMethod(method, query) : 1 }))
    .filter((item) => !query || item.score > 0)
    .sort((left, right) => right.score - left.score || left.method.id.localeCompare(right.method.id));
  return {
    methods: scored.slice(0, limit).map((item) => item.method),
    truncated: scored.length > limit,
    catalogVersion: GOOGLE_WORKSPACE_METHOD_CATALOG_VERSION,
  };
}

export async function describeGoogleWorkspaceMethod(
  adapter: GoogleWorkspaceCliAdapter,
  methodId: string,
): Promise<GoogleWorkspaceMethodSummary> {
  const normalized = normalizeMethodId(methodId);
  const cataloged = GOOGLE_WORKSPACE_METHOD_CATALOG.find((method) => method.id === normalized);
  const schema = await adapter.invoke<GoogleWorkspaceMethodSchema>({
    method: "workspace.schema",
    input: { methodId: normalized },
    options: { timeoutMs: 10_000 },
  }).catch(() => undefined);
  if (!schema) {
    if (cataloged) return cataloged;
    throw new Error(`Google Workspace method is not available in the local gws schema catalog: ${normalized}`);
  }
  return methodSummaryFromSchema(normalized, schema, cataloged);
}

export function methodSummaryFromSchema(
  methodId: string,
  schema: GoogleWorkspaceMethodSchema,
  seeded?: GoogleWorkspaceMethodSummary,
): GoogleWorkspaceMethodSummary {
  const normalized = normalizeMethodId(methodId);
  const parts = normalized.split(".");
  const service = parts[0]!;
  const method = parts.at(-1)!;
  const resource = parts.slice(1, -1).join(".");
  const httpMethod = (schema.httpMethod ?? seeded?.httpMethod ?? "GET").toUpperCase();
  const scopes = Array.isArray(schema.scopes) ? schema.scopes.filter((scope): scope is string => typeof scope === "string") : seeded?.scopes ?? [];
  const description = briefText(schema.description ?? seeded?.description ?? `Google Workspace API method ${normalized}.`, 420);
  const path = schema.path ?? seeded?.path;
  const sideEffect = seeded?.sideEffect ?? classifyGoogleWorkspaceMethodSideEffect({
    methodId: normalized,
    httpMethod,
    path,
    scopes,
    description,
  });
  return {
    id: normalized,
    service,
    resource,
    method,
    label: seeded?.label ?? labelFromMethodId(normalized),
    description,
    httpMethod,
    path,
    scopes,
    sideEffect,
    dryRunSupported: httpMethod !== "GET",
    parameters: googleWorkspaceMethodParametersFromSchema(schema) ?? seeded?.parameters,
    requestBody: googleWorkspaceMethodRequestBodyFromSchema(schema.requestBody) ?? seeded?.requestBody,
  };
}

export function classifyGoogleWorkspaceMethodSideEffect(input: {
  methodId: string;
  httpMethod: string;
  path?: string;
  scopes?: string[];
  description?: string;
}): GoogleWorkspaceMethodSideEffect {
  const methodId = normalizeMethodId(input.methodId).toLowerCase();
  if (googleWorkspaceMethodSendsExternalCommunication(methodId)) return "external_communication";
  if (/^gmail\.users\.drafts\.(create|update|delete)$/.test(methodId) && input.httpMethod !== "GET") return "draft_write";
  if (/^gmail\.users\.messages\.(import|insert)$/.test(methodId) && input.httpMethod !== "GET") return "data_mutation";
  const text = `${input.methodId} ${input.httpMethod} ${input.path ?? ""} ${(input.scopes ?? []).join(" ")} ${input.description ?? ""}`.toLowerCase();
  if (/\bspaces\.messages\.create\b/.test(text)) return "external_communication";
  if (/\b(permissions?|acl|sharing|share)\b/.test(text) && input.httpMethod !== "GET") return "sharing_mutation";
  if (/\bdrafts?\b/.test(text) && input.httpMethod !== "GET") return "draft_write";
  if (input.httpMethod !== "GET") return "data_mutation";
  if (/\b(labels\.list|users\.getprofile|about\.get|calendarlist\.list|colors\.(get|list))\b/.test(text)) return "metadata_read";
  return "personal_content_read";
}

export function googleWorkspaceMethodApprovalDetail(method: GoogleWorkspaceMethodSummary, input: GoogleWorkspaceCallInput): string {
  return [
    `Account: ${input.accountHint?.trim() || "default"}`,
    `Method: ${method.id}`,
    `Service: ${method.service}`,
    `HTTP: ${method.httpMethod}${method.path ? ` ${method.path}` : ""}`,
    `Side effect: ${method.sideEffect}`,
    `Scopes: ${method.scopes.length ? method.scopes.join(", ") : "unknown"}`,
    `Required params: ${googleWorkspaceRequiredParameterDetail(method)}`,
    `Optional params: ${googleWorkspaceOptionalParameterDetail(method)}`,
    `Request body schema: ${googleWorkspaceRequestBodyDetail(method)}`,
    `Dry run requested: ${input.dryRun === true ? "yes" : "no"}`,
    `Idempotency key: ${input.idempotencyKey?.trim() || "none"}`,
    `Params: ${summarizeGoogleWorkspaceCallValue(input.params ?? {})}`,
    input.body === undefined ? "Body: none" : `Body: ${summarizeGoogleWorkspaceCallValue(input.body)}`,
    `Upload: ${googleWorkspaceUploadDetail(input.upload)}`,
    `Gmail draft: ${googleWorkspaceGmailDraftDetail(input.gmailDraft)}`,
    sendsExternalCommunication(method) ? "External communication: yes" : "External communication: no",
  ].join("\n");
}

export function googleWorkspaceMethodGrantIdentity(method: GoogleWorkspaceMethodSummary, input: GoogleWorkspaceCallInput): string {
  return [
    "google.workspace.call",
    input.accountHint?.trim() || "default",
    method.id,
    method.httpMethod,
    method.path ?? "",
    method.sideEffect,
  ].join("\0");
}

export function sendsExternalCommunication(method: GoogleWorkspaceMethodSummary): boolean {
  return method.sideEffect === "external_communication" || googleWorkspaceMethodSendsExternalCommunication(method.id);
}

function googleWorkspaceMethodSendsExternalCommunication(methodId: string): boolean {
  return methodId === "gmail.users.drafts.send" || methodId === "gmail.users.messages.send" || methodId === "chat.spaces.messages.create";
}

function googleWorkspaceUploadDetail(upload: GoogleWorkspaceCallInput["upload"]): string {
  if (!upload) return "none";
  return [
    `workspace path ${upload.path.trim() || "(missing)"}`,
    upload.mimeType?.trim() ? `mimeType ${upload.mimeType.trim()}` : undefined,
  ].filter(Boolean).join("; ");
}

function googleWorkspaceGmailDraftDetail(draft: GoogleWorkspaceCallInput["gmailDraft"]): string {
  if (!draft) return "none";
  const attachmentCount = draft.attachments?.length ?? 0;
  const attachmentPaths = (draft.attachments ?? [])
    .map((attachment) => attachment.path.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
  return [
    draft.subject?.trim() ? `subject ${draft.subject.trim()}` : undefined,
    headerAddressList(draft.to) ? "to yes" : undefined,
    headerAddressList(draft.cc) ? "cc yes" : undefined,
    headerAddressList(draft.bcc) ? "bcc yes" : undefined,
    `attachments ${attachmentCount}`,
    attachmentPaths ? `attachment paths ${attachmentPaths}` : undefined,
  ].filter(Boolean).join("; ");
}

export function normalizeMethodId(methodId: string): string {
  const normalized = methodId.trim();
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(normalized)) {
    throw new Error(`Google Workspace method id is not safe: ${methodId}`);
  }
  return normalized;
}

function seed(input: Omit<GoogleWorkspaceMethodSummary, "service" | "resource" | "method" | "dryRunSupported">): GoogleWorkspaceMethodSummary {
  const id = normalizeMethodId(input.id);
  const parts = id.split(".");
  const httpMethod = input.httpMethod.toUpperCase();
  return {
    ...input,
    id,
    service: parts[0]!,
    resource: parts.slice(1, -1).join("."),
    method: parts.at(-1)!,
    httpMethod,
    dryRunSupported: httpMethod !== "GET",
  };
}

export const GOOGLE_WORKSPACE_METHOD_SEED_CATALOG: GoogleWorkspaceMethodSummary[] = [
  seed({
    id: "gmail.users.messages.list",
    label: "List Gmail messages",
    description: "List Gmail messages matching a query.",
    httpMethod: "GET",
    path: "gmail/v1/users/{userId}/messages",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "gmail.users.threads.get",
    label: "Read Gmail thread",
    description: "Read a Gmail thread by id.",
    httpMethod: "GET",
    path: "gmail/v1/users/{userId}/threads/{id}",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "gmail.users.labels.list",
    label: "List Gmail labels",
    description: "List Gmail labels.",
    httpMethod: "GET",
    path: "gmail/v1/users/{userId}/labels",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.labels"],
    sideEffect: "metadata_read",
  }),
  seed({
    id: "gmail.users.drafts.create",
    label: "Create Gmail draft",
    description: "Create a Gmail draft without sending it.",
    httpMethod: "POST",
    path: "gmail/v1/users/{userId}/drafts",
    scopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "draft_write",
  }),
  seed({
    id: "gmail.users.drafts.delete",
    label: "Delete Gmail draft",
    description: "Delete a Gmail draft without sending it.",
    httpMethod: "DELETE",
    path: "gmail/v1/users/{userId}/drafts/{id}",
    scopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "draft_write",
  }),
  seed({
    id: "gmail.users.drafts.get",
    label: "Read Gmail draft",
    description: "Read a Gmail draft.",
    httpMethod: "GET",
    path: "gmail/v1/users/{userId}/drafts/{id}",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.compose"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "gmail.users.drafts.list",
    label: "List Gmail drafts",
    description: "List Gmail drafts.",
    httpMethod: "GET",
    path: "gmail/v1/users/{userId}/drafts",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.compose"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "gmail.users.drafts.send",
    label: "Send Gmail draft",
    description: "Send an existing Gmail draft.",
    httpMethod: "POST",
    path: "gmail/v1/users/{userId}/drafts/send",
    scopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.send"],
    sideEffect: "external_communication",
  }),
  seed({
    id: "gmail.users.drafts.update",
    label: "Update Gmail draft",
    description: "Update a Gmail draft without sending it.",
    httpMethod: "PUT",
    path: "gmail/v1/users/{userId}/drafts/{id}",
    scopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "draft_write",
  }),
  seed({
    id: "gmail.users.messages.import",
    label: "Import Gmail message",
    description: "Import a message into the user's mailbox without sending it.",
    httpMethod: "POST",
    path: "gmail/v1/users/{userId}/messages/import",
    scopes: ["https://www.googleapis.com/auth/gmail.insert", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "data_mutation",
  }),
  seed({
    id: "gmail.users.messages.insert",
    label: "Insert Gmail message",
    description: "Insert a message into the user's mailbox without sending it.",
    httpMethod: "POST",
    path: "gmail/v1/users/{userId}/messages",
    scopes: ["https://www.googleapis.com/auth/gmail.insert", "https://www.googleapis.com/auth/gmail.modify"],
    sideEffect: "data_mutation",
  }),
  seed({
    id: "gmail.users.messages.send",
    label: "Send Gmail message",
    description: "Send a Gmail message.",
    httpMethod: "POST",
    path: "gmail/v1/users/{userId}/messages/send",
    scopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.send"],
    sideEffect: "external_communication",
  }),
  seed({
    id: "calendar.calendarList.list",
    label: "List calendars",
    description: "List calendars available to the account.",
    httpMethod: "GET",
    path: "calendar/v3/users/me/calendarList",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    sideEffect: "metadata_read",
  }),
  seed({
    id: "calendar.events.list",
    label: "List calendar events",
    description: "List events on a calendar.",
    httpMethod: "GET",
    path: "calendar/v3/calendars/{calendarId}/events",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "calendar.events.insert",
    label: "Create calendar event",
    description: "Create a Google Calendar event.",
    httpMethod: "POST",
    path: "calendar/v3/calendars/{calendarId}/events",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    sideEffect: "data_mutation",
  }),
  seed({
    id: "drive.files.list",
    label: "Search Drive files",
    description: "Search or list Drive files.",
    httpMethod: "GET",
    path: "drive/v3/files",
    scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "drive.files.get",
    label: "Read Drive file metadata",
    description: "Read Drive file metadata.",
    httpMethod: "GET",
    path: "drive/v3/files/{fileId}",
    scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "drive.files.create",
    label: "Create Drive file",
    description: "Create or upload a Drive file.",
    httpMethod: "POST",
    path: "drive/v3/files",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    sideEffect: "data_mutation",
  }),
  seed({
    id: "drive.permissions.create",
    label: "Create Drive sharing permission",
    description: "Create a Drive file sharing permission.",
    httpMethod: "POST",
    path: "drive/v3/files/{fileId}/permissions",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    sideEffect: "sharing_mutation",
  }),
  seed({
    id: "sheets.spreadsheets.get",
    label: "Read spreadsheet",
    description: "Read spreadsheet metadata and grid data.",
    httpMethod: "GET",
    path: "v4/spreadsheets/{spreadsheetId}",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.readonly"],
    sideEffect: "personal_content_read",
  }),
  seed({
    id: "docs.documents.get",
    label: "Read Google Doc",
    description: "Read a Google Docs document.",
    httpMethod: "GET",
    path: "v1/documents/{documentId}",
    scopes: ["https://www.googleapis.com/auth/documents.readonly", "https://www.googleapis.com/auth/drive.readonly"],
    sideEffect: "personal_content_read",
  }),
];

function normalizeSearchText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function scoreMethod(method: GoogleWorkspaceMethodSummary, query: string): number {
  const terms = query.split(/\s+/).filter(Boolean);
  const haystack = [
    method.id,
    method.label,
    method.description,
    method.service,
    method.resource,
    method.method,
    method.httpMethod,
    method.sideEffect,
    method.path ?? "",
    method.scopes.join(" "),
    (method.parameters ?? []).map((parameter) => `${parameter.name} ${parameter.location ?? ""} ${parameter.type ?? ""} ${parameter.description ?? ""}`).join(" "),
    method.requestBody
      ? `${method.requestBody.schemaRef ?? ""} ${method.requestBody.description ?? ""} ${(method.requestBody.fields ?? []).map((field) => `${field.name} ${field.type ?? ""} ${field.description ?? ""}`).join(" ")}`
      : "",
  ].join(" ").toLowerCase();
  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) return score;
    if (method.id.toLowerCase().includes(term)) return score + 4;
    if (method.label.toLowerCase().includes(term) || method.resource.toLowerCase().includes(term) || method.method.toLowerCase().includes(term)) return score + 3;
    return score + 1;
  }, 0);
}

function labelFromMethodId(methodId: string): string {
  return methodId
    .split(".")
    .map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" ");
}

function googleWorkspaceMethodParametersFromSchema(schema: GoogleWorkspaceMethodSchema): GoogleWorkspaceMethodParameterSummary[] | undefined {
  const parameters = schema.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const order = Array.isArray(schema.parameterOrder) ? schema.parameterOrder.filter((name): name is string => typeof name === "string") : [];
  const names = [...order, ...Object.keys(parameters).filter((name) => !order.includes(name))];
  return names
    .map((name) => {
      const parameter = parameters[name];
      if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) return undefined;
      const location = optionalText(parameter.location);
      const type = schemaType(parameter);
      const description = optionalText(parameter.description);
      const defaultValue = optionalText(parameter.default);
      return {
        name,
        ...(location ? { location } : {}),
        ...(type ? { type } : {}),
        required: parameter.required === true,
        ...(description ? { description: briefText(description, 180) } : {}),
        ...(Array.isArray(parameter.enum) ? { enum: parameter.enum.filter((value): value is string => typeof value === "string").slice(0, 20) } : {}),
        ...(parameter.deprecated === true ? { deprecated: true } : {}),
        ...(defaultValue ? { default: defaultValue } : {}),
      };
    })
    .filter((parameter): parameter is GoogleWorkspaceMethodParameterSummary => Boolean(parameter));
}

function googleWorkspaceMethodRequestBodyFromSchema(requestBody: GoogleWorkspaceMethodSchemaRequestBody | undefined): GoogleWorkspaceMethodRequestBodySummary | undefined {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) return undefined;
  const schema = requestBody.schema && typeof requestBody.schema === "object" && !Array.isArray(requestBody.schema) ? requestBody.schema : {};
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
  const fields = Object.entries(properties).slice(0, 24).map(([name, field]) => {
    const type = schemaType(field);
    const description = optionalText(field.description);
    return {
      name,
      ...(type ? { type } : {}),
      ...(required.includes(name) ? { required: true } : {}),
      ...(description ? { description: briefText(description, 160) } : {}),
      ...(field.deprecated === true ? { deprecated: true } : {}),
    };
  });
  const schemaRef = optionalText(requestBody.schemaRef ?? schema.$ref);
  const description = optionalText(schema.description);
  return {
    ...(schemaRef ? { schemaRef } : {}),
    ...(description ? { description: briefText(description, 220) } : {}),
    ...(requestBody.required === true ? { required: true } : {}),
    fields,
  };
}

function schemaType(schema: GoogleWorkspaceMethodSchemaParameter | undefined): string | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (typeof schema.$ref === "string" && schema.$ref.trim()) return schema.$ref.trim();
  if (typeof schema.type !== "string" || !schema.type.trim()) return undefined;
  if (schema.type === "array" && schema.items) {
    const itemType = schemaType(schema.items);
    return itemType ? `${itemType}[]` : "array";
  }
  return typeof schema.format === "string" && schema.format.trim() ? `${schema.type}:${schema.format}` : schema.type;
}

function googleWorkspaceRequiredParameterDetail(method: GoogleWorkspaceMethodSummary): string {
  const required = (method.parameters ?? []).filter((parameter) => parameter.required);
  if (!required.length) return "none";
  return required.map(parameterDetail).join(", ");
}

function googleWorkspaceOptionalParameterDetail(method: GoogleWorkspaceMethodSummary): string {
  const optional = (method.parameters ?? []).filter((parameter) => !parameter.required && !parameter.deprecated);
  if (!optional.length) return "none";
  const visible = optional.slice(0, 12).map(parameterDetail);
  return `${visible.join(", ")}${optional.length > visible.length ? `, +${optional.length - visible.length} more` : ""}`;
}

function parameterDetail(parameter: GoogleWorkspaceMethodParameterSummary): string {
  return `${parameter.name}${parameter.location ? `:${parameter.location}` : ""}${parameter.type ? `:${parameter.type}` : ""}`;
}

function googleWorkspaceRequestBodyDetail(method: GoogleWorkspaceMethodSummary): string {
  const body = method.requestBody;
  if (!body) return "none";
  const fields = body.fields.length
    ? body.fields
        .slice(0, 12)
        .map((field) => `${field.name}${field.type ? `:${field.type}` : ""}${field.required ? ":required" : ""}`)
        .join(", ")
    : "fields unknown";
  return `${body.schemaRef ?? "object"}${body.required ? " required" : ""}; ${fields}${body.fields.length > 12 ? `, +${body.fields.length - 12} more` : ""}`;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isEmptyRecord(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0);
}

function briefText(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...` : text;
}

function summarizeGoogleWorkspaceCallValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 80 ? `[string ${value.length} chars]` : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[array ${value.length} items]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.slice(0, 8).join(", ")}${keys.length > 8 ? ", ..." : ""}}`;
  }
  return typeof value;
}

export const GOOGLE_WORKSPACE_METHOD_CATALOG: GoogleWorkspaceMethodSummary[] = mergeGeneratedAndSeedCatalog();

function mergeGeneratedAndSeedCatalog(): GoogleWorkspaceMethodSummary[] {
  const byId = new Map<string, GoogleWorkspaceMethodSummary>();
  for (const method of GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG) byId.set(method.id, method);
  for (const seed of GOOGLE_WORKSPACE_METHOD_SEED_CATALOG) {
    const generated = byId.get(seed.id);
    byId.set(seed.id, generated ? { ...generated, ...seed, parameters: generated.parameters, requestBody: generated.requestBody } : seed);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
