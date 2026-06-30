import { basename } from "node:path";
import type { ToolLargeOutputPreview, ToolLargeOutputPreviewItem } from "../../shared/threadTypes";
import type { VoiceProviderCloningMetadata, VoiceProviderDiscoveryMetadata } from "../../shared/localRuntimeTypes";
import type {
  CapabilityBuilderApplyRepairResult,
  CapabilityBuilderDependencyCommand,
  CapabilityBuilderDependencyCommandResult,
  CapabilityBuilderEnvRequirement,
  CapabilityBuilderHistoryResult,
  CapabilityBuilderInstallDepsResult,
  CapabilityBuilderModelAsset,
  CapabilityBuilderPreviewResult,
  CapabilityBuilderReadFileResult,
  CapabilityBuilderRegisterResult,
  CapabilityBuilderRegistrationRepairResult,
  CapabilityBuilderRemovalPlanResult,
  CapabilityBuilderRepairPlanResult,
  CapabilityBuilderScaffoldResult,
  CapabilityBuilderUnregisterResult,
  CapabilityBuilderUpdatePlanResult,
  CapabilityBuilderValidateResult,
  CapabilityBuilderWriteFileResult,
} from "./capabilityBuilderTypes";

export function capabilityBuilderScaffoldText(result: CapabilityBuilderScaffoldResult): string {
  return [
    "Ambient Capability Builder scaffold created",
    `Package: ${result.name}`,
    result.installerShape ? `Installer shape: ${result.installerShape}` : undefined,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "",
    "Files:",
    ...result.files.map((file) => `- ${file}`),
    "- capability-build.json",
    "",
    "Next: use ambient_capability_builder_read_file, ambient_capability_builder_write_file, and ambient_capability_builder_list_files to inspect or edit this Builder-managed source, then run preview before dependency installation or registration.",
    "Python setup guidance: default to a package-local .venv, for example `uv venv --python <version> .venv` followed by `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`; avoid bare/global pip unless the user explicitly approves that risk.",
    `Use this exact sourcePath in later Capability Builder tools: ${result.sourceRef.sourcePath}`,
    "Invariant: this is Builder-managed source. It is not installed until validation succeeds and ambient_capability_builder_register runs.",
    "Do not pass this sourcePath to generic workspace file tools; use Capability Builder tools for Builder-managed source.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderHistoryText(result: CapabilityBuilderHistoryResult): string {
  return [
    "Ambient Capability Builder history",
    `Root: ${result.relativeRootPath}`,
    `Packages: ${result.entries.length}`,
    "",
    result.entries.length
      ? result.entries.flatMap((entry, index) => {
        const validationArtifacts = entry.validationArtifacts ?? [];
        return [
          `${index + 1}. ${entry.packageName}`,
          `   status: ${entry.status}; valid: ${entry.valid ? "yes" : "no"}; installed present: ${entry.installedPresent ? "yes" : "no"}`,
          `   path: ${entry.relativeRootPath}`,
          `   sourcePath: ${entry.relativeRootPath}`,
          `   git: ${entry.gitSha ?? "unavailable"}`,
          entry.goal ? `   goal: ${entry.goal}` : undefined,
          entry.installerShape ? `   installer shape: ${entry.installerShape}` : undefined,
          entry.provider ? `   provider/runtime: ${entry.provider}` : undefined,
          `   commands: ${entry.commandNames.length ? entry.commandNames.join(", ") : "none"}`,
          `   artifacts: ${entry.artifactOutputTypes.length ? entry.artifactOutputTypes.join(", ") : "none declared"}`,
          entry.installedPackageId ? `   installed package id: ${entry.installedPackageId}` : undefined,
          entry.refs.lastRepair ? `   repair ref: ${entry.refs.lastRepair}` : undefined,
          entry.refs.lastValidated ? `   validated ref: ${entry.refs.lastValidated}` : undefined,
          entry.validationLogPath ? `   validation log: ${entry.validationLogPath}` : undefined,
          validationArtifacts.length ? `   validation artifacts: ${validationArtifacts.map((artifact) => artifact.path).join(", ")}` : undefined,
          entry.refs.installed ? `   installed ref: ${entry.refs.installed}` : undefined,
          entry.unregisteredAt ? `   unregistered at: ${entry.unregisteredAt}` : undefined,
          entry.logFiles.length ? `   logs: ${entry.logFiles.join(", ")}` : undefined,
          entry.possibleArtifactFiles.length ? `   possible artifacts: ${entry.possibleArtifactFiles.join(", ")}` : undefined,
          entry.errors.length ? `   errors: ${entry.errors.join("; ")}` : undefined,
          entry.warnings.length ? `   warnings: ${entry.warnings.join("; ")}` : undefined,
        ].filter((line): line is string => Boolean(line));
      })
      : ["- no managed capability builder packages found"],
    result.errors.length ? ["", "Discovery errors:", ...result.errors.map((error) => `- ${error}`)].join("\n") : undefined,
    "",
    "Next: use ambient_capability_builder_preview, ambient_capability_builder_update_plan, ambient_capability_builder_removal_plan, validate, register, or unregister against the preserved builder source path/package as appropriate.",
    "Reminder: use Capability Builder tools for Builder-managed sources; avoid generic Ambient CLI install/uninstall unless the user explicitly asks for generic package operations.",
  ].flat().filter(Boolean).join("\n");
}

export function capabilityBuilderRegisterText(result: CapabilityBuilderRegisterResult): string {
  return [
    "Ambient Capability Builder registration",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Registered at: ${result.registeredAt}`,
    "",
    "Validation evidence:",
    `- source path: ${result.sourceRef.sourcePath}`,
    `- validated ref: ${result.validationEvidence.sourceGitSha ?? "unavailable"}`,
    `- source hash: ${result.validationEvidence.sourceHash ?? "unavailable"}`,
    result.validationEvidence.validatedAt ? `- validated at: ${result.validationEvidence.validatedAt}` : undefined,
    result.validationEvidence.logPath ? `- log: ${result.validationEvidence.logPath}` : undefined,
    result.validationEvidence.artifacts.length
      ? `- artifacts: ${result.validationEvidence.artifacts.map((artifact) => `${artifact.path} (${artifact.sizeBytes} bytes)`).join(", ")}`
      : "- artifacts: none recorded",
    "",
    "Installed Ambient CLI package:",
    `- id: ${result.installedPackage.id}`,
    `- name: ${result.installedPackage.name}`,
    `- source: ${result.installedPackage.source}`,
    `- commands: ${result.installedPackage.commands.map((command) => command.name).join(", ") || "none"}`,
    `- skills: ${result.installedPackage.skills.map((skill) => skill.name).join(", ") || "none"}`,
    result.voiceProvider
      ? [
        "",
        "Registered voice provider:",
        `- label: ${result.voiceProvider.label}`,
        `- capability id: ${result.voiceProvider.capabilityId}`,
        `- command: ${result.voiceProvider.command}`,
        `- formats: ${result.voiceProvider.formats.join(", ")}`,
        `- voices: ${result.voiceProvider.voices.map((voice) => voice.label ? `${voice.id} (${voice.label})` : voice.id).join(", ") || "none"}`,
        `- voice discovery: ${result.voiceProvider.voiceDiscovery ? formatVoiceDiscovery(result.voiceProvider.voiceDiscovery) : "none"}`,
        `- voice cloning: ${result.voiceProvider.voiceCloning ? formatVoiceCloning(result.voiceProvider.voiceCloning) : "none"}`,
        `- health: ${result.voiceProvider.healthStatus}`,
        `- availability: ${result.voiceProvider.available ? "available" : "unavailable"} - ${result.voiceProvider.availabilityReason}`,
      ].join("\n")
      : undefined,
    "",
    "Installed-copy note: future edits to the Builder-managed source will not update this installed copy until validation succeeds and ambient_capability_builder_register runs again.",
    result.voiceProvider
      ? "Next: refresh Settings/voice provider state, select this provider if desired, then synthesize a real assistant reply through Ambient voice runtime."
      : "Next: start a fresh Pi turn and use ambient_cli_search, then ambient_cli_describe, then ambient_cli to live-test the installed capability.",
    "For text-heavy commands, preserve exact user text; prefer file-input flags when CLI args risk changing punctuation, quotes, whitespace, or long text.",
    "For artifact-generating commands, write final user artifacts to user-visible workspace paths when possible.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderUnregisterText(result: CapabilityBuilderUnregisterResult): string {
  return [
    "Ambient Capability Builder unregister",
    `Package: ${result.packageName}`,
    `Builder source: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Unregistered at: ${result.unregisteredAt}`,
    "",
    "Removed installed Ambient CLI package:",
    `- id: ${result.removedPackage.id}`,
    `- name: ${result.removedPackage.name}`,
    `- source: ${result.removedPackage.source}`,
    "",
    "Preserved by default:",
    `- builder source: ${result.preserved.builderSource ? "yes" : "no"}`,
    `- logs: ${result.preserved.logs ? "yes" : "no"}`,
    `- artifacts: ${result.preserved.artifacts ? "yes" : "no"}`,
    `- env/secret metadata: ${result.preserved.envSecrets ? "yes" : "no"}`,
    "",
    `Remaining installed Ambient CLI packages: ${result.catalog.packages.length}`,
    "Next: refresh Pi capability search/describe state. The managed builder source can be re-validated and registered again if rollback is needed.",
    "Rollback note: use ambient_capability_builder_register on the preserved source after validation; do not reinstall the preserved Builder-managed source with generic Ambient CLI package install unless the user explicitly requests generic package operations.",
  ].join("\n");
}

export function capabilityBuilderRegistrationRepairText(result: CapabilityBuilderRegistrationRepairResult): string {
  return [
    "Ambient Capability Builder registration metadata repair",
    `Package: ${result.packageName}`,
    `Builder source: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Repaired at: ${result.repairedAt}`,
    result.previousStatus ? `Previous status: ${result.previousStatus}` : undefined,
    "",
    "Cleared stale installed refs:",
    `- installed package id: ${result.staleInstalledPackageId ?? "none"}`,
    `- installed source: ${result.staleInstalledSource ?? "none"}`,
    `- installed git ref: ${result.staleInstalledRef ?? "none"}`,
    `- installed package present before repair: ${result.installedPresent ? "yes" : "no"}`,
    result.reason ? `Reason: ${result.reason}` : undefined,
    "",
    "Updated metadata:",
    "- status: unregistered",
    "- installedPackageId: null",
    "- installedSource: null",
    "- refs.installed: null",
    "",
    "No installed package files were removed by this repair. Next: retry ambient_capability_builder_register only after confirming validation metadata still matches the Builder-managed source.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderValidateText(result: CapabilityBuilderValidateResult): string {
  const runtimeGuidance = capabilityBuilderDependencyRuntimeGuidance(result.commands);
  const requiredEnvNames = requiredEnvRequirementNames(result.envRequirements);
  const missingEnvNames = missingEnvNamesFromValidation(result.commands, requiredEnvNames);
  return [
    "Ambient Capability Builder validation",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.succeeded ? "succeeded" : "failed"}`,
    result.validatedAt ? `Validated at: ${result.validatedAt}` : undefined,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Total duration: ${formatDurationMs(result.durationMs)}`,
    `Log: ${result.relativeLogPath}`,
    "Log policy: stdout/stderr are shown as bounded previews below; the log records actual output lengths and truncation flags.",
    requiredEnvNames.length ? `Required env: ${requiredEnvNames.join(", ")}` : undefined,
    result.networkHosts.length ? `Network hosts: ${result.networkHosts.join(", ")}` : undefined,
    missingEnvNames.length
      ? `Missing secret/env blocker: validation output references missing required env ${missingEnvNames.join(", ")}. Use ambient_capability_builder_secret_request for Desktop-owned entry or an approved Builder-scoped env binding, then retry; never ask the user to paste secret values into chat.`
      : undefined,
    "",
    "Runtime guidance:",
    ...runtimeGuidance.map((note) => `- ${note}`),
    "",
    "Commands:",
    ...result.commands.flatMap((command, index) => [
      `${index + 1}. ${formatCommand(command.command, command.args)}`,
      `   source: ${command.source}${command.commandName ? ` (${command.commandName})` : ""}`,
      `   cwd: ${command.cwd}`,
      `   rationale: ${command.rationale}`,
      command.timeoutProfile ? `   timeout profile: ${command.timeoutProfile} (${command.timeoutMs ?? "default"}ms, idle ${command.idleTimeoutMs ?? "default"}ms)` : undefined,
      command.deviceSelection ? `   device selection: ${JSON.stringify(command.deviceSelection)}` : undefined,
      command.progressPatterns?.length ? `   progress patterns: ${command.progressPatterns.join("; ")}` : undefined,
      `   status: ${command.status}${command.exitCode !== undefined ? ` (exit ${command.exitCode})` : ""}, ${formatDurationMs(command.durationMs)}`,
      command.timeoutPhase ? `   timeout phase: ${command.timeoutPhase}; recommended retry profile: ${command.recommendedRetryProfile ?? "none"}` : undefined,
      `   stdout: ${formatOutputPreview(command.stdoutPreview, command.stdoutLength, command.stdoutTruncated)}`,
      `   stderr: ${formatOutputPreview(command.stderrPreview, command.stderrLength, command.stderrTruncated)}`,
      command.error ? `   error: ${command.error}` : undefined,
    ].filter((line): line is string => Boolean(line))),
    "",
    "Artifacts:",
    ...(result.artifacts.length ? result.artifacts.map((artifact) => `- ${artifact.path} (${artifact.sizeBytes} bytes)`) : ["- none detected"]),
    "",
    result.succeeded
      ? "Next: register with ambient_capability_builder_register before installed live testing. Do not use generic Ambient CLI package install for this Builder-managed source."
      : missingEnvNames.length
        ? "Next: stop. Do not register, re-register, reinstall, or activate this package. Resolve the missing required env through ambient_capability_builder_secret_request or approved Builder-scoped env binding, then retry validation/use without exposing the secret value."
        : "Next: stop. Do not register, re-register, reinstall, or activate this package. Repair the Builder-managed source, run preview if package shape changed, then validate again.",
  ].filter(Boolean).join("\n");
}

export function requiredEnvRequirementNames(envRequirements: CapabilityBuilderEnvRequirement[]): string[] {
  return envRequirements.filter((env) => env.required).map((env) => env.name);
}

function missingEnvNamesFromValidation(
  commands: CapabilityBuilderValidateResult["commands"],
  requiredEnvNames: string[],
): string[] {
  if (!requiredEnvNames.length) return [];
  const failedOutput = commands
    .filter((command) => command.status === "failed")
    .map((command) => `${command.stdoutPreview}\n${command.stderrPreview}\n${command.error ?? ""}`)
    .join("\n");
  if (!/\b(missing|required|not configured|not set|env|environment|secret|api key)\b/i.test(failedOutput)) return [];
  return requiredEnvNames.filter((name) => failedOutput.includes(name));
}

export function capabilityBuilderInstallDepsText(result: CapabilityBuilderInstallDepsResult): string {
  const runtimeGuidance = capabilityBuilderDependencyRuntimeGuidance(result.commands);
  return [
    "Ambient Capability Builder dependency installation",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.succeeded ? "succeeded" : "failed"}`,
    `Started: ${result.startedAt}`,
    `Completed: ${result.completedAt}`,
    `Total duration: ${formatDurationMs(result.durationMs)}`,
    `Log: ${result.relativeLogPath}`,
    "Log policy: stdout/stderr are shown as bounded previews below; the log records actual output lengths and truncation flags.",
    "",
    "Runtime guidance:",
    ...runtimeGuidance.map((note) => `- ${note}`),
    "",
    "Commands:",
    ...result.commands.flatMap((command, index) => [
      `${index + 1}. ${formatCommand(command.command, command.args)}`,
      `   cwd: ${command.cwd}`,
      `   rationale: ${command.rationale}`,
      command.timeoutProfile ? `   timeout profile: ${command.timeoutProfile} (${command.timeoutMs ?? "default"}ms, idle ${command.idleTimeoutMs ?? "default"}ms)` : undefined,
      command.progressPatterns?.length ? `   progress patterns: ${command.progressPatterns.join("; ")}` : undefined,
      `   status: ${command.status}${command.exitCode !== undefined ? ` (exit ${command.exitCode})` : ""}, ${formatDurationMs(command.durationMs)}`,
      command.timeoutPhase ? `   timeout phase: ${command.timeoutPhase}; recommended retry profile: ${command.recommendedRetryProfile ?? "none"}` : undefined,
      `   stdout: ${formatOutputPreview(command.stdoutPreview, command.stdoutLength, command.stdoutTruncated)}`,
      `   stderr: ${formatOutputPreview(command.stderrPreview, command.stderrLength, command.stderrTruncated)}`,
      command.error ? `   error: ${command.error}` : undefined,
    ].filter((line): line is string => Boolean(line))),
    "",
    result.succeeded
      ? "Next: run static preview again, then validate health checks and smoke behavior before registration."
      : "Next: fix the failed command or package shape before validation, registration, or activation. Do not register or reinstall the Builder-managed package after failed dependency setup.",
  ].join("\n");
}

export function capabilityBuilderInstallDepsOutputPreview(result: CapabilityBuilderInstallDepsResult): ToolLargeOutputPreview | undefined {
  const items = result.commands.flatMap((command, index): ToolLargeOutputPreviewItem[] => {
    const commandLabel = `command ${index + 1}`;
    return [
      {
        label: `${commandLabel} stdout`,
        chars: command.stdoutLength,
        previewChars: command.stdoutPreview.length,
        truncated: command.stdoutTruncated,
        artifactPath: result.relativeLogPath,
        suggestedTools: ["file_read"],
      },
      {
        label: `${commandLabel} stderr`,
        chars: command.stderrLength,
        previewChars: command.stderrPreview.length,
        truncated: command.stderrTruncated,
        artifactPath: result.relativeLogPath,
        suggestedTools: ["file_read"],
      },
    ].filter((item) => item.chars > 0 || item.previewChars > 0);
  });
  if (!items.length) return undefined;
  const stdoutChars = result.commands.reduce((sum, command) => sum + command.stdoutLength, 0);
  const stderrChars = result.commands.reduce((sum, command) => sum + command.stderrLength, 0);
  return {
    kind: "large-output",
    summary: [
      `${result.commands.length.toLocaleString()} ${result.commands.length === 1 ? "command" : "commands"}`,
      stdoutChars ? `stdout ${stdoutChars.toLocaleString()} chars` : undefined,
      stderrChars ? `stderr ${stderrChars.toLocaleString()} chars` : undefined,
      `log: ${result.relativeLogPath}`,
    ].filter(Boolean).join(" · "),
    items,
  };
}

export function capabilityBuilderPreviewText(result: CapabilityBuilderPreviewResult): string {
  const descriptor = result.descriptor;
  return [
    "Ambient Capability Builder preview",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Status: ${result.valid ? "valid for static preview" : "blocked by static preview errors"}`,
    "",
    "Files:",
    `- ambient-cli.json: ${result.files.descriptor ? "present" : "missing"}`,
    `- SKILL.md: ${result.files.skill ? "present" : "missing"}`,
    `- capability-build.json: ${result.files.buildManifest ? "present" : "missing"}`,
    `- package.json: ${result.files.packageJson ? "present" : "absent"}`,
    descriptor
      ? [
        "",
        "Descriptor:",
        `- version: ${descriptor.version ?? "unspecified"}`,
        `- commands: ${descriptor.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
        `- voice providers: ${descriptor.voiceProviderCommandNames.length ? descriptor.voiceProviderCommandNames.join(", ") : "none"}`,
        `- voice discovery: ${descriptor.voiceDiscoveryCommandNames.length ? descriptor.voiceDiscoveryCommandNames.join(", ") : "none"}`,
        `- voice cloning: ${descriptor.voiceCloningCommandNames.length ? descriptor.voiceCloningCommandNames.join(", ") : "none"}`,
        `- env: ${descriptor.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
        `- network hosts: ${descriptor.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
        `- model assets: ${descriptor.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
        `- artifacts: ${descriptor.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
        `- response formats: ${descriptor.responseFormats.length ? descriptor.responseFormats.join(", ") : "none declared"}`,
      ].join("\n")
      : undefined,
    result.packageJson
      ? [
        "",
        "Package dependencies:",
        `- dependencies: ${result.packageJson.dependencies.length ? result.packageJson.dependencies.join(", ") : "none"}`,
        `- devDependencies: ${result.packageJson.devDependencies.length ? result.packageJson.devDependencies.join(", ") : "none"}`,
        `- lifecycle scripts: ${result.packageJson.lifecycleScripts.length ? result.packageJson.lifecycleScripts.join(", ") : "none"}`,
      ].join("\n")
      : undefined,
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    result.risks.length ? ["", "Risks:", ...result.risks.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.valid
      ? `Next: review the findings with the user before dependency installation, validation, registration, or activation. Use this exact sourcePath in later Capability Builder tools: ${result.relativeRootPath}. Use Capability Builder file tools, not generic workspace file tools, to edit this source. For text commands, prefer file-input flags when exact text may be hard to pass as args; for artifact commands, ensure final outputs are user-visible workspace files.`
      : "Next: fix the preview errors before dependency installation, validation, registration, or activation. Use Capability Builder file tools, not generic workspace file tools, to edit this source. Do not register or reinstall a Builder-managed package with preview errors.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderReadFileText(result: CapabilityBuilderReadFileResult): string {
  return [
    "Ambient Capability Builder file",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `File: ${result.filePath}`,
    `Size: ${result.sizeBytes} bytes`,
    result.truncated ? `Content preview truncated at ${result.maxChars} characters.` : "Content:",
    "",
    result.content,
  ].join("\n");
}

export function capabilityBuilderWriteFileText(result: CapabilityBuilderWriteFileResult): string {
  return [
    "Ambient Capability Builder file written",
    `Package: ${result.packageName}`,
    `Canonical sourcePath: ${result.sourceRef.sourcePath}`,
    `File: ${result.filePath}`,
    `Size: ${result.sizeBytes} bytes`,
    `Status: ${result.created ? "created" : "updated"}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Reason: ${result.reason}`,
    "",
    "Next steps:",
    ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

function formatEnvRequirement(env: CapabilityBuilderEnvRequirement): string {
  const required = env.required ? "required" : "optional";
  return `${env.name} (${required}${env.description ? `, ${env.description}` : ""})`;
}

function formatModelAsset(asset: CapabilityBuilderModelAsset): string {
  const details = [
    asset.url ? `url=${asset.url}` : undefined,
    asset.expectedSizeBytes !== undefined ? `size=${asset.expectedSizeBytes} bytes` : undefined,
    asset.license ? `license=${asset.license}` : undefined,
    asset.cachePath ? `cache=${asset.cachePath}` : undefined,
  ].filter(Boolean);
  return `${asset.name}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function formatVoiceDiscovery(discovery: VoiceProviderDiscoveryMetadata): string {
  const details = [
    `command=${discovery.command}`,
    discovery.source ? `source=${discovery.source}` : undefined,
    discovery.cacheTtlSeconds !== undefined ? `ttl=${discovery.cacheTtlSeconds}s` : undefined,
    discovery.requiresNetwork !== undefined ? `network=${discovery.requiresNetwork}` : undefined,
    discovery.requiresSecret?.length ? `secrets=${discovery.requiresSecret.join(",")}` : undefined,
  ].filter(Boolean);
  return details.join(", ");
}

function formatVoiceCloning(cloning: VoiceProviderCloningMetadata): string {
  if (!cloning.supported) return "not supported";
  const details = [
    "supported",
    cloning.mode ? `mode=${cloning.mode}` : undefined,
    cloning.inputs?.audioFormats.length ? `audio=${cloning.inputs.audioFormats.join("/")}` : undefined,
    cloning.inputs?.minDurationSeconds !== undefined ? `min=${cloning.inputs.minDurationSeconds}s` : undefined,
    cloning.inputs?.maxDurationSeconds !== undefined ? `max=${cloning.inputs.maxDurationSeconds}s` : undefined,
    cloning.inputs?.minSamples !== undefined ? `minSamples=${cloning.inputs.minSamples}` : undefined,
    cloning.inputs?.transcript ? `transcript=${cloning.inputs.transcript}` : undefined,
    cloning.requiresConsent !== undefined ? `consent=${cloning.requiresConsent}` : undefined,
    cloning.requiresSecret?.length ? `secrets=${cloning.requiresSecret.join(",")}` : undefined,
    cloning.networkHosts?.length ? `network=${cloning.networkHosts.join(",")}` : undefined,
    cloning.output?.creates.length ? `creates=${cloning.output.creates.join(",")}` : undefined,
  ].filter(Boolean);
  return details.join(", ");
}

export function capabilityBuilderUpdatePlanText(result: CapabilityBuilderUpdatePlanResult): string {
  const descriptor = result.preview.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder update plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, dependencies, validation, registration, or installed package state were changed.",
    result.requestedChanges ? `Requested changes: ${result.requestedChanges}` : undefined,
    result.targetVersion ? `Target version: ${result.targetVersion}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}`,
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- installer shape: ${manifest.installerShape ?? "unspecified"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.errors.length
      ? "Next: fix preview errors before any update implementation, dependency installation, validation, or registration."
      : "Next: present this update plan to the user and wait for approval before any mutation.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderRemovalPlanText(result: CapabilityBuilderRemovalPlanResult): string {
  const descriptor = result.preview?.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder removal plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Source exists: ${result.sourceExists ? "yes" : "no"}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, logs, artifacts, env/secret metadata, registry state, or installed package state were changed.",
    result.installedPackageId ? `Installed package id: ${result.installedPackageId}` : undefined,
    result.installedSource ? `Installed source: ${result.installedSource}` : undefined,
    result.reason ? `Reason: ${result.reason}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    result.preview ? `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}` : "- static preview: unavailable",
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Source inventory:",
    `- package files: ${result.sourceInventory.packageFiles.length}`,
    `- metadata files: ${result.sourceInventory.metadataFiles.length ? result.sourceInventory.metadataFiles.join(", ") : "none"}`,
    `- log files: ${result.sourceInventory.logFiles.length ? result.sourceInventory.logFiles.join(", ") : "none"}`,
    `- possible artifact files: ${result.sourceInventory.possibleArtifactFiles.length ? result.sourceInventory.possibleArtifactFiles.join(", ") : "none detected"}`,
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Preserve by default:",
    ...result.preserveByDefault.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    result.errors.length
      ? "Next: fix preview errors or confirm installed package metadata before any removal, deletion, unregistering, or secret cleanup."
      : "Next: present this removal plan to the user and wait for approval before any destructive or registry-changing action.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderRepairPlanText(result: CapabilityBuilderRepairPlanResult): string {
  const descriptor = result.preview.descriptor;
  const manifest = result.buildManifest;
  return [
    "Ambient Capability Builder repair plan",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Canonical sourcePath: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    "Mode: read-only planning; no files, dependencies, validation, registration, or installed package state were changed.",
    result.requestedRepair ? `Requested repair: ${result.requestedRepair}` : undefined,
    result.notes ? `Notes: ${result.notes}` : undefined,
    "",
    "Current package:",
    `- static preview: ${result.preview.valid ? "valid" : "blocked by errors"}`,
    `- descriptor commands: ${descriptor?.commandNames.length ? descriptor.commandNames.join(", ") : "none"}`,
    `- env: ${descriptor?.envRequirements.length ? descriptor.envRequirements.map(formatEnvRequirement).join(", ") : "none"}`,
    `- network hosts: ${descriptor?.networkHosts.length ? descriptor.networkHosts.join(", ") : "none"}`,
    `- model assets: ${descriptor?.modelAssets.length ? descriptor.modelAssets.map(formatModelAsset).join(", ") : "none"}`,
    `- artifacts: ${descriptor?.artifactOutputTypes.length ? descriptor.artifactOutputTypes.join(", ") : "none declared"}`,
    manifest
      ? [
        `- builder status: ${manifest.status ?? "unknown"}`,
        `- provider/runtime: ${manifest.provider ?? "unspecified"}`,
        `- installed package: ${manifest.installedPackageId ?? "not recorded"}`,
        `- refs: ${Object.entries(manifest.refs).map(([key, value]) => `${key}=${value ?? "null"}`).join(", ") || "none"}`,
      ].join("\n")
      : "- builder manifest: missing or unreadable",
    "",
    "Source inventory:",
    `- package files: ${result.sourceInventory.packageFiles.length}`,
    `- metadata files: ${result.sourceInventory.metadataFiles.length ? result.sourceInventory.metadataFiles.join(", ") : "none"}`,
    `- log files: ${result.sourceInventory.logFiles.length ? result.sourceInventory.logFiles.join(", ") : "none"}`,
    `- possible artifact files: ${result.sourceInventory.possibleArtifactFiles.length ? result.sourceInventory.possibleArtifactFiles.join(", ") : "none detected"}`,
    "",
    "Diagnostic evidence:",
    `- recommended reads: ${result.diagnosticEvidence.recommendedReads.length ? result.diagnosticEvidence.recommendedReads.join("; ") : "none yet"}`,
    ...(result.diagnosticEvidence.recentLogEntries.length
      ? result.diagnosticEvidence.recentLogEntries.flatMap((log) => [
        `- ${log.path}: ${log.lineCount} line${log.lineCount === 1 ? "" : "s"}`,
        ...log.entries.map((entry) => `  - ${entry}`),
      ])
      : ["- no log excerpts available"]),
    "",
    "Recommended steps:",
    ...result.recommendedSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Installer recovery guidance:",
    ...result.installerRecoveryGuidance.map((step) => `- ${step}`),
    "",
    "Installer recovery templates:",
    ...result.installerRecoveryTemplates.flatMap((template) => [
      `- ${template.id}: ${template.label}`,
      `  applies when: ${template.appliesWhen}`,
      `  privileged boundary: ${template.privilegedBoundary}`,
      ...template.steps.map((step, index) => `  ${index + 1}. ${step}`),
    ]),
    "",
    "Approval checkpoints:",
    ...result.approvalCheckpoints.map((step) => `- ${step}`),
    "",
    "Validation plan:",
    ...result.validationPlan.map((step) => `- ${step}`),
    "",
    "Rollback plan:",
    ...result.rollbackPlan.map((step) => `- ${step}`),
    result.errors.length ? ["", "Errors:", ...result.errors.map((item) => `- ${item}`)].join("\n") : undefined,
    result.warnings.length ? ["", "Warnings:", ...result.warnings.map((item) => `- ${item}`)].join("\n") : undefined,
    "",
    "Next: present this repair plan to the user and wait for approval before any mutation.",
  ].filter(Boolean).join("\n");
}

export function capabilityBuilderApplyRepairText(result: CapabilityBuilderApplyRepairResult): string {
  return [
    "Ambient Capability Builder repair applied",
    `Package: ${result.packageName}`,
    `Path: ${result.relativeRootPath}`,
    `Git SHA: ${result.gitSha ?? "unavailable"}`,
    `Repair Git SHA: ${result.repairGitSha ?? "unavailable"}`,
    `Repaired at: ${result.repairedAt}`,
    `Reason: ${result.reason}`,
    "",
    "Files written:",
    ...result.files.map((file) => `- ${file.path} (${file.sizeBytes} bytes, ${file.created ? "created" : "updated"}): ${file.rationale}`),
    "",
    "Validation state: prior validation metadata was cleared; this package must be previewed and validated again before registration.",
    "",
    "Next steps:",
    ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

export function capabilityBuilderDependencyRuntimeGuidance(commands: Array<Pick<CapabilityBuilderDependencyCommandResult, "command" | "args"> | CapabilityBuilderDependencyCommand>): string[] {
  const notes = [
    "When every command has a terminal succeeded/failed status, the dependency or validation step is complete; do not add arbitrary post-command wait padding.",
  ];
  if (commands.some((command) => isPythonPipInstallCommand(command.command, command.args ?? []))) {
    notes.push(
      "Python package install detected: the approval rationale should state the target environment. Prefer package-local .venv commands such as `uv venv --python <version> .venv` followed by `uv pip install --python .venv/bin/python ...`, or `.venv/bin/python -m pip install ...`.",
    );
  }
  if (commands.some((command) => isPythonPipInstallCommand(command.command, command.args ?? []) && !isPackageLocalPythonPipInstallCommand(command.command, command.args ?? []))) {
    notes.push("Bare/global pip install forms should be rewritten to target a package-local .venv unless the user explicitly approves global/user-site installation risk.");
  }
  if (commands.some((command) => isUvRunWithRuntime(command.command, command.args ?? []))) {
    notes.push(
      "`uv run --with ...` is a package-manager mediated runtime: the first run may resolve/cache packages and later runs may be faster, but the command result is still the completion signal.",
    );
    notes.push("If this capability depends on this mediated runtime at execution time, describe that in SKILL.md and preserve the exact package-manager command in the descriptor.");
  }
  if (commands.some((command) => isPackageManagerCommand(command.command))) {
    notes.push("Package-manager output can be verbose; use the log path plus actual stdout/stderr lengths instead of asking Pi to wait or rerun just to inspect full output.");
  }
  return [...new Set(notes)];
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function formatDurationMs(durationMs: number): string {
  return `${durationMs.toLocaleString()} ms`;
}

function formatOutputPreview(preview: string, length: number, truncated: boolean): string {
  if (!length) return "(empty, 0 chars)";
  const suffix = truncated ? `... (truncated, ${length} chars total)` : `(${length} chars)`;
  return `${JSON.stringify(preview)} ${suffix}`;
}

function isUvRunWithRuntime(command: string, args: string[]): boolean {
  return basename(command) === "uv" && args[0] === "run" && args.includes("--with");
}

function isPythonPipInstallCommand(command: string, args: string[]): boolean {
  const executable = basename(command);
  if (/^pip(?:\d+(?:\.\d+)*)?$/.test(executable) && args[0] === "install") return true;
  if (/^python(?:\d+(?:\.\d+)*)?$/.test(executable) && args[0] === "-m" && args[1] === "pip" && args[2] === "install") return true;
  return executable === "uv" && args[0] === "pip" && args[1] === "install";
}

function isPackageLocalPythonPipInstallCommand(command: string, args: string[]): boolean {
  const executable = basename(command);
  if (executable === "uv" && args[0] === "pip" && args[1] === "install") {
    return args.some((arg, index) => arg === "--python" && hasPackageLocalVenvPath(args[index + 1] ?? ""))
      || args.some((arg) => arg.startsWith("--python=") && hasPackageLocalVenvPath(arg.slice("--python=".length)));
  }
  return hasPackageLocalVenvPath(command);
}

function hasPackageLocalVenvPath(value: string): boolean {
  return value === ".venv" || value.startsWith(".venv/") || value.startsWith(".venv\\") || /[/\\]\.venv([/\\]|$)/.test(value);
}

function isPackageManagerCommand(command: string): boolean {
  return ["uv", "pip", "pip3", "python", "python3", "npm", "pnpm", "yarn", "bun", "cargo", "go"].includes(basename(command));
}
