import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { AgentRuntime } from "./agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { ProjectStore } from "./projectStore";

const itLive = process.env.AMBIENT_LOCAL_RUNTIME_STATUS_LIVE === "1" ? it : it.skip;

describe("local model runtime status, start, stop, and restart Pi tool live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-local-runtime-status-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
    store.setFeatureFlagSettings({ subagents: true });
    store.setModelRuntimeSettings({
      providerPreStreamTimeoutMs: 60_000,
      providerStreamIdleTimeoutMs: 120_000,
    });
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("lets live Pi inspect local runtime inventory and dry-run Start/Stop/Restart through local runtime tools", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "local runtime status Pi tool live smoke" }));
    const thread = store.createThread("Local runtime status live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during local runtime status live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });

    const prompt = [
      "This is a live Ambient Desktop local runtime status, Start dry-run, Stop dry-run, and Restart dry-run smoke test.",
      "Use only the ambient_local_model_runtime_status tool, the ambient_local_model_runtime_start tool, the ambient_local_model_runtime_stop tool, the ambient_local_model_runtime_restart tool, and your final reply.",
      "Call ambient_local_model_runtime_status with limit 5.",
      "Then call ambient_local_model_runtime_start with runtimeId='synthetic-missing-runtime' and dryRun=true.",
      "Then call ambient_local_model_runtime_stop with runtimeId='synthetic-missing-runtime' and dryRun=true.",
      "Then call ambient_local_model_runtime_restart with runtimeId='synthetic-missing-runtime' and dryRun=true.",
      "After all tool results return, reply exactly: LOCAL_RUNTIME_STATUS_START_STOP_RESTART_LIVE_DONE",
      "Do not use filesystem, shell, browser, network, plugin, MCP, connector, or sub-agent tools.",
    ].join("\n");

    await sendWithTimeout({
      runtime,
      store,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_LOCAL_RUNTIME_STATUS_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: prompt,
      }),
    });

    const transcript = threadTranscript(store, thread.id);
    const toolNames = threadToolNames(store, thread.id);
    const assistantText = store
      .listMessages(thread.id)
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n");
    const report = {
      createdAt: new Date().toISOString(),
      provider: liveAmbientProviderLabel(),
      workspacePath,
      threadId: thread.id,
      toolNames,
      assistantText,
      transcript,
    };
    const reportRoot = join(process.cwd(), "test-results", "local-runtime-status-live-smoke");
    await mkdir(reportRoot, { recursive: true });
    await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(reportRoot, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(toolNames).toContain("ambient_local_model_runtime_status");
    expect(toolNames).toContain("ambient_local_model_runtime_start");
    expect(toolNames).toContain("ambient_local_model_runtime_stop");
    expect(toolNames).toContain("ambient_local_model_runtime_restart");
    expect(transcript).toContain("Local model runtime status");
    expect(transcript).toContain("Local model runtime Start target not found");
    expect(transcript).toContain("Local model runtime Stop target not found");
    expect(transcript).toContain("Local model runtime Restart target not found");
    expect(assistantText).toContain("LOCAL_RUNTIME_STATUS_START_STOP_RESTART_LIVE_DONE");
  }, Number(process.env.AMBIENT_LOCAL_RUNTIME_STATUS_LIVE_TEST_TIMEOUT_MS ?? 240_000));
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
      reject(new Error(`Local runtime status live smoke timed out after ${input.timeoutMs}ms.\n${summarizeThread(input.store, input.threadId)}`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function threadTranscript(store: ProjectStore, threadId: string): string {
  return store
    .listMessages(threadId)
    .map((message) => message.content)
    .join("\n\n--- MESSAGE ---\n\n");
}

function threadToolNames(store: ProjectStore, threadId: string): string[] {
  return store
    .listMessages(threadId)
    .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
    .filter((toolName): toolName is string => Boolean(toolName));
}

function summarizeThread(store: ProjectStore, threadId: string): string {
  const messages = store.listMessages(threadId);
  return messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content.slice(0, 1000)}`)
    .join("\n\n");
}
