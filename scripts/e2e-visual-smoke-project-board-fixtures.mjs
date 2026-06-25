import { join } from "node:path";

export async function seedProjectBoard(cdp, { workspace, evaluate, emitE2eEvent, createProjectBoardLinkedTask }) {
  const runningTask = await createProjectBoardLinkedTask(
    cdp,
    "Visual running card",
    "Synthetic task backing the visual project board detail panel.",
  );
  const initialState = await evaluate(cdp, "window.ambientDesktop.bootstrap()");
  const initialProject = initialState.projects.find((project) => project.path === initialState.workspace.path);
  if (!initialProject) throw new Error("Expected active project before creating visual project board.");
  const state = await evaluate(
    cdp,
    `window.ambientDesktop.createProjectBoard(${JSON.stringify({
      projectId: initialProject.id,
      title: "Visual Project Board",
      summary: "Deterministic project board fixture for visual regression.",
    })})`,
  );
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject) throw new Error("Expected active project before seeding visual project board.");
  if (!activeProject.board) throw new Error("Expected persisted project board before seeding visual project board.");
  const now = new Date().toISOString();
  const boardId = activeProject.board.id;
  const activeThreadId = state.activeThreadId;
  const candidateCard = {
    id: "visual-project-board-card",
    boardId,
    title: "Visual candidate detail",
    description: "Synthetic candidate used to capture the candidate detail editor.",
    status: "draft",
    candidateStatus: "needs_clarification",
    priority: 2,
    phase: "Visual QA",
    labels: ["visual", "draft"],
    blockedBy: ["LOCAL-1", "card:visual-prereq"],
    acceptanceCriteria: ["Open the detail editor.", "Review editable fields before approval."],
    testPlan: {
      unit: [],
      integration: [],
      visual: ["Capture browser proof that the candidate accelerates visually."],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "visual-plan-artifact",
    sourceRefs: ["visual-project-board-source-notes", "notes.md"],
    sourceThreadId: activeThreadId,
    sourceMessageId: "visual-plan-message",
    createdAt: now,
    updatedAt: now,
  };
  const readyCard = {
    id: "visual-project-board-ready-card",
    boardId,
    title: "Visual ready card",
    description: "Synthetic candidate ready for Local Task creation.",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 3,
    phase: "Visual QA",
    labels: ["visual", "ready"],
    blockedBy: [],
    acceptanceCriteria: ["Ready candidate appears in the ready column."],
    testPlan: {
      unit: ["Renderer groups ready draft candidates."],
      integration: ["Electron smoke sees ready candidates."],
      visual: ["Visual smoke captures the ready column."],
      manual: [],
    },
    sourceKind: "board_synthesis",
    sourceId: "visual-board-synthesis",
    sourceRefs: ["visual-project-board-source-notes"],
    sourceThreadId: activeThreadId,
    sourceMessageId: "visual-ready-message",
    createdAt: now,
    updatedAt: now,
  };
  const foundationCard = {
    id: "visual-project-board-foundation-card",
    boardId,
    title: "Visual foundation card",
    description: "Synthetic single-card phase used to prove the Map does not stretch sparse phase groups to match taller groups.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Foundation",
    labels: ["visual", "foundation"],
    blockedBy: [],
    acceptanceCriteria: ["Foundation phase stays compact beside a taller Visual QA phase."],
    testPlan: {
      unit: ["Renderer model assigns the ready phase tone."],
      integration: ["Electron smoke sees non-stretched phase groups."],
      visual: ["Visual smoke captures compact phase card layout."],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "visual-foundation-plan-artifact",
    sourceRefs: ["visual-project-board-source-notes"],
    sourceThreadId: activeThreadId,
    sourceMessageId: "visual-foundation-message",
    createdAt: now,
    updatedAt: now,
  };
  const runningCard = {
    id: "visual-project-board-running-card",
    boardId,
    title: "Visual running card",
    description: "Synthetic approved card used to capture an active linked Local Task lane.",
    status: "in_progress",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Visual QA",
    labels: ["visual", "active"],
    blockedBy: [],
    acceptanceCriteria: ["Active card appears in the In Progress lane."],
    testPlan: {
      unit: ["Renderer columns show linked task state."],
      integration: ["Electron smoke sees the active board lane."],
      visual: ["Visual smoke captures the active board."],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "visual-running-plan-artifact",
    sourceRefs: ["visual-project-board-source-notes"],
    sourceThreadId: activeThreadId,
    sourceMessageId: "visual-running-plan-message",
    orchestrationTaskId: runningTask.id,
    createdAt: now,
    updatedAt: now,
  };
  const dependentCard = {
    id: "visual-project-board-dependent-card",
    boardId,
    title: "Visual dependent card",
    description: "Synthetic approved card used to capture dependency map readiness.",
    status: "ready",
    candidateStatus: "ready_to_create",
    priority: 2,
    phase: "Visual QA",
    labels: ["visual", "dependent"],
    blockedBy: ["visual-project-board-running-card"],
    acceptanceCriteria: ["Dependency order shows this card after the running card."],
    testPlan: {
      unit: ["Renderer dependency model explains waiting cards."],
      integration: ["Electron smoke sees execution order readiness."],
      visual: ["Visual smoke captures dependency order."],
      manual: [],
    },
    sourceKind: "planner_plan",
    sourceId: "visual-dependent-plan-artifact",
    sourceThreadId: activeThreadId,
    sourceMessageId: "visual-dependent-plan-message",
    createdAt: now,
    updatedAt: now,
  };
  const proofScopeWarningRecord = {
    type: "warning",
    code: "proof_scope_mismatch",
    message:
      '"Visual candidate detail" looks like a pure/module-boundary card but has browser or screenshot proof. Move visual proof to a downstream renderer, gameplay, HUD, or proof card unless this card directly changes rendered pixels.',
    createdAt: now,
    metadata: {
      cardId: "visual-plan-artifact",
      sourceId: "visual-plan-artifact",
      title: "Visual candidate detail",
      proofOwnership: "pure_module",
      visualProofItems: ["Capture browser proof that the candidate accelerates visually."],
    },
  };
  const board = {
    id: boardId,
    projectPath: activeProject.path,
    status: "active",
    title: "Visual Project Board",
    summary: "Deterministic project board fixture for visual regression.",
    charterId: "visual-project-board-charter",
    charter: {
      id: "visual-project-board-charter",
      boardId,
      version: 1,
      status: "active",
      goal: "Charter preview for the visual project board.",
      currentState: "A deterministic board is available without live synthesis.",
      targetUser: "Ambient Desktop operator",
      nonGoals: ["Do not call the live provider for visual fixtures."],
      qualityBar: "Strict proof policy with unit, integration, and visual evidence.",
      testPolicy: { strict: true },
      decisionPolicy: { owner: "user" },
      dependencyPolicy: { mode: "explicit" },
      budgetPolicy: { localOnly: true },
      sourcePolicy: { includeWorkspaceFiles: true },
      markdown: "# Charter preview\n\nStrict proof policy for deterministic project-board visual regression.",
      createdAt: now,
      updatedAt: now,
    },
    activeDraftId: "visual-project-board-draft",
    cards: [candidateCard, readyCard, foundationCard, runningCard, dependentCard],
    sources: [
      {
        id: "visual-project-board-source-notes",
        boardId,
        kind: "markdown",
        sourceKey: "notes.md",
        contentHash: "visual-notes-hash",
        changeState: "new",
        title: "notes.md",
        summary: "Workspace notes used as a classified source for the visual board.",
        excerpt: "Visual Smoke Notes",
        path: join(workspace, "notes.md"),
        byteSize: 62,
        mtime: now,
        classificationReason: "Fixture source for project board visual smoke.",
        classifiedBy: "user",
        classificationConfidence: 1,
        authorityRole: "primary",
        includeInSynthesis: true,
        relevance: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    questions: [
      {
        id: "visual-project-board-question",
        boardId,
        question: "What should the visual project board prove?",
        required: true,
        answer: "The charter answers are captured for visual regression.",
        answeredAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    proposals: [
      {
        id: "visual-project-board-proof-proposal",
        boardId,
        status: "pending",
        summary: "Visual proof-scope warning proposal",
        goal: "Show proof-scope warnings before candidates become Local Tasks.",
        currentState: "A deterministic board fixture contains a warning matched to a proposal and Draft Inbox card.",
        targetUser: "Ambient Desktop operator",
        qualityBar: "Warnings stay advisory in the default flow, but they must be visible before ticketization.",
        assumptions: ["Visual proof belongs on rendered-surface cards, not pure module cards."],
        questions: [],
        answers: [],
        sourceNotes: ["Proof-scope warning seeded for visual regression."],
        cards: [
          {
            sourceId: "visual-plan-artifact",
            title: "Visual candidate detail",
            description: "Synthetic proposal card used to prove proof-scope warnings render before acceptance.",
            candidateStatus: "needs_clarification",
            priority: 2,
            phase: "Visual QA",
            labels: ["visual", "draft"],
            blockedBy: ["LOCAL-1", "card:visual-prereq"],
            acceptanceCriteria: ["Open the detail editor.", "Review editable fields before approval."],
            testPlan: {
              unit: [],
              integration: [],
              visual: ["Capture browser proof that the candidate accelerates visually."],
              manual: [],
            },
            sourceRefs: ["visual-project-board-source-notes", "notes.md"],
            clarificationQuestions: ["Should visual proof move to a downstream renderer card?"],
            reviewStatus: "pending",
          },
        ],
        model: "visual-fixture",
        durationMs: 1200,
        createdAt: now,
        updatedAt: now,
      },
    ],
    synthesisRuns: [
      {
        id: "visual-project-board-synthesis-run",
        boardId,
        status: "succeeded",
        stage: "board_applied",
        model: "visual-fixture",
        sourceCount: 1,
        includedSourceCount: 1,
        sourceCharCount: 62,
        promptCharCount: 1200,
        responseCharCount: 800,
        cardCount: 5,
        questionCount: 1,
        warningCount: 1,
        progressiveRecordCount: 1,
        progressiveSummary: {
          recordCount: 1,
          candidateCardCount: 0,
          questionCount: 0,
          sourceCoverageCount: 0,
          dependencyEdgeCount: 0,
          warningCount: 1,
          errorCount: 0,
          latestWarning: proofScopeWarningRecord.message,
        },
        progressiveRecords: [proofScopeWarningRecord],
        events: [
          {
            stage: "board_applied",
            title: "Charter finalized",
            summary: "The charter answers are captured.",
            metadata: {},
            createdAt: now,
          },
        ],
        startedAt: now,
        updatedAt: now,
        completedAt: now,
      },
    ],
    executionArtifacts: [
      {
        id: "visual-project-board-execution-artifact",
        boardId,
        cardId: runningCard.id,
        status: "running",
        source: "local_export",
        agentId: "visual-agent",
        workspaceBranch: "visual/project-board",
        startedAt: now,
        updatedAt: now,
        proof: {
          summary: "Integration / browser proof is in progress for the visual running card.",
          commands: ["pnpm run typecheck"],
          changedFiles: ["src/renderer/src/App.tsx"],
          screenshots: ["test-results/visual/01a-project-board.png"],
          browserTraces: [],
          visualChecks: [{ scenario: "01a-project-board", ok: true }],
          manualChecks: ["Manual review pending"],
          createdAt: now,
        },
      },
    ],
    events: [
      {
        id: "visual-project-board-created",
        boardId,
        kind: "board_created",
        title: "Board created",
        summary: "Visual board fixture created.",
        metadata: {},
        createdAt: now,
      },
      {
        id: "visual-project-board-charter-finalized",
        boardId,
        kind: "charter_finalized",
        title: "Charter finalized",
        summary: "Charter finalized for visual regression.",
        metadata: {},
        createdAt: now,
      },
    ],
    claims: { active: [], expired: [], conflicts: [] },
    createdAt: now,
    updatedAt: now,
  };
  const nextState = {
    ...state,
    projects: state.projects.map((project) => (project.path === activeProject.path ? { ...project, board } : project)),
  };
  await emitE2eEvent(cdp, { type: "state", state: nextState });
  return nextState;
}

export async function installProjectBoardPullReviewFixture(cdp, state, { evaluate }) {
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before installing pull-review fixture.");
  const board = activeProject.board;
  const now = new Date().toISOString();
  const status = {
    boardId: board.id,
    projectRoot: activeProject.path,
    artifactRoot: ".ambient/board",
    isGitRepository: true,
    repoRoot: activeProject.path,
    branch: "main",
    remote: "origin",
    hasRemote: true,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    dirtyBoardFileCount: 0,
    dirtyBoardFiles: [],
    mode: "git_ready",
    message: "Visual fixture: pulled board artifacts need review.",
    projection: {
      ok: false,
      valid: true,
      differenceCount: 2,
      differences: ["card visual-project-board-running-card differs.", "run visual-project-board-execution-artifact proof differs."],
      conflictCount: 1,
      changes: [
        {
          id: "update:card:visual-project-board-running-card",
          kind: "card",
          action: "update",
          entityId: "visual-project-board-running-card",
          title: "Visual running card",
          summary: 'Pulled board updates card "Visual running card".',
          local: { title: "Visual running card", status: "in_progress", candidateStatus: "ready_to_create", updatedAt: now },
          pulled: { title: "Visual running card", status: "ready", candidateStatus: "ready_to_create", updatedAt: now },
          changedFields: ["status", "updatedAt"],
          conflict: true,
          conflictReason: "The local card is in_progress; applying the pulled ready card could overwrite active local execution state.",
          recommendedResolution: "manual_resolution_required",
          applyConsequence: "Replace this desktop's active card fields with the pulled card artifact.",
          keepLocalConsequence: "Keep this desktop's active card fields for the running work.",
          deferConsequence: "Leave this card unchanged until collaborators coordinate.",
        },
        {
          id: "update:runtime:visual-project-board-execution-artifact",
          kind: "runtime",
          action: "update",
          entityId: "visual-project-board-execution-artifact",
          title: "Run artifact visual-project-board-execution-artifact",
          summary: "Pulled board updates execution proof/handoff artifacts for card visual-project-board-running-card.",
          pulled: { title: "Run visual-project-board-execution-artifact", status: "handoff", updatedAt: now },
          changedFields: ["proof", "handoff"],
          conflict: false,
          recommendedResolution: "apply_pulled",
          applyConsequence:
            "Import the pulled proof and handoff so PM Review and downstream readiness can use collaborator execution evidence.",
          keepLocalConsequence:
            "Keep this desktop's current execution proof view by exporting and committing local runtime artifacts instead.",
          deferConsequence: "Leave pulled proof/handoff artifacts unapplied.",
        },
      ],
      fileCount: 12,
      cardCount: board.cards.length,
      sourceCount: board.sources.length,
      eventCount: board.events.length,
      proposalRunCount: board.synthesisRuns.length,
      runArtifactCount: 1,
      activeClaimCount: 0,
      expiredClaimCount: 0,
      claimConflictCount: 0,
      claimedCardIds: [],
    },
  };
  await evaluate(
    cdp,
    `
    (() => {
      const status = ${JSON.stringify(status)};
      window.__ambientVisualProjectBoardGitStatus = status;
    })()
  `,
  );
}

export function projectBoardRevisionState(state) {
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before creating visual revision state.");
  const now = new Date().toISOString();
  const board = activeProject.board;
  const revisionQuestions = [
    [
      "visual-project-board-revision-goal",
      "What is the primary outcome this project board should optimize?",
      "Build a stable board flow for converting project plans into executable work.",
    ],
    [
      "visual-project-board-revision-source",
      "Which sources should be treated as authoritative?",
      "Treat project notes as authoritative and use threads to fill gaps.",
    ],
    [
      "visual-project-board-revision-judgment",
      "How should Ambient/Pi handle ambiguous implementation decisions?",
      "Ask for clarification when scope changes; otherwise make conservative implementation choices.",
    ],
    [
      "visual-project-board-revision-proof",
      "What proof should cards provide before completion?",
      "Require unit, integration, and visual proof for user-facing board behavior.",
    ],
    [
      "visual-project-board-revision-order",
      "How should dependencies and retries be handled?",
      "Sequence cards by dependency order and keep retrying until proof is satisfied or a blocker is explicit.",
    ],
  ].map(([id, question, answer]) => ({
    id,
    boardId: board.id,
    question,
    required: true,
    answer,
    answeredAt: now,
    createdAt: now,
    updatedAt: now,
  }));
  const revisionBoard = {
    ...board,
    status: "draft",
    summary: "Revision draft waiting for charter review.",
    charterId: "visual-project-board-charter-revision",
    charter: {
      ...board.charter,
      id: "visual-project-board-charter-revision",
      version: (board.charter?.version ?? 1) + 1,
      status: "draft",
      goal: "Build a stable board flow for converting project plans into executable work.",
      markdown: `${board.charter?.markdown ?? "# Charter preview"}\n\n## Revision 2\n\nReview prefilled answers before applying this charter revision.`,
      updatedAt: now,
    },
    questions: revisionQuestions,
    events: [
      {
        id: "visual-project-board-revision-started",
        boardId: board.id,
        kind: "board_revision_started",
        title: "Board revision started",
        summary: "Visual revision draft created.",
        metadata: {},
        createdAt: now,
      },
      ...(board.events ?? []),
    ],
    updatedAt: now,
  };
  return {
    ...state,
    projects: state.projects.map((project) => (project.path === activeProject.path ? { ...project, board: revisionBoard } : project)),
  };
}
