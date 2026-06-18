import { describe, expect, it } from "vitest";
import type { VoiceProviderCandidate, VoiceSettings } from "../../shared/localRuntimeTypes";
import {
  buildVoiceStatus,
  buildVoiceClonePlan,
  buildVoiceCloneCreatePlan,
  buildVoiceCloneCreatePreview,
  buildVoiceCloneManagePlan,
  parseVoiceCloneDeleteStdout,
  parseVoiceCloneCreateStdout,
  planVoicePolicyUpdate,
  planVoiceSelection,
  summarizeVoiceCloneStatus,
  voiceCloneCreateApprovalDetail,
  voiceCloneCreateText,
  voiceCloneDeleteApprovalDetail,
  voiceCloneDeleteText,
  voiceClonePlanText,
  voiceCloneStatusText,
  voiceCloneCreatePreviewText,
  voicePolicyApprovalDetail,
  voicePolicyNoopText,
  voicePolicyText,
  voiceSelectApprovalDetail,
  voiceSelectNoopText,
  voiceSelectText,
  voiceStatusText,
} from "./voiceSettingsTools";

describe("voice settings tools", () => {
  it("builds status with selected provider and voice", () => {
    const status = buildVoiceStatus(settings(), [provider({ capabilityId: "ambient-cli:piper:tool:piper_tts" })]);

    expect(status.selectedProvider?.label).toBe("Piper TTS");
    expect(status.selectedVoice?.id).toBe("en_US-lessac-medium");
    expect(status.outputState).toMatchObject({
      state: "off",
      label: "off",
    });
    expect(voiceStatusText(status)).toContain("Selected provider: Piper TTS (ambient-cli:piper:tool:piper_tts)");
    expect(voiceStatusText(status)).toContain("Output state: off");
    expect(voiceStatusText(status)).toContain("Ambient voice output is disabled");
    expect(voiceStatusText(status)).toContain("Preferred voices by provider:");
    expect(voiceStatusText(status)).toContain("Use ambient_voice_select with exact providerCapabilityId");
    expect(voiceStatusText(status)).toContain("Use ambient_voice_policy_update");
  });

  it("reports voice output ready only when policy is enabled and the provider is available", () => {
    const status = buildVoiceStatus(settings({ enabled: true, autoplay: true }), [provider({ local: true })]);

    expect(status.outputState).toMatchObject({
      state: "ready",
      label: "ready",
      detail: "Piper TTS is selected and available for assistant voice synthesis.",
    });
    expect(voiceStatusText(status)).toContain("Output state: ready");
  });

  it("reports stopped local voice runtimes separately from broken providers", () => {
    const status = buildVoiceStatus(settings({ enabled: true }), [
      provider({
        available: false,
        availabilityReason: "Voice provider validation pending: runtime stopped",
        diagnostics: {
          healthStatus: "passed",
          healthError: "runtime stopped",
          missingHints: ["Start Piper before enabling voice output."],
          runtimeState: {
            schemaVersion: "ambient-voice-provider-runtime-state-v1",
            status: "stopped",
            running: false,
            modelRuntimeId: "piper-runtime",
            modelId: "rhasspy/piper/en_US-lessac-medium",
            endpoint: "http://127.0.0.1:59201",
            estimatedResidentMemoryBytes: 2 * 1024 * 1024 * 1024,
            reason: "daemon stopped",
          },
        },
      }),
    ]);

    expect(status.outputState).toMatchObject({
      state: "runtime-stopped",
      label: "runtime stopped",
    });
    expect(voiceStatusText(status)).toContain("Output state: runtime stopped");
    expect(voiceStatusText(status)).toContain("local voice runtime is stopped");
  });

  it("plans provider switches while preserving unrelated voice policy fields", () => {
    const current = settings({
      providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
      voiceId: "rachel",
      enabled: true,
      autoplay: true,
      format: "mp3",
    });
    const plan = planVoiceSelection(
      { providerCapabilityId: "ambient-cli:piper:tool:piper_tts", reason: "User asked for local voice." },
      current,
      [
        provider({ capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", label: "ElevenLabs", packageName: "ambient-elevenlabs-tts", command: "elevenlabs_tts", voices: [{ id: "rachel", label: "Rachel" }], format: "mp3", formats: ["mp3"] }),
        provider({ capabilityId: "ambient-cli:piper:tool:piper_tts" }),
      ],
    );

    expect(plan.nextSettings).toMatchObject({
      enabled: true,
      autoplay: true,
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voiceId: "en_US-lessac-medium",
      maxChars: 1500,
      longReply: "summarize",
      format: "wav",
      preferredVoicesByProvider: {
        "ambient-cli:piper:tool:piper_tts": "en_US-lessac-medium",
      },
    });
    expect(voiceSelectApprovalDetail(plan, "/tmp/workspace")).toContain("ElevenLabs");
    expect(voiceSelectApprovalDetail(plan, "/tmp/workspace")).toContain("Piper TTS");
  });

  it("switches voice within the current provider", () => {
    const plan = planVoiceSelection(
      { voiceId: "en_US-amy-medium" },
      settings(),
      [provider({ voices: [{ id: "en_US-lessac-medium", label: "Lessac" }, { id: "en_US-amy-medium", label: "Amy" }] })],
    );

    expect(plan.nextSettings.providerCapabilityId).toBe("ambient-cli:piper:tool:piper_tts");
    expect(plan.nextSettings.voiceId).toBe("en_US-amy-medium");
    expect(plan.nextSettings.preferredVoicesByProvider).toEqual({
      "ambient-cli:piper:tool:piper_tts": "en_US-amy-medium",
    });
    expect(voiceSelectText(plan, plan.nextSettings)).toContain("Lessac");
    expect(voiceSelectText(plan, plan.nextSettings)).toContain("Amy");
  });

  it("uses a provider's preferred voice when switching back without an explicit voice", () => {
    const current = settings({
      providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
      voiceId: "rachel",
      preferredVoicesByProvider: {
        "ambient-cli:piper:tool:piper_tts": "en_US-amy-medium",
        "ambient-cli:elevenlabs:tool:elevenlabs_tts": "rachel",
      },
    });
    const plan = planVoiceSelection(
      { providerCapabilityId: "ambient-cli:piper:tool:piper_tts" },
      current,
      [
        provider({ capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", label: "ElevenLabs", packageName: "ambient-elevenlabs-tts", command: "elevenlabs_tts", voices: [{ id: "rachel", label: "Rachel" }], format: "mp3", formats: ["mp3"] }),
        provider({ voices: [{ id: "en_US-lessac-medium", label: "Lessac" }, { id: "en_US-amy-medium", label: "Amy" }] }),
      ],
    );

    expect(plan.nextSettings.voiceId).toBe("en_US-amy-medium");
    expect(voiceSelectApprovalDetail(plan, "/tmp/workspace")).toContain("Amy");
  });

  it("marks provider and voice selection requests as no-op when settings already match", () => {
    const plan = planVoiceSelection(
      { providerCapabilityId: "ambient-cli:piper:tool:piper_tts", voiceId: "en_US-lessac-medium", format: "wav" },
      settings({ preferredVoicesByProvider: { "ambient-cli:piper:tool:piper_tts": "en_US-lessac-medium" } }),
      [provider()],
    );

    expect(plan.hasChanges).toBe(false);
    expect(voiceSelectNoopText(plan)).toContain("already configured");
    expect(voiceSelectNoopText(plan)).toContain("no approval was required");
  });

  it("allows unique provider and voice aliases but rejects ambiguity", () => {
    const providers = [
      provider({ label: "Piper TTS" }),
      provider({ capabilityId: "ambient-cli:kokoro:tool:kokoro_tts", label: "Kokoro TTS", packageName: "ambient-kokoro-onnx-tts", command: "kokoro_tts", voices: [{ id: "af_sky", label: "Sky" }] }),
    ];

    expect(planVoiceSelection({ providerAlias: "Kokoro TTS", voiceAlias: "Sky" }, settings({ providerCapabilityId: undefined, voiceId: undefined }), providers).nextSettings).toMatchObject({
      providerCapabilityId: "ambient-cli:kokoro:tool:kokoro_tts",
      voiceId: "af_sky",
    });
    expect(() => planVoiceSelection({ providerAlias: "piper_tts" }, settings(), [
      provider({ capabilityId: "one", command: "piper_tts" }),
      provider({ capabilityId: "two", command: "piper_tts" }),
    ])).toThrow(/ambiguous/);
  });

  it("rejects unavailable providers, unknown voices, and unsupported formats", () => {
    expect(() => planVoiceSelection(
      { providerCapabilityId: "ambient-cli:piper:tool:piper_tts" },
      settings(),
      [provider({ available: false, availabilityReason: "health check failed" })],
    )).toThrow(/not available/);

    expect(() => planVoiceSelection({ voiceId: "missing" }, settings(), [provider()])).toThrow(/not declared/);
    expect(() => planVoiceSelection({ format: "mp3" }, settings(), [provider({ formats: ["wav"], format: "wav" })])).toThrow(/does not support mp3/);
  });

  it("builds a read-only voice clone plan for cloning-capable providers", () => {
    const plan = buildVoiceClonePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [
        provider({
          capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
          label: "ElevenLabs",
          packageName: "ambient-elevenlabs-tts",
          command: "elevenlabs_tts",
          format: "mp3",
          formats: ["mp3"],
          local: false,
          voiceCloning: {
            supported: true,
            mode: "cloud",
            inputs: {
              audioFormats: ["mp3", "wav"],
              minDurationSeconds: 30,
              maxDurationSeconds: 1800,
              minSamples: 1,
              transcript: "optional",
            },
            requiresConsent: true,
            requiresSecret: ["ELEVENLABS_API_KEY"],
            networkHosts: ["api.elevenlabs.io"],
            costNote: "May consume credits.",
            privacyNote: "Uploads source audio.",
            output: { creates: ["provider-voice-id", "dynamic-cache-voice"], appearsInDynamicCatalog: true },
          },
        }),
      ],
    );

    expect(plan.supported).toBe(true);
    expect(plan.selected).toBe(true);
    expect(voiceClonePlanText(plan)).toContain("Voice cloning supported: true");
    expect(voiceClonePlanText(plan)).toContain("Required secrets: ELEVENLABS_API_KEY");
    expect(voiceClonePlanText(plan)).toContain("explicitly confirm they have rights and consent");
    expect(voiceClonePlanText(plan)).toContain("read-only plan");
  });

  it("builds a read-only voice clone plan for unsupported providers", () => {
    const plan = buildVoiceClonePlan({}, settings(), [provider()]);

    expect(plan.supported).toBe(false);
    expect(voiceClonePlanText(plan)).toContain("does not declare voice cloning support");
    expect(voiceClonePlanText(plan)).toContain("Offer to choose a different installed voice provider");
  });

  it("builds a blocked clone create preview when consent or source files are missing", () => {
    const preview = buildVoiceCloneCreatePreview(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", sourceAudioFiles: [], consentConfirmed: false },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider()],
      [],
    );

    expect(preview.readyForCreateApproval).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("consent"),
      expect.stringContaining("At least one"),
    ]));
    expect(voiceCloneCreatePreviewText(preview)).toContain("No audio was uploaded");
  });

  it("builds a ready clone create preview for valid source audio metadata", () => {
    const preview = buildVoiceCloneCreatePreview(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", sourceAudioFiles: ["samples/voice.wav"], consentConfirmed: true, cloneName: "Demo voice" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider()],
      [{ path: "samples/voice.wav", bytes: 1024, extension: "wav" }],
    );

    expect(preview.readyForCreateApproval).toBe(true);
    expect(preview.cloneName).toBe("Demo voice");
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringContaining("separate approval")]));
    expect(voiceCloneCreatePreviewText(preview)).toContain("Ready for create approval: true");
  });

  it("plans approved clone creation only when a reviewed create command is declared", () => {
    const plan = buildVoiceCloneCreatePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", sourceAudioFiles: ["samples/voice.wav"], consentConfirmed: true, cloneName: "Demo voice", selectCreatedVoice: true },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider()],
      [{ path: "samples/voice.wav", bytes: 1024, extension: "wav" }],
    );

    expect(plan.createCommand).toBe("elevenlabs_tts");
    expect(plan.selectCreatedVoice).toBe(true);
    expect(voiceCloneCreateApprovalDetail(plan, "/tmp/workspace")).toContain("elevenlabs_tts --clone-create");
    expect(voiceCloneCreateText(plan, { voiceId: "voice-123", label: "Demo voice", status: "ready" }, { selected: true, cacheUpdated: true, durationMs: 123 })).toContain("Voice: Demo voice (voice-123)");
  });

  it("rejects clone creation when the provider has no reviewed create command", () => {
    const voiceCloning = { ...cloningProvider().voiceCloning! };
    delete voiceCloning.createCommand;
    expect(() => buildVoiceCloneCreatePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", sourceAudioFiles: ["samples/voice.wav"], consentConfirmed: true, cloneName: "Demo voice" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider({ voiceCloning })],
      [{ path: "samples/voice.wav", bytes: 1024, extension: "wav" }],
    )).toThrow(/no reviewed createCommand/);
  });

  it("parses clone create command JSON metadata", () => {
    expect(parseVoiceCloneCreateStdout(JSON.stringify({ voice_id: "voice-123", name: "Demo voice", status: "ready", cloned: true }))).toEqual({
      voiceId: "voice-123",
      label: "Demo voice",
      status: "ready",
      cloned: true,
    });
    expect(parseVoiceCloneCreateStdout(JSON.stringify({
      voiceId: "voice-456",
      status: "training",
      progress_percent: 42.4,
      retry_after_seconds: "30",
      dashboard_url: "https://example.test/voices/voice-456?token=not-a-secret",
      verification_url: "https://verify.example.test/voices/voice-456?token=not-a-secret#step",
      failure_reason: "needs more source audio",
    }))).toMatchObject({
      voiceId: "voice-456",
      status: "training",
      progressPercent: 42,
      retryAfterSeconds: 30,
      dashboardUrl: "https://example.test/voices/voice-456",
      verificationUrl: "https://verify.example.test/voices/voice-456",
      failureReason: "needs more source audio",
    });
    expect(parseVoiceCloneCreateStdout(JSON.stringify({
      voiceId: "local-voice",
      status: "ready",
      local_artifact_paths: [
        ".ambient/voice-models/local-voice/model.onnx",
        "/tmp/not-workspace-safe.onnx",
        "../escape.onnx",
        "https://example.test/model.onnx",
        ".ambient/voice-models/local-voice/model.onnx",
      ],
    }))).toMatchObject({
      voiceId: "local-voice",
      localArtifactPaths: [".ambient/voice-models/local-voice/model.onnx"],
    });
    expect(() => parseVoiceCloneCreateStdout("{}")).toThrow(/voiceId/);
  });

  it("plans clone status and delete management for reviewed commands", () => {
    const plan = buildVoiceCloneManagePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", voiceId: "clone-1", reason: "cleanup" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider({ voices: [{ id: "clone-1", label: "Demo clone" }] })],
    );

    expect(plan.statusCommand).toBe("elevenlabs_tts");
    expect(plan.deleteCommand).toBe("elevenlabs_tts");
    expect(voiceCloneStatusText(plan, { voiceId: "clone-1", label: "Demo clone", status: "ready", cloned: true })).toContain("Provider status: ready");
    expect(voiceCloneDeleteApprovalDetail(plan, "/tmp/workspace")).toContain("cannot be undone");
    expect(voiceCloneDeleteText(plan, { voiceId: "clone-1", deleted: true }, { cacheUpdated: true, selectedVoiceCleared: true, durationMs: 12 })).toContain("Selected voice cleared: true");
  });

  it("normalizes provider clone readiness states and gives Pi actionable next steps", () => {
    const plan = buildVoiceCloneManagePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", voiceId: "clone-1" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider({ voices: [{ id: "clone-1", label: "Demo clone" }] })],
    );

    const verification = summarizeVoiceCloneStatus(plan.provider, {
      voiceId: "clone-1",
      status: "requires_verification",
      cloned: true,
      providerId: "elevenlabs",
      verificationUrl: "https://example.test/verify/clone-1",
    });
    expect(verification).toMatchObject({
      readiness: "action-required",
      readyForSelection: false,
      shouldRetryStatus: false,
    });
    expect(verification.nextSteps.join("\n")).toContain("ElevenLabs verification");
    expect(verification.nextSteps.join("\n")).toContain("Open the provider verification link only if the user asks");
    expect(voiceCloneStatusText(plan, { voiceId: "clone-1", status: "requires_verification", cloned: true, providerId: "elevenlabs" })).toContain("Readiness: action-required");

    const pending = summarizeVoiceCloneStatus(cloningProvider({ providerId: "cartesia" }), {
      voiceId: "clone-2",
      status: "training",
      cloned: true,
      providerId: "cartesia",
    });
    expect(pending).toMatchObject({
      readiness: "pending",
      readyForSelection: false,
      shouldRetryStatus: true,
    });
    expect(pending.nextSteps.join("\n")).toContain("Retry ambient_voice_clone_status");

    const pendingWithMetadata = summarizeVoiceCloneStatus(cloningProvider({ providerId: "cartesia" }), {
      voiceId: "clone-2",
      status: "processing",
      cloned: true,
      providerId: "cartesia",
      progressPercent: 67,
      retryAfterSeconds: 45,
    });
    expect(pendingWithMetadata).toMatchObject({
      readiness: "pending",
      progressPercent: 67,
      retryAfterSeconds: 45,
    });
    expect(pendingWithMetadata.message).toContain("Progress is 67%");
    expect(pendingWithMetadata.nextSteps.join("\n")).toContain("45 seconds");

    const failed = summarizeVoiceCloneStatus(plan.provider, { voiceId: "clone-3", status: "rejected", cloned: true });
    expect(failed).toMatchObject({
      readiness: "failed",
      readyForSelection: false,
      shouldRetryStatus: false,
    });
    expect(failed.nextSteps.join("\n")).toContain("delete the failed clone");

    const failedWithReason = voiceCloneStatusText(plan, {
      voiceId: "clone-3",
      status: "failed",
      cloned: true,
      failureReason: "source audio was too noisy",
      dashboardUrl: "https://example.test/voices/clone-3",
      verificationUrl: "https://example.test/verify/clone-3",
    });
    expect(failedWithReason).toContain("Failure reason: source audio was too noisy");
    expect(failedWithReason).toContain("Provider dashboard: https://example.test/voices/clone-3");
    expect(failedWithReason).toContain("Provider verification: https://example.test/verify/clone-3");

    const ready = summarizeVoiceCloneStatus(plan.provider, { voiceId: "clone-4", status: "completed", cloned: true });
    expect(ready).toMatchObject({
      readiness: "ready",
      readyForSelection: true,
      shouldRetryStatus: false,
    });
  });

  it("surfaces clone cache and local artifact reconcile guidance", () => {
    const plan = buildVoiceCloneManagePlan(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", voiceId: "clone-1" },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider({ voices: [{ id: "clone-1", label: "Demo clone" }] })],
    );
    const result = {
      voiceId: "clone-1",
      status: "ready",
      cloned: true,
      localArtifactPaths: [".ambient/voice-models/clone-1/model.onnx", ".ambient/voice-models/clone-1/config.json"],
    };

    const summary = summarizeVoiceCloneStatus(plan.provider, result, {
      localArtifacts: [
        { path: ".ambient/voice-models/clone-1/model.onnx", exists: true },
        { path: ".ambient/voice-models/clone-1/config.json", exists: false },
      ],
    });

    expect(summary).toMatchObject({
      readiness: "ready",
      readyForSelection: false,
      cacheStatus: "missing",
      missingLocalArtifactPaths: [".ambient/voice-models/clone-1/config.json"],
    });
    expect(summary.nextSteps.join("\n")).toContain("dynamic voice cache does not contain");
    expect(summary.nextSteps.join("\n")).toContain("local cloned-model artifacts are missing");
    const statusText = voiceCloneStatusText(plan, result, {
      localArtifacts: [
        { path: ".ambient/voice-models/clone-1/model.onnx", exists: true },
        { path: ".ambient/voice-models/clone-1/config.json", exists: false },
      ],
    });
    expect(statusText).toContain("Local artifacts: .ambient/voice-models/clone-1/model.onnx");
    expect(statusText).toContain("Dynamic cache: missing");
    expect(statusText).toContain("Missing local artifacts: .ambient/voice-models/clone-1/config.json");
  });

  it("parses clone delete command JSON metadata", () => {
    expect(parseVoiceCloneDeleteStdout(JSON.stringify({ voice_id: "clone-1", deleted: true, providerId: "elevenlabs" }), "clone-1")).toEqual({
      voiceId: "clone-1",
      deleted: true,
      providerId: "elevenlabs",
    });
    expect(parseVoiceCloneDeleteStdout(JSON.stringify({
      voiceId: "clone-1",
      deleted: true,
      removed_artifact_paths: [".ambient/voice-models/clone-1/model.onnx", "/tmp/nope"],
    }), "clone-1")).toEqual({
      voiceId: "clone-1",
      deleted: true,
      removedArtifactPaths: [".ambient/voice-models/clone-1/model.onnx"],
    });
    expect(parseVoiceCloneDeleteStdout(undefined, "clone-1")).toEqual({ voiceId: "clone-1", deleted: true });
  });

  it("rejects clone create preview files that do not match accepted formats", () => {
    const preview = buildVoiceCloneCreatePreview(
      { providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts", sourceAudioFiles: ["samples/voice.txt"], consentConfirmed: true },
      settings({ providerCapabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts" }),
      [cloningProvider()],
      [{ path: "samples/voice.txt", bytes: 1024, extension: "txt" }],
    );

    expect(preview.readyForCreateApproval).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([expect.stringContaining("accepted formats")]));
  });

  it("plans voice policy updates without changing provider selection", () => {
    const current = settings({ enabled: true, autoplay: true, mode: "assistant-final", longReply: "summarize", maxChars: 1500 });
    const plan = planVoicePolicyUpdate(
      { enabled: false, autoplay: false, mode: "off", longReply: "skip", maxChars: 600, reason: "User asked voice to stay quiet." },
      current,
    );

    expect(plan.nextSettings).toMatchObject({
      providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
      voiceId: "en_US-lessac-medium",
      enabled: false,
      autoplay: false,
      mode: "off",
      longReply: "skip",
      maxChars: 600,
      format: "wav",
    });
    expect(voicePolicyText(plan, plan.nextSettings)).toContain("Ambient voice policy updated");
    expect(voicePolicyApprovalDetail(plan, "/tmp/workspace")).toContain("Long reply: summarize -> skip");
  });

  it("marks voice policy requests as no-op when settings already match", () => {
    const plan = planVoicePolicyUpdate(
      { enabled: false, autoplay: false, mode: "assistant-final", longReply: "summarize", maxChars: 1500 },
      settings(),
    );

    expect(plan.hasChanges).toBe(false);
    expect(voicePolicyNoopText(plan)).toContain("already configured");
    expect(voicePolicyNoopText(plan)).toContain("no approval was required");
  });

  it("rejects empty and invalid voice policy updates", () => {
    expect(() => planVoicePolicyUpdate({}, settings())).toThrow(/No voice policy changes/);
    expect(() => planVoicePolicyUpdate({ maxChars: 99 }, settings())).toThrow(/between 100 and 10000/);
    expect(() => planVoicePolicyUpdate({ mode: "bad" as any }, settings())).toThrow(/Unsupported voice mode/);
    expect(() => planVoicePolicyUpdate({ longReply: "bad" as any }, settings())).toThrow(/Unsupported long-reply/);
  });
});

function settings(input: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: false,
    mode: "assistant-final",
    autoplay: false,
    providerCapabilityId: "ambient-cli:piper:tool:piper_tts",
    voiceId: "en_US-lessac-medium",
    maxChars: 1500,
    longReply: "summarize",
    format: "wav",
    artifactCacheMaxMb: 30,
    ...input,
  };
}

function cloningProvider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return provider({
    capabilityId: "ambient-cli:elevenlabs:tool:elevenlabs_tts",
    label: "ElevenLabs",
    packageName: "ambient-elevenlabs-tts",
    command: "elevenlabs_tts",
    format: "mp3",
    formats: ["mp3"],
    local: false,
    voiceCloning: {
      supported: true,
      createCommand: "elevenlabs_tts",
      statusCommand: "elevenlabs_tts",
      deleteCommand: "elevenlabs_tts",
      mode: "cloud",
      inputs: {
        audioFormats: ["mp3", "wav"],
        minDurationSeconds: 30,
        maxDurationSeconds: 1800,
        minSamples: 1,
        maxSamples: 3,
        transcript: "optional",
      },
      requiresConsent: true,
      requiresSecret: ["ELEVENLABS_API_KEY"],
      networkHosts: ["api.elevenlabs.io"],
      output: { creates: ["provider-voice-id", "dynamic-cache-voice"], appearsInDynamicCatalog: true },
    },
    ...input,
  });
}

function provider(input: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  const capabilityId = input.capabilityId ?? "ambient-cli:piper:tool:piper_tts";
  return {
    packageId: input.packageId ?? capabilityId,
    packageName: input.packageName ?? "ambient-piper-tts",
    command: input.command ?? "piper_tts",
    capabilityId,
    providerId: input.providerId ?? capabilityId,
    label: input.label ?? "Piper TTS",
    format: input.format ?? "wav",
    formats: input.formats ?? ["wav"],
    voices: input.voices ?? [{ id: "en_US-lessac-medium", label: "Lessac" }],
    local: input.local ?? true,
    installed: input.installed ?? true,
    available: input.available ?? true,
    availabilityReason: input.availabilityReason ?? "ready",
    ...(input.description ? { description: input.description } : {}),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    ...(input.voiceCloning ? { voiceCloning: input.voiceCloning } : {}),
  };
}
