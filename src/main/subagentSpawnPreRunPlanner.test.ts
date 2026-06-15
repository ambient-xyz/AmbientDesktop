import { describe, expect, it } from "vitest";
import {
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../shared/ambientModels";
import type { SubagentRunSummary, ThreadSummary } from "../shared/types";
import { createDefaultAgentRoleRegistry } from "./agentRoleRegistry";
import { createDefaultModelRuntimeRegistry } from "./modelRuntimeRegistry";
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
