import { isAbsolute, resolve, extname } from "node:path";
import type { CapabilityBuilderInstallerShape } from "./capabilityBuilderScaffold";
import type {
  CapabilityBuilderEnvRequirement,
  CapabilityBuilderModelAsset,
  CapabilityBuilderPreviewResult,
  CapabilityBuilderRepairPlanResult,
} from "./capabilityBuilderTypes";

export function inspectCapabilityBuilderDescriptor(
  descriptor: Record<string, unknown>,
  errors: string[],
  warnings: string[],
  risks: string[],
  rootPath: string,
  context: CapabilityBuilderDescriptorInspectionContext,
): CapabilityBuilderPreviewResult["descriptor"] {
  const name = stringField(descriptor.name);
  const version = stringField(descriptor.version);
  const description = stringField(descriptor.description);
  if (!name) errors.push("Descriptor name is required.");
  if (!version) warnings.push("Descriptor version is missing.");
  const commands = recordField(descriptor.commands);
  const commandNames = Object.keys(commands);
  if (!commandNames.length) errors.push("Descriptor must declare at least one command.");
  const envRequirements = envRequirementsFromDescriptor(descriptor.env, errors);
  const envNames = envRequirements.map((env) => env.name);
  const networkHosts = networkHostsFromDescriptor(descriptor, errors);
  const modelAssets = modelAssetsFromDescriptor(descriptor, errors, risks);
  const voiceProviderCommandNames: string[] = [];
  const voiceDiscoveryCommandNames: string[] = [];
  const voiceCloningCommandNames: string[] = [];
  for (const commandName of commandNames) {
    if (!/^[a-zA-Z0-9_-]+$/.test(commandName)) errors.push(`Command name "${commandName}" contains unsupported characters.`);
    const command = recordField(commands[commandName]);
    const voiceProvider = recordField(command.voiceProvider);
    if (Object.keys(voiceProvider).length) {
      voiceProviderCommandNames.push(commandName);
      if (inspectVoiceProviderMetadata(commandName, voiceProvider, commandNames, errors, warnings))
        voiceDiscoveryCommandNames.push(commandName);
      if (inspectVoiceCloningMetadata(commandName, voiceProvider, commandNames, envNames, networkHosts, errors, warnings)) {
        voiceCloningCommandNames.push(commandName);
      }
    }
    const executable = stringField(command.command);
    if (!executable) {
      errors.push(`Command "${commandName}" must declare command.`);
    } else {
      inspectDescriptorExecutable(rootPath, `Command "${commandName}" command`, executable, errors, context);
    }
    const commandText = [
      commandName,
      stringField(command.description),
      stringField(command.command),
      ...stringArrayField(command.args),
      ...stringArrayField(command.healthCheck),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const cwd = stringField(command.cwd) ?? "workspace";
    if (cwd !== "workspace" && cwd !== "package") errors.push(`Command "${commandName}" has unsupported cwd "${cwd}".`);
    const args = stringArrayField(command.args);
    for (const arg of args) {
      if (arg.includes("..")) risks.push(`Command "${commandName}" args contain parent traversal segment: ${arg}`);
    }
    const healthCheck = stringArrayField(command.healthCheck);
    if (!healthCheck.length) warnings.push(`Command "${commandName}" has no healthCheck.`);
    if (healthCheck[0])
      inspectDescriptorExecutable(rootPath, `Command "${commandName}" healthCheck executable`, healthCheck[0], errors, context);
    const timeoutProfile = stringField(command.timeoutProfile);
    if (timeoutProfile && !context.isCommandTimeoutProfile(timeoutProfile))
      errors.push(`Command "${commandName}" timeoutProfile is unsupported: ${timeoutProfile}`);
    const progressPatterns = stringArrayField(command.progressPatterns);
    if (command.progressPatterns !== undefined && !Array.isArray(command.progressPatterns)) {
      errors.push(`Command "${commandName}" progressPatterns must be an array of strings.`);
    }
    if (progressPatterns.some((pattern) => !pattern.trim()))
      errors.push(`Command "${commandName}" progressPatterns must not contain blank entries.`);
    const devicePolicy = recordField(command.devicePolicy);
    if (command.devicePolicy !== undefined && !Object.keys(devicePolicy).length)
      errors.push(`Command "${commandName}" devicePolicy must be an object.`);
    const devicePreference = stringArrayField(devicePolicy.prefer);
    if (devicePolicy.prefer !== undefined && !Array.isArray(devicePolicy.prefer)) {
      errors.push(`Command "${commandName}" devicePolicy.prefer must be an array of device names.`);
    }
    if (devicePreference.some((device) => !device.trim()))
      errors.push(`Command "${commandName}" devicePolicy.prefer must not contain blank entries.`);
    if (stringField(command.command) === "bash" || stringField(command.command) === "sh") {
      risks.push(`Command "${commandName}" uses a shell entrypoint; prefer explicit binaries and args.`);
    }
    if (looksNetworked(commandText) && !networkHosts.length) {
      warnings.push(
        `Command "${commandName}" appears to use network/API behavior but descriptor does not declare networkHosts or allowedNetworkHosts.`,
      );
    }
  }
  const skills = stringField(descriptor.skills) ?? "./skills";
  if (skills.includes("..")) risks.push("Descriptor skills path contains parent traversal.");
  const resolvedSkills = resolve(rootPath, skills);
  if (!context.isPathInside(rootPath, resolvedSkills)) errors.push("Descriptor skills path escapes the package root.");
  if (envRequirements.some((env) => env.required)) {
    risks.push(
      `Descriptor declares required env secrets: ${envRequirements
        .filter((env) => env.required)
        .map((env) => env.name)
        .join(", ")}.`,
    );
  }
  if (networkHosts.length) risks.push(`Descriptor declares network/API hosts: ${networkHosts.join(", ")}.`);
  if (modelAssets.length) risks.push(`Descriptor declares model/data assets: ${modelAssets.map((asset) => asset.name).join(", ")}.`);
  const artifactOutputTypes = artifactTypesFromDescriptor(descriptor.artifacts);
  const responseFormats = responseFormatsFromDescriptor(descriptor.responseFormats);
  inspectTtsProviderShape({
    installerShape: context.installerShape,
    descriptor,
    description,
    commandNames,
    voiceProviderCommandNames,
    artifactOutputTypes,
    envRequirements,
    networkHosts,
    errors,
    warnings,
  });
  return {
    name,
    version,
    description,
    commandNames,
    voiceProviderCommandNames,
    voiceDiscoveryCommandNames,
    voiceCloningCommandNames,
    envNames,
    envRequirements,
    networkHosts,
    modelAssets,
    artifactOutputTypes,
    responseFormats,
  };
}

export function inspectCapabilityBuilderPackageJson(
  packageJson: Record<string, unknown>,
  risks: string[],
): NonNullable<CapabilityBuilderPreviewResult["packageJson"]> {
  const scripts = recordField(packageJson.scripts);
  const lifecycleScripts = Object.keys(scripts).filter((script) => /^(pre|post)?install$|^prepare$|^prepublish/.test(script));
  if (lifecycleScripts.length) risks.push(`package.json declares lifecycle scripts: ${lifecycleScripts.join(", ")}`);
  const dependencies = Object.keys(recordField(packageJson.dependencies));
  const devDependencies = Object.keys(recordField(packageJson.devDependencies));
  if (dependencies.length || devDependencies.length)
    risks.push("package.json declares dependencies; dependency installation must be separately previewed and approved.");
  return { dependencies, devDependencies, lifecycleScripts };
}

interface CapabilityBuilderDescriptorInspectionContext {
  installerShape?: CapabilityBuilderInstallerShape;
  isCommandTimeoutProfile(value: string): boolean;
  isPathInside(rootPath: string, candidatePath: string): boolean;
}

export function needsTtsProviderRepairConversion(
  preview: CapabilityBuilderPreviewResult,
  manifest: NonNullable<CapabilityBuilderRepairPlanResult["buildManifest"]> | undefined,
  requestedRepair: string | undefined,
): boolean {
  const requestedText = requestedRepair?.toLowerCase() ?? "";
  const descriptor = preview.descriptor;
  const previewText = [
    descriptor?.name,
    descriptor?.description,
    ...(descriptor?.commandNames ?? []),
    ...(descriptor?.artifactOutputTypes ?? []),
    ...preview.warnings,
  ]
    .filter(Boolean)
    .join(" ");
  const requestedProvider = /\b(tts-provider|voice provider|chat voic|read aloud|assistant voice|speak assistant)\b/i.test(requestedText);
  const previewLooksTts = looksLikeTtsIntent(previewText);
  const alreadyProvider = manifest?.installerShape === "tts-provider" && Boolean(descriptor?.voiceProviderCommandNames.length);
  return (
    !alreadyProvider &&
    (requestedProvider ||
      preview.warnings.some((warning) => warning.includes("not shaped as an Ambient tts-provider")) ||
      (previewLooksTts && requestedText.includes("provider")))
  );
}

export function normalizeCapabilityBuilderVoiceOutputFormat(format: string): "mp3" | "wav" | "ogg" | undefined {
  const normalized = format.trim().replace(/^\./, "").toLowerCase();
  if (normalized === "mp3" || normalized === "wav" || normalized === "ogg") return normalized;
  return undefined;
}

export function mimeTypeForCapabilityBuilderVoiceFormat(format: "mp3" | "wav" | "ogg"): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
  }
}

export function artifactPathMatchesOutputTypes(filePath: string, outputTypes: string[]): boolean {
  const extension = extname(filePath).replace(/^\./, "").toLowerCase();
  if (!extension) return false;
  return outputTypes.some((type) => normalizeArtifactOutputType(type) === extension);
}

function inspectDescriptorExecutable(
  rootPath: string,
  label: string,
  executable: string,
  errors: string[],
  context: CapabilityBuilderDescriptorInspectionContext,
): void {
  const command = executable.trim();
  if (!command) return;
  if (command.includes("\0") || command.includes("\n")) {
    errors.push(`${label} contains unsupported characters.`);
    return;
  }
  if (!command.startsWith(".") && !command.includes("/") && !command.includes("\\")) return;
  if (isAbsolute(command)) {
    errors.push(
      `${label} must not use absolute host path "${command}". Use a bare executable such as "node" and rely on Ambient's managed runtime PATH, or use a package-relative executable such as "./bin/tool".`,
    );
    return;
  }
  const resolved = resolve(rootPath, command);
  if (!context.isPathInside(rootPath, resolved)) errors.push(`${label} resolves outside the package root: ${command}`);
}

function inspectVoiceProviderMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const defaultFormat = stringField(voiceProvider.defaultFormat);
  const formats = stringArrayField(voiceProvider.formats)
    .map((format) => normalizeCapabilityBuilderVoiceOutputFormat(format))
    .filter(Boolean);
  if (!defaultFormat) errors.push(`Command "${commandName}" voiceProvider.defaultFormat is required.`);
  if (!formats.length) errors.push(`Command "${commandName}" voiceProvider.formats must declare at least one supported audio format.`);
  const normalizedDefault = defaultFormat ? normalizeCapabilityBuilderVoiceOutputFormat(defaultFormat) : undefined;
  if (defaultFormat && !normalizedDefault)
    errors.push(`Command "${commandName}" voiceProvider.defaultFormat is unsupported: ${defaultFormat}`);
  if (normalizedDefault && formats.length && !formats.includes(normalizedDefault)) {
    errors.push(`Command "${commandName}" voiceProvider.defaultFormat must be included in voiceProvider.formats.`);
  }
  const voices = Array.isArray(voiceProvider.voices) ? voiceProvider.voices : [];
  if (!voices.length)
    warnings.push(`Command "${commandName}" voiceProvider.voices is empty; Settings will have no explicit voice choices.`);
  voices.forEach((voice, index) => {
    const record = recordField(voice);
    if (!stringField(record.id)) errors.push(`Command "${commandName}" voiceProvider.voices[${index}].id is required.`);
  });
  return inspectVoiceDiscoveryMetadata(commandName, voiceProvider, commandNames, errors, warnings);
}

function inspectVoiceDiscoveryMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const voiceDiscovery = recordField(voiceProvider.voiceDiscovery);
  if (!Object.keys(voiceDiscovery).length) return false;
  const discoveryCommand = stringField(voiceDiscovery.command);
  if (!discoveryCommand) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.command is required.`);
  } else if (!commandNames.includes(discoveryCommand)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.command "${discoveryCommand}" does not match a descriptor command.`);
  }
  const cacheTtlSeconds = typeof voiceDiscovery.cacheTtlSeconds === "number" ? voiceDiscovery.cacheTtlSeconds : undefined;
  if (
    voiceDiscovery.cacheTtlSeconds !== undefined &&
    (cacheTtlSeconds === undefined || cacheTtlSeconds <= 0 || !Number.isInteger(cacheTtlSeconds))
  ) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.cacheTtlSeconds must be a positive integer.`);
  }
  const requiresSecret = stringArrayField(voiceDiscovery.requiresSecret);
  if (voiceDiscovery.requiresSecret !== undefined && !requiresSecret.length) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.requiresSecret must contain env names when provided.`);
  }
  if (requiresSecret.length && !requiresSecret.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.requiresSecret must use env-style names.`);
  }
  const source = stringField(voiceDiscovery.source);
  if (source && !["cloud-api", "local-model-directory", "local-runtime", "custom"].includes(source)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceDiscovery.source is unsupported: ${source}`);
  }
  if (source === "cloud-api" && voiceDiscovery.requiresNetwork !== true) {
    warnings.push(`Command "${commandName}" cloud voice discovery should set voiceProvider.voiceDiscovery.requiresNetwork to true.`);
  }
  return true;
}

function inspectVoiceCloningMetadata(
  commandName: string,
  voiceProvider: Record<string, unknown>,
  commandNames: string[],
  envNames: string[],
  networkHosts: string[],
  errors: string[],
  warnings: string[],
): boolean {
  const voiceCloning = recordField(voiceProvider.voiceCloning);
  if (!Object.keys(voiceCloning).length) return false;
  if (typeof voiceCloning.supported !== "boolean") {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.supported is required.`);
    return false;
  }
  if (voiceCloning.supported === false) return false;
  const createCommand = stringField(voiceCloning.createCommand);
  if (createCommand && !commandNames.includes(createCommand)) {
    errors.push(
      `Command "${commandName}" voiceProvider.voiceCloning.createCommand "${createCommand}" does not match a descriptor command.`,
    );
  }
  const statusCommand = stringField(voiceCloning.statusCommand);
  if (statusCommand && !commandNames.includes(statusCommand)) {
    errors.push(
      `Command "${commandName}" voiceProvider.voiceCloning.statusCommand "${statusCommand}" does not match a descriptor command.`,
    );
  }
  const deleteCommand = stringField(voiceCloning.deleteCommand);
  if (deleteCommand && !commandNames.includes(deleteCommand)) {
    errors.push(
      `Command "${commandName}" voiceProvider.voiceCloning.deleteCommand "${deleteCommand}" does not match a descriptor command.`,
    );
  }
  const mode = stringField(voiceCloning.mode);
  if (mode !== "cloud" && mode !== "local")
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.mode must be cloud or local when cloning is supported.`);
  const inputs = recordField(voiceCloning.inputs);
  const audioFormats = stringArrayField(inputs.audioFormats)
    .map((format) => format.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  if (!audioFormats.length)
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.audioFormats must declare at least one audio format.`);
  const minDurationSeconds = typeof inputs.minDurationSeconds === "number" ? inputs.minDurationSeconds : undefined;
  const maxDurationSeconds = typeof inputs.maxDurationSeconds === "number" ? inputs.maxDurationSeconds : undefined;
  if (minDurationSeconds !== undefined && minDurationSeconds <= 0)
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minDurationSeconds must be positive.`);
  if (maxDurationSeconds !== undefined && maxDurationSeconds <= 0)
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.maxDurationSeconds must be positive.`);
  if (minDurationSeconds !== undefined && maxDurationSeconds !== undefined && minDurationSeconds > maxDurationSeconds) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minDurationSeconds must not exceed maxDurationSeconds.`);
  }
  const minSamples = typeof inputs.minSamples === "number" ? inputs.minSamples : undefined;
  const maxSamples = typeof inputs.maxSamples === "number" ? inputs.maxSamples : undefined;
  if (minSamples !== undefined && (!Number.isInteger(minSamples) || minSamples <= 0)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minSamples must be a positive integer.`);
  }
  if (maxSamples !== undefined && (!Number.isInteger(maxSamples) || maxSamples <= 0)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.maxSamples must be a positive integer.`);
  }
  if (minSamples !== undefined && maxSamples !== undefined && minSamples > maxSamples) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.minSamples must not exceed maxSamples.`);
  }
  const transcript = stringField(inputs.transcript);
  if (transcript && !["required", "optional", "unsupported"].includes(transcript)) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.inputs.transcript is unsupported: ${transcript}`);
  }
  const requiresSecret = stringArrayField(voiceCloning.requiresSecret);
  if (voiceCloning.requiresSecret !== undefined && !requiresSecret.length) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresSecret must contain env names when provided.`);
  }
  if (requiresSecret.length && !requiresSecret.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))) {
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresSecret must use env-style names.`);
  }
  for (const secret of requiresSecret) {
    if (!envNames.includes(secret))
      warnings.push(
        `Command "${commandName}" voiceProvider.voiceCloning.requiresSecret references ${secret}, but descriptor env does not declare it.`,
      );
  }
  const cloningHosts = stringArrayField(voiceCloning.networkHosts);
  if (mode === "cloud" && !cloningHosts.length && !networkHosts.length) {
    warnings.push(
      `Command "${commandName}" cloud voice cloning should declare voiceProvider.voiceCloning.networkHosts or descriptor networkHosts.`,
    );
  }
  const output = recordField(voiceCloning.output);
  const creates = stringArrayField(output.creates);
  if (!creates.length)
    errors.push(`Command "${commandName}" voiceProvider.voiceCloning.output.creates must declare at least one clone output kind.`);
  const unsupportedCreates = creates.filter((kind) => !["provider-voice-id", "local-model-asset", "dynamic-cache-voice"].includes(kind));
  if (unsupportedCreates.length)
    errors.push(
      `Command "${commandName}" voiceProvider.voiceCloning.output.creates has unsupported values: ${unsupportedCreates.join(", ")}.`,
    );
  if (voiceCloning.requiresConsent === false) {
    warnings.push(`Command "${commandName}" voiceProvider.voiceCloning.requiresConsent should normally be true for cloned voice creation.`);
  }
  return true;
}

function inspectTtsProviderShape(input: {
  installerShape?: CapabilityBuilderInstallerShape;
  descriptor: Record<string, unknown>;
  description?: string;
  commandNames: string[];
  voiceProviderCommandNames: string[];
  artifactOutputTypes: string[];
  envRequirements: CapabilityBuilderEnvRequirement[];
  networkHosts: string[];
  errors: string[];
  warnings: string[];
}): void {
  const descriptorText = [stringField(input.descriptor.name), input.description, ...input.commandNames, ...input.artifactOutputTypes]
    .filter(Boolean)
    .join(" ");
  const ttsLike = looksLikeTtsIntent(descriptorText);
  const hasVoiceProvider = input.voiceProviderCommandNames.length > 0;
  if (hasVoiceProvider && input.installerShape !== "tts-provider") {
    input.warnings.push(
      "Descriptor declares voiceProvider metadata, but Builder installerShape is not tts-provider; repair must update Builder provenance before this package can register as a chat voice provider.",
    );
  }
  if (input.installerShape === "tts-provider") {
    if (!hasVoiceProvider) input.errors.push("installerShape is tts-provider, but no command declares voiceProvider metadata.");
    if (!input.artifactOutputTypes.some((type) => normalizeCapabilityBuilderVoiceOutputFormat(type))) {
      input.errors.push(
        "installerShape is tts-provider, but descriptor artifacts.outputTypes does not include a supported audio format (WAV, MP3, or OGG).",
      );
    }
    const hasRequiredEnv = input.envRequirements.some((env) => env.required);
    const cloudish = input.networkHosts.length > 0;
    if (cloudish && !hasRequiredEnv)
      input.warnings.push("tts-provider declares network hosts but no required env/API secret; confirm whether provider auth is needed.");
    if (hasRequiredEnv && !input.networkHosts.length)
      input.warnings.push("tts-provider declares required env secrets but no network hosts; declare exact API hosts for cloud providers.");
    return;
  }
  if (!input.installerShape && ttsLike && !hasVoiceProvider) {
    input.warnings.push(
      'This package appears to implement TTS/audio voice behavior but is not shaped as an Ambient tts-provider; it will not be selectable for chat voicing unless repaired to declare installerShape "tts-provider" and command voiceProvider metadata.',
    );
  }
}

function envRequirementsFromDescriptor(value: unknown, errors: string[]): CapabilityBuilderEnvRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      const name = item.trim();
      validateEnvName(name, `env[${index}]`, errors);
      return [{ name, required: true }];
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const name = stringField((item as Record<string, unknown>).name);
      if (!name) {
        errors.push(`env[${index}] must declare name.`);
        return [];
      }
      validateEnvName(name, `env[${index}].name`, errors);
      const description = stringField((item as Record<string, unknown>).description);
      const required =
        typeof (item as Record<string, unknown>).required === "boolean" ? Boolean((item as Record<string, unknown>).required) : true;
      return [{ name, ...(description ? { description } : {}), required }];
    }
    errors.push(`env[${index}] must be a string or object.`);
    return [];
  });
}

function validateEnvName(name: string, label: string, errors: string[]): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) errors.push(`${label} is not a valid environment variable name: ${name}`);
}

function networkHostsFromDescriptor(descriptor: Record<string, unknown>, errors: string[]): string[] {
  const direct = stringArrayField(descriptor.networkHosts).length
    ? stringArrayField(descriptor.networkHosts)
    : stringArrayField(descriptor.allowedNetworkHosts);
  const permissions = recordField(descriptor.permissions);
  const fromPermissions = stringArrayField(permissions.networkHosts).length
    ? stringArrayField(permissions.networkHosts)
    : stringArrayField(permissions.allowedNetworkHosts);
  const hosts = [...direct, ...fromPermissions].map((host) => host.trim()).filter(Boolean);
  const uniqueHosts = [...new Set(hosts)];
  for (const host of uniqueHosts) {
    if (!isValidNetworkHost(host)) errors.push(`Network host must be a bare hostname or host:port without protocol/path: ${host}`);
  }
  return uniqueHosts;
}

function isValidNetworkHost(host: string): boolean {
  return /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::[0-9]{1,5})?$/.test(host);
}

function looksNetworked(text: string): boolean {
  return /\b(api|http|https|fetch|request|webhook|endpoint|oauth|token|bearer)\b/.test(text);
}

function modelAssetsFromDescriptor(descriptor: Record<string, unknown>, errors: string[], risks: string[]): CapabilityBuilderModelAsset[] {
  const direct = Array.isArray(descriptor.modelAssets) ? descriptor.modelAssets : undefined;
  const assetsRecord = recordField(descriptor.assets);
  const nested = Array.isArray(assetsRecord.modelAssets) ? assetsRecord.modelAssets : undefined;
  const value = direct ?? nested ?? [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) return [{ name: item.trim() }];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`modelAssets[${index}] must be a string or object.`);
      return [];
    }
    const record = item as Record<string, unknown>;
    const name = stringField(record.name);
    if (!name) {
      errors.push(`modelAssets[${index}] must declare name.`);
      return [];
    }
    const url = stringField(record.url);
    if (url && !isHttpUrl(url)) errors.push(`modelAssets[${index}].url must be http(s): ${url}`);
    const expectedSizeBytes =
      typeof record.expectedSizeBytes === "number" && Number.isFinite(record.expectedSizeBytes)
        ? Math.max(0, Math.floor(record.expectedSizeBytes))
        : undefined;
    const sha256 = stringField(record.sha256);
    if (sha256 && !/^[a-fA-F0-9]{64}$/.test(sha256)) errors.push(`modelAssets[${index}].sha256 must be a 64-character hex digest.`);
    const license = stringField(record.license);
    const cachePath = stringField(record.cachePath);
    if (cachePath && (cachePath.startsWith("/") || cachePath.includes(".."))) {
      errors.push(`modelAssets[${index}].cachePath must be package-relative and must not contain parent traversal.`);
    }
    if (!url) risks.push(`modelAssets[${index}] "${name}" has no source URL; download approval cannot show provenance.`);
    if (url && !expectedSizeBytes)
      risks.push(`modelAssets[${index}] "${name}" has no expectedSizeBytes; large downloads need explicit size review before approval.`);
    if (url && !license)
      risks.push(`modelAssets[${index}] "${name}" has no license note; model/data downloads should state usage terms before approval.`);
    return [
      {
        name,
        ...(url ? { url } : {}),
        ...(expectedSizeBytes !== undefined ? { expectedSizeBytes } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(license ? { license } : {}),
        ...(cachePath ? { cachePath } : {}),
      },
    ];
  });
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function artifactTypesFromDescriptor(value: unknown): string[] {
  const artifacts = recordField(value);
  const outputTypes = artifacts.outputTypes;
  return Array.isArray(outputTypes) ? outputTypes.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function responseFormatsFromDescriptor(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function normalizeArtifactOutputType(type: string): string {
  return type.trim().replace(/^\./, "").toLowerCase();
}

function looksLikeTtsIntent(text: string): boolean {
  return /\b(tts|text[- ]?to[- ]?speech|speech|voice|read aloud|synthesi[sz]e|spoken|mp3|wav|ogg|audio)\b/i.test(text);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
