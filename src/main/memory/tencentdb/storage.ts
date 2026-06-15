import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION = "ambient-tencent-memory-storage-v1" as const;
export const AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_FILENAME = "ambient-memory-schema.json" as const;

export interface AmbientTencentMemoryStorageSchemaInspection {
  status: "missing" | "current" | "unsupported";
  path: string;
  expectedVersion: typeof AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  message: string;
}

export function ambientTencentMemoryDataDir(workspaceStatePath: string): string {
  return join(workspaceStatePath, "memory", "tencentdb");
}

export function ambientTencentMemoryStorageSchemaPath(dataDir: string): string {
  return join(dataDir, AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_FILENAME);
}

export async function inspectAmbientTencentMemoryStorageSchema(
  dataDir: string,
): Promise<AmbientTencentMemoryStorageSchemaInspection> {
  const path = ambientTencentMemoryStorageSchemaPath(dataDir);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        status: "missing",
        path,
        expectedVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
        message: "TencentDB Agent Memory storage schema marker has not been created yet.",
      };
    }
    return {
      status: "unsupported",
      path,
      expectedVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
      message: `TencentDB Agent Memory storage schema marker could not be read: ${errorMessage(error)}`,
    };
  }

  const version = stringValue(parsed.schemaVersion);
  const createdAt = stringValue(parsed.createdAt);
  const updatedAt = stringValue(parsed.updatedAt);
  if (version === AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION) {
    return {
      status: "current",
      path,
      expectedVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
      version,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      message: "TencentDB Agent Memory storage schema marker is current.",
    };
  }
  return {
    status: "unsupported",
    path,
    expectedVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
    ...(version ? { version } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    message: `TencentDB Agent Memory storage schema ${version ?? "unknown"} is unsupported; expected ${AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION}.`,
  };
}

export async function ensureAmbientTencentMemoryStorageSchema(
  dataDir: string,
  now = new Date(),
): Promise<AmbientTencentMemoryStorageSchemaInspection> {
  const inspected = await inspectAmbientTencentMemoryStorageSchema(dataDir);
  if (inspected.status === "current") return inspected;
  if (inspected.status === "unsupported") throw new Error(inspected.message);

  await mkdir(dataDir, { recursive: true });
  const timestamp = now.toISOString();
  const marker = {
    schemaVersion: AMBIENT_TENCENT_MEMORY_STORAGE_SCHEMA_VERSION,
    adapter: "tencentdb",
    storageScope: "workspace",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeFile(inspected.path, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return inspectAmbientTencentMemoryStorageSchema(dataDir);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
