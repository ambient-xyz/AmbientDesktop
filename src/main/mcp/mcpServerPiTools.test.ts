import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpAutowireCandidateRefStore, mcpAutowirePhase0Fixtures, validateMcpAutowireCandidate } from "./mcpAutowireFacade";
import { previewGuidedLocalBridge } from "./mcpGuidedLocalBridge";
import { mcpGuidedLocalBridgePreflightApprovalDetail, mcpGuidedLocalBridgeRegisterApprovalDetail, mcpServerInstallApprovalDetail, mcpServerUninstallApprovalDetail } from "./mcpServerPiTools";
import { ToolHiveRuntimeService } from "./mcpToolRuntimeFacade";
import { saveSecretReference } from "./mcpSecurityFacade";
import { saveMcpServerEnvSecret } from "./mcpSecretReferences";
import {
  callTool,
  fakeDefaultCapabilityPendingGate,
  fakeGuidedSseBridgeFetch,
  fakeRuntimePreflightFailedGate,
  fakeToolHiveMcpFetch,
  fixtureTools,
  genericCloudApiHostBridgeCandidate,
  guidedBridgeWithRequiredSecret,
  textFromResult,
  toolByName,
} from "./mcpServerPiToolsTestHelpers";

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
    let secretRef: string;
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
    let secretRef: string;
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
    const pendingGate = fakeDefaultCapabilityPendingGate();
    expect(pendingGate.pendingDefaultCapabilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ capabilityId: "scrapling" })]),
    );
    const { tools, calls } = await fixtureTools({
      installGate: async () => pendingGate,
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
    let secretRef: string;
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
