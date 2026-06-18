import type { DesktopEvent } from "../../../shared/desktopTypes";

export interface AgentRuntimeBrowserRefreshInput {
  threadId: string;
  workspacePath: string;
  artifactPath: string;
}

export interface AgentRuntimeBrowserRefreshDeps {
  refreshWorkspaceArtifact: (input: { workspacePath: string; changedPath: string }) => Promise<boolean>;
  refreshExternalFileBrowserTabs: (workspacePath: string, changedPath: string) => Promise<number>;
  emitBrowserState: () => Promise<void>;
  emit: (event: DesktopEvent) => void;
}

export async function refreshAgentRuntimeBrowsersForArtifactChange(
  input: AgentRuntimeBrowserRefreshInput,
  deps: AgentRuntimeBrowserRefreshDeps,
): Promise<void> {
  const [managedRefreshed] = await Promise.all([
    deps.refreshWorkspaceArtifact({ workspacePath: input.workspacePath, changedPath: input.artifactPath }).catch(() => false),
    deps.refreshExternalFileBrowserTabs(input.workspacePath, input.artifactPath).catch(() => 0),
  ]);
  if (!managedRefreshed) return;

  await deps.emitBrowserState();
  deps.emit({
    type: "runtime-activity",
    activity: {
      threadId: input.threadId,
      kind: "browser",
      status: "finished",
      message: `Refreshed preview for ${input.artifactPath}.`,
    },
  });
}
