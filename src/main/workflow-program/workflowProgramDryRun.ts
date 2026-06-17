import { AsyncLocalStorage } from "node:async_hooks";
import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import type { WorkflowCompilerOutput } from "../workflow-compiler/workflowCompiler";
import { connectorOperationDescriptor, type WorkflowProgramDiagnostic } from "./workflowProgramCapabilityResolver";
import type { WorkflowProgramLoweredOperationPlan } from "./workflowProgramLowering";
import { validateWorkflowProgramJsonSchemaValue, workflowProgramSchemaObjectKeys } from "./workflowProgramTypecheck";
import type { WorkflowConnectorDescriptor, WorkflowConnectorOperationDescriptor } from "../workflow/workflowConnectors";

export interface WorkflowProgramDryRunCall {
  kind: "tool" | "connector" | "model" | "checkpoint" | "step" | "document" | "mutation" | "review" | "approval" | "emit";
  name: string;
  nodeId?: string;
  input?: unknown;
}

export interface WorkflowProgramDryRunResult {
  calls: WorkflowProgramDryRunCall[];
  componentOutputs?: unknown;
}

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
  const workflow = {
    step: async (name: string, optionsOrFn: unknown, maybeFn?: () => unknown) => {
      const options = typeof optionsOrFn === "function" ? undefined : (optionsOrFn as { nodeId?: string } | undefined);
      const fn = typeof optionsOrFn === "function" ? (optionsOrFn as () => unknown) : maybeFn;
      calls.push({ kind: "step", name, nodeId: options?.nodeId, input: options });
      return await nodeContext.run({ nodeId: options?.nodeId ?? currentNodeId() }, async () => await fn?.());
    },
    resumePoint: async (name: string, fn: () => unknown) => {
      calls.push({ kind: "step", name });
      return await fn();
    },
    batch: async <T, R>(items: T[], options: { name?: string; maxConcurrency?: number; nodeId?: string }, fn: (item: T, index: number) => Promise<R> | R): Promise<R[]> => {
      calls.push({ kind: "step", name: options.name ?? "batch", nodeId: options.nodeId, input: { total: items.length, maxConcurrency: options.maxConcurrency } });
      return Promise.all(items.map((item, index) => fn(item, index)));
    },
    paginateTool: async (
      options: {
        name?: string;
        nodeId?: string;
        input?: Record<string, unknown>;
        pageQueries?: unknown[];
        queryInputPath?: string;
        pageSize?: number;
        maxItems: number;
        maxPages: number;
        itemsPath?: string;
        nextPageTokenPath?: string;
        pageTokenInputPath?: string;
        pageSizeInputPath?: string;
        dedupeKeyPath?: string;
      },
      fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
    ) => {
      calls.push({ kind: "step", name: options.name ?? "paginate tool", nodeId: options.nodeId, input: { maxItems: options.maxItems, maxPages: options.maxPages, pageSize: options.pageSize } });
      const items: unknown[] = [];
      const pages: unknown[] = [];
      const seen = new Set<string>();
      const pageQueries = (options.pageQueries ?? []).filter((query): query is string => typeof query === "string" && query.trim().length > 0);
      let nextPageToken: string | undefined;
      for (let pageIndex = 0; pageIndex < options.maxPages && items.length < options.maxItems; pageIndex += 1) {
        const pageQuery = pageQueries[pageIndex];
        if (pageIndex > 0 && !nextPageToken && pageQuery === undefined) break;
        const pageInput = JSON.parse(JSON.stringify(options.input ?? {})) as Record<string, unknown>;
        if (options.pageSize !== undefined && options.pageSizeInputPath) setPath(pageInput, options.pageSizeInputPath, options.pageSize);
        if (pageQuery !== undefined) setPath(pageInput, options.queryInputPath ?? "query", pageQuery);
        if (nextPageToken) setPath(pageInput, options.pageTokenInputPath ?? "pageToken", nextPageToken);
        const page = await fetchPage(pageInput, pageIndex);
        pages.push(page);
        const pageItems = readPath(page, options.itemsPath ?? "items");
        if (!Array.isArray(pageItems)) throw new Error(`Paginated tool dry-run page ${pageIndex + 1} did not return array at ${options.itemsPath ?? "items"}.`);
        for (const item of pageItems) {
          if (items.length >= options.maxItems) break;
          const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
          if (dedupeKey !== undefined && dedupeKey !== null) {
            const key = String(dedupeKey);
            if (seen.has(key)) continue;
            seen.add(key);
          }
          items.push(item);
        }
        const rawNextPageToken = options.nextPageTokenPath ? readPath(page, options.nextPageTokenPath) : undefined;
        nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      }
      return {
        items,
        pages,
        count: items.length,
        pageCount: pages.length,
        truncated: items.length >= options.maxItems || Boolean(nextPageToken && pages.length >= options.maxPages),
        ...(nextPageToken ? { nextPageToken } : {}),
        maxItems: options.maxItems,
        maxPages: options.maxPages,
        ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
      };
    },
    paginateConnector: async (
      options: {
        name?: string;
        nodeId?: string;
        input?: Record<string, unknown>;
        pageSize?: number;
        maxItems: number;
        maxPages: number;
        itemsPath?: string;
        nextPageTokenPath?: string;
        pageTokenInputPath?: string;
        pageSizeInputPath?: string;
        dedupeKeyPath?: string;
      },
      fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
    ) => {
      calls.push({ kind: "step", name: options.name ?? "paginate", nodeId: options.nodeId, input: { maxItems: options.maxItems, maxPages: options.maxPages, pageSize: options.pageSize } });
      const items: unknown[] = [];
      const pages: unknown[] = [];
      const seen = new Set<string>();
      let nextPageToken: string | undefined;
      for (let pageIndex = 0; pageIndex < options.maxPages && items.length < options.maxItems; pageIndex += 1) {
        if (pageIndex > 0 && !nextPageToken) break;
        const pageInput = JSON.parse(JSON.stringify(options.input ?? {})) as Record<string, unknown>;
        if (options.pageSize !== undefined && options.pageSizeInputPath) setPath(pageInput, options.pageSizeInputPath, options.pageSize);
        if (nextPageToken) setPath(pageInput, options.pageTokenInputPath ?? "pageToken", nextPageToken);
        const page = await fetchPage(pageInput, pageIndex);
        pages.push(page);
        const pageItems = readPath(page, options.itemsPath ?? "items");
        if (!Array.isArray(pageItems)) throw new Error(`Paginated connector dry-run page ${pageIndex + 1} did not return array at ${options.itemsPath ?? "items"}.`);
        for (const item of pageItems) {
          if (items.length >= options.maxItems) break;
          const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
          if (dedupeKey !== undefined && dedupeKey !== null) {
            const key = String(dedupeKey);
            if (seen.has(key)) continue;
            seen.add(key);
          }
          items.push(item);
        }
        const rawNextPageToken = readPath(page, options.nextPageTokenPath ?? "nextPageToken");
        nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      }
      return {
        items,
        pages,
        count: items.length,
        pageCount: pages.length,
        truncated: items.length >= options.maxItems || Boolean(nextPageToken && pages.length >= options.maxPages),
        ...(nextPageToken ? { nextPageToken } : {}),
        maxItems: options.maxItems,
        maxPages: options.maxPages,
        ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
      };
    },
    mapCollection: async <T, R>(
      items: T[],
      options: { name?: string; nodeId?: string; maxItems: number },
      mapItem: (item: T, index: number) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.mapCollection dry-run items must be an array.");
      calls.push({ kind: "step", name: options.name ?? "map collection", nodeId: options.nodeId, input: { maxItems: options.maxItems, sourceCount: items.length } });
      const selected = items.slice(0, options.maxItems);
      const mapped = await Promise.all(selected.map((item, index) => mapItem(item, index)));
      return { items: mapped, count: mapped.length, sourceCount: items.length, truncated: items.length > options.maxItems, maxItems: options.maxItems };
    },
    dedupeCollection: async (
      items: unknown[],
      options: { name?: string; nodeId?: string; keyPath?: string; strategy?: "exact" | "url_canonical"; maxItems: number },
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.dedupeCollection dry-run items must be an array.");
      const strategy = options.strategy ?? "url_canonical";
      calls.push({ kind: "step", name: options.name ?? "dedupe collection", nodeId: options.nodeId, input: { maxItems: options.maxItems, keyPath: options.keyPath, strategy, sourceCount: items.length } });
      const retained: unknown[] = [];
      const seen = new Set<string>();
      let duplicateCount = 0;
      let uniqueCount = 0;
      for (const [index, item] of items.entries()) {
        const key = dryRunCollectionDedupeKey(item, { keyPath: options.keyPath, strategy }, index);
        if (seen.has(key)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(key);
        uniqueCount += 1;
        if (retained.length < options.maxItems) retained.push(item);
      }
      return {
        items: retained,
        count: retained.length,
        sourceCount: items.length,
        duplicateCount,
        truncated: uniqueCount > options.maxItems,
        maxItems: options.maxItems,
        ...(options.keyPath ? { keyPath: options.keyPath } : {}),
        strategy,
      };
    },
    chunkCollection: async (
      items: unknown[],
      options: { name?: string; nodeId?: string; chunkSize: number; maxChunks: number },
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.chunkCollection dry-run items must be an array.");
      calls.push({ kind: "step", name: options.name ?? "chunk collection", nodeId: options.nodeId, input: { chunkSize: options.chunkSize, maxChunks: options.maxChunks, sourceCount: items.length } });
      const maxItems = options.chunkSize * options.maxChunks;
      const selected = items.slice(0, maxItems);
      const chunks = [];
      for (let start = 0; start < selected.length && chunks.length < options.maxChunks; start += options.chunkSize) {
        const chunkItems = selected.slice(start, start + options.chunkSize);
        chunks.push({ id: `${options.nodeId ?? "chunk"}-${chunks.length + 1}`, index: chunks.length, start, end: start + chunkItems.length, count: chunkItems.length, items: chunkItems });
      }
      return { chunks, count: chunks.length, itemCount: selected.length, sourceCount: items.length, truncated: items.length > maxItems, chunkSize: options.chunkSize, maxChunks: options.maxChunks };
    },
    renderDocument: async (input: unknown, options: { name?: string; nodeId?: string; title?: unknown; format?: "markdown" | "html" | "pdf"; path?: string }) => {
      const format = options.format ?? "markdown";
      const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : options.name ?? "Workflow Report";
      const extension = format === "markdown" ? "md" : format;
      const path = options.path ?? `reports/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workflow-report"}.${extension}`;
      const body =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && !Array.isArray(input) && typeof (input as Record<string, unknown>).content === "string"
            ? String((input as Record<string, unknown>).content)
            : JSON.stringify(input ?? {}, null, 2);
      const markdown = body.trim().startsWith("#") ? `${body.trim()}\n` : `# ${title}\n\n${body.trim()}\n`;
      const content = format === "markdown" ? markdown : format === "html" ? `<!doctype html>\n<title>${title}</title>\n<pre>${markdown}</pre>\n` : `%PDF-1.4\n% mock dry-run PDF for ${title}\n`;
      calls.push({ kind: "document", name: options.name ?? "render document", nodeId: options.nodeId, input: { format, path } });
      return {
        title,
        format,
        mimeType: format === "pdf" ? "application/pdf" : format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
        artifactPath: path,
        path,
        content,
        bytes: content.length,
        sourceChars: body.length,
        truncated: false,
      };
    },
    mapModel: async <T, R>(
      items: T[],
      options: { name?: string; nodeId?: string; maxItems: number; maxConcurrency?: number },
      mapItem: (item: T, index: number) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.mapModel dry-run items must be an array.");
      calls.push({ kind: "step", name: options.name ?? "map model", nodeId: options.nodeId, input: { maxItems: options.maxItems, maxConcurrency: options.maxConcurrency, sourceCount: items.length } });
      const selected = items.slice(0, options.maxItems);
      const mapped = await Promise.all(selected.map(async (item, index) => ({ item, result: await mapItem(item, index), index })));
      return {
        items: mapped,
        results: mapped.map((item) => item.result),
        count: mapped.length,
        sourceCount: items.length,
        truncated: items.length > options.maxItems,
        maxItems: options.maxItems,
        maxConcurrency: options.maxConcurrency ?? 1,
      };
    },
    reduceModel: async <R>(
      items: unknown[],
      options: { name?: string; nodeId?: string; maxInputItems: number; strategy?: "single_pass" | "tree"; maxFanIn?: number; maxLevels?: number },
      reduceItems: (
        items: unknown[],
        context: {
          sourceCount: number;
          selectedCount: number;
          truncated: boolean;
          strategy: "single_pass" | "tree";
          level?: number;
          groupIndex?: number;
          groupCount?: number;
          maxFanIn?: number;
          maxLevels?: number;
          final?: boolean;
          inputCount?: number;
          outputCount?: number;
          modelCallIndex?: number;
        },
      ) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.reduceModel dry-run items must be an array.");
      calls.push({
        kind: "step",
        name: options.name ?? "reduce model",
        nodeId: options.nodeId,
        input: { maxInputItems: options.maxInputItems, strategy: options.strategy, maxFanIn: options.maxFanIn, maxLevels: options.maxLevels, sourceCount: items.length },
      });
      const selected = items.slice(0, options.maxInputItems);
      const strategy = options.strategy ?? "single_pass";
      const baseContext = { sourceCount: items.length, selectedCount: selected.length, truncated: items.length > options.maxInputItems, strategy };
      if (strategy !== "tree") return reduceItems(selected, baseContext);
      const maxFanIn = normalizeDryRunTreeFanIn(options.maxFanIn);
      const maxLevels = normalizeDryRunTreeLevels(options.maxLevels);
      let current: unknown[] = selected;
      let level = 0;
      let modelCallIndex = 0;
      while (current.length > maxFanIn) {
        if (level >= maxLevels) {
          throw new Error(`workflow.reduceModel dry-run tree strategy could not reduce ${current.length} items within maxLevels ${maxLevels} using maxFanIn ${maxFanIn}.`);
        }
        const groups = chunkDryRunItems(current, maxFanIn);
        current = await Promise.all(
          groups.map((group, groupIndex) =>
            reduceItems(group, {
              ...baseContext,
              selectedCount: group.length,
              level,
              groupIndex,
              groupCount: groups.length,
              maxFanIn,
              maxLevels,
              final: false,
              inputCount: current.length,
              outputCount: groups.length,
              modelCallIndex: modelCallIndex++,
            }),
          ),
        );
        level += 1;
      }
      return reduceItems(current, {
        ...baseContext,
        selectedCount: current.length,
        level,
        groupIndex: 0,
        groupCount: 1,
        maxFanIn,
        maxLevels,
        final: true,
        inputCount: current.length,
        outputCount: 1,
        modelCallIndex,
      });
    },
    checkpoint: async (name: string, value: unknown) => {
      calls.push({ kind: "checkpoint", name, input: value });
      return value;
    },
    stageMutation: async (changeSet: unknown, apply: () => unknown, metadata?: { nodeId?: string }) => {
      calls.push({ kind: "mutation", name: metadata?.nodeId ?? "mutation", nodeId: metadata?.nodeId, input: changeSet });
      return await nodeContext.run({ nodeId: metadata?.nodeId ?? currentNodeId() }, async () => await apply());
    },
    askUser: async (prompt: string, options?: unknown, metadata?: { nodeId?: string }) => {
      if (!prompt.trim()) throw new Error("workflow.askUser prompt is required.");
      calls.push({ kind: "review", name: metadata?.nodeId ?? "review", nodeId: metadata?.nodeId, input: { prompt, options } });
      return { requestId: metadata?.nodeId ?? "review", choiceId: "approve", text: "Looks good, proceed" };
    },
    requireApproval: async (changeSet: unknown, metadata?: { nodeId?: string }) => {
      calls.push({ kind: "approval", name: metadata?.nodeId ?? "approval", nodeId: metadata?.nodeId, input: changeSet });
      return { id: metadata?.nodeId ?? "approval", changeSet, status: "approved" };
    },
    emit: async (event: { type?: string; componentOutputs?: unknown }) => {
      calls.push({ kind: "emit", name: event.type ?? "event", input: event });
      return event;
    },
  };
  const tools = Object.fromEntries(
    output.manifest.tools
      .filter((tool) => tool !== "ambient.responses")
      .map((tool) => [
        tool,
        async (args: unknown) => {
          const nodeId = currentNodeId();
          const descriptor = descriptorsByName.get(tool);
          if (descriptor) {
            const diagnostics = validateWorkflowProgramJsonSchemaValue(args, descriptor.inputSchema, `/nodes/${nodeIndexById.get(nodeId ?? "") ?? nodeId ?? "unknown"}/args`, nodeId);
            if (diagnostics.length > 0) throw new WorkflowProgramDryRunError(diagnostics);
          }
          return mockToolResult(tool, args, calls, nodeId);
        },
      ]),
  );
  const ambient = {
    call: async (args: { task?: string; nodeId?: string; input?: Record<string, unknown>; schema?: { parse?: (value: unknown) => unknown } }) => {
      if (!args.task) throw new Error("ambient.call missing task.");
      if (!args.input || typeof args.input !== "object" || !("outputContract" in args.input)) throw new Error("ambient.call missing input.outputContract.");
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
        throw new Error(`connectors.call references unavailable connector operation: ${args.connectorId ?? "missing"}.${args.operation ?? "missing"}`);
      }
      const diagnostics = validateWorkflowProgramJsonSchemaValue(args.input ?? {}, operation.inputSchema, `/nodes/${nodeIndexById.get(args.nodeId ?? "") ?? args.nodeId ?? "unknown"}/input`, args.nodeId);
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
      errorDiagnostic("dry_run.runtime_error", error instanceof Error ? error.message : String(error), nodeId ? `/nodes/${nodeIndexById.get(nodeId) ?? nodeId}` : "/source", nodeId),
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
  if (tool === "file_read") return { path: objectString(args, "path") ?? "mock.txt", content: "mock file content", truncated: false, kind: "text" };
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
          return { path: filename, name: filename, type: "file", depth: 0, absolutePath: `${path}/${filename}`, extension: ".png", size: 128 + imageIndex };
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
  if (tool === "file_write") return { path: objectString(args, "path") ?? "mock.txt", bytes: String(objectProperty(args, "content") ?? "").length };
  if (tool === "bash") return { command: objectString(args, "command") ?? "", stdout: "mock stdout", stderr: "", exitCode: 0 };
  if (tool === "browser_search") {
    const query = objectString(args, "query") ?? "mock browser query";
    const rawMaxResults = objectProperty(args, "maxResults");
    const maxResults = typeof rawMaxResults === "number" && Number.isFinite(rawMaxResults) ? Math.max(1, Math.min(25, Math.floor(rawMaxResults))) : 1;
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
  if (tool === "google_workspace_call") return { ok: true, methodId: objectString(args, "methodId"), files: [], events: [], handle: "mock-google-file-handle", fileHandle: "mock-google-file-handle" };
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
    const requestedMaxResults = typeof input.maxResults === "number" && Number.isFinite(input.maxResults) ? Math.max(1, Math.floor(input.maxResults)) : 1;
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
    ) result[key] = [];
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
  if (lowerKey.includes("markdown") || lowerKey.includes("content") || lowerKey.includes("report") || lowerKey.includes("summary") || lowerKey.includes("title")) {
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
  if (Array.isArray(record.type)) return record.type.filter((item): item is string => typeof item === "string").join(" ").toLowerCase();
  if ("items" in record) return "array";
  if ("properties" in record) return "object";
  if (Array.isArray(record.anyOf) || Array.isArray(record.oneOf)) return [...((record.anyOf as unknown[]) ?? []), ...((record.oneOf as unknown[]) ?? [])].map(mockModelSchemaTypeHint).join(" ");
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

function readPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => (current == null ? undefined : (current as Record<string, unknown>)[key]), value);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const nested = current[part];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function dryRunCollectionDedupeKey(
  item: unknown,
  options: { keyPath?: string; strategy: "exact" | "url_canonical" },
  index: number,
): string {
  const rawKey = options.keyPath ? readPath(item, options.keyPath) : dryRunInferredCollectionDedupeKey(item);
  if (rawKey === undefined || rawKey === null) return `index:${index}`;
  const stringKey = typeof rawKey === "string" ? rawKey.trim() : JSON.stringify(rawKey);
  if (!stringKey) return `index:${index}`;
  if (options.strategy === "exact") return `exact:${stringKey}`;
  return `url:${dryRunCanonicalUrlKey(stringKey) ?? stringKey.toLowerCase()}`;
}

function dryRunInferredCollectionDedupeKey(item: unknown): unknown {
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const record = item as Record<string, unknown>;
  for (const key of ["canonicalUrl", "url", "link", "href", "id", "key"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return JSON.stringify(record);
}

function dryRunCanonicalUrlKey(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_") || ["fbclid", "gclid", "dclid", "gbraid", "wbraid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "spm"].includes(normalized)) {
        url.searchParams.delete(key);
      }
    }
    const params = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    );
    url.search = "";
    for (const [key, paramValue] of params) url.searchParams.append(key, paramValue);
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeDryRunTreeFanIn(value: number | undefined): number {
  return Math.max(2, Math.min(64, Math.floor(value ?? 8)));
}

function normalizeDryRunTreeLevels(value: number | undefined): number {
  return Math.max(1, Math.min(12, Math.floor(value ?? 8)));
}

function chunkDryRunItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function errorDiagnostic(code: string, message: string, path: string, nodeId?: string): WorkflowProgramDiagnostic {
  return { code, severity: "error", message, path, ...(nodeId ? { nodeId } : {}) };
}
