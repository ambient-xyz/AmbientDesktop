import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { projectBoardArtifactExportFromSummary } from "./projectStoreProjectBoardFacade";
import { projectBoardArtifactProjectionFromFiles } from "./projectStoreProjectBoardFacade";
import { previewProjectBoardWorkflowRepair, repairProjectBoardWorkflow, updateProjectBoardWorkflowRaw, updateProjectBoardWorkflowSettings } from "./projectStoreProjectBoardFacade";
import { readOrchestrationWorkflowReadiness } from "./projectStoreOrchestrationFacade";
import { ProjectStore } from "./projectStore";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("ProjectStore project board tiny durable e2e facade (requires Node ABI better-sqlite3 build)", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-store-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("runs a tiny durable-artifact board through source refresh, ticketization, and proof close", async () => {
    const durablePlanRelativePath = ".ambient/board/plans/Tiny-Hello-Animation-DurablePlan.html";
    const durablePlanPath = join(workspacePath, durablePlanRelativePath);
    await mkdir(dirname(durablePlanPath), { recursive: true });
    await writeFile(
      durablePlanPath,
      [
        "<!doctype html>",
        "<html><body>",
        "<h1>Tiny animated hello-world durable plan</h1>",
        "<p>Create a single-file app that renders Hello from Ambient with a subtle CSS animation.</p>",
        "</body></html>",
      ].join("\n"),
      "utf8",
    );

    const board = store.createProjectBoard({ title: "Tiny durable e2e board" });
    const invalidWorkflow = `---
orchestration:
  max_concurrent_agents: nope
---
Work on Local Task {{ task.identifier }}.`;
    await writeFile(join(workspacePath, "WORKFLOW.md"), invalidWorkflow, "utf8");
    const directRepairPreview = await previewProjectBoardWorkflowRepair(workspacePath);
    expect(directRepairPreview).toMatchObject({
      workspaceStrategy: "directory",
      currentText: invalidWorkflow,
      proposedText: expect.stringContaining("max_concurrent_agents: 1"),
      diff: expect.stringContaining("-  max_concurrent_agents: nope"),
      currentLineCount: 5,
    });
    const invalidReadiness = await readOrchestrationWorkflowReadiness(workspacePath);
    expect(invalidReadiness).toMatchObject({
      status: "invalid",
      code: "workflow_validation_error",
      repairPreview: expect.objectContaining({
        currentText: invalidWorkflow,
        proposedText: expect.stringContaining("Description:\n{{ task.description }}"),
        diff: expect.stringContaining("+  max_concurrent_agents: 1"),
      }),
    });
    const workflowRepair = await repairProjectBoardWorkflow(workspacePath, "restore_generated_default");
    expect(workflowRepair.error).toBeUndefined();
    expect(workflowRepair.backupPath).toBeTruthy();
    store.recordProjectBoardWorkflowRepair({
      boardId: board.id,
      action: "restore_generated_default",
      workflowPath: workflowRepair.workflowPath,
      workflowHash: workflowRepair.workflow?.contentHash,
      previousWorkflowHash: workflowRepair.previousWorkflowHash,
      backupPath: workflowRepair.backupPath,
      status: workflowRepair.workflow ? "ready" : "invalid",
    });
    await expect(readFile(workflowRepair.backupPath!, "utf8")).resolves.toBe(invalidWorkflow);
    await expect(readFile(join(workspacePath, "WORKFLOW.md"), "utf8")).resolves.toContain("Description:\n{{ task.description }}");
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({ status: "ready" });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_repaired")).toBe(true);

    const workflowSettings = await updateProjectBoardWorkflowSettings(workspacePath, {
      maxTurns: 24,
      requireScreenshots: true,
    });
    expect(workflowSettings.error).toBeUndefined();
    expect(workflowSettings.changedFields).toEqual(["orchestration.max_turns", "proof_of_work.require_screenshots"]);
    expect(workflowSettings.diff).toContain("+  max_turns: 24");
    store.recordProjectBoardWorkflowSettingsUpdated({
      boardId: board.id,
      workflowPath: workflowSettings.workflowPath,
      workflowHash: workflowSettings.workflow?.contentHash,
      previousWorkflowHash: workflowSettings.previousWorkflowHash,
      backupPath: workflowSettings.backupPath,
      changedFields: workflowSettings.changedFields,
      diff: workflowSettings.diff,
      status: workflowSettings.workflow ? "ready" : "invalid",
      message: workflowSettings.error?.message,
    });
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({
      status: "ready",
      maxTurns: 24,
      proofOfWork: expect.objectContaining({ requireScreenshots: true }),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_settings_updated")).toBe(true);

    const workflowRawBefore = await readFile(join(workspacePath, "WORKFLOW.md"), "utf8");
    const workflowRaw = await updateProjectBoardWorkflowRaw(workspacePath, {
      markdown: workflowRawBefore.replace(
        "finish with changed files, commands run, proof, and blockers.",
        "finish with changed files, commands run, proof, blockers, and a viewport note when visual behavior changes.",
      ),
    });
    expect(workflowRaw.error).toBeUndefined();
    expect(workflowRaw.changed).toBe(true);
    expect(workflowRaw.diff).toContain("+Complete the task in the prepared workspace");
    store.recordProjectBoardWorkflowRawUpdated({
      boardId: board.id,
      workflowPath: workflowRaw.workflowPath,
      workflowHash: workflowRaw.workflow?.contentHash,
      previousWorkflowHash: workflowRaw.previousWorkflowHash,
      backupPath: workflowRaw.backupPath,
      changed: workflowRaw.changed,
      diff: workflowRaw.diff,
      status: workflowRaw.workflow ? "ready" : "invalid",
      message: workflowRaw.error?.message,
    });
    await expect(readOrchestrationWorkflowReadiness(workspacePath)).resolves.toMatchObject({
      status: "ready",
      rawContent: expect.stringContaining("viewport note"),
    });
    expect(store.getActiveProjectBoard()?.events?.some((event) => event.kind === "workflow_raw_updated")).toBe(true);

    const sources = store.replaceProjectBoardSources(board.id, [
      {
        kind: "plan_artifact",
        title: "Tiny Hello Animation Durable Plan",
        summary: "Authoritative durable plan for a tiny animated hello-world app.",
        path: durablePlanRelativePath,
        relevance: 99,
        authorityRole: "primary",
        includeInSynthesis: true,
      },
      {
        kind: "thread",
        title: "Animation brainstorming chat",
        summary: "Optional chat notes suggest a pulsing greeting and calm colors.",
        threadId: "thread-tiny-animation-chat",
        relevance: 50,
        authorityRole: "ignored",
        includeInSynthesis: false,
      },
    ]);
    const durable = sources.find((source) => source.path === durablePlanRelativePath)!;
    const chat = sources.find((source) => source.threadId === "thread-tiny-animation-chat")!;
    expect(durable).toMatchObject({ authorityRole: "primary", includeInSynthesis: true });
    expect(chat).toMatchObject({ authorityRole: "ignored", includeInSynthesis: false });
    const tinyDecisionQuestion = "Should the tiny hello animation use a subtle pulse effect or a celebratory confetti effect?";
    const synthesisDraft: ProjectBoardSynthesisDraft = {
      summary: "Tiny hello-world app plan from the durable artifact.",
      goal: "Ship a tiny animated hello-world page.",
      currentState: "Durable plan exists; optional chat notes are ignored by default.",
      targetUser: "Local smoke-test reviewer.",
      qualityBar: "Single-file implementation with visual proof.",
      assumptions: ["Use plain HTML and CSS."],
      questions: [],
      sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
      cards: [
        {
          sourceId: "tiny:animated-hello",
          title: "Create animated hello-world page",
          description: "Build src/index.html with the approved greeting and a subtle animation.",
          candidateStatus: "needs_clarification",
          priority: 1,
          phase: "Tiny slice",
          labels: ["tiny-e2e", "html"],
          blockedBy: [],
          sourceRefs: [durable.id, durablePlanRelativePath, chat.id],
          acceptanceCriteria: ["src/index.html renders Hello from Ambient.", "The greeting has a visible CSS animation."],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop screenshot proof of the animated page."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [tinyDecisionQuestion],
        },
      ],
    };
    const synthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-durable-artifact-e2e-smoke" });
    const synthesized = store.applyProjectBoardSynthesis(board.id, synthesisDraft, {
      replaceExistingDraft: false,
      insertQuestions: false,
      snapshotRunId: synthesisRun.id,
      snapshotKind: "incremental",
    });
    const draft = synthesized.cards.find((card) => card.sourceId === "tiny:animated-hello")!;
    expect(draft.clarificationQuestions).toEqual([tinyDecisionQuestion]);
    expect(draft.clarificationSuggestions).toEqual([]);
    expect(draft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
      }),
    ]);
    expect(draft.clarificationDecisions?.[0].suggestedAnswer).toBeUndefined();
    const defaultedBoard = store.applyProjectBoardClarificationDefaultSuggestions({
      boardId: board.id,
      targetCardIds: [draft.id],
      model: "gmi-clarification-defaults-e2e-smoke",
      telemetry: { promptCharCount: 860, responseCharCount: 260, requestDurationMs: 1200 },
      suggestions: [
        {
          cardId: draft.id,
          decisionId: draft.clarificationDecisions![0].id,
          canonicalKey: draft.clarificationDecisions![0].canonicalKey,
          question: tinyDecisionQuestion,
          suggestedAnswer: "Use a subtle pulse animation.",
          rationale: "A pulse animation is simple to prove visually and avoids decorative scope creep.",
          confidence: "high",
          safeToAccept: true,
          questionKind: "expert_default",
        },
      ],
    });
    const defaultedDraft = defaultedBoard.cards.find((card) => card.id === draft.id)!;
    expect(defaultedDraft.clarificationSuggestions).toEqual([
      expect.objectContaining({
        suggestedAnswer: "Use a subtle pulse animation.",
        safeToAccept: true,
      }),
    ]);
    expect(defaultedDraft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "open",
        suggestedAnswer: "Use a subtle pulse animation.",
      }),
    ]);
    store.stageProjectBoardDecisionDraftPiUpdates({
      cardId: draft.id,
      question: tinyDecisionQuestion,
      answer: "Use a subtle pulse animation.",
      model: "gmi-e2e-smoke",
      telemetry: { promptCharCount: 1000, responseCharCount: 360, requestDurationMs: 1500 },
      suggestions: [
        {
          cardId: draft.id,
          description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
          labels: ["tiny-e2e", "html", "animation"],
          acceptanceCriteria: [
            "src/index.html renders Hello from Ambient.",
            "The greeting has a visible, subtle pulse animation.",
          ],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop screenshot proof of the pulse animation."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [],
          rationale: "Tiny e2e decision selected pulse animation.",
          confidence: "high",
        },
      ],
    });
    expect(store.getProjectBoardCard(draft.id).pendingPiUpdate).toMatchObject({
      sourceId: expect.stringMatching(/^decision:/),
      changedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan", "clarificationQuestions", "clarificationAnswers", "clarificationDecisions"]),
      description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
      clarificationQuestions: [],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    const decisionRefreshedDraft = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(decisionRefreshedDraft).toMatchObject({
      description: "Build src/index.html with the approved greeting and a subtle pulse animation.",
      clarificationQuestions: [],
      clarificationAnswers: [expect.objectContaining({ answer: "Use a subtle pulse animation." })],
      clarificationDecisions: [expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." })],
    });
    const duplicateDecisionDraft = store.updateProjectBoardCard({
      cardId: draft.id,
      clarificationQuestions: ["Should the tiny hello animation use the subtle pulse effect instead of celebratory confetti?"],
    });
    expect(duplicateDecisionDraft.clarificationDecisions).toEqual([
      expect.objectContaining({ state: "answered", answer: "Use a subtle pulse animation." }),
      expect.objectContaining({
        state: "duplicate",
        question: "Should the tiny hello animation use the subtle pulse effect instead of celebratory confetti?",
        duplicateOf: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        answer: "Use a subtle pulse animation.",
      }),
    ]);
    expect(duplicateDecisionDraft.clarificationDecisions?.filter((decision) => decision.state === "open") ?? []).toEqual([]);

    const legacyDecisionArtifactFiles = projectBoardArtifactExportFromSummary(store.getActiveProjectBoard()!).files.map((file) => {
      if (!file.path.endsWith(`cards/${draft.id}.json`)) return file;
      const artifact = JSON.parse(file.content) as Record<string, unknown>;
      const decisions = Array.isArray(artifact.clarificationDecisions) ? artifact.clarificationDecisions : [];
      artifact.clarificationDecisions = decisions.map((decision, index) => {
        if (!decision || typeof decision !== "object" || Array.isArray(decision)) return decision;
        const nextDecision = { ...(decision as Record<string, unknown>) };
        nextDecision.id = `question-${index + 1}`;
        delete nextDecision.canonicalKey;
        if (index === 1) nextDecision.duplicateOf = "question-1";
        return nextDecision;
      });
      return { ...file, content: JSON.stringify(artifact, null, 2) };
    });
    const legacyProjection = projectBoardArtifactProjectionFromFiles(legacyDecisionArtifactFiles);
    const legacyProjectionCard = legacyProjection.cards.find((card) => card.cardId === draft.id)!;
    expect(legacyProjectionCard.clarificationDecisions?.[0]).toMatchObject({
      id: "question-1",
      canonicalKey: expect.any(String),
      state: "answered",
    });
    const importedLegacyBoard = store.applyProjectBoardArtifactProjection(workspacePath, legacyProjection);
    const importedLegacyDraft = importedLegacyBoard.cards.find((card) => card.id === draft.id)!;
    expect(importedLegacyDraft.clarificationDecisions).toEqual([
      expect.objectContaining({
        state: "answered",
        id: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        canonicalKey: expect.any(String),
        answer: "Use a subtle pulse animation.",
      }),
      expect.objectContaining({
        state: "duplicate",
        duplicateOf: decisionRefreshedDraft.clarificationDecisions?.[0].id,
        answer: "Use a subtle pulse animation.",
      }),
    ]);
    expect(importedLegacyDraft.clarificationDecisions?.filter((decision) => decision.state === "open") ?? []).toEqual([]);

    store.updateProjectBoardCardCandidateStatus(draft.id, "ready_to_create");

    const coverageBoard = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const coverageEvent = [...(coverageBoard.events ?? [])].reverse().find((event) => event.title === "Proof coverage rechecked");
    expect(coverageEvent?.metadata.proofImpact).toMatchObject({
      appliedAction: "recompute_proof_coverage",
      eligibleCardCount: 1,
      missingProofCount: 0,
      visualProofItemCount: 1,
      existingCardsRewritten: false,
      modelCallRequired: false,
    });

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      modelCallRequired: false,
    });

    store.stageProjectBoardSourceDraftPiUpdates({
      boardId: board.id,
      sourceImpactEventId: sourceEvent!.id,
      model: "gmi-source-e2e-smoke",
      telemetry: { promptCharCount: 940, responseCharCount: 330, requestDurationMs: 1300 },
      suggestions: [
        {
          cardId: draft.id,
          description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
          labels: ["tiny-e2e", "html", "animation", "source-refresh"],
          acceptanceCriteria: [
            "src/index.html renders Hello from Ambient.",
            "The greeting has a visible, subtle pulse animation.",
            "The animation uses calm colors from the included chat notes.",
          ],
          testPlan: {
            unit: ["Validate the HTML file contains the greeting text."],
            integration: [],
            visual: ["Capture desktop and mobile screenshot proof of the calm pulse animation."],
            manual: ["Open the page and confirm it is readable."],
          },
          clarificationQuestions: [],
          rationale: "The newly included chat adds calm-color guidance without changing the durable-plan scope.",
          confidence: "high",
        },
      ],
    });
    expect(store.getProjectBoardCard(draft.id).pendingPiUpdate).toMatchObject({
      sourceId: expect.stringMatching(/^source:/),
      changedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
      description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
      labels: ["tiny-e2e", "html", "animation", "source-refresh"],
    });
    const sourcePiRefreshedDraft = store.resolveProjectBoardCardPiUpdate({ cardId: draft.id, action: "apply" });
    expect(sourcePiRefreshedDraft).toMatchObject({
      description: "Build src/index.html with the approved greeting, a subtle pulse animation, and calm colors from the included chat notes.",
      pendingPiUpdate: undefined,
    });

    const refreshed = store.refreshProjectBoardSourceDrafts({ boardId: board.id, sourceImpactEventId: sourceEvent!.id });
    const refreshedDraft = refreshed.cards.find((card) => card.id === draft.id)!;
    expect(refreshedDraft.description).toContain("## Source impact refresh");
    expect(refreshedDraft.status).toBe("draft");

    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(synthesisRun.id, {
      stage: "board_applied",
      title: "Applied tiny durable-artifact planning snapshot",
      summary: "The tiny durable-artifact board has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 1,
      questionCount: 0,
      completedAt: "2026-05-17T12:02:00.000Z",
    });
    const [ticketized] = store.createReadyProjectBoardTasks(board.id);
    expect(ticketized).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    const task = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(task.title).toBe("Create animated hello-world page");
    expect(task.description).toContain("Build src/index.html");
    expect(task.description).toContain("Source impact refresh");

    store.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: false });
    const postTicketSourceEvent = store.getActiveProjectBoard()?.events?.find((event) => event.kind === "source_updated");
    expect(postTicketSourceEvent?.metadata.sourceImpact).toMatchObject({
      affectedExecutableCardIds: expect.arrayContaining([ticketized.id]),
      nextRunFeedbackRecommended: true,
      modelCallRequired: false,
    });
    const feedbackBoard = store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: postTicketSourceEvent!.id });
    const feedbackCard = feedbackBoard.cards.find((card) => card.id === ticketized.id)!;
    expect(feedbackCard.runFeedback).toEqual([
      expect.objectContaining({
        source: "source_impact",
        sourceImpactEventId: postTicketSourceEvent!.id,
      }),
    ]);
    const feedbackTask = store.getOrchestrationTask(ticketized.orchestrationTaskId!);
    expect(feedbackTask.description).toContain("Source authority changed after this card was approved");
    expect(feedbackTask.description).toContain("Animation brainstorming chat");
    store.applyProjectBoardSourceImpactFeedback({ boardId: board.id, sourceImpactEventId: postTicketSourceEvent!.id });
    expect(store.getProjectBoardCard(ticketized.id).runFeedback).toHaveLength(1);

    const runWorkspace = join(workspacePath, ".ambient-codex", "orchestration", "workspaces", task.identifier);
    await mkdir(join(runWorkspace, "src"), { recursive: true });
    await writeFile(
      join(runWorkspace, "src", "index.html"),
      "<!doctype html><style>h1{animation:pulse 1s infinite alternate}@keyframes pulse{to{transform:scale(1.02)}}</style><h1>Hello from Ambient</h1>",
      "utf8",
    );
    const run = store.recordPreparedOrchestrationRun({ taskId: task.id, workspacePath: runWorkspace });
    store.updateOrchestrationRun({
      id: run.id,
      status: "completed",
      proofOfWork: {
        changedFiles: ["src/index.html"],
        commands: [{ command: "node -e \"console.log('Hello from Ambient')\"", result: "passed", output: "Hello from Ambient" }],
        screenshots: [
          { path: "proof/animated-hello-desktop.png", width: 1280, height: 720, label: "Desktop screenshot" },
          { path: "proof/animated-hello-mobile.png", width: 390, height: 844, label: "Mobile screenshot" },
        ],
        visualChecks: [{ path: "proof/animated-hello-desktop.png", result: "nonblank_image_detected", width: 1280, height: 720 }],
        diff: "diff --git a/src/index.html b/src/index.html\n+<h1>Hello from Ambient</h1>",
        lastAssistantText:
          "Implemented src/index.html. The page renders Hello from Ambient, the CSS pulse animation is present, unit proof checked the greeting text, visual screenshot captured, and manual review passed.",
      },
      finish: true,
    });

    const reviewed = store.getProjectBoardCard(ticketized.id);
    expect(reviewed.status).toBe("review");
    expect(reviewed.proofReview).toMatchObject({
      status: "ready_for_review",
      missing: [],
      runId: run.id,
    });

    const done = store.resolveProjectBoardProofDecision({ cardId: reviewed.id, action: "accept_done", reason: "Tiny durable e2e proof accepted." });
    expect(done.status).toBe("done");
    expect(store.getOrchestrationTask(task.id).state).toBe("done");

    const proofGapSynthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-proof-gap-e2e-smoke" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Tiny follow-up proof case from the same durable artifact.",
        goal: "Exercise proof rejection and follow-up materialization.",
        currentState: "The happy-path card is complete; a second small proof card intentionally returns weak evidence.",
        targetUser: "Local smoke-test reviewer.",
        qualityBar: "Missing proof produces an explicit follow-up draft.",
        assumptions: ["Use the durable plan as source authority."],
        questions: [],
        sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
        cards: [
          {
            sourceId: "tiny:animated-hello-proof-gap",
            title: "Collect missing animation proof",
            description: "Confirm the animated greeting with screenshot proof.",
            candidateStatus: "ready_to_create",
            priority: 2,
            phase: "Proof",
            labels: ["tiny-e2e", "proof-gap"],
            blockedBy: [],
            sourceRefs: [durable.id, durablePlanRelativePath],
            acceptanceCriteria: ["Screenshot evidence proves the animation page is visible."],
            testPlan: {
              unit: ["Confirm the generated page still contains Hello from Ambient."],
              integration: [],
              visual: ["Capture mobile and desktop screenshots of the animation."],
              manual: ["Review screenshot clarity."],
            },
          },
        ],
      },
      {
        replaceExistingDraft: false,
        insertQuestions: false,
        snapshotRunId: proofGapSynthesisRun.id,
        snapshotKind: "incremental",
      },
    );
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(proofGapSynthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof-gap planning snapshot",
      summary: "The proof-gap card has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 2,
      questionCount: 0,
      completedAt: "2026-05-17T12:03:00.000Z",
    });
    const proofGapCard = store.createReadyProjectBoardTasks(board.id).find((card) => card.sourceId === "tiny:animated-hello-proof-gap")!;
    expect(proofGapCard).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    const proofGapRun = store.recordPreparedOrchestrationRun({
      taskId: proofGapCard.orchestrationTaskId!,
      workspacePath: join(workspacePath, ".ambient-codex", "orchestration", "workspaces", "proof-gap"),
    });
    store.updateOrchestrationRun({
      id: proofGapRun.id,
      status: "completed",
      proofOfWork: {
        lastAssistantText: "I inspected the plan, but the screenshots were not captured yet.",
      },
    });
    store.applyProjectBoardCardProofReview({
      runId: proofGapRun.id,
      review: {
        status: "needs_follow_up",
        summary: "The proof run confirmed the scope but did not collect the required screenshots.",
        satisfied: ["The run inspected the durable plan scope."],
        missing: [
          "Acceptance criteria were not proven by attached evidence.",
          "No changed implementation files or meaningful diff evidence recorded.",
          "Visual proof missing: desktop and mobile screenshots were not captured.",
        ],
        followUpCardIds: [],
        runId: proofGapRun.id,
        reviewedAt: new Date().toISOString(),
        reviewer: "ambient_pi",
        model: "gmi-proof-follow-up-e2e",
        confidence: 0.86,
        evidenceQuality: "weak",
        recommendedAction: "follow_up",
        followUpSuggestion: {
          title: "Capture animation screenshot proof",
          description: "Collect the missing desktop and mobile screenshot evidence for the animated hello-world page.",
          acceptanceCriteria: [
            "Desktop screenshot shows the Hello from Ambient animation page rendered and readable.",
            "Mobile screenshot shows the compact animation page rendered and readable.",
          ],
          testPlan: {
            unit: ["Confirm the generated page still contains Hello from Ambient."],
            integration: [],
            visual: ["Capture desktop and mobile screenshots of the animation page."],
            manual: ["Inspect screenshots for readable text and no layout clipping."],
          },
          clarificationQuestions: [],
          labels: ["visual-proof", "tiny-e2e"],
          rationale: "The parent scope is valid; only evidence collection remains.",
        },
      },
    });
    const proofGapReviewed = store.getProjectBoardCard(proofGapCard.id);
    expect(proofGapReviewed.status).toBe("blocked");
    expect(proofGapReviewed.proofReview).toMatchObject({
      status: "needs_follow_up",
      recommendedAction: "follow_up",
      missing: expect.arrayContaining([
        expect.stringContaining("Acceptance criteria"),
        expect.stringContaining("No changed implementation files"),
        expect.stringContaining("Visual proof missing"),
      ]),
      followUpSuggestion: expect.objectContaining({
        title: "Capture animation screenshot proof",
      }),
    });
    const proofFollowUp = store
      .getActiveProjectBoard()!
      .cards.find((candidate) => candidate.sourceKind === "run_follow_up" && candidate.blockedBy.includes(proofGapReviewed.id));
    expect(proofFollowUp).toMatchObject({
      title: "Capture animation screenshot proof",
      status: "draft",
      candidateStatus: "needs_clarification",
      labels: expect.arrayContaining(["proof-follow-up", "pi-suggested-follow-up", "visual-proof", "tiny-e2e", "proof-gap"]),
      acceptanceCriteria: expect.arrayContaining([expect.stringContaining("Desktop screenshot"), expect.stringContaining("Mobile screenshot")]),
      testPlan: expect.objectContaining({
        visual: expect.arrayContaining([expect.stringContaining("desktop and mobile screenshots")]),
        manual: expect.arrayContaining([expect.stringContaining("layout clipping")]),
      }),
    });
    expect(proofGapReviewed.proofReview?.followUpCardIds).toEqual([proofFollowUp!.id]);

    const proofSuggestionSynthesisRun = store.createProjectBoardSynthesisRun({ boardId: board.id, model: "tiny-proof-suggestion-e2e-smoke" });
    store.applyProjectBoardSynthesis(
      board.id,
      {
        summary: "Tiny proof suggestion card from the same durable artifact.",
        goal: "Exercise generated proof expectations before ticketization.",
        currentState: "One missing-proof draft needs targeted proof suggestions.",
        targetUser: "Local smoke-test reviewer.",
        qualityBar: "Proof suggestions make a draft card eligible for ticketization without rewriting approved cards.",
        assumptions: ["Use the durable plan as source authority."],
        questions: [],
        sourceNotes: [`Durable plan: ${durablePlanRelativePath}`],
        cards: [
          {
            sourceId: "tiny:animated-hello-proof-suggestion",
            title: "Prepare visual proof checklist",
            description: "Create the proof checklist for the animated hello-world page.",
            candidateStatus: "needs_clarification",
            priority: 3,
            phase: "Proof",
            labels: ["tiny-e2e", "proof-suggestion"],
            blockedBy: [],
            sourceRefs: [durable.id, durablePlanRelativePath],
            acceptanceCriteria: ["The card has concrete visual proof expectations before ticketization."],
            testPlan: { unit: [], integration: [], visual: [], manual: [] },
          },
        ],
      },
      {
        replaceExistingDraft: false,
        insertQuestions: false,
        snapshotRunId: proofSuggestionSynthesisRun.id,
        snapshotKind: "incremental",
      },
    );
    const suggestionDraft = store.getActiveProjectBoard()!.cards.find((card) => card.sourceId === "tiny:animated-hello-proof-suggestion")!;
    const suggestedBoard = store.applyProjectBoardProofSuggestions({
      boardId: board.id,
      targetCardIds: [suggestionDraft.id],
      model: "test-pi",
      telemetry: { promptCharCount: 1600, responseCharCount: 360, requestDurationMs: 55 },
      suggestions: [
        {
          cardId: suggestionDraft.id,
          proofOwnership: "visible_surface",
          confidence: "high",
          rationale: "The card prepares visual proof for a browser-visible animated page.",
          testPlan: {
            unit: [],
            integration: ["Run a browser smoke check that opens the animated hello-world page."],
            visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
            manual: [],
          },
        },
      ],
    });
    const proofSuggestedDraft = suggestedBoard.cards.find((card) => card.id === suggestionDraft.id)!;
    expect(proofSuggestedDraft.testPlan.visual).toEqual([]);
    expect(proofSuggestedDraft.pendingPiUpdate).toMatchObject({
      sourceId: "proof:test-pi",
      changedFields: ["testPlan"],
      testPlan: {
        integration: ["Run a browser smoke check that opens the animated hello-world page."],
        visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
      },
    });
    expect((suggestedBoard.events ?? []).find((event) => event.title === "Proof expectations suggested")?.metadata.proofImpact).toMatchObject({
      appliedAction: "suggest_missing_proof",
      appliedCardIds: [suggestionDraft.id],
      pendingPiUpdateCardIds: [suggestionDraft.id],
      modelCallRequired: true,
      existingCardsRewritten: false,
    });
    const appliedProofSuggestionDraft = store.resolveProjectBoardCardPiUpdate({ cardId: suggestionDraft.id, action: "apply" });
    expect(appliedProofSuggestionDraft).toMatchObject({
      pendingPiUpdate: undefined,
      testPlan: {
        integration: ["Run a browser smoke check that opens the animated hello-world page."],
        visual: ["Capture desktop and mobile screenshots showing the greeting rendered and nonblank."],
      },
      userTouchedFields: expect.arrayContaining(["testPlan"]),
    });
    store.updateProjectBoardCardCandidateStatus(suggestionDraft.id, "ready_to_create");
    store.updateProjectBoardStatus(board.id, "active");
    store.recordProjectBoardSynthesisRunEvent(proofSuggestionSynthesisRun.id, {
      stage: "board_applied",
      title: "Applied proof-suggestion planning snapshot",
      summary: "The proof-suggestion card has a stable planning snapshot before ticketization.",
      status: "succeeded",
      cardCount: 3,
      questionCount: 0,
      completedAt: "2026-05-17T12:04:00.000Z",
    });
    const suggestedTicket = store.createReadyProjectBoardTasks(board.id).find((card) => card.sourceId === "tiny:animated-hello-proof-suggestion")!;
    expect(suggestedTicket).toMatchObject({ status: "ready", orchestrationTaskId: expect.any(String) });
    expect(store.getOrchestrationTask(suggestedTicket.orchestrationTaskId!).description).toContain("Capture desktop and mobile screenshots");

    const cardCountBeforeRepeat = store.getActiveProjectBoard()?.cards.length;
    const finalCoverageBoard = store.recomputeProjectBoardProofCoverage({ boardId: board.id });
    const finalCoverageEvent = (finalCoverageBoard.events ?? []).find((event) => event.title === "Proof coverage rechecked");
    expect(finalCoverageEvent?.metadata.proofImpact).toMatchObject({
      eligibleCardCount: 4,
      missingProofCount: 0,
      modelCallRequired: false,
      existingCardsRewritten: false,
    });
    expect(store.getActiveProjectBoard()?.cards.length).toBe(cardCountBeforeRepeat);
    expect(store.getProjectBoardCard(ticketized.id).runFeedback).toHaveLength(1);
  });
});
