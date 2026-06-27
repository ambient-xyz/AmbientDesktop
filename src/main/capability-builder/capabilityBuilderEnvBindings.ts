import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setAmbientCliPackageEnvBinding, setAmbientCliPackageSecretBinding } from "./capabilityBuilderAmbientCliFacade";
import { isPathInside } from "./capabilityBuilderSessionFacade";
import { ambientRuntimeEnv, managedInstallWorkspacePath } from "./capabilityBuilderSetupFacade";
import type { CapabilityBuilderPreviewResult } from "./capabilityBuilderTypes";
import { isSecretReference, readSecretReference, saveSecretReference } from "./capabilityBuilderSecurityFacade";

export async function capabilityBuilderValidationProcessEnv(
  workspace: string,
  preview: CapabilityBuilderPreviewResult,
): Promise<NodeJS.ProcessEnv> {
  const env = ambientRuntimeEnv();
  const bindings = await readCapabilityBuilderEnvBindings(workspace, preview);
  for (const requirement of preview.descriptor?.envRequirements ?? []) {
    const binding = bindings[requirement.name];
    if (!binding) continue;
    const value =
      binding.source === "managed-secret"
        ? (await readSecretReference(binding.secretRef))?.trim()
        : await readCapabilityBuilderEnvFile(workspace, requirement.name, binding.filePath);
    if (value) env[requirement.name] = value;
  }
  return env;
}

export async function saveCapabilityBuilderEnvSecretBinding(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  input: { envName: string; value: string },
): Promise<{ envName: string; secretRef: string }> {
  const envName = normalizeCapabilityEnvName(input.envName);
  const value = input.value.trim();
  if (!value) throw new Error("Capability Builder secret value is empty.");
  const secretRef = await saveSecretReference({
    scope: "capability-builder",
    workspacePath: workspace,
    ownerId: `${preview.packageName}\0${preview.relativeRootPath}`,
    envName,
    value,
  });
  await setCapabilityBuilderSecretBinding(workspace, preview, envName, secretRef);
  return { envName, secretRef };
}

export async function copyBuilderEnvBindingsToInstalledPackage(workspace: string, preview: CapabilityBuilderPreviewResult): Promise<void> {
  const bindings = await readCapabilityBuilderEnvBindings(workspace, preview);
  for (const env of preview.descriptor?.envRequirements ?? []) {
    const binding = bindings[env.name];
    if (!binding) continue;
    if (binding.source === "managed-secret") {
      await setAmbientCliPackageSecretBinding(workspace, {
        packageName: preview.packageName,
        envName: env.name,
        secretRef: binding.secretRef,
      });
    } else {
      await setAmbientCliPackageEnvBinding(workspace, {
        packageName: preview.packageName,
        envName: env.name,
        filePath: binding.filePath,
      });
    }
  }
}

async function setCapabilityBuilderSecretBinding(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
  envName: string,
  secretRef: string,
): Promise<void> {
  if (!isSecretReference(secretRef)) throw new Error("Capability Builder secret reference is invalid.");
  const value = (await readSecretReference(secretRef))?.trim();
  if (!value) throw new Error("Capability Builder secret reference is empty or missing.");
  const bindingsPath = capabilityBuilderEnvBindingsPath(workspace);
  const existing = await readCapabilityBuilderEnvBindingRows(workspace);
  const rows = [
    ...existing.filter(
      (binding) =>
        normalizeCapabilityEnvName(binding.envName) !== envName ||
        (binding.packageName !== preview.packageName && binding.sourcePath !== preview.relativeRootPath),
    ),
    { packageName: preview.packageName, sourcePath: preview.relativeRootPath, envName, secretRef },
  ].sort((left, right) => left.packageName.localeCompare(right.packageName) || left.envName.localeCompare(right.envName));
  await mkdir(dirname(bindingsPath), { recursive: true });
  await writeFile(bindingsPath, `${JSON.stringify({ bindings: rows }, null, 2)}\n`, "utf8");
}

async function readCapabilityBuilderEnvBindings(
  workspace: string,
  preview: Pick<CapabilityBuilderPreviewResult, "packageName" | "relativeRootPath">,
): Promise<Record<string, CapabilityBuilderEnvBindingResolution>> {
  const entries: Record<string, CapabilityBuilderEnvBindingResolution> = {};
  for (const binding of await readCapabilityBuilderEnvBindingRows(workspace)) {
    if (binding.packageName !== preview.packageName && binding.sourcePath !== preview.relativeRootPath) continue;
    const envName = normalizeCapabilityEnvName(binding.envName);
    if (binding.secretRef) entries[envName] = { source: "managed-secret", secretRef: binding.secretRef };
    else if (binding.filePath) entries[envName] = { source: "file", filePath: binding.filePath };
  }
  return entries;
}

type CapabilityBuilderEnvBindingResolution = { source: "file"; filePath: string } | { source: "managed-secret"; secretRef: string };

type CapabilityBuilderEnvBindingRow = {
  packageName: string;
  sourcePath?: string;
  envName: string;
  filePath?: string;
  secretRef?: string;
};

async function readCapabilityBuilderEnvBindingRows(workspace: string): Promise<CapabilityBuilderEnvBindingRow[]> {
  const bindingsPath = capabilityBuilderEnvBindingsPath(workspace);
  if (!existsSync(bindingsPath)) return [];
  const errors: string[] = [];
  const parsed = parseJsonObject(await readFile(bindingsPath, "utf8"), "capability-builder env bindings", errors);
  if (!parsed || errors.length) return [];
  const rows = Array.isArray(parsed.bindings) ? parsed.bindings : [];
  const parsedRows = rows.flatMap((item) => {
    const record = recordField(item);
    const packageName = stringField(record.packageName);
    const envName = stringField(record.envName);
    const filePath = stringField(record.filePath);
    const secretRef = stringField(record.secretRef);
    if (!packageName || !envName || (!filePath && !secretRef)) return [];
    return [
      {
        packageName,
        ...(stringField(record.sourcePath) ? { sourcePath: stringField(record.sourcePath) } : {}),
        envName: normalizeCapabilityEnvName(envName),
        ...(filePath ? { filePath } : {}),
        ...(secretRef ? { secretRef } : {}),
      },
    ];
  });
  const migrated = await migrateCapabilityBuilderLegacySecretBindings(workspace, parsedRows);
  if (migrated.changed) await writeFile(bindingsPath, `${JSON.stringify({ bindings: migrated.bindings }, null, 2)}\n`, "utf8");
  return migrated.bindings;
}

async function readCapabilityBuilderEnvFile(workspace: string, envName: string, filePath: string): Promise<string> {
  const absolutePath = resolve(workspace, filePath);
  if (!isPathInside(workspace, absolutePath)) throw new Error(`Capability Builder env file for ${envName} must stay inside the workspace.`);
  return (await readFile(absolutePath, "utf8")).trim();
}

async function migrateCapabilityBuilderLegacySecretBindings(
  workspace: string,
  bindings: CapabilityBuilderEnvBindingRow[],
): Promise<{ bindings: CapabilityBuilderEnvBindingRow[]; changed: boolean }> {
  let changed = false;
  const migrated: CapabilityBuilderEnvBindingRow[] = [];
  for (const binding of bindings) {
    if (!binding.filePath || binding.secretRef || !isLegacyCapabilityBuilderSecretBinding(workspace, binding.filePath)) {
      migrated.push(binding);
      continue;
    }
    try {
      const absolutePath = resolve(workspace, binding.filePath);
      const value = (await readFile(absolutePath, "utf8")).trim();
      if (!value) {
        migrated.push(binding);
        continue;
      }
      const envName = normalizeCapabilityEnvName(binding.envName);
      const secretRef = await saveSecretReference({
        scope: "capability-builder",
        workspacePath: workspace,
        ownerId: `${binding.packageName}\0${binding.sourcePath ?? ""}`,
        envName,
        value,
      });
      await rm(absolutePath, { force: true });
      migrated.push({
        packageName: binding.packageName,
        ...(binding.sourcePath ? { sourcePath: binding.sourcePath } : {}),
        envName,
        secretRef,
      });
      changed = true;
    } catch {
      migrated.push(binding);
    }
  }
  return { bindings: migrated, changed };
}

function isLegacyCapabilityBuilderSecretBinding(workspace: string, filePath: string): boolean {
  const absolutePath = resolve(workspace, filePath);
  const legacyRoot = resolve(workspace, ".ambient", "capability-builder", "secrets");
  return isPathInside(legacyRoot, absolutePath) && absolutePath.endsWith(".secret");
}

function capabilityBuilderEnvBindingsPath(workspace: string): string {
  return resolve(managedInstallWorkspacePath(workspace), ".ambient", "capability-builder", "env-bindings.json");
}

export function normalizeCapabilityEnvName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid env name: ${value}`);
  return name;
}

function parseJsonObject(content: string, label: string, errors: string[]): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${label} must contain a JSON object.`);
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
