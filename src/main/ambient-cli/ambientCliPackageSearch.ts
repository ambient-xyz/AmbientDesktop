import { relative, resolve, sep } from "node:path";
import type {
  AmbientCliCapabilitySearchKind,
  AmbientCliCapabilitySearchResult,
  AmbientCliCommandDescription,
  AmbientCliPackageCommand,
  AmbientCliPackageEnvStatus,
  AmbientCliPackageSummary,
} from "./ambientCliPackageTypes";
import { ambientCliCapabilityId, ambientCliRegistryPluginId } from "./ambientCliPackageTypes";
import { ambientCliCommandHealth } from "./ambientCliProviderDiagnostics";

export function ambientCliCommandDescription(
  pkg: AmbientCliPackageSummary,
  command: AmbientCliPackageCommand,
  missingEnv: AmbientCliPackageEnvStatus[],
): AmbientCliCommandDescription {
  return {
    capabilityId: ambientCliCapabilityId(pkg.id, "tool", command.name),
    sourceKind: "ambient-cli",
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    command: command.command,
    descriptorArgs: command.args,
    cwd: command.cwd,
    health: ambientCliCommandHealth(pkg, command),
    ...(command.timeoutProfile ? { timeoutProfile: command.timeoutProfile } : {}),
    ...(command.progressPatterns?.length ? { progressPatterns: command.progressPatterns } : {}),
    ...(command.devicePolicy ? { devicePolicy: command.devicePolicy } : {}),
    risk: [
      "run_process",
      ...(command.voiceProvider ? ["tts_provider"] : []),
      ...(command.sttProvider ? ["stt_provider"] : []),
      ...(command.embeddingProvider ? ["embedding_provider"] : []),
      ...(missingEnv.length ? ["secret_env_required"] : []),
    ],
    ...(command.voiceProvider ? { voiceProvider: command.voiceProvider } : {}),
    ...(command.sttProvider ? { sttProvider: command.sttProvider } : {}),
    ...(command.embeddingProvider ? { embeddingProvider: command.embeddingProvider } : {}),
    invocation: {
      tool: "ambient_cli",
      packageName: pkg.name,
      command: command.name,
      args: [],
    },
  };
}

export function ambientCliDescribeGuidance(
  pkg: AmbientCliPackageSummary,
  commands: AmbientCliPackageCommand[],
  missingEnv: AmbientCliPackageEnvStatus[],
): string[] {
  return [
    "Use ambient_cli with the exact packageName and command from this description.",
    ...commands.map((command) => `ambient_cli packageName="${pkg.name}" command="${command.name}" args=[...]`),
    ...(missingEnv.length
      ? [
          `Missing required env: ${missingEnv.map((env) => env.name).join(", ")}.`,
          "Use ambient_cli_secret_request or ambient_cli_env_bind before ambient_cli. Never pass secret values as args.",
        ]
      : []),
    "ambient_cli execution still requires Desktop approval unless an existing grant applies.",
  ];
}

export function ambientCliCapabilitySearchResult(
  pkg: AmbientCliPackageSummary,
  input: {
    missingEnv: string[];
    query: string;
    kind: AmbientCliCapabilitySearchKind;
    command?: string;
  },
): AmbientCliCapabilitySearchResult | undefined {
  const selectedCommands = input.command ? pkg.commands.filter((command) => command.name === input.command) : pkg.commands;
  if (input.command && selectedCommands.length === 0) return undefined;
  const missingEnv = input.missingEnv;
  const commands =
    input.kind === "skill"
      ? []
      : selectedCommands.map((command) => ({
          capabilityId: ambientCliCapabilityId(pkg.id, "tool", command.name),
          sourceKind: "ambient-cli" as const,
          name: command.name,
          ...(command.description ? { description: truncateText(command.description, 220) } : {}),
          cwd: command.cwd,
          health: ambientCliCommandHealth(pkg, command),
          risk: [
            "run_process",
            ...(command.voiceProvider ? ["tts_provider"] : []),
            ...(command.sttProvider ? ["stt_provider"] : []),
            ...(command.embeddingProvider ? ["embedding_provider"] : []),
            ...(missingEnv.length ? ["secret_env_required"] : []),
          ],
          ...(command.voiceProvider ? { voiceProvider: command.voiceProvider } : {}),
          ...(command.sttProvider ? { sttProvider: command.sttProvider } : {}),
          ...(command.embeddingProvider ? { embeddingProvider: command.embeddingProvider } : {}),
        }));
  const skills =
    input.kind === "command"
      ? []
      : pkg.skills.map((skill) => ({
          capabilityId: ambientCliCapabilityId(pkg.id, "skill", skill.path),
          sourceKind: "ambient-cli" as const,
          name: skill.name,
          ...(skill.description ? { description: truncateText(skill.description, 220) } : {}),
          path: relative(pkg.rootPath, resolve(skill.path)).split(sep).join("/"),
        }));
  if (input.kind === "command" && commands.length === 0) return undefined;
  if (input.kind === "skill" && skills.length === 0) return undefined;

  const availability = pkg.errors.length === 0 ? "available" : "unavailable";
  const availabilityReason = pkg.errors[0] ?? "Installed Ambient CLI package is available; execution still requires ambient_cli approval.";
  const score = scoreAmbientCliPackage(pkg, { query: input.query, kind: input.kind, command: input.command });
  if (input.query && score <= 0) return undefined;
  return {
    packageId: pkg.id,
    registryPluginId: ambientCliRegistryPluginId(pkg.id),
    sourceKind: "ambient-cli",
    packageName: pkg.name,
    ...(pkg.version ? { version: pkg.version } : {}),
    ...(pkg.description ? { description: truncateText(pkg.description, 260) } : {}),
    installed: pkg.installed,
    availability,
    availabilityReason,
    commands,
    skills,
    missingEnv,
    whyMatched: ambientCliWhyMatched(pkg, { query: input.query, command: input.command }).slice(0, 5),
    score,
  };
}

function scoreAmbientCliPackage(
  pkg: AmbientCliPackageSummary,
  input: { query: string; kind: AmbientCliCapabilitySearchKind; command?: string },
): number {
  let score = pkg.errors.length === 0 ? 2 : 0;
  if (input.command) score += 8;
  if (!input.query) return score + 1;
  const terms = searchTerms(input.query);
  const packageText = searchBlob([pkg.name, pkg.description, pkg.version]);
  const commandText = searchBlob(
    pkg.commands.map((command) => [command.name, command.description, command.command, command.args.join(" ")].join(" ")),
  );
  const skillText = searchBlob(pkg.skills.map((skill) => [skill.name, skill.description].join(" ")));
  const envText = searchBlob(pkg.envRequirements.map((env) => [env.name, env.description].join(" ")));
  for (const term of terms) {
    if (packageText.includes(term)) score += 5;
    if (input.kind !== "skill" && commandText.includes(term)) score += 4;
    if (input.kind !== "command" && skillText.includes(term)) score += 4;
    if (envText.includes(term)) score += 2;
  }
  return score;
}

function ambientCliWhyMatched(pkg: AmbientCliPackageSummary, input: { query: string; command?: string }): string[] {
  const reasons: string[] = [];
  if (input.command) reasons.push(`command:${input.command}`);
  if (!input.query) return reasons.length ? reasons : ["installed package"];
  const terms = searchTerms(input.query);
  for (const term of terms) {
    if (normalizeSearchText(pkg.name).includes(term)) reasons.push(`package:${pkg.name}`);
    for (const command of pkg.commands) {
      if (searchBlob([command.name, command.description]).includes(term)) reasons.push(`command:${command.name}`);
    }
    for (const skill of pkg.skills) {
      if (searchBlob([skill.name, skill.description]).includes(term)) reasons.push(`skill:${skill.name}`);
    }
    for (const env of pkg.envRequirements) {
      if (searchBlob([env.name, env.description]).includes(term)) reasons.push(`env:${env.name}`);
    }
  }
  return [...new Set(reasons)];
}

function searchTerms(value: string): string[] {
  return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function searchBlob(values: Array<string | undefined>): string {
  return normalizeSearchText(values.filter(Boolean).join(" "));
}

export function normalizeSearchText(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_./:-]+/g, " ")
        .trim()
        .toLowerCase()
    : "";
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
