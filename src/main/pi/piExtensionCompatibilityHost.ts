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
      extensionSource: js,
      fileName: sourcePath,
      packageLabel: basename(input.packageRoot),
      allowedNetworkHosts: input.allowedNetworkHosts ?? [],
      timeoutMs: input.timeoutMs ?? defaultTimeoutMs,
      outputLimitBytes: input.outputLimitBytes ?? defaultOutputLimitBytes,
      toolName: "toolName" in input ? input.toolName : undefined,
      params: "params" in input ? input.params ?? {} : {},
    });
    await agentOs.writeFile(runnerPath, agentOsRunnerSource());
    await agentOs.writeFile(payloadPath, payload);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const child = agentOs.spawn("node", [runnerPath, payloadPath], {
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

function agentOsRunnerSource(): string {
  // Keep the generated runner's CommonJS call from appearing as a literal in the Electron main bundle.
  // Electron-vite's ESM shim scans bundled source with regexes and can misread string contents.
  const nodeRequire = ["requ", "ire"].join("");
  return String.raw`
const fs = ${nodeRequire}("node:fs");

const marker = ${JSON.stringify(agentOsResultMarker)};
const realProcess = process;
const RealFunction = Function;

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
  const extensionSource = payload.extensionSource
    .replace(/\bimport\s*\(/g, "__ambientDeniedImport__(")
    .replace(/\beval\s*\(/g, "__ambientDeniedEval__(")
    .replace(/\bFunction\s*\(/g, "__ambientDeniedFunction__(")
    .replace(/\bfetch\s*\(/g, "__ambientPolicyFetch__(");
  const tools = [];
  const module = { exports: {} };
  const previousGlobals = installDeniedGlobals(payload.allowedNetworkHosts || []);
  try {
    const runModule = RealFunction(
      "module",
      "exports",
      "require",
      "process",
      "__ambientPolicyFetch__",
      "__ambientDeniedEval__",
      "__ambientDeniedFunction__",
      "__ambientDeniedImport__",
      extensionSource + "\n//# sourceURL=" + payload.fileName,
    );
    runModule(
      module,
      module.exports,
      createExtensionRequire(),
      undefined,
      globalThis.fetch,
      deniedEval,
      deniedFunction,
      deniedImport,
    );
    const extension = module.exports.default ?? module.exports;
    if (typeof extension !== "function") throw new Error("Pi extension entrypoint did not export a function.");
    await extension({
      registerTool(tool) {
        if (!tool || typeof tool.name !== "string" || !tool.name.trim()) throw new Error("Pi extension registered a tool without a name.");
        tools.push(tool);
      },
    });
  } finally {
    restoreGlobals(previousGlobals);
  }
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
  const timeout = setTimeout(() => controller.abort(), payload.timeoutMs);
  const previousRunGlobals = installDeniedGlobals(payload.allowedNetworkHosts || []);
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
    restoreGlobals(previousRunGlobals);
    clearTimeout(timeout);
  }
}

function emit(value, exitCode) {
  return new Promise((resolve, reject) => {
    realProcess.stdout.write(marker + JSON.stringify(value) + "\n", (error) => {
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
    fetch: globalThis.fetch,
    eval: globalThis.eval,
    Function: globalThis.Function,
  };
  globalThis.process = undefined;
  globalThis.fetch = createPolicyFetch(allowedHosts);
  globalThis.eval = deniedEval;
  globalThis.Function = deniedFunction;
  return previous;
}

function restoreGlobals(previous) {
  globalThis.process = previous.process;
  globalThis.fetch = previous.fetch;
  globalThis.eval = previous.eval;
  globalThis.Function = previous.Function;
}

function deniedEval() {
  throw new Error("Pi extension eval denied.");
}

function deniedFunction() {
  throw new Error("Pi extension Function constructor denied.");
}

function deniedImport() {
  return Promise.reject(new Error("Pi extension dynamic import denied."));
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
    return fetch(url, init);
  };
}

function safeConsole() {
  return {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

${boundPiToolResult.toString()}
${normalizePiToolResult.toString()}
${truncateHead.toString()}
${truncateUtf8.toString()}
${formatSize.toString()}
${parseArxivXml.toString()}
${parseArxivEntry.toString()}
${textOf.toString()}
${attrOf.toString()}
${matchAll.toString()}
${decodeXml.toString()}
`;
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
  }).outputText;
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
