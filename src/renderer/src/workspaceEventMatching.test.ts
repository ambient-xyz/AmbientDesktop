import { describe, expect, it } from "vitest";
import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  desktopEventMatchesProject,
  workspaceProjectAliasesForState,
} from "./workspaceEventMatching";

const baseThread: ThreadSummary = {
  id: "thread-1",
  title: "New chat",
  workspacePath: "/repo/.ambient-codex/worktrees/thread-1",
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  lastMessagePreview: "",
  permissionMode: "workspace",
  collaborationMode: "agent",
  model: "zai-org/GLM-5.1-FP8",
  thinkingLevel: "xhigh",
  gitWorktree: {
    threadId: "thread-1",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/thread-1",
    branchName: "ambient/chat-thread-1",
    status: "active",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  },
};

function desktopState(): DesktopState {
  return {
    app: {
      name: "Ambient Desktop",
      version: "0.1.25",
      isPackaged: false,
      platform: "darwin",
      arch: "arm64",
      build: { channel: "development" },
      piVersions: { piAi: "0.0.0", piCodingAgent: "0.0.0" },
      update: { status: "idle" },
      thirdPartyCredits: [],
    },
    appearance: { theme: "system" },
    workspace: { path: "/repo", name: "repo", statePath: "/state", sessionPath: "/sessions" },
    activeWorkspace: { path: "/repo/.ambient-codex/worktrees/thread-1", name: "repo worktree", statePath: "/state", sessionPath: "/sessions" },
    providerCatalog: { enabled: false, registryCount: 0, generatedCount: 0, selectedProviderIds: [] },
    projects: [
      {
        id: "repo",
        path: "/repo",
        name: "repo",
        statePath: "/state",
        sessionPath: "/sessions",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
        threads: [baseThread],
      },
    ],
    automationFolders: [],
    workflowAgentFolders: [],
    workflowRecordingLibrary: [],
    automationThreadChatIds: [],
    threads: [baseThread],
    activeThreadId: "thread-1",
    threadRunStatuses: {},
    messages: [],
    messageVoiceStates: {},
    voiceSettingsAudit: [],
    plannerPlanArtifacts: [],
    settings: {
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "zai-org/GLM-5.1-FP8",
      thinkingLevel: "xhigh",
    },
    provider: { name: "Ambient API", connected: true, hasApiKey: true },
    queue: { threadId: "thread-1", messages: [] },
    sttQueue: { queued: 0, active: false },
    sttDiagnostics: [],
    contextUsage: { threadId: "thread-1", usedTokens: 0, maxTokens: 0, percent: 0 },
  } as unknown as DesktopState;
}

describe("workspace event matching", () => {
  it("matches thread worktree events to their owning project root", () => {
    const aliases = workspaceProjectAliasesForState(desktopState());
    const event: DesktopEvent = {
      type: "message-created",
      workspacePath: "/repo/.ambient-codex/worktrees/thread-1",
      message: {
        id: "message-1",
        threadId: "thread-1",
        role: "user",
        content: "What is 2 plus 2?",
        createdAt: "2026-05-21T00:00:01.000Z",
      },
    };

    expect(desktopEventMatchesProject(event, "/repo", aliases)).toBe(true);
  });

  it("does not match unrelated project workspaces", () => {
    const aliases = workspaceProjectAliasesForState(desktopState());
    const event: DesktopEvent = {
      type: "run-status",
      workspacePath: "/other/.ambient-codex/worktrees/thread-2",
      threadId: "thread-2",
      status: "starting",
    };

    expect(desktopEventMatchesProject(event, "/repo", aliases)).toBe(false);
  });
});
