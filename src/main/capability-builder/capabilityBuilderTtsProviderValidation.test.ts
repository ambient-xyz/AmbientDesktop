import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capabilityBuilderPreviewText,
  capabilityBuilderRegisterText,
  capabilityBuilderRepairPlanText,
  capabilityBuilderValidateText,
  planCapabilityBuilderRepair,
  previewCapabilityBuilderPackage,
  registerCapabilityBuilderPackage,
  saveCapabilityBuilderEnvSecret,
  scaffoldCapabilityBuilderPackage,
  validateCapabilityBuilderPackage,
} from "./capabilityBuilder";

describe("Capability Builder TTS provider validation", () => {
  it("gives Pi general installer recovery guidance during repair planning", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "local-native-provider",
        goal: "Wrap a local native model runtime that needs model and library paths",
        installerShape: "custom-cli",
        provider: "Local Native Runtime",
        locality: "local",
        modelAssets: ["model.onnx", "runtime data directory"],
      });
      const packageJson = {
        name: "local-native-provider",
        version: "0.1.0",
        dependencies: { "native-runtime": "1.0.0" },
      };
      await writeFile(join(scaffold.rootPath, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
      await writeFile(
        join(scaffold.rootPath, "capability-validation-log.jsonl"),
        [
          JSON.stringify({
            source: "smokeTest",
            status: "failed",
            command: "node",
            exitCode: 1,
            stderrPreview: "native runtime could not load data path password=hunter2 /Library/Application Support/Native/data",
          }),
          JSON.stringify({
            source: "smokeTest",
            status: "failed",
            error: "compiled-in path missing token=abcdef",
          }),
        ].join("\n"),
        "utf8",
      );

      const repairPlan = await planCapabilityBuilderRepair(workspace, {
        packageName: "local-native-provider",
        requestedRepair: "Validation fails because the native library looks for model data at a compiled-in system path.",
      });
      const text = capabilityBuilderRepairPlanText(repairPlan);

      expect(repairPlan.installerRecoveryGuidance).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Classify the failure before repair"),
          expect.stringContaining("hardcoded or compiled-in path"),
          expect.stringContaining("ambient_privileged_action_request"),
        ]),
      );
      expect(repairPlan.installerRecoveryTemplates.map((template) => template.id)).toEqual([
        "python-native-data-path",
        "node-native-module",
        "local-model-assets",
        "system-binary-wrapper",
        "stdout-vs-file-artifact-contract",
      ]);
      expect(repairPlan.installerRecoveryTemplates.find((template) => template.id === "python-native-data-path")?.steps).toEqual(
        expect.arrayContaining([expect.stringContaining("ambient_privileged_action_request")]),
      );
      expect(repairPlan.approvalCheckpoints).toEqual(
        expect.arrayContaining([
          expect.stringContaining("ambient_privileged_action_request"),
          expect.stringContaining("stop and reclassify"),
        ]),
      );
      expect(repairPlan.diagnosticEvidence).toMatchObject({
        logFiles: ["capability-validation-log.jsonl"],
        recommendedReads: ["./capability-validation-log.jsonl"],
        recentLogEntries: [
          {
            path: "capability-validation-log.jsonl",
            lineCount: 2,
            entries: [expect.stringContaining("source=smokeTest"), expect.stringContaining("compiled-in path missing token=[REDACTED]")],
          },
        ],
      });
      expect(JSON.stringify(repairPlan.diagnosticEvidence)).not.toContain("hunter2");
      expect(JSON.stringify(repairPlan.diagnosticEvidence)).not.toContain("abcdef");
      expect(repairPlan.recommendedSteps).toEqual(expect.arrayContaining([expect.stringContaining("file_read")]));
      expect(text).toContain("Installer recovery guidance:");
      expect(text).toContain("Installer recovery templates:");
      expect(text).toContain("Diagnostic evidence:");
      expect(text).toContain("./capability-validation-log.jsonl");
      expect(text).toContain("password=[REDACTED]");
      expect(text).toContain("python-native-data-path: Python native library/data path");
      expect(text).toContain("do not ask the user to copy commands into Terminal");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("injects Builder-scoped saved secrets during validation without exposing the value", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const envName = "AMBIENT_TEST_BUILDER_SECRET";
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "cloud-secret-provider",
        goal: "Validate a draft cloud provider with a Builder-scoped secret",
        kind: "custom-cli",
        provider: "Cloud Test",
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(scaffold.descriptorPath, "utf8"));
      descriptor.env = [{ name: envName, required: true, description: "Cloud test secret" }];
      descriptor.networkHosts = ["api.example.test"];
      descriptor.commands.cloud_secret_provider.healthCheck = ["node", "./scripts/run.mjs", "--health", "--echo-secret"];
      await writeFile(scaffold.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      await writeFile(
        scaffold.scriptPath,
        [
          "if (process.argv.includes('--health')) {",
          `  if (process.env.${envName} === 'builder-secret-value' && process.argv.includes('--echo-secret')) { console.log('ok secret=' + process.env.${envName}); console.log('Bearer ' + process.env.${envName}); process.exit(0); }`,
          `  if (process.env.${envName} === 'builder-secret-value') { process.stdout.write('ok\\n'); process.exit(0); }`,
          `  console.error('Missing required env ${envName}');`,
          "  process.exit(7);",
          "}",
        ].join("\n"),
        "utf8",
      );

      const missing = await validateCapabilityBuilderPackage(workspace, { packageName: "cloud-secret-provider" });
      expect(missing.succeeded).toBe(false);

      const saved = await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "cloud-secret-provider",
        envName,
        value: "builder-secret-value",
      });
      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "cloud-secret-provider" });
      const text = capabilityBuilderValidateText(result);

      expect(saved).toMatchObject({
        packageName: "ambient-cloud-secret-provider",
        envName,
        source: "managed-secret",
        secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        configured: true,
      });
      expect(saved.filePath).toBeUndefined();
      expect(existsSync(join(workspace, ".ambient", "capability-builder", "secrets"))).toBe(false);
      expect(result.succeeded).toBe(true);
      expect(JSON.stringify(result.commands)).toContain("[REDACTED]");
      expect(JSON.stringify(result.commands)).not.toContain("builder-secret-value");
      expect(text).not.toContain("builder-secret-value");
      await expect(readFile(result.logPath, "utf8")).resolves.not.toContain("builder-secret-value");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("validates tts-provider packages through the normalized provider synthesis contract", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "fixture-voice-provider",
        goal: "Create a fixture voice provider",
        installerShape: "tts-provider",
        provider: "Fixture",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }",
          "const output = arg('--output');",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav', durationMs: 250, providerId: 'fixture', voiceId: arg('--voice') || 'default' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "fixture-voice-provider" });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));

      expect(result.succeeded).toBe(true);
      expect(result.commands.map((command) => command.source)).toEqual(["healthCheck", "smokeTest", "providerContract"]);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        commandName: "fixture_voice_provider",
        status: "succeeded",
      });
      expect(result.artifacts).toEqual([
        expect.objectContaining({
          path: expect.stringMatching(/^validation-artifacts\/ambient-voice-test-.+\.wav$/),
          sizeBytes: expect.any(Number),
        }),
      ]);
      expect(capabilityBuilderValidateText(result)).toContain("providerContract (fixture_voice_provider)");
      expect(manifest).toMatchObject({
        status: "validated",
        refs: {
          voiceProviderContractValidatedAt: expect.any(String),
          voiceProviderContractValidatedHash: expect.any(String),
        },
      });
      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "fixture-voice-provider" });
      expect(registered).toMatchObject({
        installedPackage: expect.objectContaining({ name: "ambient-fixture-voice-provider" }),
        voiceProvider: expect.objectContaining({
          label: "Fixture Voice Provider",
          command: "fixture_voice_provider",
          available: true,
          healthStatus: "passed",
          formats: ["wav"],
          voices: [{ id: "default", label: "Default voice" }],
        }),
      });
      expect(capabilityBuilderRegisterText(registered)).toContain("Registered voice provider:");
      expect(capabilityBuilderRegisterText(registered)).toContain("capability id:");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when provider stdout is not JSON metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "bad-json-voice-provider",
        goal: "Create a bad stdout voice provider",
        installerShape: "tts-provider",
        provider: "Bad JSON",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log('not json');",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "bad-json-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("stdout must be concise JSON metadata");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when the provider writes a different output path", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "wrong-path-voice-provider",
        goal: "Create a wrong path voice provider",
        installerShape: "tts-provider",
        provider: "Wrong Path",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname, join } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "const wrong = join(dirname(output), 'wrong.wav');",
          "mkdirSync(dirname(wrong), { recursive: true });",
          "writeFileSync(wrong, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: wrong, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "wrong-path-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("exact requested --output path");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("fails tts-provider validation when the provider creates an empty audio file", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "empty-audio-voice-provider",
        goal: "Create an empty audio voice provider",
        installerShape: "tts-provider",
        provider: "Empty Audio",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { closeSync, mkdirSync, openSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "closeSync(openSync(output, 'w'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );

      const result = await validateCapabilityBuilderPackage(workspace, { packageName: "empty-audio-voice-provider" });

      expect(result.succeeded).toBe(false);
      expect(result.commands.at(-1)).toMatchObject({
        source: "providerContract",
        status: "failed",
        exitCode: "provider-contract-invalid",
      });
      expect(result.commands.at(-1)?.error).toContain("zero-byte audio file");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("blocks tts-provider registration when validation lacks the provider-contract marker", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "legacy-validated-voice-provider",
        goal: "Create a legacy validated voice provider",
        installerShape: "tts-provider",
        provider: "Legacy",
        outputArtifactTypes: ["WAV"],
        locality: "local",
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );
      await validateCapabilityBuilderPackage(workspace, { packageName: "legacy-validated-voice-provider" });
      const manifest = JSON.parse(await readFile(scaffold.manifestPath, "utf8"));
      delete manifest.refs.voiceProviderContractValidatedAt;
      delete manifest.refs.voiceProviderContractValidatedHash;
      await writeFile(scaffold.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      await expect(registerCapabilityBuilderPackage(workspace, { packageName: "legacy-validated-voice-provider" })).rejects.toThrow(
        "TTS provider packages must pass provider-contract synthesis validation before registration.",
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("copies Builder-scoped env bindings before installed tts-provider discovery", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const envName = "AMBIENT_TEST_UNAVAILABLE_PROVIDER_KEY";
      const scaffold = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "unavailable-voice-provider",
        goal: "Create an unavailable voice provider",
        installerShape: "tts-provider",
        provider: "Unavailable",
        outputArtifactTypes: ["WAV"],
        locality: "network",
        envNames: [envName],
        networkHosts: ["api.example.test"],
      });
      await writeFile(
        scaffold.scriptPath,
        [
          "import { mkdirSync, writeFileSync } from 'node:fs';",
          "import { dirname } from 'node:path';",
          "const args = process.argv.slice(2);",
          `if (!process.env.${envName}) { console.error('provider runtime missing env ${envName} after install'); process.exit(9); }`,
          "if (args.includes('--health')) { console.log('ok'); process.exit(0); }",
          "const output = args[args.indexOf('--output') + 1];",
          "mkdirSync(dirname(output), { recursive: true });",
          "writeFileSync(output, Buffer.from('RIFF fixture wav'));",
          "console.log(JSON.stringify({ audioPath: output, mimeType: 'audio/wav' }));",
        ].join("\n"),
        "utf8",
      );
      await saveCapabilityBuilderEnvSecret(workspace, {
        packageName: "unavailable-voice-provider",
        envName,
        value: "builder-only-secret",
      });
      await validateCapabilityBuilderPackage(workspace, { packageName: "unavailable-voice-provider" });

      const registered = await registerCapabilityBuilderPackage(workspace, { packageName: "unavailable-voice-provider" });
      const installedBindings = JSON.parse(await readFile(join(workspace, ".ambient", "cli-packages", "env-bindings.json"), "utf8"));

      expect(registered.voiceProvider).toMatchObject({
        label: "Unavailable Voice Provider",
        available: true,
        healthStatus: "passed",
      });
      expect(installedBindings.bindings).toEqual([
        expect.objectContaining({
          packageName: "ambient-unavailable-voice-provider",
          envName,
          secretRef: expect.stringMatching(/^ambient-secret-ref:v1:[a-f0-9]{64}$/),
        }),
      ]);
      expect(installedBindings.bindings[0]).not.toHaveProperty("filePath");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("previews model asset metadata and download review risks", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "zaya-config-reader",
        goal: "Read a small model config asset from Hugging Face.",
        locality: "network",
      });
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.networkHosts = ["huggingface.co"];
      descriptor.modelAssets = [
        {
          name: "ZAYA1-8B config",
          url: "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json",
          expectedSizeBytes: 8192,
          license: "Zyphra model repository terms",
          cachePath: "models/zaya-config.json",
        },
      ];
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "zaya-config-reader" });
      expect(preview.valid).toBe(true);
      expect(preview.descriptor?.modelAssets).toEqual([
        expect.objectContaining({
          name: "ZAYA1-8B config",
          url: "https://huggingface.co/Zyphra/ZAYA1-8B/resolve/main/config.json",
          expectedSizeBytes: 8192,
          license: "Zyphra model repository terms",
          cachePath: "models/zaya-config.json",
        }),
      ]);
      expect(preview.risks).toEqual(expect.arrayContaining([expect.stringContaining("model/data assets: ZAYA1-8B config")]));
      expect(capabilityBuilderPreviewText(preview)).toContain("model assets: ZAYA1-8B config");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("rejects unsafe model asset metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-capability-builder-"));
    try {
      const result = await scaffoldCapabilityBuilderPackage(workspace, {
        name: "unsafe-model",
        goal: "Download a model unsafely.",
      });
      const descriptor = JSON.parse(await readFile(result.descriptorPath, "utf8"));
      descriptor.modelAssets = [{ name: "bad", url: "file:///tmp/model.bin", sha256: "nope", cachePath: "../model.bin" }];
      await writeFile(result.descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");

      const preview = await previewCapabilityBuilderPackage(workspace, { packageName: "unsafe-model" });
      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("url must be http(s)"),
          expect.stringContaining("sha256 must be a 64-character hex digest"),
          expect.stringContaining("cachePath must be package-relative"),
        ]),
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
