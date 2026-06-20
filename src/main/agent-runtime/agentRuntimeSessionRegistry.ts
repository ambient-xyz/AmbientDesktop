import {
  runtimeActiveSessionResetPlan,
  type RuntimeActiveSessionLike,
  type RuntimeActiveSessionResetResult,
} from "./agentRuntimeActiveSessionReset";
import {
  shouldRebuildSessionForSymphonyParentMode,
  type SymphonyParentModePolicy,
  type SymphonyParentModeVerifiedLaunch,
} from "./agentRuntimeSymphonyParentMode";

export interface AgentRuntimeSessionRegistrySetInput<Session extends RuntimeActiveSessionLike> {
  threadId: string;
  session: Session;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
}

export type AgentRuntimeSessionReusePlan<Session extends RuntimeActiveSessionLike> =
  | { kind: "missing" }
  | {
      kind: "reusable";
      session: Session;
    }
  | {
      kind: "stale";
      session: Session;
      pluginToolsStale: boolean;
      runtimeSettingsStale: boolean;
      symphonyParentModeStale: boolean;
    };

export interface AgentRuntimeSessionResetCallbacks<Session extends RuntimeActiveSessionLike> {
  onDeferred?: (threadId: string, session: Session) => void;
  onDisposed?: (threadId: string, session: Session) => void;
}

export class AgentRuntimeSessionRegistry<Session extends RuntimeActiveSessionLike> {
  private readonly activeSessions = new Map<string, Session>();
  private readonly stalePluginToolThreads = new Set<string>();
  private readonly staleRuntimeSettingsThreads = new Set<string>();
  private readonly activeSessionSymphonyParentModeByThreadId = new Map<string, boolean>();
  private readonly activeSessionSymphonyParentModePolicyKeyByThreadId = new Map<string, string>();
  private readonly activeSessionSymphonyParentModeLaunchVerifiedByThreadId = new Map<string, boolean>();

  get(threadId: string): Session | undefined {
    return this.activeSessions.get(threadId);
  }

  set(input: AgentRuntimeSessionRegistrySetInput<Session>): void {
    this.activeSessions.set(input.threadId, input.session);
    this.activeSessionSymphonyParentModeByThreadId.set(input.threadId, Boolean(input.symphonyParentModePolicy));
    this.activeSessionSymphonyParentModePolicyKeyByThreadId.set(
      input.threadId,
      input.symphonyParentModePolicy?.expectedWorkflowToolName ?? "",
    );
    this.activeSessionSymphonyParentModeLaunchVerifiedByThreadId.set(
      input.threadId,
      Boolean(input.symphonyParentModeVerifiedLaunch),
    );
  }

  delete(threadId: string): boolean {
    this.activeSessionSymphonyParentModeByThreadId.delete(threadId);
    this.activeSessionSymphonyParentModePolicyKeyByThreadId.delete(threadId);
    this.activeSessionSymphonyParentModeLaunchVerifiedByThreadId.delete(threadId);
    return this.activeSessions.delete(threadId);
  }

  clearStale(threadId: string): void {
    this.stalePluginToolThreads.delete(threadId);
    this.staleRuntimeSettingsThreads.delete(threadId);
  }

  markPluginToolsStale(threadId: string): void {
    this.stalePluginToolThreads.add(threadId);
  }

  markRuntimeSettingsStale(threadId: string): void {
    this.staleRuntimeSettingsThreads.add(threadId);
  }

  clearRuntimeSettingsStale(threadId: string): void {
    this.staleRuntimeSettingsThreads.delete(threadId);
  }

  reusableSessionPlan(input: {
    threadId: string;
    symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
    symphonyParentModeVerifiedLaunch?: SymphonyParentModeVerifiedLaunch | undefined;
  }): AgentRuntimeSessionReusePlan<Session> {
    const session = this.activeSessions.get(input.threadId);
    if (!session) return { kind: "missing" };

    const pluginToolsStale = this.stalePluginToolThreads.delete(input.threadId);
    const runtimeSettingsStale = this.staleRuntimeSettingsThreads.delete(input.threadId);
    const symphonyParentModeStale = shouldRebuildSessionForSymphonyParentMode({
      cachedSymphonyParentMode: this.activeSessionSymphonyParentModeByThreadId.get(input.threadId),
      nextPolicy: input.symphonyParentModePolicy,
      cachedPolicyKey: this.activeSessionSymphonyParentModePolicyKeyByThreadId.get(input.threadId),
      cachedLaunchVerified: this.activeSessionSymphonyParentModeLaunchVerifiedByThreadId.get(input.threadId),
      nextLaunchVerified: Boolean(input.symphonyParentModeVerifiedLaunch),
    });
    if (pluginToolsStale || runtimeSettingsStale || symphonyParentModeStale) {
      return {
        kind: "stale",
        session,
        pluginToolsStale,
        runtimeSettingsStale,
        symphonyParentModeStale,
      };
    }
    return { kind: "reusable", session };
  }

  resetForRuntimeSettings(
    activeRuns: { has(threadId: string): boolean },
    callbacks: AgentRuntimeSessionResetCallbacks<Session> = {},
    threadIds?: readonly string[],
  ): RuntimeActiveSessionResetResult {
    const entries = threadIds
      ? threadIds.flatMap((threadId) => {
          const session = this.activeSessions.get(threadId);
          return session ? ([[threadId, session]] as [string, Session][]) : [];
        })
      : this.activeSessions.entries();
    const plan = runtimeActiveSessionResetPlan(entries, activeRuns);
    for (const action of plan.actions) {
      const session = action.session as Session;
      if (action.status === "deferred") {
        this.markRuntimeSettingsStale(action.threadId);
        callbacks.onDeferred?.(action.threadId, session);
        continue;
      }
      session.dispose();
      this.delete(action.threadId);
      this.clearStale(action.threadId);
      callbacks.onDisposed?.(action.threadId, session);
    }
    return plan.result;
  }

  disposeAll(): void {
    for (const session of this.activeSessions.values()) {
      session.dispose();
    }
    this.activeSessions.clear();
    this.stalePluginToolThreads.clear();
    this.staleRuntimeSettingsThreads.clear();
    this.activeSessionSymphonyParentModeByThreadId.clear();
    this.activeSessionSymphonyParentModePolicyKeyByThreadId.clear();
    this.activeSessionSymphonyParentModeLaunchVerifiedByThreadId.clear();
  }
}
