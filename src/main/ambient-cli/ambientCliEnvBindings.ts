import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { ambientRuntimeEnv, managedInstallWorkspacePath } from "../setup/setupAmbientCliContract";
import {
  isSecretEnvName,
  isSecretReference,
  readSecretReference,
  saveSecretReference,
  secretReferenceFor,
} from "../security/securityAmbientCliContract";
import { isPathInside } from "./ambientCliSessionFacade";
import type {
  AmbientCliPackageEnvBindingInput,
  AmbientCliPackageEnvStatus,
  AmbientCliPackageSecretInput,
  AmbientCliPackageSummary,
} from "./ambientCliPackages";

export const cliPackageEnvBindingsPath = ".ambient/cli-packages/env-bindings.json";
export const ambientCliWorkspaceProviderMarkerPath = ".ambient/cli-packages/workspace-provider-state.json";

const legacyVoiceDiscoveryCachePath = ".ambient/voice/voice-discovery-cache.json";
const legacyQwenSttValidationMetadataPath = ".ambient/stt/qwen3-asr/validation.json";

const cliPackageEnvBindingSchema = z
  .object({
    packageName: z.string().min(1),
    envName: z.string().min(1),
    filePath: z.string().min(1).optional(),
    secretRef: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.filePath || value.secretRef), { message: "Ambient CLI env binding requires filePath or secretRef." });

const cliPackageEnvBindingsSchema = z
  .object({
    bindings: z.array(cliPackageEnvBindingSchema).default([]),
  })
  .passthrough();

type AmbientCliPackageEnvBindingRow = z.infer<typeof cliPackageEnvBindingSchema>;
type AmbientCliEnvBindingResolution = { source: "file"; filePath: string } | { source: "managed-secret"; secretRef: string };

export interface AmbientCliEnvBindingServiceDependencies {
  cliPackageConfigPath: string;
  ensureAmbientCliManagedInstallWorkspace(workspacePath: string): Promise<string>;
  normalizeEnvName(value: string): string;
  readJson(path: string): Promise<unknown>;
  errorMessage(error: unknown): string;
}

export function createAmbientCliEnvBindingServices(deps: AmbientCliEnvBindingServiceDependencies) {
  const { cliPackageConfigPath, ensureAmbientCliManagedInstallWorkspace, errorMessage, normalizeEnvName, readJson } = deps;

  async function setAmbientCliPackageEnvBinding(
    workspacePath: string,
    input: AmbientCliPackageEnvBindingInput,
  ): Promise<AmbientCliPackageEnvStatus> {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const packageName = input.packageName.trim();
    if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
    const envName = normalizeEnvName(input.envName);
    const absolutePath = resolve(workspacePath, input.filePath);
    if (!isPathInside(workspacePath, absolutePath)) throw new Error("Ambient CLI env binding file must stay inside the workspace.");
    if (!existsSync(absolutePath)) throw new Error("Ambient CLI env binding file was not found.");
    const value = (await readFile(absolutePath, "utf8")).trim();
    if (!value) throw new Error("Ambient CLI env binding file is empty.");
    const filePath = `./${relative(workspacePath, absolutePath).split(sep).join("/")}`;
    const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
    const existing = existsSync(bindingsPath) ? cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath)) : { bindings: [] };
    const bindings = [
      ...existing.bindings.filter((binding) => binding.packageName !== packageName || normalizeEnvName(binding.envName) !== envName),
      { packageName, envName, filePath },
    ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
    await mkdir(dirname(bindingsPath), { recursive: true });
    await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
    await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "env-binding", packageName });
    return {
      name: envName,
      required: true,
      configured: true,
      source: "file",
      filePath,
    };
  }

  async function setAmbientCliPackageSecretBinding(
    workspacePath: string,
    input: { packageName: string; envName: string; secretRef: string },
  ): Promise<AmbientCliPackageEnvStatus> {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const packageName = input.packageName.trim();
    if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
    const envName = normalizeEnvName(input.envName);
    const secretRef = input.secretRef.trim();
    if (!isSecretReference(secretRef)) throw new Error("Ambient CLI secret reference is invalid.");
    const value = (await readSecretReference(secretRef))?.trim();
    if (!value) throw new Error("Ambient CLI secret reference is empty or missing.");
    const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
    const existing = existsSync(bindingsPath) ? cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath)) : { bindings: [] };
    const bindings = [
      ...existing.bindings.filter((binding) => binding.packageName !== packageName || normalizeEnvName(binding.envName) !== envName),
      { packageName, envName, secretRef },
    ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
    await mkdir(dirname(bindingsPath), { recursive: true });
    await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
    await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "secret-binding", packageName });
    return {
      name: envName,
      required: true,
      configured: true,
      source: "managed-secret",
      secretRef,
    };
  }

  async function removeAmbientCliPackageEnvBindings(
    workspacePath: string,
    input: { packageName: string; envNames?: string[] },
  ): Promise<number> {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const packageName = input.packageName.trim();
    if (!packageName) throw new Error("Ambient CLI env binding packageName is required.");
    const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
    if (!existsSync(bindingsPath)) return 0;
    const existing = cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath));
    const envNames = input.envNames?.length ? new Set(input.envNames.map((name) => normalizeEnvName(name))) : undefined;
    const bindings = existing.bindings.filter((binding) => {
      if (binding.packageName !== packageName) return true;
      return envNames ? !envNames.has(normalizeEnvName(binding.envName)) : false;
    });
    const removed = existing.bindings.length - bindings.length;
    if (!removed) return 0;
    await mkdir(dirname(bindingsPath), { recursive: true });
    await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
    await markAmbientCliWorkspaceProviderState(workspacePath, { reason: "env-binding-removed", packageName });
    return removed;
  }

  async function saveAmbientCliPackageEnvSecret(
    workspacePath: string,
    input: AmbientCliPackageSecretInput,
  ): Promise<AmbientCliPackageEnvStatus> {
    const packageName = input.packageName.trim();
    if (!packageName) throw new Error("Ambient CLI secret packageName is required.");
    const envName = normalizeEnvName(input.envName);
    const value = input.value.trim();
    if (!value) throw new Error("Ambient CLI secret value is empty.");
    const secretRef = await saveSecretReference({
      scope: "ambient-cli",
      workspacePath,
      ownerId: packageName,
      envName,
      value,
    });
    return setAmbientCliPackageSecretBinding(workspacePath, {
      packageName,
      envName,
      secretRef,
    });
  }

  async function resolveAmbientCliEnvStatus(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<AmbientCliPackageEnvStatus[]> {
    const bindings = await readAmbientCliEnvBindingMap(workspacePath, pkg.name);
    return Promise.all(
      pkg.envRequirements.map(async (requirement) => {
        const binding = bindings[requirement.name];
        if (binding?.source === "file") {
          try {
            const absolutePath = resolve(workspacePath, binding.filePath);
            if (!isPathInside(workspacePath, absolutePath)) throw new Error("Env file must stay inside the workspace.");
            const value = (await readFile(absolutePath, "utf8")).trim();
            return {
              ...requirement,
              configured: value.length > 0,
              source: "file" as const,
              filePath: `./${relative(workspacePath, absolutePath).split(sep).join("/")}`,
              ...(value.length === 0 ? { error: "Env file is empty." } : {}),
            };
          } catch (error) {
            return {
              ...requirement,
              configured: false,
              source: "file" as const,
              filePath: binding.filePath,
              error: errorMessage(error),
            };
          }
        }
        if (binding?.source === "managed-secret") {
          try {
            const value = (await readSecretReference(binding.secretRef))?.trim();
            return {
              ...requirement,
              configured: Boolean(value),
              source: "managed-secret" as const,
              secretRef: binding.secretRef,
              ...(value ? {} : { error: "Managed secret reference is empty or missing." }),
            };
          } catch (error) {
            return {
              ...requirement,
              configured: false,
              source: "managed-secret" as const,
              secretRef: binding.secretRef,
              error: errorMessage(error),
            };
          }
        }
        const processValue = process.env[requirement.name];
        if (typeof processValue === "string" && processValue.length > 0 && !isSecretEnvName(requirement.name)) {
          return {
            ...requirement,
            configured: true,
            source: "process" as const,
          };
        }
        return {
          ...requirement,
          configured: false,
        };
      }),
    );
  }

  function requiredMissingEnv(status: AmbientCliPackageEnvStatus[]): AmbientCliPackageEnvStatus[] {
    return status.filter((env) => env.required && !env.configured);
  }

  async function ambientCliProcessEnv(workspacePath: string, pkg: AmbientCliPackageSummary): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = {
      ...ambientRuntimeEnv(),
      AMBIENT_WORKSPACE_PATH: workspacePath,
      AMBIENT_DESKTOP_WORKSPACE: workspacePath,
    };
    for (const status of await resolveAmbientCliEnvStatus(workspacePath, pkg)) {
      if (status.source === "file") {
        if (!status.filePath || !status.configured) continue;
        const absolutePath = resolve(workspacePath, status.filePath);
        if (!isPathInside(workspacePath, absolutePath)) throw new Error(`Env file for ${status.name} must stay inside the workspace.`);
        env[status.name] = (await readFile(absolutePath, "utf8")).trim();
      } else if (status.source === "managed-secret") {
        if (!status.secretRef || !status.configured) continue;
        const value = (await readSecretReference(status.secretRef))?.trim();
        if (value) env[status.name] = value;
      } else if (status.source === "process" && status.configured && !isSecretEnvName(status.name)) {
        const value = process.env[status.name];
        if (typeof value === "string") env[status.name] = value;
      }
    }
    for (const name of ambientCliTestHookEnvNames(pkg.name)) {
      const value = process.env[name];
      if (typeof value === "string" && !isSecretEnvName(name)) env[name] = value;
    }
    applyAmbientCliPackageDefaultEnv(workspacePath, pkg, env);
    return env;
  }

  function applyAmbientCliPackageDefaultEnv(workspacePath: string, pkg: AmbientCliPackageSummary, env: NodeJS.ProcessEnv): void {
    if (pkg.name !== "ambient-minicpm-v-vision") return;
    if (env.AMBIENT_MINICPM_V_STATE_DIR) return;
    const stateDir = resolve(workspacePath, ".ambient/vision/minicpm-v/state");
    if (!isPathInside(workspacePath, stateDir)) return;
    env.AMBIENT_MINICPM_V_STATE_DIR = stateDir;
  }

  function ambientCliTestHookEnvNames(packageName: string): string[] {
    if (packageName === "ambient-qwen3-asr") return ["AMBIENT_QWEN3_ASR_FAKE_TRANSCRIPT"];
    if (packageName === "ambient-faster-whisper-stt") return ["AMBIENT_FASTER_WHISPER_FAKE_TRANSCRIPT"];
    if (packageName === "ambient-hyperframes") return ["AMBIENT_HYPERFRAMES_FAKE_RENDER"];
    if (packageName === "ambient-imagegen") return ["AMBIENT_HOSTED_IMAGE_FAKE_GENERATION"];
    if (packageName === "ambient-tinystyler") return ["AMBIENT_TINYSTYLER_FAKE_RUNTIME"];
    if (packageName === "ambient-minicpm-v-vision") return ["AMBIENT_MINICPM_V_FAKE_ANALYSIS"];
    return [];
  }

  async function readAmbientCliEnvBindingMap(
    workspacePath: string,
    packageName: string,
  ): Promise<Record<string, AmbientCliEnvBindingResolution>> {
    const installWorkspace = await ensureAmbientCliManagedInstallWorkspace(workspacePath);
    const bindingsPath = join(installWorkspace, cliPackageEnvBindingsPath);
    if (!existsSync(bindingsPath)) return {};
    const parsed = cliPackageEnvBindingsSchema.parse(await readJson(bindingsPath));
    const { bindings, changed } = await migrateAmbientCliLegacySecretBindings(workspacePath, parsed.bindings);
    if (changed) await writeFile(bindingsPath, `${JSON.stringify({ bindings }, null, 2)}\n`, "utf8");
    const entries: Record<string, AmbientCliEnvBindingResolution> = {};
    for (const binding of bindings) {
      if (binding.packageName !== packageName) continue;
      const envName = normalizeEnvName(binding.envName);
      if (binding.secretRef) entries[envName] = { source: "managed-secret", secretRef: binding.secretRef };
      else if (binding.filePath) entries[envName] = { source: "file", filePath: binding.filePath };
    }
    return entries;
  }

  async function migrateAmbientCliLegacySecretBindings(
    workspacePath: string,
    bindings: AmbientCliPackageEnvBindingRow[],
  ): Promise<{ bindings: AmbientCliPackageEnvBindingRow[]; changed: boolean }> {
    let changed = false;
    const migrated: AmbientCliPackageEnvBindingRow[] = [];
    for (const binding of bindings) {
      if (!binding.filePath || binding.secretRef || !isLegacyWorkspaceSecretBinding(workspacePath, binding.filePath, ["cli-packages"])) {
        migrated.push(binding);
        continue;
      }
      try {
        const absolutePath = resolve(workspacePath, binding.filePath);
        const value = (await readFile(absolutePath, "utf8")).trim();
        if (!value) {
          migrated.push(binding);
          continue;
        }
        const envName = normalizeEnvName(binding.envName);
        const secretRef = await saveSecretReference({
          scope: "ambient-cli",
          workspacePath,
          ownerId: binding.packageName,
          envName,
          value,
        });
        await rm(absolutePath, { force: true });
        migrated.push({ packageName: binding.packageName, envName, secretRef });
        changed = true;
      } catch {
        migrated.push(binding);
      }
    }
    return { bindings: migrated, changed };
  }

  function isLegacyWorkspaceSecretBinding(workspacePath: string, filePath: string, namespace: string[]): boolean {
    const absolutePath = resolve(workspacePath, filePath);
    const legacyRoot = resolve(workspacePath, ".ambient", ...namespace, "secrets");
    return isPathInside(legacyRoot, absolutePath) && absolutePath.endsWith(".secret");
  }

  function hasAmbientCliWorkspaceProviderMarker(workspacePath: string): boolean {
    return existsSync(resolve(workspacePath, ambientCliWorkspaceProviderMarkerPath));
  }

  function hasAmbientCliWorkspaceProviderDiscoverySignal(workspacePath: string): boolean {
    const workspace = resolve(workspacePath);
    if (hasAmbientCliWorkspaceProviderMarker(workspace)) return true;
    if (existsSync(resolve(workspace, cliPackageConfigPath))) return true;
    if (!existsSync(join(managedInstallWorkspacePath(workspace), cliPackageConfigPath))) return false;
    return (
      existsSync(resolve(workspace, legacyVoiceDiscoveryCachePath)) ||
      existsSync(resolve(workspace, legacyQwenSttValidationMetadataPath)) ||
      ambientCliWorkspaceHasExistingProviderEnvBinding(workspace)
    );
  }

  function ambientCliWorkspaceHasExistingProviderEnvBinding(workspacePath: string): boolean {
    const workspace = resolve(workspacePath);
    const bindingsPath = join(managedInstallWorkspacePath(workspace), cliPackageEnvBindingsPath);
    if (!existsSync(bindingsPath)) return false;
    try {
      const parsed = cliPackageEnvBindingsSchema.parse(JSON.parse(readFileSync(bindingsPath, "utf8")));
      return parsed.bindings.some(
        (binding) =>
          ambientCliEnvBindingFileExistsInWorkspace(workspace, binding) || ambientCliEnvBindingSecretMatchesWorkspace(workspace, binding),
      );
    } catch {
      return false;
    }
  }

  function ambientCliEnvBindingFileExistsInWorkspace(workspacePath: string, binding: AmbientCliPackageEnvBindingRow): boolean {
    if (!binding.filePath) return false;
    const absolutePath = resolve(workspacePath, binding.filePath);
    return isPathInside(workspacePath, absolutePath) && existsSync(absolutePath);
  }

  function ambientCliEnvBindingSecretMatchesWorkspace(workspacePath: string, binding: AmbientCliPackageEnvBindingRow): boolean {
    if (!binding.secretRef) return false;
    try {
      return (
        binding.secretRef ===
        secretReferenceFor({
          scope: "ambient-cli",
          workspacePath,
          ownerId: binding.packageName,
          envName: binding.envName,
        })
      );
    } catch {
      return false;
    }
  }

  async function markAmbientCliWorkspaceProviderState(
    workspacePath: string,
    input: { reason: string; packageName?: string },
  ): Promise<void> {
    const markerPath = resolve(workspacePath, ambientCliWorkspaceProviderMarkerPath);
    if (!isPathInside(resolve(workspacePath), markerPath))
      throw new Error("Ambient CLI workspace provider marker must stay inside the workspace.");
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(
      markerPath,
      `${JSON.stringify(
        {
          schemaVersion: "ambient-cli-workspace-provider-state-v1",
          updatedAt: new Date().toISOString(),
          reason: input.reason,
          ...(input.packageName ? { packageName: input.packageName } : {}),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return {
    ambientCliProcessEnv,
    hasAmbientCliWorkspaceProviderDiscoverySignal,
    hasAmbientCliWorkspaceProviderMarker,
    markAmbientCliWorkspaceProviderState,
    removeAmbientCliPackageEnvBindings,
    requiredMissingEnv,
    resolveAmbientCliEnvStatus,
    saveAmbientCliPackageEnvSecret,
    setAmbientCliPackageEnvBinding,
    setAmbientCliPackageSecretBinding,
  };
}
