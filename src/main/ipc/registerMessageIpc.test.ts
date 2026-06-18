import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { resolveLocalDeepResearchRunBudget } from "../../shared/localDeepResearchBudget";
import type { SendMessageInput } from "../../shared/desktopTypes";
import {
  messageSendIpcChannels,
  registerMessageSendIpc,
  type RegisterMessageSendIpcDependencies,
} from "./registerMessageIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerMessageSendIpc", () => {
  it("registers the message send channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...messageSendIpcChannels]);
  });

  it("parses input before sending the message", async () => {
    const { deps, invoke } = registerWithFakes();
    const rawInput = {
      ...sampleSendInput(),
      context: [{ path: "src/main/index.ts", absolute: false, name: "index.ts", kind: "file" }],
      extra: "ignored",
    };

    await expect(invoke("message:send", rawInput)).resolves.toBeUndefined();

    expect(deps.sendMessage).toHaveBeenCalledWith(
      {
        ...sampleSendInput(),
        context: [{ path: "src/main/index.ts", absolute: false }],
      },
      rawInput,
    );
  });

  it("accepts optional send metadata", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      ...sampleSendInput(),
      delivery: "follow-up",
      retryOfMessageId: "message-1",
      workflowThreadId: "workflow-thread-1",
      workflowRecordingEditContext: {
        id: "recording-1",
        title: "Recording",
        version: 1,
        manifestPath: "/tmp/recording/manifest.json",
        markdownPath: "/tmp/recording/README.md",
        sidecarPath: "/tmp/recording/sidecar.json",
        transcriptPath: "/tmp/recording/transcript.json",
      },
      preserveActiveThread: true,
      stt: {
        source: "stt",
        utteranceId: "utterance-1",
        threadId: "thread-1",
        status: "ready",
        providerCapabilityId: "provider-capability-1",
        providerId: "provider-1",
        language: "en",
        durationMs: 1234,
        noSpeechGate: {
          enabled: true,
          skipped: false,
          rmsDbfs: -40,
          peakDbfs: -12,
          thresholdDbfs: -50,
          sampleCount: 100,
          durationMs: 1234,
          reason: "speech detected",
        },
        artifacts: {
          audioPath: "/tmp/audio.wav",
          normalizedAudioPath: "/tmp/audio-normalized.wav",
          transcriptPath: "/tmp/transcript.txt",
          jsonPath: "/tmp/transcript.json",
          stdoutPath: "/tmp/stdout.txt",
          stderrPath: "/tmp/stderr.txt",
        },
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:01.000Z",
      },
      goalMode: { enabled: true, tokenBudget: 1000 },
      composerIntent: { kind: "local-deep-research", localDeepResearch: resolveLocalDeepResearchRunBudget(undefined) },
    };

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(deps.sendMessage).toHaveBeenCalledWith(input, input);
  });

  it("accepts Symphony workflow composer intents", async () => {
    const { deps, invoke } = registerWithFakes();
    const input = {
      ...sampleSendInput(),
      composerIntent: {
        kind: "symphony-workflow",
        action: "run-once",
        patternId: "pipeline",
        blocking: true,
        stepAnswers: {
          "pattern-scope": { choiceId: "fetch-cite-synthesize" },
          "limits-and-policy": { customText: "Read-only with small slice first." },
        },
        metricCustomizations: {
          "pipeline-metric": "Every stage must cite its inputs.",
        },
      },
    };

    await expect(invoke("message:send", input)).resolves.toBeUndefined();

    expect(deps.sendMessage).toHaveBeenCalledWith(input, input);
  });

  it("rejects invalid input before sending the message", async () => {
    const { deps, invoke } = registerWithFakes();

    expect(() => invoke("message:send", { ...sampleSendInput(), content: "" })).toThrow();
    expect(() => invoke("message:send", { ...sampleSendInput(), permissionMode: "admin" })).toThrow();
    expect(() =>
      invoke("message:send", {
        ...sampleSendInput(),
        composerIntent: {
          kind: "symphony-workflow",
          action: "run-once",
          patternId: "imitate_and_verify",
        },
      })
    ).toThrow("Complete required verifier criteria before launching the Symphony workflow.");
    expect(() =>
      invoke("message:send", {
        ...sampleSendInput(),
        context: Array.from({ length: 31 }, (_, index) => ({ path: `file-${index}` })),
      }),
    ).toThrow();

    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  it("propagates message send errors", async () => {
    const error = new Error("runtime unavailable");
    const { deps, invoke } = registerWithFakes({ error });
    const input = sampleSendInput();

    await expect(invoke("message:send", input)).rejects.toThrow("runtime unavailable");

    expect(deps.sendMessage).toHaveBeenCalledWith(input, input);
  });
});

function registerWithFakes(options: {
  error?: Error;
} = {}): {
  deps: RegisterMessageSendIpcDependencies;
  handlers: Map<string, IpcListener>;
  event: IpcMainInvokeEvent;
  invoke(channel: string, raw?: unknown): Promise<unknown>;
} {
  const handlers = new Map<string, IpcListener>();
  const deps: RegisterMessageSendIpcDependencies = {
    handleIpc: vi.fn((channel, listener) => {
      handlers.set(channel, listener);
    }),
    sendMessage: vi.fn(async () => {
      if (options.error) throw options.error;
    }),
  };
  const event = {} as IpcMainInvokeEvent;

  registerMessageSendIpc(deps);

  return {
    deps,
    handlers,
    event,
    invoke: (channel, raw) => {
      const listener = handlers.get(channel);
      if (!listener) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(listener(event, raw));
    },
  };
}

function sampleSendInput(): SendMessageInput {
  return {
    threadId: "thread-1",
    content: "Build a tiny app.",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-test-model",
    thinkingLevel: "medium",
  };
}
