import { describe, expect, it } from "vitest";

import {
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  resolveAmbientFeatureFlags,
} from "../../shared/featureFlags";
import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { SendMessageComposerIntent } from "../../shared/desktopTypes";
import {
  activeToolNamesForSymphonyParentMode,
  buildSymphonyModeStateSnapshot,
  carrySymphonyParentModePolicy,
  carrySymphonyParentModeVerifiedLaunch,
  resolveSymphonyParentModePolicy,
  resolveSymphonyParentModePolicyForRuntimeSend,
  resolveSymphonyParentModeVerifiedLaunch,
  shouldRejectSymphonyParentModeActiveRunHandoff,
  shouldRequireSymphonyParentModeLaunch,
  shouldRebuildSessionForSymphonyParentMode,
  SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR,
  SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR,
  validateSymphonyParentModeCallableWorkflowPrelaunch,
} from "./agentRuntimeSymphonyParentMode";

const enabledFlags = resolveAmbientFeatureFlags({
  startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
  generatedAt: "2026-06-17T00:00:00.000Z",
});
const disabledFlags = resolveAmbientFeatureFlags({
  generatedAt: "2026-06-17T00:00:00.000Z",
});

describe("Symphony parent mode policy", () => {
  it("builds an explicit generic sub-agent snapshot for ordinary parent prompts", () => {
    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      schemaVersion: "ambient-symphony-mode-state-v1",
      kind: "generic_subagents",
      reason: "no_symphony_intent",
      toggleState: "off",
      patternPreflight: {
        schemaVersion: "ambient-symphony-pattern-preflight-v1",
        state: "not_required",
        source: "none",
      },
      launch: {
        schemaVersion: "ambient-symphony-workflow-launch-state-v1",
        state: "not_required",
      },
    });

    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: {
        kind: "local-deep-research",
        localDeepResearch: resolveLocalDeepResearchRunBudget(undefined, {
          effort: "deep",
          maxToolCalls: 20,
          onExhausted: "summarize",
        }),
      },
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      kind: "generic_subagents",
      reason: "non_symphony_intent",
      composerIntentKind: "local-deep-research",
    });
  });

  it("builds a Symphony armed snapshot for recipe authoring without entering parent mode", () => {
    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      featureFlagSnapshot: enabledFlags,
      toggleState: "on",
    })).toMatchObject({
      kind: "symphony_armed",
      reason: "symphony_preflight_pending",
      toggleState: "on",
      patternPreflight: {
        state: "pending_detection",
        source: "symphony_toggle",
      },
      launch: {
        state: "not_required",
      },
    });

    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: symphonySaveRecipeIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      kind: "symphony_armed",
      reason: "symphony_save_recipe",
      toggleState: "on",
      composerIntentKind: "symphony-workflow",
      patternPreflight: {
        state: "selected",
        source: "composer_intent",
        selectedPatternId: "map_reduce",
      },
      launch: {
        state: "not_required",
      },
    });
  });

  it("builds a Symphony parent-mode snapshot with policy and launch status", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
      policy,
    })).toMatchObject({
      kind: "symphony_parent",
      reason: "symphony-composer-run-once",
      toggleState: "on",
      composerIntentKind: "symphony-workflow",
      patternPreflight: {
        state: "selected",
        source: "composer_intent",
        selectedPatternId: "map_reduce",
      },
      launch: {
        state: "required_pending",
        expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
        expectedWorkflowSourceKind: "symphony_recipe",
      },
      parentModePolicy: {
        enabled: true,
        reason: "symphony-composer-run-once",
        launchRequirement: "required_this_turn",
        directExecutionPolicy: "deny_substantive_tools",
        expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
        expectedWorkflowSourceKind: "symphony_recipe",
        expectedPatternId: "map_reduce",
      },
    });

    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
      policy,
      verifiedLaunch: {
        parentThreadId: "parent-thread",
        parentRunId: "run-1",
        taskId: "task-1",
        toolName: "ambient_workflow_symphony_map_reduce",
        sourceKind: "symphony_recipe",
      },
    })).toMatchObject({
      kind: "symphony_parent",
      launch: {
        state: "verified",
        taskId: "task-1",
        parentThreadId: "parent-thread",
        parentRunId: "run-1",
      },
    });
  });

  it("builds a preflight-capable Symphony slash snapshot without requiring immediate launch", () => {
    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: symphonySlashIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      kind: "symphony_parent",
      reason: "symphony-slash-command",
      patternPreflight: {
        state: "selected",
        source: "slash_command",
        selectedPatternId: "map_reduce",
      },
      launch: {
        state: "preflight_may_ask",
        expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
      },
    });
  });

  it("explains why Symphony mode is unavailable when subagents are disabled or the thread is already a child", () => {
    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: disabledFlags,
    })).toMatchObject({
      kind: "unavailable",
      reason: "ambient_subagents_disabled",
      toggleState: "off",
      patternPreflight: {
        state: "selected",
        source: "composer_intent",
        selectedPatternId: "map_reduce",
      },
      launch: {
        state: "not_required",
      },
    });

    expect(buildSymphonyModeStateSnapshot({
      thread: { kind: "subagent_child" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
      toggleState: "on",
    })).toMatchObject({
      kind: "unavailable",
      reason: "subagent_child_thread",
      toggleState: "unknown",
    });
  });

  it("activates only for parent-thread Symphony launch intents while ambient.subagents is enabled", () => {
    expect(resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      enabled: true,
      reason: "symphony-composer-run-once",
      launchRequirement: "required_this_turn",
      directExecutionPolicy: "deny_substantive_tools",
      expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
      expectedWorkflowSourceKind: "symphony_recipe",
      expectedPatternId: "map_reduce",
    });

    expect(resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonySlashIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toMatchObject({
      reason: "symphony-slash-command",
      launchRequirement: "preflight_may_ask",
      expectedWorkflowToolName: "ambient_workflow_symphony_map_reduce",
    });

    expect(resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonySaveRecipeIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toBeUndefined();
    expect(resolveSymphonyParentModePolicy({
      thread: { kind: "subagent_child" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    })).toBeUndefined();
    expect(resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: disabledFlags,
    })).toBeUndefined();
  });

  it("sym-parent-not-worker keeps only conductor tools and strips parent-worker tools after recovery activation", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(activeToolNamesForSymphonyParentMode({
      policy,
      conductorToolNames: [
        "ambient_callable_workflow_catalog_search",
        "ambient_callable_workflow_catalog_describe",
        "ambient_workflow_symphony_map_reduce",
        "recovery_read_interrupted_tool_call",
      ],
      activeToolNames: [
        "read",
        "bash",
        "edit",
        "write",
        "browser_search",
        "web_research_search",
        "ambient_tool_search",
        "ambient_tool_call",
        "get_goal",
        "plugin_mcp",
        "project_task",
        "ambient_subagent",
        "ambient_callable_workflow_catalog_search",
        "ambient_callable_workflow_catalog_describe",
        "ambient_workflow_symphony_map_reduce",
        "ambient_workflow_symphony_pipeline",
        "ambient_workflow_recorded_trip_v1",
        "recovery_read_interrupted_tool_call",
        "recovery_apply_interrupted_write_suffix",
      ],
    })).toEqual([
      "ambient_callable_workflow_catalog_search",
      "ambient_callable_workflow_catalog_describe",
      "ambient_workflow_symphony_map_reduce",
      "recovery_read_interrupted_tool_call",
    ]);
  });

  it("removes workflow launch tools after parent-mode launch verification", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(activeToolNamesForSymphonyParentMode({
      policy,
      conductorToolNames: [
        "ambient_callable_workflow_catalog_search",
        "ambient_callable_workflow_catalog_describe",
      ],
      activeToolNames: [
        "ambient_callable_workflow_catalog_search",
        "ambient_callable_workflow_catalog_describe",
        "ambient_workflow_symphony_map_reduce",
      ],
    })).toEqual([
      "ambient_callable_workflow_catalog_search",
      "ambient_callable_workflow_catalog_describe",
    ]);
  });

  it("leaves the normal active tool surface unchanged outside Symphony parent mode", () => {
    expect(activeToolNamesForSymphonyParentMode({
      activeToolNames: ["read", "bash", "ambient_tool_search", "ambient_subagent"],
      conductorToolNames: ["ambient_subagent"],
    })).toEqual(["read", "bash", "ambient_tool_search", "ambient_subagent"]);
  });

  it("rebuilds cached parent sessions when entering or leaving Symphony parent mode", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: false,
      nextPolicy: policy,
    })).toBe(true);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: true,
      cachedPolicyKey: "ambient_workflow_symphony_map_reduce",
      nextPolicy: policy,
    })).toBe(false);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: true,
      cachedPolicyKey: "ambient_workflow_symphony_pipeline",
      nextPolicy: policy,
    })).toBe(true);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: true,
      cachedPolicyKey: "ambient_workflow_symphony_map_reduce",
      cachedLaunchVerified: false,
      nextPolicy: policy,
      nextLaunchVerified: true,
    })).toBe(true);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: true,
      cachedPolicyKey: "ambient_workflow_symphony_map_reduce",
      cachedLaunchVerified: true,
      nextPolicy: policy,
      nextLaunchVerified: true,
    })).toBe(false);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: true,
    })).toBe(true);
    expect(shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: false,
    })).toBe(false);
  });

  it("continues carried parent-mode policy for internal recovery follow-ups only while eligible", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(resolveSymphonyParentModePolicyForRuntimeSend({
      thread: { kind: "chat" },
      carriedPolicy: policy,
      featureFlagSnapshot: enabledFlags,
    })).toBe(policy);
    expect(resolveSymphonyParentModePolicyForRuntimeSend({
      thread: { kind: "subagent_child" },
      carriedPolicy: policy,
      featureFlagSnapshot: enabledFlags,
    })).toBeUndefined();
    expect(resolveSymphonyParentModePolicyForRuntimeSend({
      thread: { kind: "chat" },
      carriedPolicy: policy,
      featureFlagSnapshot: disabledFlags,
    })).toBeUndefined();
  });

  it("rejects active-run handoff for Symphony parent-mode launches", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });

    expect(shouldRejectSymphonyParentModeActiveRunHandoff({
      activeRunPresent: true,
      policy,
    })).toBe(true);
    expect(shouldRejectSymphonyParentModeActiveRunHandoff({
      activeRunPresent: false,
      policy,
    })).toBe(false);
    expect(shouldRejectSymphonyParentModeActiveRunHandoff({
      activeRunPresent: true,
    })).toBe(false);
  });

  it("attaches carried parent-mode policy to runtime follow-up inputs without changing normal inputs", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });
    const sendInput = {
      threadId: "thread-1",
      content: "run it",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "moonshotai/kimi-k2.7-code",
      thinkingLevel: "medium",
    } as const;

    expect(carrySymphonyParentModePolicy(sendInput).symphonyParentModePolicy).toBeUndefined();
    expect(carrySymphonyParentModePolicy(sendInput, policy).symphonyParentModePolicy).toBe(policy);
  });

  it("requires Symphony parent mode to queue the expected callable workflow exactly once for the current parent run", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });
    const matchingTask = {
      id: "task-1",
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    };

    expect(SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR).toContain("active session");
    expect(SYMPHONY_PARENT_MODE_MISSING_WORKFLOW_TASK_ERROR).toContain("did not queue");
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [{ ...matchingTask, parentRunId: "older-run" }],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [{ ...matchingTask, id: "wrong", toolName: "ambient_workflow_symphony_pipeline" }],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [matchingTask, { ...matchingTask, id: "task-2" }],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      carriedLaunch: {
        parentThreadId: "parent-thread",
        parentRunId: "older-run",
        taskId: "older-task",
        toolName: "ambient_workflow_symphony_map_reduce",
        sourceKind: "symphony_recipe",
      },
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [],
    })).toEqual({
      parentThreadId: "parent-thread",
      parentRunId: "older-run",
      taskId: "older-task",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    });
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      carriedLaunch: {
        parentThreadId: "parent-thread",
        parentRunId: "older-run",
        taskId: "older-task",
        toolName: "ambient_workflow_symphony_map_reduce",
        sourceKind: "symphony_recipe",
      },
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [{ ...matchingTask, id: "duplicate-in-retry" }],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      carriedLaunch: {
        parentThreadId: "parent-thread",
        parentRunId: "older-run",
        taskId: "older-task",
        toolName: "ambient_workflow_symphony_map_reduce",
        sourceKind: "symphony_recipe",
      },
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [{ ...matchingTask, id: "wrong-in-retry", toolName: "ambient_workflow_symphony_pipeline" }],
    })).toBeUndefined();
    expect(resolveSymphonyParentModeVerifiedLaunch({
      policy,
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [matchingTask],
    })).toEqual({
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      taskId: "task-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    });
    expect(resolveSymphonyParentModeVerifiedLaunch({
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      tasks: [],
    })).toBeUndefined();
  });

  it("requires an immediate launch only for composer run-once parent mode", () => {
    expect(shouldRequireSymphonyParentModeLaunch({
      policy: resolveSymphonyParentModePolicy({
        thread: { kind: "chat" },
        composerIntent: symphonyRunOnceIntent(),
        featureFlagSnapshot: enabledFlags,
      }),
    })).toBe(true);
    expect(shouldRequireSymphonyParentModeLaunch({
      policy: resolveSymphonyParentModePolicy({
        thread: { kind: "chat" },
        composerIntent: symphonySlashIntent(),
        featureFlagSnapshot: enabledFlags,
      }),
    })).toBe(false);
    expect(shouldRequireSymphonyParentModeLaunch({})).toBe(false);
  });

  it("rejects invalid Symphony callable workflow launches before enqueueing tasks", () => {
    const policy = resolveSymphonyParentModePolicy({
      thread: { kind: "chat" },
      composerIntent: symphonyRunOnceIntent(),
      featureFlagSnapshot: enabledFlags,
    });
    const request = {
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    };
    const existingTask = {
      id: "task-1",
      parentThreadId: "parent-thread",
      parentRunId: "run-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    };

    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      request,
      existingTasks: [existingTask],
    })).toEqual({ allowed: true });
    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      policy,
      request,
      existingTasks: [],
    })).toEqual({ allowed: true });
    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      policy,
      request: { ...request, toolName: "ambient_workflow_symphony_pipeline" },
      existingTasks: [],
    })).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("expected ambient_workflow_symphony_map_reduce"),
    });
    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      policy,
      request,
      launchVerified: true,
      existingTasks: [],
    })).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("already verified"),
    });
    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      policy,
      request,
      existingTasks: [{ ...existingTask, id: "older-task", parentRunId: "older-run" }],
    })).toEqual({ allowed: true });
    expect(validateSymphonyParentModeCallableWorkflowPrelaunch({
      policy,
      request,
      existingTasks: [existingTask],
    })).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("already has 1 callable workflow task"),
    });
  });

  it("carries a verified launch into finalization-only retry inputs", () => {
    const sendInput = {
      threadId: "thread-1",
      content: "explain queued task",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "moonshotai/kimi-k2.7-code",
      thinkingLevel: "medium",
    } as const;
    const launch = {
      parentThreadId: "thread-1",
      parentRunId: "run-1",
      taskId: "task-1",
      toolName: "ambient_workflow_symphony_map_reduce",
      sourceKind: "symphony_recipe",
    };

    expect(carrySymphonyParentModeVerifiedLaunch(sendInput)?.symphonyParentModeVerifiedLaunch).toBeUndefined();
    expect(carrySymphonyParentModeVerifiedLaunch(sendInput, launch)?.symphonyParentModeVerifiedLaunch).toBe(launch);
  });
});

function symphonyRunOnceIntent(): SendMessageComposerIntent {
  return {
    kind: "symphony-workflow",
    action: "run-once",
    patternId: "map_reduce",
    metricCustomizations: {
      "map_reduce-metric": "Reducer must cite every child result.",
    },
  };
}

function symphonySaveRecipeIntent(): SendMessageComposerIntent {
  return {
    kind: "symphony-workflow",
    action: "save-recipe",
    patternId: "map_reduce",
    metricCustomizations: {
      "map_reduce-metric": "Reducer must cite every child result.",
    },
  };
}

function symphonySlashIntent(): SendMessageComposerIntent {
  return {
    kind: "slash-command",
    selection: {
      schemaVersion: "ambient-slash-command-invocation-v1",
      entryId: "symphony-map-reduce",
      command: "/symphony-map-reduce",
      title: "Symphony Map-Reduce",
      kind: "callable-workflow",
      sourceKind: "symphony",
      invocationKind: "symphony-recipe",
      sourceId: "map_reduce",
      sourceName: "Symphony Map-Reduce",
      requiresParameters: true,
    },
  };
}
