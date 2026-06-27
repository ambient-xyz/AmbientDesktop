import type { ExecFileException } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { capabilityBuilderValidationProcessEnv } from "./capabilityBuilderEnvBindings";
import { listPackageFileMetadata, type CapabilityBuilderFileMetadata } from "./capabilityBuilderListing";
import {
  artifactPathMatchesOutputTypes,
  mimeTypeForCapabilityBuilderVoiceFormat,
  normalizeCapabilityBuilderVoiceOutputFormat,
} from "./capabilityBuilderPreviewInspection";
import type { CapabilityBuilderInstallerShape } from "./capabilityBuilderScaffold";
import { isPathInside } from "./capabilityBuilderSessionFacade";
import { ambientRuntimeEnv } from "./capabilityBuilderSetupFacade";
import { formatCommand } from "./capabilityBuilderText";
import type {
  CapabilityBuilderDependencyCommand,
  CapabilityBuilderDependencyCommandResult,
  CapabilityBuilderInstallDepsInput,
  CapabilityBuilderInstallDepsResult,
  CapabilityBuilderPreviewInput,
  CapabilityBuilderPreviewResult,
  CapabilityBuilderValidateInput,
  CapabilityBuilderValidateResult,
  CapabilityBuilderValidationArtifact,
  CapabilityBuilderValidationCommand,
} from "./capabilityBuilderTypes";
import { redactSensitiveText } from "./capabilityBuilderSecurityFacade";
import {
  executeProfiledCommand,
  isCommandTimeoutProfile,
  type CommandDevicePolicy,
  type CommandTimeoutProfile,
  type ProfiledCommandResult,
  ProfiledCommandError,
} from "./capabilityBuilderToolRuntimeFacade";

const dependencyOutputPreviewChars = 4_000;
const legacyValidationCommandTimeoutMs = 120_000;

interface ProviderContractValidationMetadata {
  outputPath: string;
  format: "mp3" | "wav" | "ogg";
  expectedMimeType: string;
  maxSizeBytes: number;
}

type CapabilityBuilderRuntimeValidationCommand = CapabilityBuilderValidationCommand & {
  args: string[];
  cwd: string;
  resolvedCwd: string;
  providerContract?: ProviderContractValidationMetadata;
};

export interface CapabilityBuilderValidationServicesDeps {
  currentGitSha: (rootPath: string) => Promise<string | undefined>;
  installerShapeFromManifest: (manifest: Record<string, unknown> | undefined) => CapabilityBuilderInstallerShape | undefined;
  isCapabilityBuilderMetadataFile: (file: string) => boolean;
  packageContentHash: (rootPath: string) => Promise<string>;
  parseJsonObject: (content: string, label: string, errors: string[]) => Record<string, unknown> | undefined;
  previewCapabilityBuilderPackage: (workspacePath: string, input: CapabilityBuilderPreviewInput) => Promise<CapabilityBuilderPreviewResult>;
  readBuildManifestIfPresent: (rootPath: string) => Promise<Record<string, unknown> | undefined>;
  recordField: (value: unknown) => Record<string, unknown>;
  stringArrayField: (value: unknown) => string[];
  stringField: (value: unknown) => string | undefined;
  toManagedInstallRelative: (workspacePath: string, absolutePath: string) => string;
  toWorkspaceRelative: (workspacePath: string, absolutePath: string) => string;
  updateValidationManifest: (
    rootPath: string,
    validatedAt: string,
    validatedHash: string,
    options?: { providerContractValidated?: boolean; logPath?: string; artifacts?: CapabilityBuilderValidationArtifact[] },
  ) => Promise<void>;
}

export function createCapabilityBuilderValidationServices(deps: CapabilityBuilderValidationServicesDeps) {
  async function installCapabilityBuilderDependencies(
    workspacePath: string,
    input: CapabilityBuilderInstallDepsInput,
  ): Promise<CapabilityBuilderInstallDepsResult> {
    if (!input.commands.length) throw new Error("At least one dependency command is required.");
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const workspace = resolve(workspacePath);
    const preview = await deps.previewCapabilityBuilderPackage(workspace, input);
    if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
    const rootPath = preview.rootPath;
    const logPath = join(rootPath, "capability-deps-log.jsonl");
    const commands = input.commands.map((command) => normalizeDependencyCommand(rootPath, command));
    const results: CapabilityBuilderDependencyCommandResult[] = [];

    for (const command of commands) {
      let result: CapabilityBuilderDependencyCommandResult;
      try {
        const output = await executeProfiledCommand({
          command: command.command,
          args: command.args,
          cwd: command.resolvedCwd,
          maxBuffer: 2 * 1024 * 1024,
          env: ambientRuntimeEnv(),
          timeoutProfile: command.timeoutProfile ?? "dependencyInstall",
          progressPatterns: command.progressPatterns,
          devicePolicy: command.devicePolicy,
          phase: `capability-builder dependency ${preview.packageName}`,
        });
        result = dependencyCommandResult(
          { ...command, args: output.args },
          "succeeded",
          output.durationMs,
          output.stdout,
          output.stderr,
          undefined,
          undefined,
          output,
        );
      } catch (error) {
        const execError = error as ExecFileException & { stdout?: string | Buffer; stderr?: string | Buffer };
        result = dependencyCommandResult(
          command,
          "failed",
          commandDurationMs(error),
          execError.stdout,
          execError.stderr,
          execError.code ?? undefined,
          execError.message,
          error instanceof ProfiledCommandError ? error : undefined,
        );
      }
      results.push(result);
      await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...result })}\n`, "utf8");
      if (result.status === "failed") break;
    }
    const completedAtMs = Date.now();

    return {
      packageName: preview.packageName,
      rootPath,
      relativeRootPath: preview.relativeRootPath,
      gitSha: await deps.currentGitSha(rootPath),
      succeeded: results.every((result) => result.status === "succeeded"),
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      logPath,
      relativeLogPath: deps.toManagedInstallRelative(workspace, logPath),
      commands: results,
    };
  }

  async function validateCapabilityBuilderPackage(
    workspacePath: string,
    input: CapabilityBuilderValidateInput,
  ): Promise<CapabilityBuilderValidateResult> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const workspace = resolve(workspacePath);
    const preview = await deps.previewCapabilityBuilderPackage(workspace, input);
    if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
    const rootPath = preview.rootPath;
    const envRequirements = preview.descriptor?.envRequirements ?? [];
    const networkHosts = preview.descriptor?.networkHosts ?? [];
    const artifactOutputTypes = preview.descriptor?.artifactOutputTypes ?? [];
    const smokeTestPath = join(rootPath, "tests", "smoke.test.mjs");
    if (artifactOutputTypes.length && input.includeSmokeTests === false) {
      throw new Error("Artifact-generating capability packages must run smoke tests during validation.");
    }
    if (artifactOutputTypes.length && !existsSync(smokeTestPath)) {
      throw new Error(
        "Artifact-generating capability packages must include tests/smoke.test.mjs that exercises the primary command and writes a declared artifact.",
      );
    }
    const beforeFiles = await listPackageFileMetadata(rootPath);
    const commands = await capabilityBuilderValidationCommands(workspace, rootPath, input);
    if (!commands.length)
      throw new Error("No validation commands are available. Add descriptor healthCheck entries or a tests/smoke.test.mjs file.");
    const logPath = join(rootPath, "capability-validation-log.jsonl");
    const results: CapabilityBuilderValidateResult["commands"] = [];
    const validationEnv = await capabilityBuilderValidationProcessEnv(workspace, preview);

    for (const command of commands) {
      let result: CapabilityBuilderDependencyCommandResult;
      try {
        const legacyValidationBudget = command.timeoutProfile ? undefined : legacyValidationCommandTimeoutMs;
        const output = await executeProfiledCommand({
          command: command.command,
          args: command.args ?? [],
          cwd: command.resolvedCwd,
          maxBuffer: 2 * 1024 * 1024,
          env: validationEnv,
          ...(legacyValidationBudget ? { timeoutMs: legacyValidationBudget, idleTimeoutMs: legacyValidationBudget } : {}),
          timeoutProfile: command.timeoutProfile ?? validationCommandDefaultTimeoutProfile(command),
          progressPatterns: command.progressPatterns,
          devicePolicy: command.devicePolicy,
          phase: `capability-builder validation ${preview.packageName}:${command.source}`,
        });
        result = dependencyCommandResult(
          { ...command, args: output.args },
          "succeeded",
          output.durationMs,
          output.stdout,
          output.stderr,
          undefined,
          undefined,
          output,
        );
        if (command.source === "providerContract") {
          const providerContractError = await validateProviderContractCommandOutput(workspace, command, output.stdout);
          if (providerContractError) {
            result = {
              ...dependencyCommandResult(
                { ...command, args: output.args },
                "failed",
                output.durationMs,
                output.stdout,
                output.stderr,
                "provider-contract-invalid",
                providerContractError,
                output,
              ),
            };
          }
        }
      } catch (error) {
        const execError = error as ExecFileException & { stdout?: string | Buffer; stderr?: string | Buffer };
        result = dependencyCommandResult(
          { ...command, args: command.args ?? [] },
          "failed",
          commandDurationMs(error),
          execError.stdout,
          execError.stderr,
          execError.code ?? undefined,
          execError.message,
          error instanceof ProfiledCommandError ? error : undefined,
        );
      }
      const validationResult = { ...result, source: command.source, ...(command.commandName ? { commandName: command.commandName } : {}) };
      results.push(validationResult);
      await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...validationResult })}\n`, "utf8");
      if (result.status === "failed") break;
    }

    const afterFiles = await listPackageFileMetadata(rootPath);
    const artifacts = validationArtifactFiles(beforeFiles, afterFiles, artifactOutputTypes);
    if (results.every((result) => result.status === "succeeded") && artifactOutputTypes.length && !artifacts.length) {
      const existingCandidates = existingDeclaredArtifactCandidates(beforeFiles, afterFiles, artifactOutputTypes);
      const artifactError = missingDeclaredArtifactError(preview, artifactOutputTypes, existingCandidates);
      const artifactResult = {
        ...dependencyCommandResult(
          {
            command: "ambient-artifact-check",
            args: [],
            cwd: ".",
            rationale: `Verify validation produced at least one declared artifact: ${artifactOutputTypes.join(", ")}.`,
          },
          "failed",
          0,
          "",
          "",
          "artifact-missing",
          artifactError,
        ),
        source: "smokeTest" as const,
      };
      results.push(artifactResult);
      await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...artifactResult })}\n`, "utf8");
    }
    const succeeded = results.every((result) => result.status === "succeeded");
    const validatedAt = succeeded ? new Date().toISOString() : undefined;
    const providerContractCommands = results.filter((result) => result.source === "providerContract");
    const providerContractValidated =
      providerContractCommands.length > 0 && providerContractCommands.every((result) => result.status === "succeeded");
    if (validatedAt) {
      await deps.updateValidationManifest(rootPath, validatedAt, await deps.packageContentHash(rootPath), {
        providerContractValidated,
        logPath: deps.toManagedInstallRelative(workspace, logPath),
        artifacts,
      });
    }
    const completedAtMs = Date.now();

    return {
      packageName: preview.packageName,
      rootPath,
      relativeRootPath: preview.relativeRootPath,
      gitSha: await deps.currentGitSha(rootPath),
      succeeded,
      ...(validatedAt ? { validatedAt } : {}),
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      logPath,
      relativeLogPath: deps.toManagedInstallRelative(workspace, logPath),
      envRequirements,
      networkHosts,
      commands: results,
      artifacts,
    };
  }

  async function capabilityBuilderValidationPreviewText(workspacePath: string, input: CapabilityBuilderValidateInput): Promise<string> {
    const workspace = resolve(workspacePath);
    const preview = await deps.previewCapabilityBuilderPackage(workspace, input);
    if (!preview.valid) throw new Error(`Capability package preview has errors: ${preview.errors.join("; ")}`);
    const commands = await capabilityBuilderValidationCommands(workspace, preview.rootPath, input);
    return [
      `Package: ${preview.packageName}`,
      `Managed root: ${preview.relativeRootPath}`,
      `Canonical sourcePath: ${preview.relativeRootPath}`,
      `Git SHA: ${preview.gitSha ?? "unavailable"}`,
      "Effect: runs the validation commands below without a shell and writes capability-validation-log.jsonl in the package root.",
      "No registration, activation, or installed Ambient CLI execution happens in this step.",
      "",
      "Commands:",
      ...commands.map((command, index) =>
        [
          `${index + 1}. ${formatCommand(command.command, command.args ?? [])}`,
          `   source: ${command.source}${command.commandName ? ` (${command.commandName})` : ""}`,
          `   cwd: ${command.cwd}`,
          `   rationale: ${command.rationale}`,
        ].join("\n"),
      ),
    ].join("\n");
  }

  function normalizeDependencyCommand(
    rootPath: string,
    command: CapabilityBuilderDependencyCommand,
  ): CapabilityBuilderDependencyCommand & { args: string[]; cwd: string; resolvedCwd: string } {
    const executable = command.command.trim();
    if (!executable) throw new Error("Dependency command executable is required.");
    if (executable.includes("\0") || executable.includes("\n"))
      throw new Error(`Dependency command contains unsupported characters: ${executable}`);
    const args = command.args ?? [];
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
      throw new Error(`Dependency command args must be strings: ${executable}`);
    if (args.some((arg) => arg.includes("\0"))) throw new Error(`Dependency command args contain unsupported characters: ${executable}`);
    const cwd = command.cwd?.trim() || ".";
    const resolvedCwd = resolve(rootPath, cwd);
    if (!isPathInside(rootPath, resolvedCwd)) throw new Error(`Dependency command cwd escapes the package root: ${cwd}`);
    const rationale = command.rationale.trim();
    if (!rationale) throw new Error(`Dependency command rationale is required: ${executable}`);
    const progressPatterns = command.progressPatterns?.map((item) => item.trim()).filter(Boolean);
    return {
      command: executable,
      args,
      cwd,
      resolvedCwd,
      rationale,
      ...(command.timeoutProfile ? { timeoutProfile: command.timeoutProfile } : {}),
      ...(progressPatterns?.length ? { progressPatterns } : {}),
      ...(command.devicePolicy ? { devicePolicy: command.devicePolicy } : {}),
    };
  }

  function dependencyCommandResult(
    command: CapabilityBuilderDependencyCommand & { args: string[]; cwd: string },
    status: CapabilityBuilderDependencyCommandResult["status"],
    durationMs: number,
    stdoutValue: string | Buffer | undefined,
    stderrValue: string | Buffer | undefined,
    exitCode?: number | string,
    error?: string,
    execution?: ProfiledCommandResult | ProfiledCommandError,
  ): CapabilityBuilderDependencyCommandResult {
    const stdout = outputText(stdoutValue);
    const stderr = outputText(stderrValue);
    const safeStdout = redactSensitiveText(stdout);
    const safeStderr = redactSensitiveText(stderr);
    const args = execution instanceof ProfiledCommandError ? execution.args : (execution?.args ?? command.args);
    return {
      command: command.command,
      args: args.map(redactSensitiveText),
      cwd: command.cwd,
      rationale: command.rationale,
      status,
      durationMs,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(error ? { error: redactSensitiveText(error) } : {}),
      stdoutPreview: safeStdout.slice(0, dependencyOutputPreviewChars),
      stderrPreview: safeStderr.slice(0, dependencyOutputPreviewChars),
      stdoutLength: safeStdout.length,
      stderrLength: safeStderr.length,
      stdoutTruncated: safeStdout.length > dependencyOutputPreviewChars,
      stderrTruncated: safeStderr.length > dependencyOutputPreviewChars,
      ...(execution?.timeoutProfile
        ? { timeoutProfile: execution.timeoutProfile }
        : command.timeoutProfile
          ? { timeoutProfile: command.timeoutProfile }
          : {}),
      ...(execution?.timeoutMs ? { timeoutMs: execution.timeoutMs } : {}),
      ...(execution?.idleTimeoutMs ? { idleTimeoutMs: execution.idleTimeoutMs } : {}),
      ...(execution instanceof ProfiledCommandError && execution.timeoutPhase ? { timeoutPhase: execution.timeoutPhase } : {}),
      ...(execution?.lastProgressAt ? { lastProgressAt: execution.lastProgressAt } : {}),
      ...(execution instanceof ProfiledCommandError && execution.lastProgressMs !== undefined
        ? { lastProgressMs: execution.lastProgressMs }
        : {}),
      ...(execution instanceof ProfiledCommandError && execution.recommendedRetryProfile
        ? { recommendedRetryProfile: execution.recommendedRetryProfile }
        : {}),
      ...(command.progressPatterns?.length ? { progressPatterns: command.progressPatterns } : {}),
      ...(execution?.matchedProgressPatterns.length ? { matchedProgressPatterns: execution.matchedProgressPatterns } : {}),
      ...(execution?.deviceSelection ? { deviceSelection: execution.deviceSelection } : {}),
    };
  }

  function commandDurationMs(error: unknown): number {
    return error instanceof ProfiledCommandError ? error.durationMs : 0;
  }

  function validationCommandDefaultTimeoutProfile(command: CapabilityBuilderValidationCommand): CommandTimeoutProfile {
    if (command.source === "providerContract") return "liveGeneration";
    if (command.source === "smokeTest") return "quickProbe";
    return "healthCheck";
  }

  function outputText(value: string | Buffer | undefined): string {
    if (value === undefined) return "";
    return Buffer.isBuffer(value) ? value.toString("utf8") : value;
  }

  async function capabilityBuilderValidationCommands(
    workspace: string,
    rootPath: string,
    input: CapabilityBuilderValidateInput,
  ): Promise<CapabilityBuilderRuntimeValidationCommand[]> {
    const errors: string[] = [];
    const descriptorPath = join(rootPath, "ambient-cli.json");
    const descriptor = deps.parseJsonObject(await readFile(descriptorPath, "utf8"), "ambient-cli.json", errors);
    if (!descriptor || errors.length) throw new Error(`ambient-cli.json is invalid: ${errors.join("; ")}`);
    const commands = deps.recordField(descriptor.commands);
    const validationCommands: CapabilityBuilderRuntimeValidationCommand[] = [];
    for (const [commandName, value] of Object.entries(commands)) {
      const command = deps.recordField(value);
      const healthCheck = deps.stringArrayField(command.healthCheck);
      if (!healthCheck.length) continue;
      const executionMetadata = descriptorCommandExecutionMetadata(command);
      const cwdPolicy = deps.stringField(command.cwd) ?? "workspace";
      const cwdRoot = cwdPolicy === "package" ? rootPath : workspace;
      const normalized = normalizeDependencyCommand(cwdRoot, {
        command: healthCheck[0],
        args: healthCheck.slice(1),
        cwd: ".",
        rationale: `Run descriptor health check for ${commandName}.`,
        ...executionMetadata,
      });
      validationCommands.push({ ...normalized, source: "healthCheck", commandName });
    }
    if (input.includeSmokeTests !== false && existsSync(join(rootPath, "tests", "smoke.test.mjs"))) {
      validationCommands.push({
        ...normalizeDependencyCommand(rootPath, {
          command: "node",
          args: ["tests/smoke.test.mjs"],
          cwd: ".",
          rationale: "Run package smoke test.",
          timeoutProfile: "quickProbe",
        }),
        source: "smokeTest",
      });
    }
    const manifest = await deps.readBuildManifestIfPresent(rootPath);
    if (deps.installerShapeFromManifest(manifest) === "tts-provider") {
      for (const [commandName, value] of Object.entries(commands)) {
        const providerCommand = providerContractValidationCommand(workspace, rootPath, commandName, deps.recordField(value));
        if (providerCommand) validationCommands.push(providerCommand);
      }
    }
    return validationCommands;
  }

  function providerContractValidationCommand(
    workspace: string,
    rootPath: string,
    commandName: string,
    command: Record<string, unknown>,
  ): CapabilityBuilderRuntimeValidationCommand | undefined {
    const voiceProvider = deps.recordField(command.voiceProvider);
    if (!Object.keys(voiceProvider).length) return undefined;
    const executable = deps.stringField(command.command);
    if (!executable) return undefined;
    const format = normalizeCapabilityBuilderVoiceOutputFormat(deps.stringField(voiceProvider.defaultFormat) ?? "wav") ?? "wav";
    const voices = Array.isArray(voiceProvider.voices) ? voiceProvider.voices : [];
    const voiceId = deps.stringField(deps.recordField(voices[0]).id);
    const outputPath = join(rootPath, "validation-artifacts", `ambient-voice-test-${Date.now()}-${process.pid}.${format}`);
    const cwdPolicy = deps.stringField(command.cwd) ?? "workspace";
    const cwdRoot = cwdPolicy === "package" ? rootPath : workspace;
    const commandArgs = [
      ...deps.stringArrayField(command.args),
      "--text",
      "Ambient voice test.",
      "--output",
      outputPath,
      "--format",
      format,
      ...(voiceId ? ["--voice", voiceId] : []),
    ];
    const executionMetadata = descriptorCommandExecutionMetadata(command);
    const normalized = normalizeDependencyCommand(cwdRoot, {
      command: executable,
      args: commandArgs,
      cwd: ".",
      rationale: `Run Ambient tts-provider contract synthesis for ${commandName}.`,
      ...executionMetadata,
      timeoutProfile: executionMetadata.timeoutProfile ?? "liveGeneration",
    });
    return {
      ...normalized,
      source: "providerContract",
      commandName,
      providerContract: {
        outputPath,
        format,
        expectedMimeType: mimeTypeForCapabilityBuilderVoiceFormat(format),
        maxSizeBytes: 25 * 1024 * 1024,
      },
    };
  }

  function descriptorCommandExecutionMetadata(
    command: Record<string, unknown>,
  ): Pick<CapabilityBuilderDependencyCommand, "timeoutProfile" | "progressPatterns" | "devicePolicy"> {
    const timeoutProfileValue = deps.stringField(command.timeoutProfile);
    if (timeoutProfileValue && !isCommandTimeoutProfile(timeoutProfileValue)) {
      throw new Error(`ambient-cli.json command timeoutProfile is invalid: ${timeoutProfileValue}`);
    }
    const timeoutProfile = timeoutProfileValue && isCommandTimeoutProfile(timeoutProfileValue) ? timeoutProfileValue : undefined;
    const progressPatterns = deps
      .stringArrayField(command.progressPatterns)
      .map((item) => item.trim())
      .filter(Boolean);
    const devicePolicy = descriptorCommandDevicePolicy(command.devicePolicy);
    return {
      ...(timeoutProfile ? { timeoutProfile } : {}),
      ...(progressPatterns.length ? { progressPatterns } : {}),
      ...(devicePolicy ? { devicePolicy } : {}),
    };
  }

  function descriptorCommandDevicePolicy(value: unknown): CommandDevicePolicy | undefined {
    const input = deps.recordField(value);
    if (!Object.keys(input).length) return undefined;
    const prefer = deps
      .stringArrayField(input.prefer)
      .map((item) => item.trim())
      .filter(Boolean);
    const cpuReason = deps.stringField(input.cpuReason)?.trim();
    const forceCpuReason = deps.stringField(input.forceCpuReason)?.trim();
    const argName = deps.stringField(input.argName)?.trim();
    const requireReasonWhenCpuForced = typeof input.requireReasonWhenCpuForced === "boolean" ? input.requireReasonWhenCpuForced : undefined;
    return {
      ...(prefer.length ? { prefer } : {}),
      ...(requireReasonWhenCpuForced !== undefined ? { requireReasonWhenCpuForced } : {}),
      ...(cpuReason ? { cpuReason } : {}),
      ...(forceCpuReason ? { forceCpuReason } : {}),
      ...(argName ? { argName } : {}),
    };
  }

  async function validateProviderContractCommandOutput(
    workspace: string,
    command: { providerContract?: ProviderContractValidationMetadata },
    stdoutValue: string | Buffer | undefined,
  ): Promise<string | undefined> {
    const contract = command.providerContract;
    if (!contract) return undefined;
    const stdout = outputText(stdoutValue).trim();
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(stdout);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Provider contract stdout must be a JSON object.";
      payload = parsed as Record<string, unknown>;
    } catch (error) {
      return `Provider contract stdout must be concise JSON metadata: ${error instanceof Error ? error.message : String(error)}`;
    }
    const audioPathValue = deps.stringField(payload.audioPath) ?? contract.outputPath;
    const resolvedAudioPath = resolve(workspace, audioPathValue);
    if (!isPathInside(workspace, resolvedAudioPath)) return "Provider contract audioPath must stay inside the workspace.";
    if (resolvedAudioPath !== contract.outputPath) {
      return `Provider contract must write audio to the exact requested --output path. Expected ${deps.toWorkspaceRelative(workspace, contract.outputPath)}, got ${deps.toWorkspaceRelative(workspace, resolvedAudioPath)}.`;
    }
    if (extname(resolvedAudioPath).toLowerCase() !== `.${contract.format}`) {
      return `Provider contract audio extension must match --format ${contract.format}.`;
    }
    const mimeType = deps.stringField(payload.mimeType);
    if (mimeType && mimeType !== contract.expectedMimeType) {
      return `Provider contract mimeType must match --format ${contract.format}: expected ${contract.expectedMimeType}, got ${mimeType}.`;
    }
    let file;
    try {
      file = await stat(resolvedAudioPath);
    } catch {
      return `Provider contract did not create audio at ${deps.toWorkspaceRelative(workspace, contract.outputPath)}.`;
    }
    if (!file.isFile()) return "Provider contract audioPath is not a file.";
    if (file.size <= 0) return "Provider contract created a zero-byte audio file.";
    if (file.size > contract.maxSizeBytes) {
      return `Provider contract tiny synthesis output is too large: ${file.size} bytes exceeds ${contract.maxSizeBytes} bytes.`;
    }
    return undefined;
  }

  function validationArtifactFiles(
    beforeFiles: Map<string, CapabilityBuilderFileMetadata>,
    afterFiles: Map<string, CapabilityBuilderFileMetadata>,
    artifactOutputTypes: string[],
  ): CapabilityBuilderValidationArtifact[] {
    return [...afterFiles.entries()]
      .filter(([file]) => isCapabilityBuilderValidationArtifactCandidate(file))
      .filter(([file]) => !artifactOutputTypes.length || artifactPathMatchesOutputTypes(file, artifactOutputTypes))
      .filter(([file, metadata]) => {
        const before = beforeFiles.get(file);
        if (!before) return true;
        if (!artifactOutputTypes.length) return false;
        return before.sizeBytes !== metadata.sizeBytes || before.mtimeMs !== metadata.mtimeMs;
      })
      .map(([path, metadata]) => ({ path, sizeBytes: metadata.sizeBytes }));
  }

  function existingDeclaredArtifactCandidates(
    beforeFiles: Map<string, CapabilityBuilderFileMetadata>,
    afterFiles: Map<string, CapabilityBuilderFileMetadata>,
    artifactOutputTypes: string[],
  ): string[] {
    return [...afterFiles.keys()]
      .filter((file) => beforeFiles.has(file))
      .filter((file) => isCapabilityBuilderValidationArtifactCandidate(file))
      .filter((file) => artifactPathMatchesOutputTypes(file, artifactOutputTypes))
      .sort();
  }

  function missingDeclaredArtifactError(
    preview: CapabilityBuilderPreviewResult,
    artifactOutputTypes: string[],
    existingCandidates: string[],
  ): string {
    const responseFormats = preview.descriptor?.responseFormats ?? [];
    const stdoutContractHint =
      preview.installerShape === "search-provider" || responseFormats.length
        ? ` This looks like a stdout/API response contract${preview.installerShape === "search-provider" ? " for a search-provider" : ""}${responseFormats.length ? ` (${responseFormats.join(", ")})` : ""}. For search/API/text providers, put JSON/Markdown/text response shape in responseFormats and remove artifacts.outputTypes/outputFileArtifactTypes unless the command intentionally writes files.`
        : " If this capability returns concise stdout instead of file artifacts, remove artifacts.outputTypes/outputFileArtifactTypes and describe stdout/API shape in responseFormats.";
    const artifactRepairHint =
      "If it is a file artifact generator, update tests/smoke.test.mjs to run the primary command and create or update a fresh declared artifact file.";
    const base = existingCandidates.length
      ? `Validation did not create or update any declared artifact files (${artifactOutputTypes.join(", ")}). Matching declared artifact file(s) already existed before validation: ${existingCandidates.join(", ")}.`
      : `Validation did not create any declared artifact files (${artifactOutputTypes.join(", ")}).`;
    return `${base}${stdoutContractHint} ${artifactRepairHint}`;
  }

  function isCapabilityBuilderValidationArtifactCandidate(file: string): boolean {
    if (file.startsWith(".git/")) return false;
    if (deps.isCapabilityBuilderMetadataFile(file)) return false;
    if (/^(ambient-cli\.json|SKILL\.md|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file)) return false;
    if (file.startsWith("scripts/") || file.startsWith("tests/")) return false;
    return true;
  }

  return {
    capabilityBuilderValidationPreviewText,
    installCapabilityBuilderDependencies,
    validateCapabilityBuilderPackage,
  };
}
