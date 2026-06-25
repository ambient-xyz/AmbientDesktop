const mcpProtocolVersion = "2024-11-05";

export type McpToolBridgeActivitySource =
  | "request-start"
  | "response-headers"
  | "response-body"
  | "sse-connect-start"
  | "sse-connect-headers"
  | "sse-chunk"
  | "sse-event"
  | "sse-response";

export interface McpToolBridgeActivity {
  source: McpToolBridgeActivitySource;
  operation: string;
  endpointOrigin: string;
  method?: string;
  requestId?: number;
  bytes?: number;
}

export type McpToolBridgeActivityHandler = (activity: McpToolBridgeActivity) => void;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface McpHttpClientOptions {
  fetchImpl: FetchLike;
  timeoutMs: number;
  maxRunMs?: number | null;
  allowRemote?: boolean;
  headers?: Record<string, string>;
  onActivity?: McpToolBridgeActivityHandler;
}

export interface McpHttpClient {
  listTools(signal?: AbortSignal): Promise<unknown[]>;
  callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

export function createMcpHttpClient(endpoint: string, options: McpHttpClientOptions): McpHttpClient {
  const parsed = new URL(endpoint);
  return parsed.pathname.replace(/\/+$/, "").endsWith("/sse")
    ? new SseMcpClient(endpoint, options)
    : new StreamableHttpMcpClient(endpoint, options);
}

class StreamableHttpMcpClient implements McpHttpClient {
  private nextId = 1;
  private initialized = false;
  private sessionId: string | undefined;

  constructor(
    private readonly endpoint: string,
    private readonly options: McpHttpClientOptions,
  ) {
    if (!options.allowRemote) assertLoopbackMcpEndpoint(endpoint);
  }

  async listTools(signal?: AbortSignal): Promise<unknown[]> {
    await this.initialize(signal);
    const result = await this.request("tools/list", {}, signal);
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools;
  }

  async callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    await this.initialize(signal);
    return this.request("tools/call", { name, arguments: toolArguments }, signal);
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.request(
      "initialize",
      {
        protocolVersion: mcpProtocolVersion,
        capabilities: {},
        clientInfo: { name: "Ambient Desktop", version: "0.1.0" },
      },
      signal,
    );
    await this.notify("notifications/initialized", {}, signal);
    this.initialized = true;
  }

  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const envelope = await this.post({ jsonrpc: "2.0", id, method, params }, signal);
    const response = jsonRpcEnvelopeForId(envelope, id);
    if (!response) throw new Error(`MCP endpoint did not return a JSON-RPC response for ${method}.`);
    if ("error" in response) throw new Error(`MCP ${method} failed: ${JSON.stringify(response.error)}`);
    return response.result;
  }

  private async notify(method: string, params: unknown, signal?: AbortSignal): Promise<void> {
    await this.post({ jsonrpc: "2.0", method, params }, signal);
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const operation = jsonRpcMethodName(body) ?? "notification";
    const watchdog = createMcpAbortableIdleWatchdog({
      endpoint: this.endpoint,
      operation: `streamable-http ${operation}`,
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      controller,
      onActivity: this.options.onActivity,
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const headers: Record<string, string> = {
        ...(this.options.headers ?? {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
      const response = await this.options.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      watchdog.mark("response-headers");
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) this.sessionId = sessionId;
      if (!response.ok) throw new Error(`MCP endpoint ${new URL(this.endpoint).origin} returned HTTP ${response.status}.`);
      const text = await readResponseTextWithActivity(response, (bytes) => watchdog.mark("response-body", { bytes }));
      if (!text.trim()) return undefined;
      return parseMcpHttpPayload(text, response.headers.get("content-type") ?? "");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && watchdog.timedOut()) {
        throw new Error(watchdog.timeoutMessage(), { cause: error });
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP endpoint ${new URL(this.endpoint).origin} request was aborted.`, { cause: error });
      }
      throw error;
    } finally {
      watchdog.stop();
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

class SseMcpClient implements McpHttpClient {
  private nextId = 1;
  private initialized = false;
  private endpointUrl: URL | undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private readLoop: Promise<void> | undefined;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  private endpointReady: Promise<URL>;
  private resolveEndpoint!: (value: URL) => void;
  private rejectEndpoint!: (error: unknown) => void;
  private readonly activityListeners = new Set<(activity: McpToolBridgeActivity) => void>();

  constructor(
    private readonly endpoint: string,
    private readonly options: McpHttpClientOptions,
  ) {
    if (!options.allowRemote) assertLoopbackMcpEndpoint(endpoint);
    this.endpointReady = new Promise<URL>((resolve, reject) => {
      this.resolveEndpoint = resolve;
      this.rejectEndpoint = reject;
    });
  }

  async listTools(signal?: AbortSignal): Promise<unknown[]> {
    try {
      await this.initialize(signal);
      const result = await this.request("tools/list", {}, signal);
      if (!isRecord(result) || !Array.isArray(result.tools)) return [];
      return result.tools;
    } finally {
      await this.close();
    }
  }

  async callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    try {
      await this.initialize(signal);
      return await this.request("tools/call", { name, arguments: toolArguments }, signal);
    } finally {
      await this.close();
    }
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.connect(signal);
    await this.request(
      "initialize",
      {
        protocolVersion: mcpProtocolVersion,
        capabilities: {},
        clientInfo: { name: "Ambient Desktop", version: "0.1.0" },
      },
      signal,
    );
    await this.notify("notifications/initialized", {}, signal);
    this.initialized = true;
  }

  private async connect(signal?: AbortSignal): Promise<void> {
    if (this.readLoop) return;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const watchdog = createMcpAbortableIdleWatchdog({
      endpoint: this.endpoint,
      operation: "sse connect",
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      controller,
      onActivity: (activity) => this.emitActivity(activity),
      initialSource: "sse-connect-start",
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.options.fetchImpl(this.endpoint, {
        method: "GET",
        headers: { ...(this.options.headers ?? {}), accept: "text/event-stream" },
        signal: controller.signal,
      });
      watchdog.mark("sse-connect-headers");
      if (!response.ok) throw new Error(`MCP SSE endpoint ${new URL(this.endpoint).origin} returned HTTP ${response.status}.`);
      if (!response.body) throw new Error("MCP SSE endpoint did not provide a response body.");
      this.reader = response.body.getReader();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && watchdog.timedOut()) {
        throw new Error(watchdog.timeoutMessage(), { cause: error });
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP SSE endpoint ${new URL(this.endpoint).origin} request was aborted.`, { cause: error });
      }
      throw error;
    } finally {
      watchdog.stop();
      signal?.removeEventListener("abort", onAbort);
    }
    this.readLoop = this.readSseLoop().catch((error) => {
      this.rejectEndpoint(error);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.endpointUrl = await withMcpActivityTimeout(this.endpointReady, {
      endpoint: this.endpoint,
      operation: "sse endpoint discovery",
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      registerActivityListener: (listener) => this.registerActivityListener(listener),
    });
  }

  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const responsePromise = this.waitForResponse(id);
    try {
      await this.post({ jsonrpc: "2.0", id, method, params }, signal);
    } catch (error) {
      this.pending.get(id)?.reject(error);
      this.pending.delete(id);
      await responsePromise.catch(() => undefined);
      throw error;
    }
    const envelope = await responsePromise;
    const response = jsonRpcEnvelopeForId(envelope, id);
    if (!response) throw new Error(`MCP SSE endpoint did not return a JSON-RPC response for ${method}.`);
    if ("error" in response) throw new Error(`MCP ${method} failed: ${JSON.stringify(response.error)}`);
    return response.result;
  }

  private async notify(method: string, params: unknown, signal?: AbortSignal): Promise<void> {
    await this.post({ jsonrpc: "2.0", method, params }, signal);
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<void> {
    if (!this.endpointUrl) throw new Error("MCP SSE message endpoint is not ready.");
    const response = await this.options.fetchImpl(this.endpointUrl, {
      method: "POST",
      headers: { ...(this.options.headers ?? {}), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`MCP SSE message endpoint ${this.endpointUrl.origin} returned HTTP ${response.status}.`);
    void response.body?.cancel().catch(() => undefined);
  }

  private async waitForResponse(id: number): Promise<unknown> {
    const pending = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      return await withMcpActivityTimeout(pending, {
        endpoint: this.endpoint,
        operation: `sse response ${id}`,
        timeoutMs: this.options.timeoutMs,
        maxRunMs: this.options.maxRunMs,
        method: `response-${id}`,
        requestId: id,
        registerActivityListener: (listener) => this.registerActivityListener(listener),
      });
    } finally {
      this.pending.delete(id);
    }
  }

  private async readSseLoop(): Promise<void> {
    if (!this.reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines: string[] = [];
    while (true) {
      const { value, done } = await this.reader.read();
      if (done) break;
      this.emitActivity({ ...mcpActivityBase(this.endpoint, "sse stream"), source: "sse-chunk", bytes: value.byteLength });
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n/.exec(buffer))) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!line) {
          this.dispatchSseEvent(eventName, dataLines.join("\n"));
          eventName = "message";
          dataLines = [];
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
    if (dataLines.length) this.dispatchSseEvent(eventName, dataLines.join("\n"));
  }

  private dispatchSseEvent(eventName: string, data: string): void {
    if (!data.trim()) return;
    this.emitActivity({ ...mcpActivityBase(this.endpoint, `sse event ${eventName}`), source: "sse-event" });
    if (eventName === "endpoint") {
      try {
        const endpointUrl = new URL(data.trim(), this.endpoint);
        if (!this.options.allowRemote) assertSameLoopbackOrigin(this.endpoint, endpointUrl.toString());
        this.resolveEndpoint(endpointUrl);
      } catch (error) {
        this.rejectEndpoint(error);
      }
      return;
    }
    if (data.trim() === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = parseJson(data);
    } catch {
      return;
    }
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];
    for (const envelope of envelopes) {
      if (!isRecord(envelope) || typeof envelope.id !== "number") continue;
      const pending = this.pending.get(envelope.id);
      if (pending) {
        this.emitActivity({
          ...mcpActivityBase(this.endpoint, `sse response ${envelope.id}`),
          source: "sse-response",
          requestId: envelope.id,
        });
        pending.resolve(envelope);
      }
    }
  }

  private registerActivityListener(listener: (activity: McpToolBridgeActivity) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  private emitActivity(activity: McpToolBridgeActivity): void {
    this.options.onActivity?.(activity);
    for (const listener of this.activityListeners) listener(activity);
  }

  private async close(): Promise<void> {
    for (const pending of this.pending.values()) pending.reject(new Error("MCP SSE client closed."));
    this.pending.clear();
    await this.reader?.cancel().catch(() => undefined);
    await this.readLoop?.catch(() => undefined);
  }
}

function parseMcpHttpPayload(text: string, contentType: string): unknown {
  if (contentType.toLowerCase().includes("text/event-stream")) {
    const messages = sseDataMessages(text).map(parseJson);
    return messages.length === 1 ? messages[0] : messages;
  }
  return parseJson(text);
}

function sseDataMessages(text: string): string[] {
  const messages: string[] = [];
  let data: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (data.length) {
        const message = data.join("\n").trim();
        if (message && message !== "[DONE]") messages.push(message);
        data = [];
      }
      continue;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length) {
    const message = data.join("\n").trim();
    if (message && message !== "[DONE]") messages.push(message);
  }
  return messages;
}

function jsonRpcEnvelopeForId(envelope: unknown, id: number): Record<string, unknown> | undefined {
  if (Array.isArray(envelope)) return envelope.find((entry) => isRecord(entry) && entry.id === id) as Record<string, unknown> | undefined;
  return isRecord(envelope) && envelope.id === id ? envelope : undefined;
}

export function textFromMcpToolCallResult(result: unknown): string {
  if (!result || typeof result !== "object") return result === undefined ? "" : String(result);
  const record = result as Record<string, unknown>;
  const contentText = textFromMcpContent(record.content);
  const structuredText =
    "structuredContent" in record && record.structuredContent !== undefined
      ? `\n\nStructured content:\n${JSON.stringify(record.structuredContent, null, 2)}`
      : "";
  return `${contentText}${structuredText}`.trim() || "MCP tool completed without text.";
}

function textFromMcpContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : JSON.stringify(content, null, 2);
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const record = item as Record<string, unknown>;
      if (record.type === "text") return typeof record.text === "string" ? record.text : "";
      if (record.type === "image") return `[image: ${typeof record.mimeType === "string" ? record.mimeType : "image"}]`;
      if (typeof record.uri === "string") return `[resource: ${record.uri}]`;
      return JSON.stringify(record);
    })
    .filter(Boolean)
    .join("\n");
}

export function isMcpToolError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

function assertLoopbackMcpEndpoint(endpoint: string): void {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("ToolHive MCP endpoints must use HTTP(S).");
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`Refusing to call non-loopback ToolHive MCP endpoint ${parsed.origin}.`);
  }
}

function assertSameLoopbackOrigin(baseEndpoint: string, messageEndpoint: string): void {
  const base = new URL(baseEndpoint);
  const message = new URL(messageEndpoint);
  assertLoopbackMcpEndpoint(message.toString());
  if (base.origin !== message.origin) {
    throw new Error(`Refusing MCP SSE message endpoint on different origin ${message.origin}.`);
  }
}

async function readResponseTextWithActivity(response: Response, markBodyActivity: (bytes: number) => void): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      markBodyActivity(value.byteLength);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function jsonRpcMethodName(body: unknown): string | undefined {
  return isRecord(body) && typeof body.method === "string" ? body.method : undefined;
}

function mcpActivityBase(endpoint: string, operation: string): Omit<McpToolBridgeActivity, "source"> {
  return {
    operation,
    endpointOrigin: new URL(endpoint).origin,
  };
}

function createMcpAbortableIdleWatchdog(input: {
  endpoint: string;
  operation: string;
  timeoutMs: number;
  maxRunMs?: number | null;
  controller: AbortController;
  onActivity?: McpToolBridgeActivityHandler;
  initialSource?: McpToolBridgeActivitySource;
}): {
  mark: (source: McpToolBridgeActivitySource, details?: Partial<Pick<McpToolBridgeActivity, "bytes" | "method" | "requestId">>) => void;
  stop: () => void;
  timedOut: () => boolean;
  timeoutMessage: () => string;
} {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxRunTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let timeoutCause: "idle" | "max-run" | undefined;
  let lastActivity = input.initialSource ?? "request-start";
  const schedule = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      timeoutCause = "idle";
      input.controller.abort();
    }, input.timeoutMs);
  };
  const maxRunMs = positiveTimeoutMs(input.maxRunMs);
  if (maxRunMs !== undefined) {
    maxRunTimer = setTimeout(() => {
      timedOut = true;
      timeoutCause = "max-run";
      input.controller.abort();
    }, maxRunMs);
  }
  const mark = (
    source: McpToolBridgeActivitySource,
    details: Partial<Pick<McpToolBridgeActivity, "bytes" | "method" | "requestId">> = {},
  ) => {
    lastActivity = source;
    input.onActivity?.({
      ...mcpActivityBase(input.endpoint, input.operation),
      source,
      ...details,
    });
    schedule();
  };
  mark(input.initialSource ?? "request-start");
  return {
    mark,
    stop: () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxRunTimer) clearTimeout(maxRunTimer);
      idleTimer = undefined;
      maxRunTimer = undefined;
    },
    timedOut: () => timedOut,
    timeoutMessage: () => {
      const origin = new URL(input.endpoint).origin;
      if (timeoutCause === "max-run" && maxRunMs !== undefined) {
        return `MCP endpoint ${origin} exceeded ${maxRunMs} ms max run for ${input.operation} (last activity: ${lastActivity}).`;
      }
      return `MCP endpoint ${origin} stalled after ${input.timeoutMs} ms without ${input.operation} activity (last activity: ${lastActivity}).`;
    },
  };
}

function withMcpActivityTimeout<T>(
  promise: Promise<T>,
  input: {
    endpoint: string;
    operation: string;
    timeoutMs: number;
    maxRunMs?: number | null;
    method?: string;
    requestId?: number;
    registerActivityListener?: (listener: (activity: McpToolBridgeActivity) => void) => () => void;
  },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let maxRunTimer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity: McpToolBridgeActivitySource = "request-start";
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxRunTimer) clearTimeout(maxRunTimer);
      idleTimer = undefined;
      maxRunTimer = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const reset = (activity?: McpToolBridgeActivity) => {
      if (settled) return;
      if (activity) lastActivity = activity.source;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        settle(() =>
          reject(
            new Error(
              `MCP endpoint ${new URL(input.endpoint).origin} stalled after ${input.timeoutMs} ms without ${input.operation} activity (last activity: ${lastActivity}).`,
            ),
          ),
        );
      }, input.timeoutMs);
    };
    const maxRunMs = positiveTimeoutMs(input.maxRunMs);
    if (maxRunMs !== undefined) {
      maxRunTimer = setTimeout(() => {
        settle(() =>
          reject(
            new Error(
              `MCP endpoint ${new URL(input.endpoint).origin} exceeded ${maxRunMs} ms max run for ${input.operation} (last activity: ${lastActivity}).`,
            ),
          ),
        );
      }, maxRunMs);
    }
    unsubscribe = input.registerActivityListener?.((activity) => {
      reset(activity);
    });
    reset({
      ...mcpActivityBase(input.endpoint, input.operation),
      source: "request-start",
      ...(input.method ? { method: input.method } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    });
    promise.then(
      (value) => {
        settle(() => resolve(value));
      },
      (error) => {
        settle(() => reject(error));
      },
    );
  });
}

function positiveTimeoutMs(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const timeout = Math.floor(value);
  return timeout > 0 ? timeout : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`MCP endpoint returned invalid JSON: ${errorMessage(error)}`, { cause: error });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
