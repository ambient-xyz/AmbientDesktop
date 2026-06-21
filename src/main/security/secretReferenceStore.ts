import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { registerSecretRedaction } from "./secretRedaction";
import { electronAppAvailable, electronSecureSecretStore, type SecureSecretStoreEncoding } from "./secureSecretStore";

const require = createRequire(import.meta.url);
const secretReferencePrefix = "ambient-secret-ref:v1:";
const secretRecordSchemaVersion = "ambient-secret-reference-v1";
const storeRootEnvName = "AMBIENT_SECRET_REFERENCE_STORE_ROOT";

export type SecretReferenceScope = "ambient-cli" | "capability-builder" | "mcp-server" | "model-provider" | "named-secret";

export interface SaveSecretReferenceInput {
  scope: SecretReferenceScope;
  workspacePath: string;
  ownerId: string;
  envName: string;
  value: string;
}

export interface SecretReferenceAddressInput {
  scope: SecretReferenceScope;
  workspacePath: string;
  ownerId: string;
  envName: string;
}

interface SecretReferenceRecord {
  schemaVersion: typeof secretRecordSchemaVersion;
  scope: SecretReferenceScope;
  workspaceHash: string;
  ownerHash: string;
  envName: string;
  encoding: SecureSecretStoreEncoding | "base64-node-fallback";
  value: string;
  createdAt: string;
  updatedAt: string;
}

interface ElectronRuntime {
  app?: { getPath(name: string): string };
}

export function isSecretReference(value: string): boolean {
  return value.startsWith(secretReferencePrefix) && /^[a-f0-9]{64}$/.test(value.slice(secretReferencePrefix.length));
}

export function secretReferenceFor(input: SecretReferenceAddressInput): string {
  const envName = normalizeEnvName(input.envName);
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error("Secret owner id is required.");
  const workspaceHash = hash(resolve(input.workspacePath));
  const ownerHash = hash(ownerId);
  const id = hash([input.scope, workspaceHash, ownerHash, envName].join("\0"));
  return `${secretReferencePrefix}${id}`;
}

export async function findSecretReference(input: SecretReferenceAddressInput): Promise<string | undefined> {
  const secretRef = secretReferenceFor(input);
  if (!existsSync(secretReferencePath(secretRef))) return undefined;
  const record = await readSecretRecord(secretReferencePath(secretRef));
  if (!record) return undefined;
  if (record.scope !== input.scope || record.envName !== normalizeEnvName(input.envName)) {
    throw new Error("Ambient secret reference record does not match the requested address.");
  }
  return secretRef;
}

export async function saveSecretReference(input: SaveSecretReferenceInput): Promise<string> {
  const envName = normalizeEnvName(input.envName);
  const ownerId = input.ownerId.trim();
  const value = input.value;
  if (!ownerId) throw new Error("Secret owner id is required.");
  if (value.length === 0) throw new Error("Secret value is empty.");

  const secretRef = secretReferenceFor({ scope: input.scope, workspacePath: input.workspacePath, ownerId, envName });
  const path = secretReferencePath(secretRef);
  const workspaceHash = hash(resolve(input.workspacePath));
  const ownerHash = hash(ownerId);
  const existing = await readSecretRecord(path);
  const encoded = encodeSecretValue(value);
  const now = new Date().toISOString();
  const record: SecretReferenceRecord = {
    schemaVersion: secretRecordSchemaVersion,
    scope: input.scope,
    workspaceHash,
    ownerHash,
    envName,
    encoding: encoded.encoding,
    value: encoded.value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  registerSecretRedaction(value);
  return secretRef;
}

export async function readSecretReference(secretRef: string): Promise<string | undefined> {
  if (!isSecretReference(secretRef)) throw new Error("Invalid Ambient secret reference.");
  const path = secretReferencePath(secretRef);
  if (!existsSync(path)) return undefined;
  const record = await readSecretRecord(path);
  if (!record) return undefined;
  const value = decodeSecretValue(record);
  registerSecretRedaction(value);
  return value;
}

export async function removeSecretReference(secretRef: string): Promise<void> {
  if (!isSecretReference(secretRef)) return;
  await rm(secretReferencePath(secretRef), { force: true });
}

function encodeSecretValue(value: string): Pick<SecretReferenceRecord, "encoding" | "value"> {
  const encoded = secretStore().encryptForRecord(value);
  return {
    encoding: encoded.encoding === "base64-node-test-fallback" ? "base64-node-fallback" : encoded.encoding,
    value: encoded.value,
  };
}

function decodeSecretValue(record: SecretReferenceRecord): string {
  return secretStore().decryptFromRecord({
    encoding: record.encoding === "base64-node-fallback" ? "base64-node-test-fallback" : record.encoding,
    value: record.value,
  });
}

async function readSecretRecord(path: string): Promise<SecretReferenceRecord | undefined> {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<SecretReferenceRecord>;
  if (parsed.schemaVersion !== secretRecordSchemaVersion) throw new Error("Unsupported Ambient secret reference record.");
  if (
    parsed.scope !== "ambient-cli" &&
    parsed.scope !== "capability-builder" &&
    parsed.scope !== "mcp-server" &&
    parsed.scope !== "model-provider" &&
    parsed.scope !== "named-secret"
  ) {
    throw new Error("Ambient secret reference scope is invalid.");
  }
  if (!parsed.workspaceHash || !parsed.ownerHash || !parsed.envName || !parsed.encoding || !parsed.value || !parsed.createdAt || !parsed.updatedAt) {
    throw new Error("Ambient secret reference record is incomplete.");
  }
  if (parsed.encoding !== "electron-safe-storage" && parsed.encoding !== "base64-node-fallback" && parsed.encoding !== "base64-node-test-fallback") {
    throw new Error("Ambient secret reference encoding is unsupported.");
  }
  return {
    schemaVersion: secretRecordSchemaVersion,
    scope: parsed.scope,
    workspaceHash: parsed.workspaceHash,
    ownerHash: parsed.ownerHash,
    envName: normalizeEnvName(parsed.envName),
    encoding: parsed.encoding,
    value: parsed.value,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

function secretReferencePath(secretRef: string): string {
  const id = secretRef.slice(secretReferencePrefix.length);
  return join(secretReferenceStoreRoot(), "v1", id.slice(0, 2), `${id}.json`);
}

function secretReferenceStoreRoot(): string {
  const override = process.env[storeRootEnvName]?.trim();
  if (override) return resolve(override);
  const electron = electronRuntime();
  if (typeof electron.app?.getPath === "function") return join(electron.app.getPath("userData"), "secret-references");
  return join(tmpdir(), "ambient-secret-references");
}

function secretStore() {
  const appAvailable = electronAppAvailable();
  return electronSecureSecretStore({
    appAvailable,
    allowBase64NodeFallback: !appAvailable,
  });
}

function electronRuntime(): ElectronRuntime {
  try {
    const loaded = require("electron");
    return loaded && typeof loaded === "object" ? loaded as ElectronRuntime : {};
  } catch {
    return {};
  }
}

function normalizeEnvName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid env name: ${value}`);
  return name;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
