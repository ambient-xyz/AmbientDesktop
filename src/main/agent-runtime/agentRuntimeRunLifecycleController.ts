import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PluginMcpRuntimeSnapshot } from "./agentRuntimePluginsFacade";
import { goalRuntimeActivity } from "./agentRuntimeGoalRuntime";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { RuntimeAbortContextActiveRun } from "./runtimeAbortContext";

interface AgentRuntimeRunLifecyclePluginHost {
  shutdownPluginMcpServers(): Promise<void>;
  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[];
  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined>;
}

interface AgentRuntimeRunLifecycleSubagentStopCascade {
  cancelSubagentRunForStoppedChildThread(threadId: string, reason: string): unknown;
  cascadeSubagentsForStoppedParentRun(threadId: string, runId: string, reason: string): Promise<void>;
}

interface AgentRuntimeClearableState {
  clear(): void;
}

export interface AgentRuntimeRunLifecycleControllerOptions {
  store: Pick<ProjectStore, "getThreadGoal" | "markThreadGoalStatus" | "interruptActiveRuns">;
  sessions: {
    disposeAll(): void;
  };
  activeRuns: Map<string, RuntimeAbortContextActiveRun>;
  activeRunIds: Map<string, string>;
  ambientCliPackageDescriptionState: AgentRuntimeClearableState;
  ambientWorkflowDescriptionState: AgentRuntimeClearableState;
  pluginHost: AgentRuntimeRunLifecyclePluginHost;
  subagentStopCascade: AgentRuntimeRunLifecycleSubagentStopCascade;
  emit: (event: DesktopEvent) => void;
}

export class AgentRuntimeRunLifecycleController {
  constructor(private readonly options: AgentRuntimeRunLifecycleControllerOptions) {}

  async abort(threadId: string, input: { skipSubagentChildCancellation?: boolean } = {}): Promise<void> {
    const parentRunId = this.options.activeRunIds.get(threadId);
    await this.options.activeRuns.get(threadId)?.abort();
    if (!input.skipSubagentChildCancellation) {
      this.options.subagentStopCascade.cancelSubagentRunForStoppedChildThread(
        threadId,
        "Sub-agent child thread stopped by user.",
      );
    }
    if (parentRunId) {
      await this.options.subagentStopCascade.cascadeSubagentsForStoppedParentRun(
        threadId,
        parentRunId,
        "Parent run stopped by user.",
      );
    }
    this.options.activeRuns.delete(threadId);
    this.options.activeRunIds.delete(threadId);
    const goal = this.options.store.getThreadGoal(threadId);
    if (goal?.status === "active") {
      const paused = this.options.store.markThreadGoalStatus(threadId, "paused", {
        expectedGoalId: goal.goalId,
        statusReason: "Paused because the user stopped the active run.",
      });
      this.options.emit({ type: "thread-goal-updated", goal: paused });
      this.options.emit({
        type: "runtime-activity",
        activity: goalRuntimeActivity({
          threadId,
          status: "paused",
          message: "Goal paused because the active run was stopped.",
          goalId: paused.goalId,
        }),
      });
    }
    this.options.emit({ type: "run-status", threadId, status: "idle" });
  }

  interruptActiveRuns(reason: string): number {
    const activeRuns = [...this.options.activeRuns.entries()];
    if (!activeRuns.length) return 0;
    try {
      this.options.store.interruptActiveRuns(reason);
    } catch (error) {
      console.warn(`Failed to mark active Ambient runs interrupted: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const [threadId, activeRun] of activeRuns) {
      activeRun.detach();
      this.options.activeRuns.delete(threadId);
      this.options.activeRunIds.delete(threadId);
      const goal = this.options.store.getThreadGoal(threadId);
      if (goal?.status === "active") {
        const paused = this.options.store.markThreadGoalStatus(threadId, "paused", {
          expectedGoalId: goal.goalId,
          statusReason: "Paused because the active run was interrupted.",
        });
        this.options.emit({ type: "thread-goal-updated", goal: paused });
      }
      this.options.emit({ type: "run-status", threadId, status: "idle" });
    }
    return activeRuns.length;
  }

  resetSessions(): void {
    this.options.sessions.disposeAll();
    this.options.activeRuns.clear();
    this.options.activeRunIds.clear();
    this.options.ambientCliPackageDescriptionState.clear();
    this.options.ambientWorkflowDescriptionState.clear();
    void this.shutdownPluginMcpServers().catch((error) => {
      console.warn(`Ambient runtime plugin MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async shutdownPluginMcpServers(): Promise<void> {
    await this.options.pluginHost.shutdownPluginMcpServers();
  }

  pluginMcpRuntimeSnapshots(): PluginMcpRuntimeSnapshot[] {
    return this.options.pluginHost.pluginMcpRuntimeSnapshots();
  }

  restartPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.options.pluginHost.restartPluginMcpRuntime(key);
  }

  stopPluginMcpRuntime(key: string): Promise<PluginMcpRuntimeSnapshot[] | undefined> {
    return this.options.pluginHost.stopPluginMcpRuntime(key);
  }
}
