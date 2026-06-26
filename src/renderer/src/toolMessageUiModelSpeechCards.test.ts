import { describe, expect, it } from "vitest";
import { artifactMediaKindFromPath, parseToolMessage } from "./toolMessageUiModel";

describe("tool message speech cards UI model", () => {
  it("renders voice selection tool messages with concise provider and voice details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice settings updated",
        "Provider: ElevenLabs (ambient-cli:elevenlabs:tool:elevenlabs_tts) -> Piper TTS (ambient-cli:piper:tool:piper_tts)",
        "Voice: Rachel -> Lessac",
        "Enabled: true -> true",
      ].join("\n"),
      "ambient_voice_select",
      "/workspace",
      {
        toolResultDetails: {
          previousProviderCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          selectedProviderCapabilityId: "ambient-cli:piper:tool:piper_tts",
          selectedVoiceId: "en_US-lessac-medium",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice settings updated");
    expect(parsed.result).toContain("Provider: ElevenLabs");
    expect(parsed.voicePreview).toMatchObject({
      action: "select",
      previousProvider: "ElevenLabs (ambient-cli:elevenlabs:tool:elevenlabs_tts)",
      provider: "Piper TTS (ambient-cli:piper:tool:piper_tts)",
      previousProviderCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      previousVoice: "Rachel",
      voice: "Lessac",
      voiceId: "en_US-lessac-medium",
    });
  });

  it("recognizes voice provider test audio artifacts from result metadata", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice provider test succeeded",
        "Provider: Piper TTS",
        "Audio: .ambient/voice/thread/test.wav",
        "MIME type: audio/wav",
        "Duration: 430 ms",
      ].join("\n"),
      "ambient_voice_test",
      "/workspace",
      {
        toolResultDetails: {
          testStatus: "succeeded",
          providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
          voiceId: "en_US-lessac-medium",
          audioPath: ".ambient/voice/thread/test.wav",
          mimeType: "audio/wav",
          durationMs: 430,
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice provider test succeeded");
    expect(parsed.artifactPath).toBe(".ambient/voice/thread/test.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
    expect(parsed.voicePreview).toMatchObject({
      action: "test",
      provider: "Piper TTS",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voiceId: "en_US-lessac-medium",
      audioPath: ".ambient/voice/thread/test.wav",
      mimeType: "audio/wav",
      durationMs: 430,
      testStatus: "succeeded",
    });
  });

  it("parses clone status reconcile warnings into structured voice preview fields", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice clone status",
        "Provider: Local Voice Provider (ambient-cli:local:tool:local_tts)",
        "Voice: Demo clone (clone-1)",
        "Provider status: ready",
        "Readiness: ready",
        "Ready for chat selection: false",
        "Retry status later: false",
        "Dynamic cache: missing",
        "Provider dashboard: https://example.test/voices/clone-1",
        "Provider verification: https://example.test/verify/clone-1",
        "Local artifacts: .ambient/voice-models/clone-1/model.onnx, .ambient/voice-models/clone-1/config.json",
        "Missing local artifacts: .ambient/voice-models/clone-1/config.json",
        "Cloned: true",
      ].join("\n"),
      "ambient_voice_clone_status",
      "/workspace",
      {
        toolResultDetails: {
          status: "complete",
          providerCapabilityId: "ambient-cli:local:tool:local_tts",
          voiceId: "clone-1",
          readiness: "ready",
          readyForSelection: false,
          shouldRetryStatus: false,
          cacheStatus: "missing",
          dashboardUrl: "https://example.test/voices/clone-1",
          verificationUrl: "https://example.test/verify/clone-1",
          localArtifactPaths: [".ambient/voice-models/clone-1/model.onnx", ".ambient/voice-models/clone-1/config.json"],
          missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice clone status");
    expect(parsed.voicePreview).toMatchObject({
      action: "clone-status",
      provider: "Local Voice Provider (ambient-cli:local:tool:local_tts)",
      voice: "Demo clone (clone-1)",
      providerCapabilityId: "ambient-cli:local:tool:local_tts",
      voiceId: "clone-1",
      readiness: "ready",
      readyForSelection: false,
      shouldRetryStatus: false,
      cacheStatus: "missing",
      dashboardUrl: "https://example.test/voices/clone-1",
      verificationUrl: "https://example.test/verify/clone-1",
      localArtifactPaths: [".ambient/voice-models/clone-1/model.onnx", ".ambient/voice-models/clone-1/config.json"],
      missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
    });
  });

  it("renders voice policy update tool messages with concise policy details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice policy updated",
        "Enabled: true -> false",
        "Autoplay: true -> false",
        "Mode: assistant-final -> off",
        "Long reply: summarize -> skip",
        "Max chars: 1500 -> 600",
      ].join("\n"),
      "ambient_voice_policy_update",
      "/workspace",
    );

    expect(parsed.summary).toBe("Ambient voice policy updated");
    expect(parsed.voicePreview).toEqual({
      action: "policy",
      enabled: "true -> false",
      autoplay: "true -> false",
      mode: "assistant-final -> off",
      longReply: "summarize -> skip",
      maxChars: "1500 -> 600",
    });
  });

  it("renders no-op voice selection tool messages as already configured", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice settings already configured",
        "Provider: Piper TTS (ambient-cli:piper:tool:piper_tts)",
        "Voice: Amy (en_US-amy-medium)",
        "Format: wav",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_voice_select",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-voice",
          toolName: "ambient_voice_select",
          status: "no-op",
          selectedProviderCapabilityId: "ambient-cli:piper:tool:piper_tts",
          selectedVoiceId: "en_US-amy-medium",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice settings already configured");
    expect(parsed.voicePreview).toMatchObject({
      action: "select",
      status: "no-op",
      noOp: true,
      provider: "Piper TTS (ambient-cli:piper:tool:piper_tts)",
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voice: "Amy (en_US-amy-medium)",
      voiceId: "en_US-amy-medium",
    });
  });

  it("renders no-op voice policy tool messages as already configured", () => {
    const parsed = parseToolMessage(
      [
        "Ambient voice policy already configured",
        "Enabled: false",
        "Autoplay: false",
        "Mode: assistant-final",
        "Long reply: summarize",
        "Max chars: 1500",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_voice_policy_update",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-voice",
          toolName: "ambient_voice_policy_update",
          status: "no-op",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient voice policy already configured");
    expect(parsed.voicePreview).toEqual({
      action: "policy",
      status: "no-op",
      noOp: true,
      enabled: "false",
      autoplay: "false",
      mode: "assistant-final",
      longReply: "summarize",
      maxChars: "1500",
    });
  });

  it("renders STT status tool messages with provider, language, and policy details", () => {
    const parsed = parseToolMessage(
      [
        "Ambient STT status",
        "Enabled: true",
        "Mode: push-to-talk",
        "Selected provider: Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
        "Spoken language: English",
        "Auto-send after transcription: true",
        "Silence before transcribe: 0.8s",
        "No-speech gate: true at -55 dBFS RMS",
        "Queue while agent runs: true",
        "Providers: 1/1 available",
      ].join("\n"),
      "ambient_stt_status",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_status",
          status: "complete",
          providerCount: 1,
          availableProviderCount: 1,
          selectedProviderCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        },
      },
    );

    expect(parsed.summary).toBe("Ambient STT status");
    expect(parsed.sttPreview).toMatchObject({
      action: "status",
      status: "complete",
      provider: "Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      language: "English",
      enabled: "true",
      autoSendAfterTranscription: "true",
      silenceFinalizeSeconds: "0.8s",
      noSpeechGate: "true at -55 dBFS RMS",
      queueWhileAgentRuns: "true",
      providerCount: 1,
      availableProviderCount: 1,
    });
  });

  it("renders STT selection and policy tool messages as concise speech input cards", () => {
    const selected = parseToolMessage(
      [
        "Ambient STT settings updated",
        "Provider: Other STT (ambient-cli:other:tool:other_stt) -> Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
        "Spoken language: French -> Spanish",
        "Enabled: false -> true",
      ].join("\n"),
      "ambient_stt_select",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_select",
          status: "complete",
          previousProviderCapabilityId: "ambient-cli:other:tool:other_stt",
          selectedProviderCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
        },
      },
    );
    const policy = parseToolMessage(
      [
        "Ambient STT policy already configured",
        "Enabled: true",
        "Spoken language: Spanish",
        "Auto-send after transcription: true",
        "Silence before transcribe: 0.9s",
        "No-speech gate: true at -55 dBFS RMS",
        "No settings were changed and no approval was required.",
      ].join("\n"),
      "ambient_stt_policy_update",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_policy_update",
          status: "no-op",
        },
      },
    );

    expect(selected.sttPreview).toMatchObject({
      action: "select",
      previousProvider: "Other STT (ambient-cli:other:tool:other_stt)",
      provider: "Qwen3-ASR Local (ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe)",
      previousProviderCapabilityId: "ambient-cli:other:tool:other_stt",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      previousLanguage: "French",
      language: "Spanish",
      enabled: "false -> true",
    });
    expect(policy.sttPreview).toMatchObject({
      action: "policy",
      status: "no-op",
      noOp: true,
      enabled: "true",
      language: "Spanish",
      autoSendAfterTranscription: "true",
      silenceFinalizeSeconds: "0.9s",
      noSpeechGate: "true at -55 dBFS RMS",
    });
  });

  it("renders STT provider test transcript and managed artifacts without raw audio payloads", () => {
    const parsed = parseToolMessage(
      [
        "Ambient STT test succeeded",
        "Provider: Qwen3-ASR Local",
        "Status: ready",
        "Language: English",
        "Transcript: Ambient speech recognition spike.",
        "Provider elapsed: 1655 ms",
        "RMS: -31.3 dBFS",
        "No-speech threshold: -55 dBFS",
        "Normalized audio artifact: .ambient/stt/stt-tool-test/utt.wav",
        "Transcript artifact: .ambient/stt/stt-tool-test/utt.txt",
        "JSON artifact: .ambient/stt/stt-tool-test/utt.json",
        "Raw audio bytes were not returned to the agent.",
      ].join("\n"),
      "ambient_stt_test",
      "/workspace",
      {
        toolResultDetails: {
          runtime: "ambient-stt",
          toolName: "ambient_stt_test",
          status: "complete",
          testStatus: "ready",
          providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
          language: "English",
          transcript: "Ambient speech recognition spike.",
          audioPath: ".ambient/stt/stt-tool-test/utt.raw.wav",
          normalizedAudioPath: ".ambient/stt/stt-tool-test/utt.wav",
          transcriptPath: ".ambient/stt/stt-tool-test/utt.txt",
          jsonPath: ".ambient/stt/stt-tool-test/utt.json",
          durationMs: 1655,
          noSpeechGate: { rmsDbfs: -31.25, thresholdDbfs: -55 },
        },
      },
    );

    expect(parsed.summary).toBe("Ambient STT test succeeded");
    expect(parsed.artifactPath).toBe(".ambient/stt/stt-tool-test/utt.raw.wav");
    expect(artifactMediaKindFromPath(parsed.artifactPath!)).toBe("audio");
    expect(parsed.sttPreview).toMatchObject({
      action: "test",
      status: "complete",
      provider: "Qwen3-ASR Local",
      providerCapabilityId: "ambient-cli:ambient-qwen3-asr:tool:qwen3_asr_transcribe",
      language: "English",
      testStatus: "ready",
      transcript: "Ambient speech recognition spike.",
      durationMs: 1655,
      rmsDbfs: -31.25,
      noSpeechThresholdDbfs: -55,
      audioPath: ".ambient/stt/stt-tool-test/utt.raw.wav",
      normalizedAudioPath: ".ambient/stt/stt-tool-test/utt.wav",
      transcriptPath: ".ambient/stt/stt-tool-test/utt.txt",
      jsonPath: ".ambient/stt/stt-tool-test/utt.json",
    });
    expect(parsed.sttPreview?.transcript).not.toContain("raw audio");
  });
});
