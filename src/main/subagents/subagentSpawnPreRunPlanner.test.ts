import { describe, expect, it } from "vitest";
import {
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  resolveAmbientFeatureFlags,
} from "../../shared/featureFlags";
import {
  SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
  SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
  SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
  SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
} from "../../shared/symphonyFineGrainedContracts";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { createDefaultAgentRoleRegistry } from "./subagentAgentFacade";
import { createDefaultModelRuntimeRegistry } from "./subagentModelProviderFacade";
import {
  resolveSubagentSpawnPreRunPlan,
  SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION,
} from "./subagentSpawnPreRunPlanner";

describe("subagentSpawnPreRunPlanner", () => {
  it("resolves default spawn plan fields and stable generated idempotency", () => {
    const input = {
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: { task: "Map the sub-agent launch path." },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [
        run({ id: "existing-1", canonicalTaskPath: "root/0:explorer" }),
        run({ id: "existing-2", canonicalTaskPath: "root/1:reviewer" }),
      ],
    };

    const plan = resolveSubagentSpawnPreRunPlan(input);
    const replay = resolveSubagentSpawnPreRunPlan(input);

    expect(SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION).toBe("ambient-subagent-spawn-pre-run-planner-v1");
    expect(plan).toMatchObject({
      task: "Map the sub-agent launch path.",
      requestedRoleId: "explorer",
      roleId: "explorer",
      dependencyMode: "optional_background",
      forkMode: "recent_turns",
      promptMode: "append",
      spawnIndex: 2,
      canonicalTaskPath: "root/2:explorer",
      retentionPolicy: "keep_until_parent_pruned",
      title: "Explorer: Map the sub-agent launch path.",
      scheduledSpawnFields: [],
      modelScope: {
        blockingReasons: [],
      },
    });
    expect(plan.idempotencyKey).toMatch(/^subagent:spawn:[a-f0-9]{24}$/);
    expect(plan.idempotencyKey).toBe(replay.idempotencyKey);
    expect(plan.payloadFingerprint).toBe(replay.payloadFingerprint);
    expect(plan.requestedToolScope).toEqual({});
  });

  it("preserves explicit launch choices, tool scope, idempotency, and scheduled-spawn fields", () => {
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Review the pending implementation.",
        roleId: "reviewer",
        modelId: "glm-5.1",
        dependencyMode: "required",
        forkMode: "no_history",
        promptMode: "replace",
        retentionPolicy: "pinned",
        title: "Review launch",
        idempotencyKey: "custom:spawn",
        effectiveRole: {
          patternRole: "verifier",
          overlayLabels: ["Acceptance checks", "No mutation"],
          outputContract: "Return pass/fail findings with evidence.",
        },
        patternGraphBinding: {
          workflowTaskId: "workflow-task-1",
          roleNodeId: "verifier",
          label: "Verification child",
          approvalState: "pending",
          blockingParent: true,
        },
        schedule: { cron: "* * * * *" },
        toolScope: {
          requestedCategories: ["workspace.read"],
          approvalMode: "non_interactive",
        },
      },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan).toMatchObject({
      requestedRoleId: "reviewer",
      roleId: "reviewer",
      requestedForkMode: "no_history",
      dependencyMode: "required",
      forkMode: "no_history",
      promptMode: "replace",
      canonicalTaskPath: "root/0:reviewer",
      retentionPolicy: "pinned",
      title: "Review launch",
      idempotencyKey: "custom:spawn",
      effectiveRoleSnapshot: {
        schemaVersion: "ambient-subagent-effective-role-v1",
        baseRole: "reviewer",
        patternRole: "verifier",
        displayLabel: "Reviewer + Verifier",
        roleOverlayIds: ["verifier.acceptance-checks", "verifier.no-mutation"],
        overlays: [
          expect.objectContaining({ id: "verifier.acceptance-checks", label: "Acceptance checks", narrowsAuthority: true, widensAuthority: false }),
          expect.objectContaining({ id: "verifier.no-mutation", label: "No mutation", narrowsAuthority: true, widensAuthority: false }),
        ],
        nonWidening: true,
        outputContract: "Return pass/fail findings with evidence.",
      },
      patternGraphBinding: {
        workflowTaskId: "workflow-task-1",
        roleNodeId: "verifier",
        label: "Verification child",
        approvalState: "pending",
        blockingParent: true,
      },
      scheduledSpawnFields: ["schedule"],
      requestedToolScope: {
        requestedCategories: ["workspace.read"],
        approvalMode: "non_interactive",
      },
    });
  });

  it("fails closed when Symphony mode is requested without stored launch contracts", () => {
    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Run an imitate-and-verify Symphony flow.",
        symphonyMode: true,
      },
      featureFlagSnapshot: enabledSubagentFeatureFlags(),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("Symphony-mode child spawn requires a stored symphonyContractId.");
  });

  it("validates and preserves Symphony launch contracts before child run creation", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Verify the draft child output before synthesis.",
        roleId: "reviewer",
        dependencyMode: "required",
        symphonyMode: true,
        symphonyContractId: "contract-1",
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot)),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan.symphonyContracts).toMatchObject({
      patternSelection: {
        pattern: "imitate_and_verify",
        parentRunId: "parent-run",
      },
      modePolicySnapshot: {
        parentThreadId: "parent-thread",
        directExecutionPolicy: "deny_substantive_tools",
      },
      childLaunchPolicySnapshot: {
        policyId: "child-policy-1",
        pattern: "imitate_and_verify",
        mutation: "none",
      },
    });
    expect(plan.symphonyContracts?.modePolicySnapshot.parentAllowedActions).toContain("retry_child");
  });

  it("preserves lease-required Symphony contracts so mutation leases can be acquired after run creation", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();

    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Mutate in an isolated child workspace.",
        roleId: "worker",
        dependencyMode: "required",
        symphonyMode: true,
        symphonyContractId: "contract-1",
        toolScope: {
          requestedCategories: ["workspace.write"],
          childAuthority: {
            taskIntent: "mutation",
            writeRoots: ["/workspace/out"],
            mutation: "allow_isolated_worktree",
          },
        },
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot, {
        role: "worker",
        allowedToolIds: ["workspace.write"],
        deniedToolIds: ["browser.interactive"],
        writableRoots: ["/workspace"],
        mutation: "lease_required",
      })),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan.symphonyContracts?.childLaunchPolicySnapshot).toMatchObject({
      role: "worker",
      mutation: "lease_required",
      writableRoots: ["/workspace"],
    });
  });

  it("rejects Symphony launch contracts while ambient.subagents is disabled", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({
      settings: { subagents: false },
      generatedAt: "2026-06-16T00:00:00.000Z",
    });

    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Run a gated Symphony child.",
        symphonyMode: true,
        symphonyContractId: "contract-1",
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot)),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("ambient.subagents is off; Symphony fine-grained contracts are unavailable.");
  });

  it("rejects Symphony launch contracts that disagree with the resolved child role", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();

    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Reject a mismatched Symphony child role.",
        roleId: "reviewer",
        symphonyMode: true,
        symphonyContractId: "contract-1",
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot, { role: "verifier" })),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("symphony.childLaunchPolicySnapshot.role must match resolved child role reviewer.");
  });

  it("binds Symphony launch contracts to exact tool-source category requests", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();

    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Reject an exact connector tool outside the stored child policy.",
        roleId: "reviewer",
        symphonyMode: true,
        symphonyContractId: "contract-1",
        toolScope: {
          connectorTools: [
            { id: "gmail.search", categoryId: "connector.read" },
          ],
        },
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot)),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("symphony.childLaunchPolicySnapshot.allowedToolIds must include requested exact tool connector_app:gmail.search or category connector.read.");
  });

  it("allows Symphony contracts to grant an exact source without broad category authority", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Allow only one exact connector method.",
        roleId: "reviewer",
        symphonyMode: true,
        symphonyContractId: "contract-1",
        toolScope: {
          connectorTools: [
            { id: "gmail.search", categoryId: "connector.read" },
          ],
        },
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot, { allowedToolIds: ["connector_app:gmail.search"] })),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan.symphonyContracts?.childLaunchPolicySnapshot.allowedToolIds).toEqual(["connector_app:gmail.search"]);
  });

  it("does not treat bare exact tool ids as source wildcards in Symphony contracts", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();

    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Reject a source-specific connector tool when only a bare operation id is allowed.",
        roleId: "reviewer",
        symphonyMode: true,
        symphonyContractId: "contract-1",
        toolScope: {
          connectorTools: [
            { id: "gmail.search", categoryId: "connector.read" },
          ],
        },
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot, { allowedToolIds: ["gmail.search"] })),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("symphony.childLaunchPolicySnapshot.allowedToolIds must include requested exact tool connector_app:gmail.search or category connector.read.");
  });

  it("rejects exact mutating source grants when Symphony policy mutation is none", () => {
    const featureFlagSnapshot = enabledSubagentFeatureFlags();

    expect(() => resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Reject exact built-in edit authority under a no-mutation policy.",
        roleId: "worker",
        symphonyMode: true,
        symphonyContractId: "contract-1",
        toolScope: {
          builtInTools: [
            { id: "edit", categoryId: "workspace.write" },
          ],
        },
      },
      featureFlagSnapshot,
      resolveSymphonyLaunchContract: resolveStoredSymphonyContract(symphonyLaunchBundle(featureFlagSnapshot, {
        role: "worker",
        allowedToolIds: ["built_in:edit"],
        deniedToolIds: ["browser.interactive"],
      })),
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    })).toThrow("symphony.childLaunchPolicySnapshot.allowedToolIds must not include exact mutating tool built_in:edit when mutation is none.");
  });

  it("plans explicit browser-interactive child authority without widening explorer defaults", () => {
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Use browser search only if the parent approves child browser network access.",
        roleId: "explorer",
        dependencyMode: "required",
        forkMode: "recent_turns",
        promptMode: "fresh",
        toolScope: {
          requestedCategories: ["browser.interactive"],
          childAuthority: {
            taskIntent: "analysis",
            network: "ask_parent",
            mutation: "deny",
          },
        },
        idempotencyKey: "spawn:browser-approval-roundtrip",
      },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan.roleId).toBe("explorer");
    expect(plan.requestedToolScope).toEqual({
      requestedCategories: ["browser.interactive"],
      childAuthority: {
        taskIntent: "analysis",
        network: "ask_parent",
        mutation: "deny",
      },
    });
    expect(plan.idempotencyKey).toBe("spawn:browser-approval-roundtrip");
    expect(plan.role.defaultToolCategories).not.toContain("browser.interactive");
  });

  it("rejects malformed effective role launch contracts before run creation", () => {
    const baseInput = {
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    };

    expect(() => resolveSubagentSpawnPreRunPlan({
      ...baseInput,
      request: {
        task: "Draft with an unknown pattern role.",
        roleId: "worker",
        effectiveRole: {
          patternRole: "superuser",
          overlayLabels: ["Unsafe overlay"],
        },
      },
    })).toThrow(/effectiveRole\.patternRole/);

    expect(() => resolveSubagentSpawnPreRunPlan({
      ...baseInput,
      request: {
        task: "Draft without an overlay.",
        roleId: "worker",
        effectiveRole: {
          patternRole: "drafter",
          overlayLabels: [],
        },
      },
    })).toThrow(/effectiveRole\.overlayLabels/);

    expect(() => resolveSubagentSpawnPreRunPlan({
      ...baseInput,
      request: {
        task: "Bind to a graph without a role node.",
        roleId: "worker",
        patternGraphBinding: {
          workflowTaskId: "workflow-task-1",
        },
      },
    })).toThrow(/patternGraphBinding\.roleNodeId/);

    expect(() => resolveSubagentSpawnPreRunPlan({
      ...baseInput,
      request: {
        task: "Bind to a graph with bad approval state.",
        roleId: "worker",
        patternGraphBinding: {
          workflowTaskId: "workflow-task-1",
          roleNodeId: "mapper",
          approvalState: "maybe",
        },
      },
    })).toThrow(/patternGraphBinding\.approvalState/);
  });

  it("surfaces model-scope blockers before child run creation", () => {
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread({ model: "missing-model" }),
      parentRun: { id: "parent-run" },
      request: {
        task: "Explore with an unknown model.",
        modelId: "totally-unknown-model",
      },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: modelResolver(),
      existingRuns: [],
    });

    expect(plan.modelId).toBe("totally-unknown-model");
    expect(plan.modelScope.blockingReasons).toEqual([
      "Model is not registered in this Ambient Desktop build.",
      "Model totally-unknown-model is not selectable for sub-agent delegation.",
      "Model totally-unknown-model does not support required sub-agent streaming.",
      "Model profile does not declare a context window; runtime preflight must prove the child prompt fits before launch.",
      "Model profile does not declare a maximum output budget; runtime preflight must reserve a safe child output allowance.",
      "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
    ]);
  });

  it("uses requested tool scope when recording model tool-use diagnostics", () => {
    const plan = resolveSubagentSpawnPreRunPlan({
      parentThread: parentThread(),
      parentRun: { id: "parent-run" },
      request: {
        task: "Summarize the artifact with a text-only local model.",
        roleId: "summarizer",
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        toolScope: {
          requestedCategories: ["artifact.read"],
        },
      },
      roleRegistry: createDefaultAgentRoleRegistry(),
      resolveModelRuntimeProfile: localTextConfiguredModelResolver(),
      existingRuns: [],
    });

    expect(plan.requestedToolScope).toEqual({ requestedCategories: ["artifact.read"] });
    expect(plan.modelScope.candidateDiagnostics[0]?.capabilityDiagnostics).toContainEqual(expect.objectContaining({
      capability: "tool_use",
      status: "pass",
      required: "requested tool scope exposes no categories that require model tool use",
      actual: "not_required",
    }));
    expect(plan.modelScope.candidateDiagnostics[0]?.capabilityDiagnostics).toContainEqual(expect.objectContaining({
      capability: "structured_output",
      status: "pass",
      actual: "ambient_validated_text",
    }));
  });
});

function modelResolver(): (modelId?: string) => ReturnType<ReturnType<typeof createDefaultModelRuntimeRegistry>["resolveProfile"]> {
  const registry = createDefaultModelRuntimeRegistry();
  return (modelId) => registry.resolveProfile(modelId);
}

function localTextConfiguredModelResolver(): (modelId?: string) => AmbientModelRuntimeProfile {
  return (modelId) => {
    const profile = resolveAmbientModelRuntimeProfile(modelId);
    if (profile.modelId !== AMBIENT_LOCAL_TEXT_MODEL) return profile;
    return {
      ...profile,
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
      available: true,
      unavailableReason: undefined,
      selectableAsSubagent: true,
    };
  };
}

function resolveStoredSymphonyContract(contract: unknown): (contractId: string) => unknown {
  return (contractId) => contractId === "contract-1" ? contract : undefined;
}

function enabledSubagentFeatureFlags() {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt: "2026-06-16T00:00:00.000Z",
  });
}

function symphonyLaunchBundle(
  featureFlagSnapshot: ReturnType<typeof enabledSubagentFeatureFlags>,
  options: {
    role?: string;
    allowedToolIds?: string[];
    deniedToolIds?: string[];
    writableRoots?: string[];
    mutation?: "none" | "lease_required";
  } = {},
) {
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
        { role: "verifier", count: 1, purpose: "Verify the draft." },
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
      role: options.role ?? "reviewer",
      pattern: "imitate_and_verify",
      inheritedAuthorityRoots: ["/workspace"],
      writableRoots: options.writableRoots ?? [],
      allowedToolIds: options.allowedToolIds ?? ["workspace.read", "test.run"],
      deniedToolIds: options.deniedToolIds ?? ["workspace.write", "browser.interactive"],
      webProviderOrder: {
        search: ["brave-search"],
        staticFetchExtract: ["scrapling-static"],
        dynamicHeadlessBrowser: ["scrapling-dynamic"],
        interactiveBrowser: {
          providers: ["ambient-browser"],
          fallback: "approval_required",
        },
      },
      mutation: options.mutation ?? "none",
    },
  };
}

function parentThread(input: { model?: string } = {}): Pick<ThreadSummary, "id" | "model" | "canonicalTaskPath"> {
  return {
    id: "parent-thread",
    model: input.model ?? "glm-5.1",
    canonicalTaskPath: "root",
  };
}

function run(input: { id: string; canonicalTaskPath: string }): SubagentRunSummary {
  return {
    id: input.id,
    canonicalTaskPath: input.canonicalTaskPath,
  } as SubagentRunSummary;
}
