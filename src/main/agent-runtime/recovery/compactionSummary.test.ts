import { describe, expect, it } from "vitest";
import {
  buildAmbientCompactionSummary,
  buildVisibleTranscriptRecoverySessionSeed,
  buildVisibleTranscriptRecoverySummary,
  hasSeedableVisibleTranscriptRecoveryMessages,
  hasVisibleTranscriptRecoveryMessage,
  isVisibleTranscriptRecoveryMessage,
  isVisibleTranscriptRecoveryNormalCompactionRequiredError,
  selectVisibleTranscriptRecoveryMessages,
  visibleTranscriptRecoveryCustomMessage,
  visibleTranscriptRecoveryDefaultSessionSeedMessages,
  visibleTranscriptRecoveryManualMessages,
  visibleTranscriptRecoveryMissingSessionPlan,
  visibleTranscriptRecoveryReason,
  visibleTranscriptRecoveryRestorableSessionPlan,
  visibleTranscriptRecoverySessionOpenFailurePlan,
  visibleTranscriptRecoverySessionOpenUnavailablePlan,
  visibleTranscriptRecoverySessionSeedDecision,
  visibleTranscriptRecoverySessionSeedMessages,
  visibleTranscriptRecoverySessionTranscriptContext,
  visibleTranscriptRecoverySummaryCustomMessage,
  visibleTranscriptRecoverySystemMessage,
  visibleTranscriptRecoveryUnavailableContextMessages,
} from "./compactionSummary";
import type { ChatMessage, ThreadSummary } from "../../../shared/threadTypes";

const thread: ThreadSummary = {
  id: "thread-1",
  title: "Build app",
  workspacePath: "/workspace/project",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  lastMessagePreview: "",
  permissionMode: "workspace",
  collaborationMode: "agent",
  model: "zai-org/GLM-5.1-FP8",
  thinkingLevel: "low",
};

describe("compaction summary helpers", () => {
  it("builds a structured Ambient summary with workspace and file state", () => {
    const messages: ChatMessage[] = [
      message("u1", "user", "Build a todo app with apiKey=ambient-abcdefghijklmnopqrstuvwxyz", {
        context: [{ path: "src/App.tsx" }],
      }),
      message("hidden", "user", "Continue working toward the active Ambient Desktop thread goal.", {
        runtime: "ambient-internal",
        kind: "hidden-user-message",
        hiddenFromTranscript: true,
        hiddenUserMessage: true,
      }),
      message("a1", "assistant", "Implemented the first screen."),
      message("t1", "tool", "Edited file", { toolName: "edit", artifactPath: "src/App.tsx", status: "done" }),
      message("t2", "tool", "Permission denied", { toolName: "bash", status: "error" }),
    ];

    const summary = buildAmbientCompactionSummary({
      thread,
      visibleMessages: messages,
      summarizedMessages: [{ role: "user", content: [{ type: "text", text: "Need responsive UI." }] }],
      previousSummary: "Previous summary",
      fileOps: {
        read: new Set(["README.md"]),
        edited: new Set(["src/main.ts"]),
      },
      gitStatus: {
        isGitRepository: true,
        branch: "codex/compaction",
        branches: ["codex/compaction"],
        ahead: 1,
        behind: 0,
        dirtyCount: 2,
        counts: { added: 0, modified: 2, deleted: 0, renamed: 0, untracked: 0 },
      },
    });

    expect(summary).toContain("# Ambient Compaction Summary");
    expect(summary).toContain("## Current Workspace State");
    expect(summary).toContain("- README.md");
    expect(summary).toContain("- src/main.ts");
    expect(summary).toContain("- src/App.tsx");
    expect(summary).toContain("Canonical span: user: Need responsive UI.");
    expect(summary).toContain("apiKey=[REDACTED]");
    expect(summary).not.toContain("Continue working toward the active Ambient Desktop thread goal.");
  });

  it("preserves browser session and user-action state for compaction recovery", () => {
    const summary = buildAmbientCompactionSummary({
      thread,
      visibleMessages: [message("u1", "user", "Read the reddit result after I solve the CAPTCHA.")],
      browserState: {
        running: true,
        runtime: "chrome",
        profileMode: "copied",
        internalAvailable: true,
        copiedProfileAvailable: true,
        chromeAvailable: true,
        browserLoginBrokerAvailable: true,
        sessionId: "chrome-session",
        attachedToExistingSession: true,
        activeTab: { title: "Reddit", url: "https://www.reddit.com/r/books/" },
        lastSessionEvent: {
          action: "preserved",
          reason: "switch-runtime",
          at: "2026-05-01T00:00:00.000Z",
          profileMode: "copied",
          sessionId: "chrome-session",
        },
        userAction: {
          id: "captcha-1",
          active: true,
          status: "waiting",
          kind: "captcha",
          provider: "recaptcha",
          toolName: "browser_content",
          runtime: "chrome",
          profileMode: "copied",
          message: "Complete the CAPTCHA in the browser.",
          startedAt: "2026-05-01T00:00:00.000Z",
          lastCheckedAt: "2026-05-01T00:00:01.000Z",
          canAutoResume: true,
        },
      },
    });

    expect(summary).toContain("- Session id: chrome-session (reattached)");
    expect(summary).toContain("- Last session event: preserved (switch-runtime)");
    expect(summary).toContain("- Browser user action: waiting captcha/recaptcha for browser_content.");
    expect(summary).toContain("Reuse this browser session after completion");
  });

  it("builds an explicit lossy recovery summary from visible messages", () => {
    const summary = buildVisibleTranscriptRecoverySummary({
      thread,
      reason: "Missing session file",
      visibleMessages: [message("u1", "user", "Continue the work"), message("a1", "assistant", "I changed src/App.tsx")],
    });

    expect(summary).toContain("lossy recovery summary");
    expect(summary).toContain("Missing session file");
    expect(summary).toContain("- Historical permission mode at recovery time, diagnostic only:");
    expect(summary).toContain("Current Desktop thread settings take precedence");
    expect(summary).toContain("user: Continue the work");
    expect(summary).toContain("assistant: I changed src/App.tsx");
  });

  it("preserves recent conversation turns in full during visible transcript recovery", () => {
    const longAssistant =
      `${"Progress detail. ".repeat(80)}` +
      "Bottom line: make the fixes I mentioned, use a meaningful validation set of 10,000 items, and do not bias toward Dickens alone.";
    const visibleMessages: ChatMessage[] = [
      ...Array.from({ length: 9 }, (_, index) => [
        message(`u${index}`, "user", `Earlier prompt ${index}`),
        message(`a${index}`, "assistant", `Earlier answer ${index}`),
      ]).flat(),
      message("u9", "user", "Ok. Please make the fixes you mention, and then I think we want to run training."),
      message("a9", "assistant", longAssistant),
      ...Array.from({ length: 35 }, (_, index) =>
        message(`t${index}`, "tool", `Tool output ${index}: ${"payload ".repeat(120)}tail-${index}`),
      ),
    ];

    const summary = buildVisibleTranscriptRecoverySummary({
      thread,
      reason: "Missing session file",
      visibleMessages,
    });

    expect(summary).toContain(`assistant: ${longAssistant}`);
    expect(summary).toContain("user: Ok. Please make the fixes you mention");
  });

  it("uses bounded head-tail snippets for older transcript entries and tool output", () => {
    const oldAssistant = `OLD_HEAD ${"middle ".repeat(120)}OLD_TAIL`;
    const recentAssistant = `RECENT_HEAD ${"middle ".repeat(120)}RECENT_TAIL`;
    const toolOutput = `TOOL_HEAD ${"payload ".repeat(120)}TOOL_TAIL`;
    const visibleMessages: ChatMessage[] = [
      message("u0", "user", "Old prompt"),
      message("a0", "assistant", oldAssistant),
      ...Array.from({ length: 10 }, (_, index) => [
        message(`u${index + 1}`, "user", `Recent prompt ${index}`),
        message(`a${index + 1}`, "assistant", index === 9 ? recentAssistant : `Recent answer ${index}`),
      ]).flat(),
      message("t1", "tool", toolOutput),
    ];

    const summary = buildVisibleTranscriptRecoverySummary({
      thread,
      reason: "Missing session file",
      visibleMessages,
    });

    expect(summary).not.toContain(`assistant: ${oldAssistant}`);
    expect(summary).toContain("OLD_HEAD");
    expect(summary).toContain("OLD_TAIL");
    expect(summary).toContain(`assistant: ${recentAssistant}`);
    expect(summary).not.toContain(`tool: ${toolOutput}`);
    expect(summary).toContain("TOOL_HEAD");
    expect(summary).toContain("TOOL_TAIL");
  });

  it("bounds oversized recent conversation entries during visible transcript recovery", () => {
    const hugeAssistant = `HUGE_HEAD ${"middle ".repeat(3_000)}HUGE_TAIL`;
    const summary = buildVisibleTranscriptRecoverySummary({
      thread,
      reason: "Missing session file",
      visibleMessages: [message("u1", "user", "Continue the work"), message("a1", "assistant", hugeAssistant)],
    });

    expect(summary).not.toContain(`assistant: ${hugeAssistant}`);
    expect(summary).toContain("HUGE_HEAD");
    expect(summary).toContain("HUGE_TAIL");
  });

  it("selects the manual visible transcript recovery reason", () => {
    expect(visibleTranscriptRecoveryReason({
      requestedReason: "User requested recovery.",
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
    })).toBe("User requested recovery.");
    expect(visibleTranscriptRecoveryReason({
      threadSessionFile: null,
      restorableSessionFile: undefined,
    })).toBe("No Pi session file was recorded for this chat, so Ambient rebuilt model context from the visible transcript.");
    expect(visibleTranscriptRecoveryReason({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
    })).toBe("The previous Pi session file exists but could not be read.");
    expect(visibleTranscriptRecoveryReason({
      threadSessionFile: "/sessions/thread/missing.jsonl",
      restorableSessionFile: undefined,
    })).toBe("The previous Pi session file is missing or outside the thread session directory.");
  });

  it("plans manual recovery when the previous Pi session is readable", () => {
    expect(visibleTranscriptRecoveryRestorableSessionPlan({
      hasRecoveryMessage: true,
    })).toEqual({
      kind: "already-recovered",
      snapshotMessage: "Model context was already rebuilt from the visible transcript.",
    });

    const normalCompactionPlan = visibleTranscriptRecoveryRestorableSessionPlan({
      hasRecoveryMessage: false,
    });
    expect(normalCompactionPlan).toEqual({
      kind: "normal-compaction-required",
      errorMessage: "This chat's Pi session file is available. Use normal compaction instead of lossy recovery.",
    });
    expect(normalCompactionPlan.kind).toBe("normal-compaction-required");
    if (normalCompactionPlan.kind !== "normal-compaction-required") throw new Error("Expected normal compaction plan.");
    expect(isVisibleTranscriptRecoveryNormalCompactionRequiredError(normalCompactionPlan.errorMessage)).toBe(true);
    expect(isVisibleTranscriptRecoveryNormalCompactionRequiredError("The previous Pi session file exists but could not be read.")).toBe(false);
  });

  it("builds unavailable context messages for visible transcript recovery", () => {
    expect(visibleTranscriptRecoveryUnavailableContextMessages({ kind: "missing-or-unreadable" })).toEqual({
      snapshotMessage:
        "Model context is not available for this chat because the Pi session file is missing or unreadable. The visible transcript is still available.",
      errorMessage:
        "Model context is not available for this chat because the Pi session file is missing or unreadable. Start a new chat for exact continuity, or rebuild context from the visible transcript in a recovery flow.",
    });
    expect(visibleTranscriptRecoveryUnavailableContextMessages({
      kind: "unreadable",
      sessionErrorMessage: "Unexpected token",
    })).toEqual({
      snapshotMessage: "Model context is not available for this chat because the Pi session file is unreadable: Unexpected token",
      errorMessage:
        "Model context is not available for this chat because the Pi session file is unreadable. Start a new chat for exact continuity, or rebuild context from the visible transcript in a recovery flow.",
    });
  });

  it("filters provider retry diagnostics from visible transcript recovery summaries", () => {
    const summary = buildVisibleTranscriptRecoverySummary({
      thread,
      reason: "Provider continuation recovery",
      visibleMessages: [
        message("u1", "user", "Please keep building"),
        message("a1", "assistant", "Ambient/Pi stream stalled before assistant output.", { retryingStreamStall: true }),
        message("a2", "assistant", "I"),
        message("s1", "system", "Model context was rebuilt from the visible transcript.", { runtime: "ambient-recovery" }),
        message("a3", "assistant", "Ambient/Pi provider stream was interrupted.", {
          providerInterruptionContinuation: true,
          piStreamInterruption: { retryScheduled: true },
        }),
        message("a4", "assistant", "Created index.html and verified the page loads."),
      ],
    });

    expect(summary).toContain("user: Please keep building");
    expect(summary).toContain("assistant: Created index.html and verified the page loads.");
    expect(summary).not.toContain("stream stalled");
    expect(summary).not.toContain("provider stream was interrupted");
    expect(summary).not.toContain("assistant: I");
    expect(summary).not.toContain("ambient-recovery");
  });

  it("selects visible transcript messages for session recovery seeding", () => {
    const blankAssistant = message("a0", "assistant", "   ");
    const toolWithoutContent = message("t1", "tool", "");
    const assistant = message("a1", "assistant", "Created the app.");
    const trailingUser = message("u1", "user", "Continue.");
    const hiddenGoalAnchor = message("hidden", "user", "Continue working toward the active Ambient Desktop thread goal.", {
      runtime: "ambient-internal",
      kind: "hidden-user-message",
      hiddenFromTranscript: true,
      hiddenUserMessage: true,
    });

    expect(selectVisibleTranscriptRecoveryMessages([
      hiddenGoalAnchor,
      blankAssistant,
      toolWithoutContent,
      assistant,
      trailingUser,
    ])).toEqual({
      visibleTranscriptMessages: [toolWithoutContent, assistant, trailingUser],
      recoveryTranscriptMessages: [toolWithoutContent, assistant],
    });

    expect(selectVisibleTranscriptRecoveryMessages([
      blankAssistant,
      message("u2", "user", "Earlier prompt."),
      assistant,
    ])).toEqual({
      visibleTranscriptMessages: [message("u2", "user", "Earlier prompt."), assistant],
      recoveryTranscriptMessages: [message("u2", "user", "Earlier prompt."), assistant],
    });

    expect(visibleTranscriptRecoverySessionTranscriptContext([
      hiddenGoalAnchor,
      blankAssistant,
      toolWithoutContent,
      assistant,
      trailingUser,
    ])).toEqual({
      visibleTranscriptMessages: [toolWithoutContent, assistant, trailingUser],
      recoveryTranscriptMessages: [toolWithoutContent, assistant],
      hasVisibleTranscript: true,
    });

    expect(visibleTranscriptRecoverySessionTranscriptContext([hiddenGoalAnchor])).toEqual({
      visibleTranscriptMessages: [],
      recoveryTranscriptMessages: [],
      hasVisibleTranscript: false,
    });

    expect(visibleTranscriptRecoverySessionTranscriptContext([blankAssistant])).toEqual({
      visibleTranscriptMessages: [],
      recoveryTranscriptMessages: [],
      hasVisibleTranscript: true,
    });

    expect(visibleTranscriptRecoverySessionTranscriptContext([])).toEqual({
      visibleTranscriptMessages: [],
      recoveryTranscriptMessages: [],
      hasVisibleTranscript: false,
    });
  });

  it("decides when visible transcript recovery should seed a fresh session", () => {
    const assistant = message("a1", "assistant", "Created the app.");
    const user = message("u1", "user", "Continue.");
    const system = message("s1", "system", "Sub-agent reserved: Explorer");
    const tool = message("t1", "tool", "read completed");

    expect(hasSeedableVisibleTranscriptRecoveryMessages([user])).toBe(false);
    expect(hasSeedableVisibleTranscriptRecoveryMessages([system])).toBe(false);
    expect(hasSeedableVisibleTranscriptRecoveryMessages([system, user])).toBe(false);
    expect(hasSeedableVisibleTranscriptRecoveryMessages([user, assistant])).toBe(true);
    expect(hasSeedableVisibleTranscriptRecoveryMessages([user, tool])).toBe(true);

    expect(visibleTranscriptRecoverySessionSeedDecision({
      threadSessionFile: undefined,
      restorableSessionFile: undefined,
      hasRecovery: false,
      recoveryTranscriptMessages: [assistant],
    })).toEqual({
      forceFreshSessionForRecovery: false,
      shouldSeedVisibleTranscript: true,
    });

    expect(visibleTranscriptRecoverySessionSeedDecision({
      threadSessionFile: undefined,
      restorableSessionFile: undefined,
      hasRecovery: false,
      recoveryTranscriptMessages: [system],
    })).toEqual({
      forceFreshSessionForRecovery: false,
      shouldSeedVisibleTranscript: false,
    });

    expect(visibleTranscriptRecoverySessionSeedDecision({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      hasRecovery: true,
      recoveryTranscriptMessages: [assistant],
    })).toEqual({
      forceFreshSessionForRecovery: true,
      shouldSeedVisibleTranscript: true,
    });

    expect(visibleTranscriptRecoverySessionSeedDecision({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      hasRecovery: false,
      recoveryTranscriptMessages: [assistant],
    })).toEqual({
      forceFreshSessionForRecovery: false,
      shouldSeedVisibleTranscript: false,
    });

    expect(visibleTranscriptRecoverySessionSeedDecision({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
      hasRecovery: true,
      recoveryTranscriptMessages: [assistant],
    })).toEqual({
      forceFreshSessionForRecovery: false,
      shouldSeedVisibleTranscript: false,
    });
  });

  it("plans missing Pi session file handling for visible transcript recovery", () => {
    expect(visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: undefined,
      restorableSessionFile: undefined,
      forceFreshSessionForRecovery: false,
      hasVisibleTranscript: true,
    })).toEqual({ kind: "unchanged" });

    expect(visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
      forceFreshSessionForRecovery: false,
      hasVisibleTranscript: true,
    })).toEqual({ kind: "unchanged" });

    expect(visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      forceFreshSessionForRecovery: true,
      hasVisibleTranscript: true,
    })).toEqual({ kind: "clear-thread-session-file" });

    expect(visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      forceFreshSessionForRecovery: false,
      hasVisibleTranscript: false,
    })).toEqual({ kind: "clear-thread-session-file" });

    expect(visibleTranscriptRecoveryMissingSessionPlan({
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      forceFreshSessionForRecovery: false,
      hasVisibleTranscript: true,
    })).toEqual({
      kind: "unavailable-context",
      unavailableContextKind: "missing-or-unreadable",
    });
  });

  it("plans visible transcript recovery session open failures", () => {
    const assistant = message("a1", "assistant", "Created the app.");
    const user = message("u1", "user", "Continue.");

    expect(visibleTranscriptRecoverySessionOpenFailurePlan({
      hasRecovery: false,
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
      recoveryTranscriptMessages: [assistant],
    })).toEqual({ kind: "unavailable" });

    expect(visibleTranscriptRecoverySessionOpenFailurePlan({
      hasRecovery: true,
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: undefined,
      recoveryTranscriptMessages: [assistant],
    })).toEqual({ kind: "unavailable" });

    expect(visibleTranscriptRecoverySessionOpenFailurePlan({
      hasRecovery: true,
      threadSessionFile: "/sessions/thread/session.jsonl",
      restorableSessionFile: "/sessions/thread/session.jsonl",
      recoveryTranscriptMessages: [assistant],
    })).toEqual({
      kind: "recoverable",
      shouldClearThreadSessionFile: true,
      shouldSeedVisibleTranscript: true,
    });

    expect(visibleTranscriptRecoverySessionOpenFailurePlan({
      hasRecovery: true,
      threadSessionFile: "/sessions/thread/current.jsonl",
      restorableSessionFile: "/sessions/thread/recovery.jsonl",
      recoveryTranscriptMessages: [user],
    })).toEqual({
      kind: "recoverable",
      shouldClearThreadSessionFile: false,
      shouldSeedVisibleTranscript: false,
    });
  });

  it("plans unavailable context for unrecoverable session open failures", () => {
    expect(visibleTranscriptRecoverySessionOpenUnavailablePlan({
      hasVisibleTranscript: false,
      sessionErrorMessage: "Unexpected token",
    })).toEqual({ kind: "clear-thread-session-file" });

    expect(visibleTranscriptRecoverySessionOpenUnavailablePlan({
      hasVisibleTranscript: true,
      sessionErrorMessage: "Unexpected token",
    })).toEqual({
      kind: "unavailable-context",
      unavailableContext: {
        snapshotMessage: "Model context is not available for this chat because the Pi session file is unreadable: Unexpected token",
        errorMessage:
          "Model context is not available for this chat because the Pi session file is unreadable. Start a new chat for exact continuity, or rebuild context from the visible transcript in a recovery flow.",
      },
    });
  });

  it("identifies persisted visible transcript recovery system messages", () => {
    expect(isVisibleTranscriptRecoveryMessage(
      message("s1", "system", "Recovered", { runtime: "ambient-recovery", lossy: true }),
    )).toBe(true);
    expect(isVisibleTranscriptRecoveryMessage(
      message("s2", "system", "Recovered", { runtime: "ambient-recovery", lossy: false }),
    )).toBe(false);
    expect(isVisibleTranscriptRecoveryMessage(
      message("a1", "assistant", "Recovered", { runtime: "ambient-recovery", lossy: true }),
    )).toBe(false);
    expect(isVisibleTranscriptRecoveryMessage(
      message("s3", "system", "Other", { runtime: "pi", lossy: true }),
    )).toBe(false);
    expect(hasVisibleTranscriptRecoveryMessage([
      message("u1", "user", "Continue"),
      message("s1", "system", "Recovered", { runtime: "ambient-recovery", lossy: true }),
    ])).toBe(true);
  });

  it("builds visible transcript recovery Pi and system messages", () => {
    expect(visibleTranscriptRecoveryCustomMessage({
      content: "# Ambient Visible Transcript Recovery",
      reason: "Missing session file",
      recoveredAt: "2026-05-01T00:00:00.000Z",
    })).toEqual({
      customType: "ambient-visible-transcript-recovery",
      content: "# Ambient Visible Transcript Recovery",
      display: true,
      details: {
        lossy: true,
        recoveredAt: "2026-05-01T00:00:00.000Z",
        reason: "Missing session file",
        source: "ambient-desktop",
      },
    });
    expect(visibleTranscriptRecoverySystemMessage("thread-1")).toEqual({
      threadId: "thread-1",
      role: "system",
      content:
        "Model context was rebuilt from the visible transcript. This recovery is lossy; hidden tool state and exact prior model context were not available.",
      metadata: { status: "done", runtime: "ambient-recovery", lossy: true },
    });
  });

  it("preserves session recovery metadata in visible transcript recovery messages", () => {
    const manualMessages = visibleTranscriptRecoveryManualMessages({
      thread,
      visibleMessages: [message("u1", "user", "Continue the work")],
      reason: "Missing session file",
      recoveredAt: "2026-05-01T00:00:00.000Z",
      includeSystemMessage: true,
    });

    expect(manualMessages.customMessage).toMatchObject({
      customType: "ambient-visible-transcript-recovery",
      display: true,
      details: {
        lossy: true,
        recoveredAt: "2026-05-01T00:00:00.000Z",
        reason: "Missing session file",
        source: "ambient-desktop",
      },
    });
    expect(manualMessages.customMessage.content).toContain("Missing session file");
    expect(manualMessages.customMessage.content).toContain("user: Continue the work");
    expect(manualMessages.systemMessage).toEqual(visibleTranscriptRecoverySystemMessage("thread-1"));
    expect(visibleTranscriptRecoveryManualMessages({
      thread,
      visibleMessages: [message("u1", "user", "Continue the work")],
      reason: "Missing session file",
      recoveredAt: "2026-05-01T00:00:00.000Z",
      includeSystemMessage: false,
    }).systemMessage).toBeUndefined();

    const summaryMessage = visibleTranscriptRecoverySummaryCustomMessage({
      thread,
      visibleMessages: [message("u1", "user", "Continue the build")],
      reason: "Provider interrupted.",
      summaryReason: "Provider interrupted. Recovery kind: provider_interruption_continuation.",
      recoveredAt: "2026-05-01T00:00:00.000Z",
      extraDetails: {
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: false,
      },
    });

    expect(summaryMessage).toMatchObject({
      customType: "ambient-visible-transcript-recovery",
      display: true,
      details: {
        lossy: true,
        recoveredAt: "2026-05-01T00:00:00.000Z",
        reason: "Provider interrupted.",
        source: "ambient-desktop",
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: false,
      },
    });
    expect(summaryMessage.content).toContain("Recovery kind: provider_interruption_continuation.");
    expect(summaryMessage.content).toContain("user: Continue the build");

    expect(visibleTranscriptRecoveryCustomMessage({
      content: "# Ambient Visible Transcript Recovery",
      reason: "Provider interrupted.",
      recoveredAt: "2026-05-01T00:00:00.000Z",
      extraDetails: {
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: false,
        providerContinuationStateId: "state-1",
      },
    })).toEqual({
      customType: "ambient-visible-transcript-recovery",
      content: "# Ambient Visible Transcript Recovery",
      display: true,
      details: {
        lossy: true,
        recoveredAt: "2026-05-01T00:00:00.000Z",
        reason: "Provider interrupted.",
        source: "ambient-desktop",
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: false,
        providerContinuationStateId: "state-1",
      },
    });
    expect(visibleTranscriptRecoverySystemMessage("thread-1", {
      reason: "Provider interrupted.",
      recoveryDetails: "Recovery kind: provider_interruption_continuation.",
      metadata: {
        recoveryKind: "provider_interruption_continuation",
        previousPiSessionFileExists: false,
        providerContinuationStateId: "state-1",
      },
    })).toEqual({
      threadId: "thread-1",
      role: "system",
      content:
        "Model context was rebuilt from the visible transcript. Provider interrupted. Recovery kind: provider_interruption_continuation. This recovery is lossy; hidden tool state and exact prior model context were not available.",
      metadata: {
        status: "done",
        runtime: "ambient-recovery",
        lossy: true,
        recoveryKind: "provider_interruption_continuation",
        previousPiSessionFileExists: false,
        providerContinuationStateId: "state-1",
      },
    });
  });

  it("builds session recovery seed details for visible transcript recovery", () => {
    expect(buildVisibleTranscriptRecoverySessionSeed({
      fallbackReason: "No Pi session file was recorded.",
    })).toEqual({
      reason: "No Pi session file was recorded.",
      summaryReason: "No Pi session file was recorded.",
      customMessageExtraDetails: undefined,
      systemMessageOptions: {
        reason: "No Pi session file was recorded.",
        recoveryDetails: undefined,
        metadata: undefined,
      },
    });

    expect(buildVisibleTranscriptRecoverySessionSeed({
      fallbackReason: "No Pi session file was recorded.",
      recovery: {
        kind: "provider_interruption_continuation",
        reason: "Provider interrupted.",
        previousSessionFile: "/tmp/session.jsonl",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
    })).toEqual({
      reason: "Provider interrupted.",
      summaryReason:
        "Provider interrupted. Recovery kind: provider_interruption_continuation. Previous Pi session file: unavailable for replay during this recovery; rebuilding from visible transcript. Provider continuation state: state-1.",
      customMessageExtraDetails: {
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
      systemMessageOptions: {
        reason: "Provider interrupted.",
        recoveryDetails:
          "Recovery kind: provider_interruption_continuation. Previous Pi session file: unavailable for replay during this recovery; rebuilding from visible transcript. Provider continuation state: state-1.",
        metadata: {
          recoveryKind: "provider_interruption_continuation",
          previousPiSessionFileExists: true,
          providerContinuationStateId: "state-1",
        },
      },
    });

    const seedMessages = visibleTranscriptRecoverySessionSeedMessages({
      thread,
      visibleMessages: [message("u1", "user", "Continue the build")],
      recoveredAt: "2026-05-01T00:00:00.000Z",
      fallbackReason: "No Pi session file was recorded.",
      recovery: {
        kind: "provider_interruption_continuation",
        reason: "Provider interrupted.",
        previousSessionFile: "/tmp/session.jsonl",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
    });

    expect(seedMessages.customMessage).toMatchObject({
      customType: "ambient-visible-transcript-recovery",
      display: true,
      details: {
        lossy: true,
        recoveredAt: "2026-05-01T00:00:00.000Z",
        reason: "Provider interrupted.",
        source: "ambient-desktop",
        recoveryKind: "provider_interruption_continuation",
        previousSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
    });
    expect(seedMessages.customMessage.content).toContain("Recovery kind: provider_interruption_continuation.");
    expect(seedMessages.customMessage.content).toContain("user: Continue the build");
    expect(seedMessages.systemMessage).toEqual({
      threadId: "thread-1",
      role: "system",
      content:
        "Model context was rebuilt from the visible transcript. Provider interrupted. Recovery kind: provider_interruption_continuation. Previous Pi session file: unavailable for replay during this recovery; rebuilding from visible transcript. Provider continuation state: state-1. This recovery is lossy; hidden tool state and exact prior model context were not available.",
      metadata: {
        status: "done",
        runtime: "ambient-recovery",
        lossy: true,
        recoveryKind: "provider_interruption_continuation",
        previousPiSessionFileExists: true,
        providerContinuationStateId: "state-1",
      },
    });

    expect(visibleTranscriptRecoveryDefaultSessionSeedMessages({
      thread,
      visibleMessages: [message("u1", "user", "Continue the build")],
      recoveredAt: "2026-05-01T00:00:00.000Z",
    })).toEqual(visibleTranscriptRecoverySessionSeedMessages({
      thread,
      visibleMessages: [message("u1", "user", "Continue the build")],
      recoveredAt: "2026-05-01T00:00:00.000Z",
      fallbackReason: "No Pi session file was recorded for this chat, so Ambient rebuilt model context from the visible transcript.",
    }));
  });
});

function message(id: string, role: ChatMessage["role"], content: string, metadata?: Record<string, unknown>): ChatMessage {
  return {
    id,
    threadId: thread.id,
    role,
    content,
    createdAt: "2026-05-01T00:00:00.000Z",
    metadata,
  };
}
