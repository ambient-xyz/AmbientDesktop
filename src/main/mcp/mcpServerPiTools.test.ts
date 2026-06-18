import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import { mcpAutowirePhase0Fixtures, mcpKatzillaInstallFailureReplay } from "../mcp-autowire/mcpAutowireFixtures";
import type { ContainerRuntimeProbeResult } from "../container-runtime/containerRuntimeProbeService";
import type { McpInstallGateResult } from "./mcpInstallGate";
import { previewGuidedLocalBridge } from "./mcpGuidedLocalBridge";
import { createMcpServerPiToolDefinitions, mcpGuidedLocalBridgePreflightApprovalDetail, mcpGuidedLocalBridgeRegisterApprovalDetail, mcpServerInstallApprovalDetail, mcpServerUninstallApprovalDetail } from "./mcpServerPiTools";
import {
  ToolHiveRuntimeService,
  type ToolHiveCommandExecutor,
  type ToolHiveCommandInvocation,
} from "../tool-runtime/toolHiveRuntimeService";
import { saveSecretReference } from "../security/secretReferenceStore";
import { saveMcpServerEnvSecret } from "./mcpSecretReferences";
import { createMcpAutowireCandidateRefStore } from "../mcp-autowire/mcpAutowireCandidateRefs";
import { createMcpAutowirePlanRevisionStore } from "../mcp-autowire/mcpAutowirePlanEdits";
import { validateMcpAutowireCandidate, type McpAutowireCandidate } from "../mcp-autowire/mcpAutowireSchemas";

describe("MCP server Pi tools", () => {
  it("falls back to locally bounded ToolHive logs when --tail is unsupported", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-logs-tail-fallback-"));
    try {
      const calls: string[][] = [];
      const service = new ToolHiveRuntimeService({
        userDataPath: join(root, "userData"),
        env: { PATH: process.env.PATH, HOME: root } as NodeJS.ProcessEnv,
        executor: async (invocation) => {
          calls.push(invocation.args);
          if (invocation.args.includes("--tail")) {
            return { stdout: "", stderr: "Error: unknown flag: --tail", exitCode: 1 };
          }
          return { stdout: "one\ntwo\nthree\n", stderr: "", exitCode: 0 };
        },
      });

      const result = await service.readWorkloadLogs("ambient-test-workload", 2);

      expect(calls).toEqual([
        ["logs", "ambient-test-workload", "--tail", "2"],
        ["logs", "ambient-test-workload"],
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("two\nthree\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("searches and describes registry MCP servers through compact first-party tools", async () => {
    const { tools } = await fixtureTools();
    const search = toolByName(tools, "ambient_mcp_server_search");
    const describe = toolByName(tools, "ambient_mcp_server_describe");

    const searchResult = await callTool(search, "call-1", { query: "docs" });
    expect(textFromResult(searchResult)).toContain("io.github.stacklok/context7");
    expect(searchResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_search",
      status: "complete",
      resultCount: 1,
    });

    const describeResult = await callTool(describe, "call-2", { serverId: "io.github.stacklok/context7" });
    expect(textFromResult(describeResult)).toContain("Install Context7");
    expect(textFromResult(describeResult)).toContain("Blockers: none.");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_describe",
      status: "ready-for-review",
      validationStatus: "ready-for-review",
      blockerCount: 0,
    });
  });

	  it("passes reviewed registry runtime volumes through describe, approval, ToolHive run, and state", async () => {
	    const approvals: string[] = [];
	    const { tools, calls, service } = await fixtureTools({
	      authorizeInstall: async ({ detail }) => {
	        approvals.push(detail);
	        return true;
	      },
	    });
	    await mkdir("/tmp/ambient-context7-docs", { recursive: true });
	    const expectedRuntimeVolumeHostPath = await realpath("/tmp/ambient-context7-docs");
	    const runtimeVolumes = [{
	      hostPath: "/tmp/ambient-context7-docs",
      containerPath: "/projects/docs",
      mode: "ro",
      purpose: "Expose the requested read-only docs fixture.",
    }];
    const describe = toolByName(tools, "ambient_mcp_server_describe");
    const install = toolByName(tools, "ambient_mcp_server_install");

    const describeResult = await callTool(describe, "call-registry-volumes-describe", {
      serverId: "io.github.stacklok/context7",
      runtimeVolumes,
    });
    expect(textFromResult(describeResult)).toContain("/tmp/ambient-context7-docs -> /projects/docs:ro");
    expect(describeResult?.details).toMatchObject({
      toolHiveVolumes: runtimeVolumes,
    });

    const installResult = await callTool(install, "call-registry-volumes-install", {
      serverId: "io.github.stacklok/context7",
      runtimeVolumes,
    });

    expect(installResult?.details).toMatchObject({
      status: "ready",
      toolHiveVolumes: runtimeVolumes,
    });
	    expect(approvals[0]).toContain("--volume /tmp/ambient-context7-docs:/projects/docs:ro");
	    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("io.github.stacklok/context7"));
	    expect(runCall?.args).toEqual(expect.arrayContaining(["--volume", `${expectedRuntimeVolumeHostPath}:/projects/docs:ro`]));
    expect((await service.readState()).installedServers[0]).toMatchObject({
      runtimeVolumes,
    });
  });

  it("runs the guarded registry install, list, and uninstall path after approvals", async () => {
    const approvals: string[] = [];
    const removals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      authorizeUninstall: async ({ detail }) => {
        removals.push(detail);
        return true;
      },
    });
    const install = toolByName(tools, "ambient_mcp_server_install");
    const list = toolByName(tools, "ambient_mcp_server_list");
    const defaultUpdateDescribe = toolByName(tools, "ambient_mcp_server_default_update_describe");
    const uninstall = toolByName(tools, "ambient_mcp_server_uninstall");

    const result = await callTool(install, "call-3", { serverId: "io.github.stacklok/context7" });

    expect(textFromResult(result)).toContain("MCP server io.github.stacklok/context7 is ready");
    expect(textFromResult(result)).toContain("Next validation hints:");
    expect(textFromResult(result)).toContain('ambient_mcp_tool_search {"serverId":"io.github.stacklok/context7"');
    expect(textFromResult(result)).toContain("run one harmless smoke call");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "ready",
      serverId: "io.github.stacklok/context7",
      workloadStatus: "running",
      endpoint: "http://127.0.0.1:4411/mcp",
      installValidationStatus: "ready",
      toolCount: 1,
      descriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(approvals[0]).toContain("Command shape: thv run --name ambient-stacklok-context7");
    expect(calls.map((call) => call.args.slice(0, 2).join(" "))).toEqual(expect.arrayContaining(["runtime check", "run --name"]));
    const state = await service.readState();
    expect(state.installedServers[0]).toMatchObject({
      serverId: "io.github.stacklok/context7",
      registrySource: "ambient-default",
      sourceIdentity: {
        runtimeLane: "toolhive-registry",
        sourceKind: "registry",
        sourceUrl: "https://github.com/upstash/context7",
        registryId: "io.github.stacklok/context7",
        packageRegistryType: "oci",
        packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.8",
        packageVersion: "2.1.8",
        toolHiveRunSource: "toolhive-registry:io.github.stacklok/context7",
        candidateId: "toolhive-registry-stacklok-context7",
        candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        riskLevel: "medium",
      },
      defaultCatalogDescriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      defaultCatalogReviewedAt: expect.any(String),
      installReview: {
        status: "reviewed",
        outcome: "ready",
        reviewedAt: expect.any(String),
        warningCount: 1,
        blockerCount: 0,
      },
      installValidationStatus: "ready",
      lastKnownToolDescriptors: [expect.objectContaining({ name: "query-docs" })],
      lastKnownToolDescriptorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      secretBindings: [],
    });

    const listResult = await callTool(list, "call-4", {});
    expect(textFromResult(listResult)).toContain("status=running");
    expect(textFromResult(listResult)).toContain("source=toolhive-registry/registry");
    expect(textFromResult(listResult)).toContain("installReview=reviewed outcome=ready");
    expect(textFromResult(listResult)).toContain("installValidation=ready");
    expect(listResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_list",
      serverCount: 1,
    });

    const latestState = await service.readState();
    await service.writeState({
      ...latestState,
      installedServers: latestState.installedServers.map((server) => ({
        ...server,
        defaultCatalogDescriptorHash: "stale-descriptor-hash",
        defaultCatalogReviewedAt: "2026-05-21T00:00:00.000Z",
        ...(server.sourceIdentity ? {
          sourceIdentity: {
            ...server.sourceIdentity,
            packageIdentifier: "ghcr.io/stacklok/dockyard/npx/context7:2.1.7",
            packageVersion: "2.1.7",
          },
        } : {}),
        lastKnownToolDescriptors: [{ name: "query-docs" }],
      })),
    });
    const updateResult = await callTool(defaultUpdateDescribe, "call-4b", { serverId: "io.github.stacklok/context7" });
    expect(textFromResult(updateResult)).toContain("Status: update-available");
    expect(textFromResult(updateResult)).toContain("ambient_mcp_server_uninstall");
    expect(textFromResult(updateResult)).toContain("ambient_mcp_server_install");
    expect(updateResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_default_update_describe",
      status: "update-available",
      serverId: "io.github.stacklok/context7",
      diffCount: expect.any(Number),
    });

    const removeResult = await callTool(uninstall, "call-5", { serverId: "io.github.stacklok/context7" });
    expect(textFromResult(removeResult)).toContain("Removed MCP server io.github.stacklok/context7");
    expect(removeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_uninstall",
      status: "removed",
      serverId: "io.github.stacklok/context7",
    });
    expect(removals[0]).toContain("Action: stop the ToolHive workload");
    expect(calls.map((call) => call.args[0])).toEqual(expect.arrayContaining(["stop", "rm"]));
    expect((await service.readState()).installedServers).toEqual([]);
  });

  it("reports ToolHive ambient workloads that are not in Ambient-managed MCP state", async () => {
    const { tools } = await fixtureTools();
    const list = toolByName(tools, "ambient_mcp_server_list");

    const result = await callTool(list, "call-list-unmanaged", {});

    expect(textFromResult(result)).toContain("No Ambient-managed ToolHive MCP servers are installed.");
    expect(textFromResult(result)).toContain("Unmanaged ToolHive workloads in Ambient group");
    expect(textFromResult(result)).toContain("Ambient has no reviewed install state");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_list",
      serverCount: 0,
      unmanagedWorkloadCount: 1,
      unmanagedWorkloads: [
        expect.objectContaining({
          workloadName: "ambient-stacklok-context7-a60a6283",
          status: "running",
          endpoint: "http://127.0.0.1:4411/mcp",
        }),
      ],
    });
  });

  it("routes built-in Scrapling through the default capability installer", async () => {
    const approvals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });

    const describeResult = await callTool(toolByName(tools, "ambient_mcp_server_describe"), "call-default-describe", {
      serverId: "io.github.d4vinci/scrapling",
    });
    expect(textFromResult(describeResult)).toContain("Default capability: scrapling");
    expect(textFromResult(describeResult)).toContain("default capability installer");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_describe",
      status: "ready-for-review",
      serverId: "io.github.d4vinci/scrapling",
      capabilityId: "scrapling",
      defaultCapability: true,
    });

    const installResult = await callTool(toolByName(tools, "ambient_mcp_server_install"), "call-default-install", {
      serverId: "io.github.d4vinci/scrapling",
    });

    expect(textFromResult(installResult)).toContain("Ambient default capability scrapling is ready");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "ready",
      serverId: "io.github.d4vinci/scrapling",
      capabilityId: "scrapling",
      defaultCapability: true,
      workloadName: "ambient-scrapling",
      installValidationStatus: "ready",
    });
    expect(approvals[0]).toContain("ghcr.io/d4vinci/scrapling@sha256:");
    expect(approvals[0]).toContain("Command shape: thv run --name ambient-scrapling");
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("ambient-scrapling"));
    expect(runCall?.args.join(" ")).toContain("ghcr.io/d4vinci/scrapling@sha256:");
    expect(runCall?.args).toEqual(expect.arrayContaining(["--", "mcp"]));
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "io.github.d4vinci/scrapling",
      workloadName: "ambient-scrapling",
      registrySource: "ambient-default-oci",
      sourceIdentity: {
        runtimeLane: "ambient-default-oci",
        sourceKind: "image",
      },
      imageVerificationPolicy: "ambient-reviewed",
    });
  });

  it("hands missing runtime back to setup when default Scrapling install is requested", async () => {
    const setupNeeded: Array<{ capabilityId?: "scrapling"; reason: string }> = [];
    const { tools, calls } = await fixtureTools({
      installGate: async () => fakeRuntimePreflightFailedGate(),
      onContainerRuntimeSetupNeeded: (event) => setupNeeded.push(event),
    });

    const result = await callTool(toolByName(tools, "ambient_mcp_server_install"), "call-default-runtime-missing", {
      serverId: "io.github.d4vinci/scrapling",
    });

    expect(textFromResult(result)).toContain("isolated container runtime is not ready");
    expect(textFromResult(result)).toContain("runtime setup dialog");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "runtime-preflight-failed",
      serverId: "io.github.d4vinci/scrapling",
      capabilityId: "scrapling",
      defaultCapability: true,
      runtimeStatus: "missing",
    });
    expect(setupNeeded).toEqual([
      expect.objectContaining({
        capabilityId: "scrapling",
        reason: "default-capability-install-runtime-not-ready",
      }),
    ]);
    expect(calls.some((call) => call.args[0] === "run")).toBe(false);
  });

  it("passes required Ambient-managed registry secret refs through Pi install without leaking values", async () => {
    const approvals: string[] = [];
    const { tools, calls, service, userData, runtimeSecretReads } = await fixtureTools({
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      authorizeUninstall: () => true,
    });
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    const secretValue = "github-required-secret-token-fixture";
    let secretRef = "";
    try {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");
      secretRef = await saveSecretReference({
        scope: "mcp-server",
        workspacePath: userData,
        ownerId: "io.github.stacklok/github",
        envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
        value: secretValue,
      });

      const describeResult = await callTool(toolByName(tools, "ambient_mcp_server_describe"), "call-secret-describe", {
        serverId: "io.github.stacklok/github",
        secretBindings: [{ envName: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef }],
      });
      expect(textFromResult(describeResult)).toContain("Blockers: none.");
      expect(describeResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_describe",
        status: "ready-for-review",
        serverId: "io.github.stacklok/github",
      });

      const installResult = await callTool(toolByName(tools, "ambient_mcp_server_install"), "call-secret-install", {
        serverId: "io.github.stacklok/github",
        secretBindings: [{ envName: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef }],
      });
      expect(textFromResult(installResult)).toContain("MCP server io.github.stacklok/github is ready");
      expect(installResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_install",
        status: "ready",
        serverId: "io.github.stacklok/github",
        installValidationStatus: "ready",
      });
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }

    const envFile = runtimeSecretReads.find((entry) => entry.kind === "container-env-file");
    expect(envFile).toMatchObject({
      kind: "container-env-file",
      text: `GITHUB_PERSONAL_ACCESS_TOKEN=${secretValue}\n`,
    });
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("io.github.stacklok/github"));
    expect(runCall?.args).toEqual(expect.arrayContaining(["--env-file", envFile?.path]));
    await expect(readFile(envFile!.path, "utf8")).rejects.toThrow();

    const state = await service.readState();
    expect(state.installedServers[0]).toMatchObject({
      serverId: "io.github.stacklok/github",
      secretBindings: [
        expect.objectContaining({
          envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
          secretRef,
          derivedBindings: [
            expect.objectContaining({
              kind: "container-env-file",
              runtimeName: "GITHUB_PERSONAL_ACCESS_TOKEN",
              target: expect.stringContaining("ambient-stacklok-github"),
            }),
          ],
        }),
      ],
    });
    const listResult = await callTool(toolByName(tools, "ambient_mcp_server_list"), "call-secret-list", {});
    expect(textFromResult(listResult)).toContain("secretBindings=1 env=GITHUB_PERSONAL_ACCESS_TOKEN derived=1 delivery=container-env-file");
    await callTool(toolByName(tools, "ambient_mcp_server_uninstall"), "call-secret-remove", { serverId: "io.github.stacklok/github" });
    expect((await service.readState()).installedServers).toEqual([]);

    const visibleText = [
      ...approvals,
      textFromResult(listResult),
      JSON.stringify(calls.map((call) => call.args)),
    ].join("\n");
    expect(visibleText).not.toContain(secretValue);
  });

  it("requests MCP secrets through Desktop and auto-resolves saved refs on retry", async () => {
    const approvals: string[] = [];
    const secretRequests: Array<{ serverId?: string; candidateId?: string; envName: string }> = [];
    const { tools, calls, service, userData, runtimeSecretReads } = await fixtureTools({
      requestMcpSecret: (event) => secretRequests.push(event),
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    const secretValue = "github-auto-resolved-token-fixture";
    let secretRef = "";
    try {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");

      const blockedDescribe = await callTool(toolByName(tools, "ambient_mcp_server_describe"), "call-auto-secret-blocked", {
        serverId: "io.github.stacklok/github",
      });
      expect(textFromResult(blockedDescribe)).toContain("ambient_mcp_secret_request");
      expect(blockedDescribe?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_describe",
        status: "blocked",
        serverId: "io.github.stacklok/github",
      });

      const requestResult = await callTool(toolByName(tools, "ambient_mcp_secret_request"), "call-auto-secret-request", {
        serverId: "io.github.stacklok/github",
        envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
      });
      expect(textFromResult(requestResult)).toContain("MCP secret dialog requested");
      expect(textFromResult(requestResult)).not.toContain(secretValue);
      expect(secretRequests).toEqual([
        expect.objectContaining({
          serverId: "io.github.stacklok/github",
          candidateId: "toolhive-registry-stacklok-github",
          envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
        }),
      ]);

      const saved = await saveMcpServerEnvSecret("/tmp/workspace", {
        serverId: "io.github.stacklok/github",
        candidateId: secretRequests[0]?.candidateId,
        envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
        value: secretValue,
      });
      secretRef = saved.secretRef;

      const describeResult = await callTool(toolByName(tools, "ambient_mcp_server_describe"), "call-auto-secret-describe", {
        serverId: "io.github.stacklok/github",
      });
      expect(textFromResult(describeResult)).toContain("Blockers: none.");
      expect(describeResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_describe",
        status: "ready-for-review",
        serverId: "io.github.stacklok/github",
        runPlan: {
          envSecretRefs: [{ envName: "GITHUB_PERSONAL_ACCESS_TOKEN", secretRef }],
        },
      });

      const installResult = await callTool(toolByName(tools, "ambient_mcp_server_install"), "call-auto-secret-install", {
        serverId: "io.github.stacklok/github",
      });
      expect(textFromResult(installResult)).toContain("MCP server io.github.stacklok/github is ready");
      expect(installResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_install",
        status: "ready",
        serverId: "io.github.stacklok/github",
        installValidationStatus: "ready",
      });
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }

    const envFile = runtimeSecretReads.find((entry) => entry.kind === "container-env-file");
    expect(envFile).toMatchObject({
      kind: "container-env-file",
      text: `GITHUB_PERSONAL_ACCESS_TOKEN=${secretValue}\n`,
    });
    expect(calls.find((call) => call.args[0] === "run" && call.args.includes("io.github.stacklok/github"))?.args).toEqual(
      expect.arrayContaining(["--env-file", envFile?.path]),
    );
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "io.github.stacklok/github",
      secretBindings: [
        expect.objectContaining({
          envName: "GITHUB_PERSONAL_ACCESS_TOKEN",
          secretRef,
        }),
      ],
    });
    expect(approvals.join("\n")).not.toContain(secretValue);
  });

  it("installs custom ToolHive servers when default capability approval is pending", async () => {
    const { tools, calls } = await fixtureTools({
      installGate: async () => fakeDefaultCapabilityPendingGate(),
    });
    const install = toolByName(tools, "ambient_mcp_server_install");

    const result = await callTool(install, "call-pending-default-install", { serverId: "io.github.stacklok/context7" });

    expect(textFromResult(result)).toContain("MCP server io.github.stacklok/context7 is ready");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "ready",
      serverId: "io.github.stacklok/context7",
      installValidationStatus: "ready",
    });
    expect(calls.some((call) => call.args[0] === "run" && call.args.includes("io.github.stacklok/context7"))).toBe(true);
  });

  it("describes and installs a package-backed Standard MCP import after approval", async () => {
    const approvals: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-active-revision-"));
    const planRevisions = createMcpAutowirePlanRevisionStore({
      storagePath: join(root, "revisions.json"),
      now: () => "2026-06-10T00:00:00.000Z",
    });
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
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

    const installResult = await callTool(
      install,
      "call-import-2",
      { candidateRef: "fixture:scrapling" },
      (update) => updates.push(update.content.map((item) => item.type === "text" ? item.text : "").join("\n")),
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
    expect(updates.join("\n")).toContain("Waiting for Ambient Desktop approval to install Standard MCP import scrapling-github-server-json.");
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
    expect(alreadyInstalledText).toContain(
      "MCP Standard import scrapling-github-server-json is already installed as ToolHive workload",
    );
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
      installedServers: [{
        ...installedState,
        sourceIdentity: {
          ...(installedState.sourceIdentity ?? { runtimeLane: "standard-mcp-import" as const }),
          candidateHash: "f".repeat(64),
        },
      }],
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
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
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
      operations: [expect.objectContaining({
        op: "network.allowlist.add",
        hosts: ["api.github.com"],
      })],
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
      installedServers: [{
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
      }],
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
      operations: [expect.objectContaining({
        op: "network.allowlist.add",
        hosts: ["api.github.com"],
      })],
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
    expect(candidateRefs.get((planRevisions.read(revisionId)?.candidateRef) ?? "")).toMatchObject({
      id: "context7-standard-mcp",
    });
  });

  it("repairs stale Standard MCP imports missing managed file exchange state", async () => {
    const approvals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });
    await service.writeState({
      ...(await service.readState()),
      installedServers: [{
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
      }],
    });
    const install = toolByName(tools, "ambient_mcp_standard_import_install");
    const updates: unknown[] = [];

    const installResult = await callTool(install, "call-import-stale-repair", {
      candidateRef: "fixture:scrapling",
    }, (update) => updates.push(update));

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
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        details: expect.objectContaining({
          toolName: "ambient_mcp_standard_import_install",
          status: "repair-required",
          repairReasons: expect.arrayContaining([
            "installed state is missing Ambient managed MCP file exchange metadata",
          ]),
        }),
      }),
    ]));
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
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
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
      installedServers: [{
        ...installed,
        permissionProfilePath: "/profiles/stale-profile.json",
        permissionProfileSha256: "stale-profile",
      }],
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
      installedServers: [{
        serverId: "scrapling-github-server-json",
        activeRevisionId: installResult?.details.activeRevisionId,
        permissionProfileSha256: expect.not.stringMatching(/^stale-profile$/),
        installValidationStatus: "ready",
      }],
    });
  });

  it("keeps a Standard MCP import in validation_failed when tools/list fails after endpoint startup", async () => {
    const { tools, service } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
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
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:source-built" ? candidate : undefined,
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
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:katzilla-replay" ? mcpKatzillaInstallFailureReplay.candidate : undefined,
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

      const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes(mcpKatzillaInstallFailureReplay.failure.toolHiveRunSource));
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

  it("returns redacted first-party diagnostics for a validation failed MCP server", async () => {
    const { tools } = await fixtureTools({
      resolveCandidateRef: (candidateRef) => candidateRef === "fixture:scrapling" ? mcpAutowirePhase0Fixtures.scrapling : undefined,
      authorizeInstall: () => true,
      mcpToolFetchImpl: fakeToolHiveMcpFetch({ failListTools: true }),
    });
    await callTool(toolByName(tools, "ambient_mcp_standard_import_install"), "call-import-diagnostics-install", {
      candidateRef: "fixture:scrapling",
    });

    const diagnosticsResult = await callTool(toolByName(tools, "ambient_mcp_server_diagnostics"), "call-import-diagnostics", {
      serverId: "scrapling-github-server-json",
      logLines: 20,
    });

    const text = textFromResult(diagnosticsResult);
    expect(text).toContain("MCP server diagnostics for scrapling-github-server-json");
    expect(text).toContain("Install validation: validation_failed");
    expect(text).toContain("Validation error:");
    expect(text).toContain("kz.getTools is not a function");
    expect(text).toContain("Network permission: broad ports=80,443");
    expect(text).toContain("Filesystem permission: workspaceRead=false workspaceWrite=false extraMounts=1");
    expect(text).toContain("api_key=[REDACTED]");
    expect(text).not.toContain("fixture-log-secret-token");
    expect(diagnosticsResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_diagnostics",
      status: "complete",
      serverId: "scrapling-github-server-json",
      installValidationStatus: "validation_failed",
      permissionProfileVerified: true,
      logExitCode: 0,
      logRedacted: true,
    });
  });

  it("describes a Standard MCP import from a persisted autowire candidate ref after session reset", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-server-pi-refs-"));
    const storagePath = join(root, "thread-1.json");
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash;
    const candidateRef = createMcpAutowireCandidateRefStore({ storagePath }).put(
      mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
      candidateHash,
    );
    createMcpAutowireCandidateRefStore({ storagePath }).markReviewed(
      candidateRef,
      mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
      candidateHash,
    );
    const { tools } = await fixtureTools({
      resolveCandidateRef: (ref) => createMcpAutowireCandidateRefStore({ storagePath }).getReviewed(ref),
    });
    const describe = toolByName(tools, "ambient_mcp_standard_import_describe");

    const describeResult = await callTool(describe, "call-import-reset", {
      candidateRef,
      expectedCandidateHash: candidateHash,
    });

    expect(textFromResult(describeResult)).toContain("Catalog source: standard-mcp-import");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_describe",
      status: "ready-for-review",
      candidateId: "scrapling-github-server-json",
      validationStatus: "ready-for-review",
      nextToolName: "ambient_mcp_standard_import_install",
      nextToolInput: {
        candidateRef,
        expectedCandidateHash: candidateHash,
      },
      directInstallNextToolName: "ambient_mcp_standard_import_install",
      directInstallNextToolInput: {
        candidateRef,
        expectedCandidateHash: candidateHash,
      },
      doNotSearchForNextTool: true,
    });
  });

  it("rejects plan-only autowire candidate refs before Standard MCP import describe", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-mcp-server-pi-plan-refs-"));
    const storagePath = join(root, "thread-1.json");
    const candidateHash = validateMcpAutowireCandidate(mcpAutowirePhase0Fixtures.scrapling).candidateHash;
    const candidateRef = createMcpAutowireCandidateRefStore({ storagePath }).put(
      mcpAutowirePhase0Fixtures.scrapling as unknown as Record<string, unknown>,
      candidateHash,
    );
    const { tools } = await fixtureTools({
      resolveCandidateRef: (ref) => createMcpAutowireCandidateRefStore({ storagePath }).getReviewed(ref),
    });
    const describe = toolByName(tools, "ambient_mcp_standard_import_describe");

    await expect(callTool(describe, "call-import-plan-only-ref", {
      candidateRef,
      expectedCandidateHash: candidateHash,
    })).rejects.toThrow(/No reviewed MCP candidate is available/);
  });

  it("describes and installs a Remote MCP endpoint through ToolHive proxy after approval", async () => {
    const approvals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
    });
    const describe = toolByName(tools, "ambient_mcp_remote_proxy_describe");
    const install = toolByName(tools, "ambient_mcp_remote_proxy_install");

    const describeResult = await callTool(describe, "call-remote-1", {
      candidate: mcpAutowirePhase0Fixtures.context7,
    });
    expect(textFromResult(describeResult)).toContain("Catalog source: remote-mcp-proxy");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_remote_proxy_describe",
      status: "ready-for-review",
      serverId: "context7-remote-mcp",
      toolHiveRemoteUrl: "https://mcp.context7.com/mcp",
    });

    const installResult = await callTool(install, "call-remote-2", {
      candidate: mcpAutowirePhase0Fixtures.context7,
    });

    expect(textFromResult(installResult)).toContain("MCP server context7-remote-mcp is ready");
    expect(installResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_remote_proxy_install",
      status: "ready",
      serverId: "context7-remote-mcp",
      workloadStatus: "running",
      installValidationStatus: "ready",
    });
    expect(approvals[0]).toContain("https://mcp.context7.com/mcp");
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("https://mcp.context7.com/mcp"));
    expect(runCall?.args).toEqual(expect.arrayContaining(["--transport", "streamable-http", "https://mcp.context7.com/mcp"]));
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "context7-remote-mcp",
      endpoint: "http://127.0.0.1:4411/mcp",
      registrySource: "remote-mcp-proxy",
      sourceIdentity: {
        runtimeLane: "remote-mcp-proxy",
        sourceKind: "remote-url",
        sourceUrl: "https://github.com/upstash/context7",
        toolHiveRunSource: "https://mcp.context7.com/mcp",
        candidateId: "context7-remote-mcp",
        candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        riskLevel: "medium",
      },
      installReview: {
        status: "reviewed",
        outcome: "ready",
        reviewedAt: expect.any(String),
        warningCount: 2,
        blockerCount: 0,
      },
      secretBindings: [],
    });
  });

  it("delivers optional Remote MCP secrets through short-lived bearer-token files", async () => {
    const approvals: string[] = [];
    const { tools, calls, service, userData, runtimeSecretReads } = await fixtureTools({
      authorizeInstall: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      authorizeUninstall: () => true,
    });
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    const secretValue = "Bearer context7-remote-secret-fixture";
    let secretRef = "";
    try {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");
      secretRef = await saveSecretReference({
        scope: "mcp-server",
        workspacePath: userData,
        ownerId: "context7-remote-mcp",
        envName: "CONTEXT7_API_KEY",
        value: secretValue,
      });

      const describeResult = await callTool(toolByName(tools, "ambient_mcp_remote_proxy_describe"), "call-remote-secret-describe", {
        candidate: mcpAutowirePhase0Fixtures.context7,
        secretBindings: [{ envName: "CONTEXT7_API_KEY", secretRef }],
      });
      expect(textFromResult(describeResult)).toContain("CONTEXT7_API_KEY -> remote-bearer-token-file Authorization");
      expect(describeResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_remote_proxy_describe",
        status: "ready-for-review",
        serverId: "context7-remote-mcp",
      });

      const installResult = await callTool(toolByName(tools, "ambient_mcp_remote_proxy_install"), "call-remote-secret-install", {
        candidate: mcpAutowirePhase0Fixtures.context7,
        secretBindings: [{ envName: "CONTEXT7_API_KEY", secretRef }],
      });
      expect(textFromResult(installResult)).toContain("MCP server context7-remote-mcp is ready");
      expect(installResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_remote_proxy_install",
        status: "ready",
        serverId: "context7-remote-mcp",
        installValidationStatus: "ready",
      });
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }

    const tokenFile = runtimeSecretReads.find((entry) => entry.kind === "remote-bearer-token-file");
    expect(tokenFile).toMatchObject({
      kind: "remote-bearer-token-file",
      text: "context7-remote-secret-fixture\n",
    });
    const runCall = calls.find((call) => call.args[0] === "run" && call.args.includes("https://mcp.context7.com/mcp"));
    expect(runCall?.args).toEqual(expect.arrayContaining(["--remote-auth", "--remote-auth-bearer-token-file", tokenFile?.path]));
    await expect(readFile(tokenFile!.path, "utf8")).rejects.toThrow();

    const state = await service.readState();
    expect(state.installedServers[0]).toMatchObject({
      serverId: "context7-remote-mcp",
      secretBindings: [
        expect.objectContaining({
          envName: "CONTEXT7_API_KEY",
          secretRef,
          derivedBindings: [
            expect.objectContaining({
              kind: "remote-bearer-token-file",
              runtimeName: "Authorization",
              target: "https://mcp.context7.com/mcp",
            }),
          ],
        }),
      ],
    });
    await callTool(toolByName(tools, "ambient_mcp_server_uninstall"), "call-remote-secret-remove", { serverId: "context7-remote-mcp" });
    expect((await service.readState()).installedServers).toEqual([]);

    const visibleText = [
      ...approvals,
      JSON.stringify(calls.map((call) => call.args)),
    ].join("\n");
    expect(visibleText).not.toContain(secretValue);
    expect(visibleText).not.toContain("context7-remote-secret-fixture");
  });

  it("describes and preflights a guided local bridge without installing software", async () => {
    const approvals: string[] = [];
    const fetched: string[] = [];
    const { tools, calls } = await fixtureTools({
      authorizeGuidedLocalBridgePreflight: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      guidedLocalBridgeFetchImpl: async (input) => {
        fetched.push(String(input));
        return new Response("", { status: 200 });
      },
    });
    const describe = toolByName(tools, "ambient_mcp_guided_bridge_describe");
    const preflight = toolByName(tools, "ambient_mcp_guided_bridge_preflight");

    const describeResult = await callTool(describe, "call-guided-1", {
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
    });
    expect(textFromResult(describeResult)).toContain("Catalog source: guided-local-bridge");
    expect(textFromResult(describeResult)).toContain("Ambient will not install Ghidra");
    expect(describeResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_guided_bridge_describe",
      status: "guided-setup-required",
      serverId: "ghidramcp-guided-local-bridge",
      bridgeProbeUrl: "http://127.0.0.1:8081/sse",
      upstreamAppUrl: "http://127.0.0.1:8080/",
    });

    const preflightResult = await callTool(preflight, "call-guided-2", {
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
      timeoutMs: 500,
    });
    expect(textFromResult(preflightResult)).toContain("Guided bridge preflight for GhidraMCP");
    expect(preflightResult?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_guided_bridge_preflight",
      status: "ready",
      serverId: "ghidramcp-guided-local-bridge",
    });
    expect(approvals[0]).toContain("bounded GET requests only");
    expect(approvals[0]).toContain("No local software will be installed");
    expect(fetched).toEqual([
      "http://127.0.0.1:8081/sse",
      "http://127.0.0.1:8080/",
    ]);
    expect(calls.some((call) => call.args[0] === "run")).toBe(false);
  });

  it("blocks generic cloud/API MCPs from using guided-local host bridge fallback", async () => {
    const { tools } = await fixtureTools();
    const candidate = genericCloudApiHostBridgeCandidate();
    const describe = toolByName(tools, "ambient_mcp_guided_bridge_describe");

    const result = await callTool(describe, "call-guided-generic-block", {
      candidate,
    });

    const text = textFromResult(result);
    expect(text).toContain("Guided local bridge requires local-only network mode");
    expect(text).toContain("Guided local bridge hosts must be loopback-only");
    expect(text).toContain("User-run command shape: hidden until hard blockers are resolved.");
    expect(text).not.toContain("npx supergateway");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_guided_bridge_describe",
      status: "blocked",
      serverId: "katzilla-host-bridge-blocked",
    });
  });

  it("registers a guided local bridge and discovers harmless MCP tool descriptors", async () => {
    const approvals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      authorizeGuidedLocalBridgeRegister: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      guidedLocalBridgeFetchImpl: fakeGuidedSseBridgeFetch(),
    });
    const register = toolByName(tools, "ambient_mcp_guided_bridge_register");
    const list = toolByName(tools, "ambient_mcp_server_list");

    const result = await callTool(register, "call-guided-register", {
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
      timeoutMs: 500,
    });

    expect(textFromResult(result)).toContain("Registered guided local bridge ghidramcp-guided-local-bridge");
    expect(textFromResult(result)).toContain("list_functions");
    expect(result?.details).toMatchObject({
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_guided_bridge_register",
      status: "ready",
      serverId: "ghidramcp-guided-local-bridge",
      workloadName: "ambient-ghidramcp-guided-local-bridge",
      endpoint: "http://127.0.0.1:8081/sse",
      installValidationStatus: "ready",
      toolCount: 1,
    });
    expect(approvals[0]).toContain("tools/list for descriptor discovery");
    expect(calls.some((call) => call.args[0] === "run")).toBe(false);
    expect((await service.readState()).installedServers[0]).toMatchObject({
      serverId: "ghidramcp-guided-local-bridge",
      workloadName: "ambient-ghidramcp-guided-local-bridge",
      endpoint: "http://127.0.0.1:8081/sse",
      registrySource: "guided-local-bridge",
      sourceIdentity: {
        runtimeLane: "guided-local-bridge",
        sourceKind: "local-bridge",
      },
      lastKnownToolDescriptors: [expect.objectContaining({ name: "list_functions" })],
      toolDescriptorReviewStatus: "trusted",
    });

    const listResult = await callTool(list, "call-guided-list", {});
    expect(textFromResult(listResult)).toContain("source=guided-local-bridge/local-bridge");
    expect(textFromResult(listResult)).toContain("endpoint=http://127.0.0.1:8081/sse");
  });

  it("records Ambient-managed secret refs for guided local bridge registration without leaking values", async () => {
    const approvals: string[] = [];
    const candidate = guidedBridgeWithRequiredSecret();
    const { tools, calls, service, userData } = await fixtureTools({
      authorizeGuidedLocalBridgeRegister: async ({ detail }) => {
        approvals.push(detail);
        return true;
      },
      guidedLocalBridgeFetchImpl: fakeGuidedSseBridgeFetch(),
    });
    const describe = toolByName(tools, "ambient_mcp_guided_bridge_describe");
    const register = toolByName(tools, "ambient_mcp_guided_bridge_register");
    const previousStoreRoot = process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
    const rawSecret = "guided-local-secret-fixture-should-not-leak";
    try {
      process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = join(userData, "secret-reference-store");

      const blockedDescribe = await callTool(describe, "call-guided-secret-blocked", {
        candidate,
      });
      expect(textFromResult(blockedDescribe)).toContain("Required guided-local secret GHIDRA_BRIDGE_TOKEN");
      expect(textFromResult(blockedDescribe)).toContain("ambient_mcp_secret_request");
      expect(blockedDescribe?.details).toMatchObject({
        status: "blocked",
        secretBlockerCount: 1,
        missingRequiredSecrets: ["GHIDRA_BRIDGE_TOKEN"],
      });

      const saved = await saveMcpServerEnvSecret("/tmp/workspace", {
        candidateId: candidate.id,
        envName: "GHIDRA_BRIDGE_TOKEN",
        value: rawSecret,
      });

      const readyDescribe = await callTool(describe, "call-guided-secret-ready", {
        candidate,
      });
      expect(textFromResult(readyDescribe)).toContain("Bound Ambient refs: GHIDRA_BRIDGE_TOKEN");
      expect(readyDescribe?.details).toMatchObject({
        status: "guided-setup-required",
        secretBlockerCount: 0,
        secretBindingCount: 1,
      });

      const registerResult = await callTool(register, "call-guided-secret-register", {
        candidate,
      });

      expect(textFromResult(registerResult)).toContain("Registered guided local bridge ghidramcp-secret-guided-local-bridge");
      expect(registerResult?.details).toMatchObject({
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_guided_bridge_register",
        status: "ready",
        serverId: "ghidramcp-secret-guided-local-bridge",
        secretBindingCount: 1,
      });
      expect((await service.readState()).installedServers[0]).toMatchObject({
        serverId: "ghidramcp-secret-guided-local-bridge",
        secretBindings: [
          expect.objectContaining({
            envName: "GHIDRA_BRIDGE_TOKEN",
            secretRef: saved.secretRef,
          }),
        ],
      });

      const visibleText = [
        textFromResult(blockedDescribe),
        textFromResult(readyDescribe),
        textFromResult(registerResult),
        ...approvals,
        JSON.stringify(calls.map((call) => call.args)),
      ].join("\n");
      expect(visibleText).not.toContain(rawSecret);
      expect(approvals[0]).toContain("Secret refs: record approved Ambient secret refs for GHIDRA_BRIDGE_TOKEN");
      expect(calls.some((call) => call.args[0] === "run")).toBe(false);
    } finally {
      if (previousStoreRoot === undefined) delete process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT;
      else process.env.AMBIENT_SECRET_REFERENCE_STORE_ROOT = previousStoreRoot;
    }
  });

  it("unregisters guided local bridge state without calling ToolHive stop or rm", async () => {
    const removals: string[] = [];
    const { tools, calls, service } = await fixtureTools({
      authorizeGuidedLocalBridgeRegister: () => true,
      authorizeUninstall: async ({ detail }) => {
        removals.push(detail);
        return true;
      },
      guidedLocalBridgeFetchImpl: fakeGuidedSseBridgeFetch(),
    });
    await callTool(toolByName(tools, "ambient_mcp_guided_bridge_register"), "call-guided-register-remove", {
      candidate: mcpAutowirePhase0Fixtures.ghidraMcp,
    });

    const removeResult = await callTool(toolByName(tools, "ambient_mcp_server_uninstall"), "call-guided-remove", {
      serverId: "ghidramcp-guided-local-bridge",
    });

    expect(textFromResult(removeResult)).toContain("Removed guided local bridge registration");
    expect(removals[0]).toContain("local software");
    expect(calls.some((call) => call.args[0] === "stop" || call.args[0] === "rm")).toBe(false);
    expect((await service.readState()).installedServers).toEqual([]);
  });

  it("does not run installs with unresolved blockers or planner-mode threads", async () => {
    const { tools, calls } = await fixtureTools();
    const install = toolByName(tools, "ambient_mcp_server_install");

    const blocked = await callTool(install, "call-4", { serverId: "io.github.stacklok/github" });
    expect(textFromResult(blocked)).toContain("Required secret GITHUB_PERSONAL_ACCESS_TOKEN");
    expect(blocked?.details).toMatchObject({ status: "blocked" });
    expect(calls.some((call) => call.args[0] === "run")).toBe(false);

    const planner = await fixtureTools({ collaborationMode: "planner" });
    await expect(callTool(toolByName(planner.tools, "ambient_mcp_server_install"), "call-5", { serverId: "io.github.stacklok/context7" })).rejects.toThrow(
      "blocked in Planner Mode",
    );
    await expect(callTool(toolByName(planner.tools, "ambient_mcp_server_uninstall"), "call-6", { serverId: "io.github.stacklok/context7" })).rejects.toThrow(
      "blocked in Planner Mode",
    );
    await expect(callTool(toolByName(planner.tools, "ambient_mcp_guided_bridge_preflight"), "call-7", { candidate: mcpAutowirePhase0Fixtures.ghidraMcp })).rejects.toThrow(
      "blocked in Planner Mode",
    );
    await expect(callTool(toolByName(planner.tools, "ambient_mcp_guided_bridge_register"), "call-8", { candidate: mcpAutowirePhase0Fixtures.ghidraMcp })).rejects.toThrow(
      "blocked in Planner Mode",
    );
  });

  it("formats approval detail with exact source, permission, and command shape", async () => {
    const { catalog, service } = await fixtureTools();
    const preview = await catalog.previewRegistryInstall({ serverId: "io.github.stacklok/context7" });
    const preflight = await service.preflightRuntime(5);

    const detail = mcpServerInstallApprovalDetail({
      preview,
      workspace: { path: "/tmp/workspace" },
      preflight: preflight.command,
    });

    expect(detail).toContain("Permissions:");
    expect(detail).toContain("thv run --name");
    expect(detail).toContain("Secret values: never exposed");

    const uninstallDetail = mcpServerUninstallApprovalDetail({
      server: {
        serverId: "io.github.stacklok/context7",
        workloadName: "ambient-context7",
        permissionProfilePath: "/tmp/context7.permissions.json",
        permissionProfileSha256: "abc123",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
        workloadStatus: "running",
        endpoint: "http://127.0.0.1:4411/mcp",
      },
      workspace: { path: "/tmp/workspace" },
    });
    expect(uninstallDetail).toContain("Remove Ambient MCP server");
    expect(uninstallDetail).toContain("Secrets: no secret values");

    const guidedUninstallDetail = mcpServerUninstallApprovalDetail({
      server: {
        serverId: "ghidramcp-guided-local-bridge",
        workloadName: "ambient-ghidramcp-guided-local-bridge",
        registrySource: "guided-local-bridge",
        runtimeLane: "guided-local-bridge",
        permissionProfilePath: "/tmp/ghidra.permissions.json",
        permissionProfileSha256: "def456",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
        workloadStatus: "registered-local-bridge",
        endpoint: "http://127.0.0.1:8081/sse",
      },
      workspace: { path: "/tmp/workspace" },
    });
    expect(guidedUninstallDetail).toContain("remove Ambient global MCP registration state only");
    expect(guidedUninstallDetail).toContain("will not stop, modify, or uninstall");

    const guidedDetail = mcpGuidedLocalBridgePreflightApprovalDetail({
      preview: previewGuidedLocalBridge({ candidate: mcpAutowirePhase0Fixtures.ghidraMcp }),
      workspace: { path: "/tmp/workspace" },
    });
    expect(guidedDetail).toContain("bounded GET requests");
    expect(guidedDetail).toContain("No local software");

    const guidedRegisterDetail = mcpGuidedLocalBridgeRegisterApprovalDetail({
      preview: previewGuidedLocalBridge({ candidate: mcpAutowirePhase0Fixtures.ghidraMcp }),
      workspace: { path: "/tmp/workspace" },
    });
    expect(guidedRegisterDetail).toContain("tools/list for descriptor discovery");
    expect(guidedRegisterDetail).toContain("No local software");
  });
});

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
        extraMounts: [{
          path: "/tmp/ambient-katzilla-config",
          containerPath: "/config",
          mode: "read-only",
          purpose: "Mount reviewed custom source runtime config read-only.",
        }],
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

async function fixtureTools(options: {
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
} = {}) {
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
      if (!workloads.size) workloads.set("ambient-stacklok-context7-a60a6283", { name: "ambient-stacklok-context7-a60a6283", status: "running", group: "ambient", proxy_url: "http://127.0.0.1:4411/mcp" });
      return ok(JSON.stringify([...workloads.values()]));
    }
    if (invocation.args[0] === "logs") {
      return ok([
        "server booted",
        "api_key=fixture-log-secret-token",
        "TypeError: kz.getTools is not a function",
      ].join("\n"));
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
  return tool.execute(toolCallId, input, undefined, onUpdate, undefined as any);
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
        const message = body.method === "initialize"
          ? { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } }
          : { jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "list_functions", description: "List all functions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }] } };
        controller?.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`));
      }
      return new Response("", { status: 202 });
    }
    return new Response("not found", { status: 404 });
  };
}

function fakeToolHiveMcpFetch(options: {
  tools?: Array<Record<string, unknown>>;
  failListTools?: boolean;
} = {}): (input: string | URL, init?: RequestInit) => Promise<Response> {
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
    const response = options.failListTools && body.method === "tools/list"
      ? { jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "kz.getTools is not a function" } }
      : {
          jsonrpc: "2.0",
          id: body.id,
          result: body.method === "tools/list"
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
