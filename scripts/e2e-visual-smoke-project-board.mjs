import {
  installProjectBoardPullReviewFixture,
  projectBoardRevisionState,
  seedProjectBoard,
} from "./e2e-visual-smoke-project-board-fixtures.mjs";

export async function runProjectBoardVisualSmoke(deps) {
  const {
    cdp,
    workspace,
    evaluate,
    emitE2eEvent,
    waitFor,
    clickButton,
    clickProjectionReviewResolution,
    clickProjectBoardTab,
    clickEnabledButtonInRow,
    assertProjectBoardProofScopeWarningsStable,
    captureVisual,
    delay,
    assertProjectBoardButtonsHaveTooltips,
    clickProjectBoardCard,
    clickProjectBoardActiveCardDetailTab,
    clickProjectBoardDialogButton,
    clickProjectBoardKickoffButton,
    createProjectBoardLinkedTask,
  } = deps;

  await evaluate(
    cdp,
    `window.ambientDesktop.createOrchestrationTask(${JSON.stringify({
      title: "Visual unattached task",
      description: "Existing Local Task visible from the project board import area.",
      state: "todo",
      priority: 6,
      labels: ["visual", "orphan"],
    })})`,
  );
  const projectBoardState = await seedProjectBoard(cdp, { workspace, evaluate, emitE2eEvent, createProjectBoardLinkedTask });
  await installProjectBoardPullReviewFixture(cdp, projectBoardState, { evaluate });
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((item) => item.textContent?.includes("Open Board")),
    "visual project board open action",
  );
  await clickButton(cdp, "Open Board");
  await emitE2eEvent(cdp, { type: "state", state: projectBoardState });
  await waitFor(cdp, () => document.querySelector(".project-board-tabs")?.textContent?.includes("Draft Inbox"), "project board tabs");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-collaboration-readiness") !== null,
    "project board collaboration readiness",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-projection-review")?.textContent?.includes("Resolve pulled card conflicts"),
    "project board pulled conflict review",
  );
  await waitFor(
    cdp,
    () =>
      document
        .querySelector(".project-board-projection-review")
        ?.textContent?.includes("Pulled board updates execution proof/handoff artifacts"),
    "project board pulled runtime proof row",
  );
  await clickProjectionReviewResolution(cdp, "Visual running card", "Keep local");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-projection-review")?.textContent?.includes("re-export this local card as an overlay"),
    "project board keep-local overlay consequence",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll("button")].some((item) => item.textContent?.includes("Apply Resolved Pull") && !item.disabled),
    "project board resolved pull apply action",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-synthesis-activity")?.textContent?.includes("Board applied"),
    "project board latest operation ledger",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-synthesis-activity")?.textContent?.includes("Runtime records"),
    "project board latest operation metrics",
  );
  await delay(500);
  await clickProjectBoardTab(cdp, "Decisions");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-proposal-panel")?.textContent?.includes("Visual proof-scope warning proposal"),
    "project board proof warning proposal",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-proof-scope-warning-list")?.textContent?.includes("Visual candidate detail"),
    "project board Decisions proof warning ledger",
  );
  await waitFor(
    cdp,
    () =>
      document
        .querySelector(".project-board-proposal-cards .project-board-proof-scope-summary")
        ?.textContent?.includes("Proof ownership warning"),
    "project board proposal card proof warning",
  );
  await assertProjectBoardProofScopeWarningsStable(cdp, "project board Decisions proof-scope warnings");
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-draft-board .project-board-card")].some(
        (card) =>
          card.textContent?.includes("Visual candidate detail") &&
          card.querySelector(".project-board-proof-scope-summary")?.textContent?.includes("Proof ownership warning"),
      ),
    "project board draft card proof warning",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-card", "Visual candidate detail", "Details");
  await waitFor(
    cdp,
    () =>
      document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Proof ownership warning") &&
      document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Move screenshot/browser/visual proof"),
    "project board candidate detail proof warning",
  );
  await assertProjectBoardProofScopeWarningsStable(cdp, "project board Draft Inbox proof-scope warnings");
  await evaluate(cdp, `document.querySelector(".project-board-candidate-detail")?.scrollIntoView({ block: "center" })`);
  await captureVisual(cdp, "01c-project-board-proof-warning");
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-charter-preview")?.textContent?.includes("Charter preview"),
    "project board charter preview",
  );
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-review")?.textContent?.includes("notes.md"),
    "project board sources",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-source-item")].some(
        (item) => item.textContent?.includes("notes.md") && item.querySelector("select"),
      ),
    "project board source classification control",
  );
  await evaluate(
    cdp,
    `(() => {
      const item = [...document.querySelectorAll(".project-board-source-item")]
        .find((candidate) => candidate.textContent?.includes("notes.md"));
      item?.click();
    })()`,
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-detail")?.textContent?.includes("Source inspector"),
    "project board source inspector",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-detail")?.textContent?.includes("Selected source"),
    "project board selected source badge",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-detail")?.textContent?.includes("Visual candidate detail"),
    "project board source referenced card link",
  );
  await evaluate(
    cdp,
    `(() => {
      const detail = document.querySelector(".project-board-source-detail");
      const button = [...detail?.querySelectorAll("button") ?? []].find((item) => item.textContent?.includes("Visual candidate detail"));
      button?.click();
    })()`,
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Visual candidate detail"),
    "project board source to candidate inspector link",
  );
  await clickProjectBoardTab(cdp, "Draft Inbox");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Ready To Create"),
    "project board draft candidates",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-board")?.textContent?.includes("Triage before execution"),
    "project board draft triage language",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-draft-drop-hint")?.textContent?.includes("Already covered work"),
    "project board draft drop hint",
  );
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-card")].some((card) =>
        card.getAttribute("title")?.includes("Drag it between Draft Inbox columns"),
      ),
    "project board card drag affordance title",
  );
  await waitFor(
    cdp,
    () => [...document.querySelectorAll(".project-board-drag-affordance")].some((item) => item.textContent?.includes("drag to triage")),
    "project board card drag affordance copy",
  );
  await waitFor(
    cdp,
    () => /Create\s+\d+\s+Ready\s+Tasks?/i.test(document.querySelector(".project-board-draft-board")?.textContent ?? ""),
    "visual project board batch ticketization action",
  );
  await clickEnabledButtonInRow(cdp, ".project-board-card", "Visual candidate detail", "Details");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Candidate inspector"),
    "project board candidate inspector",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Selected candidate"),
    "project board selected candidate badge",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Dependencies / blockers"),
    "project board blocker field",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Visual proof"),
    "project board proof gate",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-candidate-detail")?.textContent?.includes("Claim Card"),
    "project board candidate claim control",
  );
  await assertProjectBoardButtonsHaveTooltips(cdp, "project board draft inbox controls");
  await evaluate(
    cdp,
    `(() => {
      const detail = document.querySelector(".project-board-candidate-detail");
      const button = [...detail?.querySelectorAll(".project-board-source-link-button") ?? []].find((item) => item.textContent?.includes("notes.md"));
      button?.click();
    })()`,
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-source-detail")?.textContent?.includes("Selected source"),
    "project board candidate source link opens source inspector",
  );
  await clickProjectBoardTab(cdp, "Proof");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-proof-panel")?.textContent?.includes("proof item"),
    "project board proof gate",
  );
  await clickProjectBoardTab(cdp, "Board");
  await waitFor(
    cdp,
    () =>
      [...document.querySelectorAll(".project-board-column")].some(
        (column) => column.textContent?.includes("In Progress") && column.textContent?.includes("Visual running card"),
      ),
    "visual project board active lane",
  );
  await waitFor(
    cdp,
    () => {
      const text = document.querySelector(".project-board-execution-overview")?.textContent ?? "";
      return text.includes("Execution next step") && text.includes("Worker progress is active") && text.includes("Inspect Running Card");
    },
    "visual project board execution overview",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-header")?.textContent?.includes("Revise Board"),
    "visual project board revise action",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-unattached-tasks")?.textContent?.includes("Visual unattached task"),
    "visual project board unattached local task",
  );
  await clickProjectBoardCard(cdp, "Visual running card");
  await waitFor(
    cdp,
    () => {
      const text = document.querySelector(".project-board-active-card-detail")?.textContent ?? "";
      return (
        Boolean(document.querySelector(".project-board-active-card-detail:not(.empty)")) &&
        text.includes("Task spec") &&
        text.includes("Visual running card") &&
        text.includes("Card inspector") &&
        text.includes("Selected card") &&
        text.includes("Execution controls")
      );
    },
    "visual project board active detail",
  );
  await assertProjectBoardButtonsHaveTooltips(cdp, "project board active card controls");
  await clickProjectBoardActiveCardDetailTab(cdp, "Proof");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-active-card-detail")?.textContent?.includes("Proof packet"),
    "visual project board active proof detail",
  );
  await clickProjectBoardActiveCardDetailTab(cdp, "History");
  await waitFor(
    cdp,
    () => {
      const text = document.querySelector(".project-board-active-card-detail")?.textContent ?? "";
      return text.includes("Progress ledger") && text.includes("Run history");
    },
    "visual project board active history detail",
  );
  await evaluate(cdp, `document.querySelector(".project-board-progress-ledger")?.scrollIntoView({ block: "center" })`);
  await captureVisual(cdp, "01a-project-board");
  await clickProjectBoardTab(cdp, "Map");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Execution order"),
    "visual project board execution order",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Visual dependent card"),
    "visual project board dependent execution item",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-execution-order")?.textContent?.includes("Waiting on dependencies"),
    "visual project board dependency readiness",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-map-panel")?.textContent?.includes("Edit dependencies"),
    "visual project board dependency editor",
  );
  await waitFor(
    cdp,
    () =>
      document.querySelector(".project-board-map-phase.tone-ready")?.textContent?.includes("Visual foundation card") &&
      document.querySelector(".project-board-map-phase.tone-critical")?.textContent?.includes("Visual dependent card") &&
      document.querySelector(".project-board-map-card.tone-blocked")?.textContent?.includes("Visual candidate detail") &&
      document.querySelector(".project-board-map-card.tone-running")?.textContent?.includes("Visual running card"),
    "visual project board map color semantics",
  );
  const mapLayout = await evaluate(
    cdp,
    `(() => {
      const phaseByTitle = (title) => [...document.querySelectorAll(".project-board-map-phase")].find((phase) => phase.textContent?.includes(title));
      const foundation = phaseByTitle("Visual foundation card");
      const visualQa = phaseByTitle("Visual dependent card");
      const foundationCard = foundation?.querySelector(".project-board-map-card");
      const foundationBadges = foundationCard?.querySelector(".project-board-map-badges");
      if (!foundation || !visualQa || !foundationCard || !foundationBadges) return { ok: false, reason: "missing map layout nodes" };
      const foundationHeight = foundation.getBoundingClientRect().height;
      const visualQaHeight = visualQa.getBoundingClientRect().height;
      const cardHeight = foundationCard.getBoundingClientRect().height;
      const badgesHeight = foundationBadges.getBoundingClientRect().height;
      return {
        ok: foundationHeight < visualQaHeight * 0.78 && foundationHeight < cardHeight + 150 && badgesHeight < 56,
        foundationHeight,
        visualQaHeight,
        cardHeight,
        badgesHeight,
      };
    })()`,
  );
  if (!mapLayout?.ok) throw new Error(`Expected non-stretched project board map layout, got ${JSON.stringify(mapLayout)}`);
  await assertProjectBoardButtonsHaveTooltips(cdp, "project board map controls");
  await evaluate(cdp, `document.querySelector(".project-board-map-grid")?.scrollIntoView({ block: "start" })`);
  await delay(150);
  await captureVisual(cdp, "01b-project-board-map");
  await clickProjectBoardTab(cdp, "Proof");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-proof-panel")?.textContent?.includes("Integration / browser proof"),
    "visual project board proof coverage",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-proof-panel")?.textContent?.includes("Manual review"),
    "visual project board manual proof lane",
  );
  await clickProjectBoardTab(cdp, "History");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-history-panel")?.textContent?.includes("Charter finalized"),
    "visual project board history",
  );
  await clickButton(cdp, "Reset Board");
  await waitFor(
    cdp,
    () => document.querySelector(".project-action-dialog")?.textContent?.includes("Reset impact"),
    "visual project board reset impact",
  );
  await waitFor(
    cdp,
    () => {
      const text = document.querySelector(".project-action-dialog")?.textContent ?? "";
      return (
        text.includes("5") &&
        text.includes("Cards") &&
        text.includes("Sources") &&
        text.includes("Preserved") &&
        text.includes("Project files")
      );
    },
    "visual project board reset confirmation counts",
  );
  await clickProjectBoardDialogButton(cdp, "Cancel");
  await waitFor(cdp, () => !document.querySelector(".project-action-dialog"), "visual project board reset dialog closed");
  await emitE2eEvent(cdp, { type: "state", state: projectBoardRevisionState(projectBoardState) });
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-revision-banner")?.textContent?.includes("Revision draft active"),
    "visual project board revision banner",
  );
  await clickProjectBoardTab(cdp, "Charter");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-kickoff")?.textContent?.includes("Charter revision interview"),
    "visual project board revision kickoff",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-kickoff")?.textContent?.includes("1 of 5"),
    "visual project board revision first question",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-question textarea")?.value?.includes("Build a stable board flow"),
    "visual project board revision prefilled answer",
  );
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-kickoff")?.textContent?.includes("Cancel Revision"),
    "visual project board revision cancel action",
  );
  await clickProjectBoardKickoffButton(cdp, "Next");
  await waitFor(
    cdp,
    () => document.querySelector(".project-board-kickoff")?.textContent?.includes("2 of 5"),
    "visual project board revision second question",
  );
  await clickButton(cdp, "Close project board");
  await waitFor(cdp, () => !document.querySelector(".project-board-workspace"), "project board closed");
}
