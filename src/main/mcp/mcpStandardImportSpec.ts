import type { McpAutowireCandidate, McpAutowireOutcome } from "./mcpAutowireFacade";
import { looksSecretLike, safeContainerMountPath, safeHostMountPath } from "./mcpInstallCatalogUtilities";
import type { ToolHiveImageVerificationPolicy, ToolHivePlainEnvVar, ToolHiveRunVolume } from "./mcpToolRuntimeFacade";

export type McpStandardImportBlockedLaunchShape = {
  kind: "package-bin-entrypoint";
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"];
  packageIdentifier: string;
  command: string;
  fromPackage?: string;
} | {
  kind: "module-entrypoint";
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"];
  packageIdentifier: string;
  module: string;
};

export interface StandardMcpImportSpec {
  toolHiveRunSource?: string;
  sourceRef: string;
  entrypointSummary?: string;
  blockedLaunchShape?: McpStandardImportBlockedLaunchShape;
  serverArgs: string[];
  envVars: ToolHivePlainEnvVar[];
  volumes: ToolHiveRunVolume[];
  runtimeImage?: string;
  blockers: string[];
  blockedOutcome?: McpAutowireOutcome;
}

type McpRuntimePackage = NonNullable<McpAutowireCandidate["runtime"]["package"]>;
type McpRuntimePackageArgument = McpRuntimePackage["packageArguments"][number];

export function standardMcpImportSpec(candidate: McpAutowireCandidate): StandardMcpImportSpec {
  const blockers: string[] = [];
  let blockedOutcome: McpAutowireOutcome | undefined;
  if (candidate.recommendedLane !== "standard-mcp") {
    blockers.push(`Standard MCP import requires recommendedLane standard-mcp, got ${candidate.recommendedLane}.`);
  }
  if (candidate.runtime.provider !== "toolhive") {
    blockers.push(`Standard MCP import requires ToolHive runtime provider, got ${candidate.runtime.provider}.`);
  }
  if (candidate.runtime.sourceKind === "registry") {
    blockers.push("Registry-backed candidates must use ambient_mcp_server_describe/install, not Standard MCP import.");
  }
  const volumeResult = reviewedToolHiveVolumes(candidate.permissions.filesystem);
  blockers.push(...volumeResult.blockers);
  if (volumeResult.blockers.length) {
    blockedOutcome = "deferred-unsupported-lane";
  }
  const pkg = candidate.runtime.package;
  if (!pkg) {
    blockers.push("Standard MCP import requires package or image metadata.");
    return { sourceRef: `standard-mcp:${candidate.runtime.sourceKind}:${candidate.id}`, serverArgs: [], envVars: [], volumes: volumeResult.volumes, blockers, ...(blockedOutcome ? { blockedOutcome } : {}) };
  }
  const argResult = fixedToolHiveServerArgs(pkg.packageArguments);
  blockers.push(...argResult.blockers);
  const serverArgs = reviewedStandardMcpServerArgs(pkg, argResult.args, volumeResult.volumes, blockers);
  const entrypointResult = reviewedToolHivePackageEntrypoint(pkg);
  blockers.push(...entrypointResult.blockers);
  const envVars = toolHiveRuntimeCompatibilityEnvVars(pkg.registryType, argResult.envVars);
  const runtimeImage = reviewedToolHiveRuntimeImage(pkg.runtimeImage, pkg.registryType, blockers);
  const version = pkg.version ? `@${pkg.version}` : "";
  const source = (() => {
    if (pkg.registryType === "pypi") return `uvx://${pkg.identifier}${version}`;
    if (pkg.registryType === "npm") return `npx://${pkg.identifier}${version}`;
    if (pkg.registryType === "oci") return pkg.identifier;
    if (pkg.registryType === "mcpb") {
      blockers.push("MCPB package imports are recognized but deferred until ToolHive run support is validated for MCPB sources.");
      blockedOutcome = "deferred-unsupported-lane";
      return undefined;
    }
    blockers.push(`Unsupported Standard MCP package registry type ${pkg.registryType}.`);
    blockedOutcome = "deferred-unsupported-lane";
    return undefined;
  })();
  return {
    ...(source ? { toolHiveRunSource: source } : {}),
    sourceRef: `${candidate.runtime.sourceKind}:${candidate.source.url ?? candidate.source.packageName ?? candidate.id}`,
    ...(entrypointResult.summary ? { entrypointSummary: entrypointResult.summary } : {}),
    ...(entrypointResult.blockedLaunchShape ? { blockedLaunchShape: entrypointResult.blockedLaunchShape } : {}),
    serverArgs,
    envVars,
    volumes: volumeResult.volumes,
    ...(runtimeImage ? { runtimeImage } : {}),
    blockers,
    ...(blockedOutcome || entrypointResult.blockedOutcome ? { blockedOutcome: blockedOutcome ?? entrypointResult.blockedOutcome } : {}),
  };
}

export function standardImportImageVerificationPolicy(candidate: McpAutowireCandidate): ToolHiveImageVerificationPolicy | undefined {
  if (candidate.runtime.sourceKind === "custom-image" && candidate.runtime.package?.registryType === "oci") return "ambient-reviewed";
  return undefined;
}

function reviewedToolHiveVolumes(filesystem: McpAutowireCandidate["permissions"]["filesystem"]): { volumes: ToolHiveRunVolume[]; blockers: string[] } {
  const volumes: ToolHiveRunVolume[] = [];
  const blockers: string[] = [];
  if (filesystem.workspaceRead) {
    blockers.push("Standard MCP import requires explicit reviewed extraMounts instead of workspace-wide read access.");
  }
  if (filesystem.workspaceWrite) {
    blockers.push("Standard MCP import does not support workspace-wide write access.");
  }
  filesystem.extraMounts.forEach((mount, index) => {
    const label = `filesystem.extraMounts[${index}]`;
    if (mount.mode !== "read-only") {
      blockers.push(`${label} requests ${mount.mode}; Standard MCP import currently supports only read-only ToolHive mounts.`);
      return;
    }
    if (!safeHostMountPath(mount.path)) {
      blockers.push(`${label} host path is not safe for reviewed ToolHive --volume delivery: ${mount.path}.`);
      return;
    }
    if (!mount.containerPath || !safeContainerMountPath(mount.containerPath)) {
      blockers.push(`${label} requires a safe absolute containerPath before Ambient can pass it to ToolHive --volume.`);
      return;
    }
    volumes.push({
      hostPath: mount.path,
      containerPath: mount.containerPath,
      mode: "ro",
    });
  });
  return { volumes, blockers };
}

function reviewedStandardMcpServerArgs(
  pkg: McpRuntimePackage,
  fixedArgs: string[],
  volumes: ToolHiveRunVolume[],
  blockers: string[],
): string[] {
  if (!isModelContextProtocolFilesystemPackage(pkg)) return fixedArgs;
  const mountArgs = volumes
    .map((volume) => volume.containerPath)
    .filter((containerPath) => safeContainerMountPath(containerPath));
  if (!mountArgs.length) {
    blockers.push("The @modelcontextprotocol/server-filesystem package requires at least one explicit reviewed read-only extraMount; Ambient passes each reviewed containerPath as an allowed directory argument.");
    return fixedArgs;
  }
  const next = [...fixedArgs];
  for (const mountArg of mountArgs) {
    if (!next.includes(mountArg)) next.push(mountArg);
  }
  return next;
}

function isModelContextProtocolFilesystemPackage(pkg: McpRuntimePackage): boolean {
  return pkg.registryType === "npm" && pkg.identifier.toLowerCase() === "@modelcontextprotocol/server-filesystem";
}

function fixedToolHiveServerArgs(args: McpRuntimePackageArgument[]): { args: string[]; envVars: ToolHivePlainEnvVar[]; blockers: string[] } {
  const result: string[] = [];
  const envVars: ToolHivePlainEnvVar[] = [];
  const blockers: string[] = [];
  for (const arg of args ?? []) {
    if (!arg.isFixed) {
      blockers.push(`Package argument ${arg.name ?? arg.valueHint} is not fixed and needs user review before import.`);
      continue;
    }
    if (arg.type === "positional" && arg.valueHint) {
      result.push(arg.valueHint);
    } else if (arg.type === "positional") {
      blockers.push("Positional package arguments require a fixed valueHint.");
    } else if (arg.type === "switch" && arg.name) {
      result.push(arg.name);
    } else if (arg.type === "switch") {
      blockers.push("Switch package arguments require a fixed flag name.");
    } else if (arg.type === "flag" && arg.name && arg.valueHint) {
      result.push(arg.name);
      result.push(arg.valueHint);
    } else if (arg.type === "flag") {
      blockers.push("Flag package arguments require a fixed flag name and valueHint.");
    } else if (arg.type === "env" && arg.name) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(arg.name)) {
        blockers.push(`Environment argument ${arg.name} is not a valid environment variable name.`);
      } else if (looksSecretEnvName(arg.name)) {
        blockers.push(`Environment argument ${arg.name} looks secret-like; declare it as a secret and bind it with an Ambient-managed secret ref.`);
      } else if (!arg.valueHint || arg.valueHint.length > 4_000 || /[\0\r\n]/.test(arg.valueHint)) {
        blockers.push(`Environment argument ${arg.name} must be a bounded single-line non-secret value.`);
      } else {
        envVars.push({ name: arg.name, value: arg.valueHint });
      }
    } else {
      blockers.push(`Package argument type ${arg.type} is not supported by Standard MCP import yet.`);
    }
  }
  return { args: result, envVars, blockers };
}

function reviewedToolHivePackageEntrypoint(pkg: McpRuntimePackage): { summary?: string; blockers: string[]; blockedLaunchShape?: McpStandardImportBlockedLaunchShape; blockedOutcome?: McpAutowireOutcome } {
  const entrypoint = pkg.entrypoint;
  if (!entrypoint || entrypoint.kind === "default") return { summary: "default package executable", blockers: [] };
  const blockers: string[] = [];
  if (entrypoint.kind === "package-bin") {
    const command = entrypoint.command?.trim();
    if (!command) {
      blockers.push("Package-bin entrypoint override requires a command.");
      return { blockers };
    }
    if (!safePackageEntrypointCommand(command)) {
      blockers.push(`Package-bin entrypoint command is not safe for ToolHive import: ${command}`);
      return { blockers };
    }
    if (sameToolHiveProtocolDefaultExecutable(pkg, command)) {
      return { summary: `package-bin ${command}`, blockers };
    }
    blockers.push([
      `Package-bin entrypoint ${command} from ${pkg.identifier} cannot be encoded by ToolHive ${pkg.registryType} protocol schemes yet.`,
      "Use fixed packageArguments when the default executable has an MCP/server flag, or route through a reviewed custom ToolHive source image.",
    ].join(" "));
    return {
      summary: `package-bin ${command} from ${entrypoint.fromPackage ?? pkg.identifier}`,
      blockers,
      blockedOutcome: "deferred-unsupported-lane",
      blockedLaunchShape: {
        kind: "package-bin-entrypoint",
        registryType: pkg.registryType,
        packageIdentifier: pkg.identifier,
        command,
        ...(entrypoint.fromPackage ? { fromPackage: entrypoint.fromPackage } : {}),
      },
    };
  }
  if (entrypoint.kind === "module") {
    blockers.push([
      `Module entrypoint ${entrypoint.module ?? "(missing)"} from ${pkg.identifier} cannot be encoded by ToolHive ${pkg.registryType} protocol schemes yet.`,
      "Route through a reviewed custom ToolHive source image unless ToolHive adds python -m/module execution support for protocol schemes.",
    ].join(" "));
    return {
      summary: `module ${entrypoint.module ?? "(missing)"}`,
      blockers,
      blockedOutcome: "deferred-unsupported-lane",
      ...(entrypoint.module
        ? {
            blockedLaunchShape: {
              kind: "module-entrypoint" as const,
              registryType: pkg.registryType,
              packageIdentifier: pkg.identifier,
              module: entrypoint.module,
            },
          }
        : {}),
    };
  }
  return { blockers: [`Unsupported package entrypoint kind ${(entrypoint as { kind?: string }).kind ?? "unknown"}.`] };
}

function sameToolHiveProtocolDefaultExecutable(pkg: McpRuntimePackage, command: string): boolean {
  if (pkg.registryType === "pypi") return normalizePackageExecutableName(command) === normalizePackageExecutableName(pkg.identifier);
  if (pkg.registryType === "npm") return command.toLowerCase() === defaultNpmExecutableName(pkg.identifier).toLowerCase();
  return false;
}

function defaultNpmExecutableName(identifier: string): string {
  const parts = identifier.split("/");
  return parts[parts.length - 1] ?? identifier;
}

function normalizePackageExecutableName(value: string): string {
  return value.trim().toLowerCase().replace(/[-_.]+/g, "-");
}

function safePackageEntrypointCommand(value: string): boolean {
  return value.length <= 160 &&
    !value.startsWith("-") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes(":") &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    /^[A-Za-z0-9][A-Za-z0-9_.@+-]*$/.test(value);
}

function toolHiveRuntimeCompatibilityEnvVars(registryType: McpRuntimePackage["registryType"], envVars: ToolHivePlainEnvVar[]): ToolHivePlainEnvVar[] {
  if (registryType !== "npm") return envVars;
  if (envVars.some((entry) => entry.name === "NODE_USE_ENV_PROXY")) return envVars;
  return [...envVars, { name: "NODE_USE_ENV_PROXY", value: "1" }];
}

function looksSecretEnvName(name: string): boolean {
  return /(?:^|_)(?:API_?KEY|TOKEN|SECRET|PASSWORD|PASS|BEARER|CREDENTIAL|PRIVATE_?KEY)(?:_|$)/i.test(name);
}

function reviewedToolHiveRuntimeImage(
  runtimeImage: string | undefined,
  registryType: NonNullable<McpAutowireCandidate["runtime"]["package"]>["registryType"],
  blockers: string[],
): string | undefined {
  if (!runtimeImage) return undefined;
  if (registryType !== "npm" && registryType !== "pypi") {
    blockers.push(`ToolHive runtime image overrides apply only to npm/npx and PyPI/uvx Standard MCP protocol builds, not ${registryType}.`);
    return undefined;
  }
  if (runtimeImage.length > 512 || runtimeImage.includes("\0") || looksSecretLike(runtimeImage)) {
    blockers.push("ToolHive runtime image override must be a bounded non-secret image reference.");
    return undefined;
  }
  if (runtimeImage.startsWith("-") || runtimeImage.startsWith("./") || runtimeImage.startsWith("../") || runtimeImage.includes("://")) {
    blockers.push(`ToolHive runtime image override cannot be a flag, local path, or URL: ${runtimeImage}`);
    return undefined;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(runtimeImage)) {
    blockers.push(`Invalid ToolHive runtime image override: ${runtimeImage}`);
    return undefined;
  }
  return runtimeImage;
}
