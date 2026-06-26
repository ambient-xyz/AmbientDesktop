import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { mcpAutowirePhase0Fixtures, mcpKatzillaInstallFailureReplay } from "./mcpAutowireFacade";
import type { ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import type { McpInstallGateResult } from "./mcpInstallGate";
import { createMcpServerPiToolDefinitions } from "./mcpServerPiTools";
import { ToolHiveRuntimeService, type ToolHiveCommandExecutor, type ToolHiveCommandInvocation } from "./mcpToolRuntimeFacade";
import type { McpAutowireCandidate } from "./mcpAutowireFacade";

function guidedBridgeWithRequiredSecret(): McpAutowireCandidate {
  const candidate = structuredClone(mcpAutowirePhase0Fixtures.ghidraMcp) as McpAutowireCandidate;
  candidate.id = "ghidramcp-secret-guided-local-bridge";
  candidate.displayName = "GhidraMCP With Token";
  candidate.secrets = [
    {
      name: "GHIDRA_BRIDGE_TOKEN",
      required: true,
      secret: true,
      purpose: "User-run bridge authentication token captured through Ambient-managed refs.",
      evidenceRefs: ["ghidramcp-readme"],
    },
  ];
  return candidate;
}

function sourceBuiltCustomImageCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: "source-built-katzilla-mcp",
    displayName: "Source Built Katzilla MCP",
    source: {
      kind: "github",
      url: "https://github.com/codeislaw101/katzilla-sdk",
      resolvedCommit: "abc1234deadbeef",
      packageName: "@katzilla/mcp",
      evidenceRefs: ["source-build-review"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "custom-image",
      transport: "stdio",
      package: {
        registryType: "oci",
        identifier: "ambient-source-built/katzilla-mcp:abc1234",
        digest: `sha256:${"d".repeat(64)}`,
        packageArguments: [],
      },
      updatePolicy: {
        mode: "pinned",
        reason: "Built from a reviewed source commit into a local OCI image with a recorded digest.",
        evidenceRefs: ["source-build-review"],
      },
      sourceBuild: {
        schemaVersion: "ambient-mcp-custom-source-build-v1",
        sourceUrl: "https://github.com/codeislaw101/katzilla-sdk",
        resolvedCommit: "abc1234deadbeef",
        recipeKind: "existing-reviewed-image",
        recipeHash: "e".repeat(64),
        imageIdentifier: "ambient-source-built/katzilla-mcp:abc1234",
        imageDigest: `sha256:${"d".repeat(64)}`,
        evidenceRefs: ["source-build-review"],
      },
      evidenceRefs: ["source-build-review"],
    },
    secrets: [],
    permissions: {
      network: { mode: "allowlist", allowHosts: ["api.katzilla.dev"], allowPorts: [443] },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [
          {
            path: "/tmp/ambient-katzilla-config",
            containerPath: "/config",
            mode: "read-only",
            purpose: "Mount reviewed custom source runtime config read-only.",
          },
        ],
      },
      localApps: [],
      evidenceRefs: ["source-build-review"],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
      expectedTools: ["query"],
      evidenceRefs: ["source-build-review"],
    },
    evidence: [
      {
        id: "source-build-review",
        type: "other",
        locator: "source-built fixture",
        summary: "Fixture models a reviewed source-built OCI image produced from a pinned commit.",
      },
    ],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Runs a reviewed local image built from pinned source."],
      evidenceRefs: ["source-build-review"],
    },
  };
}

function genericCloudApiHostBridgeCandidate(): McpAutowireCandidate {
  const candidate = structuredClone(mcpKatzillaInstallFailureReplay.candidate) as McpAutowireCandidate;
  candidate.id = "katzilla-host-bridge-blocked";
  candidate.recommendedLane = "guided-local-bridge";
  candidate.runtime = {
    provider: "guided-local",
    sourceKind: "local-bridge",
    transport: "sse",
    localBridge: {
      commandHint: "npx supergateway --output streamable-http --port 8199 -- npx -y @katzilla/mcp",
      host: "127.0.0.1",
      port: 8199,
      setupSteps: ["Run a host bridge for the generic cloud/API MCP package."],
    },
    evidenceRefs: ["katzilla-mcp-readme"],
  };
  candidate.permissions = {
    network: {
      mode: "allowlist",
      allowHosts: ["127.0.0.1", "api.katzilla.dev"],
      allowPorts: [8199, 443],
      justification: "This intentionally models an invalid generic cloud/API MCP host bridge fallback.",
    },
    filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
    localApps: [],
    evidenceRefs: ["katzilla-mcp-readme"],
  };
  return candidate;
}

async function fixtureTools(
  options: {
    collaborationMode?: "agent" | "planner";
    authorizeInstall?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["authorizeInstall"];
    authorizeUninstall?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["authorizeUninstall"];
    authorizeGuidedLocalBridgePreflight?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["authorizeGuidedLocalBridgePreflight"];
    authorizeGuidedLocalBridgeRegister?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["authorizeGuidedLocalBridgeRegister"];
    guidedLocalBridgeFetchImpl?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["guidedLocalBridgeFetchImpl"];
    resolveCandidateRef?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["resolveCandidateRef"];
    containerRuntimeProbe?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["containerRuntimeProbe"];
    installGate?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["installGate"];
    defaultCapabilityImageResolver?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["defaultCapabilityImageResolver"];
    defaultCapabilityImagePuller?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["defaultCapabilityImagePuller"];
    onContainerRuntimeSetupNeeded?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["onContainerRuntimeSetupNeeded"];
    requestMcpSecret?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["requestMcpSecret"];
    mcpToolFetchImpl?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["mcpToolFetchImpl"];
    planRevisions?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["planRevisions"];
    putCandidateRef?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["putCandidateRef"];
    authorizeRuntimeRepair?: Parameters<typeof createMcpServerPiToolDefinitions>[0]["authorizeRuntimeRepair"];
    standardRunFailure?: {
      matchSource: string;
      stderr: string;
      exitCode?: number;
    };
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "ambient-mcp-server-tools-"));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);
  const calls: ToolHiveCommandInvocation[] = [];
  const runtimeSecretReads: Array<{
    kind: "container-env-file" | "remote-bearer-token-file";
    path: string;
    text: string;
  }> = [];
  const workloads = new Map<string, Record<string, unknown>>();
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    if (invocation.args.slice(0, 2).join(" ") === "registry list") return ok(JSON.stringify([context7Info, githubInfo]));
    if (invocation.args.slice(0, 2).join(" ") === "group list") return ok("NAME\nambient\ndefault\n");
    if (invocation.args.slice(0, 2).join(" ") === "group create") return ok("");
    if (invocation.args.slice(0, 2).join(" ") === "registry info") {
      const match = [context7Info, githubInfo].find((entry) => entry.name === invocation.args[2]);
      return match ? ok(JSON.stringify(match)) : { stdout: "", stderr: "not found", exitCode: 1 };
    }
    if (invocation.args.slice(0, 2).join(" ") === "runtime check") return ok("runtime ok\n");
    if (invocation.args[0] === "run") {
      if (options.standardRunFailure && invocation.args.includes(options.standardRunFailure.matchSource)) {
        return {
          stdout: "",
          stderr: options.standardRunFailure.stderr,
          exitCode: options.standardRunFailure.exitCode ?? 1,
        };
      }
      const envFile = optionalArgAfter(invocation.args, "--env-file");
      if (envFile) {
        runtimeSecretReads.push({
          kind: "container-env-file",
          path: envFile,
          text: await readFile(envFile, "utf8"),
        });
      }
      const bearerTokenFile = optionalArgAfter(invocation.args, "--remote-auth-bearer-token-file");
      if (bearerTokenFile) {
        runtimeSecretReads.push({
          kind: "remote-bearer-token-file",
          path: bearerTokenFile,
          text: await readFile(bearerTokenFile, "utf8"),
        });
      }
      const workloadName = argAfter(invocation.args, "--name");
      workloads.set(workloadName, { name: workloadName, status: "running", group: "ambient", proxy_url: "http://127.0.0.1:4411/mcp" });
      return ok("running\n");
    }
    if (invocation.args[0] === "list") {
      if (!workloads.size)
        workloads.set("ambient-stacklok-context7-a60a6283", {
          name: "ambient-stacklok-context7-a60a6283",
          status: "running",
          group: "ambient",
          proxy_url: "http://127.0.0.1:4411/mcp",
        });
      return ok(JSON.stringify([...workloads.values()]));
    }
    if (invocation.args[0] === "logs") {
      return ok(["server booted", "api_key=fixture-log-secret-token", "TypeError: kz.getTools is not a function"].join("\n"));
    }
    if (invocation.args[0] === "stop") return ok("stopped\n");
    if (invocation.args[0] === "rm") {
      workloads.delete(invocation.args[1]);
      return ok("removed\n");
    }
    return ok("[]");
  };
  const service = new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-22T00:00:00.000Z"),
  });
  const catalog = new McpInstallCatalog(service);
  const tools = createMcpServerPiToolDefinitions({
    catalog,
    toolHive: service,
    getThread: () => ({
      id: "thread-1",
      collaborationMode: options.collaborationMode ?? "agent",
      permissionMode: "workspace",
    }),
    workspace: {
      path: "/tmp/workspace",
      name: "workspace",
    },
    authorizeInstall: options.authorizeInstall,
    authorizeUninstall: options.authorizeUninstall,
    authorizeGuidedLocalBridgePreflight: options.authorizeGuidedLocalBridgePreflight,
    authorizeGuidedLocalBridgeRegister: options.authorizeGuidedLocalBridgeRegister,
    guidedLocalBridgeFetchImpl: options.guidedLocalBridgeFetchImpl,
    mcpToolFetchImpl: options.mcpToolFetchImpl ?? fakeToolHiveMcpFetch(),
    resolveCandidateRef: options.resolveCandidateRef,
    containerRuntimeProbe: options.containerRuntimeProbe ?? (() => fakeReadyContainerRuntimeProbe(service)),
    installGate: options.installGate,
    defaultCapabilityImageResolver: options.defaultCapabilityImageResolver ?? fakeDefaultCapabilityImageResolver,
    defaultCapabilityImagePuller: options.defaultCapabilityImagePuller ?? fakeDefaultCapabilityImagePuller,
    onContainerRuntimeSetupNeeded: options.onContainerRuntimeSetupNeeded,
    requestMcpSecret: options.requestMcpSecret,
    planRevisions: options.planRevisions,
    putCandidateRef: options.putCandidateRef,
    authorizeRuntimeRepair: options.authorizeRuntimeRepair,
  });
  return { tools, calls, service, catalog, root, userData, runtimeSecretReads };
}

async function fakeDefaultCapabilityImageResolver(input: {
  image: string;
  platform?: NodeJS.Platform | string;
  arch?: NodeJS.Architecture | string;
}) {
  const architecture: "amd64" | "arm64" = input.arch === "x64" ? "amd64" : "arm64";
  const digest = input.image.includes("@sha256:") ? `sha256:${input.image.split("@sha256:")[1]}` : undefined;
  return {
    status: "single-manifest" as const,
    originalImage: input.image,
    resolvedImage: input.image,
    registry: "ghcr.io",
    repository: "d4vinci/scrapling",
    targetPlatform: { os: "linux" as const, architecture },
    ...(digest ? { platformDigest: digest } : {}),
  };
}

async function fakeDefaultCapabilityImagePuller(input: {
  image: string;
  targetPlatform: { os: "linux"; architecture: "amd64" | "arm64" };
}) {
  return {
    runtime: "docker" as const,
    image: input.image,
    targetPlatform: input.targetPlatform,
    command: "docker",
    args: ["pull", "--platform", `${input.targetPlatform.os}/${input.targetPlatform.architecture}`, input.image],
    exitCode: 0,
    durationMs: 1,
    stdout: "pulled\n",
    stderr: "",
  };
}

async function fakeReadyContainerRuntimeProbe(service: ToolHiveRuntimeService): Promise<ContainerRuntimeProbeResult> {
  const preflight = await service.preflightRuntime(5);
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: preflight.ok ? "ready" : "installed-not-running",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-22T00:00:00.000Z",
    durationMs: preflight.command.durationMs,
    message: preflight.message,
    nextAction: preflight.ok ? "none" : "start-runtime",
    toolHive: {
      status: "ready",
      preflight,
      message: preflight.message,
    },
    hosts: [
      {
        kind: "docker",
        status: preflight.ok ? "ready" : "installed-not-running",
        message: preflight.ok ? "docker CLI and daemon are reachable." : "docker CLI is installed, but the daemon is not reachable.",
        commands: [],
      },
    ],
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: preflight.ok ? "queued" : "blocked",
      },
    ],
  };
}

function fakeDefaultCapabilityPendingGate(): McpInstallGateResult {
  const runtimeProbe: ContainerRuntimeProbeResult = {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-22T00:00:00.000Z",
    durationMs: 1,
    message: "runtime ok",
    nextAction: "none",
    toolHive: {
      status: "ready",
      message: "runtime ok",
      preflight: {
        ok: true,
        message: "runtime ok",
        command: {
          command: "runtime-check",
          args: ["runtime", "check", "--timeout", "5"],
          stdout: "runtime ok\n",
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        },
      },
    },
    hosts: [],
    postInstallQueue: [{ kind: "default-capability", capabilityId: "scrapling", status: "queued" }],
  };
  return {
    status: "ready",
    message: [
      "Isolated MCP runtime is ready for custom MCP plugin installs.",
      "Default capability setup is pending, but it is not required for this install.",
    ].join("\n"),
    runtimeProbe,
    defaultCapabilities: [
      {
        schemaVersion: "ambient-mcp-default-capability-v1",
        capabilityId: "scrapling",
        title: "Scrapling",
        status: "blocked_approval",
        nextAction: "approve-default-capability",
        message: "Runtime is ready. Scrapling is waiting for default capability approval.",
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        runtimeStatus: "ready",
        lastReconciledAt: "2026-05-22T00:00:00.000Z",
        appVersion: "0.1.25",
      },
    ],
    pendingDefaultCapabilities: [
      {
        schemaVersion: "ambient-mcp-default-capability-v1",
        capabilityId: "scrapling",
        title: "Scrapling",
        status: "blocked_approval",
        nextAction: "approve-default-capability",
        message: "Runtime is ready. Scrapling is waiting for default capability approval.",
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        runtimeStatus: "ready",
        lastReconciledAt: "2026-05-22T00:00:00.000Z",
        appVersion: "0.1.25",
      },
    ],
  };
}

function fakeRuntimePreflightFailedGate(): McpInstallGateResult {
  const runtimeProbe: ContainerRuntimeProbeResult = {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "missing",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-22T00:00:00.000Z",
    durationMs: 1,
    message: "No ready Docker, Podman, or ToolHive-compatible container runtime was detected.",
    nextAction: "install-runtime",
    toolHive: {
      status: "missing",
      message: "ToolHive runtime is not ready.",
    },
    hosts: [],
    postInstallQueue: [{ kind: "default-capability", capabilityId: "scrapling", status: "blocked" }],
  };
  return {
    status: "runtime-preflight-failed",
    message: "Custom MCP plugin installs are blocked because the isolated container runtime is not ready.",
    runtimeProbe,
    defaultCapabilities: [
      {
        schemaVersion: "ambient-mcp-default-capability-v1",
        capabilityId: "scrapling",
        title: "Scrapling",
        status: "blocked_runtime",
        nextAction: "install-runtime",
        message: "Scrapling is waiting for the isolated MCP runtime to become ready.",
        serverId: "io.github.d4vinci/scrapling",
        workloadName: "ambient-scrapling",
        runtimeStatus: "missing",
        lastReconciledAt: "2026-05-22T00:00:00.000Z",
        appVersion: "0.1.25",
      },
    ],
  };
}

function toolByName(tools: ReturnType<typeof createMcpServerPiToolDefinitions>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

function callTool(
  tool: ReturnType<typeof createMcpServerPiToolDefinitions>[number],
  toolCallId: string,
  input: Record<string, unknown>,
  onUpdate?: Parameters<NonNullable<typeof tool.execute>>[3],
) {
  if (!tool.execute) throw new Error(`Tool ${tool.name} has no execute handler.`);
  type ExecuteArgs = Parameters<NonNullable<typeof tool.execute>>;
  return tool.execute(toolCallId, input, undefined, onUpdate, undefined as unknown as ExecuteArgs[4]);
}

function textFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> } | undefined)?.content ?? [];
  return content.map((item) => item.text ?? "").join("\n");
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

function fakeGuidedSseBridgeFetch(): (input: string | URL, init?: RequestInit) => Promise<Response> {
  let getSseCount = 0;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  return async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "http://127.0.0.1:8080/") return new Response("", { status: 200 });
    if (method === "GET" && url === "http://127.0.0.1:8081/sse") {
      getSseCount += 1;
      if (getSseCount === 1) return new Response("", { status: 200 });
      const stream = new ReadableStream<Uint8Array>({
        start(nextController) {
          controller = nextController;
          nextController.enqueue(encoder.encode("event: endpoint\ndata: /messages?session_id=ambient-test\n\n"));
        },
        cancel() {
          controller = undefined;
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (method === "POST" && url === "http://127.0.0.1:8081/messages?session_id=ambient-test") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id?: number; method?: string };
      if (body.method !== "notifications/initialized") {
        const message =
          body.method === "initialize"
            ? { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } }
            : {
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  tools: [
                    {
                      name: "list_functions",
                      description: "List all functions.",
                      inputSchema: { type: "object", properties: {}, additionalProperties: false },
                    },
                  ],
                },
              };
        controller?.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`));
      }
      return new Response("", { status: 202 });
    }
    return new Response("not found", { status: 404 });
  };
}

function fakeToolHiveMcpFetch(
  options: {
    tools?: Array<Record<string, unknown>>;
    failListTools?: boolean;
  } = {},
): (input: string | URL, init?: RequestInit) => Promise<Response> {
  const tools = options.tools ?? [
    {
      name: "query-docs",
      description: "Query documentation.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
  return async (input, init) => {
    if (String(input) !== "http://127.0.0.1:4411/mcp" || init?.method !== "POST") {
      return new Response("not found", { status: 404 });
    }
    const body = JSON.parse(String(init.body ?? "{}")) as { id?: number; method?: string };
    if (body.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }
    const response =
      options.failListTools && body.method === "tools/list"
        ? { jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "kz.getTools is not a function" } }
        : {
            jsonrpc: "2.0",
            id: body.id,
            result:
              body.method === "tools/list"
                ? { tools }
                : { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fixture" } },
          };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "fixture-session",
      },
    });
  };
}

function argAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing ${flag} in ${args.join(" ")}`);
  return args[index + 1];
}

function optionalArgAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

const context7Info = {
  name: "io.github.stacklok/context7",
  title: "Context7",
  description: "Up-to-date documentation lookup for LLM coding agents.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["resolve-library-id", "query-docs"],
  repository_url: "https://github.com/upstash/context7",
  tags: ["documentation", "knowledge"],
  image: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
  permissions: {
    network: {
      outbound: {
        allow_host: ["context7.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [
    {
      name: "CONTEXT7_API_KEY",
      description: "Optional Context7 API key for higher limits.",
      required: false,
      secret: true,
    },
  ],
};

const githubInfo = {
  name: "io.github.stacklok/github",
  title: "GitHub",
  description: "GitHub MCP server.",
  tier: "community",
  status: "active",
  transport: "stdio",
  tools: ["search_repositories", "get_file_contents"],
  repository_url: "https://github.com/github/github-mcp-server",
  tags: ["git", "github"],
  image: "ghcr.io/github/github-mcp-server:v1.0.3",
  permissions: {
    network: {
      outbound: {
        allow_host: [".github.com", ".githubusercontent.com"],
        allow_port: [443],
      },
    },
  },
  env_vars: [
    {
      name: "GITHUB_PERSONAL_ACCESS_TOKEN",
      description: "GitHub token used by the MCP server.",
      required: true,
      secret: true,
    },
  ],
};

export {
  callTool,
  fakeDefaultCapabilityImagePuller,
  fakeDefaultCapabilityImageResolver,
  fakeDefaultCapabilityPendingGate,
  fakeGuidedSseBridgeFetch,
  fakeReadyContainerRuntimeProbe,
  fakeRuntimePreflightFailedGate,
  fakeToolHiveMcpFetch,
  fixtureTools,
  genericCloudApiHostBridgeCandidate,
  guidedBridgeWithRequiredSecret,
  sourceBuiltCustomImageCandidate,
  textFromResult,
  toolByName,
};
