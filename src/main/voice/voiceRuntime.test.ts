import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatMessage, MessageVoiceState, ThreadSummary, VoiceSettings } from "../../shared/types";
import { discoverAmbientCliVoiceProviders, installAmbientCliPackageSource, runAmbientCliPackageCommand } from "../ambient-cli/ambientCliPackages";
import { recordVoiceDispatchForMessage } from "./voiceDispatch";
import {
  ambientCliVoiceProviderFromSettings,
  deterministicWavFixtureVoiceRunner,
  regenerateMessageVoiceState,
  synthesizeQueuedVoiceState,
  type VoiceRuntimeStore,
} from "./voiceRuntime";

const settings: VoiceSettings = {
  enabled: true,
  mode: "assistant-final",
  autoplay: false,
  providerCapabilityId: "pkg-piper:tool:piper_tts",
  voiceId: "default",
  maxChars: 80,
  longReply: "summarize",
  format: "wav",
  artifactCacheMaxMb: 30,
};

function queuedState(input: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    messageId: input.messageId ?? "message-1",
    threadId: input.threadId ?? "thread-1",
    status: input.status ?? "queued",
    source: input.source ?? "assistant-text",
    sourceMessageId: input.sourceMessageId ?? "message-1",
    providerCapabilityId: input.providerCapabilityId ?? settings.providerCapabilityId,
    voiceId: input.voiceId ?? "default",
    spokenText: "spokenText" in input ? input.spokenText : "Use Piper as a low-friction open-source TTS provider fixture.",
    spokenTextChars: input.spokenTextChars ?? 61,
    sourceTextChars: input.sourceTextChars ?? 61,
    createdAt: input.createdAt ?? "2026-05-07T00:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-05-07T00:00:00.000Z",
    audioPath: input.audioPath,
    mediaUrl: input.mediaUrl,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    error: input.error,
  };
}

function memoryStore(): VoiceRuntimeStore & { states: MessageVoiceState[] } {
  const states: MessageVoiceState[] = [];
  return {
    states,
    setMessageVoiceState(input) {
      const state = {
        ...input,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      };
      states.push(state);
      return state;
    },
  };
}

function regenerationStore(input: { thread: ThreadSummary; messages: ChatMessage[] }): VoiceRuntimeStore & {
  states: MessageVoiceState[];
  getMessageVoiceState(messageId: string): MessageVoiceState | undefined;
  getThread(threadId: string): ThreadSummary;
  listMessages(threadId: string): ChatMessage[];
} {
  const store = memoryStore();
  return {
    ...store,
    getMessageVoiceState(messageId) {
      for (let index = store.states.length - 1; index >= 0; index -= 1) {
        const state = store.states[index];
        if (state.messageId === messageId) return state;
      }
      return undefined;
    },
    getThread(threadId) {
      if (threadId !== input.thread.id) throw new Error(`Unexpected thread: ${threadId}`);
      return input.thread;
    },
    listMessages(threadId) {
      if (threadId !== input.thread.id) throw new Error(`Unexpected thread: ${threadId}`);
      return input.messages;
    },
  };
}

describe("voice runtime", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((path) => rm(path, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  async function tempWorkspace(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "ambient-voice-runtime-"));
    tempRoots.push(path);
    return path;
  }

  async function seedInstalledVoiceProvider(workspacePath: string) {
    const packageRoot = join(workspacePath, "voice-provider-fixture");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, "ambient-cli.json"),
      `${JSON.stringify(
        {
          name: "ambient-e2e-voice-provider",
          version: "0.1.0",
          description: "E2E local TTS provider metadata fixture.",
          skills: "./SKILL.md",
          commands: {
            e2e_voice_provider: {
              description: "Synthesize spoken assistant text to a WAV file for focused voice dispatch coverage.",
              command: "node",
              args: ["./run.mjs"],
              cwd: "package",
              voiceProvider: {
                defaultFormat: "wav",
                formats: ["wav"],
                voices: [{ id: "default", label: "Default E2E voice" }],
                local: true,
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(join(packageRoot, "SKILL.md"), "---\nname: ambient-e2e-voice-provider\n---\n", "utf8");
    await writeFile(
      join(packageRoot, "run.mjs"),
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname } from 'node:path';",
        "const output = process.argv[process.argv.indexOf('--output') + 1];",
        "if (!output) process.exit(2);",
        "mkdirSync(dirname(output), { recursive: true });",
        "writeFileSync(output, Buffer.from('RIFF....WAVEfmt '));",
        "process.stdout.write(JSON.stringify({ audioPath: output, mimeType: 'audio/wav', durationMs: 321 }) + '\\n');",
        "",
      ].join("\n"),
      "utf8",
    );

    const installed = await installAmbientCliPackageSource(workspacePath, { source: "./voice-provider-fixture" });
    const [provider] = await discoverAmbientCliVoiceProviders(workspacePath);
    expect(provider).toMatchObject({
      packageId: installed.id,
      command: "e2e_voice_provider",
      available: true,
    });
    return provider;
  }

  it("resolves Ambient CLI tool capability ids into voice providers", () => {
    expect(ambientCliVoiceProviderFromSettings(settings)).toMatchObject({
      id: "pkg-piper:tool:piper_tts",
      capabilityId: "pkg-piper:tool:piper_tts",
      packageId: "pkg-piper",
      command: "piper_tts",
      format: "wav",
    });
    expect(ambientCliVoiceProviderFromSettings({ ...settings, providerCapabilityId: "voice:fixture" })).toBeUndefined();
  });

  it("moves queued assistant text through synthesizing to ready with media metadata", async () => {
    const workspacePath = await tempWorkspace();
    const store = memoryStore();

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      state: queuedState(),
      settings,
      store,
      runner: deterministicWavFixtureVoiceRunner(),
      createMediaUrl: ({ relativePath, mimeType }) => `ambient-media://voice/${relativePath}?mime=${mimeType}`,
    });

    expect(store.states.map((state) => state.status)).toEqual(["synthesizing", "ready"]);
    expect(result).toMatchObject({
      status: "ready",
      providerCapabilityId: "pkg-piper:tool:piper_tts",
      providerId: "pkg-piper:tool:piper_tts",
      audioPath: ".ambient/voice/thread-1/message-1.wav",
      mediaUrl: "ambient-media://voice/.ambient/voice/thread-1/message-1.wav?mime=audio/wav",
      mimeType: "audio/wav",
    });
  });

  it("runs installed voice packages from the provider workspace while writing audio to the thread workspace", async () => {
    const workspacePath = await tempWorkspace();
    const packageWorkspacePath = await tempWorkspace();
    const store = memoryStore();
    const calls: Array<{ workspacePath: string; executionWorkspacePath?: string }> = [];
    const fixture = deterministicWavFixtureVoiceRunner();

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      packageWorkspacePath,
      state: queuedState(),
      settings,
      store,
      runner: async (runWorkspacePath, input) => {
        calls.push({ workspacePath: runWorkspacePath, executionWorkspacePath: input.executionWorkspacePath });
        return fixture(runWorkspacePath, input);
      },
    });

    expect(result).toMatchObject({
      status: "ready",
      audioPath: ".ambient/voice/thread-1/message-1.wav",
    });
    expect(calls).toEqual([{ workspacePath: packageWorkspacePath, executionWorkspacePath: workspacePath }]);
  });

  it("summarizes long reply source text before synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = memoryStore();
    const fetchImpl = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Short spoken version." } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      state: queuedState({
        source: "summary",
        spokenText: undefined,
        spokenTextChars: 0,
        sourceTextChars: 78,
      }),
      sourceText: "This is the full assistant answer that should be summarized before voice synthesis.",
      settings,
      store,
      runner: deterministicWavFixtureVoiceRunner(),
      summary: {
        model: "glm-5.1",
        apiKey: "ambient-test-key",
        fetchImpl,
      },
    });

    expect(store.states.map((state) => [state.status, state.spokenText])).toEqual([
      ["queued", "Short spoken version."],
      ["synthesizing", "Short spoken version."],
      ["ready", "Short spoken version."],
    ]);
    expect(result).toMatchObject({
      status: "ready",
      source: "summary",
      spokenText: "Short spoken version.",
      spokenTextChars: 21,
    });
  });

  it("persists failed state when provider synthesis fails", async () => {
    const workspacePath = await tempWorkspace();
    const store = memoryStore();

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      state: queuedState(),
      settings,
      store,
      runner: async () => {
        throw new Error("provider unavailable");
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      error: "provider unavailable",
    });
  });

  it("regenerates a failed voice state to ready after provider repair", async () => {
    const workspacePath = await tempWorkspace();
    const thread: ThreadSummary = {
      id: "thread-voice",
      title: "Voice Thread",
      workspacePath,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
      lastMessagePreview: "",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "glm-5.1",
      thinkingLevel: "medium",
    };
    const message: ChatMessage = {
      id: "assistant-repair-message",
      threadId: thread.id,
      role: "assistant",
      content: "Retry this short voice clip after the provider is repaired.",
      createdAt: "2026-05-07T00:00:00.000Z",
    };
    const store = regenerationStore({ thread, messages: [message] });
    store.setMessageVoiceState({
      messageId: message.id,
      threadId: thread.id,
      status: "failed",
      source: "assistant-text",
      sourceMessageId: message.id,
      providerCapabilityId: settings.providerCapabilityId,
      providerId: settings.providerCapabilityId,
      voiceId: "default",
      spokenText: message.content,
      spokenTextChars: message.content.length,
      sourceTextChars: message.content.length,
      error: "provider unavailable",
    });

    const result = await regenerateMessageVoiceState({
      messageId: message.id,
      settings: { ...settings, maxChars: 500 },
      store,
      runner: deterministicWavFixtureVoiceRunner(),
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://voice/${relativePath}?mime=${mimeType}&size=${size}`,
    });

    expect(store.states.map((state) => [state.status, state.error])).toEqual([
      ["failed", "provider unavailable"],
      ["queued", undefined],
      ["synthesizing", undefined],
      ["ready", undefined],
    ]);
    expect(result).toMatchObject({
      status: "ready",
      providerCapabilityId: settings.providerCapabilityId,
      audioPath: ".ambient/voice/thread-voice/assistant-repair-message.wav",
      mediaUrl: expect.stringContaining("ambient-media://voice/.ambient/voice/thread-voice/assistant-repair-message.wav"),
    });
  });

  it("dispatches a selected Ambient CLI voice provider to ready managed media", async () => {
    const workspacePath = await tempWorkspace();
    const provider = await seedInstalledVoiceProvider(workspacePath);

    const selectedSettings: VoiceSettings = {
      ...settings,
      providerCapabilityId: provider.capabilityId,
      voiceId: "default",
      maxChars: 500,
      format: "wav",
    };
    const store = memoryStore();
    const message = {
      id: "assistant-voice-message",
      threadId: "thread-voice",
      role: "assistant" as const,
      content: "This focused smoke should synthesize through the selected Ambient CLI voice provider.",
      createdAt: "2026-05-07T00:00:00.000Z",
    };
    const dispatch = recordVoiceDispatchForMessage({ message, settings: selectedSettings, store });

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      state: dispatch.state,
      settings: selectedSettings,
      store,
      runner: runAmbientCliPackageCommand,
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://voice/${relativePath}?mime=${mimeType}&size=${size}`,
    });

    if (result.status === "failed") throw new Error(result.error);
    expect(store.states.map((state) => state.status)).toEqual(["queued", "synthesizing", "ready"]);
    expect(result).toMatchObject({
      messageId: "assistant-voice-message",
      threadId: "thread-voice",
      status: "ready",
      providerCapabilityId: provider.capabilityId,
      providerId: provider.capabilityId,
      audioPath: ".ambient/voice/thread-voice/assistant-voice-message.wav",
      mediaUrl: "ambient-media://voice/.ambient/voice/thread-voice/assistant-voice-message.wav?mime=audio/wav&size=16",
      mimeType: "audio/wav",
      durationMs: 321,
    });
  });

  it("summarizes long replies before dispatching a selected Ambient CLI voice provider", async () => {
    const workspacePath = await tempWorkspace();
    const provider = await seedInstalledVoiceProvider(workspacePath);
    const summaryCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      summaryCalls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response(
        [
          'data: {"choices":[{"delta":{"content":"Use the macOS binary after checking the README, then preview install commands."}}]}',
          "data: [DONE]",
          "",
        ].join("\n"),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      );
    };
    const selectedSettings: VoiceSettings = {
      ...settings,
      providerCapabilityId: provider.capabilityId,
      voiceId: "default",
      maxChars: 96,
      format: "wav",
    };
    const longReply = [
      "NeuTTS from Neuphonic needs platform-aware setup.",
      "On macOS, read the README before installing dependencies because a prebuilt binary may be the right path.",
      "Preview every command, validate model assets, and only then synthesize a short sample through Ambient.",
    ].join(" ");
    const store = memoryStore();
    const message = {
      id: "assistant-summary-message",
      threadId: "thread-voice",
      role: "assistant" as const,
      content: longReply,
      createdAt: "2026-05-07T00:00:00.000Z",
    };
    const dispatch = recordVoiceDispatchForMessage({ message, settings: selectedSettings, store });
    expect(dispatch.state).toMatchObject({
      status: "queued",
      source: "summary",
      spokenTextChars: 0,
      sourceTextChars: longReply.length,
    });

    const result = await synthesizeQueuedVoiceState({
      workspacePath,
      state: dispatch.state,
      sourceText: longReply,
      settings: selectedSettings,
      store,
      runner: runAmbientCliPackageCommand,
      summary: {
        model: "glm-5.1",
        apiKey: "ambient-test-key",
        fetchImpl: fetchImpl as typeof fetch,
      },
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://voice/${relativePath}?mime=${mimeType}&size=${size}`,
    });

    if (result.status === "failed") throw new Error(result.error);
    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0].body).toMatchObject({
      stream: true,
      reasoning: { effort: "none", enabled: false, exclude: true },
    });
    expect(store.states.map((state) => [state.status, state.source, state.spokenText])).toEqual([
      ["queued", "summary", undefined],
      ["queued", "summary", "Use the macOS binary after checking the README, then preview install commands."],
      ["synthesizing", "summary", "Use the macOS binary after checking the README, then preview install commands."],
      ["ready", "summary", "Use the macOS binary after checking the README, then preview install commands."],
    ]);
    expect(result).toMatchObject({
      messageId: "assistant-summary-message",
      threadId: "thread-voice",
      status: "ready",
      source: "summary",
      providerCapabilityId: provider.capabilityId,
      providerId: provider.capabilityId,
      spokenText: "Use the macOS binary after checking the README, then preview install commands.",
      spokenTextChars: 78,
      sourceTextChars: longReply.length,
      audioPath: ".ambient/voice/thread-voice/assistant-summary-message.wav",
      mediaUrl: "ambient-media://voice/.ambient/voice/thread-voice/assistant-summary-message.wav?mime=audio/wav&size=16",
      mimeType: "audio/wav",
      durationMs: 321,
    });
  });

  it("regenerates a summarized voice artifact through the selected Ambient CLI voice provider", async () => {
    const workspacePath = await tempWorkspace();
    const provider = await seedInstalledVoiceProvider(workspacePath);
    const summaryCalls: Array<{ body: Record<string, unknown> }> = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      summaryCalls.push({ body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response(JSON.stringify({ choices: [{ message: { content: "Fresh spoken summary for replay." } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const selectedSettings: VoiceSettings = {
      ...settings,
      providerCapabilityId: provider.capabilityId,
      voiceId: "default",
      maxChars: 96,
      format: "wav",
    };
    const thread: ThreadSummary = {
      id: "thread-voice",
      title: "Voice Thread",
      workspacePath,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
      lastMessagePreview: "",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "glm-5.1",
      thinkingLevel: "medium",
    };
    const longReply = [
      "Qwen3-TTS may be useful for expressive speech, but long context can degrade audio quality.",
      "Read the README and platform notes before installing, prefer a local smoke sample, and preview any model downloads before activation.",
    ].join(" ");
    const message: ChatMessage = {
      id: "assistant-regenerate-message",
      threadId: thread.id,
      role: "assistant",
      content: longReply,
      createdAt: "2026-05-07T00:00:00.000Z",
    };
    const store = regenerationStore({ thread, messages: [message] });
    store.setMessageVoiceState({
      messageId: message.id,
      threadId: thread.id,
      status: "ready",
      source: "summary",
      sourceMessageId: message.id,
      providerCapabilityId: provider.capabilityId,
      providerId: provider.capabilityId,
      voiceId: "default",
      spokenText: "Stale spoken summary.",
      spokenTextChars: 21,
      sourceTextChars: longReply.length,
      audioPath: ".ambient/voice/thread-voice/assistant-regenerate-message.wav",
      mediaUrl: "ambient-media://voice/stale.wav",
      mimeType: "audio/wav",
      durationMs: 111,
    });
    let stateUpdates = 0;

    const result = await regenerateMessageVoiceState({
      messageId: message.id,
      settings: selectedSettings,
      store,
      runner: runAmbientCliPackageCommand,
      summaryForThread: (summaryThread) => ({
        model: summaryThread.model,
        apiKey: "ambient-test-key",
        fetchImpl: fetchImpl as typeof fetch,
      }),
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://voice/${relativePath}?mime=${mimeType}&size=${size}`,
      onStateUpdated: () => {
        stateUpdates += 1;
      },
    });

    if (result.status === "failed") throw new Error(result.error);
    expect(summaryCalls).toHaveLength(1);
    expect(summaryCalls[0].body).toMatchObject({
      stream: true,
      reasoning: { effort: "none", enabled: false, exclude: true },
    });
    expect(stateUpdates).toBe(2);
    expect(store.states.map((state) => [state.status, state.source, state.spokenText, state.mediaUrl])).toEqual([
      ["ready", "summary", "Stale spoken summary.", "ambient-media://voice/stale.wav"],
      ["queued", "summary", undefined, undefined],
      ["queued", "summary", "Fresh spoken summary for replay.", undefined],
      ["synthesizing", "summary", "Fresh spoken summary for replay.", undefined],
      [
        "ready",
        "summary",
        "Fresh spoken summary for replay.",
        "ambient-media://voice/.ambient/voice/thread-voice/assistant-regenerate-message.wav?mime=audio/wav&size=16",
      ],
    ]);
    expect(result).toMatchObject({
      messageId: message.id,
      threadId: thread.id,
      status: "ready",
      source: "summary",
      providerCapabilityId: provider.capabilityId,
      providerId: provider.capabilityId,
      spokenText: "Fresh spoken summary for replay.",
      spokenTextChars: 32,
      sourceTextChars: longReply.length,
      audioPath: ".ambient/voice/thread-voice/assistant-regenerate-message.wav",
      mediaUrl: "ambient-media://voice/.ambient/voice/thread-voice/assistant-regenerate-message.wav?mime=audio/wav&size=16",
      mimeType: "audio/wav",
      durationMs: 321,
    });
  });

  it("regenerates with newly selected provider metadata after provider switching", async () => {
    const workspacePath = await tempWorkspace();
    const thread: ThreadSummary = {
      id: "thread-voice",
      title: "Voice Thread",
      workspacePath,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
      lastMessagePreview: "",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "glm-5.1",
      thinkingLevel: "medium",
    };
    const message: ChatMessage = {
      id: "assistant-provider-switch-message",
      threadId: thread.id,
      role: "assistant",
      content: "Regenerate this short voice clip with the newly selected provider.",
      createdAt: "2026-05-07T00:00:00.000Z",
    };
    const store = regenerationStore({ thread, messages: [message] });
    store.setMessageVoiceState({
      messageId: message.id,
      threadId: thread.id,
      status: "ready",
      source: "assistant-text",
      sourceMessageId: message.id,
      providerCapabilityId: "pkg-old:tool:old_voice",
      providerId: "pkg-old:tool:old_voice",
      voiceId: "old",
      spokenText: "Old provider text.",
      spokenTextChars: 18,
      sourceTextChars: message.content.length,
      audioPath: ".ambient/voice/thread-voice/assistant-provider-switch-message.wav",
      mediaUrl: "ambient-media://voice/old-provider.wav",
      mimeType: "audio/wav",
      durationMs: 111,
    });
    const selectedSettings: VoiceSettings = {
      ...settings,
      providerCapabilityId: "pkg-new:tool:new_voice",
      voiceId: "new",
      maxChars: 500,
      format: "wav",
    };

    const result = await regenerateMessageVoiceState({
      messageId: message.id,
      settings: selectedSettings,
      store,
      runner: deterministicWavFixtureVoiceRunner(),
      createMediaUrl: ({ relativePath, mimeType, size }) => `ambient-media://voice/${relativePath}?mime=${mimeType}&size=${size}`,
    });

    expect(store.states.map((state) => [state.status, state.providerCapabilityId, state.voiceId])).toEqual([
      ["ready", "pkg-old:tool:old_voice", "old"],
      ["queued", "pkg-new:tool:new_voice", "new"],
      ["synthesizing", "pkg-new:tool:new_voice", "new"],
      ["ready", "pkg-new:tool:new_voice", "new"],
    ]);
    expect(result).toMatchObject({
      status: "ready",
      providerCapabilityId: "pkg-new:tool:new_voice",
      providerId: "pkg-new:tool:new_voice",
      voiceId: "new",
    });
    expect(result.mediaUrl).toContain("ambient-media://voice/.ambient/voice/thread-voice/assistant-provider-switch-message.wav?mime=audio/wav&size=");
  });
});
