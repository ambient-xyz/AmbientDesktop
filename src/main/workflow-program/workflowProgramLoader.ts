import vm from "node:vm";
import { types as utilTypes } from "node:util";
import type {
  WorkflowAmbientHandlers,
  WorkflowBatchOptions,
  WorkflowCollectionDedupeOptions,
  WorkflowCollectionMapOptions,
  WorkflowConnectorHandlers,
  WorkflowDocumentRenderOptions,
  WorkflowModelMapOptions,
  WorkflowModelReduceContext,
  WorkflowModelReduceOptions,
  WorkflowNodeMetadata,
  WorkflowPaginateConnectorOptions,
  WorkflowPaginateToolOptions,
  WorkflowProgram,
  WorkflowProgramContext,
  WorkflowRuntimePrimitives,
  WorkflowToolHandler,
  WorkflowToolHandlers,
} from "../workflowAgentRuntime";
import { stripWorkflowSourceLiteralsAndComments, validateWorkflowSourceIsolation } from "../workflowSourceValidation";

const DEFAULT_WORKFLOW_VM_SYNC_TIMEOUT_MS = 1_000;
const EXPORT_DEFAULT_RUN = /\bexport\s+default\s+(async\s+)?function\s+run\s*\(/;
const EXPORT_NAMED_RUN = /\bexport\s+(async\s+)?function\s+run\s*\(/;
const guardedGlobalNames = [
  "constructor",
  "process",
  "require",
  "module",
  "exports",
  "Buffer",
  "Function",
  "eval",
  "WebAssembly",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
];

export interface LoadWorkflowProgramOptions {
  syncTimeoutMs?: number;
}

export function loadWorkflowProgramFromSource(source: string, options: LoadWorkflowProgramOptions = {}): WorkflowProgram {
  validateWorkflowSourceIsolation(source);
  const syncTimeoutMs = workflowVmSyncTimeoutMs(options.syncTimeoutMs);
  const transformed = transformWorkflowSource(source);
  const context = vm.createContext(
    {},
    {
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate",
    },
  );
  installWorkflowVmGlobalGuards(context);
  const script = new vm.Script(`${transformed}\n;globalThis.__ambientWorkflowRun = typeof run === "function" ? run : undefined;`, {
    filename: "workflow-artifact.js",
  });
  script.runInContext(context, { timeout: syncTimeoutMs });
  const run = (context as { __ambientWorkflowRun?: unknown }).__ambientWorkflowRun;
  if (typeof run !== "function") {
    throw new Error("Workflow source must export a run function.");
  }
  return async (programContext) => {
    const asyncBoundary = createWorkflowVmAsyncBoundary();
    try {
      const result = invokeWorkflowVmFunction(
        context,
        run,
        [sandboxProgramContext(programContext, context, syncTimeoutMs, asyncBoundary)],
        {
          label: "starting workflow run",
          timeoutMs: syncTimeoutMs,
        },
      );
      const guardedResult = raceWorkflowVmResult(
        pumpWorkflowVmAfterVmCall(result, context, syncTimeoutMs, asyncBoundary),
        asyncBoundary,
      );
      if (utilTypes.isPromise(guardedResult)) await guardedResult;
    } finally {
      asyncBoundary.settle();
    }
  };
}

function installWorkflowVmGlobalGuards(context: vm.Context): void {
  (context as Record<string, unknown>).__ambientGuardedGlobalNames = guardedGlobalNames;
  new vm.Script(
    `
for (const name of globalThis.__ambientGuardedGlobalNames) {
  Object.defineProperty(globalThis, name, {
    value: undefined,
    writable: false,
    configurable: false
  });
}
delete globalThis.__ambientGuardedGlobalNames;
`,
    { filename: "workflow-artifact-guards.js" },
  ).runInContext(context, { timeout: 1_000 });
}

function sandboxProgramContext(
  programContext: WorkflowProgramContext,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowProgramContext {
  return {
    workflow: sandboxWorkflowPrimitives(programContext.workflow, vmContext, syncTimeoutMs, asyncBoundary),
    tools: sandboxHandlerRecord(programContext.tools, vmContext, syncTimeoutMs, asyncBoundary),
    ambient: sandboxHandlerRecord(programContext.ambient, vmContext, syncTimeoutMs, asyncBoundary) as WorkflowAmbientHandlers,
    connectors: sandboxHandlerRecord(programContext.connectors, vmContext, syncTimeoutMs, asyncBoundary) as WorkflowConnectorHandlers,
  };
}

function sandboxWorkflowPrimitives(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives {
  const sandboxed = hardenObject({
    step: sandboxWorkflowStep(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    batch: sandboxWorkflowBatch(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    paginateTool: sandboxWorkflowPaginateTool(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    paginateConnector: sandboxWorkflowPaginateConnector(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    mapCollection: sandboxWorkflowMapCollection(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    dedupeCollection: sandboxCallable(workflow.dedupeCollection, vmContext, syncTimeoutMs, asyncBoundary) as (
      items: unknown[],
      options: WorkflowCollectionDedupeOptions,
    ) => ReturnType<WorkflowRuntimePrimitives["dedupeCollection"]>,
    chunkCollection: sandboxCallable(workflow.chunkCollection, vmContext, syncTimeoutMs, asyncBoundary),
    renderDocument: sandboxWorkflowRenderDocument(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    mapModel: sandboxWorkflowMapModel(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    reduceModel: sandboxWorkflowReduceModel(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    checkpoint: sandboxCallable(workflow.checkpoint, vmContext, syncTimeoutMs, asyncBoundary),
    resumePoint: sandboxWorkflowResumePoint(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    askUser: sandboxCallable(workflow.askUser, vmContext, syncTimeoutMs, asyncBoundary),
    requireApproval: sandboxCallable(workflow.requireApproval, vmContext, syncTimeoutMs, asyncBoundary),
    stageMutation: sandboxWorkflowStageMutation(workflow, vmContext, syncTimeoutMs, asyncBoundary),
    skipItem: sandboxCallable(workflow.skipItem, vmContext, syncTimeoutMs, asyncBoundary),
    emit: sandboxCallable(workflow.emit, vmContext, syncTimeoutMs, asyncBoundary),
    abortSignal: workflow.abortSignal ? sandboxAbortSignal(workflow.abortSignal) : undefined,
    recovery: workflow.recovery ? hardenObject({ ...workflow.recovery }) : undefined,
  });
  return sandboxed as WorkflowRuntimePrimitives;
}

function sandboxWorkflowStep(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["step"] {
  const step = (name: string, metadataOrFn: WorkflowNodeMetadata | (() => unknown), maybeFn?: () => unknown) => {
    const fn = typeof metadataOrFn === "function" ? metadataOrFn : maybeFn;
    if (typeof fn !== "function") {
      return pumpWorkflowVmAfterHostCall(
        workflow.step(name, metadataOrFn as WorkflowNodeMetadata, maybeFn as () => unknown),
        vmContext,
        syncTimeoutMs,
        asyncBoundary,
      );
    }
    const wrapped = sandboxVmCallback(
      vmContext,
      fn,
      {
        label: `running workflow step callback "${name}"`,
        timeoutMs: syncTimeoutMs,
      },
      asyncBoundary,
    );
    const result =
      typeof metadataOrFn === "function" ? workflow.step(name, wrapped) : workflow.step(name, metadataOrFn, wrapped);
    return pumpWorkflowVmAfterHostCall(result, vmContext, syncTimeoutMs, asyncBoundary);
  };
  return hardenObject(step) as WorkflowRuntimePrimitives["step"];
}

function sandboxWorkflowBatch(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["batch"] {
  const batch = <T, R>(
    items: T[],
    options: WorkflowBatchOptions,
    fn: (item: T, index: number) => Promise<R> | R,
  ): Promise<R[]> =>
    pumpWorkflowVmAfterHostCall(
      workflow.batch(
        items,
        options,
        sandboxVmCallback(
          vmContext,
          fn,
          {
            label: `running workflow batch callback "${options.name ?? "batch"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(batch) as WorkflowRuntimePrimitives["batch"];
}

function sandboxWorkflowPaginateConnector(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["paginateConnector"] {
  const paginateConnector = (
    options: WorkflowPaginateConnectorOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ) =>
    pumpWorkflowVmAfterHostCall(
      workflow.paginateConnector(
        options,
        sandboxVmCallback(
          vmContext,
          fetchPage,
          {
            label: `running workflow pagination callback "${options.name ?? options.nodeId ?? "paginate"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(paginateConnector) as WorkflowRuntimePrimitives["paginateConnector"];
}

function sandboxWorkflowPaginateTool(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["paginateTool"] {
  const paginateTool = (
    options: WorkflowPaginateToolOptions,
    fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
  ) =>
    pumpWorkflowVmAfterHostCall(
      workflow.paginateTool(
        options,
        sandboxVmCallback(
          vmContext,
          fetchPage,
          {
            label: `running workflow tool pagination callback "${options.name ?? options.nodeId ?? "paginate tool"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(paginateTool) as WorkflowRuntimePrimitives["paginateTool"];
}

function sandboxWorkflowMapCollection(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["mapCollection"] {
  const mapCollection = <T, R>(
    items: T[],
    options: WorkflowCollectionMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ) =>
    pumpWorkflowVmAfterHostCall(
      workflow.mapCollection(
        items,
        options,
        sandboxVmCallback(
          vmContext,
          mapItem,
          {
            label: `running workflow collection map callback "${options.name ?? options.nodeId ?? "map collection"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(mapCollection) as WorkflowRuntimePrimitives["mapCollection"];
}

function sandboxWorkflowRenderDocument(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["renderDocument"] {
  const renderDocument = (input: unknown, options: WorkflowDocumentRenderOptions) =>
    pumpWorkflowVmAfterHostCall(
      workflow.renderDocument(input, options),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(renderDocument) as WorkflowRuntimePrimitives["renderDocument"];
}

function sandboxWorkflowMapModel(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["mapModel"] {
  const mapModel = <T, R>(
    items: T[],
    options: WorkflowModelMapOptions,
    mapItem: (item: T, index: number) => Promise<R> | R,
  ) =>
    pumpWorkflowVmAfterHostCall(
      workflow.mapModel(
        items,
        options,
        sandboxVmCallback(
          vmContext,
          mapItem,
          {
            label: `running workflow model map callback "${options.name ?? options.nodeId ?? "map model"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(mapModel) as WorkflowRuntimePrimitives["mapModel"];
}

function sandboxWorkflowReduceModel(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["reduceModel"] {
  const reduceModel = <R>(
    items: unknown[],
    options: WorkflowModelReduceOptions,
    reduceItems: (items: unknown[], context: WorkflowModelReduceContext) => Promise<R> | R,
  ) =>
    pumpWorkflowVmAfterHostCall(
      workflow.reduceModel(
        items,
        options,
        sandboxVmCallback(
          vmContext,
          reduceItems,
          {
            label: `running workflow model reduce callback "${options.name ?? options.nodeId ?? "reduce model"}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(reduceModel) as WorkflowRuntimePrimitives["reduceModel"];
}

function sandboxWorkflowResumePoint(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["resumePoint"] {
  const resumePoint = <T>(key: string, fn: () => Promise<T> | T): Promise<T> =>
    pumpWorkflowVmAfterHostCall(
      workflow.resumePoint(
        key,
        sandboxVmCallback(
          vmContext,
          fn,
          {
            label: `running workflow resume point "${key}"`,
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(resumePoint) as WorkflowRuntimePrimitives["resumePoint"];
}

function sandboxWorkflowStageMutation(
  workflow: WorkflowRuntimePrimitives,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): WorkflowRuntimePrimitives["stageMutation"] {
  const stageMutation = <T>(changeSet: unknown, apply: () => Promise<T> | T, metadata?: WorkflowNodeMetadata): Promise<T> =>
    pumpWorkflowVmAfterHostCall(
      workflow.stageMutation(
        changeSet,
        sandboxVmCallback(
          vmContext,
          apply,
          {
            label: "running workflow staged mutation",
            timeoutMs: syncTimeoutMs,
          },
          asyncBoundary,
        ),
        metadata,
      ),
      vmContext,
      syncTimeoutMs,
      asyncBoundary,
    );
  return hardenObject(stageMutation) as WorkflowRuntimePrimitives["stageMutation"];
}

function sandboxHandlerRecord<T extends WorkflowToolHandlers | WorkflowAmbientHandlers | WorkflowConnectorHandlers>(
  handlers: T,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): T {
  const cache = new Map<string, WorkflowToolHandler>();
  return new Proxy(hardenObject(Object.create(null) as Record<string, WorkflowToolHandler>), {
    get: (_target, property) => {
      if (typeof property !== "string" || isReflectionProperty(property)) return undefined;
      if (cache.has(property)) return cache.get(property);
      const handler = handlers[property];
      if (typeof handler !== "function") return handler;
      const wrapped = sandboxCallable(handler, vmContext, syncTimeoutMs, asyncBoundary);
      cache.set(property, wrapped);
      return wrapped;
    },
    getPrototypeOf: () => null,
    set: () => false,
  }) as T;
}

function sandboxAbortSignal(signal: AbortSignal): AbortSignal {
  const sandboxed = hardenObject({
    get aborted() {
      return signal.aborted;
    },
  });
  return sandboxed as AbortSignal;
}

function sandboxCallable<T extends (...args: any[]) => any>(
  handler: T,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): T {
  const wrapped = (...args: Parameters<T>): ReturnType<T> =>
    pumpWorkflowVmAfterHostCall(handler(...args), vmContext, syncTimeoutMs, asyncBoundary);
  return hardenObject(wrapped) as T;
}

function sandboxVmCallback<T extends (...args: any[]) => any>(
  vmContext: vm.Context,
  callback: T,
  options: { label: string; timeoutMs: number },
  asyncBoundary: WorkflowVmAsyncBoundary,
): T {
  const wrapped = (...args: Parameters<T>): ReturnType<T> => {
    try {
      return raceWorkflowVmResult(
        pumpWorkflowVmAfterVmCall(
          invokeWorkflowVmFunction(vmContext, callback, args, options),
          vmContext,
          options.timeoutMs,
          asyncBoundary,
        ),
        asyncBoundary,
      ) as ReturnType<T>;
    } catch (error) {
      throw error;
    }
  };
  return hardenObject(wrapped) as T;
}

interface WorkflowVmAsyncBoundary {
  readonly timeoutPromise: Promise<never>;
  isSettled(): boolean;
  reject(error: unknown): void;
  settle(): void;
}

function createWorkflowVmAsyncBoundary(): WorkflowVmAsyncBoundary {
  let settled = false;
  let rejectBoundary!: (reason?: unknown) => void;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectBoundary = reject;
  });
  return {
    timeoutPromise,
    isSettled: () => settled,
    reject: (error: unknown) => {
      if (settled) return;
      settled = true;
      rejectBoundary(error);
    },
    settle: () => {
      settled = true;
    },
  };
}

function raceWorkflowVmResult<T>(result: T, asyncBoundary: WorkflowVmAsyncBoundary): T | Promise<Awaited<T>> {
  if (!isPromiseLike(result)) return result;
  return Promise.race([hostPromiseFromThenable(result), asyncBoundary.timeoutPromise]) as Promise<Awaited<T>>;
}

function pumpWorkflowVmAfterHostCall<T>(
  result: T,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): T {
  if (!isPromiseLike(result)) return result;
  return hostPromiseFromThenable(result).then(
    (value) => {
      scheduleWorkflowVmMicrotaskPump(vmContext, syncTimeoutMs, asyncBoundary);
      return value;
    },
    (error) => {
      scheduleWorkflowVmMicrotaskPump(vmContext, syncTimeoutMs, asyncBoundary);
      throw error;
    },
  ) as T;
}

function pumpWorkflowVmAfterVmCall<T>(
  result: T,
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): T {
  if (!isPromiseLike(result)) return result;
  scheduleWorkflowVmMicrotaskPump(vmContext, syncTimeoutMs, asyncBoundary);
  return hostPromiseFromThenable(result).then(
    (value) => {
      scheduleWorkflowVmMicrotaskPump(vmContext, syncTimeoutMs, asyncBoundary);
      return value;
    },
    (error) => {
      scheduleWorkflowVmMicrotaskPump(vmContext, syncTimeoutMs, asyncBoundary);
      throw error;
    },
  ) as T;
}

function scheduleWorkflowVmMicrotaskPump(
  vmContext: vm.Context,
  syncTimeoutMs: number,
  asyncBoundary: WorkflowVmAsyncBoundary,
): void {
  setImmediate(() => {
    if (asyncBoundary.isSettled()) return;
    try {
      new vm.Script("", { filename: "workflow-artifact-microtask-pump.js" }).runInContext(vmContext, {
        timeout: syncTimeoutMs,
      });
    } catch (error) {
      asyncBoundary.reject(
        normalizeWorkflowVmError(error, {
          label: "resuming workflow after host call",
          timeoutMs: syncTimeoutMs,
        }),
      );
    }
  });
}

function invokeWorkflowVmFunction(
  vmContext: vm.Context,
  callback: unknown,
  args: unknown[],
  options: { label: string; timeoutMs: number },
): unknown {
  const globals = vmContext as Record<string, unknown>;
  const callbackKey = `__ambientWorkflowInvokeFn_${Math.random().toString(36).slice(2)}`;
  const argsKey = `__ambientWorkflowInvokeArgs_${Math.random().toString(36).slice(2)}`;
  globals[callbackKey] = callback;
  globals[argsKey] = args;
  try {
    return new vm.Script(`globalThis[${JSON.stringify(callbackKey)}](...globalThis[${JSON.stringify(argsKey)}]);`, {
      filename: "workflow-artifact-invoke.js",
    }).runInContext(vmContext, { timeout: options.timeoutMs });
  } catch (error) {
    throw normalizeWorkflowVmError(error, options);
  } finally {
    delete globals[callbackKey];
    delete globals[argsKey];
  }
}

function normalizeWorkflowVmError(error: unknown, options: { label: string; timeoutMs: number }): unknown {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "";
  if (/Script execution timed out/.test(message)) {
    return new Error(`Workflow program exceeded synchronous execution limit (${options.timeoutMs} ms) while ${options.label}.`);
  }
  return error;
}

function workflowVmSyncTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_WORKFLOW_VM_SYNC_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) throw new Error("Workflow VM synchronous execution timeout must be a positive number.");
  return Math.max(1, Math.floor(value));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return utilTypes.isPromise(value);
}

function hostPromiseFromThenable<T>(value: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      value.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function hardenObject<T extends object>(value: T): T {
  Object.defineProperty(value, "constructor", {
    value: undefined,
    writable: false,
    configurable: false,
  });
  Object.setPrototypeOf(value, null);
  return value;
}

function isReflectionProperty(property: string): boolean {
  return property === "constructor" || property === "__proto__" || property === "prototype";
}

function transformWorkflowSource(source: string): string {
  let transformed = source.trim();
  transformed = transformed.replace(EXPORT_DEFAULT_RUN, (_match, asyncKeyword: string | undefined) => `${asyncKeyword ?? ""}function run(`);
  transformed = transformed.replace(EXPORT_NAMED_RUN, (_match, asyncKeyword: string | undefined) => `${asyncKeyword ?? ""}function run(`);
  transformed = transformed.replace(/\bexport\s*\{\s*run\s*\}\s*;?/g, "");
  const codeOnlySource = stripWorkflowSourceLiteralsAndComments(transformed);
  if (/\bimport\s+/.test(codeOnlySource) || /\bexport\s+/.test(codeOnlySource)) {
    throw new Error("Workflow source may only export a run function and may not import modules.");
  }
  return transformed;
}
