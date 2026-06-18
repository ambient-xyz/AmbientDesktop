import type { AmbientFeatureFlagSnapshot } from "../../../shared/featureFlags";
import { isAmbientSubagentsEnabled } from "../../../shared/featureFlags";
import type { SubagentToolScopeSnapshotSummary } from "../../../shared/subagentTypes";
import type { ChildLaunchPolicySnapshot } from "../../../shared/symphonyFineGrainedContracts";
import { childToolScopeAllowsInteractiveBrowserFallback } from "./symphonyWebCapabilityRouter";

export interface AgentRuntimeWebResearchSymphonyRouting {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  childToolScopeSnapshot?: Pick<SubagentToolScopeSnapshotSummary, "scope" | "resolverInputs">;
  childLaunchPolicySnapshot?: Pick<ChildLaunchPolicySnapshot, "webProviderOrder">;
  interactiveBrowserApproved?: boolean;
}

export interface AgentRuntimeWebResearchRoutingStore {
  getThread(threadId: string): {
    kind?: string;
    subagentRunId?: string;
  };
  getSubagentRun(runId: string): {
    featureFlagSnapshot: AmbientFeatureFlagSnapshot;
    symphonyLaunchContracts?: {
      modePolicySnapshot?: {
        featureFlagSnapshot: AmbientFeatureFlagSnapshot;
      };
      childLaunchPolicySnapshot?: Pick<ChildLaunchPolicySnapshot, "webProviderOrder">;
    };
  };
  listSubagentToolScopeSnapshots(runId: string): Array<
    Pick<SubagentToolScopeSnapshotSummary, "scope" | "resolverInputs">
  >;
}

export function webResearchSymphonyRoutingForThread(
  store: AgentRuntimeWebResearchRoutingStore,
  threadId: string,
): AgentRuntimeWebResearchSymphonyRouting | undefined {
  const thread = store.getThread(threadId);
  if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
  const run = store.getSubagentRun(thread.subagentRunId);
  const childLaunchPolicySnapshot = run.symphonyLaunchContracts?.childLaunchPolicySnapshot;
  if (!childLaunchPolicySnapshot) return undefined;
  const featureFlagSnapshot = run.symphonyLaunchContracts?.modePolicySnapshot?.featureFlagSnapshot ?? run.featureFlagSnapshot;
  if (!isAmbientSubagentsEnabled(featureFlagSnapshot)) return undefined;
  const childToolScopeSnapshot = store.listSubagentToolScopeSnapshots(thread.subagentRunId).at(-1);
  const interactiveBrowserApproved = webResearchInteractiveBrowserApprovedForChild(
    childLaunchPolicySnapshot,
    childToolScopeSnapshot,
  );
  return {
    featureFlagSnapshot,
    childLaunchPolicySnapshot,
    ...(childToolScopeSnapshot ? { childToolScopeSnapshot } : {}),
    ...(interactiveBrowserApproved ? { interactiveBrowserApproved } : {}),
  };
}

export function webResearchBrowserFallbackAllowedForThread(
  store: AgentRuntimeWebResearchRoutingStore,
  threadId: string,
): boolean | undefined {
  const thread = store.getThread(threadId);
  if (thread.kind !== "subagent_child") return undefined;
  if (!thread.subagentRunId) return false;
  const run = store.getSubagentRun(thread.subagentRunId);
  const childLaunchPolicySnapshot = run.symphonyLaunchContracts?.childLaunchPolicySnapshot;
  const childToolScopeSnapshot = store.listSubagentToolScopeSnapshots(thread.subagentRunId).at(-1);
  if (!childLaunchPolicySnapshot) {
    const visibleCategories = new Set(childToolScopeSnapshot?.scope.piVisibleCategories ?? []);
    return visibleCategories.has("browser.read") || visibleCategories.has("browser.interactive")
      ? undefined
      : false;
  }
  return webResearchInteractiveBrowserApprovedForChild(childLaunchPolicySnapshot, childToolScopeSnapshot)
    ? undefined
    : false;
}

export function webResearchInteractiveBrowserApprovedForChild(
  childLaunchPolicySnapshot: Pick<ChildLaunchPolicySnapshot, "webProviderOrder"> | undefined,
  childToolScopeSnapshot: Pick<SubagentToolScopeSnapshotSummary, "scope" | "resolverInputs"> | undefined,
): boolean {
  return Boolean(
    childLaunchPolicySnapshot?.webProviderOrder.interactiveBrowser.fallback === "approval_required" &&
    childLaunchPolicySnapshot.webProviderOrder.interactiveBrowser.providers.length > 0 &&
    childToolScopeAllowsInteractiveBrowserFallback(childToolScopeSnapshot),
  );
}
