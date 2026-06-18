import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import {
  archiveAmbientWorkflowPlaybook,
  describeAmbientWorkflowPlaybook,
  searchAmbientWorkflowPlaybooks,
  updateAmbientWorkflowPlaybook,
} from "./workflowAmbientPlaybookFacade";
import {
  isRetryableAmbientProviderError,
  liveAmbientDirectHelperProfile,
  liveAmbientProviderBaseUrl,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./workflowAmbientFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { callWorkflowPiText, type WorkflowPiToolProgress } from "./workflowPiTransport";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const runLive = process.env.AMBIENT_WORKFLOW_PLAYBOOK_MANAGEMENT_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describeNative("workflow playbook management live GMI smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-playbook-management-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  liveIt("uses live Pi tools to update and archive a saved playbook", async () => {
    const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Workflow Playbook management smoke" });
    const thread = store.createWorkflowRecordingThread({
      goal: "Find date night theatre options in Scottsdale.",
      workspacePath,
    });
    store.addMessage({ threadId: thread.id, role: "user", content: "Find Scottsdale theatre events for date night." });
    store.addMessage({
      threadId: thread.id,
      role: "tool",
      content: "browser_search completed\nFound venue pages and ticket links.",
      metadata: { toolName: "browser_search", toolCallId: "search-1", status: "done" },
    });
    store.addMessage({
      threadId: thread.id,
      role: "assistant",
      content: "Rank current venue pages, dates, ticket links, and romantic fit.",
      metadata: { status: "done" },
    });
    store.stopWorkflowRecording(thread.id);
    store.updateWorkflowRecordingReviewDraft(thread.id, {
      intent: "Find Scottsdale theatre options for a date night.",
      inputs: ["Location", "Date window", "Date-night fit criteria"],
      successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theatre date night", resultPreview: "Venue pages and ticket links." }],
      doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid stale or blocked venue pages." }],
      validation: ["Final answer ranks current source-backed theatre options."],
      outputShape: ["Ranked theatre shortlist with dates, booking links, and fit rationale."],
    });
    const saved = store.confirmWorkflowRecordingReview(thread.id).review!.savedPlaybook!;

    const toolCalls: string[] = [];
    const toolProgress: WorkflowPiToolProgress[] = [];
    await callForcedWorkflowManagementTool(apiKey, "ambient_workflows_describe", [
      "Call ambient_workflows_describe exactly once for this saved workflow playbook.",
      `Workflow id: ${saved.id}`,
      "Return JSON only after the tool result.",
    ].join("\n"), toolCalls, toolProgress, async (_toolCall, args) => {
      const input = objectValue(args);
      const result = describeAmbientWorkflowPlaybook(store, { id: requiredString(input.id) });
      return JSON.stringify({ id: result.id, version: result.version, title: result.title, summary: result.summary });
    });

    await callForcedWorkflowManagementTool(apiKey, "ambient_workflows_update", [
      "Call ambient_workflows_update exactly once for this saved workflow playbook.",
      `Workflow id: ${saved.id}`,
      "Use baseVersion 1.",
      "Set draft.intent exactly to \"Find polished Scottsdale theatre date-night options.\"",
      "Return JSON only after the tool result.",
    ].join("\n"), toolCalls, toolProgress, async (_toolCall, args) => {
      const input = objectValue(args);
      const result = updateAmbientWorkflowPlaybook(store, {
        id: requiredString(input.id),
        baseVersion: requiredNumber(input.baseVersion),
        draft: {
          intent: "Find polished Scottsdale theatre date-night options.",
          inputs: ["Location", "Date window", "Date-night fit criteria"],
          successfulExamples: [{ toolName: "browser_search", inputPreview: "Scottsdale theatre date night", resultPreview: "Venue pages and ticket links." }],
          doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid stale or blocked venue pages." }],
          validation: ["Final answer ranks current source-backed theatre options."],
          outputShape: ["Ranked theatre shortlist with dates, booking links, and fit rationale."],
        },
      });
      return JSON.stringify({ id: result.id, version: result.version, intent: result.playbook?.intent });
    });

    await callForcedWorkflowManagementTool(apiKey, "ambient_workflows_archive", [
      "Call ambient_workflows_archive exactly once for this saved workflow playbook.",
      `Workflow id: ${saved.id}`,
      "Use baseVersion 2.",
      "Use reason exactly \"Live management smoke archive.\"",
      "Return JSON only after the tool result.",
    ].join("\n"), toolCalls, toolProgress, async (_toolCall, args) => {
      const input = objectValue(args);
      const result = archiveAmbientWorkflowPlaybook(store, {
        id: requiredString(input.id),
        baseVersion: requiredNumber(input.baseVersion),
        reason: requiredString(input.reason),
      });
      return JSON.stringify({ id: result.id, version: result.version, archivedAt: result.archivedAt, archivedReason: result.archivedReason });
    });

    expect(toolCalls).toEqual(expect.arrayContaining(["ambient_workflows_describe", "ambient_workflows_update", "ambient_workflows_archive"]));
    expect(toolCalls.indexOf("ambient_workflows_describe")).toBeLessThan(toolCalls.indexOf("ambient_workflows_update"));
    expect(toolCalls.indexOf("ambient_workflows_update")).toBeLessThan(toolCalls.indexOf("ambient_workflows_archive"));
    expect(toolProgress.some((event) => event.toolName === "ambient_workflows_archive" && event.status === "done")).toBe(true);
    expect(searchAmbientWorkflowPlaybooks(store, { query: "polished Scottsdale", limit: 3 }).results).toEqual([]);
    expect(searchAmbientWorkflowPlaybooks(store, { query: "polished Scottsdale", includeArchived: true, limit: 3 }).results[0]).toMatchObject({
      id: saved.id,
      version: 2,
      archivedReason: "Live management smoke archive.",
    });
  }, liveProfile.testTimeoutMs);
});

function workflowManagementTools(): Tool[] {
  return [
    {
      name: "ambient_workflows_describe",
      description: "Describe one saved workflow playbook before editing or archiving it.",
      parameters: Type.Object({
        id: Type.String({ description: "Exact workflow id." }),
      }),
    },
    {
      name: "ambient_workflows_update",
      description: "Update a saved workflow playbook as a new version.",
      parameters: Type.Object({
        id: Type.String({ description: "Exact workflow id." }),
        baseVersion: Type.Number({ description: "Current workflow version." }),
        draft: Type.Object({
          intent: Type.String({ description: "Reusable workflow intent." }),
          inputs: Type.Array(Type.String({ description: "Reusable input." })),
          successfulExamples: Type.Array(Type.Object({ toolName: Type.String({ description: "Tool name." }) })),
          doNot: Type.Array(Type.Object({
            status: Type.String({ description: "failed, skipped, or permission_blocked." }),
            reason: Type.String({ description: "Avoid pattern reason." }),
          })),
          validation: Type.Array(Type.String({ description: "Validation criterion." })),
          outputShape: Type.Array(Type.String({ description: "Output shape item." })),
        }),
      }),
    },
    {
      name: "ambient_workflows_archive",
      description: "Archive a saved workflow playbook after updating it.",
      parameters: Type.Object({
        id: Type.String({ description: "Exact workflow id." }),
        baseVersion: Type.Number({ description: "Current workflow version." }),
        reason: Type.String({ description: "Archive reason." }),
      }),
    },
  ];
}

async function callWithRetry(operation: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableAmbientProviderError(error) || attempt >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callForcedWorkflowManagementTool(
  apiKey: string,
  toolName: "ambient_workflows_describe" | "ambient_workflows_update" | "ambient_workflows_archive",
  prompt: string,
  toolCalls: string[],
  toolProgress: WorkflowPiToolProgress[],
  executeTool: (toolCall: ToolCall, validatedArgs: unknown) => Promise<string>,
): Promise<void> {
  await callWithRetry(async () => {
    await callWorkflowPiText({
      apiKey,
      baseUrl: liveAmbientProviderBaseUrl(),
      model: liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_WORKFLOW_PLAYBOOK_MANAGEMENT_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      }),
      prompt,
      responseFormat: { type: "json_object" },
      reasoning: false,
      maxTokens: 220,
      idleTimeoutMs: liveProfile.streamIdleTimeoutMs,
      retryPolicy: liveProfile.retryPolicy,
      tools: workflowManagementTools(),
      initialToolChoice: { type: "function", function: { name: toolName } },
      maxToolRounds: 1,
      executeTool: async (toolCall, args) => {
        toolCalls.push(toolCall.name);
        if (toolCall.name !== toolName) throw new Error(`Expected ${toolName}, got ${toolCall.name}`);
        return executeTool(toolCall, args);
      },
      onToolProgress: (progress) => toolProgress.push(progress),
    });
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected required string.");
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected required number.");
  return value;
}
