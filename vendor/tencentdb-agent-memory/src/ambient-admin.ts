import fs from "node:fs/promises";
import path from "node:path";
import type { TdaiCore } from "./core/tdai-core.js";
import type { Logger } from "./core/types.js";
import { queryMemoryRecords } from "./core/record/l1-reader.js";
import { writeMemory, type MemoryRecord, type MemoryType } from "./core/record/l1-writer.js";
import { listLocalProfiles, syncLocalProfilesToStore, type ProfileBaseline } from "./core/profile/profile-sync.js";
import { syncSceneIndex } from "./core/scene/scene-index.js";
import type { IMemoryStore, L0QueryRow, ProfileRecord } from "./core/store/types.js";

export type AmbientMemoryAdminLayer = "l1" | "l0" | "l2" | "l3";

export interface AmbientMemoryAdminRow {
  id: string;
  layer: AmbientMemoryAdminLayer;
  content: string;
  preview: string;
  type?: string;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  role?: string;
  filename?: string;
  updatedAt?: string;
  source: "tencentdb";
}

export interface AmbientMemoryAdminInspectInput {
  layer?: AmbientMemoryAdminLayer | "all";
  query?: string;
  limit?: number;
  sessionKey?: string;
  sessionId?: string;
}

export interface AmbientMemoryAdminInspectResult {
  rows: AmbientMemoryAdminRow[];
  total: number;
  truncated: boolean;
}

export interface AmbientMemoryAdminUpdateInput {
  layer: "l1" | "l2" | "l3";
  id: string;
  content: string;
  type?: MemoryType;
  priority?: number;
  sceneName?: string;
  sessionKey?: string;
  sessionId?: string;
  filename?: string;
}

export interface AmbientMemoryAdminDeleteInput {
  layer: AmbientMemoryAdminLayer;
  ids: string[];
}

export interface AmbientMemoryAdminService {
  inspect(input?: AmbientMemoryAdminInspectInput): Promise<AmbientMemoryAdminInspectResult>;
  update(input: AmbientMemoryAdminUpdateInput): Promise<AmbientMemoryAdminRow>;
  delete(input: AmbientMemoryAdminDeleteInput): Promise<{ deleted: string[]; failed: string[] }>;
}

export interface CreateMemoryAdminServiceInput {
  core: TdaiCore;
  dataDir: string;
  logger?: Logger;
}

export function createMemoryAdminService(input: CreateMemoryAdminServiceInput): AmbientMemoryAdminService {
  return new TencentMemoryAdminService(input);
}

class TencentMemoryAdminService implements AmbientMemoryAdminService {
  constructor(private readonly input: CreateMemoryAdminServiceInput) {}

  async inspect(input: AmbientMemoryAdminInspectInput = {}): Promise<AmbientMemoryAdminInspectResult> {
    const limit = clampLimit(input.limit);
    const layers = input.layer && input.layer !== "all" ? [input.layer] : ["l1", "l0", "l2", "l3"] as const;
    const rows: AmbientMemoryAdminRow[] = [];
    for (const layer of layers) {
      if (layer === "l1") rows.push(...await this.listL1(input));
      if (layer === "l0") rows.push(...await this.listL0(input));
      if (layer === "l2" || layer === "l3") rows.push(...await this.listProfiles(layer, input));
    }
    const filtered = filterRows(rows, input.query)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return {
      rows: filtered.slice(0, limit),
      total: filtered.length,
      truncated: filtered.length > limit,
    };
  }

  async update(input: AmbientMemoryAdminUpdateInput): Promise<AmbientMemoryAdminRow> {
    if (input.layer === "l1") return this.updateL1(input);
    return this.updateProfile(input as AmbientMemoryAdminUpdateInput & { layer: "l2" | "l3" });
  }

  async delete(input: AmbientMemoryAdminDeleteInput): Promise<{ deleted: string[]; failed: string[] }> {
    const ids = uniqueStrings(input.ids);
    if (!ids.length) return { deleted: [], failed: [] };
    if (input.layer === "l1") return this.deleteWith((store, id) => store.deleteL1(id), ids);
    if (input.layer === "l0") return this.deleteWith((store, id) => store.deleteL0(id), ids);
    return this.deleteProfiles(input.layer, ids);
  }

  private store(): IMemoryStore | undefined {
    return this.input.core.getVectorStore();
  }

  private async listL1(input: AmbientMemoryAdminInspectInput): Promise<AmbientMemoryAdminRow[]> {
    const records = await queryMemoryRecords(this.store(), {
      sessionKey: input.sessionKey,
      sessionId: input.sessionId,
    }, this.input.logger);
    return records.map(l1Row);
  }

  private async listL0(input: AmbientMemoryAdminInspectInput): Promise<AmbientMemoryAdminRow[]> {
    const store = this.store();
    if (!store) return [];
    if (input.sessionKey) {
      const records = await store.queryL0ForL1(input.sessionKey, undefined, clampLimit(input.limit));
      return records.map(l0QueryRow);
    }
    const records = await store.getAllL0Texts();
    return records.map((record) => ({
      id: record.record_id,
      layer: "l0" as const,
      content: record.message_text,
      preview: preview(record.message_text),
      updatedAt: record.recorded_at,
      source: "tencentdb" as const,
    }));
  }

  private async listProfiles(
    layer: "l2" | "l3",
    input: AmbientMemoryAdminInspectInput,
  ): Promise<AmbientMemoryAdminRow[]> {
    const profiles = await listLocalProfiles(this.input.dataDir);
    return profiles
      .filter((profile) => profile.type === layer)
      .map(profileRow);
  }

  private async updateL1(input: AmbientMemoryAdminUpdateInput): Promise<AmbientMemoryAdminRow> {
    const store = this.store();
    if (!store) throw new Error("TencentDB memory store is unavailable.");
    const existing = (await queryMemoryRecords(store, { sessionKey: input.sessionKey }, this.input.logger))
      .find((record) => record.id === input.id);
    if (!existing) throw new Error(`TencentDB L1 memory ${input.id} was not found.`);
    const now = new Date().toISOString();
    const type = input.type ?? existing.type ?? "episodic";
    const priority = input.priority ?? existing.priority ?? 50;
    const sceneName = input.sceneName ?? existing.scene_name ?? "";
    const sessionKey = input.sessionKey ?? existing.sessionKey ?? "";
    const sessionId = input.sessionId ?? existing.sessionId ?? "";
    const record = await writeMemory({
      memory: {
        content: input.content,
        type,
        priority,
        scene_name: sceneName,
        source_message_ids: existing.source_message_ids ?? [],
        metadata: existing.metadata ?? {},
      },
      decision: {
        action: "update",
        record_id: input.id,
        target_ids: [input.id],
        merged_content: input.content,
        merged_type: type,
        merged_priority: priority,
        merged_timestamps: [...(existing.timestamps ?? []), now],
      },
      baseDir: this.input.dataDir,
      sessionKey,
      sessionId,
      logger: this.input.logger,
      vectorStore: store,
      embeddingService: this.input.core.getEmbeddingService(),
    });
    if (!record) throw new Error("TencentDB memory update was skipped.");
    return l1Row(record);
  }

  private async updateProfile(input: AmbientMemoryAdminUpdateInput & { layer: "l2" | "l3" }): Promise<AmbientMemoryAdminRow> {
    const existingProfiles = await listLocalProfiles(this.input.dataDir);
    const existing = existingProfiles.find((profile) => profile.id === input.id && profile.type === input.layer);
    if (!existing) throw new Error(`TencentDB ${input.layer.toUpperCase()} profile ${input.id} was not found.`);
    const filename = safeProfileFilename(input.filename ?? existing?.filename ?? input.id, input.layer);
    const before = await profileBaseline(this.input.dataDir);
    const filePath = input.layer === "l2"
      ? path.join(this.input.dataDir, "scene_blocks", filename)
      : path.join(this.input.dataDir, "persona.md");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${input.content.trim()}\n`, "utf-8");
    if (input.layer === "l2") await syncSceneIndex(this.input.dataDir);
    const store = this.store();
    if (store?.syncProfiles) {
      await syncLocalProfilesToStore(this.input.dataDir, store, before, this.input.logger ?? noopLogger);
    }
    const profiles = await listLocalProfiles(this.input.dataDir);
    const row = profiles.find((profile) => profile.filename === filename && profile.type === input.layer)
      ?? profiles.find((profile) => profile.id === input.id && profile.type === input.layer);
    if (!row) throw new Error("TencentDB profile update did not produce a readable profile.");
    return profileRow(row);
  }

  private async deleteWith(
    deleter: (store: IMemoryStore, id: string) => boolean | Promise<boolean>,
    ids: string[],
  ): Promise<{ deleted: string[]; failed: string[] }> {
    const store = this.store();
    if (!store) return { deleted: [], failed: ids };
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      if (await deleter(store, id)) deleted.push(id);
      else failed.push(id);
    }
    return { deleted, failed };
  }

  private async deleteProfiles(
    layer: "l2" | "l3",
    ids: string[],
  ): Promise<{ deleted: string[]; failed: string[] }> {
    const before = await profileBaseline(this.input.dataDir);
    const profiles = await listLocalProfiles(this.input.dataDir);
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      const profile = profiles.find((candidate) => candidate.id === id || candidate.filename === id);
      if (!profile || profile.type !== layer) {
        failed.push(id);
        continue;
      }
      const filePath = layer === "l2"
        ? path.join(this.input.dataDir, "scene_blocks", profile.filename)
        : path.join(this.input.dataDir, "persona.md");
      await fs.rm(filePath, { force: true });
      deleted.push(id);
    }
    if (layer === "l2") await syncSceneIndex(this.input.dataDir);
    const store = this.store();
    if (store?.syncProfiles || store?.deleteProfiles) {
      await syncLocalProfilesToStore(this.input.dataDir, store, before, this.input.logger ?? noopLogger);
    }
    return { deleted, failed };
  }
}

function l1Row(record: MemoryRecord): AmbientMemoryAdminRow {
  return {
    id: record.id,
    layer: "l1",
    content: record.content,
    preview: preview(record.content),
    type: record.type,
    priority: record.priority,
    sceneName: record.scene_name,
    sessionKey: record.sessionKey,
    sessionId: record.sessionId,
    updatedAt: record.updatedAt,
    source: "tencentdb",
  };
}

function l0QueryRow(record: L0QueryRow): AmbientMemoryAdminRow {
  return {
    id: record.record_id,
    layer: "l0",
    content: record.message_text,
    preview: preview(record.message_text),
    sessionKey: record.session_key,
    sessionId: record.session_id,
    role: record.role,
    updatedAt: record.recorded_at,
    source: "tencentdb",
  };
}

function profileRow(profile: ProfileRecord): AmbientMemoryAdminRow {
  return {
    id: profile.id,
    layer: profile.type,
    content: profile.content,
    preview: preview(profile.content),
    filename: profile.filename,
    updatedAt: new Date(profile.updatedAtMs).toISOString(),
    source: "tencentdb",
  };
}

async function profileBaseline(dataDir: string): Promise<Map<string, ProfileBaseline>> {
  const profiles = await listLocalProfiles(dataDir);
  return new Map(profiles.map((profile) => [profile.id, {
    version: profile.version,
    contentMd5: profile.contentMd5,
    createdAtMs: profile.createdAtMs,
  }]));
}

function filterRows(rows: AmbientMemoryAdminRow[], query: string | undefined): AmbientMemoryAdminRow[] {
  const needle = query?.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => (
    row.content.toLowerCase().includes(needle)
    || row.id.toLowerCase().includes(needle)
    || row.filename?.toLowerCase().includes(needle)
    || row.sceneName?.toLowerCase().includes(needle)
  ));
}

function preview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(limit ?? 20)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function safeProfileFilename(input: string, layer: "l2" | "l3"): string {
  if (layer === "l3") return "persona.md";
  const base = path.basename(input || "scene.md");
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return clean.endsWith(".md") ? clean : `${clean}.md`;
}

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
