import { describe, expect, it } from "vitest";

import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags, type AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import type { SubagentToolScopeSnapshotSummary } from "../../../shared/subagentTypes";
import type { ChildLaunchPolicySnapshot } from "../../../shared/symphonyFineGrainedContracts";
import {
  webResearchBrowserFallbackAllowedForThread,
  webResearchSymphonyRoutingForThread,
  type AgentRuntimeWebResearchRoutingStore,
} from "./agentRuntimeWebResearchSymphonyRouting";

describe("agentRuntimeWebResearchSymphonyRouting", () => {
  it("keeps browser fallback available for non-Symphony children with browser authority", () => {
    const store = routingStore({
      thread: { kind: "subagent_child", subagentRunId: "child-run" },
      run: { featureFlagSnapshot: featureFlags(true) },
      snapshots: [scopeSnapshot(["browser.read"])],
    });

    expect(webResearchBrowserFallbackAllowedForThread(store, "child-thread")).toBeUndefined();
  });

  it("keeps Symphony web routing tied to the child launch feature snapshot", () => {
    const launchFeatureFlags = featureFlags(true);
    const store = routingStore({
      thread: { kind: "subagent_child", subagentRunId: "child-run" },
      run: {
        featureFlagSnapshot: featureFlags(false),
        symphonyLaunchContracts: {
          modePolicySnapshot: { featureFlagSnapshot: launchFeatureFlags },
          childLaunchPolicySnapshot: childLaunchPolicy({
            search: ["ambient-brave-search", "exa-mcp-default"],
            staticFetchExtract: ["exa-mcp-default"],
            dynamicHeadlessBrowser: [],
            interactiveBrowser: {
              providers: ["ambient-browser"],
              fallback: "approval_required",
            },
          }),
        },
      },
    });

    expect(webResearchSymphonyRoutingForThread(store, "child-thread")).toMatchObject({
      featureFlagSnapshot: expect.objectContaining({
        flags: expect.objectContaining({
          [AMBIENT_SUBAGENTS_FEATURE_FLAG]: expect.objectContaining({
            enabled: true,
          }),
        }),
      }),
      childLaunchPolicySnapshot: expect.objectContaining({
        webProviderOrder: expect.objectContaining({
          search: ["ambient-brave-search", "exa-mcp-default"],
        }),
      }),
    });
  });
});

function routingStore(input: {
  thread: ReturnType<AgentRuntimeWebResearchRoutingStore["getThread"]>;
  run: ReturnType<AgentRuntimeWebResearchRoutingStore["getSubagentRun"]>;
  snapshots?: ReturnType<AgentRuntimeWebResearchRoutingStore["listSubagentToolScopeSnapshots"]>;
}): AgentRuntimeWebResearchRoutingStore {
  return {
    getThread: () => input.thread,
    getSubagentRun: () => input.run,
    listSubagentToolScopeSnapshots: () => input.snapshots ?? [],
  };
}

function featureFlags(subagents: boolean): AmbientFeatureFlagSnapshot {
  return resolveAmbientFeatureFlags({
    settings: { subagents },
    generatedAt: "2026-06-17T00:00:00.000Z",
  });
}

function scopeSnapshot(piVisibleCategories: SubagentToolScopeSnapshotSummary["scope"]["piVisibleCategories"]): SubagentToolScopeSnapshotSummary {
  return {
    runId: "child-run",
    sequence: 1,
    createdAt: "2026-06-17T00:00:00.000Z",
    resolverInputs: {},
    scope: {
      schemaVersion: "ambient-subagent-tool-scope-v1",
      loadedCategories: [...piVisibleCategories],
      piVisibleCategories: [...piVisibleCategories],
      deniedCategories: [],
      loadedTools: [],
      piVisibleTools: [],
      deniedTools: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      fanoutAvailable: false,
    },
  };
}

function childLaunchPolicy(
  webProviderOrder: ChildLaunchPolicySnapshot["webProviderOrder"],
): Pick<ChildLaunchPolicySnapshot, "webProviderOrder"> {
  return { webProviderOrder };
}
