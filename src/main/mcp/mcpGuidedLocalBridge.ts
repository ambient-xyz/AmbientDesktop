import { parseMcpAutowireCandidate, validateMcpAutowireCandidate, type McpAutowireCandidate, type McpAutowireValidationIssue, type McpAutowireValidationReport } from "../mcp-autowire/mcpAutowireSchemas";
import type { ToolHiveInstalledServerSourceIdentity, ToolHiveInstallReviewState } from "../tool-runtime/toolHiveRuntimeService";

export interface McpGuidedLocalBridgePreviewInput {
  candidate: unknown;
  expectedCandidateHash?: string;
}

export interface McpGuidedLocalBridgePreview {
  serverId: string;
  catalogSource: "guided-local-bridge";
  candidate: McpAutowireCandidate;
  validation: McpAutowireValidationReport;
  bridge: McpGuidedLocalBridgeEndpointPlan;
  setupCheckpoints: string[];
  hardBlockers: string[];
  warnings: string[];
}

export interface McpGuidedLocalBridgeEndpointPlan {
  host: string;
  port: number;
  transport: "local-http" | "sse";
  commandHint?: string;
  bridgeBaseUrl: string;
  bridgeProbeUrl: string;
  upstreamAppUrl?: string;
  allowedHosts: string[];
  allowedPorts: number[];
  localApps: string[];
  setupSteps: string[];
  expectedTools: string[];
}

export interface McpGuidedLocalBridgePreflightInput extends McpGuidedLocalBridgePreviewInput {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface McpGuidedLocalBridgePreflightResult {
  preview: McpGuidedLocalBridgePreview;
  status: "ready" | "setup-required" | "blocked";
  checks: McpGuidedLocalBridgePreflightCheck[];
}

export interface McpGuidedLocalBridgePreflightCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "skipped";
  detail: string;
  url?: string;
  statusCode?: number;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const defaultPreflightTimeoutMs = 2_000;

export function previewGuidedLocalBridge(input: McpGuidedLocalBridgePreviewInput): McpGuidedLocalBridgePreview {
  const candidate = parseMcpAutowireCandidate(input.candidate);
  const validation = validateMcpAutowireCandidate(candidate);
  const bridgeSpec = guidedLocalBridgeEndpointPlan(candidate);
  const hardBlockers = [
    ...validation.blockers.filter((issue) => issue.code !== "open_question.blocks_install").map(validationIssueText),
    ...candidateHashMismatchBlocker(input.expectedCandidateHash, validation.candidateHash),
    ...bridgeSpec.blockers,
  ];
  const setupCheckpoints = [
    ...(candidate.runtime.localBridge?.setupSteps ?? []),
    ...candidate.openQuestions.map((question) => question.question),
    ...validation.blockers.filter((issue) => issue.code === "open_question.blocks_install").map((issue) => issue.message),
  ];
  const warnings = [
    ...validation.warnings.map(validationIssueText),
    ...bridgeSpec.warnings,
  ];
  return {
    serverId: candidate.id,
    catalogSource: "guided-local-bridge",
    candidate,
    validation,
    bridge: bridgeSpec.plan,
    setupCheckpoints: uniqueStrings(setupCheckpoints),
    hardBlockers,
    warnings,
  };
}

export async function runGuidedLocalBridgePreflight(input: McpGuidedLocalBridgePreflightInput): Promise<McpGuidedLocalBridgePreflightResult> {
  const preview = previewGuidedLocalBridge(input);
  if (preview.hardBlockers.length) {
    return {
      preview,
      status: "blocked",
      checks: [
        {
          id: "candidate-review",
          label: "Candidate review",
          status: "fail",
          detail: `${preview.hardBlockers.length} hard blocker${preview.hardBlockers.length === 1 ? "" : "s"} must be resolved before any local bridge preflight.`,
        },
      ],
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(250, Math.min(30_000, Math.floor(input.timeoutMs ?? defaultPreflightTimeoutMs)));
  const checks: McpGuidedLocalBridgePreflightCheck[] = [
    {
      id: "candidate-review",
      label: "Candidate review",
      status: "pass",
      detail: "Candidate is a reviewed guided-local bridge shape. Ambient will not install or start local software.",
    },
    await probeLocalEndpoint({
      id: "mcp-bridge",
      label: "MCP bridge endpoint",
      url: preview.bridge.bridgeProbeUrl,
      fetchImpl,
      timeoutMs,
      signal: input.signal,
      accept: preview.bridge.transport === "sse" ? "text/event-stream, text/plain, */*" : "application/json, text/plain, */*",
    }),
  ];
  if (preview.bridge.upstreamAppUrl) {
    checks.push(await probeLocalEndpoint({
      id: "upstream-local-app",
      label: `${preview.bridge.localApps[0] ?? "Local app"} HTTP endpoint`,
      url: preview.bridge.upstreamAppUrl,
      fetchImpl,
      timeoutMs,
      signal: input.signal,
      accept: "application/json, text/plain, */*",
    }));
  }
  const failed = checks.some((check) => check.status === "fail");
  return {
    preview,
    status: failed ? "setup-required" : "ready",
    checks,
  };
}

export function mcpGuidedLocalBridgePreviewText(preview: McpGuidedLocalBridgePreview): string {
  const commandHint = preview.hardBlockers.length
    ? preview.bridge.commandHint ? "- User-run command shape: hidden until hard blockers are resolved." : undefined
    : preview.bridge.commandHint ? `- User-run command shape: ${preview.bridge.commandHint}` : undefined;
  return [
    `Guided setup ${preview.candidate.displayName}`,
    "Catalog source: guided-local-bridge",
    "Outcome: guided-setup-required",
    `${preview.candidate.displayName} requires user-guided local setup. Ambient will not install Ghidra, install extensions, run package managers, start bridge commands, or containerize the local app.`,
    "",
    `Source: ${sourceSummary(preview.candidate)}`,
    `Runtime: ${runtimeSummary(preview.candidate)}`,
    `Permissions: ${permissionSummary(preview.candidate)}`,
    `Risk: ${preview.candidate.riskSummary.level} - ${preview.candidate.riskSummary.reasons.join(" ")}`,
    "",
    "Bridge plan:",
    `- Local MCP endpoint: ${preview.bridge.bridgeBaseUrl}`,
    `- Probe URL: ${preview.bridge.bridgeProbeUrl}`,
    preview.bridge.upstreamAppUrl ? `- Upstream local app endpoint: ${preview.bridge.upstreamAppUrl}` : undefined,
    commandHint,
    `- Allowed hosts: ${preview.bridge.allowedHosts.join(", ") || "none"}`,
    `- Allowed ports: ${preview.bridge.allowedPorts.join(", ") || "none"}`,
    preview.bridge.localApps.length ? `- Local app boundary: ${preview.bridge.localApps.join(", ")}` : undefined,
    "",
    preview.setupCheckpoints.length ? `Setup checkpoints:\n${preview.setupCheckpoints.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : "Setup checkpoints: none.",
    preview.hardBlockers.length ? `Hard blockers:\n${preview.hardBlockers.map((item) => `- ${item}`).join("\n")}` : "Hard blockers: none.",
    preview.warnings.length ? `Warnings:\n${preview.warnings.map((item) => `- ${item}`).join("\n")}` : "Warnings: none.",
    "",
    "Next: after the user completes setup and approves a local check, call ambient_mcp_guided_bridge_preflight with this exact candidate.",
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpGuidedLocalBridgePreflightText(result: McpGuidedLocalBridgePreflightResult): string {
  return [
    `Guided bridge preflight for ${result.preview.candidate.displayName}`,
    `Status: ${result.status}`,
    "No local software was installed or started by Ambient.",
    "",
    "Checks:",
    ...result.checks.map((check) => {
      const code = typeof check.statusCode === "number" ? ` HTTP ${check.statusCode}` : "";
      const url = check.url ? ` ${check.url}` : "";
      return `- ${check.label}: ${check.status}${code}${url} - ${check.detail}`;
    }),
    "",
    result.status === "ready"
      ? "Next: if the user wants Ambient to use this bridge, call ambient_mcp_guided_bridge_register with this exact candidate."
      : "Next: complete the setup checkpoints, start Ghidra and the bridge yourself, then rerun the preflight.",
  ].join("\n");
}

export function mcpGuidedLocalBridgeWorkloadName(candidateId: string): string {
  const safe = candidateId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "guided-local-bridge";
  return `ambient-${safe}`;
}

export function mcpGuidedLocalBridgePermissionProfile(preview: McpGuidedLocalBridgePreview): Record<string, unknown> {
  return {
    network: {
      outbound: {
        insecure_allow_all: false,
        allow_host: preview.bridge.allowedHosts,
        allow_port: preview.bridge.allowedPorts,
      },
    },
    local_bridge: {
      endpoint: preview.bridge.bridgeProbeUrl,
      upstream_app_endpoint: preview.bridge.upstreamAppUrl,
      local_apps: preview.bridge.localApps,
      user_started: true,
    },
  };
}

export function mcpGuidedLocalBridgeSourceIdentity(preview: McpGuidedLocalBridgePreview): ToolHiveInstalledServerSourceIdentity {
  const candidate = preview.candidate;
  const identity: ToolHiveInstalledServerSourceIdentity = {
    runtimeLane: "guided-local-bridge",
    sourceKind: candidate.runtime.sourceKind,
    candidateId: candidate.id,
    riskLevel: candidate.riskSummary.level,
    toolHiveRunSource: preview.bridge.bridgeProbeUrl,
  };
  if (candidate.source.url) identity.sourceUrl = candidate.source.url;
  if (candidate.source.packageName) identity.packageName = candidate.source.packageName;
  if (preview.validation.candidateHash) identity.candidateHash = preview.validation.candidateHash;
  return identity;
}

export function mcpGuidedLocalBridgeInstallReviewState(preview: McpGuidedLocalBridgePreview, reviewedAt: string): ToolHiveInstallReviewState {
  return {
    status: preview.hardBlockers.length ? "needs-review" : "reviewed",
    outcome: preview.validation.outcome,
    reviewedAt,
    summary: `${preview.candidate.displayName} registered as a user-guided local bridge after loopback preflight. Ambient did not install, launch, modify, or stop local software.`,
    warningCount: preview.warnings.length,
    blockerCount: preview.hardBlockers.length,
  };
}

function guidedLocalBridgeEndpointPlan(candidate: McpAutowireCandidate): {
  plan: McpGuidedLocalBridgeEndpointPlan;
  blockers: string[];
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (candidate.recommendedLane !== "guided-local-bridge") {
    blockers.push(`Guided local bridge requires recommendedLane guided-local-bridge, got ${candidate.recommendedLane}.`);
  }
  if (candidate.runtime.provider !== "guided-local") {
    blockers.push(`Guided local bridge requires guided-local runtime provider, got ${candidate.runtime.provider}.`);
  }
  if (candidate.runtime.sourceKind !== "local-bridge") {
    blockers.push(`Guided local bridge requires runtime sourceKind local-bridge, got ${candidate.runtime.sourceKind}.`);
  }
  if (candidate.runtime.transport !== "local-http" && candidate.runtime.transport !== "sse") {
    blockers.push(`Guided local bridge requires local-http or sse transport, got ${candidate.runtime.transport}.`);
  }
  if (candidate.permissions.network.mode !== "local-only") {
    blockers.push(`Guided local bridge requires local-only network mode, got ${candidate.permissions.network.mode}.`);
  }
  const nonLoopbackHosts = candidate.permissions.network.allowHosts.filter((host) => !isLoopbackHost(host));
  if (nonLoopbackHosts.length) {
    blockers.push(`Guided local bridge hosts must be loopback-only; found ${nonLoopbackHosts.join(", ")}.`);
  }
  if (candidate.permissions.filesystem.workspaceRead || candidate.permissions.filesystem.workspaceWrite || candidate.permissions.filesystem.extraMounts.length) {
    blockers.push("Guided local bridge candidates must not request Ambient filesystem grants in the bridge setup path.");
  }

  const localBridge = candidate.runtime.localBridge;
  const host = localBridge?.host ?? "127.0.0.1";
  const port = localBridge?.port ?? 0;
  if (!localBridge) blockers.push("Guided local bridge requires runtime.localBridge metadata.");
  if (!isLoopbackHost(host)) blockers.push(`Guided local bridge host must be loopback-only, got ${host}.`);
  if (!port) blockers.push("Guided local bridge requires runtime.localBridge.port.");
  if (port && !candidate.permissions.network.allowPorts.includes(port)) {
    blockers.push(`Guided local bridge port ${port} must be present in permissions.network.allowPorts.`);
  }
  if (!candidate.permissions.localApps.length) {
    warnings.push("Guided local bridge does not declare a local app boundary; the user-facing setup should name the app being controlled.");
  }

  const bridgeBaseUrl = port ? `http://${urlHost(host)}:${port}` : "http://127.0.0.1:0";
  const bridgeProbeUrl = candidate.runtime.transport === "sse" ? `${bridgeBaseUrl}/sse` : `${bridgeBaseUrl}/`;
  const upstreamAppUrl = inferUpstreamLocalAppUrl(localBridge?.commandHint);
  if (upstreamAppUrl) {
    const parsed = safeLocalHttpUrl(upstreamAppUrl);
    if (!parsed.ok) {
      blockers.push(parsed.message);
    } else if (!candidate.permissions.network.allowPorts.includes(parsed.port)) {
      blockers.push(`Upstream local app port ${parsed.port} from ${upstreamAppUrl} must be present in permissions.network.allowPorts.`);
    }
  }

  return {
    plan: {
      host,
      port,
      transport: candidate.runtime.transport === "sse" ? "sse" : "local-http",
      ...(localBridge?.commandHint ? { commandHint: localBridge.commandHint } : {}),
      bridgeBaseUrl,
      bridgeProbeUrl,
      ...(upstreamAppUrl ? { upstreamAppUrl } : {}),
      allowedHosts: candidate.permissions.network.allowHosts,
      allowedPorts: candidate.permissions.network.allowPorts,
      localApps: candidate.permissions.localApps,
      setupSteps: localBridge?.setupSteps ?? [],
      expectedTools: candidate.validationPlan.expectedTools,
    },
    blockers,
    warnings,
  };
}

async function probeLocalEndpoint(input: {
  id: string;
  label: string;
  url: string;
  accept: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<McpGuidedLocalBridgePreflightCheck> {
  const safe = safeLocalHttpUrl(input.url);
  if (!safe.ok) {
    return { id: input.id, label: input.label, status: "fail", detail: safe.message, url: input.url };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const abortListener = () => controller.abort();
  input.signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const response = await input.fetchImpl(input.url, {
      method: "GET",
      headers: { accept: input.accept },
      signal: controller.signal,
    });
    void response.body?.cancel().catch(() => undefined);
    const pass = response.status >= 200 && response.status < 500;
    return {
      id: input.id,
      label: input.label,
      status: pass ? "pass" : "fail",
      detail: pass ? "Endpoint responded on the approved loopback address." : "Endpoint responded with a server error.",
      url: input.url,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      id: input.id,
      label: input.label,
      status: "fail",
      detail: error instanceof Error ? error.message : "Endpoint did not respond.",
      url: input.url,
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortListener);
  }
}

function validationIssueText(issue: McpAutowireValidationIssue): string {
  return `${issue.code}: ${issue.message}`;
}

function candidateHashMismatchBlocker(expected: string | undefined, actual: string | undefined): string[] {
  if (!expected || !actual || expected === actual) return [];
  return [`Candidate hash mismatch: expected ${expected}, got ${actual}. Re-run autowire plan or review the current candidate before proceeding.`];
}

function inferUpstreamLocalAppUrl(commandHint: string | undefined): string | undefined {
  if (!commandHint) return undefined;
  const match = commandHint.match(/--ghidra-server\s+(\S+)/);
  if (match?.[1]) return match[1].replace(/["']$/, "");
  return undefined;
}

function safeLocalHttpUrl(value: string): { ok: true; port: number } | { ok: false; message: string } {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:") return { ok: false, message: `Guided local bridge URL must use http loopback, got ${value}.` };
    if (parsed.username || parsed.password) return { ok: false, message: "Guided local bridge URL must not contain credentials." };
    if (!isLoopbackHost(parsed.hostname)) return { ok: false, message: `Guided local bridge URL must target loopback, got ${parsed.hostname}.` };
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 80;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, message: `Guided local bridge URL has invalid port: ${value}.` };
    return { ok: true, port };
  } catch {
    return { ok: false, message: `Invalid guided local bridge URL: ${value}.` };
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function urlHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sourceSummary(candidate: McpAutowireCandidate): string {
  const pieces = [
    `source kind ${candidate.source.kind}`,
    candidate.source.packageName ? `package ${candidate.source.packageName}` : undefined,
    candidate.source.url ? `url ${candidate.source.url}` : undefined,
    candidate.source.resolvedCommit ? `commit ${candidate.source.resolvedCommit}` : undefined,
  ].filter(Boolean);
  return pieces.join("; ");
}

function runtimeSummary(candidate: McpAutowireCandidate): string {
  const bridge = candidate.runtime.localBridge
    ? ` local bridge ${candidate.runtime.localBridge.host ?? "host?"}:${candidate.runtime.localBridge.port ?? "port?"}`
    : "";
  return `${candidate.runtime.provider}/${candidate.runtime.sourceKind}/${candidate.runtime.transport}${bridge}`;
}

function permissionSummary(candidate: McpAutowireCandidate): string {
  const network = candidate.permissions.network;
  const hosts = network.allowHosts.length ? ` hosts ${network.allowHosts.join(", ")}` : "";
  const ports = network.allowPorts.length ? ` ports ${network.allowPorts.join(", ")}` : "";
  const apps = candidate.permissions.localApps.length ? ` local apps ${candidate.permissions.localApps.join(", ")}` : "";
  return `Network ${network.mode}${hosts}${ports}; workspace read=${candidate.permissions.filesystem.workspaceRead}; workspace write=${candidate.permissions.filesystem.workspaceWrite}; extra mounts=${candidate.permissions.filesystem.extraMounts.length}${apps}.`;
}
