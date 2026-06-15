import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type {
  CodexHostedMarketplaceReadComparison,
  CodexHostedMarketplacePluginSummary,
  CodexHostedMarketplaceReport,
  CodexHostedMarketplaceSummary,
  CodexPluginCatalog,
} from "../../shared/types";

export const codexMarketplaceProtocolMethods = [
  "initialize",
  "plugin/list",
  "plugin/read",
  "marketplace/add",
  "marketplace/remove",
  "marketplace/upgrade",
  "plugin/install",
  "plugin/uninstall",
];

export interface CodexAppServerInitializeResult {
  codexHome?: string;
  platformFamily?: string;
  platformOs?: string;
  userAgent?: string;
}

export interface CodexAppServerMarketplaceClient {
  readonly sourceLabel: string;
  initialize(): Promise<CodexAppServerInitializeResult | undefined>;
  listPlugins(params: Record<string, unknown>): Promise<unknown>;
  readPlugin?(params: Record<string, unknown>): Promise<unknown>;
  dispose?(): void | Promise<void>;
}

export interface CodexHostedMarketplaceInspectOptions {
  client?: CodexAppServerMarketplaceClient;
  maxReadProbes?: number;
  now?: () => Date;
}

interface NormalizedAppServerPluginList {
  featuredPluginIds: string[];
  marketplaceLoadErrors: string[];
  marketplaces: CodexHostedMarketplaceSummary[];
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
  method: string;
}

export async function inspectCodexHostedMarketplace(
  catalog: CodexPluginCatalog,
  workspacePath: string,
  options: CodexHostedMarketplaceInspectOptions = {},
): Promise<CodexHostedMarketplaceReport> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const client = options.client ?? createCodexAppServerMarketplaceClientFromEnv();

  if (!client) return sidecarRequiredReport(catalog, checkedAt);

  try {
    const initialized = await client.initialize();
    const rawList = await client.listPlugins({ cwds: [workspacePath] });
    const list = normalizePluginList(rawList);
    const comparison = compareAmbientCatalogToHostedMarketplaces(catalog, list.marketplaces);
    const readComparisons = await compareHostedPluginReads(catalog, list.marketplaces, client, options.maxReadProbes ?? 3);
    return {
      status: "available",
      checkedAt,
      message: "Codex app-server marketplace oracle is available. Ambient can compare hosted marketplace results against its local/Git catalog.",
      source: "codex-app-server",
      protocolMethods: codexMarketplaceProtocolMethods,
      command: client.sourceLabel,
      codexHome: initialized?.codexHome,
      platformFamily: initialized?.platformFamily,
      marketplaceCount: list.marketplaces.length,
      pluginCount: list.marketplaces.reduce((sum, marketplace) => sum + marketplace.pluginCount, 0),
      featuredPluginIds: list.featuredPluginIds,
      marketplaceLoadErrors: list.marketplaceLoadErrors,
      marketplaces: list.marketplaces,
      ...comparison,
      readComparisonCount: readComparisons.length,
      readComparisons,
      notes: [
        "Codex Desktop delegates hosted marketplace browse/install behavior to codex app-server over JSON-RPC.",
        "Ambient uses this report as a read-only oracle before owning direct hosted marketplace endpoints.",
      ],
    };
  } catch (error) {
    return {
      ...emptyReport(catalog, checkedAt),
      status: "error",
      source: "codex-app-server",
      command: client.sourceLabel,
      message: `Codex app-server marketplace oracle failed: ${errorMessage(error)}`,
      notes: [
        "Hosted marketplace compatibility remains sidecar-gated until Ambient can read app-server responses successfully.",
        "Local, cache, and Git-backed marketplace support are still available without this oracle.",
      ],
    };
  } finally {
    if (!options.client) await client.dispose?.();
  }
}

export function createCodexAppServerMarketplaceClientFromEnv(): CodexAppServerMarketplaceClient | undefined {
  if (process.env.AMBIENT_CODEX_APP_SERVER_ORACLE !== "1") return undefined;
  const command = process.env.AMBIENT_CODEX_APP_SERVER_COMMAND?.trim() || "codex";
  const args = parseArgsEnv(process.env.AMBIENT_CODEX_APP_SERVER_ARGS) ?? ["app-server", "--analytics-default-enabled"];
  return new StdioCodexAppServerMarketplaceClient(command, args);
}

export function compareAmbientCatalogToHostedMarketplaces(
  catalog: CodexPluginCatalog,
  marketplaces: CodexHostedMarketplaceSummary[],
): Pick<CodexHostedMarketplaceReport, "ambientCandidateCount" | "matchedPluginCount" | "missingInAmbient" | "extraInAmbient"> {
  const ambientPlugins = [...catalog.plugins, ...catalog.importCandidates];
  const ambientNames = new Set(ambientPlugins.map((plugin) => plugin.name));
  const hostedNames = new Set<string>();
  for (const marketplace of marketplaces) {
    for (const plugin of marketplace.plugins) hostedNames.add(plugin.name);
  }

  const missingInAmbient = [...hostedNames].filter((name) => !ambientNames.has(name)).sort();
  const extraInAmbient = ambientPlugins
    .filter((plugin) => plugin.sourceKind === "remote-marketplace" || plugin.sourceKind === "codex-cache")
    .map((plugin) => plugin.name)
    .filter((name) => !hostedNames.has(name))
    .sort();

  return {
    ambientCandidateCount: catalog.importCandidates.length,
    matchedPluginCount: [...hostedNames].filter((name) => ambientNames.has(name)).length,
    missingInAmbient,
    extraInAmbient,
  };
}

function sidecarRequiredReport(catalog: CodexPluginCatalog, checkedAt: string): CodexHostedMarketplaceReport {
  return {
    ...emptyReport(catalog, checkedAt),
    status: "sidecar-required",
    source: "ambient",
    message: "Hosted Codex marketplace browsing is sidecar-gated until Ambient owns stable backend contracts.",
    notes: [
      "Codex Desktop loads hosted marketplace state through codex app-server methods rather than a renderer-owned public endpoint.",
      "Set AMBIENT_CODEX_APP_SERVER_ORACLE=1 to run a read-only app-server comparison probe from this UI.",
      "Local Codex marketplaces, Codex cache imports, and Git-backed remote marketplace entries continue to work without the sidecar.",
    ],
  };
}

function emptyReport(catalog: CodexPluginCatalog, checkedAt: string): Omit<CodexHostedMarketplaceReport, "status" | "source" | "message" | "notes"> {
  return {
    checkedAt,
    protocolMethods: codexMarketplaceProtocolMethods,
    marketplaceCount: 0,
    pluginCount: 0,
    featuredPluginIds: [],
    marketplaceLoadErrors: [],
    marketplaces: [],
    ambientCandidateCount: catalog.importCandidates.length,
    matchedPluginCount: 0,
    missingInAmbient: [],
    extraInAmbient: [],
    readComparisonCount: 0,
    readComparisons: [],
  };
}

async function compareHostedPluginReads(
  catalog: CodexPluginCatalog,
  marketplaces: CodexHostedMarketplaceSummary[],
  client: CodexAppServerMarketplaceClient,
  maxReadProbes: number,
): Promise<CodexHostedMarketplaceReadComparison[]> {
  if (!client.readPlugin || maxReadProbes <= 0) return [];
  const probes = matchedReadProbes(catalog, marketplaces).slice(0, maxReadProbes);
  const comparisons: CodexHostedMarketplaceReadComparison[] = [];

  for (const probe of probes) {
    try {
      const raw = await client.readPlugin({
        pluginName: probe.hosted.name,
        remoteMarketplaceName: probe.marketplace.name,
      });
      const read = normalizePluginRead(raw, probe.hosted.marketplaceName);
      comparisons.push({
        pluginName: probe.hosted.name,
        marketplaceName: probe.marketplace.name,
        ambientPluginId: probe.ambient.id,
        ...(probe.hosted.id ? { hostedPluginId: probe.hosted.id } : {}),
        status: read.name === probe.ambient.name ? "matched" : "mismatch",
        readName: read.name,
        ...(read.displayName ? { displayName: read.displayName } : {}),
        skillCount: read.skillCount,
        mcpServerCount: read.mcpServerCount,
        appCount: read.appCount,
      });
    } catch (error) {
      comparisons.push({
        pluginName: probe.hosted.name,
        marketplaceName: probe.marketplace.name,
        ambientPluginId: probe.ambient.id,
        ...(probe.hosted.id ? { hostedPluginId: probe.hosted.id } : {}),
        status: "error",
        error: errorMessage(error),
      });
    }
  }

  return comparisons;
}

function matchedReadProbes(
  catalog: CodexPluginCatalog,
  marketplaces: CodexHostedMarketplaceSummary[],
): { ambient: CodexPluginCatalog["plugins"][number]; marketplace: CodexHostedMarketplaceSummary; hosted: CodexHostedMarketplacePluginSummary }[] {
  const ambientByName = new Map([...catalog.plugins, ...catalog.importCandidates].map((plugin) => [plugin.name, plugin]));
  const probes: { ambient: CodexPluginCatalog["plugins"][number]; marketplace: CodexHostedMarketplaceSummary; hosted: CodexHostedMarketplacePluginSummary }[] = [];
  for (const marketplace of marketplaces) {
    for (const hosted of marketplace.plugins) {
      const ambient = ambientByName.get(hosted.name);
      if (ambient) probes.push({ ambient, marketplace, hosted });
    }
  }
  return probes;
}

function normalizePluginRead(raw: unknown, marketplaceName: string): {
  name: string;
  displayName?: string;
  skillCount: number;
  mcpServerCount: number;
  appCount: number;
} {
  const record = asRecord(raw);
  const plugin = asRecord(record.plugin ?? raw);
  const summary = asRecord(plugin.summary ?? record.summary);
  const pluginInterface = asRecord(plugin.interface);
  const summaryInterface = asRecord(summary.interface);
  const id = stringValue(plugin.id) ?? stringValue(summary.id);
  const name = stringValue(plugin.name) ?? stringValue(summary.name) ?? pluginNameFromId(id) ?? "";
  const displayName = stringValue(summaryInterface.displayName) ?? stringValue(pluginInterface.displayName);
  return {
    name,
    ...(displayName ? { displayName } : {}),
    skillCount: asArray(plugin.skills ?? summary.skills).length,
    mcpServerCount: asArray(plugin.mcpServers ?? plugin.mcp_servers ?? summary.mcpServers ?? summary.mcp_servers).length,
    appCount: asArray(plugin.apps ?? summary.apps).length + (marketplaceName && plugin.appsPath ? 1 : 0),
  };
}

function normalizePluginList(raw: unknown): NormalizedAppServerPluginList {
  const record = asRecord(raw);
  const marketplacesRaw = asArray(record.marketplaces);
  return {
    featuredPluginIds: asArray(record.featuredPluginIds).flatMap((value) => (typeof value === "string" ? [value] : [])),
    marketplaceLoadErrors: asArray(record.marketplaceLoadErrors).map((value) => errorMessage(value)),
    marketplaces: marketplacesRaw.map(normalizeMarketplace).filter((marketplace) => marketplace.name.length > 0),
  };
}

function normalizeMarketplace(raw: unknown): CodexHostedMarketplaceSummary {
  const record = asRecord(raw);
  const name = stringValue(record.name) ?? stringValue(record.marketplaceName) ?? stringValue(record.id) ?? "unknown";
  const displayName = stringValue(asRecord(record.interface).displayName) ?? stringValue(record.displayName) ?? stringValue(record.title);
  const plugins = asArray(record.plugins)
    .map((plugin) => normalizePlugin(plugin, name))
    .filter((plugin) => plugin.name.length > 0);
  return {
    name,
    marketplaceKind: "hosted-codex",
    ...(displayName ? { displayName } : {}),
    ...optionalStringField("path", record.path ?? record.marketplacePath),
    ...optionalStringField("source", record.source),
    pluginCount: numberValue(record.pluginCount) ?? plugins.length,
    plugins,
  };
}

function normalizePlugin(raw: unknown, marketplaceName: string): CodexHostedMarketplacePluginSummary {
  const record = asRecord(raw);
  const nestedPlugin = asRecord(record.plugin);
  const summary = asRecord(record.summary);
  const nestedInterface = asRecord(nestedPlugin.interface ?? summary.interface ?? record.interface);
  const id = stringValue(record.id) ?? stringValue(nestedPlugin.id) ?? stringValue(summary.id);
  const name = stringValue(record.name) ?? stringValue(nestedPlugin.name) ?? stringValue(summary.name) ?? pluginNameFromId(id) ?? "";
  const displayName = stringValue(record.displayName) ?? stringValue(nestedInterface.displayName);
  const source = asRecord(record.source ?? nestedPlugin.source);
  return {
    ...(id ? { id } : {}),
    name,
    marketplaceName,
    marketplaceKind: "hosted-codex",
    ...(displayName ? { displayName } : {}),
    ...optionalBooleanField("installed", record.installed),
    ...optionalBooleanField("enabled", record.enabled),
    ...optionalStringField("sourceType", source.type ?? source.source ?? record.sourceType),
    ...optionalStringField("authPolicy", record.authPolicy ?? nestedPlugin.authPolicy ?? summary.authPolicy),
  };
}

class StdioCodexAppServerMarketplaceClient implements CodexAppServerMarketplaceClient {
  readonly sourceLabel: string;
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private readonly pending = new Map<string, PendingRequest>();
  private initialized: CodexAppServerInitializeResult | undefined;

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly timeoutMs = 10_000,
  ) {
    this.sourceLabel = `${command} ${args.join(" ")}`.trim();
  }

  async initialize(): Promise<CodexAppServerInitializeResult | undefined> {
    if (this.initialized) return this.initialized;
    await this.start();
    const result = await this.request("initialize", {
      clientInfo: { name: "Ambient Desktop", title: "Ambient Desktop", version: "0.1.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: [] },
    });
    this.initialized = normalizeInitializeResult(result);
    return this.initialized;
  }

  async listPlugins(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.request("plugin/list", params);
  }

  async readPlugin(params: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    return this.request("plugin/read", params);
  }

  dispose(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Codex app-server marketplace client was disposed."));
      this.pending.delete(id);
    }
    this.child?.kill();
    this.child = undefined;
  }

  private async start(): Promise<void> {
    if (this.child) return;
    this.child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk.toString("utf8")));
    this.child.stderr.on("data", () => undefined);
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code, signal) => {
      this.rejectAll(new Error(`Codex app-server exited before marketplace probe completed (code=${code ?? "unknown"}, signal=${signal ?? "none"}).`));
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.child?.stdin.writable) throw new Error("Codex app-server stdin is not writable.");
    const id = `ambient-marketplace:${method}:${randomUUID()}`;
    const message = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server ${method} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.child?.stdin.write(`${message}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const record = asRecord(message);
    const id = stringValue(record.id);
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (record.error) pending.reject(new Error(appServerErrorMessage(record.error, pending.method)));
    else pending.resolve(record.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function normalizeInitializeResult(raw: unknown): CodexAppServerInitializeResult | undefined {
  const record = asRecord(raw);
  if (Object.keys(record).length === 0) return undefined;
  return {
    ...optionalStringField("codexHome", record.codexHome),
    ...optionalStringField("platformFamily", record.platformFamily),
    ...optionalStringField("platformOs", record.platformOs),
    ...optionalStringField("userAgent", record.userAgent),
  };
}

function parseArgsEnv(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    return value.split(" ").map((item) => item.trim()).filter(Boolean);
  }
  return undefined;
}

function appServerErrorMessage(raw: unknown, method: string): string {
  const error = asRecord(raw);
  return stringValue(error.message) ?? `Codex app-server ${method} request failed.`;
}

function pluginNameFromId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.split("@")[0] || undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalStringField<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const string = stringValue(value);
  return string ? { [key]: string } as Partial<Record<K, string>> : {};
}

function optionalBooleanField<K extends string>(key: K, value: unknown): Partial<Record<K, boolean>> {
  return typeof value === "boolean" ? ({ [key]: value } as Partial<Record<K, boolean>>) : {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const message = stringValue(asRecord(error).message);
  if (message) return message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
