import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/types";
import { boardEventArtifactPath, serializeBoardArtifact, type BoardEventArtifact } from "./projectBoardArtifacts";
import { createProjectBoardClaimEvent } from "./projectBoardClaims";
import {
  applyProjectBoardGitProjection,
  claimProjectBoardGitCardArtifacts,
  commitProjectBoardGitArtifacts,
  expireProjectBoardGitCardClaimArtifacts,
  exportProjectBoardGitArtifacts,
  getProjectBoardGitSyncStatus,
  pullProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  readProjectBoardGitArtifactProjection,
  releaseProjectBoardGitCardClaimArtifacts,
  resolveProjectBoardGitCardClaimConflictsArtifacts,
  withProjectBoardGitOperationLock,
} from "./projectBoardGitSync";
import { projectBoardArtifactExportFromSummary, writeProjectBoardArtifactExport } from "./projectBoardArtifactExport";
import { projectBoardArtifactProjectionWithResolvedConflicts } from "./projectBoardArtifactImport";

const execFileAsync = promisify(execFile);
const now = "2026-05-04T12:00:00.000Z";
let tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

describe("project board Git sync", () => {
  it("exports board artifacts in local-only mode", async () => {
    const root = await tempRoot("ambient-board-local-");
    const board = sampleBoard(root);

    const status = await exportProjectBoardGitArtifacts(board);

    expect(status).toMatchObject({
      boardId: "board-1",
      isGitRepository: false,
      mode: "local_only",
      projection: expect.objectContaining({ ok: true, cardCount: 1, sourceCount: 1 }),
    });
    await expect(readFile(join(root, ".ambient/board/board.config.json"), "utf8")).resolves.toContain('"boardId": "board-1"');
  });

  it("reports card-level pulled projection conflicts before apply", async () => {
    const root = await tempRoot("ambient-board-conflict-");
    const localBoard = {
      ...sampleBoard(root),
      cards: sampleBoard(root).cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              status: "in_progress" as const,
              title: "Create shell with local active work",
              updatedAt: "2026-05-04T12:15:00.000Z",
            }
          : card,
      ),
    };
    const pulledBoard = {
      ...sampleBoard(root),
      cards: sampleBoard(root).cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              status: "ready" as const,
              title: "Create shell from collaborator",
              updatedAt: "2026-05-04T12:01:00.000Z",
            }
          : card,
      ),
    };
    await writeProjectBoardArtifactExport(root, projectBoardArtifactExportFromSummary(pulledBoard));

    const status = await getProjectBoardGitSyncStatus(localBoard);

    expect(status.projection).toMatchObject({
      ok: false,
      valid: true,
      differenceCount: expect.any(Number),
      conflictCount: 1,
      changes: expect.arrayContaining([
        expect.objectContaining({
          kind: "card",
          action: "update",
          entityId: "card-shell",
          title: "Create shell from collaborator",
          conflict: true,
          applyConsequence: expect.stringContaining("Replace"),
          keepLocalConsequence: expect.stringContaining("exporting/committing"),
          deferConsequence: expect.stringContaining("unchanged"),
        }),
      ]),
    });
  });

  it("reports a blocking projection review when artifacts belong to another board id", async () => {
    const root = await tempRoot("ambient-board-other-id-");
    await writeProjectBoardArtifactExport(root, projectBoardArtifactExportFromSummary(sampleBoardWithBoardId(root, "board-2")));

    const status = await getProjectBoardGitSyncStatus(sampleBoard(root));

    expect(status.projection).toMatchObject({
      ok: false,
      valid: true,
      conflictCount: expect.any(Number),
      changes: expect.arrayContaining([
        expect.objectContaining({
          kind: "board",
          title: "Board settings",
          conflict: true,
          recommendedResolution: "manual_resolution_required",
          conflictReason: expect.stringContaining("board-2"),
          changedFields: expect.arrayContaining(["boardId"]),
        }),
      ]),
    });
  });

  it("commits only .ambient/board artifacts and leaves unrelated worktree changes unstaged", async () => {
    const root = await tempRoot("ambient-board-git-");
    await initGit(root);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await writeFile(join(root, "README.md"), "# Project\n\nUnrelated local edit.\n", "utf8");
    await writeFile(join(root, "unrelated.txt"), "already staged outside the board\n", "utf8");
    await git(root, "add", "unrelated.txt");
    const board = sampleBoard(root);

    const status = await commitProjectBoardGitArtifacts(board);
    const gitStatus = await git(root, "status", "--short");
    const log = await git(root, "log", "-1", "--format=%s");
    const committedFiles = await git(root, "show", "--name-only", "--format=", "HEAD");

    expect(status).toMatchObject({
      isGitRepository: true,
      mode: "git_no_remote",
      dirtyBoardFileCount: 0,
      projection: expect.objectContaining({ ok: true }),
      lastBoardCommit: expect.objectContaining({ subject: "Update Ambient board state: Starship board" }),
    });
    expect(log.trim()).toBe("Update Ambient board state: Starship board");
    expect(committedFiles).toContain(".ambient/board/board.config.json");
    expect(committedFiles).not.toContain("unrelated.txt");
    expect(gitStatus).toContain(" M README.md");
    expect(gitStatus).toContain("A  unrelated.txt");
    expect(gitStatus).not.toMatch(/^[AM?]{1,2} \.ambient\/board/m);
  });

  it("pushes and pulls board artifacts through a configured Git remote", async () => {
    const remote = await tempRoot("ambient-board-remote-");
    const root = await tempRoot("ambient-board-source-");
    const clone = await tempRoot("ambient-board-clone-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    const board = sampleBoard(root);

    const committed = await commitProjectBoardGitArtifacts(board);
    const pushed = await pushProjectBoardGitArtifacts(board);
    await git(clone, "clone", "-b", "main", remote, ".");
    const cloneBoard = sampleBoard(clone);
    const pulled = await pullProjectBoardGitArtifacts(cloneBoard);

    expect(committed.mode).toBe("git_ready");
    expect(pushed).toMatchObject({ isGitRepository: true, hasRemote: true, dirtyBoardFileCount: 0 });
    expect(pulled).toMatchObject({
      isGitRepository: true,
      hasRemote: true,
      projection: expect.objectContaining({ ok: true, cardCount: 1, sourceCount: 1 }),
    });
  });

  it("detects a two-clone pulled card conflict before local active work is overwritten", async () => {
    const remote = await tempRoot("ambient-board-conflict-remote-");
    const root = await tempRoot("ambient-board-conflict-source-");
    const cloneA = await tempRoot("ambient-board-conflict-a-");
    const cloneB = await tempRoot("ambient-board-conflict-b-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    await commitProjectBoardGitArtifacts(sampleBoard(root));
    await pushProjectBoardGitArtifacts(sampleBoard(root));
    await git(cloneA, "clone", "-b", "main", remote, ".");
    await git(cloneB, "clone", "-b", "main", remote, ".");
    await configureGitIdentity(cloneA);
    await configureGitIdentity(cloneB);

    const collaboratorBoard = {
      ...sampleBoard(cloneA),
      cards: sampleBoard(cloneA).cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell from collaborator",
              updatedAt: "2026-05-04T12:01:00.000Z",
            }
          : card,
      ),
    };
    await commitProjectBoardGitArtifacts(collaboratorBoard, "Collaborator updates shell card");
    await pushProjectBoardGitArtifacts(collaboratorBoard);

    const localActiveBoard = {
      ...sampleBoard(cloneB),
      cards: sampleBoard(cloneB).cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell with active local debugging",
              status: "in_progress" as const,
              updatedAt: "2026-05-04T12:15:00.000Z",
            }
          : card,
      ),
    };
    const pulled = await pullProjectBoardGitArtifacts(localActiveBoard);

    expect(pulled.projection).toMatchObject({
      ok: false,
      valid: true,
      conflictCount: 1,
      changes: expect.arrayContaining([
        expect.objectContaining({
          kind: "card",
          action: "update",
          entityId: "card-shell",
          conflict: true,
          conflictReason: expect.stringContaining("in_progress"),
          applyConsequence: expect.stringContaining("Replace"),
          keepLocalConsequence: expect.stringContaining("exporting/committing"),
          deferConsequence: expect.stringContaining("unchanged"),
        }),
      ]),
    });

    const pulledProjection = await readProjectBoardGitArtifactProjection(localActiveBoard);
    const conflict = pulled.projection?.changes?.find((change) => change.entityId === "card-shell" && change.conflict);
    const resolved = projectBoardArtifactProjectionWithResolvedConflicts(localActiveBoard, pulledProjection, [
      { changeId: conflict?.id, entityId: "card-shell", resolution: "keep_local" },
    ]);
    expect(resolved.unresolvedConflicts).toEqual([]);
    expect(resolved.projection.cards.find((card) => card.cardId === "card-shell")).toMatchObject({
      title: "Create shell with active local debugging",
      status: "in_progress",
    });
    expect(resolved.diff.conflictCount ?? 0).toBe(0);
  });

  it("defers a pulled card conflict without rewriting the pulled artifact on disk", { timeout: 30_000 }, async () => {
    const remote = await tempRoot("ambient-board-defer-remote-");
    const root = await tempRoot("ambient-board-defer-source-");
    const clone = await tempRoot("ambient-board-defer-clone-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    await commitProjectBoardGitArtifacts(sampleBoard(root));
    await pushProjectBoardGitArtifacts(sampleBoard(root));
    await git(clone, "clone", "-b", "main", remote, ".");
    await configureGitIdentity(clone);

    const collaboratorBoard = {
      ...sampleBoard(root),
      cards: sampleBoard(root).cards.map((card) =>
        card.id === "card-shell"
          ? { ...card, title: "Create shell from collaborator", updatedAt: "2026-05-04T12:01:00.000Z" }
          : card,
      ),
    };
    await commitProjectBoardGitArtifacts(collaboratorBoard, "Collaborator updates shell card");
    await pushProjectBoardGitArtifacts(collaboratorBoard);

    const localActiveBoard = {
      ...sampleBoard(clone),
      cards: sampleBoard(clone).cards.map((card) =>
        card.id === "card-shell"
          ? {
              ...card,
              title: "Create shell with active local debugging",
              status: "in_progress" as const,
              updatedAt: "2026-05-04T12:15:00.000Z",
            }
          : card,
      ),
    };
    const pulled = await pullProjectBoardGitArtifacts(localActiveBoard);
    const conflict = pulled.projection?.changes?.find((change) => change.entityId === "card-shell" && change.conflict);
    expect(conflict).toBeDefined();

    const appliedProjections: string[] = [];
    const result = await applyProjectBoardGitProjection(localActiveBoard, {
      resolutions: [{ changeId: conflict?.id, entityId: "card-shell", resolution: "defer" }],
      applyProjection: (_projectPath, projection) => {
        appliedProjections.push(projection.cards.find((card) => card.cardId === "card-shell")?.title ?? "");
        return localActiveBoard;
      },
    });

    // The applied projection keeps the local board state...
    expect(appliedProjections).toEqual(["Create shell with active local debugging"]);
    // ...but defer is not a local overlay, so the pulled artifact stays on disk
    // for a later re-apply instead of being rewritten with the local version.
    expect(result.localOverlayCount).toBe(0);
    const pulledArtifact = await readFile(join(clone, ".ambient/board/cards/card-shell.json"), "utf8");
    expect(pulledArtifact).toContain("Create shell from collaborator");
    expect(pulledArtifact).not.toContain("active local debugging");
  });

  it("refuses to push the board when unrelated unpushed commits would ride along", { timeout: 30_000 }, async () => {
    const remote = await tempRoot("ambient-board-pushscope-remote-");
    const root = await tempRoot("ambient-board-pushscope-source-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    const board = sampleBoard(root);

    // Board-only commits push fine.
    await commitProjectBoardGitArtifacts(board);
    await expect(pushProjectBoardGitArtifacts(board)).resolves.toMatchObject({ mode: "git_ready" });

    // An unrelated local commit must block the board-scoped push.
    await writeFile(join(root, "feature.ts"), "export const wip = true;\n", "utf8");
    await git(root, "add", "feature.ts");
    await git(root, "commit", "-m", "WIP: unfinished feature work");
    const updatedBoard = { ...board, summary: "Updated summary", updatedAt: "2026-05-04T12:30:00.000Z" };
    await commitProjectBoardGitArtifacts(updatedBoard, "Update board summary");
    await expect(pushProjectBoardGitArtifacts(updatedBoard)).rejects.toThrow(/unrelated changes[\s\S]*WIP: unfinished feature work/);

    // Once the user pushes their own work, the board push goes through.
    await git(root, "push");
    await expect(pushProjectBoardGitArtifacts(updatedBoard)).resolves.toMatchObject({ mode: "git_ready" });
  });

  it("serializes board git operations per project root", async () => {
    const order: string[] = [];
    const slow = withProjectBoardGitOperationLock("/board-root-a", async () => {
      order.push("a1-start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push("a1-end");
      return "a1";
    });
    const queued = withProjectBoardGitOperationLock("/board-root-a", async () => {
      order.push("a2-start");
      return "a2";
    });
    const otherRoot = withProjectBoardGitOperationLock("/board-root-b", async () => {
      order.push("b1-start");
      return "b1";
    });

    await expect(Promise.all([slow, queued, otherRoot])).resolves.toEqual(["a1", "a2", "b1"]);
    // Same root strictly serializes; a different root is free to run during a1.
    expect(order.indexOf("a2-start")).toBeGreaterThan(order.indexOf("a1-end"));
    expect(order.indexOf("b1-start")).toBeLessThan(order.indexOf("a1-end"));

    // A failing operation must not poison the queue for the next one.
    await expect(
      withProjectBoardGitOperationLock("/board-root-a", async () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");
    await expect(withProjectBoardGitOperationLock("/board-root-a", async () => "recovered")).resolves.toBe("recovered");
  });

  it("removes stale artifact files for deleted cards on export so they cannot resurrect", async () => {
    const root = await tempRoot("ambient-board-stale-");
    const board = sampleBoard(root);
    const extraCard = {
      ...board.cards[0],
      id: "card-extra",
      sourceId: "synthesis:extra",
      title: "Temporary card",
    };
    await exportProjectBoardGitArtifacts({ ...board, cards: [...board.cards, extraCard] });
    await expect(readFile(join(root, ".ambient/board/cards/card-extra.json"), "utf8")).resolves.toContain("Temporary card");
    // An event file written by another flow (e.g. a claim event) is not part of the
    // export set; the stale sweep must leave events alone.
    const foreignEventPath = join(root, ".ambient/board/events/2099/05/evt-foreign-claim.json");
    await mkdir(dirname(foreignEventPath), { recursive: true });
    await writeFile(foreignEventPath, '{"eventId":"evt-foreign-claim"}\n', "utf8");

    // Re-export after the card was deleted locally: its artifact must disappear.
    await exportProjectBoardGitArtifacts(board);
    await expect(readFile(join(root, ".ambient/board/cards/card-extra.json"), "utf8")).rejects.toThrow(/ENOENT/);
    await expect(readFile(join(root, ".ambient/board/cards/card-shell.json"), "utf8")).resolves.toContain("Create shell");
    await expect(readFile(foreignEventPath, "utf8")).resolves.toContain("evt-foreign-claim");
  });

  it("uses pushed claim, release, and expiry events to coordinate card ownership between clones", { timeout: 30_000 }, async () => {
    const remote = await tempRoot("ambient-board-claim-remote-");
    const root = await tempRoot("ambient-board-claim-source-");
    const cloneA = await tempRoot("ambient-board-claim-a-");
    const cloneB = await tempRoot("ambient-board-claim-b-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    const board = sampleBoard(root);
    await commitProjectBoardGitArtifacts(board);
    await pushProjectBoardGitArtifacts(board);
    await git(cloneA, "clone", "-b", "main", remote, ".");
    await git(cloneB, "clone", "-b", "main", remote, ".");
    await configureGitIdentity(cloneA);
    await configureGitIdentity(cloneB);

    const claimed = await claimProjectBoardGitCardArtifacts(sampleBoard(cloneA), {
      cardId: "card-shell",
      runId: "run-a",
      agentId: "desktop-a",
      now: "2099-05-04T12:00:00.000Z",
      leaseMs: 5 * 60_000,
    });
    await expect(
      claimProjectBoardGitCardArtifacts(sampleBoard(cloneB), {
        cardId: "card-shell",
        runId: "run-b",
        agentId: "desktop-b",
        now: "2099-05-04T12:01:00.000Z",
        leaseMs: 5 * 60_000,
      }),
    ).rejects.toThrow(/already claimed by desktop-a/);

    const released = await releaseProjectBoardGitCardClaimArtifacts(sampleBoard(cloneA), {
      cardId: "card-shell",
      runId: "run-a",
      agentId: "desktop-a",
      now: "2099-05-04T12:02:00.000Z",
    });

    const claimedAfterRelease = await claimProjectBoardGitCardArtifacts(sampleBoard(cloneB), {
      cardId: "card-shell",
      runId: "run-b",
      agentId: "desktop-b",
      now: "2099-05-04T12:03:00.000Z",
      leaseMs: 5 * 60_000,
    });

    const expired = await expireProjectBoardGitCardClaimArtifacts(sampleBoard(cloneA), {
      cardId: "card-shell",
      runId: "run-b",
      agentId: "desktop-a",
      now: "2099-05-04T12:09:00.000Z",
    });

    const claimedAfterExpiry = await claimProjectBoardGitCardArtifacts(sampleBoard(cloneA), {
      cardId: "card-shell",
      runId: "run-c",
      agentId: "desktop-a",
      now: "2099-05-04T12:10:00.000Z",
      leaseMs: 5 * 60_000,
    });

    expect(claimed.projection).toMatchObject({ activeClaimCount: 1, claimedCardIds: ["card-shell"] });
    expect(released.projection).toMatchObject({ activeClaimCount: 0, claimedCardIds: [] });
    expect(claimedAfterRelease.projection).toMatchObject({ activeClaimCount: 1, claimedCardIds: ["card-shell"] });
    expect(expired.projection).toMatchObject({ activeClaimCount: 0, expiredClaimCount: 1, claimedCardIds: [] });
    expect(claimedAfterExpiry.projection).toMatchObject({ activeClaimCount: 1, expiredClaimCount: 1, claimedCardIds: ["card-shell"] });
  });

  it("resolves competing claim events by expiring losing runs and preserving the active winner", async () => {
    const remote = await tempRoot("ambient-board-claim-conflict-remote-");
    const root = await tempRoot("ambient-board-claim-conflict-source-");
    const cloneA = await tempRoot("ambient-board-claim-conflict-a-");
    const cloneB = await tempRoot("ambient-board-claim-conflict-b-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    const board = sampleBoard(root);
    await commitProjectBoardGitArtifacts(board);
    await pushProjectBoardGitArtifacts(board);

    const winningClaim = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-shell",
      runId: "run-a",
      agentId: "desktop-a",
      displayName: "Desktop A",
      now: "2099-05-04T12:00:00.000Z",
      leaseMs: 5 * 60_000,
    });
    const losingClaim = createProjectBoardClaimEvent({
      boardId: "board-1",
      cardId: "card-shell",
      runId: "run-b",
      agentId: "desktop-b",
      displayName: "Desktop B",
      now: "2099-05-04T12:01:00.000Z",
      leaseMs: 5 * 60_000,
    });
    await writeBoardEventArtifact(root, winningClaim);
    await writeBoardEventArtifact(root, losingClaim);
    await git(root, "add", ".ambient/board");
    await git(root, "commit", "-m", "Seed competing claim events");
    await git(root, "push");

    await git(cloneA, "clone", "-b", "main", remote, ".");
    await git(cloneB, "clone", "-b", "main", remote, ".");
    await configureGitIdentity(cloneA);
    await configureGitIdentity(cloneB);

    const before = await getProjectBoardGitSyncStatus(sampleBoard(cloneA));
    expect(before.projection).toMatchObject({
      activeClaimCount: 1,
      claimConflictCount: 1,
      claimedCardIds: ["card-shell"],
    });

    const resolved = await resolveProjectBoardGitCardClaimConflictsArtifacts(sampleBoard(cloneA), {
      cardId: "card-shell",
      agentId: "desktop-a",
      now: "2099-05-04T12:02:00.000Z",
    });
    expect(resolved.projection).toMatchObject({
      activeClaimCount: 1,
      claimConflictCount: 0,
      expiredClaimCount: 1,
      claimedCardIds: ["card-shell"],
    });

    await expect(
      claimProjectBoardGitCardArtifacts(sampleBoard(cloneB), {
        cardId: "card-shell",
        runId: "run-c",
        agentId: "desktop-c",
        now: "2099-05-04T12:03:00.000Z",
        leaseMs: 5 * 60_000,
      }),
    ).rejects.toThrow(/already claimed by desktop-a/);
  });

  it("rolls back the local claim commit when the push is rejected so the branch stays usable", { timeout: 30_000 }, async () => {
    const remote = await tempRoot("ambient-board-claim-pushfail-remote-");
    const root = await tempRoot("ambient-board-claim-pushfail-source-");
    const clone = await tempRoot("ambient-board-claim-pushfail-clone-");
    await git(remote, "init", "--bare");
    await initGit(root);
    await git(root, "remote", "add", "origin", remote);
    await writeFile(join(root, "README.md"), "# Project\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "seed");
    await git(root, "push", "-u", "origin", "main");
    const board = sampleBoard(root);
    await commitProjectBoardGitArtifacts(board);
    await pushProjectBoardGitArtifacts(board);
    await git(clone, "clone", "-b", "main", remote, ".");
    await configureGitIdentity(clone);

    // Unrelated local work that the rollback must not touch.
    await writeFile(join(clone, "notes.txt"), "scratch notes\n", "utf8");

    // Simulate losing the push race: the remote rejects the claim push.
    await writeFile(join(remote, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    await expect(
      claimProjectBoardGitCardArtifacts(sampleBoard(clone), {
        cardId: "card-shell",
        runId: "run-a",
        agentId: "desktop-a",
        now: "2099-05-04T12:00:00.000Z",
        leaseMs: 5 * 60_000,
      }),
    ).rejects.toThrow(/rolled back[\s\S]*pull and retry/);

    // The branch is not diverged and no claim event leaked into the worktree.
    expect((await git(clone, "rev-list", "--count", "origin/main..HEAD")).trim()).toBe("0");
    expect((await git(clone, "status", "--porcelain", "--", ".ambient/board")).trim()).toBe("");
    await expect(readFile(join(clone, "notes.txt"), "utf8")).resolves.toBe("scratch notes\n");

    // ff-only pull still works and the claim succeeds once the remote accepts pushes again.
    await rm(join(remote, "hooks", "pre-receive"), { force: true });
    await expect(pullProjectBoardGitArtifacts(sampleBoard(clone))).resolves.toMatchObject({ isGitRepository: true });
    const claimed = await claimProjectBoardGitCardArtifacts(sampleBoard(clone), {
      cardId: "card-shell",
      runId: "run-a",
      agentId: "desktop-a",
      now: "2099-05-04T12:01:00.000Z",
      leaseMs: 5 * 60_000,
    });
    expect(claimed.projection).toMatchObject({ activeClaimCount: 1, claimedCardIds: ["card-shell"] });
  });
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function initGit(root: string): Promise<void> {
  await git(root, "init", "-b", "main");
  await configureGitIdentity(root);
}

async function configureGitIdentity(root: string): Promise<void> {
  await git(root, "config", "user.email", "ambient@example.test");
  await git(root, "config", "user.name", "Ambient Test");
}

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", ["-C", root, ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return `${stdout}${stderr}`;
}

async function writeBoardEventArtifact(projectRoot: string, event: BoardEventArtifact): Promise<void> {
  const eventPath = boardEventArtifactPath(event);
  await mkdir(dirname(join(projectRoot, eventPath)), { recursive: true });
  await writeFile(join(projectRoot, eventPath), serializeBoardArtifact(event), "utf8");
}

function sampleBoard(projectPath: string): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath,
    status: "active",
    title: "Starship board",
    summary: "Dogfood board",
    charterId: "charter-1",
    charter: {
      id: "charter-1",
      boardId: "board-1",
      version: 1,
      status: "active",
      goal: "Build the MVP slice.",
      currentState: "The design doc exists.",
      targetUser: "Arcade space-game players.",
      nonGoals: [],
      qualityBar: "Proof every card.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Starship board\n",
      createdAt: now,
      updatedAt: now,
    },
    cards: [
      {
        id: "card-shell",
        boardId: "board-1",
        title: "Create shell",
        description: "Create the PixiJS shell.",
        status: "ready",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Foundation",
        labels: ["foundation"],
        blockedBy: [],
        acceptanceCriteria: ["Canvas mounts."],
        testPlan: { unit: [], integration: ["Run the app."], visual: ["Screenshot."], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:shell",
        createdAt: now,
        updatedAt: now,
      },
    ],
    sources: [
      {
        id: "source-gdd",
        boardId: "board-1",
        kind: "functional_spec",
        title: "Game Design Document",
        summary: "Hybrid Newtonian movement and PixiJS shell.",
        excerpt: "The game uses PixiJS and hybrid Newtonian movement.",
        path: "GAME_DESIGN_DOCUMENT.md",
        relevance: 95,
        createdAt: now,
        updatedAt: now,
      },
    ],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    events: [
      {
        id: "evt-board-created",
        boardId: "board-1",
        kind: "board_created",
        title: "Board created",
        summary: "Created board.",
        entityKind: "board",
        entityId: "board-1",
        metadata: {},
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function sampleBoardWithBoardId(projectPath: string, boardId: string): ProjectBoardSummary {
  const board = sampleBoard(projectPath);
  const charterId = `${boardId}-charter`;
  return {
    ...board,
    id: boardId,
    charterId,
    charter: board.charter ? { ...board.charter, id: charterId, boardId } : undefined,
    cards: board.cards.map((card) => ({ ...card, boardId })),
    sources: board.sources.map((source) => ({ ...source, boardId })),
    events: (board.events ?? []).map((event) => ({
      ...event,
      boardId,
      entityId: event.entityKind === "board" ? boardId : event.entityId,
    })),
  };
}
