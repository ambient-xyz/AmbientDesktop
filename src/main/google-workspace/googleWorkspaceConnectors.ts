import type {
  WorkflowConnectorAccountDescriptor,
  WorkflowConnectorApprovalPreview,
  WorkflowConnectorApprovalPreviewer,
  WorkflowConnectorAuthStatus,
  WorkflowConnectorCallInput,
  WorkflowConnectorDescriptor,
  WorkflowConnectorOperationDescriptor,
  WorkflowConnectorPaginationDescriptor,
  WorkflowConnectorRegistration,
} from "../workflow/workflowConnectors";
import { validateWorkflowConnectorDescriptor } from "../workflow/workflowConnectors";
import type { WorkflowConnectorAccessToken } from "../workflow/workflowConnectorAuth";
import type { GoogleSidecarRequest } from "./googleSidecarSupervisor";

const GOOGLE_PROVIDER_ID = "google.workspace";
const GWS_PROVIDER_ID = "google.workspace.cli";

export type GoogleWorkspaceConnectorAdapterKind = "ambient-oauth" | "gws";

export interface GoogleWorkspaceConnectorState {
  status: WorkflowConnectorAuthStatus;
  accounts: WorkflowConnectorAccountDescriptor[];
}

export interface GoogleWorkspaceConnectorDescriptorOptions {
  states?: Partial<Record<string, GoogleWorkspaceConnectorState>>;
  adapter?: GoogleWorkspaceConnectorAdapterKind;
}

export interface GoogleWorkspaceConnectorRuntime {
  auth?: {
    accessTokenForApp(connectorId: string, accountHandle: string): Promise<WorkflowConnectorAccessToken>;
  };
  sidecar: {
    invoke<T = unknown>(request: GoogleSidecarRequest): Promise<T>;
  };
}

export function googleWorkspaceConnectorDescriptors(options: GoogleWorkspaceConnectorDescriptorOptions = {}): WorkflowConnectorDescriptor[] {
  const adapter = options.adapter ?? "ambient-oauth";
  return [
    gmailConnectorDescriptor(options.states?.["google.gmail"], adapter),
    googleCalendarConnectorDescriptor(options.states?.["google.calendar"], adapter),
    googleDriveConnectorDescriptor(options.states?.["google.drive"], adapter),
  ];
}

export function googleWorkspaceConnectorRegistrations(
  runtime: GoogleWorkspaceConnectorRuntime,
  options: GoogleWorkspaceConnectorDescriptorOptions = {},
): WorkflowConnectorRegistration[] {
  return googleWorkspaceConnectorDescriptors(options).map((descriptor) => ({
    descriptor,
    approvalPreviewers: googleWorkspaceApprovalPreviewers(descriptor.id),
    handlers: Object.fromEntries(
      descriptor.operations.map((operation) => [
        operation.name,
        (call: WorkflowConnectorCallInput) => invokeGoogleOperation(runtime, descriptor, operation, call),
      ]),
    ),
  }));
}

async function invokeGoogleOperation(
  runtime: GoogleWorkspaceConnectorRuntime,
  descriptor: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorOperationDescriptor,
  call: WorkflowConnectorCallInput,
): Promise<unknown> {
  const accountHandle = call.accountId?.trim();
  if (runtime.auth) {
    if (!accountHandle) throw new Error(`${descriptor.label} requires a connected Google account.`);
    const token = await runtime.auth.accessTokenForApp(descriptor.id, accountHandle);
    const result = await runtime.sidecar.invoke({
      method: sidecarMethod(descriptor.id, operation.name),
      accessToken: token.accessToken,
      accountHint: token.account.email ?? token.account.accountId,
      input: call.input ?? {},
      options: { timeoutMs: operation.defaultTimeoutMs, dryRun: call.dryRun },
    });
    return normalizeGoogleConnectorResult(descriptor.id, operation.name, result, call.input);
  }
  const result = await runtime.sidecar.invoke({
    method: sidecarMethod(descriptor.id, operation.name),
    accountHint: accountHandle,
    input: call.input ?? {},
    options: { timeoutMs: operation.defaultTimeoutMs, dryRun: call.dryRun },
  });
  return normalizeGoogleConnectorResult(descriptor.id, operation.name, result, call.input);
}

function normalizeGoogleConnectorResult(connectorId: string, operation: string, result: unknown, input?: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  if (connectorId === "google.drive") return normalizeDriveConnectorResult(operation, result, input);
  if (connectorId === "google.calendar") return normalizeCalendarConnectorResult(operation, result);
  if (connectorId !== "google.gmail") return result;
  if (operation === "readThread") return normalizeGmailThreadResult(result);
  if (operation !== "search") return result;
  const record = result as Record<string, unknown>;
  const messages = Array.isArray(record.messages) ? record.messages.map(normalizeGmailMessageSearchResult) : undefined;
  const threads = Array.isArray(record.threads) ? record.threads.map(normalizeGmailThreadIdAlias) : messages ? gmailThreadsFromMessages(messages) : undefined;
  return {
    ...record,
    ...(messages ? { messages } : {}),
    ...(threads ? { threads } : {}),
  };
}

function normalizeDriveConnectorResult(operation: string, result: object, input?: unknown): unknown {
  const record = result as Record<string, unknown>;
  const inputRecord = objectInput(input);
  if (operation === "search") {
    const files = Array.isArray(record.files) ? record.files : Array.isArray(record.items) ? record.items : undefined;
    return {
      ...record,
      ...(files ? { files, items: files } : {}),
    };
  }
  if (operation === "listSharedDrives") {
    const drives = Array.isArray(record.drives) ? record.drives : Array.isArray(record.items) ? record.items : undefined;
    return {
      ...record,
      ...(drives ? { drives, items: drives } : {}),
    };
  }
  if (operation === "readFile") {
    const text = optionalString(record.text ?? record.contentText ?? record.content ?? record.stdout);
    const maxTextChars = boundedContentChars(inputRecord.maxContentChars ?? inputRecord.maxTextChars ?? inputRecord.maxChars);
    const truncatedText = text ? truncateText(text, maxTextChars) : undefined;
    const truncated = Boolean(record.truncated) || Boolean(text && text.length > maxTextChars);
    return {
      ...(optionalString(record.id) ? { id: optionalString(record.id) } : {}),
      ...(optionalString(record.name) ? { name: optionalString(record.name) } : {}),
      ...(optionalString(record.mimeType) ? { mimeType: optionalString(record.mimeType) } : {}),
      ...(optionalString(record.webViewLink) ? { webViewLink: optionalString(record.webViewLink) } : {}),
      ...(optionalString(record.modifiedTime) ? { modifiedTime: optionalString(record.modifiedTime) } : {}),
      ...(optionalString(record.size) ? { size: optionalString(record.size) } : {}),
      ...(Array.isArray(record.owners) ? { owners: record.owners.slice(0, 3) } : {}),
      ...(optionalString(record.description) ? { description: truncateText(optionalString(record.description)!, 1000) } : {}),
      ...(truncatedText ? { text: truncatedText, content: truncatedText, contentText: truncatedText, contentChars: text?.length ?? truncatedText.length } : {}),
      truncated,
    };
  }
  return result;
}

function normalizeCalendarConnectorResult(operation: string, result: object): unknown {
  const record = result as Record<string, unknown>;
  if (operation === "listEvents") {
    const events = Array.isArray(record.items) ? record.items : Array.isArray(record.events) ? record.events : undefined;
    return {
      ...record,
      ...(events ? { items: events, events } : {}),
    };
  }
  if (operation === "listCalendars") {
    const calendars = Array.isArray(record.items) ? record.items : Array.isArray(record.calendars) ? record.calendars : undefined;
    return {
      ...record,
      ...(calendars ? { items: calendars, calendars } : {}),
    };
  }
  return result;
}

function normalizeGmailThreadResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  const id = optionalString(record.id ?? record.threadId);
  const threadId = optionalString(record.threadId ?? record.id);
  const messages = Array.isArray(record.messages) ? record.messages.slice(0, 25).map(normalizeGmailMessageSummary) : [];
  return {
    ...(id ? { id } : {}),
    ...(threadId ? { threadId } : {}),
    ...(typeof record.snippet === "string" ? { snippet: truncateText(record.snippet, 1000) } : {}),
    messages,
  };
}

function normalizeGmailMessageSummary(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const record = item as Record<string, unknown>;
  const headers = gmailHeaderSummary(record.payload);
  return {
    ...(optionalString(record.id) ? { id: optionalString(record.id) } : {}),
    ...(optionalString(record.threadId) ? { threadId: optionalString(record.threadId) } : {}),
    ...(typeof record.snippet === "string" ? { snippet: truncateText(record.snippet, 1000) } : {}),
    ...(optionalString(record.internalDate) ? { internalDate: optionalString(record.internalDate) } : {}),
    ...(Array.isArray(record.labelIds) ? { labelIds: record.labelIds.filter((label): label is string => typeof label === "string").slice(0, 20) } : {}),
    ...(headers ? { headers } : {}),
  };
}

function gmailHeaderSummary(payload: unknown): Record<string, string> | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const headers = (payload as Record<string, unknown>).headers;
  if (!Array.isArray(headers)) return undefined;
  const wanted = new Set(["from", "to", "cc", "reply-to", "subject", "date"]);
  const summary: Record<string, string> = {};
  for (const header of headers) {
    if (!header || typeof header !== "object" || Array.isArray(header)) continue;
    const record = header as Record<string, unknown>;
    const name = optionalString(record.name)?.toLowerCase();
    const value = optionalString(record.value);
    if (name && value && wanted.has(name) && !(name in summary)) summary[name] = truncateText(value, 500);
  }
  return Object.keys(summary).length ? summary : undefined;
}

function normalizeGmailThreadIdAlias(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const record = item as Record<string, unknown>;
  const threadId = optionalString(record.threadId ?? record.id);
  return threadId && record.threadId !== threadId ? { ...record, threadId } : record;
}

function normalizeGmailMessageSearchResult(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const record = item as Record<string, unknown>;
  const threadId = optionalString(record.threadId);
  return threadId && record.threadId !== threadId ? { ...record, threadId } : record;
}

function gmailThreadsFromMessages(messages: unknown[]): unknown[] {
  const byThreadId = new Map<string, Record<string, unknown>>();
  for (const item of messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const message = item as Record<string, unknown>;
    const threadId = optionalString(message.threadId);
    if (!threadId || byThreadId.has(threadId)) continue;
    byThreadId.set(threadId, {
      id: threadId,
      threadId,
      messageIds: [optionalString(message.id)].filter((value): value is string => Boolean(value)),
      ...(typeof message.snippet === "string" ? { snippet: message.snippet } : {}),
    });
  }
  return [...byThreadId.values()];
}

function sidecarMethod(connectorId: string, operation: string): string {
  const namespace = {
    "google.gmail": "gmail",
    "google.calendar": "calendar",
    "google.drive": "drive",
  }[connectorId];
  if (!namespace) throw new Error(`Unsupported Google connector: ${connectorId}`);
  return `${namespace}.${operation}`;
}

function gmailConnectorDescriptor(state: GoogleWorkspaceConnectorState | undefined, adapter: GoogleWorkspaceConnectorAdapterKind): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: "google.gmail",
    label: "Gmail",
    description: "Read Gmail threads, manage drafts, and prepare guarded outbound mail through a connected Google account.",
    auth: { type: adapter === "gws" ? "oauth2" : "oauth2_pkce", status: state?.status ?? "not_configured", providerId: googleProviderId(adapter) },
    accounts: state?.accounts ?? [],
    scopes: [
      scope("gmail.readonly", "Gmail read", "Read Gmail threads, message content, and attachments.", true),
      scope("gmail.compose", "Gmail drafts", "Create, read, update, delete, and send Gmail drafts.", true),
      scope("gmail.send", "Gmail send", "Send Gmail messages or existing drafts.", true),
    ],
    operations: filterOperations(adapter, "google.gmail", [
      op(
        "search",
        "Search mail",
        "Search Gmail message metadata/snippets and optionally group results by thread. Use maxResults for requests like the last 100 emails or metadata-first categorization; readThread is required for full message bodies.",
        ["gmail.readonly"],
        "read_personal_data",
        gmailSearchInputSchema(),
        gmailSearchOutputSchema(),
        { itemsPath: "messages", nextPageTokenPath: "nextPageToken", pageTokenInputPath: "pageToken", pageSizeInputPath: "maxResults", defaultPageSize: 100, maxPageSize: 500 },
      ),
      op(
        "readThread",
        "Read thread",
        "Read a Gmail thread with message bodies and attachment metadata. Use threadId from search results.",
        ["gmail.readonly"],
        "read_personal_data",
        gmailReadThreadInputSchema(),
        gmailReadThreadOutputSchema(),
      ),
      op("readAttachment", "Read attachment", "Read a Gmail attachment when explicitly requested.", ["gmail.readonly"], "read_personal_data", gmailReadAttachmentInputSchema()),
      op("listLabels", "List labels", "List Gmail labels for filtering and categorization.", ["gmail.readonly"], "read_personal_data", gmailListLabelsInputSchema()),
      op("createDraft", "Create draft", "Create a Gmail draft without sending it.", ["gmail.compose"], "write_external", gmailDraftMessageInputSchema()),
      op("updateDraft", "Update draft", "Update an existing Gmail draft.", ["gmail.compose"], "write_external", gmailDraftUpdateInputSchema()),
      op("deleteDraft", "Delete draft", "Delete an existing Gmail draft.", ["gmail.compose"], "write_external", gmailDraftDeleteInputSchema()),
      op("sendDraft", "Send draft", "Send an existing Gmail draft after Desktop approval.", ["gmail.compose", "gmail.send"], "write_external"),
    ]),
    rateLimit: { requestsPerMinute: 60, burst: 10 },
    sync: { cursorKind: "opaque", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: [
      "Desktop owns transcript and audit minimization before model context insertion.",
      "Attachment and message bodies should only be fetched by explicit operation.",
    ],
  });
}

function googleCalendarConnectorDescriptor(state: GoogleWorkspaceConnectorState | undefined, adapter: GoogleWorkspaceConnectorAdapterKind): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: "google.calendar",
    label: "Google Calendar",
    description: "Read calendar schedules, inspect free-busy windows, and create or update events through a connected Google account.",
    auth: { type: adapter === "gws" ? "oauth2" : "oauth2_pkce", status: state?.status ?? "not_configured", providerId: googleProviderId(adapter) },
    accounts: state?.accounts ?? [],
    scopes: [
      scope("calendar.readonly", "Calendar read", "Read Google Calendar calendars, events, and free-busy data.", true),
      scope("calendar.events", "Calendar write", "Create, update, and delete Google Calendar events.", true),
    ],
    operations: filterOperations(adapter, "google.calendar", [
      op(
        "listCalendars",
        "List calendars",
        "List available calendars.",
        ["calendar.readonly"],
        "read_personal_data",
        googleCalendarListCalendarsInputSchema(),
        googleCalendarListCalendarsOutputSchema(),
        { itemsPath: "items", nextPageTokenPath: "nextPageToken", pageTokenInputPath: "pageToken", pageSizeInputPath: "maxResults", defaultPageSize: 100, maxPageSize: 250 },
      ),
      op(
        "listEvents",
        "List events",
        "List events within an explicit time window. Include timeMin, timeMax, and timeZone for agenda or transcript discovery workflows.",
        ["calendar.readonly"],
        "read_personal_data",
        googleCalendarListEventsInputSchema(),
        googleCalendarListEventsOutputSchema(),
        { itemsPath: "items", nextPageTokenPath: "nextPageToken", pageTokenInputPath: "pageToken", pageSizeInputPath: "maxResults", defaultPageSize: 100, maxPageSize: 2500 },
      ),
      op("readEvent", "Read event", "Read a single calendar event.", ["calendar.readonly"], "read_personal_data", googleCalendarReadEventInputSchema(), googleCalendarReadEventOutputSchema()),
      op("freeBusy", "Free-busy", "Read busy windows for selected calendars.", ["calendar.readonly"], "read_personal_data", googleCalendarFreeBusyInputSchema()),
      op("createEvent", "Create event", "Create a calendar event after Desktop approval.", ["calendar.events"], "write_external"),
      op("updateEvent", "Update event", "Update a calendar event after Desktop approval.", ["calendar.events"], "write_external"),
      op("deleteEvent", "Delete event", "Delete a calendar event after Desktop approval.", ["calendar.events"], "write_external"),
    ]),
    rateLimit: { requestsPerMinute: 60, burst: 10 },
    sync: { cursorKind: "timestamp", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Calendar descriptions and attendee lists are personal data and should be summarized in audit records."],
  });
}

function googleDriveConnectorDescriptor(state: GoogleWorkspaceConnectorState | undefined, adapter: GoogleWorkspaceConnectorAdapterKind): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: "google.drive",
    label: "Google Drive",
    description: "Search, read, create, update, copy, trash, and share Drive files through a connected Google account.",
    auth: { type: adapter === "gws" ? "oauth2" : "oauth2_pkce", status: state?.status ?? "not_configured", providerId: googleProviderId(adapter) },
    accounts: state?.accounts ?? [],
    scopes: [
      scope("drive.readonly", "Drive read", "Read Google Drive file metadata and content.", true),
      scope("drive.file", "Drive write", "Create, update, copy, trash, and share files available to Ambient.", true),
    ],
    operations: filterOperations(adapter, "google.drive", [
      op(
        "search",
        "Search Drive",
        "Search Drive files and shared drives. Use query/q, pageSize, pageToken, and fields for paginated file discovery.",
        ["drive.readonly"],
        "read_personal_data",
        googleDriveSearchInputSchema(),
        googleDriveSearchOutputSchema(),
        { itemsPath: "files", nextPageTokenPath: "nextPageToken", pageTokenInputPath: "pageToken", pageSizeInputPath: "pageSize", defaultPageSize: 100, maxPageSize: 1000 },
      ),
      op("readFile", "Read file", "Read file metadata and supported text content.", ["drive.readonly"], "read_personal_data", googleDriveReadFileInputSchema(), googleDriveReadFileOutputSchema()),
      op(
        "listSharedDrives",
        "List shared drives",
        "List shared drives available to the account.",
        ["drive.readonly"],
        "read_personal_data",
        googleDriveListSharedDrivesInputSchema(),
        googleDriveListSharedDrivesOutputSchema(),
        { itemsPath: "drives", nextPageTokenPath: "nextPageToken", pageTokenInputPath: "pageToken", pageSizeInputPath: "pageSize", defaultPageSize: 50, maxPageSize: 100 },
      ),
      op("createFile", "Create file", "Create or upload a Drive file after Desktop approval.", ["drive.file"], "write_external"),
      op("createFolder", "Create folder", "Create a Drive folder after Desktop approval.", ["drive.file"], "write_external"),
      op("updateFile", "Update file", "Update Drive file metadata, content, or parent after Desktop approval.", ["drive.file"], "write_external"),
      op("copyFile", "Copy file", "Copy a Drive file after Desktop approval.", ["drive.file"], "write_external"),
      op("trashFile", "Trash file", "Move a Drive file to trash after Desktop approval.", ["drive.file"], "write_external"),
      op("listPermissions", "List permissions", "List sharing permissions for a Drive file.", ["drive.readonly"], "read_personal_data"),
      op("createPermission", "Share file", "Create a Drive sharing permission after Desktop approval.", ["drive.file"], "write_external"),
      op("updatePermission", "Update sharing", "Update a Drive sharing permission after Desktop approval.", ["drive.file"], "write_external"),
      op("deletePermission", "Remove sharing", "Delete a Drive sharing permission after Desktop approval.", ["drive.file"], "write_external"),
    ]),
    rateLimit: { requestsPerMinute: 60, burst: 10 },
    sync: { cursorKind: "opaque", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: [
      "Drive content should be truncated before transcript insertion.",
      "Large or binary content should require explicit follow-up operations.",
    ],
  });
}

function scope(id: string, label: string, description: string, personalData: boolean) {
  return { id, label, description, personalData };
}

function op(
  name: string,
  label: string,
  description: string,
  requiredScopes: string[],
  sideEffects: "none" | "read_personal_data" | "write_external",
  inputSchema: unknown = { type: "object", additionalProperties: true },
  outputSchema: unknown = { type: "object", additionalProperties: true },
  pagination?: WorkflowConnectorPaginationDescriptor,
) {
  return {
    name,
    label,
    description,
    inputSchema,
    outputSchema,
    requiredScopes,
    sideEffects,
    supportsDryRun: sideEffects !== "read_personal_data",
    idempotencyKey: sideEffects === "write_external" ? "recommended" as const : "not-supported" as const,
    mutationPolicy: sideEffects === "write_external" ? "apply_after_approval" as const : "unsupported" as const,
    ...(pagination ? { pagination } : {}),
    defaultTimeoutMs: 30_000,
  };
}

function googleProviderId(adapter: GoogleWorkspaceConnectorAdapterKind): string {
  return adapter === "gws" ? GWS_PROVIDER_ID : GOOGLE_PROVIDER_ID;
}

function filterOperations(
  adapter: GoogleWorkspaceConnectorAdapterKind,
  connectorId: string,
  operations: ReturnType<typeof op>[],
): ReturnType<typeof op>[] {
  if (adapter !== "gws") return operations;
  const supported = {
    "google.gmail": new Set(["search", "readThread", "listLabels", "createDraft", "updateDraft", "deleteDraft"]),
    "google.calendar": new Set(["listCalendars", "listEvents", "readEvent", "freeBusy"]),
    "google.drive": new Set(["search", "readFile", "listSharedDrives"]),
  }[connectorId];
  return supported ? operations.filter((operation) => supported.has(operation.name)) : operations;
}

function googleWorkspaceApprovalPreviewers(connectorId: string): Record<string, WorkflowConnectorApprovalPreviewer> | undefined {
  if (connectorId !== "google.gmail") return undefined;
  return {
    createDraft: gmailDraftApprovalPreview("createDraft"),
    updateDraft: gmailDraftApprovalPreview("updateDraft"),
    deleteDraft: gmailDraftApprovalPreview("deleteDraft"),
  };
}

function gmailDraftApprovalPreview(action: "createDraft" | "updateDraft" | "deleteDraft"): WorkflowConnectorApprovalPreviewer {
  return (call) => {
    const input = objectInput(call.input);
    const draftId = optionalString(input.draftId ?? input.id);
    if (action === "deleteDraft") {
      return {
        service: "gmail",
        action,
        accountId: call.accountId,
        objectIds: draftId ? { draftId } : undefined,
        summary: `Permanently delete Gmail draft ${draftId ?? "(missing draft id)"}.`,
        diff: ["Draft content will be removed from Gmail.", "No message will be sent."],
        sendsExternalCommunication: false,
      };
    }
    const summary = gmailDraftInputSummary(input);
    return {
      service: "gmail",
      action,
      accountId: call.accountId,
      objectIds: draftId ? { draftId } : undefined,
      summary: action === "createDraft" ? "Create a Gmail draft without sending it." : `Replace Gmail draft ${draftId ?? "(missing draft id)"}.`,
      diff: summary,
      sendsExternalCommunication: false,
    };
  };
}

function gmailDraftInputSummary(input: Record<string, unknown>): string[] {
  if (optionalString(input.raw)) return ["Message is provided as raw RFC 2822 content.", "No message will be sent."];
  return [
    `Recipients: to=${countRecipients(input.to)}, cc=${countRecipients(input.cc)}, bcc=${countRecipients(input.bcc)}.`,
    optionalString(input.subject) ? `Subject will be set (${optionalString(input.subject)!.length} characters).` : "Subject is not set.",
    `Body: text=${textLength(input.textBody ?? input.body)} characters, html=${textLength(input.htmlBody)} characters.`,
    "No message will be sent.",
  ];
}

function gmailDraftMessageInputSchema() {
  return {
    type: "object",
    properties: {
      raw: { type: "string" },
      to: { type: ["string", "array"] },
      cc: { type: ["string", "array"] },
      bcc: { type: ["string", "array"] },
      from: { type: ["string", "array"] },
      replyTo: { type: ["string", "array"] },
      subject: { type: "string" },
      textBody: { type: "string" },
      htmlBody: { type: "string" },
      body: { type: "string" },
    },
    additionalProperties: false,
  };
}

function gmailSearchInputSchema() {
  return {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional Gmail search query. Use an empty string or omit for most recent messages." },
      maxResults: { type: "number", description: "Maximum messages to return. Use 100 for 'last 100 emails'." },
      pageToken: { type: "string", description: "Optional Gmail page token for pagination." },
    },
    additionalProperties: false,
  };
}

function gmailSearchOutputSchema() {
  return {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            threadId: { type: "string" },
            snippet: { type: "string" },
            internalDate: { type: "string" },
            labelIds: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
      },
      threads: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            threadId: { type: "string" },
            messageIds: { type: "array", items: { type: "string" } },
            snippet: { type: "string" },
          },
          additionalProperties: true,
        },
      },
      resultSizeEstimate: {
        type: "number",
        description: "Approximate number of Gmail search results reported by the provider, when available.",
      },
      nextPageToken: { type: ["string", "null"] },
    },
    additionalProperties: true,
  };
}

function gmailReadThreadInputSchema() {
  return {
    type: "object",
    properties: {
      threadId: { type: "string", description: "Gmail thread id returned by search." },
      id: { type: "string", description: "Alias for threadId when a connector result uses id." },
      format: { type: "string", description: "Gmail thread format. Defaults to full." },
    },
    additionalProperties: false,
  };
}

function gmailReadThreadOutputSchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      threadId: { type: "string" },
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            threadId: { type: "string" },
            snippet: { type: "string" },
            from: { type: "string" },
            subject: { type: "string" },
            date: { type: "string" },
            bodyPreview: { type: "string" },
            attachments: { type: "array", items: { type: "object", additionalProperties: true } },
          },
          additionalProperties: true,
        },
      },
      snippet: { type: "string" },
    },
    additionalProperties: true,
  };
}

function gmailReadAttachmentInputSchema() {
  return {
    type: "object",
    properties: {
      messageId: { type: "string", description: "Gmail message id containing the attachment." },
      attachmentId: { type: "string", description: "Gmail attachment id." },
    },
    required: ["messageId", "attachmentId"],
    additionalProperties: false,
  };
}

function gmailListLabelsInputSchema() {
  return { type: "object", properties: {}, additionalProperties: false };
}

function gmailDraftUpdateInputSchema() {
  const schema = gmailDraftMessageInputSchema() as { properties: Record<string, unknown>; additionalProperties: boolean; type: string };
  return {
    ...schema,
    properties: {
      ...schema.properties,
      draftId: { type: "string" },
      id: { type: "string" },
    },
  };
}

function gmailDraftDeleteInputSchema() {
  return {
    type: "object",
    properties: {
      draftId: { type: "string" },
      id: { type: "string" },
    },
    additionalProperties: false,
  };
}

function googleCalendarListCalendarsInputSchema() {
  return {
    type: "object",
    properties: {
      maxResults: { type: "number", description: "Maximum calendars to return for this page." },
      pageToken: { type: "string", description: "Optional Calendar page token for pagination." },
    },
    additionalProperties: false,
  };
}

function googleCalendarListCalendarsOutputSchema() {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: calendarListEntrySchema() },
      calendars: { type: "array", items: calendarListEntrySchema() },
      nextPageToken: { type: ["string", "null"] },
    },
    additionalProperties: true,
  };
}

function googleCalendarListEventsInputSchema() {
  return {
    type: "object",
    properties: {
      calendarId: { type: "string", description: "Calendar id. Defaults to primary when omitted." },
      timeMin: { type: "string", description: "Inclusive RFC3339 lower bound for events." },
      timeMax: { type: "string", description: "Exclusive RFC3339 upper bound for events." },
      timeZone: { type: "string", description: "IANA timezone for interpreting date/time fields." },
      maxResults: { type: "number", description: "Maximum events to return for this page." },
      singleEvents: { type: "boolean", description: "Expand recurring events into individual occurrences." },
      orderBy: { type: "string", description: "Calendar ordering, commonly startTime when singleEvents is true." },
      pageToken: { type: "string", description: "Optional Calendar page token for pagination." },
      fields: { type: "string", description: "Partial response fields; include nextPageToken and items(...) for pagination." },
    },
    required: ["timeMin", "timeMax", "timeZone"],
    additionalProperties: false,
  };
}

function googleCalendarListEventsOutputSchema() {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: calendarEventSummarySchema() },
      events: { type: "array", items: calendarEventSummarySchema() },
      nextPageToken: { type: ["string", "null"] },
      summary: { type: "string" },
      timeZone: { type: "string" },
    },
    additionalProperties: true,
  };
}

function googleCalendarReadEventInputSchema() {
  return {
    type: "object",
    properties: {
      calendarId: { type: "string", description: "Calendar id. Defaults to primary when omitted." },
      eventId: { type: "string", description: "Calendar event id." },
      id: { type: "string", description: "Alias for eventId." },
      fields: { type: "string", description: "Partial response fields for event metadata." },
    },
    additionalProperties: false,
  };
}

function googleCalendarReadEventOutputSchema() {
  return {
    type: "object",
    properties: calendarEventSummarySchema().properties,
    additionalProperties: true,
  };
}

function googleCalendarFreeBusyInputSchema() {
  return {
    type: "object",
    properties: {
      timeMin: { type: "string" },
      timeMax: { type: "string" },
      items: { type: "array", items: { type: "object", additionalProperties: true } },
      calendarIds: { type: "array", items: { type: "string" } },
    },
    required: ["timeMin", "timeMax"],
    additionalProperties: false,
  };
}

function calendarListEntrySchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      summary: { type: "string" },
      primary: { type: "boolean" },
      accessRole: { type: "string" },
      timeZone: { type: "string" },
    },
    additionalProperties: true,
  };
}

function calendarEventSummarySchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      summary: { type: "string" },
      description: { type: "string" },
      htmlLink: { type: "string" },
      start: { type: "object", additionalProperties: true },
      end: { type: "object", additionalProperties: true },
      attendees: { type: "array", items: { type: "object", additionalProperties: true } },
      attachments: { type: "array", items: { type: "object", additionalProperties: true } },
      conferenceData: { type: "object", additionalProperties: true },
    },
    additionalProperties: true,
  };
}

function googleDriveSearchInputSchema() {
  return {
    type: "object",
    properties: {
      query: { type: "string", description: "Drive files.list query. Alias: q." },
      q: { type: "string", description: "Drive files.list query." },
      pageSize: { type: "number", description: "Maximum files to return for this page." },
      max: { type: "number", description: "Alias for pageSize." },
      pageToken: { type: "string", description: "Optional Drive page token for pagination." },
      fields: { type: "string", description: "Partial response fields; include nextPageToken and files(...) for pagination." },
      includeItemsFromAllDrives: { type: "boolean" },
      supportsAllDrives: { type: "boolean" },
    },
    additionalProperties: false,
  };
}

function googleDriveSearchOutputSchema() {
  return {
    type: "object",
    properties: {
      files: { type: "array", items: driveFileSummarySchema() },
      items: { type: "array", items: driveFileSummarySchema() },
      nextPageToken: { type: ["string", "null"] },
      incompleteSearch: { type: "boolean" },
    },
    additionalProperties: true,
  };
}

function googleDriveReadFileInputSchema() {
  return {
    type: "object",
    properties: {
      fileId: { type: "string", description: "Drive file id." },
      id: { type: "string", description: "Alias for fileId." },
      fields: { type: "string", description: "Partial response fields for metadata/content provenance." },
      exportMimeType: { type: "string", description: "Optional Google Workspace export MIME type, for example text/plain for Docs transcript content." },
      maxContentChars: { type: "number", description: "Maximum exported text characters to retain in workflow context before truncation. Default and maximum: 20000." },
      supportsAllDrives: { type: "boolean" },
    },
    additionalProperties: false,
  };
}

function googleDriveReadFileOutputSchema() {
  return {
    type: "object",
    properties: {
      ...driveFileSummarySchema().properties,
      text: { type: "string", description: "Supported extracted or exported plain text content when available." },
      content: { type: "string", description: "Alias for supported extracted or exported plain text content when available." },
      contentText: { type: "string", description: "Alias for supported extracted or exported plain text content when available." },
      truncated: { type: "boolean", description: "Whether returned content was truncated before entering workflow context." },
    },
    additionalProperties: true,
  };
}

function googleDriveListSharedDrivesInputSchema() {
  return {
    type: "object",
    properties: {
      pageSize: { type: "number", description: "Maximum shared drives to return for this page." },
      max: { type: "number", description: "Alias for pageSize." },
      pageToken: { type: "string", description: "Optional Drive page token for pagination." },
    },
    additionalProperties: false,
  };
}

function googleDriveListSharedDrivesOutputSchema() {
  return {
    type: "object",
    properties: {
      drives: { type: "array", items: driveSharedDriveSummarySchema() },
      items: { type: "array", items: driveSharedDriveSummarySchema() },
      nextPageToken: { type: ["string", "null"] },
    },
    additionalProperties: true,
  };
}

function driveFileSummarySchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      mimeType: { type: "string" },
      webViewLink: { type: "string" },
      modifiedTime: { type: "string" },
      size: { type: "string" },
      owners: { type: "array", items: { type: "object", additionalProperties: true } },
      description: { type: "string" },
    },
    additionalProperties: true,
  };
}

function driveSharedDriveSummarySchema() {
  return {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      kind: { type: "string" },
      hidden: { type: "boolean" },
    },
    additionalProperties: true,
  };
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function boundedContentChars(value: unknown): number {
  const requested = optionalPositiveInteger(value);
  if (!requested) return 20_000;
  return Math.min(Math.max(requested, 500), 20_000);
}

function truncateText(value: string, maxChars: number): string {
  const suffix = "...[truncated]";
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

function countRecipients(value: unknown): number {
  if (typeof value === "string" && value.trim()) return 1;
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => typeof item === "string" && item.trim()).length;
}

function textLength(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}
