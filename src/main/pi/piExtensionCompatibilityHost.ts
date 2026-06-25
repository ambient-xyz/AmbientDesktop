import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { AgentOs } from "@rivet-dev/agent-os-core";

export interface PiExtensionHostTool {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
}

export interface PiExtensionHostLoadInput {
  packageRoot: string;
  entrypoint?: string;
  allowedNetworkHosts?: string[];
  timeoutMs?: number;
  outputLimitBytes?: number;
}

export interface PiExtensionHostRunInput extends PiExtensionHostLoadInput {
  toolName: string;
  params?: unknown;
}

export interface PiExtensionHostRunResult {
  toolName: string;
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
  isError?: boolean;
}

const defaultTimeoutMs = 30_000;
const defaultOutputLimitBytes = 64 * 1024;
const agentOsResultMarker = "__AMBIENT_PI_EXTENSION_RESULT__";
const requireFromHere = createRequire(import.meta.url);
let typescriptModule: any;

export async function discoverPiExtensionHostTools(input: PiExtensionHostLoadInput): Promise<PiExtensionHostTool[]> {
  const result = await runAgentOsExtensionHost({ mode: "discover", input });
  return result.tools ?? [];
}

export async function runPiExtensionHostTool(input: PiExtensionHostRunInput): Promise<PiExtensionHostRunResult> {
  const result = await runAgentOsExtensionHost({ mode: "run", input });
  if (!result.runResult) throw new Error(`Pi extension tool "${input.toolName}" did not return a result.`);
  return result.runResult;
}

async function runAgentOsExtensionHost(args: {
  mode: "discover" | "run";
  input: PiExtensionHostLoadInput | PiExtensionHostRunInput;
}): Promise<{ tools?: PiExtensionHostTool[]; runResult?: PiExtensionHostRunResult }> {
  const { input } = args;
  const entrypoint = input.entrypoint ?? "index.ts";
  const sourcePath = join(input.packageRoot, entrypoint);
  const source = await readFile(sourcePath, "utf8");
  const js = transpileExtension(source, sourcePath);
  const agentOs = await AgentOs.create({
    permissions: {
      // AgentOS owns an isolated virtual filesystem here. No host filesystem is mounted.
      fs: () => ({ allow: true }),
      // Required to start the AgentOS node process. The extension still receives a denied require shim.
      childProcess: () => ({ allow: true }),
      network: (request: any) => {
        const raw = String(request.url ?? request.hostname ?? "");
        try {
          const host = raw.includes("://") ? new URL(raw).hostname : raw;
          const allow = (input.allowedNetworkHosts ?? []).map((item) => item.toLowerCase()).includes(host.toLowerCase());
          return { allow, ...(allow ? {} : { reason: `Pi extension network denied: ${host}` }) };
        } catch {
          return { allow: false, reason: "Pi extension network denied." };
        }
      },
      env: () => ({ allow: false, reason: "Pi extension environment access is denied." }),
    },
  });
  try {
    const runnerPath = `/tmp/ambient-pi-extension-host-${Date.now()}-${Math.random().toString(16).slice(2)}.cjs`;
    const payloadPath = `${runnerPath}.json`;
    const payload = JSON.stringify({
      mode: args.mode,
      fileName: sourcePath,
      packageLabel: basename(input.packageRoot),
      allowedNetworkHosts: input.allowedNetworkHosts ?? [],
      timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
      outputLimitBytes: input.outputLimitBytes ?? defaultOutputLimitBytes,
      toolName: "toolName" in input ? input.toolName : undefined,
      params: "params" in input ? input.params ?? {} : {},
    });
    await agentOs.writeFile(runnerPath, agentOsRunnerSource(js, sourcePath));
    await agentOs.writeFile(payloadPath, payload);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const child = agentOs.spawn("node", ["--disallow-code-generation-from-strings", runnerPath, payloadPath], {
      env: {},
      timeout: (input.timeoutMs ?? defaultTimeoutMs) + 15_000,
    });
    agentOs.onProcessStdout(child.pid, (data) => stdout.push(Buffer.from(data).toString("utf8")));
    agentOs.onProcessStderr(child.pid, (data) => stderr.push(Buffer.from(data).toString("utf8")));
    const exitCode = await agentOs.waitProcess(child.pid);
    const text = stdout.join("");
    const lines = text.split("\n");
    const line = [...lines].reverse().find((item: string) => item.startsWith(agentOsResultMarker));
    if (!line) {
      if (args.mode === "run" && "toolName" in input && exitCode === 0 && !stderr.length) {
        throw new Error(`Pi extension tool "${input.toolName}" timed out.`);
      }
      throw new Error(
        `AgentOS Pi extension host did not emit a result. exitCode=${exitCode}.${stderr.length ? ` stderr: ${truncateUtf8(stderr.join(""), 4_000)}` : ""}`,
      );
    }
    const parsed = JSON.parse(line.slice(agentOsResultMarker.length));
    if (!parsed.ok) {
      const error = String(parsed.error ?? "AgentOS Pi extension host failed.");
      if (error.includes("EACCES: network connect denied")) throw new Error("Pi extension network denied.");
      throw new Error(error);
    }
    if (exitCode !== 0) throw new Error(`AgentOS Pi extension host exited with code ${exitCode}.`);
    return parsed.value;
  } finally {
    await agentOs.dispose();
  }
}

function agentOsRunnerSource(extensionSource: string, fileName: string): string {
  // Keep the generated runner's CommonJS call from appearing as a literal in the Electron main bundle.
  // Electron-vite's ESM shim scans bundled source with regexes and can misread string contents.
  const nodeRequire = ["requ", "ire"].join("");
  return String.raw`
const fs = ${nodeRequire}("node:fs");

const marker = ${JSON.stringify(agentOsResultMarker)};
const realProcess = process;
const realDefineProperty = Object.defineProperty.bind(Object);
const realGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
const realGetPrototypeOf = Object.getPrototypeOf.bind(Object);
const realFreeze = Object.freeze.bind(Object);
const realFunctionConstructor = Function;
const realFetch = fetch;
const realJsonStringify = globalThis.JSON.stringify.bind(globalThis.JSON);
const realJsonParse = globalThis.JSON.parse.bind(globalThis.JSON);
const realBufferByteLength = globalThis.Buffer.byteLength.bind(globalThis.Buffer);
const realBufferFrom = globalThis.Buffer.from.bind(globalThis.Buffer);
const JSON = realFreeze({ stringify: realJsonStringify, parse: realJsonParse });
const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;
const realSetInterval = setInterval;
const realClearInterval = clearInterval;
const realSetImmediate = typeof setImmediate === "function" ? setImmediate : undefined;
const realClearImmediate = typeof clearImmediate === "function" ? clearImmediate : undefined;
const extensionAsyncHandles = new Set();
const deniedFunctionConstructorPrototypes = [
  realFunctionConstructor.prototype,
  realGetPrototypeOf(async function() {}).constructor.prototype,
  realGetPrototypeOf(function*() {}).constructor.prototype,
  realGetPrototypeOf(async function*() {}).constructor.prototype,
];

class PiExtensionHostTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "AbortError";
  }
}

main().catch(async (error) => {
  await emit({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }, 1);
});

async function main() {
  const payloadPath = process.argv[process.argv.length - 1];
  if (!payloadPath) throw new Error("Missing AgentOS Pi extension payload path.");
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const tools = [];
  installDeniedGlobals(payload.allowedNetworkHosts || []);
  const extension = loadExtensionModule(payload);
  if (typeof extension !== "function") throw new Error("Pi extension entrypoint did not export a function.");
  await extension({
    registerTool(tool) {
      tools.push(snapshotRegisteredTool(tool));
    },
  });
  if (payload.mode === "discover") {
    await emit({
      ok: true,
      value: {
        tools: tools.map(({ name, label, description, parameters }) => ({
          name,
          ...(label ? { label } : {}),
          ...(description ? { description } : {}),
          ...(parameters !== undefined ? { parameters } : {}),
        })),
      },
    }, 0);
    return;
  }
  const tool = tools.find((candidate) => candidate.name === payload.toolName);
  if (!tool) throw new Error('Pi extension tool "' + payload.toolName + '" was not registered.');
  if (typeof tool.execute !== "function") throw new Error('Pi extension tool "' + payload.toolName + '" does not expose execute().');
  const controller = new AbortController();
  const timeout = realSetTimeout(() => controller.abort(), payload.timeoutMs);
  installDeniedGlobals(payload.allowedNetworkHosts || []);
  try {
    const raw = await abortable(
      Promise.resolve(tool.execute("ambient-pi-extension-" + Date.now(), payload.params ?? {}, controller.signal)),
      controller.signal,
      payload.toolName,
    );
    await emit({ ok: true, value: { runResult: boundPiToolResult(payload.toolName, raw, payload.outputLimitBytes) } }, 0);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error('Pi extension tool "' + payload.toolName + '" timed out.');
    throw error;
  } finally {
    realClearTimeout(timeout);
  }
}

${extensionModuleSource(extensionSource, fileName, nodeRequire)}

function snapshotRegisteredTool(tool) {
  const name = tool?.name;
  if (typeof name !== "string" || !name.trim()) throw new Error("Pi extension registered a tool without a name.");
  return {
    name,
    label: snapshotToolMetadata(tool.label),
    description: snapshotToolMetadata(tool.description),
    parameters: snapshotToolMetadata(tool.parameters),
    execute: tool.execute,
  };
}

function snapshotToolMetadata(value) {
  if (value === undefined) return undefined;
  const json = realJsonStringify(value);
  return json === undefined ? undefined : realJsonParse(json);
}

function emit(value, exitCode) {
  clearExtensionAsyncHandles();
  return new Promise((resolve, reject) => {
    realProcess.stdout.write(marker + realJsonStringify(value) + "\n", (error) => {
      if (error) reject(error);
      else {
        realProcess.exitCode = exitCode;
        resolve();
      }
    });
  });
}

function installDeniedGlobals(allowedHosts) {
  const previous = {
    process: globalThis.process,
    console: globalThis.console,
    fetch: globalThis.fetch,
    eval: globalThis.eval,
    Function: globalThis.Function,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setImmediate: globalThis.setImmediate,
    clearImmediate: globalThis.clearImmediate,
    functionConstructors: undefined,
  };
  globalThis.process = undefined;
  globalThis.console = safeConsole();
  globalThis.fetch = createPolicyFetch(allowedHosts);
  globalThis.eval = deniedEval;
  globalThis.Function = deniedFunction;
  globalThis.setTimeout = sandboxSetTimeout;
  globalThis.clearTimeout = sandboxClearTimeout;
  globalThis.setInterval = sandboxSetInterval;
  globalThis.clearInterval = sandboxClearInterval;
  if (realSetImmediate) globalThis.setImmediate = sandboxSetImmediate;
  if (realClearImmediate) globalThis.clearImmediate = sandboxClearImmediate;
  previous.functionConstructors = denyFunctionConstructors();
  return previous;
}

function restoreGlobals(previous) {
  restoreFunctionConstructors(previous.functionConstructors);
  globalThis.process = previous.process;
  globalThis.console = previous.console;
  globalThis.fetch = previous.fetch;
  globalThis.eval = previous.eval;
  globalThis.Function = previous.Function;
  globalThis.setTimeout = previous.setTimeout;
  globalThis.clearTimeout = previous.clearTimeout;
  globalThis.setInterval = previous.setInterval;
  globalThis.clearInterval = previous.clearInterval;
  globalThis.setImmediate = previous.setImmediate;
  globalThis.clearImmediate = previous.clearImmediate;
}

function deniedEval() {
  throw new Error("Pi extension eval denied.");
}

function deniedFunction() {
  throw new Error("Pi extension Function constructor denied.");
}

function denyFunctionConstructors() {
  return deniedFunctionConstructorPrototypes.map((prototype) => {
    const previous = realGetOwnPropertyDescriptor(prototype, "constructor");
    realDefineProperty(prototype, "constructor", {
      value: deniedFunction,
      configurable: true,
      writable: true,
    });
    return { prototype, previous };
  });
}

function restoreFunctionConstructors(records) {
  for (const record of records || []) {
    if (record.previous) {
      realDefineProperty(record.prototype, "constructor", record.previous);
    } else {
      delete record.prototype.constructor;
    }
  }
}

function sandboxSetTimeout(callback, delay, ...args) {
  const handle = realSetTimeout(() => {
    extensionAsyncHandles.delete(handle);
    callback(...args);
  }, delay);
  extensionAsyncHandles.add(handle);
  return handle;
}

function sandboxClearTimeout(handle) {
  extensionAsyncHandles.delete(handle);
  return realClearTimeout(handle);
}

function sandboxSetInterval(callback, delay, ...args) {
  const handle = realSetInterval(callback, delay, ...args);
  extensionAsyncHandles.add(handle);
  return handle;
}

function sandboxClearInterval(handle) {
  extensionAsyncHandles.delete(handle);
  return realClearInterval(handle);
}

function sandboxSetImmediate(callback, ...args) {
  if (!realSetImmediate) throw new Error("Pi extension setImmediate unavailable.");
  const handle = realSetImmediate(() => {
    extensionAsyncHandles.delete(handle);
    callback(...args);
  });
  extensionAsyncHandles.add(handle);
  return handle;
}

function sandboxClearImmediate(handle) {
  extensionAsyncHandles.delete(handle);
  return realClearImmediate ? realClearImmediate(handle) : undefined;
}

function clearExtensionAsyncHandles() {
  for (const handle of extensionAsyncHandles) {
    realClearTimeout(handle);
    realClearInterval(handle);
    if (realClearImmediate) realClearImmediate(handle);
  }
  extensionAsyncHandles.clear();
}

function abortable(promise, signal, toolName) {
  if (signal.aborted) return Promise.reject(new PiExtensionHostTimeoutError('Pi extension tool "' + toolName + '" timed out.'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new PiExtensionHostTimeoutError('Pi extension tool "' + toolName + '" timed out.'));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function createExtensionRequire() {
  const typeboxStub = {
    Object(properties) {
      const required = Object.entries(properties).filter(([, value]) => !value?.optional).map(([key]) => key);
      return { type: "object", properties, ...(required.length ? { required } : {}) };
    },
    String(options = {}) {
      return { type: "string", ...options };
    },
    Number(options = {}) {
      return { type: "number", ...options };
    },
    Boolean(options = {}) {
      return { type: "boolean", ...options };
    },
    Optional(schema) {
      return { ...schema, optional: true };
    },
  };
  const stubs = {
    "@mariozechner/pi-coding-agent": {
      DEFAULT_MAX_BYTES: 64 * 1024,
      DEFAULT_MAX_LINES: 1000,
      formatSize,
      truncateHead,
    },
    "@mariozechner/pi-tui": {
      Text: class Text {
        constructor(text) {
          this.text = text;
        }
        toString() {
          return this.text;
        }
      },
    },
    "@sinclair/typebox": {
      Type: typeboxStub,
    },
    "@mariozechner/pi-ai": {
      StringEnum(values, options = {}) {
        return { type: "string", enum: [...values], ...options };
      },
    },
    "fast-xml-parser": {
      XMLParser: class XMLParser {
        parse(xml) {
          return parseArxivXml(xml);
        }
      },
    },
  };
  return (moduleName) => {
    if (moduleName in stubs) return stubs[moduleName];
    throw new Error("Pi extension import denied: " + moduleName);
  };
}

function createPolicyFetch(allowedHosts) {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return async (url, init) => {
    const parsed = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (!allowed.has(parsed.hostname.toLowerCase())) {
      throw new Error("Pi extension network denied: " + parsed.hostname);
    }
    return realFetch(url, init);
  };
}

function safeConsole() {
  const noop = () => undefined;
  return {
    assert: noop,
    clear: noop,
    count: noop,
    countReset: noop,
    debug: noop,
    dir: noop,
    dirxml: noop,
    error: noop,
    group: noop,
    groupCollapsed: noop,
    groupEnd: noop,
    info: noop,
    log: noop,
    profile: noop,
    profileEnd: noop,
    table: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    trace: noop,
    warn: noop,
  };
}

${boundPiToolResult.toString()}
${normalizePiToolResult.toString()}
${truncateHead.toString()}
${runnerTruncateUtf8Source()}
${formatSize.toString()}
${parseArxivXml.toString()}
${parseArxivEntry.toString()}
${textOf.toString()}
${attrOf.toString()}
${matchAll.toString()}
${decodeXml.toString()}
`;
}

function runnerTruncateUtf8Source(): string {
  return truncateUtf8
    .toString()
    .replaceAll("Buffer.byteLength", "realBufferByteLength")
    .replaceAll("Buffer.from", "realBufferFrom");
}

function extensionModuleSource(extensionSource: string, fileName: string, nodeRequire: string): string {
  const sourceUrl = fileName.replace(/[\r\n]/g, "").replace(/\s/g, "%20");
  const cjsModule = ["mo", "dule"].join("");
  const cjsExports = ["ex", "ports"].join("");
  const functionKeyword = ["fun", "ction"].join("");
  const replacements = {
    __M__: cjsModule,
    __E__: cjsExports,
    __R__: nodeRequire,
    __F__: functionKeyword,
    __D__: deniedRunnerBindingNames().join(", "),
    __U__: deniedRunnerBindingNames().map(() => "undefined").join(", "),
  };
  const prefix = applySourceTemplate(
    "ZnVuY3Rpb24gbG9hZEV4dGVuc2lvbk1vZHVsZShwYXlsb2FkKSB7CiAgY29uc3QgX19NX18gPSB7IF9fRV9fOiB7fSB9OwogIGNvbnN0IF9fRV9fID0gX19NX18uX19FX187CiAgY29uc3QgX19SX18gPSBjcmVhdGVFeHRlbnNpb25SZXF1aXJlKCk7CiAgY29uc3QgcHJvY2VzcyA9IHVuZGVmaW5lZDsKICBjb25zdCBmZXRjaCA9IGdsb2JhbFRoaXMuZmV0Y2g7CiAgY29uc3QgY29uc29sZSA9IGdsb2JhbFRoaXMuY29uc29sZTsKICBjb25zdCBfX2ZpbGVuYW1lID0gcGF5bG9hZC5maWxlTmFtZTsKICBjb25zdCBfX2Rpcm5hbWUgPSAnLic7CiAgKF9fRl9fKF9fTV9fLCBfX0VfXywgX19SX18sIHByb2Nlc3MsIGZldGNoLCBjb25zb2xlLCBfX2ZpbGVuYW1lLCBfX2Rpcm5hbWUsIF9fRF9fKSB7CiAgICAndXNlIHN0cmljdCc7CiAgICB7",
    replacements,
  );
  const suffix = applySourceTemplate(
    "ICAgIH0KICB9KShfX01fXywgX19FX18sIF9fUl9fLCBwcm9jZXNzLCBmZXRjaCwgY29uc29sZSwgX19maWxlbmFtZSwgX19kaXJuYW1lLCBfX1VfXyk7CiAgcmV0dXJuIF9fTV9fLl9fRV9fLmRlZmF1bHQgPz8gX19NX18uX19FX187Cn0=",
    replacements,
  );
  return [prefix, extensionSource, `\n//# sourceURL=${sourceUrl}`, suffix].join("\n");
}

function deniedRunnerBindingNames(): string[] {
  return [
    "payload",
    "fs",
    "marker",
    "realProcess",
    "realDefineProperty",
    "realGetOwnPropertyDescriptor",
    "realGetPrototypeOf",
    "realFreeze",
    "realFunctionConstructor",
    "realFetch",
    "realJsonStringify",
    "realJsonParse",
    "realBufferByteLength",
    "realBufferFrom",
    "realSetTimeout",
    "realClearTimeout",
    "realSetInterval",
    "realClearInterval",
    "realSetImmediate",
    "realClearImmediate",
    "extensionAsyncHandles",
    "deniedFunctionConstructorPrototypes",
    "PiExtensionHostTimeoutError",
    "main",
    "snapshotRegisteredTool",
    "snapshotToolMetadata",
    "emit",
    "installDeniedGlobals",
    "restoreGlobals",
    "deniedEval",
    "deniedFunction",
    "denyFunctionConstructors",
    "restoreFunctionConstructors",
    "sandboxSetTimeout",
    "sandboxClearTimeout",
    "sandboxSetInterval",
    "sandboxClearInterval",
    "sandboxSetImmediate",
    "sandboxClearImmediate",
    "clearExtensionAsyncHandles",
    "abortable",
    "createExtensionRequire",
    "createPolicyFetch",
    "safeConsole",
    "boundPiToolResult",
    "normalizePiToolResult",
    "truncateHead",
    "truncateUtf8",
    "formatSize",
    "parseArxivXml",
    "parseArxivEntry",
    "textOf",
    "attrOf",
    "matchAll",
    "decodeXml",
  ];
}

function applySourceTemplate(base64: string, replacements: Record<string, string>): string {
  let source = Buffer.from(base64, "base64").toString("utf8");
  for (const [token, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(token, replacement);
  }
  return source;
}

function transpileExtension(source: string, fileName: string): string {
  const ts = typescriptModule ?? (typescriptModule = requireFromHere("typescript"));
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
    },
    transformers: {
      before: [denyDynamicImportTransformer(ts)],
    },
  }).outputText;
}

function denyDynamicImportTransformer(ts: any) {
  return (context: any) => {
    const visit = (node: any): any => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return ts.factory.createCallExpression(
          ts.factory.createParenthesizedExpression(
            ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              ts.factory.createBlock([ts.factory.createThrowStatement(ts.factory.createStringLiteral("Pi extension dynamic import denied."))], true),
            ),
          ),
          undefined,
          [],
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (sourceFile: any) => ts.visitNode(sourceFile, visit);
  };
}

function createExtensionRequire(): (moduleName: string) => unknown {
  const stubs: Record<string, unknown> = {
    "@mariozechner/pi-coding-agent": {
      DEFAULT_MAX_BYTES: 64 * 1024,
      DEFAULT_MAX_LINES: 1_000,
      formatSize,
      truncateHead,
    },
    "@mariozechner/pi-tui": {
      Text: class Text {
        constructor(public text: string) {}
        toString() {
          return this.text;
        }
      },
    },
    "@sinclair/typebox": {
      Type: typeboxStub,
    },
    "@mariozechner/pi-ai": {
      StringEnum(values: readonly string[], options: Record<string, unknown> = {}) {
        return { type: "string", enum: [...values], ...options };
      },
    },
    "fast-xml-parser": {
      XMLParser: class XMLParser {
        parse(xml: string) {
          return parseArxivXml(xml);
        }
      },
    },
  };
  return (moduleName: string) => {
    if (moduleName in stubs) return stubs[moduleName];
    throw new Error(`Pi extension import denied: ${moduleName}`);
  };
}

const typeboxStub = {
  Object(properties: Record<string, any>) {
    const required = Object.entries(properties).filter(([, value]) => !value?.optional).map(([key]) => key);
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  },
  String(options: Record<string, unknown> = {}) {
    return { type: "string", ...options };
  },
  Number(options: Record<string, unknown> = {}) {
    return { type: "number", ...options };
  },
  Boolean(options: Record<string, unknown> = {}) {
    return { type: "boolean", ...options };
  },
  Optional(schema: Record<string, unknown>) {
    return { ...schema, optional: true };
  },
};

function createPolicyFetch(allowedHosts: string[]): typeof fetch {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const parsed = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (!allowed.has(parsed.hostname.toLowerCase())) {
      throw new Error(`Pi extension network denied: ${parsed.hostname}`);
    }
    return fetch(url, init);
  }) as typeof fetch;
}

function safeConsole(): Pick<Console, "log" | "warn" | "error"> {
  return {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function boundPiToolResult(toolName: string, raw: unknown, outputLimitBytes: number): PiExtensionHostRunResult {
  const result = normalizePiToolResult(toolName, raw);
  const content = result.content.map((item) => {
    if (item.type !== "text" || typeof item.text !== "string") return item;
    return { ...item, text: truncateUtf8(item.text, outputLimitBytes) };
  });
  return { ...result, content };
}

function normalizePiToolResult(toolName: string, raw: unknown): PiExtensionHostRunResult {
  if (raw && typeof raw === "object" && Array.isArray((raw as any).content)) {
    const value = raw as any;
    return {
      toolName,
      content: value.content,
      ...(value.details !== undefined ? { details: value.details } : {}),
      ...(value.isError !== undefined ? { isError: Boolean(value.isError) } : {}),
    };
  }
  return { toolName, content: [{ type: "text", text: typeof raw === "string" ? raw : JSON.stringify(raw) }] };
}

function truncateHead(content: string, options: { maxLines?: number; maxBytes?: number } = {}) {
  const maxLines = options.maxLines ?? 1_000;
  const maxBytes = options.maxBytes ?? 64 * 1024;
  const lines = content.split("\n");
  const lineTruncated = lines.length > maxLines;
  const byLine = lineTruncated ? lines.slice(0, maxLines).join("\n") : content;
  const truncatedContent = truncateUtf8(byLine, maxBytes);
  const outputBytes = Buffer.byteLength(truncatedContent, "utf8");
  const totalBytes = Buffer.byteLength(content, "utf8");
  return {
    content: truncatedContent,
    truncated: lineTruncated || outputBytes < totalBytes,
    outputBytes,
    totalBytes,
  };
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  return Buffer.from(value, "utf8").subarray(0, maxBytes).toString("utf8");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseArxivXml(xml: string): { feed: Record<string, unknown> } {
  const entries = matchAll(xml, /<entry>([\s\S]*?)<\/entry>/g).map(parseArxivEntry);
  return {
    feed: {
      "opensearch:totalResults": textOf(xml, "opensearch:totalResults") || String(entries.length),
      entry: entries,
    },
  };
}

function parseArxivEntry(xml: string): Record<string, unknown> {
  return {
    id: textOf(xml, "id"),
    title: textOf(xml, "title"),
    summary: textOf(xml, "summary"),
    published: textOf(xml, "published"),
    updated: textOf(xml, "updated"),
    author: matchAll(xml, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g).map((name) => ({ name: decodeXml(name) })),
    category: matchAll(xml, /<category[^>]*term="([^"]+)"/g).map((term) => ({ "@_term": decodeXml(term) })),
    "arxiv:primary_category": { "@_term": attrOf(xml, /<arxiv:primary_category[^>]*term="([^"]+)"/) },
    "arxiv:comment": textOf(xml, "arxiv:comment"),
    "arxiv:journal_ref": textOf(xml, "arxiv:journal_ref"),
    link: [
      { "@_rel": "alternate", "@_href": attrOf(xml, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) },
      { "@_type": "application/pdf", "@_href": attrOf(xml, /<link[^>]*title="pdf"[^>]*href="([^"]+)"/) },
    ],
  };
}

function textOf(xml: string, tagName: string): string {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXml(match[1]) : "";
}

function attrOf(xml: string, pattern: RegExp): string {
  const match = xml.match(pattern);
  return match ? decodeXml(match[1]) : "";
}

function matchAll(value: string, pattern: RegExp): string[] {
  return Array.from(value.matchAll(pattern), (match) => match[1]);
}

function decodeXml(value: string): string {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
