import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeAmbientCliPackage,
  discoverAmbientCliPackages,
  discoverAmbientCliSttProviders,
  ensureFirstPartyAmbientCliPackages,
  installAmbientCliPackageSource,
  previewAmbientCliPackageInstallSource,
  runAmbientCliPackageCommand,
  searchAmbientCliCapabilities,
} from "./ambientCliPackages";

describe("Ambient CLI bundled provider contracts", () => {
  it("installs the bundled first-party Qwen3-ASR STT provider and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-qwen-stt-"));
    const previousBinary = process.env.AMBIENT_QWEN3_ASR_BINARY;
    const previousFakeTranscript = process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
    try {
      process.env.AMBIENT_QWEN3_ASR_BINARY = join(workspace, "missing-llama-mtmd-cli");
      delete process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-qwen3-asr"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          source: "bundled:ambient-qwen3-asr",
          status: "installed",
        }),
      ]);

      const providers = await discoverAmbientCliSttProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-qwen3-asr",
          command: "qwen3_asr_transcribe",
          label: "Qwen3-ASR Local",
          defaultLanguage: "English",
          local: true,
          installed: true,
          available: false,
          availabilityReason: expect.stringContaining("STT provider validation pending"),
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            healthError: expect.stringContaining("Configured Qwen3-ASR binary does not exist"),
            missingHints: expect.arrayContaining(["Install a llama.cpp build that includes llama-mtmd-cli."]),
          }),
        }),
      ]);

      process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT = "open settings by voice";
      const audioPath = join(workspace, "utterance.wav");
      const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
      await writeFile(audioPath, silentWav(250));

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-qwen3-asr",
        command: "qwen3_asr_transcribe",
        args: ["--audio", audioPath, "--language", "English", "--output-json", outputJson],
      });

      expect(JSON.parse(result.stdout ?? "{}")).toMatchObject({
        text: "open settings by voice",
        language: "English",
        providerId: "qwen3-asr-0.6b-llamacpp",
      });
      await expect(readFile(outputJson, "utf8")).resolves.toContain("open settings by voice");
    } finally {
      if (previousBinary === undefined) {
        delete process.env.AMBIENT_QWEN3_ASR_BINARY;
      } else {
        process.env.AMBIENT_QWEN3_ASR_BINARY = previousBinary;
      }
      if (previousFakeTranscript === undefined) {
        delete process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT;
      } else {
        process.env.AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT = previousFakeTranscript;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs the bundled first-party faster-whisper STT provider and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-faster-whisper-stt-"));
    const previousFakeTranscript = process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT;
    try {
      process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT = "open settings by faster whisper";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-faster-whisper-stt"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          source: "bundled:ambient-faster-whisper-stt",
          status: "installed",
        }),
      ]);

      const providers = await discoverAmbientCliSttProviders(workspace);
      expect(providers).toEqual([
        expect.objectContaining({
          packageName: "ambient-faster-whisper-stt",
          command: "faster_whisper_transcribe",
          label: "faster-whisper tiny.en Local",
          languages: ["English"],
          defaultLanguage: "English",
          local: true,
          installed: true,
          available: true,
          diagnostics: expect.objectContaining({
            healthStatus: "passed",
            missingHints: [],
            distribution: expect.objectContaining({
              packageType: "adapter-only",
              bundledRuntimeBinaries: false,
              bundledPythonWheels: false,
              bundledModelWeights: false,
              bundledModelAssets: false,
            }),
            installPlan: expect.objectContaining({
              resolver: "uv",
              packages: ["faster-whisper==1.1.1", "requests"],
              defaultModel: "tiny.en",
            }),
          }),
        }),
      ]);

      const audioPath = join(workspace, "utterance.wav");
      const outputJson = join(workspace, ".ambient", "stt", "thread-1", "utt-1.json");
      await writeFile(audioPath, silentWav(250));

      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-faster-whisper-stt",
        command: "faster_whisper_transcribe",
        args: ["--audio", audioPath, "--language", "English", "--output-json", outputJson],
      });

      expect(JSON.parse(result.stdout ?? "{}")).toMatchObject({
        text: "open settings by faster whisper",
        language: "English",
        providerId: "faster-whisper-tiny-en-cpu",
      });
      await expect(readFile(outputJson, "utf8")).resolves.toContain("open settings by faster whisper");
    } finally {
      if (previousFakeTranscript === undefined) {
        delete process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT;
      } else {
        process.env.AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT = previousFakeTranscript;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("installs bundled HyperFrames, exposes discovery/describe metadata, and returns render artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-hyperframes-"));
    const previousFakeRender = process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
    try {
      process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = "1";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-hyperframes"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-hyperframes",
          source: "bundled:ambient-hyperframes",
          status: "installed",
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, {
        query: "deterministic title card authored motion video mp4",
        limit: 5,
        includeHealth: true,
      });
      expect(search.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            packageName: "ambient-hyperframes",
            availability: "available",
            commands: expect.arrayContaining([
              expect.objectContaining({ name: "hyperframes_doctor", health: "passed" }),
              expect.objectContaining({ name: "hyperframes_render", health: "passed" }),
            ]),
            skills: [expect.objectContaining({ name: "hyperframes" })],
          }),
        ]),
      );

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-hyperframes",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-hyperframes",
        availability: "available",
      });
      expect(description.commands.map((command) => command.name)).toEqual([
        "hyperframes_doctor",
        "hyperframes_setup_plan",
        "hyperframes_init",
        "hyperframes_inspect",
        "hyperframes_render",
      ]);
      expect(description.skills[0]?.text).toContain("Heavy setup is lazy and approval-gated");

      const init = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_init",
        args: ["--project-dir", "scene", "--title", "Ambient title card"],
      });
      expect(JSON.parse(init.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-hyperframes",
        status: "initialized",
      });

      const inspect = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_inspect",
        args: ["--source", "scene/comp.html", "--json"],
      });
      expect(JSON.parse(inspect.stdout ?? "{}")).toMatchObject({
        status: "passed",
        composition: { width: 1280, height: 720, duration: 3, fps: 30 },
      });

      const render = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-hyperframes",
        command: "hyperframes_render",
        args: ["--source", "scene/comp.html", "--output", ".ambient/hyperframes/renders/title-card.mp4", "--json"],
      });
      const rendered = JSON.parse(render.stdout ?? "{}");
      expect(rendered).toMatchObject({
        packageName: "ambient-hyperframes",
        status: "rendered",
        mode: "fake",
        media: { bytes: expect.any(Number) },
      });
      expect(rendered.media.bytes).toBeGreaterThan(0);
      await expect(readFile(rendered.metadataPath, "utf8")).resolves.toContain("artifactContract");
    } finally {
      if (previousFakeRender === undefined) {
        delete process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER;
      } else {
        process.env.AMBIENT_HYPERFRAMES_FAKE_RENDER = previousFakeRender;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs bundled hosted image generation and writes deterministic image artifacts", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-hosted-image-"));
    const previousFakeGeneration = process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION;
    try {
      process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION = "1";

      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-imagegen"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-imagegen",
          source: "bundled:ambient-imagegen",
          status: "installed",
        }),
      ]);

      const search = await searchAmbientCliCapabilities(workspace, {
        query: "Google Nano Banana Pro Flux OpenAI hosted image generation",
        limit: 5,
        includeHealth: true,
      });
      expect(search.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            packageName: "ambient-imagegen",
            availability: "available",
            commands: expect.arrayContaining([
              expect.objectContaining({ name: "hosted_image_doctor", health: "passed" }),
              expect.objectContaining({ name: "hosted_image_generate", health: "passed" }),
            ]),
            skills: [expect.objectContaining({ name: "ambient-imagegen" })],
          }),
        ]),
      );

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-imagegen",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-imagegen",
        availability: "available",
      });
      expect(description.env.map((env) => env.name)).toEqual(
        expect.arrayContaining([
          "OPENAI_API_KEY",
          "GEMINI_API_KEY",
          "FAL_KEY",
          "REPLICATE_API_TOKEN",
          "STABILITY_API_KEY",
          "IDEOGRAM_API_KEY",
        ]),
      );
      expect(description.skills[0]?.text).toContain("Google Nano Banana Pro");

      const doctor = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_doctor",
        args: ["--json"],
      });
      expect(JSON.parse(doctor.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-imagegen",
        ready: true,
        providers: expect.arrayContaining([
          expect.objectContaining({ id: "openai", defaultModel: "gpt-image-2" }),
          expect.objectContaining({ id: "google-nano-banana-pro", defaultModel: "gemini-3-pro-image" }),
          expect.objectContaining({ id: "flux", defaultModel: "fal-ai/flux/dev" }),
        ]),
      });

      const generated = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_generate",
        args: [
          "--provider",
          "google-nano-banana-pro",
          "--prompt",
          "Tiny test icon for Ambient hosted image generation.",
          "--size",
          "16x16",
          "--output",
          ".ambient/hosted-images/test-icon.png",
          "--json",
        ],
      });
      const payload = JSON.parse(generated.stdout ?? "{}");
      expect(payload).toMatchObject({
        packageName: "ambient-imagegen",
        status: "generated",
        fake: true,
        provider: "google-nano-banana-pro",
        model: "gemini-3-pro-image",
        image: {
          mimeType: "image/png",
          width: 16,
          height: 16,
          bytes: expect.any(Number),
        },
      });
      expect(payload.image.bytes).toBeGreaterThan(0);
      await expect(readFile(payload.outputPath)).resolves.toHaveLength(payload.image.bytes);
      await expect(readFile(payload.metadataPath, "utf8")).resolves.toContain("secretValuesIncluded");

      const reconciled = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-imagegen",
        command: "hosted_image_generate",
        args: [
          "--provider",
          "google-nano-banana-pro",
          "--prompt",
          "Tiny extension correction fixture.",
          "--size",
          "2x2",
          "--format",
          "jpeg",
          "--output",
          ".ambient/hosted-images/requested-jpeg.jpg",
          "--json",
        ],
      });
      const reconciledPayload = JSON.parse(reconciled.stdout ?? "{}");
      expect(reconciledPayload).toMatchObject({
        packageName: "ambient-imagegen",
        status: "generated",
        fake: true,
        image: {
          mimeType: "image/png",
        },
        outputPath: expect.stringMatching(/requested-jpeg\.png$/),
        metadataPath: expect.stringMatching(/requested-jpeg\.png\.json$/),
      });
      const reconciledMetadata = JSON.parse(await readFile(reconciledPayload.metadataPath, "utf8"));
      expect(reconciledMetadata.request).toMatchObject({
        format: "jpeg",
        requestedOutputPath: expect.stringMatching(/requested-jpeg\.jpg$/),
      });
      await expect(readFile(reconciledPayload.outputPath)).resolves.toHaveLength(reconciledPayload.image.bytes);
    } finally {
      if (previousFakeGeneration === undefined) {
        delete process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION;
      } else {
        process.env.AMBIENT_HOSTED_IMAGE_FAKE_GENERATION = previousFakeGeneration;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs bundled TinyStyler and runs its deterministic contract path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-tinystyler-"));
    const previousPwd = process.env.PWD;
    try {
      const shadowRoot = join(workspace, "shadow-launch-cwd");
      const shadowPackageRoot = join(shadowRoot, "resources", "ambient-cli-packages", "ambient-tinystyler");
      await mkdir(shadowPackageRoot, { recursive: true });
      await writeFile(
        join(shadowPackageRoot, "ambient-cli.json"),
        JSON.stringify({
          name: "ambient-tinystyler-shadow",
          version: "9.9.9",
          commands: {
            shadow: {
              command: "python3",
              args: ["-c", "raise SystemExit(99)"],
            },
          },
        }),
        "utf8",
      );
      process.env.PWD = shadowRoot;

      const preview = await previewAmbientCliPackageInstallSource(workspace, {
        source: "bundled:ambient-tinystyler",
      });
      expect(preview).toMatchObject({
        source: "bundled:ambient-tinystyler",
        installable: true,
        candidate: expect.objectContaining({ name: "ambient-tinystyler" }),
      });

      const installed = await installAmbientCliPackageSource(workspace, {
        source: "bundled:ambient-tinystyler",
      });
      expect(installed).toMatchObject({
        name: "ambient-tinystyler",
        source: expect.stringMatching(/^\.\/\.ambient\/cli-packages\/imported\/ambient-tinystyler-/),
        installed: true,
      });

      const search = await searchAmbientCliCapabilities(workspace, {
        query: "TinyStyler writing style transfer profile examples",
        limit: 5,
        includeHealth: true,
      });
      const tinystylerSearch = search.results.find((result) => result.packageName === "ambient-tinystyler");
      expect(tinystylerSearch).toMatchObject({
        packageName: "ambient-tinystyler",
        availability: "available",
        commands: expect.arrayContaining([
          expect.objectContaining({ name: "tinystyler_doctor", health: "passed" }),
          expect.objectContaining({ name: "tinystyler_profile" }),
          expect.objectContaining({ name: "tinystyler_transfer" }),
        ]),
        skills: [expect.objectContaining({ name: "ambient-tinystyler" })],
      });
      expect(tinystylerSearch?.commands.find((command) => command.name === "tinystyler_profile")?.health).not.toBe("passed");
      expect(tinystylerSearch?.commands.find((command) => command.name === "tinystyler_transfer")?.health).not.toBe("passed");

      const description = await describeAmbientCliPackage(workspace, {
        packageName: "ambient-tinystyler",
        includeSkill: true,
      });
      expect(description.package).toMatchObject({
        name: "ambient-tinystyler",
        availability: "available",
      });
      expect(description.commands.map((command) => command.name)).toEqual([
        "tinystyler_doctor",
        "tinystyler_profile",
        "tinystyler_transfer",
      ]);
      expect(description.skills[0]?.text).toContain("reusable TinyStyler style profiles");

      const doctor = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_doctor",
        args: ["--json"],
      });
      expect(JSON.parse(doctor.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "contract_ready",
        ready: false,
        realRuntimeImplemented: true,
        transferRuntimeImplemented: true,
        revisions: {
          tinystyler: "2a879107b2ec342e57170b82cdc344d5179fa32b",
        },
      });

      const examplesPath = join(workspace, "examples.txt");
      const sourcePath = join(workspace, "source.txt");
      const profilePath = join(workspace, ".ambient", "tinystyler", "profiles", "support.json");
      const outputPath = join(workspace, ".ambient", "tinystyler", "outputs", "styled.txt");
      await writeFile(examplesPath, "Thanks for the careful report.\n\nI can help with that next step.\n", "utf8");
      await writeFile(sourcePath, "Please inspect the logs and suggest the next action.", "utf8");

      const profile = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_profile",
        args: [
          "--examples-file",
          examplesPath,
          "--output-profile",
          profilePath,
          "--profile-name",
          "support-replies",
          "--seed",
          "11",
          "--fake",
          "--json",
        ],
      });
      expect(JSON.parse(profile.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "profile_created",
        fake: true,
        profileName: "support-replies",
      });
      const savedProfile = JSON.parse(await readFile(profilePath, "utf8"));
      expect(savedProfile.embedding.values).toHaveLength(768);
      expect(savedProfile.sourceSummary.rawTextPersisted).toBe(false);
      expect(savedProfile.sourceSummary.exactSourceVerifiersPersisted).toBe(false);
      expect(savedProfile.sourceSummary).not.toHaveProperty("sourceHashes");
      expect(JSON.stringify(savedProfile)).not.toContain("careful report");

      const transfer = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-tinystyler",
        command: "tinystyler_transfer",
        args: ["--input-file", sourcePath, "--profile", profilePath, "--output-file", outputPath, "--seed", "11", "--fake", "--json"],
      });
      expect(JSON.parse(transfer.stdout ?? "{}")).toMatchObject({
        packageName: "ambient-tinystyler",
        status: "transfer_created",
        fake: true,
        profileName: "support-replies",
      });
      expect(JSON.parse(transfer.stdout ?? "{}")).not.toHaveProperty("textPreview");
      await expect(readFile(outputPath, "utf8")).resolves.toContain("support-replies style transfer");
      expect(transfer.stdout).not.toContain("careful report");
      expect(transfer.stdout).not.toContain("inspect the logs");
    } finally {
      if (previousPwd === undefined) {
        delete process.env.PWD;
      } else {
        process.env.PWD = previousPwd;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("installs the bundled MiniCPM-V vision package only when explicitly requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-first-party-minicpm-v-vision-"));
    const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = "fake Ambient visual evidence";
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");
      const healthStateDir = join(workspace, ".ambient", "vision", "minicpm-v", "state");
      await mkdir(healthStateDir, { recursive: true });
      await writeFile(
        join(healthStateDir, "server-state.json"),
        `${JSON.stringify({
          status: "stopped",
          previousPid: 31337,
          stoppedAt: "2026-06-12T00:00:00.000Z",
        })}\n`,
      );
      const statuses = await ensureFirstPartyAmbientCliPackages(workspace, {
        packageNames: ["ambient-minicpm-v-vision"],
        bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
      });
      expect(statuses).toEqual([
        expect.objectContaining({
          packageName: "ambient-minicpm-v-vision",
          source: "bundled:ambient-minicpm-v-vision",
          status: "installed",
        }),
      ]);

      const catalog = await discoverAmbientCliPackages(workspace, { includeHealth: true });
      const minicpm = catalog.packages.find((pkg) => pkg.name === "ambient-minicpm-v-vision");
      expect(minicpm).toMatchObject({
        installed: true,
        commands: expect.arrayContaining([
          expect.objectContaining({ name: "minicpm_vision_status" }),
          expect.objectContaining({ name: "minicpm_vision_verify_runtime_manifest" }),
          expect.objectContaining({ name: "minicpm_vision_start" }),
          expect.objectContaining({ name: "minicpm_vision_stop" }),
          expect.objectContaining({ name: "minicpm_vision_analyze" }),
        ]),
      });
      expect(minicpm?.healthChecks?.every((check) => check.passed)).toBe(true);
      const statusHealth = minicpm?.healthChecks?.find((check) => check.commandName === "minicpm_vision_status");
      const statusHealthText = statusHealth?.stdoutOutput?.artifactPath
        ? await readFile(join(workspace, statusHealth.stdoutOutput.artifactPath), "utf8")
        : (statusHealth?.stdout ?? "{}");
      expect(JSON.parse(statusHealthText).server).toMatchObject({
        previousPid: 31337,
        stoppedAt: "2026-06-12T00:00:00.000Z",
      });

      const imagePath = join(workspace, "screen.png");
      const outputJson = join(workspace, ".ambient", "vision", "screen-analysis.json");
      await writeFile(imagePath, tinyPng());
      const result = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-minicpm-v-vision",
        command: "minicpm_vision_analyze",
        args: ["--image", imagePath, "--output-json", outputJson],
      });

      const preview = JSON.parse(result.stdout ?? "{}");
      expect(preview).toMatchObject({
        providerId: "minicpm-v-4.5-llamacpp",
        status: "passed",
        model: "openbmb/MiniCPM-V-4_5-gguf:q4_k_m",
        summary: "fake Ambient visual evidence",
        observations: [expect.objectContaining({ kind: "visual_quality", confidence: "high" })],
      });
      expect(preview.image).toMatchObject({ basename: "screen.png" });
      expect(preview.image).not.toHaveProperty("path");
      expect(preview.images).toEqual([expect.objectContaining({ basename: "screen.png" })]);
      await expect(readFile(outputJson, "utf8")).resolves.toContain("fake Ambient visual evidence");

      const referencePath = join(workspace, "reference.png");
      const comparisonJson = join(workspace, ".ambient", "vision", "screen-comparison.json");
      await writeFile(referencePath, tinyPng());
      const comparison = await runAmbientCliPackageCommand(workspace, {
        packageName: "ambient-minicpm-v-vision",
        command: "minicpm_vision_analyze",
        args: ["--image", imagePath, "--image", referencePath, "--output-json", comparisonJson],
      });
      const comparisonPreview = JSON.parse(comparison.stdout ?? "{}");
      expect(comparisonPreview.images).toEqual([
        expect.objectContaining({ basename: "screen.png" }),
        expect.objectContaining({ basename: "reference.png" }),
      ]);
      await expect(readFile(comparisonJson, "utf8")).resolves.toContain('"images"');
    } finally {
      if (previousFakeAnalysis === undefined) {
        delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      } else {
        process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = previousFakeAnalysis;
      }
      if (previousLlamaServer === undefined) {
        delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      } else {
        process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = previousLlamaServer;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);

  it("serializes concurrent bundled MiniCPM-V installs for visual fan-out", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-cli-concurrent-minicpm-v-vision-"));
    const previousFakeAnalysis = process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
    const previousLlamaServer = process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
    try {
      process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = "fake Ambient visual evidence";
      process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = join(workspace, "missing-llama-server");

      const installs = await Promise.all(
        Array.from({ length: 4 }, () =>
          ensureFirstPartyAmbientCliPackages(workspace, {
            packageNames: ["ambient-minicpm-v-vision"],
            bundledPackageRootPath: join(process.cwd(), "resources", "ambient-cli-packages"),
          }),
        ),
      );

      expect(installs).toHaveLength(4);
      for (const statuses of installs) {
        expect(statuses).toEqual([
          expect.objectContaining({
            packageName: "ambient-minicpm-v-vision",
            source: "bundled:ambient-minicpm-v-vision",
            status: "installed",
          }),
        ]);
      }

      const catalog = await discoverAmbientCliPackages(workspace);
      expect(catalog.packages.filter((pkg) => pkg.name === "ambient-minicpm-v-vision")).toHaveLength(1);
      const config = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "packages.json"), "utf8"));
      expect(config.packages.filter((entry: { source?: string }) => entry.source?.includes("ambient-minicpm-v-vision"))).toHaveLength(1);
    } finally {
      if (previousFakeAnalysis === undefined) {
        delete process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS;
      } else {
        process.env.AMBIENT_MINICPM_V_FAKE_ANALYSIS = previousFakeAnalysis;
      }
      if (previousLlamaServer === undefined) {
        delete process.env.AMBIENT_MINICPM_V_LLAMA_SERVER;
      } else {
        process.env.AMBIENT_MINICPM_V_LLAMA_SERVER = previousLlamaServer;
      }
      await rm(workspace, { recursive: true, force: true });
    }
  }, 15_000);
});

function silentWav(durationMs: number): Buffer {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

function tinyPng(): Buffer {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax8pWQAAAAASUVORK5CYII=", "base64");
}
