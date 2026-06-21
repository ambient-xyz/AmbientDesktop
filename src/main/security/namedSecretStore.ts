import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
  BrokerNamedSecretUseInput,
  BrokerNamedSecretUseResult,
  DeleteNamedSecretInput,
  NamedSecretKind,
  NamedSecretMetadataExport,
  NamedSecretScope,
  NamedSecretSummary,
  SaveNamedSecretInput,
  UpdateNamedSecretInput,
} from "../../shared/namedSecretTypes";
import { registerSecretRedaction } from "./secretRedaction";
import { readSecretReference, removeSecretReference, saveSecretReference } from "./secretReferenceStore";

const namedSecretStoreVersion = 1;
const namedSecretValueEnvName = "AMBIENT_NAMED_SECRET_VALUE";

interface NamedSecretRecord extends NamedSecretSummary {
  secretRef: string;
  secretOwnerId: string;
  workspacePath: string;
}

interface NamedSecretFile {
  version: typeof namedSecretStoreVersion;
  secrets: NamedSecretRecord[];
}

export interface NamedSecretStoreOptions {
  filePath: string;
  currentWorkspacePath(): string;
  globalWorkspacePath?: string;
  now?: () => Date;
  saveSecretReferenceImpl?: typeof saveSecretReference;
  readSecretReferenceImpl?: typeof readSecretReference;
  removeSecretReferenceImpl?: typeof removeSecretReference;
}

export class NamedSecretStore {
  private readonly now: () => Date;
  private readonly saveSecretReferenceImpl: typeof saveSecretReference;
  private readonly readSecretReferenceImpl: typeof readSecretReference;
  private readonly removeSecretReferenceImpl: typeof removeSecretReference;

  constructor(private readonly options: NamedSecretStoreOptions) {
    this.now = options.now ?? (() => new Date());
    this.saveSecretReferenceImpl = options.saveSecretReferenceImpl ?? saveSecretReference;
    this.readSecretReferenceImpl = options.readSecretReferenceImpl ?? readSecretReference;
    this.removeSecretReferenceImpl = options.removeSecretReferenceImpl ?? removeSecretReference;
  }

  list(): NamedSecretSummary[] {
    return this.visibleRecords().map(publicSummary);
  }

  async save(input: SaveNamedSecretInput): Promise<NamedSecretSummary[]> {
    const id = randomUUID();
    const normalized = normalizeSaveInput(input);
    const now = this.now().toISOString();
    const workspacePath = this.workspacePathForScope(normalized.scope);
    const secretOwnerId = namedSecretOwnerId(id);
    const secretRef = await this.saveSecretReferenceImpl({
      scope: "named-secret",
      workspacePath,
      ownerId: secretOwnerId,
      envName: namedSecretValueEnvName,
      value: normalized.value,
    });
    const file = this.readFile();
    const record: NamedSecretRecord = {
      id,
      label: normalized.label,
      kind: normalized.kind,
      scope: normalized.scope,
      owner: ownerLabel(normalized.scope, workspacePath),
      configured: true,
      createdAt: now,
      updatedAt: now,
      ...(normalized.notes ? { notes: normalized.notes } : {}),
      secretRef,
      secretOwnerId,
      workspacePath,
    };
    this.writeFile({ version: namedSecretStoreVersion, secrets: [...file.secrets, record] });
    registerSecretRedaction(normalized.value);
    return this.list();
  }

  async update(input: UpdateNamedSecretInput): Promise<NamedSecretSummary[]> {
    const id = normalizeId(input.id);
    const file = this.readFile();
    const existing = file.secrets.find((secret) => secret.id === id);
    if (!existing || !this.isVisible(existing)) throw new Error(`Named secret was not found: ${id}`);

    const nextScope = normalizeScope(input.scope ?? existing.scope);
    const nextWorkspacePath = this.workspacePathForScope(nextScope);
    const needsSecretRewrite = input.value !== undefined || nextScope !== existing.scope || nextWorkspacePath !== existing.workspacePath;
    let nextSecretRef = existing.secretRef;
    let nextSecretOwnerId = existing.secretOwnerId;
    if (needsSecretRewrite) {
      const value = input.value !== undefined ? normalizeSecretValue(input.value) : await this.requireSecretValue(existing);
      nextSecretOwnerId = namedSecretOwnerId(id);
      nextSecretRef = await this.saveSecretReferenceImpl({
        scope: "named-secret",
        workspacePath: nextWorkspacePath,
        ownerId: nextSecretOwnerId,
        envName: namedSecretValueEnvName,
        value,
      });
      if (nextSecretRef !== existing.secretRef) await this.removeSecretReferenceImpl(existing.secretRef);
      registerSecretRedaction(value);
    }

    const nextNotes = normalizeOptionalNotes(input.notes, existing.notes);
    const updated: NamedSecretRecord = {
      ...existing,
      label: input.label !== undefined ? normalizeLabel(input.label) : existing.label,
      kind: normalizeKind(input.kind ?? existing.kind),
      scope: nextScope,
      owner: ownerLabel(nextScope, nextWorkspacePath),
      configured: true,
      updatedAt: this.now().toISOString(),
      ...(nextNotes ? { notes: nextNotes } : { notes: undefined }),
      secretRef: nextSecretRef,
      secretOwnerId: nextSecretOwnerId,
      workspacePath: nextWorkspacePath,
    };
    this.writeFile({
      version: namedSecretStoreVersion,
      secrets: file.secrets.map((secret) => (secret.id === id ? updated : secret)),
    });
    return this.list();
  }

  async delete(input: DeleteNamedSecretInput): Promise<NamedSecretSummary[]> {
    const id = normalizeId(input.id);
    const file = this.readFile();
    const existing = file.secrets.find((secret) => secret.id === id);
    if (existing && !this.isVisible(existing)) throw new Error(`Named secret was not found: ${id}`);
    if (existing?.secretRef) await this.removeSecretReferenceImpl(existing.secretRef);
    this.writeFile({
      version: namedSecretStoreVersion,
      secrets: file.secrets.filter((secret) => secret.id !== id),
    });
    return this.list();
  }

  async brokerToLocalFixture(input: BrokerNamedSecretUseInput): Promise<BrokerNamedSecretUseResult> {
    const id = normalizeId(input.id);
    const purpose = input.purpose.trim();
    if (!purpose) throw new Error("Named secret use requires a purpose.");
    if (input.target !== "local-fixture") throw new Error("Unsupported named secret broker target.");
    const file = this.readFile();
    const existing = file.secrets.find((secret) => secret.id === id);
    if (!existing || !this.isVisible(existing)) throw new Error(`Named secret was not found: ${id}`);
    const value = await this.requireSecretValue(existing);
    registerSecretRedaction(value);
    const usedAt = this.now().toISOString();
    this.writeFile({
      version: namedSecretStoreVersion,
      secrets: file.secrets.map((secret) => (secret.id === id ? { ...secret, lastUsedAt: usedAt, updatedAt: usedAt } : secret)),
    });
    return {
      schemaVersion: "ambient-named-secret-broker-result-v1",
      id: existing.id,
      label: existing.label,
      scope: existing.scope,
      target: "local-fixture",
      purpose,
      approved: true,
      delivered: true,
      redactedEvidence: `Local fixture received named secret ${existing.id} for ${purpose}; value was redacted before returning.`,
      usedAt,
    };
  }

  exportMetadata(now = this.now()): NamedSecretMetadataExport {
    return {
      schemaVersion: "ambient-named-secret-metadata-export-v1",
      exportedAt: now.toISOString(),
      secrets: this.visibleRecords().map((secret) => ({
        id: secret.id,
        label: secret.label,
        kind: secret.kind,
        scope: secret.scope,
        owner: secret.owner,
        ...(secret.notes ? { notes: secret.notes } : {}),
        reason: "secret-value-not-exported",
      })),
    };
  }

  private visibleRecords(): NamedSecretRecord[] {
    return this.readFile().secrets.filter((secret) => this.isVisible(secret));
  }

  private isVisible(secret: NamedSecretRecord): boolean {
    return secret.scope === "global" || resolve(secret.workspacePath) === resolve(this.options.currentWorkspacePath());
  }

  private async requireSecretValue(secret: NamedSecretRecord): Promise<string> {
    const value = await this.readSecretReferenceImpl(secret.secretRef);
    if (!value) throw new Error(`Named secret value is unavailable: ${secret.id}`);
    return value;
  }

  private workspacePathForScope(scope: NamedSecretScope): string {
    return scope === "global"
      ? (this.options.globalWorkspacePath ?? join(dirname(this.options.filePath), "global-scope"))
      : this.options.currentWorkspacePath();
  }

  private readFile(): NamedSecretFile {
    if (!existsSync(this.options.filePath)) return { version: namedSecretStoreVersion, secrets: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.options.filePath, "utf8")) as Partial<NamedSecretFile>;
      if (parsed.version !== namedSecretStoreVersion || !Array.isArray(parsed.secrets)) return { version: namedSecretStoreVersion, secrets: [] };
      return {
        version: namedSecretStoreVersion,
        secrets: parsed.secrets.map(normalizeRecord).filter(BooleanRecord),
      };
    } catch {
      return { version: namedSecretStoreVersion, secrets: [] };
    }
  }

  private writeFile(file: NamedSecretFile): void {
    mkdirSync(dirname(this.options.filePath), { recursive: true, mode: 0o700 });
    const tempPath = `${this.options.filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, this.options.filePath);
    void chmod(this.options.filePath, 0o600).catch(() => undefined);
  }
}

function normalizeSaveInput(input: SaveNamedSecretInput): Required<Pick<SaveNamedSecretInput, "label" | "value">> & {
  kind: NamedSecretKind;
  scope: NamedSecretScope;
  notes?: string;
} {
  return {
    label: normalizeLabel(input.label),
    value: normalizeSecretValue(input.value),
    kind: normalizeKind(input.kind),
    scope: normalizeScope(input.scope),
    ...(normalizeNotes(input.notes) ? { notes: normalizeNotes(input.notes) } : {}),
  };
}

function normalizeRecord(input: unknown): NamedSecretRecord | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Partial<NamedSecretRecord>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.secretRef !== "string" ||
    typeof record.secretOwnerId !== "string" ||
    typeof record.workspacePath !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }
  return {
    id: record.id,
    label: record.label,
    kind: normalizeKind(record.kind),
    scope: normalizeScope(record.scope),
    owner: typeof record.owner === "string" && record.owner.trim() ? record.owner.trim() : ownerLabel(normalizeScope(record.scope), record.workspacePath),
    configured: record.configured !== false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(typeof record.notes === "string" && record.notes.trim() ? { notes: normalizeNotes(record.notes) } : {}),
    ...(typeof record.lastUsedAt === "string" ? { lastUsedAt: record.lastUsedAt } : {}),
    secretRef: record.secretRef,
    secretOwnerId: record.secretOwnerId,
    workspacePath: record.workspacePath,
  };
}

function normalizeId(value: string): string {
  const id = value.trim();
  if (!id) throw new Error("Named secret id is required.");
  return id;
}

function normalizeLabel(value: string): string {
  const label = value.trim();
  if (!label) throw new Error("Named secret label is required.");
  return label.slice(0, 120);
}

function normalizeSecretValue(value: string): string {
  if (value.length === 0) throw new Error("Named secret value is required.");
  return value;
}

function normalizeKind(value: NamedSecretKind | undefined): NamedSecretKind {
  return value === "api-key" || value === "token" || value === "password" || value === "login" || value === "ssh-password"
    ? value
    : "generic";
}

function normalizeScope(value: NamedSecretScope | undefined): NamedSecretScope {
  return value === "global" ? "global" : "workspace";
}

function normalizeNotes(value: string | undefined): string | undefined {
  const notes = value?.trim();
  return notes ? notes.slice(0, 500) : undefined;
}

function normalizeOptionalNotes(value: string | undefined, fallback: string | undefined): string | undefined {
  return value === undefined ? fallback : normalizeNotes(value);
}

function namedSecretOwnerId(id: string): string {
  return JSON.stringify({
    schemaVersion: "ambient-named-secret-owner-v1",
    id,
  });
}

function ownerLabel(scope: NamedSecretScope, workspacePath: string): string {
  return scope === "global" ? "Global" : workspacePath;
}

function publicSummary(record: NamedSecretRecord): NamedSecretSummary {
  return {
    id: record.id,
    label: record.label,
    kind: record.kind,
    scope: record.scope,
    owner: record.owner,
    configured: record.configured,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.notes ? { notes: record.notes } : {}),
    ...(record.lastUsedAt ? { lastUsedAt: record.lastUsedAt } : {}),
  };
}

function BooleanRecord(record: NamedSecretRecord | undefined): record is NamedSecretRecord {
  return Boolean(record);
}

export function namedSecretFixtureDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function defaultNamedSecretStoreFilePath(userDataPath: string): string {
  return join(userDataPath, "named-secrets", "metadata.json");
}
