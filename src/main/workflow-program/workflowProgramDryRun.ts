import { AsyncLocalStorage } from "node:async_hooks";
import type { DesktopToolDescriptor } from "./workflowProgramDesktopToolFacade";
import type { WorkflowCompilerOutput } from "./workflowProgramWorkflowCompilerFacade";
import { connectorOperationDescriptor, type WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";
import type { WorkflowProgramLoweredOperationPlan } from "./workflowProgramLowering";
import { validateWorkflowProgramJsonSchemaValue, workflowProgramSchemaObjectKeys } from "./workflowProgramTypecheck";
import type { WorkflowConnectorDescriptor, WorkflowConnectorOperationDescriptor } from "./workflowProgramWorkflowFacade";
import { createWorkflowProgramDryRunWorkflowRuntime } from "./workflowProgramDryRunWorkflowRuntime";
import type { WorkflowProgramDryRunCall, WorkflowProgramDryRunResult } from "./workflowProgramDryRunTypes";

export type { WorkflowProgramDryRunCall, WorkflowProgramDryRunResult } from "./workflowProgramDryRunTypes";

export class WorkflowProgramDryRunError extends Error {
  constructor(readonly diagnostics: WorkflowProgramDiagnostic[]) {
    super(diagnostics.map(formatWorkflowProgramDiagnostic).join("\n"));
    this.name = "WorkflowProgramDryRunError";
  }
}

function formatWorkflowProgramDiagnostic(diagnostic: WorkflowProgramDiagnostic): string {
  const location = [diagnostic.nodeId ? `node ${diagnostic.nodeId}` : undefined, diagnostic.path].filter(Boolean).join(" at ");
  return `${diagnostic.code}${location ? ` (${location})` : ""}: ${diagnostic.message}`;
}

const SHADOWED_DRY_RUN_GLOBALS = ["process", "require", "globalThis", "Function", "eval", "fetch", "XMLHttpRequest", "WebSocket"] as const;

export async function dryRunWorkflowProgramOutput(
  output: WorkflowCompilerOutput,
  loweredPlan: WorkflowProgramLoweredOperationPlan,
  toolDescriptors: DesktopToolDescriptor[],
  connectorDescriptors: WorkflowConnectorDescriptor[],
): Promise<WorkflowProgramDryRunResult> {
  const calls: WorkflowProgramDryRunCall[] = [];
  const run = workflowProgramRunFunction(output.source);
  const descriptorsByName = new Map(toolDescriptors.map((tool) => [tool.name, tool]));
  const connectorsById = new Map(connectorDescriptors.map((connector) => [connector.id, connector]));
  const nodeIndexById = new Map(loweredPlan.operations.map((operation, index) => [operation.nodeId, index]));
  const nodeContext = new AsyncLocalStorage<{ nodeId?: string }>();
  const currentNodeId = () => nodeContext.getStore()?.nodeId;
  const workflow = createWorkflowProgramDryRunWorkflowRuntime({ calls, nodeContext, currentNodeId });
  const tools = Object.fromEntries(
    output.manifest.tools
      .filter((tool) => tool !== "ambient.responses")
      .map((tool) => [
        tool,
        async (args: unknown) => {
          const nodeId = currentNodeId();
          const descriptor = descriptorsByName.get(tool);
          if (descriptor) {
            const diagnostics = validateWorkflowProgramJsonSchemaValue(
              args,
              descriptor.inputSchema,
              `/nodes/${nodeIndexById.get(nodeId ?? "") ?? nodeId ?? "unknown"}/args`,
              nodeId,
            );
            if (diagnostics.length > 0) throw new WorkflowProgramDryRunError(diagnostics);
          }
          return mockToolResult(tool, args, calls, nodeId);
        },
      ]),
  );
  const ambient = {
    call: async (args: {
      task?: string;
      nodeId?: string;
      input?: Record<string, unknown>;
      schema?: { parse?: (value: unknown) => unknown };
    }) => {
      if (!args.task) throw new Error("ambient.call missing task.");
      if (!args.input || typeof args.input !== "object" || !("outputContract" in args.input))
        throw new Error("ambient.call missing input.outputContract.");
      if (!args.schema?.parse) throw new Error("ambient.call missing schema.parse.");
      calls.push({ kind: "model", name: args.task, nodeId: args.nodeId, input: args.input });
      return args.schema.parse(mockModelResult(args.task, args.input.outputContract));
    },
  };
  const connectors = {
    call: async (args: { connectorId?: string; operation?: string; input?: unknown; nodeId?: string; itemKey?: string }) => {
      const descriptor = args.connectorId ? connectorsById.get(args.connectorId) : undefined;
      const operation = descriptor && args.operation ? connectorOperationDescriptor(descriptor, args.operation) : undefined;
      if (!args.connectorId || !args.operation || !descriptor || !operation) {
        throw new Error(
          `connectors.call references unavailable connector operation: ${args.connectorId ?? "missing"}.${args.operation ?? "missing"}`,
        );
      }
      const diagnostics = validateWorkflowProgramJsonSchemaValue(
        args.input ?? {},
        operation.inputSchema,
        `/nodes/${nodeIndexById.get(args.nodeId ?? "") ?? args.nodeId ?? "unknown"}/input`,
        args.nodeId,
      );
      if (diagnostics.length > 0) throw new WorkflowProgramDryRunError(diagnostics);
      calls.push({ kind: "connector", name: `${args.connectorId}.${args.operation}`, nodeId: args.nodeId, input: args });
      const loweredOperation = args.nodeId ? loweredPlan.operations.find((candidate) => candidate.nodeId === args.nodeId) : undefined;
      const outputSchemaOverride = loweredOperation?.nodeKind === "connector.call" ? loweredOperation.node.output?.schema : undefined;
      return mockConnectorResult(descriptor, operation, outputSchemaOverride, args);
    },
  };
  try {
    const componentOutputs = await run({ workflow, tools, ambient, connectors });
    return { calls, componentOutputs };
  } catch (error) {
    if (error instanceof WorkflowProgramDryRunError) throw error;
    const nodeId = currentNodeId();
    throw new WorkflowProgramDryRunError([
      errorDiagnostic(
        "dry_run.runtime_error",
        error instanceof Error ? error.message : String(error),
        nodeId ? `/nodes/${nodeIndexById.get(nodeId) ?? nodeId}` : "/source",
        nodeId,
      ),
    ]);
  }
}

function workflowProgramRunFunction(source: string): (input: unknown) => Promise<unknown> {
  if (!source.startsWith("export default async function run")) {
    throw new Error("Generated workflow source must export default async function run.");
  }
  const factory = new Function(...SHADOWED_DRY_RUN_GLOBALS, source.replace(/^export default /, "return "));
  const run = factory(...SHADOWED_DRY_RUN_GLOBALS.map(() => undefined)) as unknown;
  if (typeof run !== "function") throw new Error("Generated workflow source did not evaluate to a function.");
  return run as (input: unknown) => Promise<unknown>;
}

function mockToolResult(tool: string, args: unknown, calls: WorkflowProgramDryRunCall[], nodeId?: string): unknown {
  calls.push({ kind: "tool", name: tool, nodeId, input: args });
  if (tool === "file_read")
    return { path: objectString(args, "path") ?? "mock.txt", content: "mock file content", truncated: false, kind: "text" };
  if (tool === "long_context_process") {
    const text = objectProperty(args, "text");
    const serialized = typeof text === "string" ? text : JSON.stringify(text ?? {});
    return {
      runtime: "ambient-lambda-rlm",
      response: `mock long-context response over ${serialized.length} chars`,
      taskType: objectString(args, "taskType") ?? "general",
      composeOp: "concatenate",
      inputLength: serialized.length,
      chunkCount: 1,
      leafCount: 1,
      modelCalls: 0,
      truncated: false,
    };
  }
  if (tool === "local_directory_list") {
    const path = objectString(args, "path") ?? "~/Downloads";
    const entries = path.toLowerCase().includes("downloads")
      ? Array.from({ length: 10 }, (_, index) => {
          const imageIndex = index + 1;
          const filename = `image-${String(imageIndex).padStart(2, "0")}.png`;
          return {
            path: filename,
            name: filename,
            type: "file",
            depth: 0,
            absolutePath: `${path}/${filename}`,
            extension: ".png",
            size: 128 + imageIndex,
          };
        })
      : [{ path: "mock.txt", name: "mock.txt", type: "file", depth: 0, absolutePath: `${path}/mock.txt`, extension: ".txt", size: 128 }];
    return {
      rootPath: path,
      rootName: path.split(/[\\/]/).filter(Boolean).pop() ?? "Downloads",
      entries,
      truncated: false,
      totalKnownEntries: entries.length,
      skipped: [],
    };
  }
  if (tool === "local_file_read") {
    const path = objectString(args, "path") ?? "~/Downloads/mock.txt";
    return { path, absolutePath: path, fileUrl: `file://${path}`, content: "mock local file content", truncated: false, kind: "text" };
  }
  if (tool === "file_write")
    return { path: objectString(args, "path") ?? "mock.txt", bytes: String(objectProperty(args, "content") ?? "").length };
  if (tool === "bash") return { command: objectString(args, "command") ?? "", stdout: "mock stdout", stderr: "", exitCode: 0 };
  if (tool === "browser_search") {
    const query = objectString(args, "query") ?? "mock browser query";
    const rawMaxResults = objectProperty(args, "maxResults");
    const maxResults =
      typeof rawMaxResults === "number" && Number.isFinite(rawMaxResults) ? Math.max(1, Math.min(25, Math.floor(rawMaxResults))) : 1;
    return Array.from({ length: maxResults }, (_, index) => {
      const ordinal = index + 1;
      return {
        title: `Mock browser result ${ordinal} for ${query}`,
        url: `https://example.com/search/${encodeURIComponent(query)}/${ordinal}`,
        snippet: `mock browser search result ${ordinal} for ${query}`,
      };
    });
  }
  if (tool.startsWith("browser_")) return { ok: true, tool, results: [], url: objectString(args, "url") ?? "https://example.com" };
  if (tool === "google_workspace_call")
    return {
      ok: true,
      methodId: objectString(args, "methodId"),
      files: [],
      events: [],
      handle: "mock-google-file-handle",
      fileHandle: "mock-google-file-handle",
    };
  if (tool === "google_workspace_status") return { status: "connected", accounts: [{ accountHint: "user@example.com" }] };
  if (tool === "google_workspace_search_methods") return { methods: [] };
  if (tool === "google_workspace_materialize_file") return { path: objectString(args, "path") ?? "Google Workspace Downloads/mock.txt" };
  if (tool === "ambient_visual_minicpm_setup") return { ok: true, status: "ready", providerId: "minicpm-v-4.5-llamacpp" };
  if (tool === "ambient_visual_analyze") {
    return {
      summary: "mock MiniCPM-V visual analysis",
      observations: [],
      limitations: [],
      artifacts: { jsonPath: ".ambient/vision/mock-analysis.json" },
    };
  }
  if (tool.startsWith("ambient_cli")) return { ok: true, stdout: "mock ambient cli output", stderr: "" };
  return { ok: true };
}

function mockConnectorResult(
  descriptor: WorkflowConnectorDescriptor,
  operation: WorkflowConnectorOperationDescriptor,
  outputSchemaOverride?: unknown,
  callInput?: { input?: unknown },
): unknown {
  if (descriptor.id === "google.gmail" && operation.name === "search") {
    const input = objectInput(callInput?.input);
    const pageToken = objectString(input, "pageToken");
    const pageIndex = pageToken?.startsWith("mock-gmail-page-")
      ? Math.max(0, Number.parseInt(pageToken.slice("mock-gmail-page-".length), 10) - 1)
      : 0;
    const requestedMaxResults =
      typeof input.maxResults === "number" && Number.isFinite(input.maxResults) ? Math.max(1, Math.floor(input.maxResults)) : 1;
    const paginatedCall = typeof objectProperty(callInput, "itemKey") === "string" || pageToken !== undefined;
    const count = paginatedCall ? Math.min(requestedMaxResults, 100) : 1;
    const messages = Array.from({ length: count }, (_, index) => {
      const ordinal = pageIndex * count + index + 1;
      return { id: `mock-message-${ordinal}`, threadId: `mock-thread-${ordinal}`, snippet: `mock Gmail search result ${ordinal}` };
    });
    return {
      ok: true,
      messages,
      threads: messages.map((message) => ({ id: message.threadId, threadId: message.threadId })),
      resultSizeEstimate: 1000,
      nextPageToken: pageIndex < 9 ? `mock-gmail-page-${pageIndex + 2}` : null,
    };
  }
  if (descriptor.id === "google.gmail" && operation.name === "readThread") {
    return {
      ok: true,
      id: "mock-thread",
      threadId: "mock-thread",
      messages: [{ id: "mock-message", threadId: "mock-thread", snippet: "mock Gmail thread message" }],
      snippet: "mock Gmail thread",
    };
  }
  if (descriptor.id === "google.drive" && operation.name === "search") {
    const input = objectInput(callInput?.input);
    const pageToken = objectString(input, "pageToken");
    const pageIndex = mockPageIndex(pageToken, "mock-drive-page-");
    const requestedPageSize = mockRequestedPageSize(input, "pageSize", 100);
    const count = mockPaginatedCount(callInput, pageToken, requestedPageSize);
    const files = Array.from({ length: count }, (_, index) => {
      const ordinal = pageIndex * count + index + 1;
      return {
        id: `mock-drive-file-${ordinal}`,
        name: `Mock Drive File ${ordinal}`,
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: "2026-05-16T00:00:00.000Z",
        webViewLink: `https://drive.google.com/mock/${ordinal}`,
      };
    });
    return {
      ok: true,
      files,
      items: files,
      nextPageToken: pageIndex < 9 ? `mock-drive-page-${pageIndex + 2}` : null,
      incompleteSearch: false,
    };
  }
  if (descriptor.id === "google.drive" && operation.name === "readFile") {
    const input = objectInput(callInput?.input);
    const fileId = objectString(input, "fileId") ?? objectString(input, "id") ?? "mock-drive-file";
    const transcriptText = [
      `Mock transcript for ${fileId}.`,
      "Alex owns the Phoenix market update by Friday.",
      "Morgan will send revised Scottsdale pricing assumptions next Tuesday.",
      "Decision: use the conservative inventory baseline in the report.",
      "Open question: whether short-term rental regulation materially changes demand.",
    ].join("\n");
    return {
      ok: true,
      id: fileId,
      name: `${fileId} Meeting Transcript`,
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-05-16T00:00:00.000Z",
      webViewLink: `https://drive.google.com/mock/${encodeURIComponent(fileId)}`,
      text: transcriptText,
      content: transcriptText,
      contentText: transcriptText,
      truncated: false,
    };
  }
  if (descriptor.id === "google.drive" && operation.name === "listSharedDrives") {
    const input = objectInput(callInput?.input);
    const pageToken = objectString(input, "pageToken");
    const pageIndex = mockPageIndex(pageToken, "mock-shared-drive-page-");
    const requestedPageSize = mockRequestedPageSize(input, "pageSize", 50);
    const count = mockPaginatedCount(callInput, pageToken, requestedPageSize);
    const drives = Array.from({ length: count }, (_, index) => {
      const ordinal = pageIndex * count + index + 1;
      return { id: `mock-shared-drive-${ordinal}`, name: `Mock Shared Drive ${ordinal}` };
    });
    return {
      ok: true,
      drives,
      items: drives,
      nextPageToken: pageIndex < 9 ? `mock-shared-drive-page-${pageIndex + 2}` : null,
    };
  }
  if (descriptor.id === "google.calendar" && operation.name === "listEvents") {
    const input = objectInput(callInput?.input);
    const pageToken = objectString(input, "pageToken");
    const pageIndex = mockPageIndex(pageToken, "mock-calendar-events-page-");
    const requestedMaxResults = mockRequestedPageSize(input, "maxResults", 100);
    const count = mockPaginatedCount(callInput, pageToken, requestedMaxResults);
    const events = Array.from({ length: count }, (_, index) => {
      const ordinal = pageIndex * count + index + 1;
      return {
        id: `mock-calendar-event-${ordinal}`,
        summary: `Mock Calendar Event ${ordinal}`,
        start: { dateTime: "2026-05-16T09:00:00-07:00", timeZone: objectString(input, "timeZone") ?? "America/Phoenix" },
        end: { dateTime: "2026-05-16T09:30:00-07:00", timeZone: objectString(input, "timeZone") ?? "America/Phoenix" },
      };
    });
    return {
      ok: true,
      items: events,
      events,
      nextPageToken: pageIndex < 9 ? `mock-calendar-events-page-${pageIndex + 2}` : null,
    };
  }
  if (descriptor.id === "google.calendar" && operation.name === "listCalendars") {
    const input = objectInput(callInput?.input);
    const pageToken = objectString(input, "pageToken");
    const pageIndex = mockPageIndex(pageToken, "mock-calendar-list-page-");
    const requestedMaxResults = mockRequestedPageSize(input, "maxResults", 100);
    const count = mockPaginatedCount(callInput, pageToken, requestedMaxResults);
    const calendars = Array.from({ length: count }, (_, index) => {
      const ordinal = pageIndex * count + index + 1;
      return { id: `mock-calendar-${ordinal}`, summary: `Mock Calendar ${ordinal}`, accessRole: "reader" };
    });
    return {
      ok: true,
      items: calendars,
      calendars,
      nextPageToken: pageIndex < 9 ? `mock-calendar-list-page-${pageIndex + 2}` : null,
    };
  }
  const descriptorKeys = workflowProgramSchemaObjectKeys(operation.outputSchema);
  const overrideKeys = workflowProgramSchemaObjectKeys(outputSchemaOverride);
  const keys = descriptorKeys?.size ? new Set([...descriptorKeys, ...(overrideKeys ?? [])]) : overrideKeys;
  const result: Record<string, unknown> = { ok: true };
  for (const key of keys ?? []) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("messages")) result[key] = [{ id: "mock-message", threadId: "mock-thread" }];
    else if (lowerKey.includes("threads")) result[key] = [{ id: "mock-thread", threadId: "mock-thread" }];
    else if (
      lowerKey.includes("records") ||
      lowerKey.includes("events") ||
      lowerKey.includes("files") ||
      lowerKey.includes("labels") ||
      lowerKey.includes("attachments")
    )
      result[key] = [];
    else if (lowerKey.includes("cursor") || lowerKey.includes("pagetoken")) result[key] = null;
    else if (lowerKey.includes("count") || lowerKey.includes("total") || lowerKey.includes("estimate")) result[key] = 0;
    else if (lowerKey.includes("truncated")) result[key] = false;
    else if (lowerKey.includes("record") || lowerKey.includes("message") || lowerKey.includes("thread")) result[key] = null;
    else result[key] = `mock ${operation.name} ${key}`;
  }
  return result;
}

function mockPageIndex(pageToken: string | undefined, prefix: string): number {
  if (!pageToken?.startsWith(prefix)) return 0;
  const ordinal = Number.parseInt(pageToken.slice(prefix.length), 10);
  return Number.isFinite(ordinal) && ordinal > 1 ? ordinal - 1 : 0;
}

function mockRequestedPageSize(input: Record<string, unknown>, key: string, fallback: number): number {
  const value = objectProperty(input, key);
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function mockPaginatedCount(callInput: { input?: unknown } | undefined, pageToken: string | undefined, requestedPageSize: number): number {
  const paginatedCall = typeof objectProperty(callInput, "itemKey") === "string" || pageToken !== undefined;
  return paginatedCall ? requestedPageSize : Math.min(requestedPageSize, 1);
}

function mockModelResult(task: string, outputContract: unknown): unknown {
  const keys = workflowProgramSchemaObjectKeys(outputContract);
  if (!keys?.size) return { ok: true, summary: `mock ${task}` };
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = mockModelFieldValue(task, key, objectProperty(outputContract, key));
  return result;
}

function mockModelFieldValue(task: string, key: string, schema: unknown): unknown {
  const lowerKey = key.toLowerCase();
  const typeHint = mockModelSchemaTypeHint(schema);
  if (typeHint.includes("string")) return `mock ${key} for ${task}`;
  if (typeHint.includes("array")) return [];
  if (typeHint.includes("number")) return 0;
  if (typeHint.includes("boolean")) return false;
  if (typeHint.includes("object")) return {};
  if (lowerKey.includes("artifactpath")) return lowerKey.includes("html") ? "reports/mock.html" : "reports/mock-output.html";
  if (lowerKey.includes("html")) return `<h1>mock ${task}</h1>`;
  if (
    lowerKey.includes("markdown") ||
    lowerKey.includes("content") ||
    lowerKey.includes("report") ||
    lowerKey.includes("summary") ||
    lowerKey.includes("title")
  ) {
    return `mock ${key} for ${task}`;
  }
  if (
    lowerKey.endsWith("s") ||
    lowerKey.includes("items") ||
    lowerKey.includes("files") ||
    lowerKey.includes("sources") ||
    lowerKey.includes("highlights") ||
    lowerKey.includes("shortlist") ||
    lowerKey.includes("list") ||
    lowerKey.includes("picks") ||
    lowerKey.includes("candidates")
  ) {
    return [];
  }
  if (lowerKey.includes("count") || lowerKey.includes("bytes")) return 0;
  if (lowerKey.startsWith("is") || lowerKey.startsWith("has")) return false;
  if (lowerKey.includes("evidence")) return {};
  return `mock ${key} for ${task}`;
}

function mockModelSchemaTypeHint(schema: unknown): string {
  if (typeof schema === "string") return schema.toLowerCase();
  if (Array.isArray(schema)) return "array";
  if (!schema || typeof schema !== "object") return "";
  const record = schema as Record<string, unknown>;
  if (typeof record.type === "string") return record.type.toLowerCase();
  if (Array.isArray(record.type))
    return record.type
      .filter((item): item is string => typeof item === "string")
      .join(" ")
      .toLowerCase();
  if ("items" in record) return "array";
  if ("properties" in record) return "object";
  if (Array.isArray(record.anyOf) || Array.isArray(record.oneOf))
    return [...((record.anyOf as unknown[]) ?? []), ...((record.oneOf as unknown[]) ?? [])].map(mockModelSchemaTypeHint).join(" ");
  return "";
}

function objectProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function objectInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function objectString(value: unknown, key: string): string | undefined {
  const property = objectProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}
