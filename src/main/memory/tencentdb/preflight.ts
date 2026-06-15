import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { AgentMemoryNativeDependencyPreflight } from "../../../shared/agentMemoryDiagnostics";
import {
  PHASE0_TENCENT_MEMORY_PACKAGE_AUDIT,
  TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST,
} from "./upstreamAudit";
import { AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE } from "./optionalCore";

const requireFromHere = createRequire(import.meta.url);
const REQUIRED_TENCENT_MEMORY_NATIVE_DEPENDENCIES = [
  "@node-rs/jieba",
  "sqlite-vec",
] as const;

export interface InspectTencentDbMemoryNativePreflightInput {
  now?: Date;
  coreModuleSpecifier?: string;
  requireResolve?: (specifier: string) => string;
  readPackageJson?: (path: string) => unknown;
  platform?: string;
  arch?: string;
  nodeModuleVersion?: string;
}

export function inspectTencentDbMemoryNativePreflight(
  input: InspectTencentDbMemoryNativePreflightInput = {},
): AgentMemoryNativeDependencyPreflight {
  const checkedAt = (input.now ?? new Date()).toISOString();
  const requireResolve = input.requireResolve ?? ((specifier) => requireFromHere.resolve(specifier));
  const readPackageJson = input.readPackageJson ?? ((path) => JSON.parse(readFileSync(path, "utf8")) as unknown);
  const dependencies = REQUIRED_TENCENT_MEMORY_NATIVE_DEPENDENCIES.map((name) => {
    const expectedVersion = upstreamDependencyVersion(name);
    try {
      const packageJsonPath = requireResolve(`${name}/package.json`);
      const packageJson = recordValue(readPackageJson(packageJsonPath));
      const version = stringValue(packageJson.version);
      return {
        name,
        ...(expectedVersion ? { expectedVersion } : {}),
        resolvable: true,
        ...(version ? { version } : {}),
        packageJsonPath,
        status: "healthy" as const,
        message: version
          ? `${name} package metadata resolved for this runtime.`
          : `${name} package metadata resolved but version was unavailable.`,
      };
    } catch (error) {
      return {
        name,
        ...(expectedVersion ? { expectedVersion } : {}),
        resolvable: false,
        status: "unavailable" as const,
        message: `${name} package metadata is not resolvable without the reviewed TencentDB memory core package.`,
      };
    }
  });
  const coreModuleSpecifier = input.coreModuleSpecifier
    ?? process.env.AMBIENT_TENCENTDB_MEMORY_CORE_MODULE
    ?? AMBIENT_REVIEWED_TENCENT_MEMORY_MODULE;
  const missingDependencies = dependencies.filter((dependency) => !dependency.resolvable);
  const status = !coreModuleSpecifier
    ? "unavailable"
    : missingDependencies.length
      ? "needs_attention"
      : "healthy";
  const message = !coreModuleSpecifier
    ? "Reviewed TencentDB Agent Memory core module is not configured."
    : missingDependencies.length
      ? `TencentDB Agent Memory native preflight found ${missingDependencies.length} unresolved native dependency package${missingDependencies.length === 1 ? "" : "s"}.`
      : "TencentDB Agent Memory native dependency package metadata resolved.";
  return {
    schemaVersion: "ambient-agent-memory-native-preflight-v1",
    checkedAt,
    platform: input.platform ?? process.platform,
    arch: input.arch ?? process.arch,
    ...(input.nodeModuleVersion ?? process.versions.modules ? { nodeModuleVersion: input.nodeModuleVersion ?? process.versions.modules } : {}),
    coreModuleConfigured: Boolean(coreModuleSpecifier),
    ...(coreModuleSpecifier ? { coreModuleSpecifier } : {}),
    status,
    message,
    dependencies,
    errors: [],
  };
}

function upstreamDependencyVersion(name: string): string | undefined {
  return {
    ...TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST.dependencies,
    ...TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST.optionalDependencies,
    ...TENCENT_MEMORY_UPSTREAM_PACKAGE_AUDIT_MANIFEST.peerDependencies,
  }[name];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
