import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BrowserCredentialScope, BrowserCredentialSummary, BrowserLoginCredential, SaveBrowserCredentialInput } from "../../shared/browserTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";

export interface BrowserCredentialSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface BrowserCredentialRecord extends BrowserCredentialSummary {
  encryptedPayload?: string;
  encryptedPassword?: string;
}

interface BrowserCredentialPayload {
  id: string;
  label: string;
  origin: string;
  username: string;
  scope: BrowserCredentialScope;
  password: string;
}

interface BrowserCredentialFile {
  version: 2;
  credentials: BrowserCredentialRecord[];
}

const STORE_VERSION = 2;

type NormalizedBrowserCredentialInput = Omit<Required<SaveBrowserCredentialInput>, "id"> & { id?: string };

export class BrowserCredentialStore {
  constructor(
    private readonly getWorkspace: () => WorkspaceState,
    private readonly safeStorage: BrowserCredentialSafeStorage,
  ) {}

  list(): BrowserCredentialSummary[] {
    return this.readFile().credentials.map(redactCredentialRecord);
  }

  get(id: string): BrowserCredentialSummary | undefined {
    const record = this.readFile().credentials.find((credential) => credential.id === id);
    return record ? redactCredentialRecord(record) : undefined;
  }

  save(input: SaveBrowserCredentialInput): BrowserCredentialSummary[] {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("Secure credential storage is not available on this system.");
    }
    const normalized = normalizeCredentialInput(input);
    const now = new Date().toISOString();
    const current = this.readFile();
    const existing = normalized.id ? current.credentials.find((credential) => credential.id === normalized.id) : undefined;
    const id = existing?.id ?? normalized.id ?? randomUUID();
    const encryptedPayload = this.safeStorage.encryptString(JSON.stringify({
      id,
      label: normalized.label,
      origin: normalized.origin,
      username: normalized.username,
      scope: normalized.scope,
      password: normalized.password,
    } satisfies BrowserCredentialPayload)).toString("base64");
    const nextRecord: BrowserCredentialRecord = {
      id,
      label: normalized.label,
      origin: normalized.origin,
      username: normalized.username,
      scope: normalized.scope,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
      encryptedPayload,
    };
    const next = {
      version: STORE_VERSION,
      credentials: existing
        ? current.credentials.map((credential) => (credential.id === existing.id ? nextRecord : credential))
        : [...current.credentials, nextRecord],
    } satisfies BrowserCredentialFile;
    this.writeFile(next);
    return next.credentials.map(redactCredentialRecord);
  }

  delete(id: string): BrowserCredentialSummary[] {
    const current = this.readFile();
    const next = {
      version: STORE_VERSION,
      credentials: current.credentials.filter((credential) => credential.id !== id),
    } satisfies BrowserCredentialFile;
    this.writeFile(next);
    return next.credentials.map(redactCredentialRecord);
  }

  resolve(id: string): BrowserLoginCredential {
    const record = this.readFile().credentials.find((credential) => credential.id === id);
    if (!record) throw new Error(`Stored browser credential was not found: ${id}`);
    const payload = decryptCredentialPayload(record, this.safeStorage);
    assertCredentialPayloadMatchesRecord(record, payload);
    return {
      id: record.id,
      label: record.label,
      origin: record.origin,
      username: record.username,
      password: payload.password,
    };
  }

  markUsed(id: string): BrowserCredentialSummary[] {
    const current = this.readFile();
    const now = new Date().toISOString();
    const next = {
      version: STORE_VERSION,
      credentials: current.credentials.map((credential) =>
        credential.id === id ? { ...credential, lastUsedAt: now, updatedAt: now } : credential,
      ),
    } satisfies BrowserCredentialFile;
    this.writeFile(next);
    return next.credentials.map(redactCredentialRecord);
  }

  private readFile(): BrowserCredentialFile {
    const path = this.filePath();
    if (!existsSync(path)) return { version: STORE_VERSION, credentials: [] };
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<BrowserCredentialFile>;
      const records = Array.isArray(parsed.credentials) ? parsed.credentials.map(normalizeRecord).filter(BooleanRecord) : [];
      return { version: STORE_VERSION, credentials: records };
    } catch {
      return { version: STORE_VERSION, credentials: [] };
    }
  }

  private writeFile(file: BrowserCredentialFile): void {
    const path = this.filePath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(file, null, 2), { mode: 0o600 });
  }

  private filePath(): string {
    return join(this.getWorkspace().statePath, "browser", "credentials.json");
  }
}

export function normalizeBrowserCredentialOrigin(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Credential origin is required.");
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Browser credential origin must use http or https.");
  }
  return url.origin;
}

function normalizeCredentialInput(input: SaveBrowserCredentialInput): NormalizedBrowserCredentialInput {
  const label = input.label.trim();
  const username = input.username.trim();
  const password = input.password;
  if (!label) throw new Error("Credential label is required.");
  if (!username) throw new Error("Credential username is required.");
  if (!password) throw new Error("Credential password is required.");
  return {
    ...(input.id?.trim() ? { id: input.id.trim() } : {}),
    label,
    origin: normalizeBrowserCredentialOrigin(input.origin),
    username,
    password,
    scope: normalizeScope(input.scope),
  };
}

function normalizeScope(scope: BrowserCredentialScope | undefined): BrowserCredentialScope {
  return scope === "global" ? "global" : "workspace";
}

function normalizeRecord(input: unknown): BrowserCredentialRecord | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Partial<BrowserCredentialRecord>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.origin !== "string" ||
    typeof record.username !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    (typeof record.encryptedPayload !== "string" && typeof record.encryptedPassword !== "string")
  ) {
    return undefined;
  }
  return {
    id: record.id,
    label: record.label,
    origin: record.origin,
    username: record.username,
    scope: normalizeScope(record.scope),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(typeof record.lastUsedAt === "string" ? { lastUsedAt: record.lastUsedAt } : {}),
    ...(typeof record.encryptedPayload === "string" ? { encryptedPayload: record.encryptedPayload } : {}),
    ...(typeof record.encryptedPassword === "string" ? { encryptedPassword: record.encryptedPassword } : {}),
  };
}

function redactCredentialRecord(record: BrowserCredentialRecord): BrowserCredentialSummary {
  return {
    id: record.id,
    label: record.label,
    origin: record.origin,
    username: record.username,
    scope: record.scope,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.lastUsedAt ? { lastUsedAt: record.lastUsedAt } : {}),
  };
}

function BooleanRecord(record: BrowserCredentialRecord | undefined): record is BrowserCredentialRecord {
  return Boolean(record);
}

function decryptCredentialPayload(record: BrowserCredentialRecord, safeStorage: BrowserCredentialSafeStorage): BrowserCredentialPayload {
  if (!record.encryptedPayload) {
    throw new Error("Stored browser credential is not integrity-bound. Re-save the credential before use.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(safeStorage.decryptString(Buffer.from(record.encryptedPayload, "base64")));
  } catch {
    throw new Error("Stored browser credential payload could not be decrypted.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored browser credential payload is invalid.");
  }
  const payload = parsed as Partial<BrowserCredentialPayload>;
  if (
    typeof payload.id !== "string" ||
    typeof payload.label !== "string" ||
    typeof payload.origin !== "string" ||
    typeof payload.username !== "string" ||
    (payload.scope !== "workspace" && payload.scope !== "global") ||
    typeof payload.password !== "string" ||
    !payload.password
  ) {
    throw new Error("Stored browser credential payload is incomplete.");
  }
  return {
    id: payload.id,
    label: payload.label,
    origin: payload.origin,
    username: payload.username,
    scope: payload.scope,
    password: payload.password,
  };
}

function assertCredentialPayloadMatchesRecord(record: BrowserCredentialRecord, payload: BrowserCredentialPayload): void {
  if (
    payload.id !== record.id ||
    payload.label !== record.label ||
    payload.origin !== record.origin ||
    payload.username !== record.username ||
    payload.scope !== record.scope
  ) {
    throw new Error("Stored browser credential metadata failed integrity validation.");
  }
}
