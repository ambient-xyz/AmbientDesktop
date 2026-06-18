import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardActiveCardDetail,
  projectBoardDependencyHealth,
  projectBoardDraftColumns,
  projectBoardExecutionPmReview,
} from "../../renderer/src/projectBoardUiModel";
import { projectBoardArtifactExportFromSummary } from "./projectBoardArtifactExport";
import { projectBoardArtifactProjectionFromFiles, projectBoardArtifactProjectionWithResolvedConflicts } from "./projectBoardArtifactImport";
import { annotateProjectBoardDraftWithObjectiveProvenance, projectBoardSourceScopeAnswersForRefinement } from "./projectBoardSourceElaboration";
import {
  applyProjectBoardGitProjection,
  commitProjectBoardGitArtifacts,
  pullProjectBoardGitArtifacts,
  pushProjectBoardGitArtifacts,
  readProjectBoardGitArtifactProjection,
} from "./projectBoardGitSync";
import { ProjectStore } from "./projectBoardProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const now = "2026-05-05T12:00:00.000Z";
const execFileAsync = promisify(execFile);

describeNative("project board two-clone handoff dogfood", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("projects a collaborator handoff into dependency readiness, PM Review, and Draft Inbox triage", async () => {
    const cloneAPath = await tempRoot("ambient-board-handoff-a-", roots);
    const cloneBPath = await tempRoot("ambient-board-handoff-b-", roots);
    const cloneA = new ProjectStore();
    const cloneB = new ProjectStore();
    cloneA.openWorkspace(cloneAPath);
    cloneB.openWorkspace(cloneBPath);
    try {
      const initialProjection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(sampleBoard(cloneAPath)).files);
      const cloneABoard = cloneA.applyProjectBoardArtifactProjection(cloneAPath, initialProjection);
      cloneB.applyProjectBoardArtifactProjection(cloneBPath, initialProjection);

      const collaboratorRuntime = sampleRuntimeWithHandoffFollowUp();
      const cloneAWithCompletedRun: ProjectBoardSummary = {
        ...cloneABoard,
        cards: cloneABoard.cards.map((card) =>
          card.id === "card-foundation"
            ? {
                ...card,
                status: "review",
                orchestrationTaskId: "task-foundation",
              }
            : card,
        ),
      };
      const collaboratorProjection = projectBoardArtifactProjectionFromFiles(
        projectBoardArtifactExportFromSummary(cloneAWithCompletedRun, { runtime: collaboratorRuntime }).files,
      );
      const pulled = cloneB.applyProjectBoardArtifactProjection(cloneBPath, collaboratorProjection);

      const foundation = pulled.cards.find((card) => card.id === "card-foundation")!;
      const controls = pulled.cards.find((card) => card.id === "card-controls")!;
      const followUp = pulled.cards.find((card) => card.sourceKind === "run_follow_up")!;
      expect(pulled.executionArtifacts).toHaveLength(1);
      expect(followUp).toMatchObject({
        title: "Add resize regression coverage",
        status: "draft",
        candidateStatus: "needs_clarification",
        sourceId: "run-foundation#follow-up:1",
        blockedBy: ["card-foundation"],
        labels: expect.arrayContaining(["run-follow-up", "pulled-handoff", "foundation"]),
      });

      const readiness = projectBoardDependencyHealth(pulled).readiness;
      expect(readiness.find((item) => item.card.id === foundation.id)).toMatchObject({
        state: "waiting_on_review",
        label: "Pulled proof",
      });
      expect(readiness.find((item) => item.card.id === controls.id)).toMatchObject({
        state: "ready_now",
        waitingOn: [],
      });
      expect(readiness.find((item) => item.card.id === followUp.id)).toMatchObject({
        state: "needs_clarification",
        waitingOn: [],
      });

      const pmReview = projectBoardExecutionPmReview(pulled);
      expect(pmReview).toMatchObject({
        total: 1,
        completed: 1,
        followUpCount: 1,
      });
      expect(pmReview.materializedFollowUps).toEqual([
        expect.objectContaining({
          card: expect.objectContaining({ id: followUp.id }),
          parentCard: expect.objectContaining({ id: "card-foundation" }),
          runId: "run-foundation",
          statusLabel: "Needs clarification",
          blockerLabel: "Blocked by Create PixiJS shell",
        }),
      ]);
      expect(pmReview.impacts[0]).toMatchObject({
        card: expect.objectContaining({ id: "card-foundation" }),
        newlyReadyUnblocks: expect.arrayContaining([
          expect.objectContaining({ id: "card-controls" }),
        ]),
      });
      expect(pmReview.impacts[0].newlyReadyUnblocks.map((card) => card.id)).not.toContain(followUp.id);

      const draftColumns = projectBoardDraftColumns(pulled.cards);
      expect(draftColumns.find((column) => column.id === "needs_clarification")?.cards.map((card) => card.id)).toContain(followUp.id);
      const controlsDetail = projectBoardActiveCardDetail(controls, pulled.cards, [], [], pulled.executionArtifacts ?? []);
      expect(controlsDetail.progressLedger.find((entry) => entry.id === "remaining_work")).toMatchObject({
        state: "missing",
        detail: expect.not.stringContaining("Create PixiJS shell"),
      });
      expect(pulled.events?.map((event) => event.kind)).toEqual(expect.arrayContaining(["card_run_handoff_created", "run_follow_up_created"]));
    } finally {
      cloneA.close();
      cloneB.close();
    }
  });

  it("keeps a resolved local active card while importing collaborator handoff artifacts", async () => {
    const cloneAPath = await tempRoot("ambient-board-resolved-handoff-a-", roots);
    const cloneBPath = await tempRoot("ambient-board-resolved-handoff-b-", roots);
    const cloneA = new ProjectStore();
    const cloneB = new ProjectStore();
    cloneA.openWorkspace(cloneAPath);
    cloneB.openWorkspace(cloneBPath);
    try {
      const initialProjection = projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(sampleBoard(cloneAPath)).files);
      const cloneABoard = cloneA.applyProjectBoardArtifactProjection(cloneAPath, initialProjection);
      const cloneBInitial = cloneB.applyProjectBoardArtifactProjection(cloneBPath, initialProjection);
      const cloneBLocalActive: ProjectBoardSummary = {
        ...cloneBInitial,
        cards: cloneBInitial.cards.map((card) =>
          card.id === "card-controls"
            ? {
                ...card,
                title: "Implement ship controls with local active debugging",
                status: "in_progress",
                updatedAt: "2026-05-05T12:30:00.000Z",
              }
            : card,
        ),
      };
      cloneB.applyProjectBoardArtifactProjection(
        cloneBPath,
        projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(cloneBLocalActive).files),
      );

      const collaboratorRuntime = sampleRuntimeWithHandoffFollowUp();
      const collaboratorBoard: ProjectBoardSummary = {
        ...cloneABoard,
        cards: cloneABoard.cards.map((card) => {
          if (card.id === "card-foundation") {
            return {
              ...card,
              status: "review",
              orchestrationTaskId: "task-foundation",
              updatedAt: "2026-05-05T12:10:00.000Z",
            };
          }
          if (card.id === "card-controls") {
            return {
              ...card,
              title: "Implement ship controls after pulled shell proof",
              status: "ready",
              updatedAt: "2026-05-05T12:05:00.000Z",
            };
          }
          return card;
        }),
      };
      const collaboratorProjection = projectBoardArtifactProjectionFromFiles(
        projectBoardArtifactExportFromSummary(collaboratorBoard, { runtime: collaboratorRuntime }).files,
      );

      const resolved = projectBoardArtifactProjectionWithResolvedConflicts(cloneBLocalActive, collaboratorProjection, [
        { entityId: "card-controls", resolution: "keep_local" },
      ]);
      expect(resolved.unresolvedConflicts).toEqual([]);
      expect(resolved.localOverlayCount).toBe(1);

      const pulled = cloneB.applyProjectBoardArtifactProjection(cloneBPath, resolved.projection);
      const controls = pulled.cards.find((card) => card.id === "card-controls")!;
      const followUp = pulled.cards.find((card) => card.sourceKind === "run_follow_up")!;

      expect(controls).toMatchObject({
        title: "Implement ship controls with local active debugging",
        status: "in_progress",
      });
      expect(pulled.executionArtifacts).toHaveLength(1);
      expect(pulled.executionArtifacts?.[0]).toMatchObject({
        cardId: "card-foundation",
        status: "completed",
        handoff: expect.objectContaining({
          summary: "Shell is ready for controls, with one resize-proof follow-up.",
        }),
      });
      expect(followUp).toMatchObject({
        title: "Add resize regression coverage",
        status: "draft",
        candidateStatus: "needs_clarification",
        blockedBy: ["card-foundation"],
      });
      expect(projectBoardDraftColumns(pulled.cards).find((column) => column.id === "needs_clarification")?.cards.map((card) => card.id)).toContain(
        followUp.id,
      );
      expect(projectBoardExecutionPmReview(pulled)).toMatchObject({
        total: 1,
        completed: 1,
        followUpCount: 1,
      });
      expect(pulled.events?.map((event) => event.kind)).toEqual(expect.arrayContaining(["card_run_handoff_created", "run_follow_up_created"]));
    } finally {
      cloneA.close();
      cloneB.close();
    }
  });

  it("applies a Git-pulled resolved card conflict and collaborator handoff through the app-boundary helper", async () => {
    const remotePath = await tempRoot("ambient-board-git-handoff-remote-", roots);
    const seedPath = await tempRoot("ambient-board-git-handoff-seed-", roots);
    const cloneAPath = await tempRoot("ambient-board-git-handoff-a-", roots);
    const cloneBPath = await tempRoot("ambient-board-git-handoff-b-", roots);
    const cloneA = new ProjectStore();
    const cloneB = new ProjectStore();
    try {
      await git(remotePath, "init", "--bare");
      await initGit(seedPath);
      await git(seedPath, "remote", "add", "origin", remotePath);
      await git(seedPath, "commit", "--allow-empty", "-m", "seed");
      await git(seedPath, "push", "-u", "origin", "main");
      await commitProjectBoardGitArtifacts(sampleBoard(seedPath));
      await pushProjectBoardGitArtifacts(sampleBoard(seedPath));
      await git(cloneAPath, "clone", "-b", "main", remotePath, ".");
      await git(cloneBPath, "clone", "-b", "main", remotePath, ".");
      await configureGitIdentity(cloneAPath);
      await configureGitIdentity(cloneBPath);

      cloneA.openWorkspace(cloneAPath);
      cloneB.openWorkspace(cloneBPath);
      const cloneABoard = cloneA.applyProjectBoardArtifactProjection(cloneAPath, await readProjectBoardGitArtifactProjection(sampleBoard(cloneAPath)));
      const cloneBInitial = cloneB.applyProjectBoardArtifactProjection(cloneBPath, await readProjectBoardGitArtifactProjection(sampleBoard(cloneBPath)));
      const cloneBLocalActive: ProjectBoardSummary = {
        ...cloneBInitial,
        cards: cloneBInitial.cards.map((card) =>
          card.id === "card-controls"
            ? {
                ...card,
                title: "Implement ship controls with local active debugging",
                status: "in_progress",
                updatedAt: "2026-05-05T12:30:00.000Z",
              }
            : card,
        ),
      };
      cloneB.applyProjectBoardArtifactProjection(
        cloneBPath,
        projectBoardArtifactProjectionFromFiles(projectBoardArtifactExportFromSummary(cloneBLocalActive).files),
      );

      const collaboratorBoard: ProjectBoardSummary = {
        ...cloneABoard,
        cards: cloneABoard.cards.map((card) => {
          if (card.id === "card-foundation") {
            return {
              ...card,
              status: "review",
              orchestrationTaskId: "task-foundation",
              updatedAt: "2026-05-05T12:10:00.000Z",
            };
          }
          if (card.id === "card-controls") {
            return {
              ...card,
              title: "Implement ship controls after pulled shell proof",
              status: "ready",
              updatedAt: "2026-05-05T12:05:00.000Z",
            };
          }
          return card;
        }),
      };
      await commitProjectBoardGitArtifacts(collaboratorBoard, "Collaborator completes shell handoff", {
        runtime: sampleRuntimeWithHandoffFollowUp(),
      });
      await pushProjectBoardGitArtifacts(collaboratorBoard);

      const pulled = await pullProjectBoardGitArtifacts(cloneBLocalActive);
      expect(pulled.projection).toMatchObject({
        conflictCount: 1,
        runArtifactCount: 1,
        changes: expect.arrayContaining([
          expect.objectContaining({
            kind: "card",
            entityId: "card-controls",
            conflict: true,
          }),
          expect.objectContaining({
            kind: "runtime",
            summary: expect.stringContaining("execution proof/handoff"),
          }),
        ]),
      });

      await expect(
        applyProjectBoardGitProjection(cloneBLocalActive, {
          runtime: cloneB.listOrchestrationBoard(),
          applyProjection: (projectPath, projection) => cloneB.applyProjectBoardArtifactProjection(projectPath, projection),
        }),
      ).rejects.toThrow(/must be resolved before applying/);

      const applied = await applyProjectBoardGitProjection(cloneBLocalActive, {
        runtime: cloneB.listOrchestrationBoard(),
        resolutions: [{ entityId: "card-controls", resolution: "keep_local" }],
        applyProjection: (projectPath, projection) => cloneB.applyProjectBoardArtifactProjection(projectPath, projection),
      });
      const pulledBoard = applied.appliedBoard;
      const controls = pulledBoard.cards.find((card) => card.id === "card-controls")!;
      const followUp = pulledBoard.cards.find((card) => card.sourceKind === "run_follow_up")!;
      const exportedProjection = await readProjectBoardGitArtifactProjection(pulledBoard);

      expect(applied).toMatchObject({ conflictCount: 1, localOverlayCount: 1 });
      expect(controls).toMatchObject({
        title: "Implement ship controls with local active debugging",
        status: "in_progress",
      });
      expect(pulledBoard.executionArtifacts).toHaveLength(1);
      expect(followUp).toMatchObject({
        title: "Add resize regression coverage",
        candidateStatus: "needs_clarification",
        blockedBy: ["card-foundation"],
      });
      expect(projectBoardExecutionPmReview(pulledBoard)).toMatchObject({ total: 1, completed: 1, followUpCount: 1 });
      expect(exportedProjection.cards.find((card) => card.cardId === "card-controls")).toMatchObject({
        title: "Implement ship controls with local active debugging",
        status: "in_progress",
      });
    } finally {
      cloneA.close();
      cloneB.close();
    }
  });

  it("lets another clone adopt an objective Add Cards board and continue additive planning", async () => {
    const remotePath = await tempRoot("ambient-board-objective-remote-", roots);
    const seedPath = await tempRoot("ambient-board-objective-seed-", roots);
    const cloneAPath = await tempRoot("ambient-board-objective-a-", roots);
    const cloneBPath = await tempRoot("ambient-board-objective-b-", roots);
    const cloneA = new ProjectStore();
    const cloneB = new ProjectStore();
    try {
      await git(remotePath, "init", "--bare");
      await initGit(seedPath);
      await git(seedPath, "remote", "add", "origin", remotePath);
      await git(seedPath, "commit", "--allow-empty", "-m", "seed");
      await git(seedPath, "push", "-u", "origin", "main");
      const seedBoard = sampleObjectiveBoard(seedPath);
      await commitProjectBoardGitArtifacts(seedBoard, "Seed objective Add Cards board");
      await pushProjectBoardGitArtifacts(seedBoard);

      await git(cloneAPath, "clone", "-b", "main", remotePath, ".");
      await git(cloneBPath, "clone", "-b", "main", remotePath, ".");
      await configureGitIdentity(cloneAPath);
      await configureGitIdentity(cloneBPath);

      cloneA.openWorkspace(cloneAPath);
      cloneB.openWorkspace(cloneBPath);
      const cloneAInitial = cloneA.applyProjectBoardArtifactProjection(
        cloneAPath,
        await readProjectBoardGitArtifactProjection(sampleObjectiveBoard(cloneAPath)),
      );
      const cloneBInitial = cloneB.applyProjectBoardArtifactProjection(
        cloneBPath,
        await readProjectBoardGitArtifactProjection(sampleObjectiveBoard(cloneBPath)),
      );

      const inheritedObjectiveCard = cloneBInitial.cards.find((card) => card.sourceId === "objective:keyboard-movement")!;
      expect(inheritedObjectiveCard).toMatchObject({
        title: "Add keyboard card movement",
        status: "draft",
        candidateStatus: "ready_to_create",
        sourceRefs: ["docs/kanban-accessibility.md"],
        objectiveProvenance: expect.objectContaining({
          objective: "Add accessible keyboard movement and swimlane filtering cards.",
          groundingMode: "source_scan",
          sourceRefCount: 1,
          weakGrounding: false,
        }),
      });
      expect(projectBoardDraftColumns(cloneBInitial.cards).find((column) => column.id === "ready_to_create")?.cards.map((card) => card.id)).toContain(
        inheritedObjectiveCard.id,
      );

      const continuationAnswers = projectBoardSourceScopeAnswersForRefinement({
        boardId: cloneBInitial.id,
        board: cloneBInitial,
        sources: cloneBInitial.sources,
        mode: "source_elaboration",
        selectedSourceScope: false,
        objective: "Add a net-new objective card for swimlane filter shortcuts without recreating keyboard movement.",
      });
      expect(continuationAnswers.find((answer) => answer.question === "Existing board cards to avoid duplicating")?.answer).toContain(
        "Add keyboard card movement",
      );
      expect(continuationAnswers.find((answer) => answer.question === "Existing board cards to avoid duplicating")?.answer).toContain(
        "sources docs/kanban-accessibility.md",
      );

      const continuation = annotateProjectBoardDraftWithObjectiveProvenance(
        {
          summary: "Continue objective-scoped Add Cards without replacing inherited cards.",
          goal: "Build a small browser kanban board.",
          currentState: "The second clone adopted the board and inherited the keyboard movement objective card.",
          targetUser: "Product team member managing local tasks.",
          qualityBar: "Cards need acceptance criteria and proof expectations.",
          assumptions: [],
          questions: [],
          sourceNotes: ["docs/kanban-accessibility.md supports keyboard and filtering follow-ups."],
          cards: [
            {
              sourceId: "objective:swimlane-filter-shortcuts",
              title: "Add swimlane filter shortcuts",
              description: "Add keyboard shortcuts and focus handling for swimlane filtering without rebuilding the board shell.",
              candidateStatus: "ready_to_create",
              priority: 3,
              phase: "Accessibility",
              labels: ["kanban", "accessibility"],
              blockedBy: ["objective:keyboard-movement"],
              sourceRefs: ["docs/kanban-accessibility.md"],
              acceptanceCriteria: ["Users can focus swimlane filters from the keyboard.", "Shortcut behavior is documented and testable."],
              testPlan: {
                unit: ["Cover filter shortcut state transitions."],
                integration: ["Run a keyboard navigation smoke over swimlane filtering."],
                visual: [],
                manual: ["Verify keyboard-only filtering in the browser."],
              },
            },
          ],
        },
        {
          objective: "Add a net-new objective card for swimlane filter shortcuts without recreating keyboard movement.",
          sourceContextAvailable: true,
        },
      );
      expect(continuation.warningRecords).toEqual([]);
      const proposal = cloneB.createProjectBoardSynthesisProposal({
        boardId: cloneBInitial.id,
        synthesis: continuation.draft,
        model: "deterministic-objective-handoff",
      });
      cloneB.reviewProjectBoardSynthesisProposalCard({
        proposalId: proposal.id,
        sourceId: "objective:swimlane-filter-shortcuts",
        reviewStatus: "accepted",
      });
      const cloneBContinued = cloneB.applyProjectBoardSynthesisProposal({ proposalId: proposal.id });
      const continuationCard = cloneBContinued.cards.find((card) => card.sourceId === "objective:swimlane-filter-shortcuts")!;
      expect(continuationCard).toMatchObject({
        title: "Add swimlane filter shortcuts",
        sourceRefs: ["docs/kanban-accessibility.md"],
        objectiveProvenance: expect.objectContaining({
          objective: "Add a net-new objective card for swimlane filter shortcuts without recreating keyboard movement.",
          groundingMode: "source_scan",
          sourceRefCount: 1,
          weakGrounding: false,
        }),
      });
      expect(cloneBContinued.cards.filter((card) => card.title === "Add keyboard card movement")).toHaveLength(1);
      await commitProjectBoardGitArtifacts(cloneBContinued, "Continue objective Add Cards from clone B");
      await pushProjectBoardGitArtifacts(cloneBContinued);

      await pullProjectBoardGitArtifacts(cloneAInitial);
      const appliedOnCloneA = await applyProjectBoardGitProjection(cloneAInitial, {
        runtime: cloneA.listOrchestrationBoard(),
        applyProjection: (projectPath, projection) => cloneA.applyProjectBoardArtifactProjection(projectPath, projection),
      });
      const cloneAContinued = appliedOnCloneA.appliedBoard;
      expect(appliedOnCloneA).toMatchObject({ conflictCount: 0, localOverlayCount: 0 });
      expect(cloneAContinued.cards.find((card) => card.sourceId === "objective:keyboard-movement")?.objectiveProvenance).toMatchObject({
        objective: "Add accessible keyboard movement and swimlane filtering cards.",
        groundingMode: "source_scan",
      });
      expect(cloneAContinued.cards.find((card) => card.sourceId === "objective:swimlane-filter-shortcuts")?.objectiveProvenance).toMatchObject({
        objective: "Add a net-new objective card for swimlane filter shortcuts without recreating keyboard movement.",
        groundingMode: "source_scan",
      });
      expect(cloneAContinued.cards.filter((card) => card.title === "Add keyboard card movement")).toHaveLength(1);
    } finally {
      cloneA.close();
      cloneB.close();
    }
  });
});

async function tempRoot(prefix: string, roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
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

function sampleBoard(projectPath: string): ProjectBoardSummary {
  return {
    id: "board-handoff",
    projectPath,
    status: "active",
    title: "Starship handoff board",
    summary: "Two-clone handoff dogfood board.",
    charterId: "charter-handoff",
    charter: {
      id: "charter-handoff",
      boardId: "board-handoff",
      version: 1,
      status: "active",
      goal: "Build the playable starship slice.",
      currentState: "The shell and controls cards are planned.",
      targetUser: "Arcade space-game players.",
      nonGoals: [],
      qualityBar: "Every executable card needs concrete proof.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Starship handoff board\n",
      createdAt: now,
      updatedAt: now,
    },
    cards: [
      {
        id: "card-foundation",
        boardId: "board-handoff",
        title: "Create PixiJS shell",
        description: "Create the PixiJS shell, canvas, renderer lifecycle, and resize behavior.",
        status: "ready",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Foundation",
        labels: ["foundation"],
        blockedBy: [],
        acceptanceCriteria: ["Canvas mounts.", "Resize behavior is stable."],
        testPlan: { unit: ["Cover renderer lifecycle helpers."], integration: ["Run the app."], visual: ["Capture a nonblank canvas screenshot."], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:foundation",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "card-controls",
        boardId: "board-handoff",
        title: "Implement ship controls",
        description: "Add keyboard input, movement bounds, and deterministic ship state.",
        status: "ready",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Core Gameplay",
        labels: ["controls"],
        blockedBy: ["card-foundation"],
        acceptanceCriteria: ["Keyboard input moves the ship.", "Movement state is testable."],
        testPlan: { unit: ["Cover ship movement math."], integration: ["Run input smoke test."], visual: [], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:controls",
        createdAt: now,
        updatedAt: now,
      },
    ],
    sources: [
      {
        id: "source-gdd",
        boardId: "board-handoff",
        kind: "functional_spec",
        title: "Starship Game Design Document",
        summary: "PixiJS shell, movement, and proof expectations.",
        excerpt: "The first slice needs a PixiJS shell and keyboard controls.",
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
        id: "event-board-created",
        boardId: "board-handoff",
        kind: "board_created",
        title: "Board created",
        summary: "Created board.",
        entityKind: "board",
        entityId: "board-handoff",
        metadata: {},
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function sampleObjectiveBoard(projectPath: string): ProjectBoardSummary {
  return {
    id: "board-objective-handoff",
    projectPath,
    status: "active",
    title: "Objective Add Cards handoff board",
    summary: "Objective-card Git handoff dogfood board.",
    charterId: "charter-objective-handoff",
    charter: {
      id: "charter-objective-handoff",
      boardId: "board-objective-handoff",
      version: 1,
      status: "active",
      goal: "Build a small browser kanban board.",
      currentState: "The board shell exists and objective Add Cards is adding follow-up work.",
      targetUser: "Product team member managing local tasks.",
      nonGoals: [],
      qualityBar: "Every accepted card needs concrete proof expectations.",
      testPolicy: {},
      decisionPolicy: {},
      dependencyPolicy: {},
      budgetPolicy: {},
      sourcePolicy: {},
      markdown: "# Objective Add Cards handoff board\n",
      projectSummary: {
        summary: "The board has shell work represented; remaining work is keyboard movement and swimlane filtering.",
        majorSystems: ["Board shell", "Keyboard movement", "Swimlane filters"],
        sourceCoverage: ["docs/kanban-accessibility.md - functional_spec - primary authority"],
        risks: ["Keyboard affordances can be duplicated if inherited objective cards are omitted from continuation context."],
        dependencyHints: ["Avoid recreating keyboard movement before adding filter shortcuts."],
        unresolvedDecisions: [],
        citations: ["docs/kanban-accessibility.md"],
        coverageGaps: [],
        sourceChecksumSet: ["source-kanban-accessibility:aaaaaaaa"],
        charterAnswerChecksum: "bbbbbbbb",
        generatedAt: now,
        generator: "fallback_heuristic",
      },
      createdAt: now,
      updatedAt: now,
    },
    cards: [
      {
        id: "card-kanban-shell",
        boardId: "board-objective-handoff",
        title: "Build the basic kanban board shell",
        description: "Existing board shell card already represented before the objective Add Cards pass.",
        status: "ready",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Foundation",
        labels: ["kanban"],
        blockedBy: [],
        acceptanceCriteria: ["Columns render.", "Cards persist locally."],
        testPlan: { unit: ["Column model test."], integration: ["Run board smoke."], visual: ["Capture board shell."], manual: [] },
        sourceKind: "board_synthesis",
        sourceId: "synthesis:kanban-board-shell",
        sourceRefs: ["docs/kanban-accessibility.md"],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "card-keyboard-movement",
        boardId: "board-objective-handoff",
        title: "Add keyboard card movement",
        description: "Add keyboard-accessible movement between columns without recreating the existing board shell.",
        status: "draft",
        candidateStatus: "ready_to_create",
        priority: 2,
        phase: "Accessibility",
        labels: ["kanban", "accessibility"],
        blockedBy: ["card-kanban-shell"],
        acceptanceCriteria: ["Cards can move between columns with keyboard controls.", "Focus state remains visible after movement."],
        testPlan: {
          unit: ["Cover keyboard movement reducer."],
          integration: ["Run keyboard-only card movement smoke."],
          visual: [],
          manual: ["Verify card movement without a pointer."],
        },
        sourceKind: "board_synthesis",
        sourceId: "objective:keyboard-movement",
        sourceRefs: ["docs/kanban-accessibility.md"],
        objectiveProvenance: {
          objective: "Add accessible keyboard movement and swimlane filtering cards.",
          groundingMode: "source_scan",
          selectedSourceIds: [],
          sourceRefCount: 1,
          weakGrounding: false,
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    sources: [
      {
        id: "source-kanban-accessibility",
        boardId: "board-objective-handoff",
        kind: "functional_spec",
        title: "Kanban accessibility follow-up notes",
        summary: "The browser kanban board already supports columns and persistence. Add keyboard movement and swimlane filtering next.",
        excerpt: "Remaining product objective: add keyboard-accessible card movement and swimlane filtering without recreating the board setup.",
        path: "docs/kanban-accessibility.md",
        relevance: 98,
        createdAt: now,
        updatedAt: now,
      },
    ],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    events: [
      {
        id: "event-objective-board-created",
        boardId: "board-objective-handoff",
        kind: "board_created",
        title: "Board created",
        summary: "Created objective Add Cards handoff board.",
        entityKind: "board",
        entityId: "board-objective-handoff",
        metadata: {},
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function sampleRuntimeWithHandoffFollowUp() {
  return {
    tasks: [
      {
        id: "task-foundation",
        identifier: "LOCAL-1",
        title: "Create PixiJS shell",
        description: "Create the PixiJS shell.",
        state: "needs_review",
        priority: 1,
        labels: ["project-board"],
        blockedBy: [],
        branchName: "board/foundation",
        workspacePath: "/project/starship",
        sourceKind: "project_board_card",
        createdAt: now,
        updatedAt: now,
      },
    ],
    runs: [
      {
        id: "run-foundation",
        taskId: "task-foundation",
        attemptNumber: 1,
        status: "completed",
        workspacePath: "/project/starship",
        piSessionFile: "sessions/foundation.json",
        startedAt: now,
        lastEventAt: now,
        finishedAt: now,
        proofOfWork: {
          summary: "Created the PixiJS shell and captured proof.",
          commands: ["pnpm test"],
          changedFiles: ["/project/starship/src/main.ts"],
          screenshots: ["/project/starship/test-results/shell.png"],
          handoff: {
            summary: "Shell is ready for controls, with one resize-proof follow-up.",
            completed: ["Mounted one canvas.", "Added resize handler."],
            remaining: ["Controls can start after PM review."],
            risks: ["Resize proof is manual-only."],
            followUps: [
              {
                title: "Add resize regression coverage",
                reason: "The shell was manually resized, but there is no automated resize regression yet.",
                blockedBy: [],
              },
            ],
          },
        },
      },
    ],
  };
}
