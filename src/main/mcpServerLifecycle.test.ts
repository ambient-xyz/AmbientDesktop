import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { mcpAutowirePhase0Fixtures } from "./mcpAutowireFixtures";
import { createMcpServerPiToolDefinitions } from "./mcpServerPiTools";
import type { ContainerRuntimeProbeResult } from "./containerRuntimeProbeService";
import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";
import { mcpAutowireSixPackManagedLifecycleCandidates } from "./mcpAutowireSixPackFixtures";
import {
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
  type ToolHiveInstalledServerSourceIdentity,
} from "./toolHiveRuntimeService";

const context7ServerId = "io.github.stacklok/context7";

describe("MCP server lifecycle hardening", () => {
  it("repeats install, remove, and reinstall loops across fresh userData roots and install lanes", async () => {
    await runLifecycleScenario({
      label: "registry-context7",
      loops: 10,
      installToolName: "ambient_mcp_server_install",
      installInput: { serverId: context7ServerId },
      expectedServerId: context7ServerId,
      expectedRegistrySource: "ambient-default",
      expectedListText: "defaultCatalog=current",
      expectedListSummary: {
        defaultCatalogUpdateStatus: "current",
        defaultCatalogDescriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      expectedInstalledState: {
        defaultCatalogDescriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        defaultCatalogReviewedAt: expect.any(String),
      },
    });
    await runLifecycleScenario({
      label: "standard-scrapling",
      loops: 3,
      installToolName: "ambient_mcp_standard_import_install",
      installInput: { candidate: mcpAutowirePhase0Fixtures.scrapling },
      expectedServerId: "scrapling-github-server-json",
      expectedRegistrySource: "standard-mcp-import",
      expectedListText: "source=standard-mcp-import/server-json",
      expectedListSummary: {
        runtimeLane: "standard-mcp-import",
        sourceKind: "server-json",
        packageRegistryType: "pypi",
        packageIdentifier: "scrapling",
      },
      expectedInstalledState: {
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          sourceKind: "server-json",
          packageRegistryType: "pypi",
          packageIdentifier: "scrapling",
        },
      },
    });
    await runLifecycleScenario({
      label: "custom-source-katzilla",
      loops: 2,
      installToolName: "ambient_mcp_standard_import_install",
      installInput: { candidate: sourceBuiltLifecycleCandidate() },
      expectedServerId: "source-built-katzilla-mcp",
      expectedRegistrySource: "standard-mcp-import",
      expectedListText: "commit=abc1234deadbeef",
      expectedListSummary: {
        runtimeLane: "standard-mcp-import",
        sourceKind: "custom-image",
        sourceResolvedCommit: "abc1234deadbeef",
        sourceBuildRecipeKind: "existing-reviewed-image",
        sourceBuildRecipeHash: "e".repeat(64),
        packageRegistryType: "oci",
        packageIdentifier: "ambient-source-built/katzilla-mcp:abc1234",
        packageDigest: `sha256:${"d".repeat(64)}`,
      },
      expectedInstalledState: {
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          sourceKind: "custom-image",
          sourceResolvedCommit: "abc1234deadbeef",
          sourceBuildRecipeKind: "existing-reviewed-image",
          sourceBuildRecipeHash: "e".repeat(64),
          packageRegistryType: "oci",
          packageIdentifier: "ambient-source-built/katzilla-mcp:abc1234",
          packageDigest: `sha256:${"d".repeat(64)}`,
        },
      },
    });
    await runLifecycleScenario({
      label: "remote-context7",
      loops: 3,
      installToolName: "ambient_mcp_remote_proxy_install",
      installInput: { candidate: mcpAutowirePhase0Fixtures.context7 },
      expectedServerId: "context7-remote-mcp",
      expectedRegistrySource: "remote-mcp-proxy",
      expectedListText: "source=remote-mcp-proxy/remote-url",
      expectedListSummary: {
        runtimeLane: "remote-mcp-proxy",
        sourceKind: "remote-url",
        toolHiveRunSource: "https://mcp.context7.com/mcp",
      },
      expectedInstalledState: {
        sourceIdentity: {
          runtimeLane: "remote-mcp-proxy",
          sourceKind: "remote-url",
          toolHiveRunSource: "https://mcp.context7.com/mcp",
        },
      },
    });
  });

  it("runs the Awesome MCP six-pack through managed install, restart, smoke, uninstall, and reinstall loops", async () => {
    for (const candidate of mcpAutowireSixPackManagedLifecycleCandidates()) {
      const sourceIdentity = expectedSixPackSourceIdentity(candidate);
      await runLifecycleScenario({
        label: `six-pack-${candidate.id}`,
        loops: 1,
        installToolName: "ambient_mcp_standard_import_install",
        installInput: { candidate },
        expectedServerId: candidate.id,
        expectedRegistrySource: "standard-mcp-import",
        expectedListText: sourceIdentity.sourceResolvedCommit
          ? `commit=${sourceIdentity.sourceResolvedCommit}`
          : `runSource=${sourceIdentity.toolHiveRunSource}`,
        expectedListSummary: expectedSixPackListSummary(sourceIdentity),
        expectedInstalledState: expectedSixPackInstalledState(candidate, sourceIdentity),
      });
    }
  });
});

function expectedSixPackSourceIdentity(candidate: McpAutowireCandidate): ToolHiveInstalledServerSourceIdentity {
  const pkg = candidate.runtime.package;
  if (!pkg) throw new Error(`Six-pack lifecycle candidate ${candidate.id} must include package metadata.`);
  const identity: ToolHiveInstalledServerSourceIdentity = {
    runtimeLane: "standard-mcp-import",
    sourceKind: candidate.runtime.sourceKind,
    riskLevel: candidate.riskSummary.level,
    candidateId: candidate.id,
    toolHiveRunSource: expectedToolHiveRunSource(candidate),
  };
  if (candidate.source.url) identity.sourceUrl = candidate.source.url;
  if (candidate.source.resolvedCommit) identity.sourceResolvedCommit = candidate.source.resolvedCommit;
  if (candidate.source.packageName) identity.packageName = candidate.source.packageName;
  identity.packageRegistryType = pkg.registryType;
  identity.packageIdentifier = pkg.identifier;
  if (pkg.version) identity.packageVersion = pkg.version;
  if (pkg.digest) identity.packageDigest = pkg.digest;
  if (pkg.fileSha256) identity.packageSha256 = pkg.fileSha256;
  if (candidate.runtime.sourceBuild?.recipeKind) identity.sourceBuildRecipeKind = candidate.runtime.sourceBuild.recipeKind;
  if (candidate.runtime.sourceBuild?.recipeHash) identity.sourceBuildRecipeHash = candidate.runtime.sourceBuild.recipeHash;
  return identity;
}

function expectedSixPackListSummary(identity: ToolHiveInstalledServerSourceIdentity): Record<string, unknown> {
  const { packageName: _packageName, ...summary } = identity;
  return summary as Record<string, unknown>;
}

function expectedSixPackInstalledState(
  candidate: McpAutowireCandidate,
  sourceIdentity: ToolHiveInstalledServerSourceIdentity,
): Record<string, unknown> {
  return {
    sourceIdentity,
    ...(candidate.runtime.sourceKind === "custom-image" ? { imageVerificationPolicy: "ambient-reviewed" } : {}),
  };
}

function expectedToolHiveRunSource(candidate: McpAutowireCandidate): string {
  const pkg = candidate.runtime.package;
  if (!pkg) throw new Error(`Six-pack lifecycle candidate ${candidate.id} must include package metadata.`);
  const version = pkg.version ? `@${pkg.version}` : "";
  if (pkg.registryType === "npm") return `npx://${pkg.identifier}${version}`;
  if (pkg.registryType === "pypi") return `uvx://${pkg.identifier}${version}`;
  if (pkg.registryType === "oci") return pkg.identifier;
  throw new Error(`Unsupported six-pack lifecycle package type ${pkg.registryType}.`);
}

async function runLifecycleScenario(input: {
  label: string;
  loops: number;
  installToolName: string;
  installInput: Record<string, unknown>;
  expectedServerId: string;
  expectedRegistrySource: string;
  expectedListText: string;
  expectedListSummary: Record<string, unknown>;
  expectedInstalledState: Record<string, unknown>;
}): Promise<void> {
  for (let index = 0; index < input.loops; index += 1) {
    const fixture = await lifecycleFixture(`${input.label}-${index}`, index);
    const install = toolByName(fixture.tools, input.installToolName);
    const list = toolByName(fixture.tools, "ambient_mcp_server_list");
    const uninstall = toolByName(fixture.tools, "ambient_mcp_server_uninstall");

    const firstInstall = await callTool(install, `${input.label}-install-${index}-first`, input.installInput);
    expect(firstInstall.details).toMatchObject({
      status: "ready",
      serverId: input.expectedServerId,
      workloadStatus: "running",
    });
    expect(fixture.runCalls()).toHaveLength(1);
    await expectInstalledState(fixture.service, input);

    const duplicateInstall = await callTool(install, `${input.label}-install-${index}-duplicate`, input.installInput);
    expect(duplicateInstall.details).toMatchObject({
      status: "already-installed",
      serverId: input.expectedServerId,
    });
    expect(fixture.runCalls()).toHaveLength(1);

    const listed = await callTool(list, `${input.label}-list-${index}-first`, {});
    expect(textFromResult(listed)).toContain(input.expectedListText);
    expect(listed.details).toMatchObject({
      status: "complete",
      serverCount: 1,
    });
    expect(listed.details?.servers?.[0]).toMatchObject({
      serverId: input.expectedServerId,
      registrySource: input.expectedRegistrySource,
      workloadStatus: "running",
      ...input.expectedListSummary,
    });

    const restarted = fixture.restart();
    const restartedList = await callTool(toolByName(restarted.tools, "ambient_mcp_server_list"), `${input.label}-list-${index}-restart`, {});
    expect(textFromResult(restartedList)).toContain(input.expectedListText);
    expect(restartedList.details?.servers?.[0]).toMatchObject({
      serverId: input.expectedServerId,
      registrySource: input.expectedRegistrySource,
      workloadStatus: "running",
      ...input.expectedListSummary,
    });
    await expectInstalledState(restarted.service, input);

    const firstRemove = await callTool(uninstall, `${input.label}-remove-${index}-first`, { serverId: input.expectedServerId });
    expect(firstRemove.details).toMatchObject({
      status: "removed",
      serverId: input.expectedServerId,
    });
    expect((await fixture.service.readState()).installedServers).toEqual([]);
    expect(fixture.workloadCount()).toBe(0);

    const reinstall = await callTool(install, `${input.label}-install-${index}-second`, input.installInput);
    expect(reinstall.details).toMatchObject({
      status: "ready",
      serverId: input.expectedServerId,
      workloadStatus: "running",
    });
    expect(fixture.runCalls()).toHaveLength(2);
    await expectInstalledState(fixture.service, input);

    const finalRemove = await callTool(uninstall, `${input.label}-remove-${index}-second`, { serverId: input.expectedServerId });
    expect(finalRemove.details).toMatchObject({
      status: "removed",
      serverId: input.expectedServerId,
    });
    expect((await fixture.service.readState()).installedServers).toEqual([]);
    expect(fixture.workloadCount()).toBe(0);
  }
}

async function expectInstalledState(
  service: ToolHiveRuntimeService,
  expected: { expectedServerId: string; expectedRegistrySource: string; expectedInstalledState: Record<string, unknown> },
): Promise<void> {
  const state = await service.readState();
  expect(state.installedServers).toHaveLength(1);
  expect(state.installedServers[0]).toMatchObject({
    serverId: expected.expectedServerId,
    registrySource: expected.expectedRegistrySource,
    permissionProfileSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    installReview: {
      status: "reviewed",
      outcome: "ready",
      blockerCount: 0,
    },
    ...expected.expectedInstalledState,
  });
}

async function lifecycleFixture(label: string, index: number): Promise<{
  tools: ReturnType<typeof createMcpServerPiToolDefinitions>;
  service: ToolHiveRuntimeService;
  restart: () => {
    tools: ReturnType<typeof createMcpServerPiToolDefinitions>;
    service: ToolHiveRuntimeService;
  };
  runCalls: () => ToolHiveCommandInvocation[];
  workloadCount: () => number;
}> {
  const root = await mkdtemp(join(tmpdir(), `ambient-mcp-lifecycle-${label}-`));
  const userData = join(root, "userData");
  await mkdir(userData, { recursive: true });
  const fakeThv = join(root, "thv");
  await writeFile(fakeThv, "#!/usr/bin/env sh\necho ToolHive v0.28.2\n", "utf8");
  await chmod(fakeThv, 0o755);

  const calls: ToolHiveCommandInvocation[] = [];
  const workloads = new Map<string, Record<string, unknown>>();
  let nextPort = 4410 + (index * 20);
  const executor: ToolHiveCommandExecutor = async (invocation) => {
    calls.push(invocation);
    const prefix = invocation.args.slice(0, 2).join(" ");
    if (prefix === "registry list") return ok(JSON.stringify([]));
    if (prefix === "registry info") return { stdout: "", stderr: "not found", exitCode: 1 };
    if (prefix === "group list") return ok("NAME\nambient\ndefault\n");
    if (prefix === "group create") return ok("");
    if (prefix === "runtime check") return ok("runtime ok\n");
    if (invocation.args[0] === "run") {
      const workloadName = argAfter(invocation.args, "--name");
      const group = argAfter(invocation.args, "--group") ?? "ambient";
      workloads.set(workloadName, {
        name: workloadName,
        status: "running",
        group,
        proxy_url: `http://127.0.0.1:${nextPort++}/mcp`,
      });
      return ok("running\n");
    }
    if (invocation.args[0] === "list") return ok(JSON.stringify([...workloads.values()]));
    if (invocation.args[0] === "stop") {
      const workloadName = invocation.args[1];
      const workload = workloads.get(workloadName);
      if (workload) workload.status = "stopped";
      return ok("stopped\n");
    }
    if (invocation.args[0] === "rm") {
      workloads.delete(invocation.args[1]);
      return ok("removed\n");
    }
    return ok("[]");
  };
  const makeService = () => new ToolHiveRuntimeService({
    userDataPath: userData,
    env: {
      AMBIENT_TOOLHIVE_BINARY: fakeThv,
      PATH: process.env.PATH,
      HOME: root,
    } as NodeJS.ProcessEnv,
    executor,
    now: () => new Date("2026-05-22T12:00:00.000Z"),
  });
  const makeTools = (service: ToolHiveRuntimeService) => {
    const catalog = new McpInstallCatalog(service);
    return createMcpServerPiToolDefinitions({
      catalog,
      toolHive: service,
      getThread: () => ({
        id: `thread-${index}`,
        collaborationMode: "agent",
        permissionMode: "workspace",
      }),
      workspace: {
        path: join(root, "workspace"),
        name: "workspace",
      },
      authorizeInstall: () => true,
      authorizeUninstall: () => true,
      containerRuntimeProbe: () => fakeReadyContainerRuntimeProbe(service),
      mcpToolFetchImpl: fakeLifecycleMcpFetch(),
    });
  };
  const service = makeService();
  const tools = makeTools(service);
  return {
    tools,
    service,
    restart: () => {
      const restartedService = makeService();
      return {
        service: restartedService,
        tools: makeTools(restartedService),
      };
    },
    runCalls: () => calls.filter((call) => call.args[0] === "run"),
    workloadCount: () => workloads.size,
  };
}

function sourceBuiltLifecycleCandidate(): McpAutowireCandidate {
  return {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
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
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["source-build-review"],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "source-image-digest", "mcp-tool-discovery"],
      expectedTools: ["query"],
      evidenceRefs: ["source-build-review"],
    },
    evidence: [{
      id: "source-build-review",
      type: "other",
      locator: "source-built lifecycle fixture",
      summary: "Fixture models a reviewed custom source-built OCI image produced from a pinned commit.",
    }],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Runs a reviewed local image built from pinned source."],
      evidenceRefs: ["source-build-review"],
    },
  };
}

async function fakeReadyContainerRuntimeProbe(service: ToolHiveRuntimeService): Promise<ContainerRuntimeProbeResult> {
  const preflight = await service.preflightRuntime(5);
  return {
    schemaVersion: "ambient-container-runtime-probe-v1",
    status: "ready",
    runtime: "docker",
    platform: "darwin",
    arch: "arm64",
    checkedAt: "2026-05-22T12:00:00.000Z",
    durationMs: preflight.command.durationMs,
    message: preflight.message,
    nextAction: "none",
    toolHive: {
      status: "ready",
      preflight,
      message: preflight.message,
    },
    hosts: [
      {
        kind: "docker",
        status: "ready",
        message: "docker CLI and daemon are reachable.",
        commands: [],
      },
    ],
    postInstallQueue: [
      {
        kind: "default-capability",
        capabilityId: "scrapling",
        status: "queued",
      },
    ],
  };
}

function toolByName(tools: ReturnType<typeof createMcpServerPiToolDefinitions>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

async function callTool(
  tool: ReturnType<typeof createMcpServerPiToolDefinitions>[number],
  toolCallId: string,
  input: Record<string, unknown>,
): Promise<{ content?: Array<{ type: string; text?: string }>; details?: Record<string, any> }> {
  if (!tool.execute) throw new Error(`Tool ${tool.name} has no execute handler.`);
  return await tool.execute(toolCallId, input, undefined, undefined, undefined as any);
}

function textFromResult(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((item) => item.text ?? "").join("\n");
}

function fakeLifecycleMcpFetch(): (input: string | URL, init?: RequestInit) => Promise<Response> {
  return async (_input, init) => {
    if (init?.method !== "POST") return new Response("not found", { status: 404 });
    const body = JSON.parse(String(init.body ?? "{}")) as { id?: number; method?: string };
    if (body.method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }
    const response = {
      jsonrpc: "2.0",
      id: body.id,
      result: body.method === "tools/list"
        ? {
            tools: [{
              name: "query",
              description: "Lifecycle fixture query tool.",
              inputSchema: { type: "object", properties: {}, additionalProperties: false },
            }],
          }
        : { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "lifecycle-fixture" } },
    };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "lifecycle-fixture-session",
      },
    });
  };
}

function argAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing ${flag} in ${args.join(" ")}`);
  return args[index + 1];
}

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}
