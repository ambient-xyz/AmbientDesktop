import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonWorkflowCheckpointStore, readWorkflowCheckpointSummaries } from "./workflowCheckpointStore";

describe("JsonWorkflowCheckpointStore", () => {
  let workspacePath = "";
  let statePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-checkpoints-"));
    statePath = join(workspacePath, "state.json");
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists checkpoint values to a debuggable JSON state file", async () => {
    const store = new JsonWorkflowCheckpointStore(statePath, { runId: "run-1" });

    await store.set("cursor", { page: 2 });
    await store.set("summary", "ready");

    await expect(store.get("cursor")).resolves.toEqual({ page: 2 });
    await expect(store.snapshot()).resolves.toEqual({ cursor: { page: 2 }, summary: "ready" });
    const raw = JSON.parse(await readFile(statePath, "utf8"));
    expect(raw).toMatchObject({
      version: 1,
      checkpoints: {
        cursor: { value: { page: 2 }, runId: "run-1" },
        summary: { value: "ready", runId: "run-1" },
      },
    });
    expect(readWorkflowCheckpointSummaries(statePath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "summary", runId: "run-1", valuePreview: '"ready"' }),
        expect.objectContaining({ key: "cursor", runId: "run-1", valuePreview: '{"page":2}' }),
      ]),
    );
    expect(readWorkflowCheckpointSummaries(statePath)).toHaveLength(2);
  });

  it("serializes concurrent checkpoint writes without dropping keys", async () => {
    const store = new JsonWorkflowCheckpointStore(statePath);

    await Promise.all(Array.from({ length: 5 }, (_item, index) => store.set(`item-${index}`, index)));

    await expect(store.snapshot()).resolves.toEqual({
      "item-0": 0,
      "item-1": 1,
      "item-2": 2,
      "item-3": 3,
      "item-4": 4,
    });
  });

  it("returns an empty checkpoint list for missing or invalid state files", async () => {
    expect(readWorkflowCheckpointSummaries(join(workspacePath, "missing.json"))).toEqual([]);
    await storeInvalidState(statePath);
    expect(readWorkflowCheckpointSummaries(statePath)).toEqual([]);
  });
});

async function storeInvalidState(path: string): Promise<void> {
  await writeFile(path, "{", "utf8");
}
