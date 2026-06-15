import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../shared/featureFlags";
import { effectiveSubagentRoleSnapshot } from "../shared/subagentPatternGraph";
import { getDefaultSubagentRoleProfile } from "../shared/subagentRoles";
import {
  buildCallableWorkflowRegistry,
  buildCallableWorkflowRunPlan,
  parentPiVisibleCallableWorkflowTools,
} from "./callableWorkflowRegistry";
import { buildCallableWorkflowExecutionPlan } from "./callableWorkflowExecutionPlan";
import { createChatExportBundle } from "./chatExport";
import { ProjectStore } from "./projectStore";

describe("chat export", () => {
  let workspacePath = "";
  let extraPaths: string[] = [];

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-chat-export-"));
    extraPaths = [];
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
    for (const path of extraPaths) await rm(path, { recursive: true, force: true });
  });

  it("exports the full redacted Pi session with the visible transcript", async () => {
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("Debug chat");
      const threadSessionDir = join(workspace.sessionPath, created.id);
      await mkdir(threadSessionDir, { recursive: true });
      const sessionFile = join(threadSessionDir, "session.jsonl");
      const largeTail = `tail-${"x".repeat(300_000)}-end`;
      await writeFile(
        sessionFile,
        `{"type":"session","version":3}\n{"type":"message","message":{"role":"assistant","content":"api_key=ambient-abcdefghijklmnopqrstuvwxyz0123456789 ${largeTail}"}}\n`,
        "utf8",
      );
      const thread = store.updateThreadSettings(created.id, { piSessionFile: sessionFile });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Bearer abcdefghijklmnopqrstuv",
      });
      store.recordContextUsageSnapshot({
        threadId: thread.id,
        source: "estimate",
        tokens: 12,
        contextWindow: 100,
        percent: 12,
        compactionCount: 0,
        diagnostics: { piSessionFile: sessionFile, activeSession: true },
      });

      const payload = await createChatExportBundle(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        now: new Date("2026-05-19T00:00:00.000Z"),
      });
      const zip = await JSZip.loadAsync(payload.archive);

      expect(payload.source).toBe("pi-session");
      expect(payload.fileName).toBe("ambient-chat-export-debug-chat-2026-05-19T00-00-00-000Z.zip");
      const session = await zipText(zip, "pi-session.jsonl");
      expect(session).toContain("tail-");
      expect(session).toContain("-end");
      expect(session).not.toContain("ambient-abcdefghijklmnopqrstuvwxyz0123456789");
      expect(session).toContain("[REDACTED]");

      const transcript = await zipText(zip, "visible-transcript.json");
      expect(transcript).not.toContain("Bearer abcdefghijklmnopqrstuv");
      expect(transcript).toContain("Bearer [REDACTED]");

      const contextUsage = JSON.parse(await zipText(zip, "context-usage.json")) as Record<string, unknown>;
      expect(contextUsage).toMatchObject({ threadId: thread.id, tokens: 12 });

      const manifest = JSON.parse(await zipText(zip, "manifest.json")) as Record<string, any>;
      expect(manifest.export).toMatchObject({
        source: "pi-session",
        originalPiSessionFileExists: true,
      });
      expect(manifest.export.includedFiles).toContain("pi-session.jsonl");
      expect(manifest.redaction.replacementCount).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("falls back to the visible transcript when the recorded Pi session file is missing", async () => {
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const created = store.createThread("Missing session");
      const missingSessionFile = join(workspace.sessionPath, created.id, "missing.jsonl");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: missingSessionFile });
      store.addMessage({ threadId: thread.id, role: "assistant", content: "Visible answer" });

      const payload = await createChatExportBundle(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        now: new Date("2026-05-19T00:00:00.000Z"),
      });
      const zip = await JSZip.loadAsync(payload.archive);

      expect(payload.source).toBe("visible-chat-fallback");
      expect(payload.fallbackReason).toContain("missing");
      expect(zip.file("pi-session.jsonl")).toBeNull();
      expect(await zipText(zip, "visible-transcript.md")).toContain("Visible answer");
      expect(store.getThread(thread.id).piSessionFile).toBe(missingSessionFile);

      const manifest = JSON.parse(await zipText(zip, "manifest.json")) as Record<string, any>;
      expect(manifest.export).toMatchObject({
        source: "visible-chat-fallback",
        originalPiSessionFileExists: false,
      });
      expect(manifest.export.fallbackReason).toContain("missing");
    } finally {
      store.close();
    }
  });

  it("exports a clean visible transcript with typed tool artifacts", async () => {
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.createThread("Mixed transcript");
      store.addMessage({ threadId: thread.id, role: "user", content: "Ask the local model." });
      store.addMessage({ threadId: thread.id, role: "assistant", content: "", metadata: { status: "done" } });
      store.addMessage({ threadId: thread.id, role: "assistant", content: "Inspecting route.", metadata: { kind: "thinking", status: "done" } });
      store.addMessage({ threadId: thread.id, role: "assistant", content: "I will delegate this." });
      store.addMessage({
        threadId: thread.id,
        role: "tool",
        content: "ambient_cli completed\n\nResult:\nDelegated model response stored.",
        metadata: {
          status: "done",
          toolName: "ambient_cli",
          toolCallId: "call-model",
          toolResultDetails: {
            largeOutputPreview: {
              kind: "large-output",
              summary: "stdout · 42 chars · full output: .ambient/tool-outputs/model.txt",
              items: [{
                label: "stdout",
                chars: 42,
                previewChars: 42,
                truncated: false,
                artifactKind: "stdout",
                artifactPath: ".ambient/tool-outputs/model.txt",
                artifactBytes: 42,
              }],
            },
            externalModelResponse: {
              kind: "external-model-response",
              label: "delegated local model",
              verbatim: true,
              chars: 42,
              previewChars: 42,
              truncated: false,
              artifactPath: ".ambient/tool-outputs/model.txt",
              artifactBytes: 42,
              model: "local-test-model",
              usage: { outputTokens: 9 },
            },
          },
        },
      });

      const payload = await createChatExportBundle(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        now: new Date("2026-05-19T00:00:00.000Z"),
      });
      const zip = await JSZip.loadAsync(payload.archive);
      const visible = JSON.parse(await zipText(zip, "visible-transcript.json")) as Record<string, any>;
      const artifacts = JSON.parse(await zipText(zip, "artifacts.json")) as Record<string, any>;
      const markdown = await zipText(zip, "visible-transcript.md");

      expect(visible.messages.map((message: any) => message.content)).toEqual([
        "Ask the local model.",
        "I will delegate this.",
        "ambient_cli completed\n\nResult:\nDelegated model response stored.",
      ]);
      expect(visible.exportStats).toMatchObject({
        hiddenThinkingMessageCount: 1,
        hiddenEmptyAssistantMessageCount: 1,
        artifactCount: 2,
      });
      expect(visible.messages.some((message: any) => message.metadata?.kind === "thinking")).toBe(false);
      expect(visible.messages.some((message: any) => message.role === "assistant" && !message.content.trim())).toBe(false);
      expect(artifacts.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "stdout",
          artifactPath: ".ambient/tool-outputs/model.txt",
          toolName: "ambient_cli",
        }),
        expect.objectContaining({
          kind: "external-model-response",
          artifactPath: ".ambient/tool-outputs/model.txt",
          verbatim: true,
          model: "local-test-model",
          usage: { outputTokens: 9 },
        }),
      ]));
      expect(markdown).not.toContain("Inspecting route.");
      expect(markdown).toContain("external-model-response: delegated local model");
    } finally {
      store.close();
    }
  });

  it("includes direct sub-agent child transcripts and runtime evidence", async () => {
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent with child threads");
      const parentMessage = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "Launching a reader child.",
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: parentMessage.id });
      const featureFlagSnapshot = enabledSubagentFeatureFlags();
      const task = store.enqueueCallableWorkflowTask({
        executionPlan: executionPlanForParent(parent.id, parentRun.id, parentMessage.id, featureFlagSnapshot),
        featureFlagSnapshot,
      });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: parentMessage.id,
        title: "Reader child",
        roleId: "explorer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("explorer"),
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-05-19T00:00:00.000Z"),
        dependencyMode: "required",
        effectiveRoleSnapshot: effectiveSubagentRoleSnapshot({
          baseRole: "explorer",
          patternRole: "mapper",
          overlayLabels: ["Read-only source slice"],
          outputContract: "Return extracted evidence for the reducer.",
        }),
      });
      const boundTask = store.bindCallableWorkflowTaskPatternGraphChild({
        workflowTaskId: task.id,
        roleNodeId: "mapper",
        childRunId: run.id,
        label: "Reader child",
        updatedAt: "2026-05-19T00:00:02.500Z",
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "user",
        content: "Read the markdown and summarize it.",
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "assistant",
        content: "CHILD_THINKING_ROUTE api_key=ambient-abcdefghijklmnopqrstuvwxyz0123456789",
        metadata: { kind: "thinking", status: "done" },
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtimeEvent: "assistant_delta" },
      });
      store.addMessage({
        threadId: run.childThreadId,
        role: "assistant",
        content: "Child found the requested text.",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "test.child_progress",
        preview: { summary: "Child transcript is exportable." },
        createdAt: "2026-05-19T00:00:03.000Z",
      });
      store.appendSubagentMailboxEvent(run.id, {
        direction: "child_to_parent",
        type: "subagent.progress",
        payload: { summary: "Reading is underway." },
        deliveryState: "delivered",
        createdAt: "2026-05-19T00:00:04.000Z",
      });
      store.recordSubagentToolScopeSnapshot(run.id, {
        scope: {
          schemaVersion: "ambient-subagent-tool-scope-v1",
          loadedCategories: ["workspace.read", "artifact.read", "long-context.read"],
          piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read"],
          deniedCategories: [{
            id: "workspace.write",
            reason: "Denied by child task intent file_read; read-only child does not need Downloads writes.",
          }],
          loadedTools: [
            { source: "built_in", id: "workspace.read", categoryId: "workspace.read", piVisible: true, mutatesState: false, requiresApproval: false },
            { source: "built_in", id: "long_context_process", categoryId: "long-context.read", piVisible: true, mutatesState: false, requiresApproval: false },
          ],
          piVisibleTools: [
            { source: "built_in", id: "workspace.read", categoryId: "workspace.read", piVisible: true, mutatesState: false, requiresApproval: false },
            { source: "built_in", id: "long_context_process", categoryId: "long-context.read", piVisible: true, mutatesState: false, requiresApproval: false },
          ],
          deniedTools: [{
            source: "built_in",
            id: "workspace.write",
            categoryId: "workspace.write",
            reason: "Read-only child task; parent narrowed mutation rights before launch.",
          }],
          approvalMode: "interactive",
          worktreeIsolated: false,
          fanoutAvailable: false,
        },
        resolverInputs: {
          childAuthority: {
            taskIntent: "file_read",
            readRoots: ["/Users/travis/Downloads"],
            writeRoots: [],
            rationale: "Read and summarize the requested files only.",
          },
        },
        createdAt: "2026-05-19T00:00:04.250Z",
      });
      store.appendSubagentMailboxEvent(run.id, {
        direction: "child_to_parent",
        type: "subagent.approval_requested",
        payload: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          approvalId: "approval-reader-downloads",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          requestedScope: "child_thread",
          action: "workspace.read",
        },
        deliveryState: "queued",
        createdAt: "2026-05-19T00:00:04.300Z",
      });
      store.appendSubagentRunEvent(run.id, {
        type: "subagent.approval_requested",
        preview: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          approvalId: "approval-reader-downloads",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
        },
        createdAt: "2026-05-19T00:00:04.350Z",
      });
      store.appendSubagentParentMailboxEvent({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: parentMessage.id,
        type: "subagent.child_approval_requested",
        payload: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          approvalId: "approval-reader-downloads",
          childRunId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          requestedScope: "child_thread",
          parentBlocking: {
            action: "forward_child_approval_then_wait",
            childRunId: run.id,
          },
        },
        deliveryState: "queued",
        idempotencyKey: "approval-reader-downloads-request",
        createdAt: "2026-05-19T00:00:04.400Z",
      });
      store.upsertSubagentGroupedCompletionNotification({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: parentMessage.id,
        child: {
          runId: run.id,
          childThreadId: run.childThreadId,
          canonicalTaskPath: run.canonicalTaskPath,
          roleId: run.roleId,
          status: "completed",
          summary: "Child found the requested text.",
          completedAt: "2026-05-19T00:00:05.000Z",
        },
        createdAt: "2026-05-19T00:00:05.000Z",
      });
      store.markSubagentRunStatus(run.id, "completed", {
        now: "2026-05-19T00:00:05.500Z",
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: run.id,
          childThreadId: run.childThreadId,
          status: "completed",
          summary: "Child found the requested text.",
          partial: false,
        },
      });
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 60_000,
        createdAt: "2026-05-19T00:00:06.000Z",
      });
      const childSessionDir = join(workspace.sessionPath, run.childThreadId);
      await mkdir(childSessionDir, { recursive: true });
      const childSessionFile = join(childSessionDir, "session.jsonl");
      await writeFile(
        childSessionFile,
        '{"type":"message","message":{"role":"assistant","content":"child session transcript"}}\n',
        "utf8",
      );
      store.updateThreadSettings(run.childThreadId, { piSessionFile: childSessionFile });

      const payload = await createChatExportBundle(store, parent.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        now: new Date("2026-05-19T00:00:00.000Z"),
      });
      const zip = await JSZip.loadAsync(payload.archive);
      const manifest = JSON.parse(await zipText(zip, "manifest.json")) as Record<string, any>;
      const index = JSON.parse(await zipText(zip, "child-threads/index.json")) as Record<string, any>;
      const childDir = index.children[0].dir as string;

      expect(manifest.export).toMatchObject({
        childThreadCount: 1,
        childVisibleMessageCount: 2,
        childHiddenMessageCount: 2,
        childPiSessionCount: 1,
        callableWorkflowTaskCount: 1,
        patternGraphCount: 1,
        patternGraphLinkedChildCount: 1,
      });
      expect(manifest.export.includedFiles).toEqual(expect.arrayContaining([
        "child-threads/index.json",
        "child-threads/evidence-summary.json",
        "child-threads/parent-mailbox-events.json",
        "child-threads/callable-workflow-tasks.json",
        "child-threads/pattern-graphs.json",
        `${childDir}/full-transcript.json`,
        `${childDir}/full-transcript.md`,
        `${childDir}/visible-transcript.md`,
        `${childDir}/pi-session.jsonl`,
        `${childDir}/run-events.json`,
        `${childDir}/mailbox-events.json`,
        `${childDir}/wait-barriers.json`,
      ]));
      expect(index.children[0]).toMatchObject({
        run: { id: run.id, childThreadId: run.childThreadId },
        thread: { id: run.childThreadId, parentThreadId: parent.id },
        piSession: { included: true, originalPiSessionFileExists: true },
      });
      expect(index).toMatchObject({
        callableWorkflowTaskCount: 1,
        patternGraphCount: 1,
        patternGraphLinkedChildCount: 1,
        callableWorkflowTasks: [
          expect.objectContaining({
            id: task.id,
            hasPatternGraph: true,
            toolName: "ambient_workflow_symphony_map_reduce",
          }),
        ],
        patternGraphs: [
          expect.objectContaining({
            workflowTaskId: task.id,
            patternId: "map_reduce",
            childTranscriptLinks: [
              expect.objectContaining({
                nodeId: `mapper:${run.id}`,
                childRunId: run.id,
                childThreadId: run.childThreadId,
                transcriptPath: `${childDir}/visible-transcript.md`,
                exportState: "included",
              }),
            ],
          }),
        ],
      });
      const visibleTranscript = await zipText(zip, `${childDir}/visible-transcript.md`);
      const fullTranscript = await zipText(zip, `${childDir}/full-transcript.md`);
      const fullTranscriptJson = JSON.parse(await zipText(zip, `${childDir}/full-transcript.json`)) as Record<string, any>;
      expect(visibleTranscript).toContain("Child found the requested text.");
      expect(visibleTranscript).not.toContain("CHILD_THINKING_ROUTE");
      expect(fullTranscript).toContain("CHILD_THINKING_ROUTE");
      expect(fullTranscript).toContain("[REDACTED]");
      expect(fullTranscript).not.toContain("ambient-abcdefghijklmnopqrstuvwxyz0123456789");
      expect(fullTranscript).toContain("assistant (thinking)");
      expect(fullTranscript).toContain("Exported source messages: 4");
      expect(fullTranscriptJson.messages).toHaveLength(4);
      expect(fullTranscriptJson.messages.some((message: any) => message.metadata?.kind === "thinking")).toBe(true);
      expect(JSON.stringify(fullTranscriptJson)).not.toContain("ambient-abcdefghijklmnopqrstuvwxyz0123456789");
      expect(await zipText(zip, `${childDir}/pi-session.jsonl`)).toContain("child session transcript");
      expect(await zipText(zip, `${childDir}/run-events.json`)).toContain("test.child_progress");
      expect(await zipText(zip, `${childDir}/mailbox-events.json`)).toContain("Reading is underway.");
      expect(await zipText(zip, `${childDir}/tool-scope-snapshots.json`)).toContain("long_context_process");
      expect(await zipText(zip, `${childDir}/wait-barriers.json`)).toContain("required_all");
      expect(await zipText(zip, "child-threads/parent-mailbox-events.json")).toContain("Child found the requested text.");
      const evidenceSummary = JSON.parse(await zipText(zip, "child-threads/evidence-summary.json")) as Record<string, any>;
      expect(evidenceSummary).toMatchObject({
        childThreadCount: 1,
        approvalBridgeEventCount: 1,
        children: [
          expect.objectContaining({
            runId: run.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            status: "completed",
            files: expect.objectContaining({
              fullTranscriptJson: `${childDir}/full-transcript.json`,
              fullTranscriptMarkdown: `${childDir}/full-transcript.md`,
              visibleTranscriptMarkdown: `${childDir}/visible-transcript.md`,
              toolScopeSnapshots: `${childDir}/tool-scope-snapshots.json`,
              piSession: `${childDir}/pi-session.jsonl`,
            }),
            transcript: expect.objectContaining({
              sourceMessageCount: 4,
              visibleMessageCount: 2,
              hiddenMessageCount: 2,
              hiddenThinkingMessageCount: 1,
              hiddenEmptyAssistantMessageCount: 1,
              piSessionIncluded: true,
            }),
            role: expect.objectContaining({
              roleId: "explorer",
              effectiveRole: expect.objectContaining({
                patternRole: "mapper",
                roleOverlayIds: ["mapper.read-only-source-slice"],
              }),
            }),
            authority: expect.objectContaining({
              toolScopeSnapshotCount: 1,
              latestToolScopeSnapshot: expect.objectContaining({
                approvalMode: "interactive",
                piVisibleCategories: ["workspace.read", "artifact.read", "long-context.read"],
                displayMetadata: expect.objectContaining({
                  deniedCategoryIds: ["workspace.write"],
                  deniedToolIds: ["built_in:workspace.write"],
                }),
              }),
            }),
            approvals: expect.objectContaining({
              childMailboxApprovalEventCount: 1,
              runApprovalEventCount: 1,
              parentApprovalBridgeEventCount: 1,
            }),
            resultArtifact: expect.objectContaining({
              present: true,
              status: "completed",
              summary: "Child found the requested text.",
              partial: false,
            }),
            evidenceGaps: [],
          }),
        ],
      });
      const callableTasks = JSON.parse(await zipText(zip, "child-threads/callable-workflow-tasks.json")) as Record<string, any>;
      expect(callableTasks.tasks[0]).toMatchObject({
        id: boundTask.id,
        patternGraphSnapshot: {
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: `mapper:${run.id}`,
              childRunId: run.id,
              childThreadId: run.childThreadId,
            }),
          ]),
        },
      });
      const patternGraphs = JSON.parse(await zipText(zip, "child-threads/pattern-graphs.json")) as Record<string, any>;
      expect(patternGraphs).toMatchObject({
        patternGraphCount: 1,
        linkedChildCount: 1,
        graphs: [
          expect.objectContaining({
            workflowTaskId: task.id,
            snapshot: expect.objectContaining({ workflowTaskId: task.id, patternId: "map_reduce" }),
            childTranscriptLinks: [
              expect.objectContaining({
                nodeId: `mapper:${run.id}`,
                manifestPath: `${childDir}/manifest.json`,
                transcriptJsonPath: `${childDir}/visible-transcript.json`,
              }),
            ],
          }),
        ],
      });
    } finally {
      store.close();
    }
  });

  it("rejects a recorded Pi session path outside the thread session directory", async () => {
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const outsideDir = await mkdtemp(join(tmpdir(), "ambient-chat-export-outside-"));
      extraPaths.push(outsideDir);
      const outsideSessionFile = join(outsideDir, "session.jsonl");
      await writeFile(outsideSessionFile, '{"type":"session","version":3}\n', "utf8");
      const created = store.createThread("Outside session");
      const thread = store.updateThreadSettings(created.id, { piSessionFile: outsideSessionFile });
      store.addMessage({ threadId: thread.id, role: "user", content: "Visible prompt" });

      const payload = await createChatExportBundle(store, thread.id, {
        appName: "Ambient",
        appVersion: "0.1.0",
        now: new Date("2026-05-19T00:00:00.000Z"),
      });
      const zip = await JSZip.loadAsync(payload.archive);

      expect(payload.source).toBe("visible-chat-fallback");
      expect(payload.fallbackReason).toContain("outside");
      expect(zip.file("pi-session.jsonl")).toBeNull();
      expect(await zipText(zip, "visible-transcript.md")).toContain("Visible prompt");
    } finally {
      store.close();
    }
  });
});

async function zipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  expect(file).toBeTruthy();
  return file!.async("string");
}

function enabledSubagentFeatureFlags(generatedAt = "2026-05-19T00:00:00.000Z") {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt,
  });
}

function executionPlanForParent(
  parentThreadId: string,
  parentRunId: string,
  assistantMessageId: string,
  featureFlagSnapshot = enabledSubagentFeatureFlags(),
) {
  const registry = buildCallableWorkflowRegistry({ featureFlagSnapshot });
  const tool = parentPiVisibleCallableWorkflowTools(registry)
    .find((candidate) => candidate.id === "symphony:map_reduce");
  if (!tool) throw new Error("Map-Reduce callable workflow tool was not registered.");
  const runPlan = buildCallableWorkflowRunPlan(tool, {
    goal: "Read the requested source files and reduce their findings.",
    blocking: true,
    metricCriteria: [{ templateId: "map_reduce-metric", value: "Each child source slice has evidence." }],
  });
  return buildCallableWorkflowExecutionPlan({
    descriptor: tool,
    runPlan,
    parent: {
      threadId: parentThreadId,
      runId: parentRunId,
      assistantMessageId,
    },
    toolCallId: "tool-call-map-reduce-export",
    createdAt: "2026-05-19T00:00:01.000Z",
  });
}
