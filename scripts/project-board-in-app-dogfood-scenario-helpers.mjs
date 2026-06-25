export function answerForKickoffQuestion(question) {
  const normalized = question.toLowerCase();
  if (/\b(primary|outcome|optimize|goal)\b/.test(normalized)) {
    return "Ship a narrow playable WebGL spaceship vertical slice with a visible ship, hazards, score, restart loop, and traceable proof.";
  }
  if (/\b(source|authoritative|docs|threads)\b/.test(normalized)) {
    return "Treat README, architecture notes, gameplay notes, implementation plan, tests, and WORKFLOW.md as project-manager source material. TODO.md is low-authority scratch.";
  }
  if (/\b(judgment|decision|handle|executing)\b/.test(normalized)) {
    return "When sources conflict, ask targeted PM Review questions and prefer small reversible MVP choices.";
  }
  if (/\b(proof|review|test|done)\b/.test(normalized)) {
    return "Require acceptance criteria plus unit, integration, and visual/manual proof before closing project board cards.";
  }
  return answerForSpaceshipQuestion(question);
}

export function incrementalObservation(input) {
  const terminalRun = input.terminalRun;
  return {
    boardId: input.boardId,
    runId: input.runId,
    returnedEarly: input.returnedEarly,
    returnReason: input.returnReason,
    terminalStatus: terminalRun?.status,
    terminalStage: terminalRun?.stage,
    sourceCount: terminalRun?.sourceCount,
    includedSourceCount: terminalRun?.includedSourceCount,
    sourceCharCount: terminalRun?.sourceCharCount,
    promptCharCount: terminalRun?.promptCharCount,
    responseCharCount: terminalRun?.responseCharCount,
    terminalCardCount: terminalRun?.cardCount,
    progressiveRecordCount: progressiveRecordCount(terminalRun),
    timeToFirstCardMs: input.firstCard?.elapsedMs,
    timeToFirstTicketizedTaskMs: input.firstTicketizedCard?.elapsedMs,
    firstCard: input.firstCard,
    firstTicketizedCard: input.firstTicketizedCard,
    maxBoardSynthesisCardCount: input.maxCardCount,
    maxTicketizedCardCount: input.maxTicketizedCardCount,
    samples: input.samples,
  };
}

export function timestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function progressiveRecordCount(run) {
  return run?.progressiveRecordCount ?? run?.progressiveRecords?.length ?? 0;
}

export function resumedSynthesisRunForBoard(board, boardId, pausedRunId) {
  return [...(board?.synthesisRuns ?? [])]
    .filter((run) => run.boardId === boardId && run.retryOfRunId === pausedRunId)
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))[0];
}

export function proposalObservation(name, proposal, run) {
  return {
    name,
    proposalId: proposal.id,
    cardCount: proposal.cards.length,
    questionCount: proposal.questions.length,
    proofCardCount: proposal.cards.filter(
      (card) => card.acceptanceCriteria.length > 0 && Object.values(card.testPlan).some((items) => items.length > 0),
    ).length,
    dependencyCardCount: proposal.cards.filter((card) => card.blockedBy.length > 0).length,
    model: proposal.model,
    durationMs: proposal.durationMs,
    run: run
      ? {
          id: run.id,
          status: run.status,
          stage: run.stage,
          sourceCount: run.sourceCount,
          includedSourceCount: run.includedSourceCount,
          sourceCharCount: run.sourceCharCount,
          promptCharCount: run.promptCharCount,
          responseCharCount: run.responseCharCount,
          cardCount: run.cardCount,
          questionCount: run.questionCount,
          error: run.error,
        }
      : undefined,
    questions: proposal.questions,
    cards: proposal.cards.map((card) => ({
      sourceId: card.sourceId,
      title: card.title,
      candidateStatus: card.candidateStatus,
      priority: card.priority,
      phase: card.phase,
      blockedBy: card.blockedBy,
      proofKinds: Object.entries(card.testPlan)
        .filter(([, items]) => Array.isArray(items) && items.length > 0)
        .map(([kind]) => kind),
    })),
  };
}

export function synthesisRunLoadedPreviousRecords(run) {
  return (run?.events ?? []).some((event) => {
    const text = `${event?.title ?? ""}\n${event?.summary ?? ""}`;
    return /Loaded previous section records|Loaded planner-batch continuation checkpoint/i.test(text);
  });
}

export function boardSynthesisCards(board) {
  return (board?.cards ?? []).filter((card) => card?.sourceKind === "board_synthesis" || card?.sourceKind === "project_board_synthesis");
}

export function duplicateTitleMetrics(cards) {
  const groups = new Map();
  for (const card of cards.filter((candidate) => candidate.status !== "archived" && candidate.candidateStatus !== "duplicate")) {
    const key = normalizeCardTitle(card.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push({
      id: card.id,
      title: card.title,
      status: card.status,
      candidateStatus: card.candidateStatus,
    });
    groups.set(key, group);
  }
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const duplicateCardCount = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
  const totalCardCount = cards.length;
  return {
    totalCardCount,
    duplicateCardCount,
    duplicateGroupCount: duplicateGroups.length,
    duplicateCardRate: totalCardCount ? Number((duplicateCardCount / totalCardCount).toFixed(4)) : 0,
    duplicateGroups: duplicateGroups.slice(0, 10),
  };
}

export function normalizeCardTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function selectDogfoodExecutionCard(cards) {
  const draftCards = cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId && hasProof(card));
  const unblocked = draftCards.filter((card) => card.blockedBy.length === 0);
  const candidates = unblocked.length ? unblocked : draftCards;
  const preferred = candidates.find((card) =>
    /proof|test|verification|app shell|canvas|nonblank|non-blank/i.test(`${card.title}\n${card.description}`),
  );
  return preferred ?? candidates[0];
}

export function hasProof(card) {
  return card.acceptanceCriteria.length > 0 && Object.values(card.testPlan).some((items) => Array.isArray(items) && items.length > 0);
}

export function parseJsonObject(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function answerForSpaceshipQuestion(question) {
  const normalized = question.toLowerCase();
  if (/\b(arcade|inertia|thrust|control)\b/.test(normalized)) {
    return "Use arcade keyboard controls for the MVP. Defer inertia-based thrust and touch support to later cards.";
  }
  if (/\b(wave|endless|spawn|pacing)\b/.test(normalized)) {
    return "Use discrete deterministic waves for MVP proof. Endless spawning can be a later tuning card.";
  }
  if (/\b(score|scoring|survival)\b/.test(normalized)) {
    return "Use survival time plus enemies destroyed for the first score model; skip multipliers and cargo-delivery scoring for now.";
  }
  if (/\b(collision|bounds|radius|hit)\b/.test(normalized)) {
    return "Use simple circle bounds for ship, hazards, enemies, and shots in the MVP.";
  }
  if (/\b(visual|asset|ship|primitive|vector|screenshot)\b/.test(normalized)) {
    return "Use primitive or vector-style geometry first, with a nonblank canvas screenshot/manual proof requirement.";
  }
  return "For the MVP, choose the smallest reversible option that produces a playable vertical slice with clear proof.";
}

export function sourceForStableKey(board, reference) {
  const keys = new Set(
    [
      reference.id,
      reference.sourceKey,
      reference.path,
      reference.threadId,
      reference.artifactId,
      reference.messageId,
      reference.title,
    ].filter((value) => typeof value === "string" && value.trim()),
  );
  return board.sources.find((source) =>
    [source.id, source.sourceKey, source.path, source.threadId, source.artifactId, source.messageId, source.title].some((value) =>
      keys.has(value),
    ),
  );
}

export function projectBoardSourceKind(source) {
  return source?.kind ?? source?.sourceKind;
}

export function isTransientAmbientDogfoodError(message) {
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/i.test(
    String(message ?? ""),
  );
}
