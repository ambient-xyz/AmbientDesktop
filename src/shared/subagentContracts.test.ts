import { describe, expect, it } from "vitest";
import { resolveAmbientModelRuntimeProfile } from "./ambientModels";
import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  resolveAmbientFeatureFlags,
} from "./featureFlags";
import { DEFAULT_SUBAGENT_ROLE_PROFILES, getDefaultSubagentRoleProfile } from "./subagentRoles";
import {
  buildSubagentCanonicalPath,
  createSubagentRuntimeEvent,
  subagentResultCanBeSynthesized,
  validateSubagentResultArtifactForSynthesis,
} from "./subagentProtocol";
import { resolveSubagentToolScope } from "./subagentToolScope";
import {
  SYMPHONY_CHILD_DECISION_OPTIONS,
  SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
  SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
  SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
  SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
  SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
  SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION,
  assertValidChildDecisionRequest,
  assertValidMutationWorkspaceLease,
  assertValidSymphonyChildLaunchContractBundle,
  assertValidWebCapabilityProfile,
} from "./symphonyFineGrainedContracts";

describe("sub-agent shared contracts", () => {
  it("builds stable canonical child paths", () => {
    expect(buildSubagentCanonicalPath({ parentPath: "root/0:explorer", roleId: "code reviewer", spawnIndex: 3 })).toBe("root/0:explorer/3:code-reviewer");
  });

  it("allows parent synthesis only from completed or explicit partial child results", () => {
    expect(subagentResultCanBeSynthesized({ status: "completed" })).toBe(true);
    expect(subagentResultCanBeSynthesized({ status: "failed" })).toBe(false);
    expect(subagentResultCanBeSynthesized({ status: "aborted_partial", partial: true })).toBe(true);
  });

  it("validates child result artifacts before parent synthesis", () => {
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "completed",
      partial: false,
      summary: "Done",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      partial: false,
      status: "completed",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "failed",
      partial: false,
      summary: "Failed",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: false,
      status: "failed",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "aborted_partial",
      partial: true,
      summary: "Partial but useful",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: true,
      synthesisAllowed: true,
      partial: true,
      status: "aborted_partial",
    });
    expect(validateSubagentResultArtifactForSynthesis({
      schemaVersion: "ambient-subagent-result-artifact-v1",
      runId: "child-run",
      status: "completed",
      partial: false,
      summary: "",
      childThreadId: "child-thread",
    })).toMatchObject({
      valid: false,
      synthesisAllowed: false,
      reason: "Result artifact summary is empty.",
    });
  });

  it("builds runtime events with child-run attribution", () => {
    expect(createSubagentRuntimeEvent({
      run: {
        id: "child-run",
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        childThreadId: "child-thread",
        canonicalTaskPath: "root/0:explorer",
      },
      source: "wait_agent",
      event: {
        type: "assistant_delta",
        textPreview: "Child streamed a useful update.",
        tokenCount: 12,
        createdAt: "2026-06-05T00:00:00.000Z",
      },
    })).toEqual({
      schemaVersion: "ambient-subagent-runtime-event-v1",
      type: "assistant_delta",
      source: "wait_agent",
      runId: "child-run",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      childThreadId: "child-thread",
      canonicalTaskPath: "root/0:explorer",
      createdAt: "2026-06-05T00:00:00.000Z",
      textPreview: "Child streamed a useful update.",
      tokenCount: 12,
    });
  });

  it("validates Symphony fine-grained launch, web, lease, and decision contracts", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const bundle = symphonyLaunchBundle(featureFlagSnapshot);

    expect(assertValidSymphonyChildLaunchContractBundle(bundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toEqual(bundle);

    expect(assertValidWebCapabilityProfile({
      schemaVersion: SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION,
      providerId: "brave-search",
      supportedKinds: ["search"],
      probeStatus: "passed",
      probeEvidenceRefs: ["test-results/web/brave.json"],
      userPreferenceRank: { search: 1 },
    })).toMatchObject({
      providerId: "brave-search",
      supportedKinds: ["search"],
      probeStatus: "passed",
    });

    expect(assertValidMutationWorkspaceLease({
      schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
      leaseId: "lease-1",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      childRunId: "child-run",
      kind: "scratch_overlay",
      rootPath: "/tmp/symphony/lease-1",
      sourceRoots: ["/workspace"],
      readOnlyBaseRoots: ["/workspace"],
      declaredWritableRoots: ["/workspace/out"],
      writableRoots: ["/tmp/symphony/lease-1/out"],
      status: "active",
      acquiredAt: "2026-06-16T00:00:00.000Z",
      lastHeartbeatAt: "2026-06-16T00:00:01.000Z",
    })).toMatchObject({
      leaseId: "lease-1",
      kind: "scratch_overlay",
      writableRoots: ["/tmp/symphony/lease-1/out"],
    });

    expect(assertValidChildDecisionRequest({
      schemaVersion: SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
      requestId: "decision-1",
      barrierId: "barrier-1",
      parentRunId: "parent-run",
      childRunIds: ["child-run"],
      reason: "tool_scope_denied",
      options: ["retry_child", "accept_partial", "exit_symphony_mode"],
      recommendedOption: "retry_child",
      optionActions: [
        { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
        { option: "accept_partial", toolAction: "resolve_barrier", decision: "continue_with_partial", requiresUserDecision: true, requiresPartialSummary: true },
        { option: "exit_symphony_mode", toolAction: "resolve_barrier", decision: "fail_parent" },
      ],
      evidenceRefs: ["artifact://barrier-1"],
    })).toMatchObject({
      recommendedOption: "retry_child",
      options: ["retry_child", "accept_partial", "exit_symphony_mode"],
      optionActions: [
        { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
        { option: "accept_partial", toolAction: "resolve_barrier", decision: "continue_with_partial", requiresUserDecision: true, requiresPartialSummary: true },
        { option: "exit_symphony_mode", toolAction: "resolve_barrier", decision: "fail_parent" },
      ],
    });
  });

  it("rejects mutation workspace leases with unsafe path boundaries", () => {
    const lease = {
      schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
      leaseId: "lease-1",
      parentThreadId: "parent-thread",
      childThreadId: "child-thread",
      childRunId: "child-run",
      kind: "scratch_overlay",
      rootPath: "/tmp/symphony/lease-1",
      sourceRoots: ["/workspace"],
      readOnlyBaseRoots: ["/workspace"],
      declaredWritableRoots: ["/workspace/out"],
      writableRoots: ["/tmp/symphony/lease-1/out"],
      status: "active",
      acquiredAt: "2026-06-16T00:00:00.000Z",
      lastHeartbeatAt: "2026-06-16T00:00:01.000Z",
    };

    expect(() => assertValidMutationWorkspaceLease({
      ...lease,
      rootPath: "../lease-1",
    })).toThrow("mutationWorkspaceLease.rootPath must be an absolute path.");

    expect(() => assertValidMutationWorkspaceLease({
      ...lease,
      sourceRoots: ["/workspace/../other"],
    })).toThrow("mutationWorkspaceLease.sourceRoots[0] must not contain . or .. path segments.");

    expect(() => assertValidMutationWorkspaceLease({
      ...lease,
      writableRoots: ["/tmp/symphony/outside"],
    })).toThrow("mutationWorkspaceLease.writableRoots must stay inside mutationWorkspaceLease.rootPath; /tmp/symphony/outside is outside /tmp/symphony/lease-1.");
  });

  it("keeps Symphony fine-grained contracts unreachable while ambient.subagents is off", () => {
    const disabled = resolveAmbientFeatureFlags({
      settings: { subagents: false },
      generatedAt: "2026-06-16T00:00:00.000Z",
    });
    const bundle = symphonyLaunchBundle(disabled);

    expect(() => assertValidSymphonyChildLaunchContractBundle(bundle, {
      featureFlagSnapshot: disabled,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("ambient.subagents is off; Symphony fine-grained contracts are unavailable.");
  });

  it("rejects malformed Symphony policy feature-flag snapshots before launch", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const malformedBundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      modePolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).modePolicySnapshot,
        featureFlagSnapshot: {
          schemaVersion: "ambient-feature-flags-v1",
          generatedAt: "2026-06-16T00:00:00.000Z",
          flags: {},
        },
      },
    };

    expect(() => assertValidSymphonyChildLaunchContractBundle(malformedBundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.modePolicySnapshot.featureFlagSnapshot.flags.ambient.subagents must be an object.");
  });

  it("requires Symphony mode policy to allow child spawning before launch", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const bundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      modePolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).modePolicySnapshot,
        parentAllowedActions: ["detect_pattern", "plan", "inspect_child_evidence", "synthesize"],
      },
    };

    expect(() => assertValidSymphonyChildLaunchContractBundle(bundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.modePolicySnapshot.parentAllowedActions must include spawn_child for child launch.");
  });

  it("rejects Symphony no-mutation launch policies that allow mutating tool categories", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const bundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      childLaunchPolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).childLaunchPolicySnapshot,
        allowedToolIds: ["workspace.read", "workspace.write"],
        deniedToolIds: ["browser.interactive"],
        mutation: "none",
      },
    };

    expect(() => assertValidSymphonyChildLaunchContractBundle(bundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.childLaunchPolicySnapshot.allowedToolIds must not include mutating tool policy workspace.write when mutation is none.");
  });

  it("rejects wildcard Symphony tool policy ids and relative roots", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const wildcardBundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      childLaunchPolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).childLaunchPolicySnapshot,
        deniedToolIds: ["connector_app:gmail.*"],
      },
    };
    expect(() => assertValidSymphonyChildLaunchContractBundle(wildcardBundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.childLaunchPolicySnapshot.deniedToolIds[0] must not use wildcard grants or denials.");

    const relativeRootBundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      childLaunchPolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).childLaunchPolicySnapshot,
        inheritedAuthorityRoots: ["src"],
      },
    };
    expect(() => assertValidSymphonyChildLaunchContractBundle(relativeRootBundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.childLaunchPolicySnapshot.inheritedAuthorityRoots[0] must be an absolute path.");

    const traversalReadRootBundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      childLaunchPolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).childLaunchPolicySnapshot,
        inheritedAuthorityRoots: ["/workspace/slice/.."],
      },
    };
    expect(() => assertValidSymphonyChildLaunchContractBundle(traversalReadRootBundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.childLaunchPolicySnapshot.inheritedAuthorityRoots[0] must not contain . or .. path segments.");

    const traversalWriteRootBundle = {
      ...symphonyLaunchBundle(featureFlagSnapshot),
      childLaunchPolicySnapshot: {
        ...symphonyLaunchBundle(featureFlagSnapshot).childLaunchPolicySnapshot,
        allowedToolIds: ["workspace.write"],
        deniedToolIds: [],
        writableRoots: ["/workspace/slice/.."],
        mutation: "lease_required",
      },
    };
    expect(() => assertValidSymphonyChildLaunchContractBundle(traversalWriteRootBundle, {
      featureFlagSnapshot,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
    })).toThrow("symphony.childLaunchPolicySnapshot.writableRoots[0] must not contain . or .. path segments.");
  });

  it("rejects child decision requests with recommendations outside explicit options", () => {
    expect(SYMPHONY_CHILD_DECISION_OPTIONS).not.toContain("parent_override");
    expect(() => assertValidChildDecisionRequest({
      schemaVersion: SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
      requestId: "decision-1",
      barrierId: "barrier-1",
      parentRunId: "parent-run",
      childRunIds: ["child-run"],
      reason: "failed",
      options: ["retry_child", "accept_partial"],
      recommendedOption: "exit_symphony_mode",
      optionActions: [
        { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
        { option: "accept_partial", toolAction: "resolve_barrier", decision: "continue_with_partial", requiresUserDecision: true, requiresPartialSummary: true },
      ],
      evidenceRefs: [],
    })).toThrow("childDecisionRequest.recommendedOption must be included in options.");
  });

  it("rejects child decision requests without executable actions for every option", () => {
    expect(() => assertValidChildDecisionRequest({
      schemaVersion: SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
      requestId: "decision-1",
      barrierId: "barrier-1",
      parentRunId: "parent-run",
      childRunIds: ["child-run"],
      reason: "failed",
      options: ["retry_child", "accept_partial"],
      recommendedOption: "retry_child",
      optionActions: [
        { option: "retry_child", toolAction: "resolve_barrier", decision: "retry_child" },
      ],
      evidenceRefs: [],
    })).toThrow("childDecisionRequest.optionActions must include one executable action for each option.");
  });

  it("resolves role, model, task, and workspace policy into visible tool scope", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role,
      model,
      task: { requestedCategories: ["workspace.read", "browser.read", "workspace.write", "subagent.spawn"] },
      workspacePolicy: {
        hardDeniedCategories: ["browser.read"],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["workspace.read"]);
    expect(resolution.piVisibleCategories).toEqual(["workspace.read"]);
    expect(resolution.deniedCategories).toEqual(expect.arrayContaining([
      { id: "browser.read", reason: "Denied by workspace or parent hard policy." },
      { id: "workspace.write", reason: "Denied by the selected sub-agent role." },
      { id: "subagent.spawn", reason: "Denied by the selected sub-agent role." },
    ]));
  });

  it("keeps default role tool categories aligned with the stable tool registry", () => {
    const model = resolveAmbientModelRuntimeProfile();

    for (const role of DEFAULT_SUBAGENT_ROLE_PROFILES) {
      expect(() => resolveSubagentToolScope({
        role,
        model,
        workspacePolicy: {
          hardDeniedCategories: [],
          approvalMode: "interactive",
          worktreeIsolated: true,
          allowNestedFanout: true,
        },
      })).not.toThrow();
    }
  });

  it("narrows default child tool scope by explicit file-read task intent", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role,
      model,
      task: {
        childAuthority: {
          taskIntent: "file_read",
          readRoots: ["/Users/travis/Downloads/report.pdf"],
          mutation: "deny",
          network: "deny",
        },
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.piVisibleCategories).toEqual(["workspace.read", "artifact.read", "long-context.read"]);
    expect(resolution.deniedCategories).toEqual(expect.arrayContaining([
      {
        id: "connector.read",
        reason: "Denied by child task intent file_read; allowed categories: workspace.read, artifact.read, long-context.read.",
      },
    ]));
  });

  it("keeps browser read explicitly requestable but out of explorer defaults", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: false,
      allowNestedFanout: false,
    };

    expect(resolveSubagentToolScope({
      role,
      model,
      workspacePolicy,
    }).piVisibleCategories).toEqual([
      "workspace.read",
      "artifact.read",
      "long-context.read",
      "connector.read",
    ]);

    expect(resolveSubagentToolScope({
      role,
      model,
      task: { requestedCategories: ["browser.read"] },
      workspacePolicy,
    }).piVisibleCategories).toEqual(["browser.read"]);
  });

  it("requires explicit child browser authority for explorer interactive browser tools", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: false,
      allowNestedFanout: false,
    };

    const denied = resolveSubagentToolScope({
      role,
      model,
      task: { requestedCategories: ["browser.interactive"] },
      workspacePolicy,
    });

    expect(denied.loadedCategories).toEqual([]);
    expect(denied.deniedCategories).toEqual([
      {
        id: "browser.interactive",
        reason: "Interactive browser tools require explicit child browser network authority.",
      },
    ]);

    const allowed = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedCategories: ["browser.interactive"],
        childAuthority: {
          taskIntent: "analysis",
          network: "ask_parent",
          mutation: "deny",
        },
      },
      workspacePolicy,
    });

    expect(allowed.loadedCategories).toEqual(["browser.interactive"]);
    expect(allowed.piVisibleCategories).toEqual(["browser.interactive"]);
    expect(allowed.deniedCategories).toEqual([]);
  });

  it("denies toolful scopes for models without tool support", () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile("custom/model");
    const resolution = resolveSubagentToolScope({
      role,
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["artifact.read"]);
    expect(resolution.deniedCategories.map((item) => item.reason)).toContain("Selected model profile does not support tool use.");
  });

  it("keeps loaded capabilities separate from Pi-visible callables", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "mcp.direct"],
        deniedToolCategories: [],
        mutationPolicy: "requires_isolated_worktree",
      },
      model,
      task: { requestedCategories: ["mcp.direct"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual(["mcp.direct"]);
    expect(resolution.piVisibleCategories).toEqual([]);
  });

  it("snapshots exact tool grants by source as separate launch-time dimensions", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [
          ...explorer.allowedToolCategories,
          "connector.read",
          "subagent.spawn",
        ],
        deniedToolCategories: [],
        nestedFanout: "role_gated",
      },
      model,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:pi-subagents", categoryId: "workspace.read" },
          { source: "extension_tool", id: "pi-subagents.search", categoryId: "workspace.read" },
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: false },
          { source: "skill", id: "openai-docs" },
        ],
        requestedFanout: true,
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: true,
      },
    });

    expect(resolution.loadedCategories).toEqual(["workspace.read", "connector.read", "subagent.spawn"]);
    expect(resolution.piVisibleCategories).toEqual(["workspace.read"]);
    expect(resolution.loadedTools.map((tool) => `${tool.source}:${tool.id}`)).toEqual([
      "extension_load:npm:pi-subagents",
      "extension_tool:pi-subagents.search",
      "connector_app:gmail.search",
      "skill:openai-docs",
      "fanout:subagent.spawn",
    ]);
    expect(resolution.piVisibleTools.map((tool) => `${tool.source}:${tool.id}`)).toEqual([
      "extension_tool:pi-subagents.search",
    ]);
    expect(resolution.fanoutAvailable).toBe(true);
  });

  it("denies Pi-visible requests for non-callable loaded sources", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: explorer,
      model,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:pi-subagents", categoryId: "workspace.read", piVisible: true },
          { source: "skill", id: "openai-docs", piVisible: true },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.piVisibleTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "extension_load",
        id: "npm:pi-subagents",
        categoryId: "workspace.read",
        reason: "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
      },
      {
        source: "skill",
        id: "openai-docs",
        reason: "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.",
      },
    ]);
  });

  it("denies Pi-visible direct MCP and connector sources until child-safe bridges exist", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "connector.read", "mcp.direct"],
      deniedToolCategories: [],
      mutationPolicy: "requires_isolated_worktree" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: true,
      allowNestedFanout: false,
    };

    const denied = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read" },
          { source: "direct_mcp", id: "filesystem/read_file", categoryId: "mcp.direct", piVisible: true },
        ],
      },
      workspacePolicy,
    });

    expect(denied.loadedTools).toEqual([]);
    expect(denied.piVisibleTools).toEqual([]);
    expect(denied.deniedTools).toEqual([
      expect.objectContaining({
        source: "connector_app",
        id: "gmail.search",
        categoryId: "connector.read",
        reason: expect.stringContaining("child-safe bridge"),
      }),
      expect.objectContaining({
        source: "direct_mcp",
        id: "filesystem/read_file",
        categoryId: "mcp.direct",
        reason: expect.stringContaining("child-safe bridge"),
      }),
    ]);

    const nonVisible = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read", piVisible: false },
          { source: "direct_mcp", id: "filesystem/read_file", categoryId: "mcp.direct" },
        ],
      },
      workspacePolicy,
    });

    expect(nonVisible.loadedTools.map((tool) => `${tool.source}:${tool.id}:${tool.piVisible}`)).toEqual([
      "connector_app:gmail.search:false",
      "direct_mcp:filesystem/read_file:false",
    ]);
    expect(nonVisible.piVisibleTools).toEqual([]);
    expect(nonVisible.deniedTools).toEqual([]);
  });

  it("models callable workflow child scope separately and fails closed without bridge policy", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
      deniedToolCategories: [],
      nestedFanout: "role_gated" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: false,
      allowNestedFanout: true,
    };

    const deniedVisible = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(deniedVisible.loadedTools).toEqual([]);
    expect(deniedVisible.piVisibleTools).toEqual([]);
    expect(deniedVisible.deniedCategories).toEqual([
      {
        id: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);
    expect(deniedVisible.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_symphony_map_reduce",
        categoryId: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);

    const nonVisibleWithoutBridge = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_recorded_date_night_v2",
            categoryId: "workflow.call",
            piVisible: false,
          },
        ],
      },
      workspacePolicy,
    });

    expect(nonVisibleWithoutBridge.loadedTools).toEqual([]);
    expect(nonVisibleWithoutBridge.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_recorded_date_night_v2",
        categoryId: "workflow.call",
        reason: expect.stringContaining("child-safe workflow bridge"),
      },
    ]);
  });

  it("allows exact callable workflow child tools only through explicit bridge policy and remaining fanout", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const role = {
      ...explorer,
      allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
      deniedToolCategories: [],
      nestedFanout: "role_gated" as const,
    };
    const workspacePolicy = {
      hardDeniedCategories: [],
      approvalMode: "interactive" as const,
      worktreeIsolated: true,
      allowNestedFanout: true,
      callableWorkflowBridge: {
        allowCallableWorkflowTools: true,
        nestedFanoutLimit: 2,
        remainingFanout: 1,
        allowedToolNames: ["ambient_workflow_symphony_map_reduce"],
      },
    };

    const allowed = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_symphony_map_reduce",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(allowed.loadedCategories).toEqual(["workflow.call"]);
    expect(allowed.piVisibleCategories).toEqual(["workflow.call"]);
    expect(allowed.piVisibleTools).toEqual([
      expect.objectContaining({
        source: "callable_workflow",
        id: "ambient_workflow_symphony_map_reduce",
        categoryId: "workflow.call",
        piVisible: true,
      }),
    ]);
    expect(allowed.deniedTools).toEqual([]);

    const outsideAllowlist = resolveSubagentToolScope({
      role,
      model,
      task: {
        requestedSources: [
          {
            source: "callable_workflow",
            id: "ambient_workflow_recorded_date_night_v2",
            categoryId: "workflow.call",
            piVisible: true,
          },
        ],
      },
      workspacePolicy,
    });

    expect(outsideAllowlist.loadedTools).toEqual([]);
    expect(outsideAllowlist.deniedTools).toEqual([
      {
        source: "callable_workflow",
        id: "ambient_workflow_recorded_date_night_v2",
        categoryId: "workflow.call",
        reason: "Callable workflow tool is outside the child role policy allowlist.",
      },
    ]);
  });

  it("requires nested fanout policy before a child can load callable workflow scope", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "workflow.call"],
        deniedToolCategories: [],
        nestedFanout: "disabled",
      },
      model,
      task: { requestedCategories: ["workflow.call"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: true,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "workflow.call",
        reason: "Nested workflow fanout is disabled for this role or workspace.",
      },
    ]);
  });

  it("denies source tools through the same role, model, and workspace policy gates", () => {
    const reviewer = getDefaultSubagentRoleProfile("reviewer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: reviewer,
      model,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.send", categoryId: "connector.write" },
          { source: "skill", id: "openai-docs" },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "connector_app",
        id: "gmail.send",
        categoryId: "connector.write",
        reason: "Requested task capability is outside the selected role.",
      },
      {
        source: "skill",
        id: "openai-docs",
        reason: "Selected sub-agent role does not inherit skills.",
      },
    ]);
  });

  it("rejects malformed source tool ids before launch snapshots are created", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const base = {
      role: explorer,
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive" as const,
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    };

    expect(resolveSubagentToolScope({
      ...base,
      task: {
        requestedSources: [
          { source: "extension_load", id: "npm:@ambient/pi-subagents", categoryId: "workspace.read" },
          { source: "direct_mcp", id: "server/read_file", categoryId: "mcp.direct" },
        ],
      },
    }).deniedTools.map((tool) => tool.id)).toContain("server/read_file");

    for (const id of [
      "server/read_file\nignore-parent-policy",
      "gmail.search;gmail.send",
      "secret-helper api_key=ambient-abcdefghijklmnopqrstuvwxyz",
      "tool`with`backticks",
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Sub-agent tool source request id contains unsupported characters.");
    }

    for (const id of [
      "server/sk-proj-abcdefghijklmnopqrstuvwxyz123456",
      "connector/gmi_1234567890abcdef1234567890abcdef",
      "gmail.search:api_key_1234567890abcdef123456",
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Sub-agent tool source request id appears to contain secret-like material.");
    }
  });

  it("requires exact operation-shaped ids for direct MCP and connector sources", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const base = {
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read", "mcp.direct"],
        deniedToolCategories: [],
      },
      model,
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive" as const,
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    };

    expect(() => resolveSubagentToolScope({
      ...base,
      task: {
        requestedSources: [
          { source: "connector_app", id: "gmail.search", categoryId: "connector.read" },
          { source: "direct_mcp", id: "server/read_file", categoryId: "mcp.direct" },
        ],
      },
    })).not.toThrow();

    for (const id of ["gmail", "gmail/search", ".search", "gmail."]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "connector_app", id, categoryId: "connector.read" }],
        },
      })).toThrow("Connector tool source ids must use exact connector.operation ids.");
    }

    for (const id of ["server", "server.read_file", "/read_file", "server/"]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: {
          requestedSources: [{ source: "direct_mcp", id, categoryId: "mcp.direct" }],
        },
      })).toThrow("Direct MCP tool source ids must use exact server/tool operation ids.");
    }

    for (const request of [
      { source: "connector_app" as const, id: "gmail.*", categoryId: "connector.read" as const },
      { source: "direct_mcp" as const, id: "server/*", categoryId: "mcp.direct" as const },
    ]) {
      expect(() => resolveSubagentToolScope({
        ...base,
        task: { requestedSources: [request] },
      })).toThrow("Sub-agent tool source request ids must not use wildcard grants.");
    }
  });

  it("applies hard policy to categorized skill context requests", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: explorer,
      model,
      task: {
        requestedSources: [
          { source: "skill", id: "secret-helper", categoryId: "secrets.read" },
        ],
      },
      workspacePolicy: {
        hardDeniedCategories: ["secrets.read"],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedTools).toEqual([]);
    expect(resolution.deniedTools).toEqual([
      {
        source: "skill",
        id: "secret-helper",
        categoryId: "secrets.read",
        reason: "Denied by workspace or parent hard policy.",
      },
    ]);
  });

  it("denies approval-requiring child tools during non-interactive launches", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "connector.read"],
        deniedToolCategories: [],
      },
      model,
      task: { requestedCategories: ["connector.read"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "connector.read",
        reason: "Capability requires interactive approval, but this launch is non-interactive.",
      },
    ]);
  });

  it("allows non-interactive workspace writes only for explicit isolated-worktree child authority", () => {
    const worker = getDefaultSubagentRoleProfile("worker");
    const model = resolveAmbientModelRuntimeProfile();
    const allowed = resolveSubagentToolScope({
      role: worker,
      model,
      task: {
        requestedCategories: ["workspace.write"],
        childAuthority: {
          taskIntent: "mutation",
          mutation: "allow_isolated_worktree",
          writeRoots: ["."],
        },
      },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(allowed.loadedCategories).toEqual(["workspace.write"]);
    expect(allowed.piVisibleCategories).toEqual(["workspace.write"]);
    expect(allowed.deniedCategories).toEqual([]);

    const denied = resolveSubagentToolScope({
      role: worker,
      model,
      task: { requestedCategories: ["workspace.write"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "non_interactive",
        worktreeIsolated: true,
        allowNestedFanout: false,
      },
    });

    expect(denied.loadedCategories).toEqual([]);
    expect(denied.deniedCategories).toEqual([
      {
        id: "workspace.write",
        reason: "Capability requires interactive approval, but this launch is non-interactive.",
      },
    ]);
  });

  it("denies nested fanout unless both role and workspace allow it", () => {
    const explorer = getDefaultSubagentRoleProfile("explorer");
    const model = resolveAmbientModelRuntimeProfile();
    const resolution = resolveSubagentToolScope({
      role: {
        ...explorer,
        allowedToolCategories: [...explorer.allowedToolCategories, "subagent.spawn"],
        deniedToolCategories: [],
        nestedFanout: "role_gated",
      },
      model,
      task: { requestedCategories: ["subagent.spawn"] },
      workspacePolicy: {
        hardDeniedCategories: [],
        approvalMode: "interactive",
        worktreeIsolated: false,
        allowNestedFanout: false,
      },
    });

    expect(resolution.loadedCategories).toEqual([]);
    expect(resolution.deniedCategories).toEqual([
      {
        id: "subagent.spawn",
        reason: "Nested sub-agent fanout is disabled for this role or workspace.",
      },
    ]);
  });
});

function enabledSubagentFeatureFlags() {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt: "2026-06-16T00:00:00.000Z",
  });
}

function symphonyLaunchBundle(featureFlagSnapshot: ReturnType<typeof enabledSubagentFeatureFlags>) {
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
    patternSelection: {
      schemaVersion: SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
      selectionId: "selection-1",
      parentRunId: "parent-run",
      pattern: "imitate_and_verify",
      confidence: "high",
      childRolePlan: [
        { role: "drafter", count: 1, purpose: "Draft the artifact." },
        { role: "verifier", count: 1, purpose: "Verify the draft against criteria." },
      ],
      requiredArtifacts: ["draft", "verification"],
      reducerContract: "Synthesize only from child evidence.",
      failurePolicy: "require_all",
      tokenAndTimeBudget: { maxChildren: 2, maxMinutes: 10 },
    },
    modePolicySnapshot: {
      schemaVersion: SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
      snapshotId: "mode-policy-1",
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      enabled: true,
      parentAllowedActions: [
        "detect_pattern",
        "plan",
        "spawn_child",
        "inspect_run_graph",
        "inspect_child_evidence",
        "request_decision",
        "retry_child",
        "synthesize",
      ],
      observationPolicy: "full_runtime_observability",
      directExecutionPolicy: "deny_substantive_tools",
      featureFlagSnapshot,
    },
    childLaunchPolicySnapshot: {
      schemaVersion: SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
      policyId: "child-policy-1",
      childRunId: "planned-child-run",
      role: "verifier",
      pattern: "imitate_and_verify",
      inheritedAuthorityRoots: ["/workspace"],
      writableRoots: [],
      allowedToolIds: ["workspace.read", "test.run"],
      deniedToolIds: ["workspace.write", "browser.interactive"],
      webProviderOrder: {
        search: ["brave-search"],
        staticFetchExtract: ["scrapling-static"],
        dynamicHeadlessBrowser: ["scrapling-dynamic"],
        interactiveBrowser: {
          providers: ["ambient-browser"],
          fallback: "approval_required",
        },
      },
      mutation: "none",
    },
  };
}
