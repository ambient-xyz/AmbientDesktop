import { isRecord } from "./toolHiveRuntimeStateStore";
import type { ToolHiveAllowedCommand, ToolHiveCommandResult } from "./toolHiveCommandRunner";
import type {
  ToolHiveBuildProtocolImageInput,
  ToolHiveListWorkloadsOptions,
  ToolHiveRegistryInfoOptions,
  ToolHiveRegistryListOptions,
  ToolHiveRuntimePreflight,
  ToolHiveWaitForWorkloadOptions,
  ToolHiveWorkloadSummary,
} from "./toolHiveRuntimeTypes";

type ToolHiveRunAllowedOptions = {
  throwOnNonZero?: boolean;
  timeoutMs?: number;
};

interface ToolHiveRuntimeCommandControllerOptions {
  ambientGroup: string;
  runAllowed: (command: ToolHiveAllowedCommand, args: string[], options?: ToolHiveRunAllowedOptions) => Promise<ToolHiveCommandResult>;
  timeoutMs: () => number;
  removeInstalledServerState: (workloadName: string) => Promise<void>;
  validators: {
    assertSafeToolHiveRef: (value: string, label: string) => void;
    assertSafeToolHiveRunSource: (value: string) => void;
    assertSafeToolHiveRuntimeImage: (value: string) => void;
    assertSafeServerArg: (value: string) => void;
    assertSafeWorkloadName: (value: string) => void;
  };
}

export class ToolHiveRuntimeCommandController {
  constructor(private readonly options: ToolHiveRuntimeCommandControllerOptions) {}

  async version(): Promise<ToolHiveCommandResult> {
    return this.options.runAllowed("version", ["version"]);
  }

  async registryList(options: ToolHiveRegistryListOptions = {}): Promise<unknown[]> {
    const args = ["registry", "list", "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.options.runAllowed("registry-list", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry list");
    if (!Array.isArray(parsed)) throw new Error("ToolHive registry list returned JSON that is not an array.");
    return parsed;
  }

  async registryInfo(serverId: string, options: ToolHiveRegistryInfoOptions = {}): Promise<Record<string, unknown>> {
    this.options.validators.assertSafeToolHiveRef(serverId, "serverId");
    const args = ["registry", "info", serverId, "--format", "json"];
    if (options.refresh) args.push("--refresh");
    const result = await this.options.runAllowed("registry-info", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive registry info");
    if (!isRecord(parsed)) throw new Error("ToolHive registry info returned JSON that is not an object.");
    return parsed;
  }

  async preflightRuntime(timeoutSeconds = 5): Promise<ToolHiveRuntimePreflight> {
    const timeout = Math.max(1, Math.min(60, Math.floor(timeoutSeconds)));
    const command = await this.options.runAllowed("runtime-check", ["runtime", "check", "--timeout", String(timeout)], {
      throwOnNonZero: false,
      timeoutMs: (timeout + 2) * 1000,
    });
    const output = [command.stdout, command.stderr].join("\n").trim();
    return {
      ok: command.exitCode === 0,
      message:
        command.exitCode === 0
          ? output || "ToolHive container runtime is available."
          : output || "ToolHive container runtime is not available.",
      command,
    };
  }

  async buildProtocolImage(input: ToolHiveBuildProtocolImageInput): Promise<ToolHiveCommandResult> {
    this.options.validators.assertSafeToolHiveRunSource(input.sourceRef);
    this.options.validators.assertSafeToolHiveRuntimeImage(input.tag);
    if (input.runtimeImage) this.options.validators.assertSafeToolHiveRuntimeImage(input.runtimeImage);
    const serverArgs = input.serverArgs ?? [];
    for (const arg of serverArgs) {
      this.options.validators.assertSafeServerArg(arg);
    }
    const args = ["build", "--tag", input.tag];
    if (input.runtimeImage) args.push("--runtime-image", input.runtimeImage);
    args.push(input.sourceRef);
    if (serverArgs.length) {
      args.push("--");
      args.push(...serverArgs);
    }
    return this.options.runAllowed("build", args, { timeoutMs: Math.max(this.options.timeoutMs(), 300_000) });
  }

  async listGroups(): Promise<string[]> {
    const result = await this.options.runAllowed("group-list", ["group", "list"]);
    return parseToolHiveGroupList(result.stdout);
  }

  async ensureAmbientGroup(): Promise<ToolHiveCommandResult | undefined> {
    const groups = await this.listGroups();
    if (groups.includes(this.options.ambientGroup)) return undefined;
    return this.options.runAllowed("group-create", ["group", "create", this.options.ambientGroup]);
  }

  async listWorkloads(options: ToolHiveListWorkloadsOptions = {}): Promise<unknown[]> {
    const args = ["list", "--format", "json"];
    if (options.all) args.push("--all");
    args.push("--group", options.group ?? this.options.ambientGroup);
    const result = await this.options.runAllowed("list", args);
    const parsed = parseJsonOutput(result.stdout, "ToolHive workload list");
    if (!Array.isArray(parsed)) throw new Error("ToolHive workload list returned JSON that is not an array.");
    return parsed;
  }

  async listAmbientWorkloadSummaries(options: Omit<ToolHiveListWorkloadsOptions, "group"> = {}): Promise<ToolHiveWorkloadSummary[]> {
    return (await this.listWorkloads({ ...options, group: this.options.ambientGroup })).map((workload) => ({
      name: stringField(workload, ["name", "workload_name", "workloadName"]),
      status: stringField(workload, ["status", "state"]),
      group: stringField(workload, ["group"]),
      endpoint: toolHiveWorkloadEndpoint(workload),
      raw: workload,
    }));
  }

  async waitForAmbientWorkload(workloadName: string, options: ToolHiveWaitForWorkloadOptions = {}): Promise<ToolHiveWorkloadSummary> {
    this.options.validators.assertSafeWorkloadName(workloadName);
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 60_000));
    const pollIntervalMs = Math.max(50, Math.floor(options.pollIntervalMs ?? 500));
    const requireEndpoint = options.requireEndpoint !== false;
    const startedAt = Date.now();
    let lastSummary: ToolHiveWorkloadSummary | undefined;
    let lastError: string | undefined;

    while (Date.now() - startedAt <= timeoutMs) {
      try {
        const summary = (await this.listAmbientWorkloadSummaries({ all: true })).find((candidate) => candidate.name === workloadName);
        if (summary) {
          lastSummary = summary;
          const status = summary.status?.toLowerCase();
          const statusReady = !status || status === "running" || status === "started" || status === "healthy";
          if (statusReady && (!requireEndpoint || summary.endpoint)) return summary;
        }
      } catch (error) {
        lastError = errorMessage(error);
      }
      await delay(pollIntervalMs);
    }

    const status = lastSummary
      ? `last status=${lastSummary.status ?? "unknown"} endpoint=${lastSummary.endpoint ?? "none"}`
      : lastError
        ? `last error=${lastError}`
        : "workload was not listed";
    throw new Error(`ToolHive workload ${workloadName} did not become ready within ${timeoutMs} ms (${status}).`);
  }

  async stopWorkload(workloadName: string, timeoutSeconds = 30): Promise<ToolHiveCommandResult> {
    this.options.validators.assertSafeWorkloadName(workloadName);
    const timeout = Math.max(1, Math.min(300, Math.floor(timeoutSeconds)));
    return this.options.runAllowed("stop", ["stop", workloadName, "--timeout", String(timeout)]);
  }

  async removeWorkload(workloadName: string): Promise<ToolHiveCommandResult> {
    this.options.validators.assertSafeWorkloadName(workloadName);
    const result = await this.options.runAllowed("rm", ["rm", workloadName]);
    if (result.exitCode === 0) await this.options.removeInstalledServerState(workloadName);
    return result;
  }

  async removeInstalledServerState(workloadName: string): Promise<void> {
    this.options.validators.assertSafeWorkloadName(workloadName);
    await this.options.removeInstalledServerState(workloadName);
  }

  async readWorkloadLogs(workloadName: string, lines = 80): Promise<ToolHiveCommandResult> {
    this.options.validators.assertSafeWorkloadName(workloadName);
    const tail = Math.max(1, Math.min(500, Math.floor(lines)));
    const result = await this.options.runAllowed("logs", ["logs", workloadName, "--tail", String(tail)], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.options.timeoutMs(), 15_000),
    });
    if (result.exitCode === 0 || !toolHiveLogsTailFlagUnsupported(result)) return result;
    const fallback = await this.options.runAllowed("logs", ["logs", workloadName], {
      throwOnNonZero: false,
      timeoutMs: Math.max(this.options.timeoutMs(), 15_000),
    });
    return {
      ...fallback,
      stdout: tailTextLines(fallback.stdout, tail),
      stderr: tailTextLines(fallback.stderr, tail),
    };
  }
}

function parseJsonOutput(stdout: string, label: string): unknown {
  const normalized = normalizeToolHiveJsonOutput(stdout);
  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

function normalizeToolHiveJsonOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const lines = stdout.split(/\r?\n/);
  const jsonStart = lines.findIndex((line) => {
    const value = line.trimStart();
    return value.startsWith("{") || value.startsWith("[");
  });
  return jsonStart >= 0 ? lines.slice(jsonStart).join("\n").trim() : trimmed;
}

function parseToolHiveGroupList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "NAME")
    .filter((line) => !line.startsWith("A new version of ToolHive is available:"))
    .filter((line) => !line.startsWith("Currently running:"));
}

export function toolHiveWorkloadEndpoint(workload: unknown): string | undefined {
  const direct = stringField(workload, [
    "endpoint",
    "url",
    "proxy_url",
    "proxyUrl",
    "mcp_url",
    "mcpUrl",
    "sse_url",
    "sseUrl",
    "streamable_http_url",
    "streamableHttpUrl",
  ]);
  if (direct) return direct;
  if (!isRecord(workload)) return undefined;
  const endpoints = workload.endpoints;
  if (Array.isArray(endpoints)) {
    for (const endpoint of endpoints) {
      const value = typeof endpoint === "string" ? endpoint : stringField(endpoint, ["url", "endpoint", "proxyUrl", "proxy_url"]);
      if (value) return value;
    }
  }
  const ports = workload.ports;
  if (Array.isArray(ports)) {
    for (const port of ports) {
      if (!isRecord(port)) continue;
      const host = stringField(port, ["host", "hostIp", "host_ip"]) ?? "127.0.0.1";
      const hostPort = numberField(port, ["hostPort", "host_port", "publishedPort", "published_port", "port"]);
      if (hostPort) return `http://${host}:${hostPort}/mcp`;
    }
  }
  return undefined;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return undefined;
}

function numberField(value: unknown, keys: string[]): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) return Math.floor(entry);
    if (typeof entry === "string" && /^\d+$/.test(entry)) return Number(entry);
  }
  return undefined;
}

function toolHiveLogsTailFlagUnsupported(result: Pick<ToolHiveCommandResult, "stdout" | "stderr">): boolean {
  return /unknown flag:\s*(?:--tail|tail)|unknown shorthand flag|flag provided but not defined/i.test(`${result.stdout}\n${result.stderr}`);
}

function tailTextLines(text: string, lines: number): string {
  if (!text) return text;
  const hadTrailingNewline = /\r?\n$/.test(text);
  const split = text.replace(/\r?\n$/, "").split(/\r?\n/);
  const tailed = split.length <= lines ? split : split.slice(-lines);
  return `${tailed.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
