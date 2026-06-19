import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors, piToolFieldsFromDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpAutowirePhase0Fixtures,
  mcpKatzillaInstallFailureReplay,
} from "./mcpAutowireFacade";
import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  validateMcpAutowireCandidate,
  type McpAutowireCandidate,
} from "./mcpAutowireFacade";
import { mcpLivePiSmokePrompt } from "./mcpLivePiSmoke";

describe("ToolHive MCP flow release gate", () => {
  it("keeps first-party MCP install, diagnostics, secret, and tool-call surfaces discoverable", () => {
    const descriptors = firstPartyDesktopToolDescriptors();
    const descriptorNames = descriptors.map((descriptor) => descriptor.name);

    expect(descriptorNames).toEqual(expect.arrayContaining([
      "ambient_mcp_autowire_plan",
      "ambient_mcp_autowire_review",
      "ambient_mcp_autowire_evidence_read",
      "ambient_mcp_autowire_plan_revision_list",
      "ambient_mcp_autowire_plan_revision_read",
      "ambient_mcp_autowire_plan_edit_describe",
      "ambient_mcp_autowire_plan_edit_apply",
      "ambient_mcp_autowire_source_build_describe",
      "ambient_mcp_autowire_source_build_create",
      "ambient_mcp_autowire_custom_source_describe",
      "ambient_mcp_standard_import_describe",
      "ambient_mcp_standard_import_install",
      "ambient_mcp_remote_proxy_describe",
      "ambient_mcp_remote_proxy_install",
      "ambient_mcp_guided_bridge_describe",
      "ambient_mcp_guided_bridge_preflight",
      "ambient_mcp_guided_bridge_register",
      "ambient_mcp_secret_request",
      "ambient_mcp_runtime_repair_describe",
      "ambient_mcp_runtime_repair_apply",
      "ambient_mcp_server_diagnostics",
      "ambient_mcp_server_list",
      "ambient_mcp_tool_search",
      "ambient_mcp_tool_describe",
      "ambient_mcp_tool_call",
    ]));

    const standardDescribe = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_standard_import_describe")!;
    const standardInstall = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_standard_import_install")!;
    const sourceBuildDescribe = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_autowire_source_build_describe")!;
    const sourceBuildCreate = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_autowire_source_build_create")!;
    const customSourceDescribe = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_autowire_custom_source_describe")!;
    const planEditDescribe = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_autowire_plan_edit_describe")!;
    const planEditApply = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_autowire_plan_edit_apply")!;
    const guidedRegister = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_guided_bridge_register")!;
    const diagnostics = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_server_diagnostics")!;
    const runtimeRepairDescribe = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_runtime_repair_describe")!;
    const runtimeRepairApply = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_runtime_repair_apply")!;
    const secretRequest = descriptors.find((descriptor) => descriptor.name === "ambient_mcp_secret_request")!;

    expect((standardDescribe.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect((standardInstall.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect((sourceBuildDescribe.inputSchema as any).properties.candidateRef).toMatchObject({ type: "string" });
    expect((sourceBuildCreate.inputSchema as any).properties.sourceBuild).toMatchObject({ type: "object" });
    expect((customSourceDescribe.inputSchema as any).properties.sourceBuild).toMatchObject({ type: "object" });
    expect((planEditDescribe.inputSchema as any).properties.revisionId).toMatchObject({ type: "string" });
    expect((planEditDescribe.inputSchema as any).properties.operations).toMatchObject({ type: "array" });
    expect((planEditApply.inputSchema as any).properties.operations).toMatchObject({ type: "array" });
    expect((runtimeRepairDescribe.inputSchema as any).properties.failureText).toMatchObject({ type: "string" });
    expect((runtimeRepairDescribe.inputSchema as any).properties.revisionId).toMatchObject({ type: "string" });
    expect((runtimeRepairApply.inputSchema as any).properties.serverId).toMatchObject({ type: "string" });
    expect((standardInstall.inputSchema as any).properties.secretBindings).toMatchObject({ type: "array" });
    expect((guidedRegister.inputSchema as any).properties.secretBindings).toMatchObject({ type: "array" });
    expect((diagnostics.inputSchema as any).properties.logLines).toMatchObject({ type: "number" });
    expect((secretRequest.inputSchema as any).properties.envName).toMatchObject({ type: "string" });

    const standardGuidance = piToolFieldsFromDescriptor(standardInstall).promptGuidelines.join("\n");
    const sourceBuildGuidance = piToolFieldsFromDescriptor(sourceBuildDescribe).promptGuidelines.join("\n");
    const sourceBuildCreateGuidance = piToolFieldsFromDescriptor(sourceBuildCreate).promptGuidelines.join("\n");
    const customSourceGuidance = piToolFieldsFromDescriptor(customSourceDescribe).promptGuidelines.join("\n");
    const planEditGuidance = piToolFieldsFromDescriptor(planEditApply).promptGuidelines.join("\n");
    const runtimeRepairGuidance = piToolFieldsFromDescriptor(runtimeRepairApply).promptGuidelines.join("\n");
    const guidedGuidance = piToolFieldsFromDescriptor(guidedRegister).promptGuidelines.join("\n");
    const diagnosticsGuidance = piToolFieldsFromDescriptor(diagnostics).promptGuidelines.join("\n");

    expect(standardGuidance).toContain("source-built");
    expect(standardGuidance).toContain("ambient_mcp_secret_request");
    expect(sourceBuildGuidance).toContain("sourceBuild plan");
    expect(sourceBuildCreateGuidance).toContain("clone/build/inspect");
    expect(customSourceGuidance).toContain("after ambient_mcp_autowire_source_build_create");
    expect(customSourceGuidance).toContain("OCI digest");
    expect(planEditGuidance).toContain("explicit user approval");
    expect(planEditGuidance).toContain("raw ToolHive");
    expect(runtimeRepairGuidance).toContain("explicit user approval");
    expect(runtimeRepairGuidance).toContain("raw ToolHive");
    expect(guidedGuidance).toContain("already-running local bridge");
    expect(guidedGuidance).toContain("does not install, launch, modify");
    expect(guidedGuidance).toContain("secret refs");
    expect(diagnosticsGuidance).toContain("validation_failed");
    expect(diagnosticsGuidance).toContain("tools/list fails");
  });

  it("locks the Katzilla replay to ToolHive validation_failed diagnostics without secret or host-bridge leakage", () => {
    const candidate = mcpKatzillaInstallFailureReplay.candidate;
    const validation = validateMcpAutowireCandidate(candidate);

    expect(candidate).toMatchObject({
      recommendedLane: "standard-mcp",
      runtime: {
        provider: "toolhive",
        sourceKind: "npm",
        package: {
          registryType: "npm",
          identifier: "@katzilla/mcp",
        },
      },
    });
    expect(validation.status).toBe("ready-for-review");
    expect(validation.outcome).toBe("ready");
    expect(validation.readyForToolHiveRun).toBe(false);
    expect(candidate.secrets).toEqual([
      expect.objectContaining({
        name: "KATZILLA_API_KEY",
        required: true,
        secret: true,
      }),
    ]);
    expect(mcpKatzillaInstallFailureReplay.failure).toMatchObject({
      toolHiveRunSource: "npx://@katzilla/mcp",
      protocolError: "kz.getTools is not a function",
      expectedInstallStatus: "validation_failed",
    });

    const prompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidateRef: "fixture:katzilla-replay",
        serverId: candidate.id,
        label: candidate.displayName,
      },
      expectedOutcome: "validation-failed",
      diagnosticsServerId: candidate.id,
      expectedDiagnosticText: mcpKatzillaInstallFailureReplay.failure.protocolError,
      successText: "MCP_LIVE_SMOKE_KATZILLA_DIAGNOSTICS_DONE",
    });

    expect(prompt).toContain("ambient_mcp_standard_import_install");
    expect(prompt).toContain("ambient_mcp_server_diagnostics");
    expect(prompt).toContain("validation_failed");
    expect(prompt).toContain("keep the workload inside ToolHive");
    for (const forbidden of mcpKatzillaInstallFailureReplay.forbiddenVisibleFragments) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("keeps source-built artifacts pinned before ToolHive import and keeps candidate refs compact", () => {
    const sourceBuilt = sourceBuiltCustomImageCandidate();
    const validation = validateMcpAutowireCandidate(sourceBuilt);

    expect(validation.status).toBe("ready-for-review");
    expect(validation.outcome).toBe("ready");
    expect(validation.readyForToolHiveRun).toBe(true);
    expect(validation.blockers).toEqual([]);

    const sourceBuiltPrompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidate: sourceBuilt as unknown as Record<string, unknown>,
        serverId: sourceBuilt.id,
        label: sourceBuilt.displayName,
      },
      toolQuery: "katzilla",
      toolName: "query",
      toolArguments: { query: "health" },
      successText: "MCP_LIVE_SMOKE_SOURCE_BUILT_DONE",
    });
    expect(sourceBuiltPrompt).toContain('"sourceKind":"custom-image"');
    expect(sourceBuiltPrompt).toContain('"resolvedCommit":"abc1234deadbeef"');
    expect(sourceBuiltPrompt).toContain('"digest":"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"');
    expect(sourceBuiltPrompt).toContain("ambient_mcp_standard_import_install");

    const candidateRefPrompt = mcpLivePiSmokePrompt({
      install: {
        kind: "standard-mcp-import",
        candidateRef: "fixture:scrapling",
        serverId: mcpAutowirePhase0Fixtures.scrapling.id,
        label: mcpAutowirePhase0Fixtures.scrapling.displayName,
      },
      toolQuery: "scraping",
      toolName: "get",
      toolArguments: { url: "https://example.com" },
      successText: "MCP_LIVE_SMOKE_CANDIDATE_REF_DONE",
    });

    expect(candidateRefPrompt).toContain('{"candidateRef":"fixture:scrapling"}');
    expect(candidateRefPrompt).not.toContain('"evidence":[');
    expect(candidateRefPrompt).not.toContain('"recommendedLane":"standard-mcp"');
  });
});

function sourceBuiltCustomImageCandidate(): McpAutowireCandidate {
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
