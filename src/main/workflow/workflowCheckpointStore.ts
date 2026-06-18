import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { WorkflowCheckpointSummary } from "../../shared/workflowTypes";
import type { WorkflowCheckpointStore } from "./workflowAgentRuntime";

interface WorkflowCheckpointRecord {
  value: unknown;
  updatedAt: string;
  runId?: string;
}

interface WorkflowCheckpointFile {
  version: 1;
  updatedAt?: string;
  checkpoints: Record<string, WorkflowCheckpointRecord>;
}

export interface JsonWorkflowCheckpointStoreOptions {
  runId?: string;
}

export class JsonWorkflowCheckpointStore implements WorkflowCheckpointStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly options: JsonWorkflowCheckpointStoreOptions = {},
  ) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    await this.writeChain;
    const state = await this.readState();
    return state.checkpoints[key]?.value as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const write = this.writeChain.then(async () => {
      const state = await this.readState();
      const now = new Date().toISOString();
      state.updatedAt = now;
      state.checkpoints[key] = {
        value,
        updatedAt: now,
        runId: this.options.runId,
      };
      await this.writeState(state);
    });
    this.writeChain = write.catch(() => undefined);
    await write;
  }

  async snapshot(): Promise<Record<string, unknown>> {
    await this.writeChain;
    const state = await this.readState();
    return Object.fromEntries(Object.entries(state.checkpoints).map(([key, record]) => [key, record.value]));
  }

  private async readState(): Promise<WorkflowCheckpointFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WorkflowCheckpointFile>;
      return {
        version: 1,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        checkpoints: parsed.checkpoints && typeof parsed.checkpoints === "object" ? parsed.checkpoints : {},
      };
    } catch (error) {
      if (isNotFound(error)) return { version: 1, checkpoints: {} };
      throw error;
    }
  }

  private async writeState(state: WorkflowCheckpointFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

export function readWorkflowCheckpointSummaries(filePath: string): WorkflowCheckpointSummary[] {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkflowCheckpointFile>;
    const checkpoints = parsed.checkpoints && typeof parsed.checkpoints === "object" ? parsed.checkpoints : {};
    return Object.entries(checkpoints)
      .map(([key, record]) => ({
        key,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
        runId: typeof record.runId === "string" ? record.runId : undefined,
        valuePreview: summarizeCheckpointValue(record.value),
      }))
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.key.localeCompare(right.key));
  } catch (error) {
    if (isNotFound(error) || error instanceof SyntaxError) return [];
    throw error;
  }
}

function summarizeCheckpointValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return "undefined";
    return json.length <= 220 ? json : `${json.slice(0, 217)}...`;
  } catch {
    return String(value);
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
