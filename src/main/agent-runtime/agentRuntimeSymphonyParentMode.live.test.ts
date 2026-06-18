import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./agentRuntimeAmbientFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const itLive = process.env.AMBIENT_SUBAGENT_LIVE === "1" ? it : it.skip;

describe("AgentRuntime Symphony parent-mode live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;
  let threadId = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-symphony-parent-mode-live-"));
    await writeFile(join(workspacePath, "README.md"), "# Symphony parent-mode live smoke\n", "utf8");
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });
    store.setModelRuntimeSettings({
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
    });
  });

  afterEach(async () => {
    if (threadId) {
      for (const task of store.listCallableWorkflowTasksForParentThread(threadId)) {
        if (["succeeded", "failed", "canceled"].includes(task.status)) continue;
        const reason = "Live Symphony parent-mode smoke cleanup canceled the queued workflow task.";
        try {
          runtime?.cancelCallableWorkflowTask({ taskId: task.id, reason });
        } catch {
          store.cancelCallableWorkflowTask({ id: task.id, reason });
        }
      }
      threadId = "";
    }
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("queues a Symphony callable workflow without exposing parent worker tools", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "Symphony parent-mode live smoke" }));
    const thread = store.createThread("Symphony parent-mode live smoke");
    threadId = thread.id;
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during Symphony parent-mode live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_SYMPHONY_PARENT_MODE_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: [
          "This is a live Ambient Desktop Symphony parent-mode smoke test.",
          "Queue the selected Symphony workflow only. Do not inspect files, browse, search the web, run shell commands, or perform verifier work in the parent.",
          "After the callable workflow tool queues the task, explain that the task is pending.",
        ].join("\n"),
        composerIntent: {
          kind: "symphony-workflow",
          action: "run-once",
          patternId: "map_reduce",
          blocking: false,
          metricCustomizations: {
            "map_reduce-metric": "Reducer must cite every queued child result and preserve any missing-child limitation.",
          },
        },
      }),
    });

    const tasks = store.listCallableWorkflowTasksForParentThread(thread.id);
    const toolNames = threadToolNames(store, thread.id);
    const assistantText = threadAssistantText(store, thread.id);
    const forbiddenWorkerTools = [
      "read",
      "bash",
      "edit",
      "write",
      "browser_search",
      "browser_nav",
      "browser_content",
      "browser_eval",
      "browser_screenshot",
      "web_research_search",
      "web_research_fetch",
      "ambient_subagent",
    ];
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      toolNames,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        blocking: task.blocking,
        parentThreadId: task.parentThreadId,
        parentRunId: task.parentRunId,
      })),
      assistantText,
      transcript: threadTranscript(store, thread.id),
    };
    const reportRoot = join(process.cwd(), "test-results", "symphony-parent-mode-live-smoke");
    const latestReportPath = join(reportRoot, "latest.json");
    const runReportPath = join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await mkdir(reportRoot, { recursive: true });
    await writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      parentThreadId: thread.id,
      title: "Symphony Map-Reduce",
      blocking: false,
    });
    expect(toolNames).toContain("ambient_workflow_symphony_map_reduce");
    expect(toolNames.filter((toolName) => forbiddenWorkerTools.includes(toolName))).toEqual([]);
    expect(assistantText.length).toBeGreaterThan(0);
  }, Number(process.env.AMBIENT_SYMPHONY_PARENT_MODE_LIVE_TEST_TIMEOUT_MS ?? 240_000));
});

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  store: ProjectStore;
  threadId: string;
  send: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void input.runtime.abort(input.threadId).catch(() => undefined);
      reject(new Error(`Symphony parent-mode live smoke timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function threadAssistantText(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  return threadTranscript(store, threadId).slice(-4_000);
}
