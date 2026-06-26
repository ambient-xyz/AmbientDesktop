import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMcpAutowireCandidateRefStore,
  createMcpAutowirePlanRevisionStore,
  mcpAutowirePhase0Fixtures,
  mcpKatzillaInstallFailureReplay,
  validateMcpAutowireCandidate,
} from "./mcpAutowireFacade";
import { saveMcpServerEnvSecret } from "./mcpSecretReferences";
import {
  callTool,
  fakeToolHiveMcpFetch,
  fixtureTools,
  sourceBuiltCustomImageCandidate,
  textFromResult,
  toolByName,
} from "./mcpServerPiToolsTestHelpers";

describe("MCP server Pi tools Standard MCP imports", () => {
  it("describes and installs a package-backed Standard MCP import after approval", async () => {
    const approvals: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-active-revision-"));
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined),
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      planRevisions,
    });
    const describe = toolByName(tools, "ambient_mcp_standard_import_describe");
    const install = toolByName(tools, "ambient_mcp_standard_import_install");
    const updates: string[] = [];

    const describeResult = await callTool(describe, "call-import-1", {
      candidateRef: "fixture:scrapling",
    });
    expect(textFromResult(describeResult)).toContain("Catalog source: standard-mcp-import");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_describe",
      status: "ready-for-review",
      serverId: "scrapling-github-server-json",
      toolHiveRunSource: "uvx://scrapling",
      toolHiveServerArgs: ["mcp"],
    });

    const installResult = await callTool(install, "call-import-2", { candidateRef: "fixture:scrapling" }, (update) =>
      updates.push(update.content.map((item) => (item.type === "text" ? item.text : "")).join("\n")),
    );

    expect(textFromResult(installResult)).toContain("MCP server scrapling-github-server-json is ready");
    expect(textFromResult(installResult)).toContain("Next validation hints:");
    expect(textFromResult(installResult)).toContain('ambient_mcp_tool_search {"serverId":"scrapling-github-server-json"');
    expect(textFromResult(installResult)).toContain("run one harmless smoke call");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "ready",
      serverId: "scrapling-github-server-json",
      workloadStatus: "running",
      installValidationStatus: "ready",
      activeRevisionId: expect.stringMatching(/^ambient-mcp-revision:scrapling-github-server-json:/),
    });
    expect(approvals[0]).toContain("Command shape: thv run --name ambient-scrapling-github-server-json");
    expect(updates.join("\n")).toContain(
      "Waiting for Ambient Desktop approval to install Standard MCP import scrapling-github-server-json.",
    );
    expect(updates.join("\n")).toContain("Starting ToolHive Standard MCP workload ambient-scrapling-github-server-json");
    expect(updates.join("\n")).toContain("Recording Ambient install state for ToolHive workload ambient-scrapling-github-server-json");
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("uvx://scrapling"));
    expect(runCall?.args).toEqual(expect.arrayContaining(["uvx://scrapling", "--", "mcp"]));
    const installedState = (await service.readState()).installedServers[0];
    expect(installedState).toMatchObject({
      serverId: "scrapling-github-server-json",
      activeRevisionId: expect.stringMatching(/^ambient-mcp-revision:scrapling-github-server-json:/),
      registrySource: "standard-mcp-import",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        sourceKind: "server-json",
        sourceUrl: "https://github.com/D4Vinci/Scrapling",
        packageRegistryType: "pypi",
        packageIdentifier: "scrapling",
        toolHiveRunSource: "uvx://scrapling",
        candidateId: "scrapling-github-server-json",
        candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        riskLevel: "high",
      },
      installReview: {
        status: "reviewed",
        outcome: "ready",
        reviewedAt: expect.any(String),
        warningCount: 3,
        blockerCount: 0,
      },
      secretBindings: [],
    });
    if (!installedState?.activeRevisionId) throw new Error("missing active revision id");
    const activeRevisionId = installedState.activeRevisionId;
    expect(planRevisions.read(activeRevisionId)).toMatchObject({
      source: "install",
      candidateRef: "fixture:scrapling",
      candidateId: "scrapling-github-server-json",
      serverId: "scrapling-github-server-json",
      workloadName: installedState.workloadName,
    });

    const alreadyInstalledResult = await callTool(install, "call-import-already-installed", {
      candidateRef: "fixture:scrapling",
    });
    const alreadyInstalledText = textFromResult(alreadyInstalledResult);
    const alreadyInstalledDetails = alreadyInstalledResult?.details as { workloadName?: string };
    expect(alreadyInstalledText).toContain("MCP Standard import scrapling-github-server-json is already installed as ToolHive workload");
    expect(alreadyInstalledText).toContain("Next validation hints:");
    expect(alreadyInstalledText).toContain('ambient_mcp_tool_search {"serverId":"scrapling-github-server-json"');
    expect(alreadyInstalledText).toContain(`"workloadName":"${alreadyInstalledDetails.workloadName}"`);
    expect(alreadyInstalledText).toContain("do not route this next step through ambient_tool_search");
    expect(alreadyInstalledResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "already-installed",
      serverId: "scrapling-github-server-json",
      workloadName: expect.stringMatching(/^ambient-scrapling-github-server-json-[a-f0-9]+$/),
      compatibleRuntimeShape: true,
    });

    await service.writeState({
      ...(await service.readState()),
      installedServers: [
        {
          ...installedState,
          sourceIdentity: {
            ...(installedState.sourceIdentity ?? { runtimeLane: "standard-mcp-import" as const }),
            candidateHash: "f".repeat(64),
          },
        },
      ],
    });
    const repairDescribe = toolByName(tools, "ambient_mcp_runtime_repair_describe");
    const repairResult = await callTool(repairDescribe, "call-import-active-revision-repair", {
      serverId: "scrapling-github-server-json",
      failureText: "Environment variable SCRAPLING_API_KEY is required before startup can continue.",
    });
    expect(repairResult.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_runtime_repair_describe",
      status: "repair-available",
      parentRevisionId: activeRevisionId,
      operations: [
        expect.objectContaining({
          op: "secret.declare",
          name: "SCRAPLING_API_KEY",
        }),
      ],
    });
  });

  it("returns a managed source-build recovery when Standard MCP package import fails in ToolHive", async () => {
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash;
    const { tools } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined),
      standardRunFailure: {
        matchSource: "uvx://scrapling",
        stderr: [
          "Error: failed to find or create the MCP server uvx://scrapling: invalid protocol scheme provided for MCP server",
          "failed to build Docker image: failed to process build output",
        ].join("\n"),
      },
      authorizeInstall: async () => true,
    });
    const install = toolByName(tools, "ambient_mcp_standard_import_install");

    const result = await callTool(install, "call-import-runtime-failure", {
      candidateRef: "fixture:scrapling",
      expectedCandidateHash: candidateHash,
    });

    const text = textFromResult(result);
    expect(text).toContain("Standard MCP import failed inside the managed Ambient ToolHive installer.");
    expect(text).toContain("Managed recovery route:");
    expect(text).toContain("ambient_mcp_autowire_source_build_describe");
    expect(text).toContain("do not search for or install registry substitutes");
    expect(text).toContain("do not use shell, raw ToolHive");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "install-failed",
      serverId: "scrapling-github-server-json",
      nextToolName: "ambient_mcp_autowire_source_build_describe",
      nextToolInput: {
        candidateRef: "fixture:scrapling",
        expectedCandidateHash: candidateHash,
      },
      doNotUseShell: true,
      doNotSearchRegistryForSameTarget: true,
    });
  });

  it("describes and applies runtime repair as a typed Autowire plan edit", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-runtime-repair-"));
    const candidateRefs = createMcpAutowireCandidateRefStore({
      storagePath: join(root, "candidates.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.context7).candidateHash;
    const candidateRef = candidateRefs.put(
      mcpAutowirePhase0Fixtures.context7 as unknown as Record<string, unknown>,
      candidateHash,
      "reviewed",
    );
    const revision = planRevisions.recordCandidate({
      candidate: mcpAutowirePhase0Fixtures.context7 as unknown as Record<string, unknown>,
      source: "install",
      summary: "Installed Context7 for runtime repair fixture.",
      candidateRef,
      serverId: "context7-remote-mcp",
      workloadName: "ambient-context7-remote-mcp-fixture",
    });
    const approvals: string[] = [];
    const { tools } = await fixtureTools({
      resolveCandidateRef: (ref) => candidateRefs.getReviewed(ref),
      putCandidateRef: (candidate, hash) => candidateRefs.put(candidate, hash, "planned"),
      planRevisions,
      authorizeRuntimeRepair: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });
    const describe = toolByName(tools, "ambient_mcp_runtime_repair_describe");
    const apply = toolByName(tools, "ambient_mcp_runtime_repair_apply");

    const describeResult = await callTool(describe, "call-runtime-repair-describe", {
      revisionId: revision.revisionId,
      failureText: "Tool call failed: network permission blocked GET https://api.github.com/repos/upstash/context7/releases",
      reason: "Allow release metadata host required by validation.",
    });

    expect(textFromResult(describeResult)).toContain("MCP runtime repair preview.");
    expect(describeResult.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_runtime_repair_describe",
      status: "repair-available",
      candidateRef,
      parentRevisionId: revision.revisionId,
      operationCount: 1,
      operations: [
        expect.objectContaining({
          op: "network.allowlist.add",
          hosts: ["api.github.com"],
        }),
      ],
      permissionExpanding: true,
      nextToolName: "ambient_mcp_autowire_review",
    });

    const applyResult = await callTool(apply, "call-runtime-repair-apply", {
      revisionId: revision.revisionId,
      failureText: "Tool call failed: network permission blocked GET https://api.github.com/repos/upstash/context7/releases",
      reason: "Allow release metadata host required by validation.",
    });

    expect(approvals).toHaveLength(1);
    expect(applyResult.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_runtime_repair_apply",
      status: "applied",
      candidateRef: expect.stringContaining("ambient-mcp-candidate:context7-remote-mcp:"),
      editedCandidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      permissionExpanding: true,
      operationCount: 1,
      nextToolName: "ambient_mcp_autowire_review",
      directRepairNextToolName: "ambient_mcp_standard_import_install",
      directRepairNextToolInput: {
        candidateRef: expect.stringContaining("ambient-mcp-candidate:context7-remote-mcp:"),
        expectedCandidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(applyResult.details.candidateRef).not.toEqual(candidateRef);
    expect(candidateRefs.get(applyResult.details.candidateRef as string)).toMatchObject({
      permissions: {
        network: {
          allowHosts: expect.arrayContaining(["mcp.context7.com", "api.github.com"]),
          allowPorts: expect.arrayContaining([443]),
        },
      },
    });
    expect(planRevisions.list({ candidateRef: applyResult.details.candidateRef as string })).not.toHaveLength(0);
  });

  it("backfills legacy installed Standard MCP state before runtime repair", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-runtime-repair-backfill-"));
    const candidateRefs = createMcpAutowireCandidateRefStore({
      storagePath: join(root, "candidates.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const { tools, service } = await fixtureTools({
      planRevisions,
      putCandidateRef: (candidate, hash) => candidateRefs.put(candidate, hash, "planned"),
    });
    const profile = await service.writePermissionProfile({
      serverId: "context7-standard-mcp",
      workloadName: "ambient-context7-standard-mcp",
      profile: {
        network: { outbound: { insecure_allow_all: false, allow_host: ["mcp.context7.com"], allow_port: [443] } },
        filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      },
    });
    await service.writeState({
      schemaVersion: "ambient-toolhive-runtime-state-v1",
      installedServers: [
        {
          serverId: "context7-standard-mcp",
          workloadName: "ambient-context7-standard-mcp",
          registrySource: "standard-mcp-import",
          sourceIdentity: {
            runtimeLane: "standard-mcp-import",
            sourceKind: "npm",
            sourceUrl: "https://github.com/upstash/context7",
            packageName: "@upstash/context7-mcp",
            packageRegistryType: "npm",
            packageIdentifier: "@upstash/context7-mcp",
            toolHiveRunSource: "npx://@upstash/context7-mcp",
            candidateId: "context7-standard-mcp",
            riskLevel: "medium",
          },
          permissionProfilePath: profile.path,
          permissionProfileSha256: profile.sha256,
          installValidationStatus: "validation_failed",
          installValidationError: "Tool call failed: network permission blocked GET https://api.github.com/repos/upstash/context7/releases",
          lastRunCommand: [
            "run",
            "--name",
            "ambient-context7-standard-mcp",
            "--group",
            "ambient",
            "--isolate-network",
            "--permission-profile",
            profile.path,
            "npx://@upstash/context7-mcp",
          ],
          createdAt: "2026-06-10T00:00:00.000Z",
          updatedAt: "2026-06-10T00:00:00.000Z",
        },
      ],
    });
    const describe = toolByName(tools, "ambient_mcp_runtime_repair_describe");

    const result = await callTool(describe, "call-runtime-repair-backfill", {
      serverId: "context7-standard-mcp",
    });

    expect(result.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_runtime_repair_describe",
      status: "repair-available",
      serverId: "context7-standard-mcp",
      workloadName: "ambient-context7-standard-mcp",
      backfilledRevisionId: expect.stringContaining("ambient-mcp-revision:context7-standard-mcp:"),
      operationCount: 1,
      operations: [
        expect.objectContaining({
          op: "network.allowlist.add",
          hosts: ["api.github.com"],
        }),
      ],
    });
    const revisionId = result.details.backfilledRevisionId as string;
    expect(planRevisions.read(revisionId)).toMatchObject({
      source: "install",
      serverId: "context7-standard-mcp",
      workloadName: "ambient-context7-standard-mcp",
      candidate: {
        runtime: {
          provider: "toolhive",
          sourceKind: "npm",
          package: {
            registryType: "npm",
            identifier: "@upstash/context7-mcp",
          },
        },
        permissions: {
          network: {
            mode: "allowlist",
            allowHosts: ["mcp.context7.com"],
          },
        },
      },
    });
    expect(candidateRefs.get(planRevisions.read(revisionId)?.candidateRef ?? "")).toMatchObject({
      id: "context7-standard-mcp",
    });
  });

  it("repairs stale Standard MCP imports missing managed file exchange state", async () => {
    const approvals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined),
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });
    await service.writeState({
      ...(await service.readState()),
      installedServers: [
        {
          serverId: "scrapling-github-server-json",
          workloadName: "ambient-scrapling-github-server-json",
          registrySource: "standard-mcp-import",
          sourceIdentity: {
            runtimeLane: "standard-mcp-import",
            sourceKind: "server-json",
            toolHiveRunSource: "uvx://scrapling",
          },
          permissionProfilePath: "/profiles/stale.json",
          permissionProfileSha256: "stale",
          createdAt: "2026-05-22T00:00:00.000Z",
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    });
    const install = toolByName(tools, "ambient_mcp_standard_import_install");
    const updates: unknown[] = [];

    const installResult = await callTool(
      install,
      "call-import-stale-repair",
      {
        candidateRef: "fixture:scrapling",
      },
      (update) => updates.push(update),
    );

    expect(textFromResult(installResult)).toContain("MCP server scrapling-github-server-json is ready");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "ready",
      serverId: "scrapling-github-server-json",
      repairedRuntimeShape: true,
      repairReasons: expect.arrayContaining([
        "installed runtime volumes do not match the reviewed Standard MCP run plan",
        "installed state is missing Ambient managed MCP file exchange metadata",
      ]),
    });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            toolName: "ambient_mcp_standard_import_install",
            status: "repair-required",
            repairReasons: expect.arrayContaining(["installed state is missing Ambient managed MCP file exchange metadata"]),
          }),
        }),
      ]),
    );
    expect(approvals[0]).toContain("Command shape: thv run --name ambient-scrapling-github-server-json");
    const commandShape = approvals[0]?.split("\n").find((line) => line.startsWith("- Command shape:")) ?? "";
    expect(commandShape).toContain("--volume ");
    expect(commandShape).not.toContain("/ambient/mcp-files:rw");
    expect(calls.map((call) => call.args[0])).toEqual(expect.arrayContaining(["run"]));
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "scrapling-github-server-json",
      endpoint: "http://127.0.0.1:4411/mcp",
      installValidationStatus: "ready",
      runtimeVolumes: [
        expect.objectContaining({
          containerPath: "/ambient/mcp-files",
          mode: "rw",
          purpose: "ambient-mcp-file-exchange",
        }),
      ],
      managedFileExchange: expect.objectContaining({
        containerPath: "/ambient/mcp-files",
        mode: "rw",
      }),
    });
  });

  it("repairs Standard MCP imports when only the reviewed permission profile changed", async () => {
    const approvals: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-profile-repair-revision-"));
    let revisionTick = 0;
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => new Date(Date.UTC(2026, 5, 10, 0, 0, revisionTick++)).toISOString(),
    });
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined),
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      planRevisions,
    });
    const install = toolByName(tools, "ambient_mcp_standard_import_install");

    await callTool(install, "call-import-profile-baseline", {
      candidateRef: "fixture:scrapling",
    });
    const baselineState = await service.readState();
    const installed = baselineState.installedServers[0];
    if (!installed?.activeRevisionId) throw new Error("missing installed server fixture");
    const baselineActiveRevisionId = installed.activeRevisionId;
    await service.writeState({
      ...baselineState,
      installedServers: [
        {
          ...installed,
          permissionProfilePath: "/profiles/stale-profile.json",
          permissionProfileSha256: "stale-profile",
        },
      ],
    });
    approvals.length = 0;
    calls.length = 0;

    const installResult = await callTool(install, "call-import-profile-repair", {
      candidateRef: "fixture:scrapling",
    });

    expect(textFromResult(installResult)).toContain("MCP server scrapling-github-server-json is ready");
    expect(textFromResult(installResult)).toContain(`Previous active Autowire revision: ${baselineActiveRevisionId}`);
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "ready",
      serverId: "scrapling-github-server-json",
      repairedRuntimeShape: true,
      previousActiveRevisionId: baselineActiveRevisionId,
      activeRevisionId: expect.stringMatching(/^ambient-mcp-revision:scrapling-github-server-json:/),
      repairReasons: ["installed permission profile does not match the reviewed Standard MCP run plan"],
    });
    expect(installResult?.details.activeRevisionId).not.toBe(baselineActiveRevisionId);
    expect(approvals[0]).toContain("installed permission profile does not match the reviewed Standard MCP run plan");
    expect(calls.map((call) => call.args[0])).toContain("run");
    await expect(service.readState()).resolves.toMatchObject({
      installedServers: [
        {
          serverId: "scrapling-github-server-json",
          activeRevisionId: installResult?.details.activeRevisionId,
          permissionProfileSha256: expect.not.stringMatching(/^stale-profile$/),
          installValidationStatus: "ready",
        },
      ],
    });
  });

  it("keeps a Standard MCP import in validation_failed when tools/list fails after endpoint startup", async () => {
    const { tools, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined),
      authorizeInstall: () => true,
      mcpToolFetchImpl: fakeToolHiveMcpFetch({ failListTools: true }),
    });
    const install = toolByName(tools, "ambient_mcp_standard_import_install");

    const installResult = await callTool(install, "call-import-validation-failed", {
      candidateRef: "fixture:scrapling",
    });

    expect(textFromResult(installResult)).toContain("started but failed MCP protocol validation");
    expect(textFromResult(installResult)).toContain("kz.getTools is not a function");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "validation_failed",
      serverId: "scrapling-github-server-json",
      workloadStatus: "running",
      endpoint: "http://127.0.0.1:4411/mcp",
      installValidationStatus: "validation_failed",
      validationError: expect.stringContaining("kz.getTools is not a function"),
    });
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "scrapling-github-server-json",
      installValidationStatus: "validation_failed",
      installValidationError: expect.stringContaining("kz.getTools is not a function"),
    });
  });

  it("installs a source-built custom image through ToolHive after digest review", async () => {
    const candidate = sourceBuiltCustomImageCandidate();
    await mkdir("/tmp/ambient-katzilla-config", { recursive: true });
    const expectedKatzillaConfigPath = await realpath("/tmp/ambient-katzilla-config");
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => (candidateRef === "fixture:source-built" ? candidate : undefined),
      authorizeInstall: () => true,
    });
    const describe = toolByName(tools, "ambient_mcp_standard_import_describe");
    const install = toolByName(tools, "ambient_mcp_standard_import_install");

    const describeResult = await callTool(describe, "call-source-built-describe", {
      candidateRef: "fixture:source-built",
    });

    expect(textFromResult(describeResult)).toContain("Catalog source: standard-mcp-import");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_describe",
      status: "ready-for-review",
      serverId: "source-built-katzilla-mcp",
      toolHiveRunSource: "ambient-source-built/katzilla-mcp:abc1234",
      toolHiveVolumes: expect.arrayContaining([
        { hostPath: "/tmp/ambient-katzilla-config", containerPath: "/config", mode: "ro" },
        expect.objectContaining({ containerPath: "/ambient/mcp-files", mode: "rw", purpose: "ambient-mcp-file-exchange" }),
      ]),
    });

    const installResult = await callTool(install, "call-source-built-install", {
      candidateRef: "fixture:source-built",
    });

    expect(textFromResult(installResult)).toContain("MCP server source-built-katzilla-mcp is ready");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "ready",
      serverId: "source-built-katzilla-mcp",
      installValidationStatus: "ready",
    });
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("ambient-source-built/katzilla-mcp:abc1234"));
    expect(runCall?.args).toEqual(expect.arrayContaining(["--isolate-network", "--permission-profile"]));
    expect(runCall?.args).toEqual(expect.arrayContaining(["--volume", `${expectedKatzillaConfigPath}:/config:ro`]));
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "source-built-katzilla-mcp",
      registrySource: "standard-mcp-import",
      sourceIdentity: {
        runtimeLane: "standard-mcp-import",
        sourceKind: "custom-image",
        sourceUrl: "https://github.com/codeislaw101/katzilla-sdk",
        sourceResolvedCommit: "abc1234deadbeef",
        packageRegistryType: "oci",
        packageIdentifier: "ambient-source-built/katzilla-mcp:abc1234",
        packageDigest: `sha256:${"d".repeat(64)}`,
        sourceBuildRecipeKind: "existing-reviewed-image",
        sourceBuildRecipeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        toolHiveRunSource: "ambient-source-built/katzilla-mcp:abc1234",
      },
    });
  });

  it("replays the Katzilla install failure without raw-secret or host-bridge fallback", async () => {
    const approvals: string[] = [];
    const { tools, calls, service, userData, runtimeSecretReads } = await fixtureTools({
      resolveCandidateRef: (candidateRef) =>
        candidateRef === "fixture:katzilla-replay" ? mcpKatzillaInstallFailureReplay.candidate : undefined,
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      mcpToolFetchImpl: fakeToolHiveMcpFetch({ failListTools: true }),
    });
    const describe = toolByName(tools, "ambient_mcp_standard_import_describe");
    const install = toolByName(tools, "ambient_mcp_standard_import_install");
    const rawSecretSentinel = "katzilla-raw-key-fixture-should-not-appear";
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    try {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");

      const blockedDescribe = await callTool(describe, "call-katzilla-replay-blocked", {
        candidateRef: "fixture:katzilla-replay",
      });
      expect(textFromResult(blockedDescribe)).toContain("Required secret KATZILLA_API_KEY");
      expect(textFromResult(blockedDescribe)).toContain("ambient_mcp_secret_request");
      expect(calls.some((call) => call.args[0] === "run")).toBe(false);

      await saveMcpServerEnvSecret("/tmp/workspace", {
        candidateId: mcpKatzillaInstallFailureReplay.candidate.id,
        envName: "KATZILLA_API_KEY",
        value: rawSecretSentinel,
      });

      const installResult = await callTool(install, "call-katzilla-replay-install", {
        candidateRef: "fixture:katzilla-replay",
      });
      const visibleText = [
        textFromResult(blockedDescribe),
        textFromResult(installResult),
        ...approvals,
        JSON.stringify(calls.map((call) => call.args)),
      ].join("\n");

      expect(textFromResult(installResult)).toContain("started but failed MCP protocol validation");
      expect(textFromResult(installResult)).toContain(mcpKatzillaInstallFailureReplay.failure.protocolError);
      expect(textFromResult(installResult)).not.toContain("is ready");
      expect(installResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_standard_import_install",
        status: mcpKatzillaInstallFailureReplay.failure.expectedInstallStatus,
        serverId: mcpKatzillaInstallFailureReplay.candidate.id,
        workloadStatus: "running",
        installValidationStatus: mcpKatzillaInstallFailureReplay.failure.expectedInstallStatus,
        validationError: expect.stringContaining(mcpKatzillaInstallFailureReplay.failure.protocolError),
      });

      const runCall = calls.find(
        (call) => call.args[0] === "run" && call.args.includes(mcpKatzillaInstallFailureReplay.failure.toolHiveRunSource),
      );
      expect(runCall?.args).toEqual(expect.arrayContaining(["--env-file"]));
      expect(calls.map((call) => call.args.join(" ")).join("\n")).not.toContain("supergateway");
      for (const forbidden of mcpKatzillaInstallFailureReplay.forbiddenVisibleFragments) {
        expect(visibleText).not.toContain(forbidden);
      }
      expect(visibleText).not.toContain(rawSecretSentinel);
      expect(runtimeSecretReads).toEqual([
        expect.objectContaining({
          kind: "container-env-file",
        }),
      ]);
      expect(runtimeSecretReads[0]?.text).toContain("NODE_USE_ENV_PROXY=1\n");
      expect(runtimeSecretReads[0]?.text).toContain(`KATZILLA_API_KEY=${rawSecretSentinel}\n`);
      expect((await service.readState()).installedServers[0]).toMatchObject({
        serverId: mcpKatzillaInstallFailureReplay.candidate.id,
        installValidationStatus: mcpKatzillaInstallFailureReplay.failure.expectedInstallStatus,
        installValidationError: expect.stringContaining(mcpKatzillaInstallFailureReplay.failure.protocolError),
        sourceIdentity: {
          runtimeLane: "standard-mcp-import",
          packageRegistryType: "npm",
          packageIdentifier: "@katzilla/mcp",
          toolHiveRunSource: mcpKatzillaInstallFailureReplay.failure.toolHiveRunSource,
        },
      });
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }
  });
});
