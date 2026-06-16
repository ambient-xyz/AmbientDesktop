import { describe, expect, it } from "vitest";

import { resolveLocalDeepResearchRunBudget } from "../shared/localDeepResearchBudget";
import type { QueuedMessageSnapshot } from "../shared/messageDelivery";
import type { SendMessageInput } from "../shared/types";
import { agentRuntimeQueuedMessageMetadata, agentRuntimeUserMessageMetadata } from "./agentRuntimeUserMessageMetadata";

describe("agentRuntimeUserMessageMetadata", () => {
  it("returns undefined when no message metadata is present", () => {
    expect(agentRuntimeUserMessageMetadata({})).toBeUndefined();
  });

  it("builds normal user message metadata from send input context", () => {
    expect(agentRuntimeUserMessageMetadata(sendInput())).toEqual({
      context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
      workflowThreadId: "workflow-thread-1",
      workflowMode: "plan-edit",
      workflowRecordingEditContext: {
        id: "workflow-1",
        title: "Nightly Review",
        version: 3,
        manifestPath: ".ambient/workflows/nightly/manifest.json",
        markdownPath: ".ambient/workflows/nightly/workflow.md",
        sidecarPath: ".ambient/workflows/nightly/sidecar.json",
        transcriptPath: ".ambient/workflows/nightly/transcript.jsonl",
      },
      composerIntent: { kind: "local-deep-research", localDeepResearch: resolveLocalDeepResearchRunBudget(undefined) },
      stt: {
        source: "stt",
        utteranceId: "utterance-1",
        threadId: "thread-1",
        status: "ready",
        providerCapabilityId: "ambient-cli:stt",
        providerId: "stt-1",
        language: "en",
        durationMs: 1200,
        artifacts: { transcriptPath: ".ambient/stt/utterance-1.txt" },
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:01.000Z",
      },
    });
  });

  it("adds queued delivery metadata before send input metadata", () => {
    const metadata = agentRuntimeUserMessageMetadata(sendInput(), {
      delivery: "follow-up",
      includeWorkflowRecordingEditContext: false,
    });

    expect(metadata).toMatchObject({
      status: "queued",
      delivery: "follow-up",
      runtime: "pi",
      workflowThreadId: "workflow-thread-1",
      workflowMode: "plan-edit",
    });
    expect(metadata).not.toHaveProperty("workflowRecordingEditContext");
  });

  it("marks workflow recording review messages for dedicated review sessions", () => {
    expect(agentRuntimeUserMessageMetadata({}, {
      dedicatedSessionKind: "workflow-recording-review",
    })).toEqual({
      workflowRecordingReview: true,
      dedicatedSession: "workflow-recording-review",
    });
  });
});

describe("agentRuntimeQueuedMessageMetadata", () => {
  it("builds Pi queued message metadata", () => {
    expect(agentRuntimeQueuedMessageMetadata(queuedMessage("sent"), { status: "sent", runtime: "pi" })).toEqual({
      status: "sent",
      delivery: "steer",
      runtime: "pi",
      context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
      workflowThreadId: "workflow-thread-1",
      workflowMode: "plan-edit",
      stt: sendInput().stt,
    });
  });

  it("builds local-text queued message error metadata", () => {
    expect(agentRuntimeQueuedMessageMetadata(queuedMessage(), {
      status: "error",
      runtime: "local_text",
      error: "Queued steering is not supported.",
    })).toEqual({
      status: "error",
      delivery: "steer",
      runtime: "local_text",
      error: "Queued steering is not supported.",
      context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
      workflowThreadId: "workflow-thread-1",
      workflowMode: "plan-edit",
      stt: sendInput().stt,
    });
  });
});

function sendInput(): Pick<
  SendMessageInput,
  "context" | "workflowThreadId" | "workflowRecordingEditContext" | "composerIntent" | "stt"
> {
  return {
    context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
    workflowThreadId: "workflow-thread-1",
    workflowRecordingEditContext: {
      id: "workflow-1",
      title: "Nightly Review",
      version: 3,
      manifestPath: ".ambient/workflows/nightly/manifest.json",
      markdownPath: ".ambient/workflows/nightly/workflow.md",
      sidecarPath: ".ambient/workflows/nightly/sidecar.json",
      transcriptPath: ".ambient/workflows/nightly/transcript.jsonl",
    },
    composerIntent: { kind: "local-deep-research", localDeepResearch: resolveLocalDeepResearchRunBudget(undefined) },
    stt: {
      source: "stt",
      utteranceId: "utterance-1",
      threadId: "thread-1",
      status: "ready",
      providerCapabilityId: "ambient-cli:stt",
      providerId: "stt-1",
      language: "en",
      durationMs: 1200,
      artifacts: { transcriptPath: ".ambient/stt/utterance-1.txt" },
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:01.000Z",
    },
  };
}

function queuedMessage(status: QueuedMessageSnapshot["status"] = "queued"): QueuedMessageSnapshot {
  return {
    id: "queued-message-1",
    content: "queued content",
    modelContent: "queued model content",
    context: [{ kind: "file", path: "/workspace/notes.md", name: "notes.md" }],
    workflowThreadId: "workflow-thread-1",
    stt: sendInput().stt,
    delivery: "steer",
    status,
  };
}
