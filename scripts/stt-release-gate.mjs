#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { validateWindowsQwenValidationSummary } from "./stt-qwen-windows-evidence.mjs";

const root = resolve(process.cwd());
const argv = process.argv.slice(2);
const args = new Set(argv);
const jsonOutput = args.has("--json");
const requireWindows = args.has("--require-windows") || process.env.AMBIENT_STT_RELEASE_GATE_REQUIRE_WINDOWS === "1";
const windowsSummaryPath = optionValue(argv, "--windows-summary") || process.env.AMBIENT_STT_WINDOWS_VALIDATION_SUMMARY || ".ambient/stt-validation/qwen3-asr-windows/latest/summary.json";

const qwenPackagePath = "resources/ambient-cli-packages/ambient-qwen3-asr";
const qwenDescriptorPath = `${qwenPackagePath}/ambient-cli.json`;
const qwenAssetManifestPath = `${qwenPackagePath}/assets/qwen3-asr-assets.json`;

const checks = [];

function main() {
  const packageJson = readJson("package.json");
  const descriptor = readJson(qwenDescriptorPath);
  const assetManifest = readJson(qwenAssetManifestPath);

  auditPackageScripts(packageJson);
  auditQwenProviderDescriptor(descriptor);
  auditQwenAssetManifest(assetManifest);
  auditProductScaffolding();
  auditTestCoverage();
  auditDogfoodCommands(packageJson);

  const summary = buildSummary();
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printHumanSummary(summary);
  }
  if (summary.failed > 0) process.exit(1);
}

function auditPackageScripts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = [
    ["stt:qwen-validate", "Qwen3-ASR cross-platform validation harness"],
    ["test:stt-tools-live", "Ambient/Pi STT tool dogfood"],
    ["test:stt-queue-barge-live", "visible queue and TTS barge-in dogfood"],
    ["test:stt-setup-failures", "Qwen setup/failure recovery dogfood"],
    ["test:stt-tts-dogfood-live", "STT/TTS live product dogfood"],
    ["test:stt-spike", "spike harness regression tests"],
    ["stt:qwen-validate:windows", "Windows Qwen3-ASR validation wrapper"],
    ["stt:qwen-validate:windows-evidence", "Windows Qwen3-ASR evidence checker"],
    ["test:stt-windows-evidence", "Windows evidence checker tests"],
    ["typecheck", "TypeScript project typecheck"],
  ];
  for (const [name, label] of requiredScripts) {
    addCheck({
      id: `script.${name}`,
      area: "commands",
      status: typeof scripts[name] === "string" && scripts[name].trim() ? "pass" : "fail",
      label: `${label} command is registered`,
      evidence: scripts[name] ? [`${name}: ${scripts[name]}`] : [`missing package.json script ${name}`],
    });
  }
}

function auditQwenProviderDescriptor(descriptor) {
  const command = descriptor.commands?.qwen3_asr_transcribe;
  const provider = command?.sttProvider;
  addCheck({
    id: "provider.descriptor",
    area: "installer",
    status: descriptor.name === "ambient-qwen3-asr" && command?.command === "node" && Array.isArray(command?.healthCheck) ? "pass" : "fail",
    label: "first-party Qwen3-ASR provider descriptor is installable and health-checkable",
    evidence: [
      `descriptor: ${qwenDescriptorPath}`,
      `command: ${command?.command ?? "missing"}`,
      `healthCheck: ${Array.isArray(command?.healthCheck) ? command.healthCheck.join(" ") : "missing"}`,
    ],
  });
  const languages = provider?.languages ?? [];
  const expectedLanguages = ["Arabic", "Chinese", "Dutch", "English", "French", "German", "Hindi", "Italian", "Japanese", "Korean", "Polish", "Portuguese", "Russian", "Spanish", "Turkish"];
  const missingLanguages = expectedLanguages.filter((language) => !languages.includes(language));
  addCheck({
    id: "provider.languages",
    area: "installer",
    status: provider?.local === true && provider?.defaultLanguage === "English" && missingLanguages.length === 0 ? "pass" : "fail",
    label: "Qwen3-ASR provider exposes the intended local multilingual surface",
    evidence: [
      `defaultLanguage: ${provider?.defaultLanguage ?? "missing"}`,
      `local: ${String(provider?.local)}`,
      `languages: ${languages.length}`,
      ...(missingLanguages.length ? [`missing: ${missingLanguages.join(", ")}`] : []),
    ],
  });
}

function auditQwenAssetManifest(assetManifest) {
  const defaultModel = (assetManifest.models ?? []).find((model) => model.default === true);
  const files = defaultModel?.files ?? [];
  const modelFile = files.find((file) => file.role === "model");
  const mmprojFile = files.find((file) => file.role === "mmproj");
  const pinnedFiles = [modelFile, mmprojFile].every((file) => isPinnedAssetFile(file));
  addCheck({
    id: "manifest.model-assets",
    area: "installer",
    status: defaultModel?.id && pinnedFiles ? "pass" : "fail",
    label: "default Qwen3-ASR model and projector assets are size and SHA-256 pinned",
    evidence: [
      `manifest: ${qwenAssetManifestPath}`,
      `defaultModel: ${defaultModel?.id ?? "missing"}`,
      `model: ${modelFile?.filename ?? "missing"}`,
      `mmproj: ${mmprojFile?.filename ?? "missing"}`,
    ],
  });
  addCheck({
    id: "manifest.download-policy",
    area: "installer",
    status:
      assetManifest.downloadPolicy?.directModelDownloadsEnabled === true &&
      assetManifest.downloadPolicy?.directModelDownloadsRequireSha256 === true &&
      assetManifest.downloadPolicy?.directRuntimeDownloadsEnabled === false
        ? "pass"
        : "fail",
    label: "model downloads are checksum-gated and direct runtime downloads are disabled",
    evidence: [
      `directModelDownloadsEnabled: ${String(assetManifest.downloadPolicy?.directModelDownloadsEnabled)}`,
      `directModelDownloadsRequireSha256: ${String(assetManifest.downloadPolicy?.directModelDownloadsRequireSha256)}`,
      `directRuntimeDownloadsEnabled: ${String(assetManifest.downloadPolicy?.directRuntimeDownloadsEnabled)}`,
    ],
  });
  const laneIds = new Set((assetManifest.runtimeLanes ?? []).map((lane) => lane.id));
  addCheck({
    id: "manifest.runtime-lanes",
    area: "platforms",
    status: laneIds.has("macos-arm64-metal") && laneIds.has("linux-x64-nvidia-cuda") && laneIds.has("windows-x64-unvalidated") ? "pass" : "fail",
    label: "runtime lane manifest covers macOS, Linux, and explicitly unvalidated Windows",
    evidence: [`lanes: ${[...laneIds].join(", ") || "missing"}`],
  });
  const windowsLane = (assetManifest.runtimeLanes ?? []).find((lane) => lane.id === "windows-x64-unvalidated");
  const windowsPending = windowsLane?.directDownload?.enabled === false && /pending|unvalidated|real-machine/i.test(windowsLane?.directDownload?.reason ?? "");
  addCheck({
    id: "platform.windows-validation",
    area: "platforms",
    status: windowsPending ? (requireWindows ? "fail" : "warn") : "fail",
    label: requireWindows ? "Windows validation is required for this audit" : "Windows validation is explicitly pending",
    evidence: [
      `lane: ${windowsLane?.id ?? "missing"}`,
      `runtimeDownloadEnabled: ${String(windowsLane?.directDownload?.enabled)}`,
      `reason: ${windowsLane?.directDownload?.reason ?? "missing"}`,
    ],
    remediation: "Validate Windows x64 CUDA and CPU/Vulkan lanes on real hardware, then replace the unvalidated lane with pinned runtime guidance.",
  });
  auditWindowsEvidence();
}

function auditWindowsEvidence() {
  const absoluteSummaryPath = resolve(root, windowsSummaryPath);
  if (!existsSync(absoluteSummaryPath)) {
    addCheck({
      id: "platform.windows-evidence",
      area: "platforms",
      status: requireWindows ? "fail" : "warn",
      label: requireWindows ? "Windows validation evidence is required" : "Windows validation evidence is not present",
      evidence: [`summary: ${windowsSummaryPath}`],
      remediation: "Run pnpm run stt:qwen-validate:windows on Windows x64 and pass --windows-summary or AMBIENT_STT_WINDOWS_VALIDATION_SUMMARY.",
    });
    return;
  }
  let result;
  try {
    result = validateWindowsQwenValidationSummary(readJson(windowsSummaryPath));
  } catch (error) {
    addCheck({
      id: "platform.windows-evidence",
      area: "platforms",
      status: requireWindows ? "fail" : "warn",
      label: "Windows validation evidence could not be parsed",
      evidence: [`summary: ${windowsSummaryPath}`, error instanceof Error ? error.message : String(error)],
      remediation: "Re-run pnpm run stt:qwen-validate:windows and provide the generated summary.json.",
    });
    return;
  }
  addCheck({
    id: "platform.windows-evidence",
    area: "platforms",
    status: result.status === "passed" ? "pass" : requireWindows ? "fail" : "warn",
    label: result.status === "passed" ? "Windows validation evidence is machine-checkable" : "Windows validation evidence is incomplete",
    evidence: [
      `summary: ${windowsSummaryPath}`,
      `host: ${result.summary.host}`,
      `runtime: ${result.summary.runtimeVersion ?? "missing"}`,
      `lanes: ${result.summary.lanes.join(", ") || "missing"}`,
      ...(result.failedChecks.length ? [`failedChecks: ${result.failedChecks.join(", ")}`] : []),
    ],
    remediation: result.status === "passed" ? undefined : "Use a real Windows x64 run with CUDA plus CPU/Vulkan fallback, no fake transcript, and host matching enabled.",
  });
}

function auditProductScaffolding() {
  const sourceChecks = [
    {
      id: "product.settings-ui",
      area: "ui",
      label: "Settings exposes provider setup, silence, RMS gate, shortcut, and queue/barge-in controls",
      files: [
        ["src/renderer/src/App.tsx", /Repair Qwen3-ASR|Install Qwen3-ASR/],
        ["src/renderer/src/App.tsx", /state\.settings\.stt\.silenceFinalizeSeconds/],
        ["src/renderer/src/App.tsx", /RMS no-speech gate/],
        ["src/renderer/src/App.tsx", /push-to-talk shortcut|Push-to-talk shortcut/i],
        ["src/renderer/src/App.tsx", /queueWhileAgentRuns/],
        ["src/renderer/src/App.tsx", /stopTtsOnSpeech/],
      ],
    },
    {
      id: "product.composer-ptt",
      area: "ui",
      label: "composer push-to-talk captures managed audio and hands it to STT",
      files: [
        ["src/renderer/src/App.tsx", /source: "composer-push-to-talk"/],
        ["src/renderer/src/App.tsx", /saveSttAudio|stt:transcribe-audio|transcribeSttAudio/],
        ["src/renderer/src/sttMicrophoneRecorder.ts", /encodePcm16Wav/],
      ],
    },
    {
      id: "product.silence-finalize",
      area: "runtime",
      label: "silence-before-transcribe is configurable and honored before finalization",
      files: [
        ["src/renderer/src/App.tsx", /silenceFinalizeMs/],
        ["src/renderer/src/sttMicrophoneRecorder.ts", /silenceFinalizeMs/],
        ["src/renderer/src/sttMicrophoneRecorder.test.ts", /finalizes only after speech has been followed by configured trailing silence/],
      ],
    },
    {
      id: "product.no-speech-gate",
      area: "runtime",
      label: "RMS no-speech gate prevents silent audio from becoming messages",
      files: [
        ["src/main/sttAudio.ts", /rmsDbfs|noSpeechThresholdDbfs/],
        ["src/main/sttProvider.ts", /status: "no-speech"/],
        ["src/main/sttProvider.ts", /gate\.rmsDbfs <= input\.settings\.noSpeechGate\.rmsThresholdDbfs/],
        ["src/main/sttRuntime.test.ts", /keeps no-speech and failed transcriptions out of the ready queue/],
      ],
    },
    {
      id: "product.queue-causality",
      area: "runtime",
      label: "utterance queue preserves visible turn order and avoids hidden steering",
      files: [
        ["src/main/sttRuntime.ts", /drainReadyToSend/],
        ["src/main/sttRuntime.ts", /setAgentRunning|agent_running/],
        ["src/renderer/src/sttUiModel.ts", /followUp|queuedSpeechFollowUpCount/],
        ["src/main/sttRuntime.test.ts", /visible future turn|agent is running/],
      ],
    },
    {
      id: "product.failure-recovery",
      area: "runtime",
      label: "transcription failures can be retried or dismissed from saved audio artifacts",
      files: [
        ["src/renderer/src/App.tsx", /Retry|retrySttComposer/],
        ["src/renderer/src/App.tsx", /Dismiss|dismissSttComposer/],
        ["src/main/sttRuntime.ts", /failed|error/],
      ],
    },
    {
      id: "product.diagnostics",
      area: "diagnostics",
      label: "privacy-preserving STT diagnostics are recorded and surfaced",
      files: [
        ["src/main/sttDiagnostics.ts", /diagnostics\.jsonl/],
        ["src/main/sttDiagnostics.ts", /transcript|artifact paths/i],
        ["src/renderer/src/App.tsx", /Speech diagnostics/],
        ["src/main/sttDiagnostics.test.ts", /without raw transcript or artifact paths/],
      ],
    },
  ];

  for (const sourceCheck of sourceChecks) {
    const missing = sourceCheck.files
      .map(([path, pattern]) => (fileContains(path, pattern) ? undefined : `${path} missing ${pattern}`))
      .filter(Boolean);
    addCheck({
      id: sourceCheck.id,
      area: sourceCheck.area,
      status: missing.length === 0 ? "pass" : "fail",
      label: sourceCheck.label,
      evidence: missing.length ? missing : [...new Set(sourceCheck.files.map(([path]) => path))],
    });
  }
}

function auditTestCoverage() {
  const coverage = [
    {
      id: "tests.fake-provider",
      label: "fake provider path is covered",
      files: [
        ["src/main/sttProvider.test.ts", /fake|transcript|provider/i],
        [`${qwenPackagePath}/tests/smoke.test.mjs`, /AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT/],
      ],
    },
    {
      id: "tests.no-speech-queue",
      label: "no-speech and queueing are covered",
      files: [
        ["src/main/sttRuntime.test.ts", /no-speech/],
        ["src/main/sttRuntime.test.ts", /agent is running|visible future turn/],
      ],
    },
    {
      id: "tests.settings-ui",
      label: "settings and STT UI model are covered",
      files: [
        ["src/main/sttSettingsTools.test.ts", /silenceFinalizeSeconds|RMS|policy/i],
        ["src/renderer/src/sttUiModel.test.ts", /provider|diagnostics|queued speech/i],
      ],
    },
    {
      id: "tests.installer",
      label: "installer/repair flow is covered",
      files: [
        ["src/main/sttProviderInstaller.test.ts", /installs the bundled provider/],
        ["src/main/sttProviderInstaller.test.ts", /repairs by binding a runtime binary/],
      ],
    },
    {
      id: "tests.diagnostics",
      label: "diagnostics privacy contract is covered",
      files: [["src/main/sttDiagnostics.test.ts", /without raw transcript or artifact paths/]],
    },
  ];

  for (const item of coverage) {
    const missing = item.files
      .map(([path, pattern]) => (fileContains(path, pattern) ? undefined : `${path} missing ${pattern}`))
      .filter(Boolean);
    addCheck({
      id: item.id,
      area: "tests",
      status: missing.length === 0 ? "pass" : "fail",
      label: item.label,
      evidence: missing.length ? missing : [...new Set(item.files.map(([path]) => path))],
    });
  }
}

function auditDogfoodCommands(packageJson) {
  const dogfoodFiles = [
    "scripts/e2e-stt-tools-live.mjs",
    "scripts/e2e-stt-queue-barge-live.mjs",
    "scripts/e2e-stt-setup-failures.mjs",
    "scripts/e2e-stt-tts-dogfood-live.mjs",
    "scripts/stt-qwen-cross-platform-validation.mjs",
    "scripts/stt-qwen-windows-validation.mjs",
    "scripts/stt-qwen-windows-evidence.mjs",
  ];
  const missingFiles = dogfoodFiles.filter((path) => !existsSync(resolve(root, path)));
  addCheck({
    id: "dogfood.files",
    area: "dogfood",
    status: missingFiles.length === 0 ? "pass" : "fail",
    label: "release dogfood and validation harness files exist",
    evidence: missingFiles.length ? missingFiles.map((path) => `missing: ${path}`) : dogfoodFiles,
  });
  const scripts = packageJson.scripts ?? {};
  addCheck({
    id: "dogfood.mic-lane",
    area: "dogfood",
    status: fileContains("scripts/e2e-stt-tts-dogfood-live.mjs", /AMBIENT_STT_TTS_DOGFOOD_MIC/) ? "pass" : "fail",
    label: "STT/TTS dogfood has an optional physical microphone lane",
    evidence: ["AMBIENT_STT_TTS_DOGFOOD_MIC=1 pnpm run test:stt-tts-dogfood-live", `script: ${scripts["test:stt-tts-dogfood-live"] ?? "missing"}`],
  });
  addCheck({
    id: "dogfood.windows-validation-wrapper",
    area: "dogfood",
    status:
      fileContains("scripts/stt-qwen-cross-platform-validation.mjs", /windows-x64-nvidia-cuda/) &&
      fileContains("scripts/stt-qwen-cross-platform-validation.mjs", /windows-x64-cpu/) &&
      fileContains("scripts/stt-qwen-cross-platform-validation.mjs", /--require-host-match/) &&
      fileContains("scripts/stt-qwen-windows-validation.mjs", /windows-cuda,windows-cpu/) &&
      fileContains("scripts/stt-qwen-windows-validation.mjs", /join\(input\.outRoot, "latest"\)/) &&
      fileContains("scripts/stt-qwen-windows-validation.mjs", /summary\.json/) &&
      fileContains("scripts/stt-qwen-windows-validation.mjs", /evidence\.json/)
        ? "pass"
        : "fail",
    label: "Windows validation has a host-checked executable lane with stable evidence output",
    evidence: [
      "Windows x64 only: pnpm run stt:qwen-validate:windows",
      "lanes: windows-x64-nvidia-cuda, windows-x64-cpu",
      "requires Windows x64 unless --dry-run is used",
      "latest summary: .ambient/stt-validation/qwen3-asr-windows/latest/summary.json",
    ],
  });
}

function isPinnedAssetFile(file) {
  return Boolean(
    file &&
      basename(file.filename ?? "") === file.filename &&
      Number.isInteger(file.sizeBytes) &&
      file.sizeBytes > 0 &&
      /^[a-f0-9]{64}$/i.test(file.sha256 ?? "") &&
      /^https:\/\/huggingface\.co\//.test(file.url ?? ""),
  );
}

function addCheck(check) {
  checks.push({
    required: check.status !== "warn",
    remediation: check.remediation,
    ...check,
  });
}

function buildSummary() {
  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  const passed = checks.filter((check) => check.status === "pass").length;
  const releaseStatus = failed > 0 ? "fail" : warned > 0 ? "pass-with-warnings" : "pass";
  return {
    releaseStatus,
    passed,
    warned,
    failed,
    requireWindows,
    checks,
    recommendedSweep: [
      "pnpm run test:stt-release-gate",
      "pnpm run test:stt-spike",
      "pnpm run test:stt-windows-evidence",
      "bash scripts/test-node-native.sh src/main/sttRuntime.test.ts src/main/sttProviderInstaller.test.ts src/main/sttDiagnostics.test.ts src/main/sttSettingsTools.test.ts",
      "pnpm exec vitest run src/renderer/src/sttUiModel.test.ts src/renderer/src/sttMicrophoneRecorder.test.ts src/shared/sttMessageMetadata.test.ts",
      "pnpm run test:stt-setup-failures",
      "pnpm run test:stt-tools-live",
      "pnpm run test:stt-queue-barge-live",
      "pnpm run test:stt-tts-dogfood-live",
      "Windows x64 only: pnpm run stt:qwen-validate:windows",
    ],
  };
}

function printHumanSummary(summary) {
  const statusLabel = summary.releaseStatus === "pass" ? "PASS" : summary.releaseStatus === "pass-with-warnings" ? "PASS WITH WARNINGS" : "FAIL";
  process.stdout.write(`STT release gate audit: ${statusLabel}\n`);
  process.stdout.write(`Checks: ${summary.passed} passed, ${summary.warned} warnings, ${summary.failed} failed\n\n`);
  for (const check of summary.checks) {
    const marker = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
    process.stdout.write(`[${marker}] ${check.area}: ${check.label}\n`);
    for (const line of check.evidence ?? []) process.stdout.write(`  - ${line}\n`);
    if (check.remediation) process.stdout.write(`  remediation: ${check.remediation}\n`);
  }
  process.stdout.write("\nRecommended release sweep:\n");
  for (const command of summary.recommendedSweep) process.stdout.write(`  ${command}\n`);
  if (!summary.requireWindows) {
    process.stdout.write("\nWindows is treated as an explicit pending caveat. Set AMBIENT_STT_RELEASE_GATE_REQUIRE_WINDOWS=1 or pass --require-windows to make it blocking.\n");
  }
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function fileContains(path, pattern) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return false;
  return pattern.test(readFileSync(absolute, "utf8"));
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

main();
