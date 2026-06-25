import { spawn } from "node:child_process";
import { join } from "node:path";
import { evaluate, waitFor } from "./e2e-electron-smoke-cdp-helpers.mjs";
import {
  clickButton,
  clickButtonByTitle,
  clickEnabledButtonInRow,
  clickProjectBoardTab,
  fillInput,
  openProjectBoardSetup,
  selectProjectBoardMapBlocker,
  selectProjectBoardSourceKind,
} from "./e2e-electron-smoke-dom-actions.mjs";

export async function runProjectBoardSmoke(cdp) {
  await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title: "E2E unattached task",
      description: "Existing Local Task that should be attachable from the project board.",
      state: "todo",
      priority: 6,
      labels: ["e2e", "orphan"],
    })})`,
  );
  await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title: "E2E evidence task",
      description: "Existing Local Task that should be importable as completed evidence.",
      state: "done",
      priority: 7,
      labels: ["e2e", "evidence"],
    })})`,
  );
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button?.disabled && button.title.includes("Build a project board"));
    },
    "project board toolbar add plan disabled before board",
  );
  await openProjectBoardSetup(cdp);
  await clickButton(cdp, "Build Board");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-workspace")?.textContent?.includes("Kickoff draft"),
    "project board created",
    120_000,
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-kickoff")?.textContent?.includes("Kickoff interview"),
    "project board kickoff",
  );
  const kickoffAnswers = [
    "Prioritize a stable, test-covered implementation.",
    "Use notes.md as source context and ask if the thread conflicts with it.",
    "Make small reversible implementation choices unless scope changes.",
    "Require unit, integration, and visual proof before moving cards to review.",
  ];
  await answerProjectBoardKickoff(cdp, kickoffAnswers, "project board");
  await clickButton(cdp, "Activate Board");
  await waitFor(cdp, () => document.querySelector(".project-board-tabs")?.textContent?.includes("Draft Inbox"), "project board tabs");
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-charter-preview")?.textContent?.includes("Charter preview"),
    "project board charter preview",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-review")?.textContent?.includes("notes.md"),
    "project board source review",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-review")?.textContent?.includes("Package: ambient-e2e-pi-package"),
    "project board package config source",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-review")?.textContent?.includes("Git working tree"),
    "project board git state source",
  );
  await selectProjectBoardSourceKind(cdp, "notes.md", "functional_spec");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-source-item")].some(
        (item) => item.textContent?.includes("notes.md") && item.querySelector("select")?.value === "functional_spec",
      ),
    "project board source reclassified",
  );
  await clickButton(cdp, "Refresh Sources");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-source-item")].some(
        (item) => item.textContent?.includes("notes.md") && item.querySelector("select")?.value === "functional_spec",
      ),
    "project board source reclassification preserved after refresh",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((button) => !button.disabled && button.textContent?.includes("Refresh Sources")),
    "project board source refresh settled",
    120_000,
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Ready To Create"),
    "project board draft candidate columns",
  );
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed before toolbar plan promotion");
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button?.disabled && button.title.includes("Create a ready planner plan first"));
    },
    "project board toolbar add plan disabled without ready plan",
  );
  await injectReadyPlannerPlanArtifact(cdp, "E2E toolbar plan");
  await waitFor(
    cdp,
    () => {
      const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === "Add Plan to Board");
      return Boolean(button && !button.disabled && button.textContent?.includes("Add Plan to Board"));
    },
    "project board toolbar add plan enabled",
  );
  await clickButton(cdp, "Add Plan to Board");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-workspace")?.textContent?.includes("Active board"),
    "project board opened by toolbar plan promotion",
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E toolbar plan"),
    "project board toolbar plan promoted",
  );
  await clickButton(cdp, "New Draft Card");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("New draft card"),
    "project board manual draft card",
  );
  await injectProjectBoardBatchTicketizationCandidates(cdp);
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E batch dependent card"),
    "project board batch ready candidates",
  );
  await clickButton(cdp, "Create 3 Ready Tasks");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Create Ready Tasks"),
    "project board batch ticketization complete",
  );
  const created = await desktopState(cdp);
  const activeProject = created.projects.find((project) => project.path === created.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project to expose a project board after Build Board.");
  if (activeProject.board.status !== "active") throw new Error(`Expected active board, got ${activeProject.board.status}.`);
  if (activeProject.board.charter?.status !== "active")
    throw new Error("Expected active project board charter after kickoff finalization.");
  if (activeProject.board.charter?.goal !== kickoffAnswers[0])
    throw new Error("Expected kickoff answer to become the active charter goal.");
  if (!activeProject.board.sources.some((source) => source.path === "notes.md" && source.kind === "functional_spec")) {
    throw new Error("Expected notes.md in project board sources as a user-reclassified spec.");
  }
  if (!activeProject.board.cards.some((card) => card.sourceKind === "planner_plan" && card.sourceId === "e2e-toolbar-plan-artifact")) {
    throw new Error("Expected toolbar plan promotion to create a planner-plan board candidate.");
  }
  if (!activeProject.board.cards.some((card) => card.sourceKind === "manual" && card.title === "New draft card")) {
    throw new Error("Expected New Draft Card to create a manual board candidate.");
  }
  const batchReady = activeProject.board.cards.find((card) => card.id === "e2e-batch-ready-card");
  const batchDependent = activeProject.board.cards.find((card) => card.id === "e2e-batch-dependent-card");
  if (!batchReady?.orchestrationTaskId || !batchDependent?.orchestrationTaskId) {
    throw new Error("Expected batch ready candidate cards to become Local Tasks.");
  }
  const batchOrchestration = await evaluate(cdp, "window.ambientDesktop.listOrchestrationBoard()");
  const batchReadyTask = batchOrchestration.tasks.find((task) => task.id === batchReady.orchestrationTaskId);
  const batchDependentTask = batchOrchestration.tasks.find((task) => task.id === batchDependent.orchestrationTaskId);
  if (!batchReadyTask || !batchDependentTask?.blockedBy.includes(batchReadyTask.identifier)) {
    throw new Error("Expected batch ticketization to preserve board dependency as a Local Task blocker.");
  }
  if (!activeProject.board.events?.some((event) => event.kind === "manual_card_created")) {
    throw new Error("Expected manual card creation to be captured in board history.");
  }
  if (!activeProject.board.events?.some((event) => event.kind === "ready_tasks_created")) {
    throw new Error("Expected batch ready task creation to be captured in board history.");
  }
  await injectProjectBoardCandidate(cdp, "E2E editable candidate");
  await clickProjectBoardTab(cdp, "Board");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-unattached-tasks")?.textContent?.includes("E2E unattached task"),
    "project board unattached local task",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-unattached-tasks")?.textContent?.includes("E2E evidence task"),
    "project board evidence local task",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-unattached-task", "E2E unattached task", "Attach");
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".project-board-column")].some((column) => column.textContent?.includes("E2E unattached task")),
    "project board attached local task lane",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-unattached-task", "E2E evidence task", "Mark Covered");
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("E2E evidence task"),
    "project board imported evidence card",
  );
  await clickProjectBoardTab(cdp, "Board");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-column")].some(
        (column) => column.textContent?.includes("In Progress") && column.textContent?.includes("E2E running card"),
      ),
    "project board linked task in progress lane",
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await clickEnabledButtonInRow(cdp, ".project-board-card", "E2E editable candidate", "Details");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Candidate detail"),
    "project board candidate detail",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Split Criteria"),
    "project board split action",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Dependencies / blockers"),
    "project board blocker field",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Strict proof policy"),
    "project board proof gate",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-candidate-detail button")].some(
        (button) => button.textContent?.includes("Mark Ready") && button.disabled,
      ),
    "project board mark ready proof gated",
  );
  await fillInput(cdp, '.project-board-candidate-detail input[placeholder="Candidate title"]', "Updated E2E candidate");
  await fillInput(
    cdp,
    '.project-board-candidate-detail textarea[placeholder="One blocker id or card reference per line"]',
    "LOCAL-1\ncard:e2e-plan-artifact",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-candidate-detail button")].some(
        (button) => button.textContent?.includes("Save Details") && !button.disabled,
      ),
    "project board candidate save enabled",
  );
  await clickProjectBoardTab(cdp, "Map");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-panel")?.textContent?.includes("dependency issue"),
    "project board map tab",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-panel")?.textContent?.includes("E2E editable candidate"),
    "project board map candidate",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-issues")?.textContent?.includes("Unresolved blocker"),
    "project board map unresolved blocker",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Execution order"),
    "project board execution order",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("E2E dependent card"),
    "project board dependent execution item",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Waiting on dependencies"),
    "project board dependency readiness label",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-panel")?.textContent?.includes("Waiting on E2E running card"),
    "project board map readiness badge",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-panel")?.textContent?.includes("Edit dependencies"),
    "project board dependency edit controls",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-map-card", "E2E editable candidate", "Remove blocker LOCAL-1");
  await waitFor(
    cdp,
    () =>
      ![...document.querySelectorAll(".project-board-map-card")].some(
        (card) => card.textContent?.includes("E2E editable candidate") && card.textContent.includes("LOCAL-1"),
      ),
    "project board dependency blocker removed",
  );
  await selectProjectBoardMapBlocker(cdp, "E2E editable candidate", "E2E running card");
  await clickEnabledButtonInRow(cdp, ".project-board-map-card", "E2E editable candidate", "Add blocker");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-map-card")].some(
        (card) => card.textContent?.includes("E2E editable candidate") && card.textContent.includes("Waiting on E2E running card"),
      ),
    "project board dependency blocker added",
  );
  await clickProjectBoardTab(cdp, "Tests");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Strict proof gate"),
    "project board tests tab",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Missing proof"),
    "project board missing proof lane",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Integration / browser proof"),
    "project board integration browser proof lane",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("Manual review"),
    "project board manual proof lane",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-tests-panel")?.textContent?.includes("No proof expectation recorded"),
    "project board missing proof card copy",
  );
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-charter-preview")?.textContent?.includes("Charter preview"),
    "project board charter tab",
  );
  await clickProjectBoardTab(cdp, "History");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Charter finalized"),
    "project board history charter event",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Sources refreshed"),
    "project board history source event",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Source reclassified"),
    "project board history source reclassified event",
  );
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed");
  await clickButton(cdp, "Open Board");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-workspace")?.textContent?.includes("Active board"),
    "project board reopened",
  );
  await clickButtonByTitle(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed again");
  await deleteProjectBoardImportFixtureTasks(cdp);
}

async function answerProjectBoardKickoff(cdp, answers, label) {
  for (let index = 0; index < 10; index += 1) {
    const hasQuestion = await evaluate(cdp, `Boolean(document.querySelector(".project-board-question textarea"))`);
    if (!hasQuestion) return;
    await fillInput(cdp, ".project-board-question textarea", answers[index] ?? answers[answers.length - 1]);
    const clicked = await evaluate(
      cdp,
      `
      (() => {
        const root = document.querySelector(".project-board-question");
        const button = [...(root?.querySelectorAll("button") ?? [])].find(
          (item) => !item.disabled && (item.textContent?.includes("Next") || item.textContent?.includes("Finish Questions"))
        );
        button?.click();
        return Boolean(button);
      })()
    `,
    );
    if (!clicked) throw new Error(`Unable to advance ${label} question ${index + 1}.`);
    const progressLabel = `${index + 1} answered`;
    await waitFor(
      cdp,
      new Function(
        `return !document.querySelector(".project-board-question textarea") || document.querySelector(".project-board-kickoff")?.textContent?.includes(${JSON.stringify(
          progressLabel,
        )});`,
      ),
      `${label} answer ${index + 1} saved`,
    );
  }
  throw new Error(`Unable to finish ${label} kickoff questions within 10 answers.`);
}

async function desktopState(cdp) {
  return evaluate(cdp, "window.ambientDesktop.bootstrap()");
}

async function injectReadyPlannerPlanArtifact(cdp, title) {
  const state = await desktopState(cdp);
  const projectPath = state.workspace.path;
  const threadId = state.activeThreadId;
  const messageId = "e2e-toolbar-plan-message";
  const artifactId = "e2e-toolbar-plan-artifact";
  const now = new Date().toISOString();
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM planner_plan_artifacts WHERE id = ${sqlString(artifactId)};
    DELETE FROM messages WHERE id = ${sqlString(messageId)};
    INSERT INTO messages (id, thread_id, role, content, created_at, metadata_json)
    VALUES (
      ${sqlString(messageId)},
      ${sqlString(threadId)},
      'assistant',
      ${sqlString(`## ${title}\n\nPromote this ready plan from the thread toolbar.`)},
      ${sqlString(now)},
      ${sqlString(JSON.stringify({ kind: "planner-plan", plannerPlanArtifactId: artifactId }))}
    );
    INSERT INTO planner_plan_artifacts
      (id, thread_id, source_message_id, status, title, summary, content, steps_json, open_questions_json, risks_json, verification_json, created_at, updated_at)
    VALUES (
      ${sqlString(artifactId)},
      ${sqlString(threadId)},
      ${sqlString(messageId)},
      'ready',
      ${sqlString(title)},
      'Ready plan inserted by the Electron smoke test.',
      ${sqlString(`## ${title}\n\nToolbar promotion should create a draft board card.`)},
      ${sqlString(JSON.stringify([{ id: "step-1", title: "Promote a ready plan from the toolbar." }]))},
      '[]',
      '[]',
      ${sqlString(JSON.stringify(["Integration proof from toolbar promotion."]))},
      ${sqlString(now)},
      ${sqlString(now)}
    );
    UPDATE threads SET updated_at = ${sqlString(now)}, last_message_preview = ${sqlString(title)} WHERE id = ${sqlString(threadId)};
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function injectProjectBoardCandidate(cdp, title) {
  const state = await desktopState(cdp);
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before injecting candidate.");
  const now = new Date().toISOString();
  const runningTask = await createProjectBoardLinkedTask(
    cdp,
    "E2E running card",
    "Synthetic task backing the active project board detail panel.",
  );
  await persistProjectBoardFixtureCards({
    boardId: activeProject.board.id,
    projectPath: activeProject.path,
    threadId: state.activeThreadId,
    title,
    runningTaskId: runningTask.id,
    now,
  });
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function injectProjectBoardBatchTicketizationCandidates(cdp) {
  const state = await desktopState(cdp);
  const activeProject = state.projects.find((project) => project.path === state.workspace.path);
  if (!activeProject?.board) throw new Error("Expected active project board before injecting batch candidates.");
  const now = new Date().toISOString();
  const cards = [
    {
      id: "e2e-batch-ready-card",
      title: "E2E batch ready card",
      description: "Ready candidate used to exercise batch Local Task creation.",
      blockedBy: [],
      acceptanceCriteria: ["Create the first batch Local Task."],
      testPlan: { unit: ["Batch ticketization unit coverage exists."], integration: [], visual: [], manual: [] },
      sourceId: "manual:e2e-batch-ready-card",
    },
    {
      id: "e2e-batch-dependent-card",
      title: "E2E batch dependent card",
      description: "Ready candidate whose Local Task should wait on the first batch card.",
      blockedBy: ["e2e-batch-ready-card"],
      acceptanceCriteria: ["Create a dependent Local Task with a resolved blocker."],
      testPlan: { unit: [], integration: ["Electron smoke verifies the resolved blocker."], visual: [], manual: [] },
      sourceId: "manual:e2e-batch-dependent-card",
    },
  ];
  const values = cards
    .map(
      (card) => `(
        ${sqlString(card.id)},
        ${sqlString(activeProject.board.id)},
        ${sqlString(card.title)},
        ${sqlString(card.description)},
        'draft',
        'ready_to_create',
        2,
        'E2E',
        ${sqlString(JSON.stringify(["e2e", "batch"]))},
        ${sqlString(JSON.stringify(card.blockedBy))},
        ${sqlString(JSON.stringify(card.acceptanceCriteria))},
        ${sqlString(JSON.stringify(card.testPlan))},
        'manual',
        ${sqlString(card.sourceId)},
        NULL,
        NULL,
        NULL,
        ${sqlString(now)},
        ${sqlString(now)}
      )`,
    )
    .join(",\n");
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM project_board_cards
    WHERE id IN ('e2e-batch-ready-card', 'e2e-batch-dependent-card')
       OR (board_id = ${sqlString(activeProject.board.id)} AND source_id IN ('manual:e2e-batch-ready-card', 'manual:e2e-batch-dependent-card'));
    DELETE FROM orchestration_tasks
    WHERE source_kind = 'project_board_card' AND source_url IN ('project-board-card:e2e-batch-ready-card', 'project-board-card:e2e-batch-dependent-card');
    INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
       created_at, updated_at)
    VALUES ${values};
    UPDATE project_boards SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(activeProject.board.id)};
  `;
  await runCommand("sqlite3", [join(activeProject.path, ".ambient-codex", "state.sqlite"), sql], activeProject.path);
  const nextState = await desktopState(cdp);
  await emitE2eEvent(cdp, { type: "state", state: nextState });
}

async function persistProjectBoardFixtureCards({ boardId, projectPath, threadId, title, runningTaskId, now }) {
  const cards = [
    {
      id: "e2e-project-board-card",
      title,
      description: "Synthetic candidate used to exercise the candidate detail editor.",
      status: "draft",
      candidateStatus: "needs_clarification",
      priority: 3,
      phase: "E2E",
      labels: ["e2e", "draft"],
      blockedBy: ["LOCAL-1"],
      acceptanceCriteria: ["Candidate detail opens.", "Edited title enables save."],
      testPlan: { unit: [], integration: [], visual: [], manual: [] },
      sourceId: "e2e-plan-artifact",
      sourceMessageId: "e2e-plan-message",
      orchestrationTaskId: null,
    },
    {
      id: "e2e-project-board-running-card",
      title: "E2E running card",
      description: "Synthetic approved card used to prove active board lanes render linked Local Task state.",
      status: "ready",
      candidateStatus: "ready_to_create",
      priority: 1,
      phase: "E2E",
      labels: ["e2e", "active"],
      blockedBy: [],
      acceptanceCriteria: ["Active card appears in the In Progress lane."],
      testPlan: {
        unit: ["Renderer columns show linked task state."],
        integration: ["Electron smoke sees the active board lane."],
        visual: ["Visual smoke captures the active board."],
        manual: [],
      },
      sourceId: "e2e-running-plan-artifact",
      sourceMessageId: "e2e-running-plan-message",
      orchestrationTaskId: runningTaskId,
    },
    {
      id: "e2e-project-board-dependent-card",
      title: "E2E dependent card",
      description: "Synthetic approved card used to prove dependency map readiness labels.",
      status: "ready",
      candidateStatus: "ready_to_create",
      priority: 2,
      phase: "E2E",
      labels: ["e2e", "dependent"],
      blockedBy: ["e2e-project-board-running-card"],
      acceptanceCriteria: ["Dependency order shows this card after the running card."],
      testPlan: {
        unit: ["Renderer dependency model explains waiting cards."],
        integration: ["Electron smoke sees execution order readiness."],
        visual: [],
        manual: [],
      },
      sourceId: "e2e-dependent-plan-artifact",
      sourceMessageId: "e2e-dependent-plan-message",
      orchestrationTaskId: null,
    },
  ];
  const values = cards
    .map(
      (card) => `(
        ${sqlString(card.id)},
        ${sqlString(boardId)},
        ${sqlString(card.title)},
        ${sqlString(card.description)},
        ${sqlString(card.status)},
        ${sqlString(card.candidateStatus)},
        ${card.priority},
        ${sqlString(card.phase)},
        ${sqlString(JSON.stringify(card.labels))},
        ${sqlString(JSON.stringify(card.blockedBy))},
        ${sqlString(JSON.stringify(card.acceptanceCriteria))},
        ${sqlString(JSON.stringify(card.testPlan))},
        'planner_plan',
        ${sqlString(card.sourceId)},
        ${sqlString(threadId)},
        ${sqlString(card.sourceMessageId)},
        ${card.orchestrationTaskId ? sqlString(card.orchestrationTaskId) : "NULL"},
        ${sqlString(now)},
        ${sqlString(now)}
      )`,
    )
    .join(",\n");
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM project_board_cards
    WHERE id IN ('e2e-project-board-card', 'e2e-project-board-running-card', 'e2e-project-board-dependent-card')
       OR (board_id = ${sqlString(boardId)} AND source_id IN ('e2e-plan-artifact', 'e2e-running-plan-artifact', 'e2e-dependent-plan-artifact'));
    INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
       created_at, updated_at)
    VALUES ${values};
    UPDATE project_boards SET updated_at = ${sqlString(now)} WHERE id = ${sqlString(boardId)};
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
}

async function deleteProjectBoardImportFixtureTasks(cdp) {
  const state = await desktopState(cdp);
  const projectPath = state.workspace.path;
  const sql = `
    PRAGMA busy_timeout = 5000;
    DELETE FROM orchestration_tasks
    WHERE title IN ('E2E unattached task', 'E2E evidence task');
  `;
  await runCommand("sqlite3", [join(projectPath, ".ambient-codex", "state.sqlite"), sql], projectPath);
}

async function createProjectBoardLinkedTask(cdp, title, description) {
  const board = await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title,
      description,
      state: "in_progress",
      priority: 1,
      labels: ["project-board", "e2e", "active"],
    })})`,
  );
  const task = board.tasks.find((candidate) => candidate.title === title);
  if (!task) throw new Error(`Expected linked task to be created for ${title}.`);
  return task;
}

async function emitE2eEvent(cdp, event) {
  await evaluate(cdp, `window.ambientDesktop.emitE2eEvent(${JSON.stringify(event)})`);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${exitCode}: ${stderr}`));
    });
  });
}
