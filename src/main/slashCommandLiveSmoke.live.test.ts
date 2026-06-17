import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import type { SlashCommandSelection } from "../shared/types";
import { AgentRuntime } from "./agentRuntime";
import {
  applyLiveAmbientProviderApiKeyEnv,
  liveAmbientProviderLabel,
  liveAmbientProviderModel,
  readLiveAmbientProviderApiKey,
} from "./liveAmbientProviderConfig";
import { ProjectStore } from "./projectStore";

const itLive = process.env.AMBIENT_SLASH_COMMAND_LIVE === "1" ? it : it.skip;

describe("AgentRuntime slash command live smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;
  let runtime: AgentRuntime | undefined;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-slash-command-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.shutdownPluginMcpServers();
      runtime = undefined;
    }
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  itLive("passes a selected slash command composer intent through live Pi", async () => {
    applyLiveAmbientProviderApiKeyEnv(readLiveAmbientProviderApiKey({ purpose: "slash command live smoke" }));
    store.setFeatureFlagSettings({ slashCommands: true });
    const thread = store.createThread("Slash command live smoke");
    runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
      request: async (request) => {
        throw new Error(`Unexpected permission request during slash command live smoke: ${request.toolName}`);
      },
      denyThread: () => undefined,
    });
    const selection: SlashCommandSelection = {
      schemaVersion: "ambient-slash-command-invocation-v1",
      entryId: "codex-plugin-skill:live-smoke",
      command: "/live-smoke-skill",
      title: "Live Smoke Skill",
      kind: "skill",
      sourceKind: "codex-plugin",
      invocationKind: "codex-plugin-skill",
      sourceId: "live-smoke-plugin",
      sourceName: "live-smoke",
      sourceVersion: "1.0.0",
      sourceFingerprint: "live-smoke-fingerprint",
    };

    await sendWithTimeout({
      runtime,
      threadId: thread.id,
      timeoutMs: Number(process.env.AMBIENT_SLASH_COMMAND_LIVE_TIMEOUT_MS ?? 180_000),
      send: runtime.send({
        threadId: thread.id,
        permissionMode: "workspace",
        collaborationMode: "agent",
        model: liveAmbientProviderModel({ fallbackModel: AMBIENT_DEFAULT_MODEL }),
        thinkingLevel: "minimal",
        content: "Do not use tools. Reply with SLASH_COMMAND_LIVE_DONE and mention /live-smoke-skill.",
        composerIntent: {
          kind: "slash-command",
          selection,
        },
      }),
    });

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
      assistantText,
    };
    const reportRoot = join(process.cwd(), "test-results", "slash-command-live-smoke");
    await mkdir(reportRoot, { recursive: true });
    await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(assistantText).toContain("SLASH_COMMAND_LIVE_DONE");
    expect(assistantText).toContain("/live-smoke-skill");
  }, Number(process.env.AMBIENT_SLASH_COMMAND_LIVE_TEST_TIMEOUT_MS ?? 240_000));
});

async function sendWithTimeout(input: {
  runtime: AgentRuntime;
  threadId: string;
  send: Promise<void>;
  timeoutMs: number;
}): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void input.runtime.abort(input.threadId).catch(() => undefined);
      reject(new Error(`Slash command live smoke timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);
  });
  try {
    await Promise.race([input.send, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
