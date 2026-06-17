import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "./projectStore/projectStore";

describe("artifact draft project store", () => {
  it("creates a durable workspace draft layout and reloads it after reopening the store", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-artifact-drafts-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const draft = await store.createArtifactDraft({
        id: "draft_test_1",
        targetPath: "reports/launch.md",
        kind: "markdown",
        assembly: "whole",
        origin: "explicit_draft",
        sourceRunId: "run-1",
        createdAt: "2026-05-21T00:00:00.000Z",
      });

      expect(draft).toMatchObject({
        draftId: "draft_test_1",
        targetPath: "reports/launch.md",
        kind: "markdown",
        assembly: "whole",
        state: "created",
        origin: "explicit_draft",
        sourceRunId: "run-1",
        eventCount: 1,
      });
      expect(draft.paths.rootPath).toBe(join(workspacePath, ".ambient", "artifact-drafts", "draft_test_1"));
      expect((await stat(draft.paths.rootPath)).isDirectory()).toBe(true);

      const manifest = JSON.parse(await readFile(draft.paths.manifestPath, "utf8"));
      expect(manifest).toMatchObject({
        draftId: "draft_test_1",
        targetPath: "reports/launch.md",
        kind: "markdown",
        assembly: "whole",
        state: "created",
        origin: "explicit_draft",
      });
      expect(await readFile(draft.paths.eventsPath, "utf8")).toContain("\"eventType\":\"created\"");

      store.close();
      const reopened = new ProjectStore();
      try {
        reopened.openWorkspace(workspacePath);
        expect(reopened.listArtifactDrafts()).toEqual([
          expect.objectContaining({
            draftId: "draft_test_1",
            targetPath: "reports/launch.md",
            eventCount: 1,
          }),
        ]);
        await expect(reopened.readArtifactDraftManifest("draft_test_1")).resolves.toMatchObject({ draftId: "draft_test_1" });
      } finally {
        reopened.close();
      }
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("records terminal retention metadata and lifecycle events for committed and aborted drafts", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-artifact-draft-retention-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const committed = await store.createArtifactDraft({
        id: "draft_committed",
        targetPath: "reports/final.md",
        kind: "document",
        assembly: "sectioned",
        origin: "explicit_draft",
        createdAt: "2026-05-21T00:00:00.000Z",
      });
      const aborted = await store.createArtifactDraft({
        id: "draft_aborted",
        targetPath: "scratch/partial.json",
        kind: "json",
        assembly: "chunked",
        origin: "oversize_write_recovery",
        createdAt: "2026-05-21T00:00:00.000Z",
      });

      const committedResult = await store.updateArtifactDraftState({
        draftId: committed.draftId,
        state: "committed",
        updatedAt: "2026-05-21T01:00:00.000Z",
      });
      const abortedResult = await store.updateArtifactDraftState({
        draftId: aborted.draftId,
        state: "aborted",
        updatedAt: "2026-05-21T02:00:00.000Z",
      });

      expect(committedResult.retention).toMatchObject({
        policy: "committed",
        retainUntil: "2026-05-28T01:00:00.000Z",
      });
      expect(abortedResult.retention).toMatchObject({
        policy: "aborted",
        retainUntil: "2026-05-22T02:00:00.000Z",
      });
      expect(store.listArtifactDraftEvents(committed.draftId).map((event) => event.eventType)).toEqual(["created", "state_committed"]);
      expect(store.listArtifactDraftEvents(aborted.draftId).map((event) => event.eventType)).toEqual(["created", "state_aborted"]);
      await expect(store.readArtifactDraftManifest(committed.draftId)).resolves.toMatchObject({
        state: "committed",
        retention: { policy: "committed" },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("prunes expired committed and aborted draft records and files", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-artifact-draft-prune-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const draft = await store.createArtifactDraft({
        id: "draft_expired",
        targetPath: "reports/old.md",
        kind: "markdown",
        assembly: "whole",
        origin: "explicit_draft",
      });
      await store.updateArtifactDraftState({
        draftId: draft.draftId,
        state: "aborted",
        retention: {
          policy: "aborted",
          retainUntil: "2026-05-20T00:00:00.000Z",
          reason: "test expiry",
        },
      });

      await expect(stat(draft.paths.rootPath)).resolves.toBeTruthy();
      await expect(store.pruneExpiredArtifactDrafts("2026-05-21T00:00:00.000Z")).resolves.toEqual({
        removedDraftIds: [draft.draftId],
      });
      expect(store.getArtifactDraft(draft.draftId)).toBeUndefined();
      await expect(stat(draft.paths.rootPath)).rejects.toThrow();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects draft target paths outside the workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-artifact-draft-paths-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      await expect(
        store.createArtifactDraft({
          targetPath: "../outside.md",
          kind: "markdown",
          assembly: "whole",
          origin: "explicit_draft",
        }),
      ).rejects.toThrow("targetPath must stay inside");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
