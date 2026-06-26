import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { isPathInside } from "./ambientCliSessionFacade";
import {
  cliDescriptorSchema,
  cliPackageDescriptorName,
  cliPackageImportRoot,
  packageJsonName,
  packageJsonSchema,
  type CliCommandDescriptor,
  type CliDescriptor,
  type CliEnvRequirementDescriptor,
} from "./ambientCliPackageSchemas";
import type {
  AmbientCliGeneratedPackageMetadata,
  AmbientCliPackageEnvRequirement,
  AmbientCliPackageSkill,
  AmbientCliPackageSummary,
} from "./ambientCliPackageTypes";
import {
  normalizeEmbeddingProviderCommandMetadata,
  normalizeSttProviderCommandMetadata,
  normalizeVoiceProviderCommandMetadata,
  validateCliProviderLifecycleCommands,
} from "./ambientCliPackageProviderNormalization";

export async function inspectAmbientCliPackage(
  managedInstallRootPath: string,
  rootPath: string,
  source: string,
  descriptorOverlay?: unknown,
): Promise<AmbientCliPackageSummary> {
  const errors: string[] = [];
  const descriptor = await readCliDescriptor(rootPath, descriptorOverlay).catch((error) => {
    errors.push(errorMessage(error));
    return undefined;
  });
  const name = descriptor?.name ?? basename(rootPath);
  const commands = Object.entries(descriptor?.commands ?? {}).map(([name, command]) => ({
    name,
    description: command.description,
    command: command.command,
    args: command.args,
    cwd: command.cwd,
    ...(command.healthCheck ? { healthCheck: command.healthCheck } : {}),
    ...(command.timeoutProfile ? { timeoutProfile: command.timeoutProfile } : {}),
    ...(command.progressPatterns ? { progressPatterns: command.progressPatterns } : {}),
    ...(command.devicePolicy ? { devicePolicy: normalizeCommandDevicePolicy(command.devicePolicy) } : {}),
    ...(command.voiceProvider ? { voiceProvider: normalizeVoiceProviderCommandMetadata(command.voiceProvider) } : {}),
    ...(command.sttProvider ? { sttProvider: normalizeSttProviderCommandMetadata(command.sttProvider) } : {}),
    ...(command.embeddingProvider ? { embeddingProvider: normalizeEmbeddingProviderCommandMetadata(command.embeddingProvider) } : {}),
  }));
  for (const command of commands) {
    validateCliExecutableReference(rootPath, `Command "${command.name}" executable`, command.command, errors);
    const healthExecutable = command.healthCheck?.[0];
    if (healthExecutable)
      validateCliExecutableReference(rootPath, `Command "${command.name}" healthCheck executable`, healthExecutable, errors);
  }
  validateCliProviderLifecycleCommands(commands, errors);
  const envRequirements = normalizeEnvRequirements(descriptor?.env ?? []);
  const generated = await readAmbientCliGeneratedMetadata(rootPath);
  return {
    id: `ambient-cli:${source}:${name}`,
    name,
    version: descriptor?.version,
    description: descriptor?.description,
    rootPath,
    source,
    installed: isPathInside(resolve(managedInstallRootPath, cliPackageImportRoot), rootPath),
    skills: descriptor ? await discoverCliSkills(rootPath, descriptor.skills) : [],
    commands,
    envRequirements,
    errors,
    ...(generated ? { generated } : {}),
  };
}

async function readAmbientCliGeneratedMetadata(rootPath: string): Promise<AmbientCliGeneratedPackageMetadata | undefined> {
  const manifestPath = join(rootPath, "capability-build.json");
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = await readJson(manifestPath);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return undefined;
    const record = manifest as Record<string, unknown>;
    if (record.schemaVersion !== "ambient-capability-builder-v1") return undefined;
    const refs = recordField(record.refs);
    return {
      schemaVersion: "ambient-capability-builder-v1",
      ...(stringField(record.status) ? { status: stringField(record.status) } : {}),
      ...(stringField(record.goal) ? { goal: stringField(record.goal) } : {}),
      ...(stringField(record.installerShape) ? { installerShape: stringField(record.installerShape) } : {}),
      ...(stringField(record.kind) ? { kind: stringField(record.kind) } : {}),
      ...(stringField(record.provider) ? { provider: stringField(record.provider) } : {}),
      outputArtifactTypes: stringArrayField(record.outputArtifactTypes),
      ...(stringField(record.locality) ? { locality: stringField(record.locality) } : {}),
      ...(stringField(record.sourcePath) ? { sourcePath: stringField(record.sourcePath) } : {}),
      ...(stringField(record.lastValidatedAt) ? { lastValidatedAt: stringField(record.lastValidatedAt) } : {}),
      ...(stringField(record.registeredAt) ? { registeredAt: stringField(record.registeredAt) } : {}),
      ...(stringField(record.installedPackageId) ? { installedPackageId: stringField(record.installedPackageId) } : {}),
      ...(stringField(record.installedSource) ? { installedSource: stringField(record.installedSource) } : {}),
      ...(stringField(record.installedVersion) ? { installedVersion: stringField(record.installedVersion) } : {}),
      refs: {
        ...(stringField(refs.latest) ? { latest: stringField(refs.latest) } : {}),
        ...(stringField(refs.installed) ? { installed: stringField(refs.installed) } : {}),
        ...(stringField(refs.lastValidated) ? { lastValidated: stringField(refs.lastValidated) } : {}),
        ...(stringField(refs.lastValidatedHash) ? { lastValidatedHash: stringField(refs.lastValidatedHash) } : {}),
      },
    };
  } catch {
    return undefined;
  }
}

async function readCliDescriptor(rootPath: string, descriptorOverlay?: unknown): Promise<CliDescriptor> {
  if (descriptorOverlay !== undefined) return cliDescriptorSchema.parse(descriptorOverlay);
  const descriptorPath = join(rootPath, cliPackageDescriptorName);
  if (existsSync(descriptorPath)) return cliDescriptorSchema.parse(await readJson(descriptorPath));
  const packageJsonPath = join(rootPath, packageJsonName);
  if (!existsSync(packageJsonPath)) throw new Error(`Missing ${cliPackageDescriptorName} or package.json ambient.cli descriptor.`);
  const pkg = packageJsonSchema.parse(await readJson(packageJsonPath));
  if (!pkg.ambient?.cli && existsSync(join(rootPath, "SKILL.md"))) {
    return cliDescriptorSchema.parse({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      skills: "./SKILL.md",
      env: [],
      commands: {},
    });
  }
  if (!pkg.ambient?.cli) throw new Error("Missing package.json ambient.cli descriptor.");
  return cliDescriptorSchema.parse({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    ...pkg.ambient.cli,
  });
}

async function discoverCliSkills(rootPath: string, configuredPath: string): Promise<AmbientCliPackageSkill[]> {
  const skillsRoot = resolve(rootPath, configuredPath);
  if (!isPathInside(rootPath, skillsRoot) || !existsSync(skillsRoot)) return [];
  if (basename(skillsRoot) === "SKILL.md") {
    return [{ ...parseSkillHeader(await readFile(skillsRoot, "utf8")), path: skillsRoot }];
  }
  const rootSkillPath = join(skillsRoot, "SKILL.md");
  if (existsSync(rootSkillPath)) {
    return [{ ...parseSkillHeader(await readFile(rootSkillPath, "utf8")), path: rootSkillPath }];
  }
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: AmbientCliPackageSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(skillsRoot, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    skills.push({ ...parseSkillHeader(await readFile(skillPath, "utf8")), path: skillPath });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveCliExecutable(packageRoot: string, command: string): string {
  if (!command.startsWith(".") && !command.includes("/") && !command.includes("\\")) return command;
  if (isAbsolute(command)) {
    throw new Error(
      `Ambient CLI command uses absolute host path "${command}". Use a bare executable name such as "node" or a package-relative executable such as "./bin/tool"; Ambient adds managed runtime directories to PATH during health checks and execution.`,
    );
  }
  const executable = resolve(packageRoot, command);
  if (!isPathInside(packageRoot, executable)) throw new Error("Ambient CLI command resolves outside the package root.");
  return executable;
}

function validateCliExecutableReference(packageRoot: string, label: string, command: string, errors: string[]): void {
  const executable = command.trim();
  if (!executable) return;
  if (!executable.startsWith(".") && !executable.includes("/") && !executable.includes("\\")) return;
  if (isAbsolute(executable)) {
    errors.push(
      `${label} must not use absolute host path "${executable}". Use a bare executable such as "node" and rely on Ambient's managed runtime PATH, or use a package-relative executable such as "./bin/tool".`,
    );
    return;
  }
  const resolved = resolve(packageRoot, executable);
  if (!isPathInside(packageRoot, resolved)) {
    errors.push(`${label} resolves outside the package root: ${executable}`);
  }
}

function normalizeCommandDevicePolicy(
  input: NonNullable<CliCommandDescriptor["devicePolicy"]>,
): NonNullable<CliCommandDescriptor["devicePolicy"]> {
  const prefer = input.prefer?.map((item) => item.trim()).filter(Boolean);
  const cpuReason = input.cpuReason?.trim();
  const forceCpuReason = input.forceCpuReason?.trim();
  const argName = input.argName?.trim();
  return {
    ...(prefer?.length ? { prefer } : {}),
    ...(input.requireReasonWhenCpuForced !== undefined ? { requireReasonWhenCpuForced: input.requireReasonWhenCpuForced } : {}),
    ...(cpuReason ? { cpuReason } : {}),
    ...(forceCpuReason ? { forceCpuReason } : {}),
    ...(argName ? { argName } : {}),
  };
}

export function resolveDescriptorArg(packageRoot: string, arg: string): string {
  if (!arg.startsWith("./") && !arg.startsWith("../")) return arg;
  const resolved = resolve(packageRoot, arg);
  if (!isPathInside(packageRoot, resolved)) throw new Error("Ambient CLI descriptor arg resolves outside the package root.");
  return resolved;
}

function parseSkillHeader(content: string): Pick<AmbientCliPackageSkill, "name" | "description"> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: "unknown" };
  const header = match[1];
  const name = header.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "unknown";
  const description = header.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}) };
}

function normalizeEnvRequirements(value: CliEnvRequirementDescriptor[]): AmbientCliPackageEnvRequirement[] {
  return value.map((item) => {
    if (typeof item === "string") return { name: normalizeEnvName(item), required: true };
    return {
      name: normalizeEnvName(item.name),
      ...(item.description ? { description: item.description } : {}),
      required: item.required,
    };
  });
}

export function normalizeEnvName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid environment variable name: ${value}`);
  return name;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
