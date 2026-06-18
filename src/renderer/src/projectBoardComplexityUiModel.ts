import type { ProjectBoardPlanningDepthAssessment, ProjectBoardPlanningSnapshot, ProjectBoardQuestion, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";

export type ProjectBoardComplexityBand = "small" | "medium" | "large";
export type ProjectBoardComplexityConfidence = "low" | "medium" | "high";

export interface ProjectBoardComplexitySignal {
  id: string;
  label: string;
  detail: string;
  score: number;
  tone: "neutral" | "reduce" | "increase";
}

export interface ProjectBoardComplexityEstimate {
  score: number;
  maxScore: number;
  band: ProjectBoardComplexityBand;
  source: "model_scope_contract" | "fallback_shadow";
  heading: string;
  label: string;
  anchorLabel: string;
  confidence: ProjectBoardComplexityConfidence;
  planningMode: "fast" | "balanced" | "detailed";
  suggestedCardBudget: { label: string; min: number; max: number };
  summary: string;
  signals: ProjectBoardComplexitySignal[];
}

export function projectBoardComplexityEstimate(board: ProjectBoardSummary): ProjectBoardComplexityEstimate {
  const modelEstimate = projectBoardComplexityEstimateFromPlanningDepth(board);
  if (modelEstimate) return modelEstimate;

  const includedSources = board.sources.filter(projectBoardComplexitySourceIncluded);
  const scopeSources = projectBoardComplexityScopeSources(includedSources);
  const durableScopeAnchored = scopeSources.some(projectBoardComplexitySourceIsDurablePlan);
  const sourceText = projectBoardComplexityText(board, scopeSources, { includeCharterContext: !durableScopeAnchored });
  const sourceCharCount = projectBoardComplexitySourceCharCount(scopeSources);
  const totalSourceCharCount = projectBoardComplexityRawSourceCharCount(includedSources);
  const sourceKindCount = new Set(scopeSources.map((source) => source.kind)).size;
  const signals: ProjectBoardComplexitySignal[] = [];
  let score = 4;

  signals.push({
    id: "base",
    label: "Base project",
    detail: "Every board starts with a small amount of planning overhead.",
    score: 4,
    tone: "neutral",
  });

  const sourceCountScore = scopeSources.length <= 1 ? 0 : scopeSources.length <= 3 ? 1 : scopeSources.length <= 6 ? 2 : 3;
  if (sourceCountScore > 0) {
    score += sourceCountScore;
    signals.push({
      id: "source-count",
      label: `${scopeSources.length} scope sources`,
      detail: "More product-scope sources usually require more reconciliation.",
      score: sourceCountScore,
      tone: "increase",
    });
  }

  if (includedSources.length > scopeSources.length) {
    signals.push({
      id: "source-context-observed",
      label: `${includedSources.length} included sources`,
      detail: "Included context is visible, but only product-scope sources affect the score.",
      score: 0,
      tone: "neutral",
    });
  }

  const sourceSizeScore = sourceCharCount > 150_000 ? 6 : sourceCharCount > 75_000 ? 4 : sourceCharCount > 30_000 ? 2 : sourceCharCount > 10_000 ? 1 : 0;
  if (sourceSizeScore > 0) {
    score += sourceSizeScore;
    signals.push({
      id: "source-size",
      label: `${sourceCharCount.toLocaleString()} source chars`,
      detail: "Larger source context increases planning cost.",
      score: sourceSizeScore,
      tone: "increase",
    });
  }

  if (totalSourceCharCount > sourceCharCount + 25_000) {
    signals.push({
      id: "background-context-observed",
      label: `${totalSourceCharCount.toLocaleString()} total source chars`,
      detail: "Background implementation context is observed but not counted as requested project scope.",
      score: 0,
      tone: "neutral",
    });
  }

  if (sourceKindCount > 2) {
    const sourceKindScore = Math.min(3, sourceKindCount - 2);
    score += sourceKindScore;
    signals.push({
      id: "source-kinds",
      label: `${sourceKindCount} source types`,
      detail: "Mixed source types can create more ambiguity.",
      score: sourceKindScore,
      tone: "increase",
    });
  }

  score += projectBoardComplexityApplySignals(signals, sourceText, [
    {
      id: "local-calculation-form",
      label: "Simple local form",
      detail: "Simple input-and-calculation apps are usually compact even when they are interactive.",
      score: -3,
      patterns: [
        /tip\s+calculator/,
        /unit\s+converter/,
        /simple\s+form/,
        /basic\s+arithmetic/,
        /pure\s+client[-\s]?side\s+arithmetic/,
        /local\s+calculation/,
        /two\s+inputs?/,
        /number\s+of\s+people/,
      ],
    },
    {
      id: "hello-world",
      label: "Hello World scope",
      detail: "A Hello World request should usually stay very small.",
      score: -3,
      patterns: [/hello\s*world/, /hello-world/],
    },
    {
      id: "simple-static",
      label: "Simple static app",
      detail: "Static, single-file, or no-JavaScript wording lowers expected complexity.",
      score: -2,
      patterns: [/simple/, /static/, /single\s+html/, /single\s+file/, /one\s+file/, /no\s+javascript/, /no\s+js/],
    },
    {
      id: "no-services",
      label: "No external services",
      detail: "No backend, storage, auth, or dependencies keeps the task narrow.",
      score: -2,
      patterns: [
        /no\s+backend/,
        /no\s+database/,
        /no\s+storage/,
        /no\s+persistent\s+storage/,
        /no\s+auth/,
        /no\s+login/,
        /no\s+dependencies/,
        /zero\s+dependencies/,
        /no\s+deploy(?:ment)?/,
      ],
    },
  ]);

  score += projectBoardComplexityApplySignals(signals, sourceText, [
    {
      id: "interactive-state",
      label: "Interactive state",
      detail: "State management, drag/drop, keyboard workflows, or multi-step interaction usually need extra implementation passes.",
      score: 3,
      patterns: [/\bstate\s+management\b/, /\bui\s+state\b/, /\bclient\s+state\b/, /local\s*storage/, /drag(?:ging)?/, /drop/, /keyboard\s+shortcuts?/, /multi[-\s]?step/, /wizard/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(interactive|state\\s+management|ui\\s+state|client\\s+state|local\\s*storage|drag|drop|keyboard\\s+shortcuts?|multi[-\\s]?step|wizard)")],
    },
    {
      id: "game-ui",
      label: "Game or rich UI",
      detail: "Games, canvas, SVG behavior, animation, and rich UI are usually medium-complexity.",
      score: 3,
      patterns: [/\bgame\b/, /hangman/, /canvas/, /\bsvg\b/, /animation/, /rich\s+ui/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(games?|hangman|canvas|svg|responsive|animations?)")],
    },
    {
      id: "multiple-surfaces",
      label: "Multiple screens or files",
      detail: "Multiple views, routes, pages, or files expand the work surface.",
      score: 2,
      patterns: [/multiple\s+(views|screens|pages|files)/, /\broutes?\b/, /\bviews?\b/, /\bscreens?\b/, /\bpages?\b/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(views?|screens?|pages?|files|routes?)"), /\b(?:single|one)[-\s]+(?:view|screen|page|file)\b/],
    },
  ]);

  score += projectBoardComplexityApplySignals(signals, sourceText, [
    {
      id: "storage-crud",
      label: "Storage and CRUD",
      detail: "Persistent data, CRUD, and local databases usually move a project beyond a simple utility.",
      score: 4,
      patterns: [/persistent\s+storage/, /data\s+storage/, /local\s+database/, /\bsqlite\b/, /indexeddb/, /\bcrud\b/, /\bcreate\b[^.\n]{0,60}\bupdate\b[^.\n]{0,60}\bdelete\b/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(persistent\\s+storage|data\\s+storage|local\\s+database|sqlite|indexeddb|crud|storage)")],
    },
    {
      id: "dates-stats-notifications",
      label: "Dates, stats, or reminders",
      detail: "Streaks, recurring rules, charts, reminders, and notifications add product logic.",
      score: 3,
      patterns: [/streaks?/, /weekly|monthly/, /\bstats?\b/, /charts?/, /reminders?/, /recurring/, /notifications?/, /date\/time|date\s+logic|time\s+logic/],
    },
  ]);

  score += projectBoardComplexityApplySignals(signals, sourceText, [
    {
      id: "backend-data",
      label: "Backend or data layer",
      detail: "APIs, servers, databases, and migrations are large-project signals.",
      score: 5,
      patterns: [/\bbackend\b/, /\bapi\b/, /\bserver\b/, /database/, /\bdb\b/, /migration/, /schema/],
      excludePatterns: [
        projectBoardComplexityNegatedPattern("(backend|api|servers?|databases?|db|migration|schema)"),
        /\b(?:local|browser|client[-\s]?side)\s+(?:database|storage)\b/,
        /\b(?:sqlite|indexeddb)\b/,
      ],
    },
    {
      id: "auth-security",
      label: "Auth or security",
      detail: "Login, permissions, accounts, fraud, and compliance usually require careful planning.",
      score: 4,
      patterns: [/\bauth(?:entication|orization)?\b/, /\boauth\b/, /\blogin\b/, /\bsign\s*in\b/, /\baccounts?\b/, /\bpermissions?\b/, /\broles?\b/, /\bfraud\b/, /\bcompliance\b/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(auth(?:entication|orization)?|oauth|login|sign\\s*in|accounts?|permissions?|roles?|fraud|compliance)")],
    },
    {
      id: "payments-integrations",
      label: "Payments or integrations",
      detail: "Payments, deploys, third-party services, and workspace integrations add coordination.",
      score: 4,
      patterns: [/payment/, /stripe/, /billing/, /deploy(?:ment)?/, /slack/, /github/, /email/, /webhook/, /third[-\s]?party\s+integration/, /integrat(?:e|ion)\s+with/],
      excludePatterns: [projectBoardComplexityNegatedPattern("(payments?|stripe|billing|deploy(?:ment)?|slack|github|email|webhooks?|integrations?)")],
    },
    {
      id: "realtime-collab",
      label: "Realtime or multi-user",
      detail: "Realtime, sync, websocket, offline, and multi-user requirements are large-project signals.",
      score: 4,
      patterns: [/real[-\s]?time/, /websocket/, /\bsync\b/, /offline/, /multi[-\s]?user/, /live\s+collaboration/, /collaborative\s+(editing|workspace|app)/],
      excludePatterns: [
        /real[-\s]?time[^.\n;!?]{0,80}\b(?:as\s+the\s+user\s+types|input|typing|updates?\s+(?:tip|total|result)|results?\s+update|local)\b/,
        /\b(?:updates?\s+(?:tip|total|result)|results?\s+update)[^.\n;!?]{0,80}real[-\s]?time\b/,
      ],
    },
    {
      id: "maps-location",
      label: "Maps or location",
      detail: "Geolocation, routing, matching, maps, and dispatch workflows are large-project signals.",
      score: 4,
      patterns: [/geolocation/, /\blocation\b/, /\bmaps?\b/, /routing/, /matching\s+algorithm/, /dispatch/, /nearby\s+drivers?/],
    },
    {
      id: "ops-workflows",
      label: "Operations workflows",
      detail: "Admin tools, support tooling, and multi-role operational workflows need detailed decomposition.",
      score: 3,
      patterns: [/\badmin\s+tools?\b/, /\bsupport\s+tooling\b/, /\bdriver\/rider\b/, /\brider[s]?\s+and\s+driver[s]?\b/, /\bratings?\b/, /\bpush\s+notifications?\b/],
    },
  ]);

  const unansweredRequiredQuestions = board.questions.filter((question) => question.required && !question.answer?.trim()).length;
  if (unansweredRequiredQuestions > 0) {
    signals.push({
      id: "unanswered-questions",
      label: `${unansweredRequiredQuestions} unanswered required question${unansweredRequiredQuestions === 1 ? "" : "s"}`,
      detail: "Open kickoff questions block readiness but do not change product-scope complexity.",
      score: 0,
      tone: "neutral",
    });
  }

  if (board.cards.length > 0) {
    signals.push({
      id: "planner-output-observed",
      label: `${board.cards.length} board card${board.cards.length === 1 ? "" : "s"} observed`,
      detail: "Observed card count is shown for comparison but is not counted in this shadow score.",
      score: 0,
      tone: "neutral",
    });
  }

  const clampedScore = clampNumber(Math.round(score), 1, 30);
  const band: ProjectBoardComplexityBand = clampedScore <= 5 ? "small" : clampedScore <= 14 ? "medium" : "large";
  const planningMode = band === "small" ? "fast" : band === "medium" ? "balanced" : "detailed";
  const suggestedCardBudget =
    band === "small"
      ? { label: "Target 1-5 cards", min: 1, max: 5 }
      : band === "medium"
        ? { label: "Target 6-10 cards", min: 6, max: 10 }
        : { label: "Target 11-15 cards", min: 11, max: 15 };
  const confidence = projectBoardComplexityConfidence(sourceText, includedSources.length, sourceCharCount, signals);
  const label = band === "small" ? "Small" : band === "medium" ? "Medium" : "Large";
  const anchorLabel = band === "small" ? "Similar to Tip Calculator" : band === "medium" ? "Similar to Habit Tracker" : "Similar to Ride-Sharing App";
  const summary =
    band === "small"
      ? "Looks simple enough for a compact board with only a few cards."
      : band === "medium"
        ? "Looks like it may need a balanced board with focused feature and proof cards."
        : "Looks large enough that detailed planning is probably justified.";

  return {
    score: clampedScore,
    maxScore: 30,
    band,
    source: "fallback_shadow",
    heading: "Fallback estimate",
    label,
    anchorLabel,
    confidence,
    planningMode,
    suggestedCardBudget,
    summary,
    signals: projectBoardComplexityRankSignals(signals),
  };
}

function projectBoardComplexityEstimateFromPlanningDepth(board: Pick<ProjectBoardSummary, "synthesisRuns" | "cards" | "questions">): ProjectBoardComplexityEstimate | undefined {
  const snapshot = projectBoardLatestPlanningDepthSnapshot(board);
  const planningDepth = snapshot?.planningDepth ?? snapshot?.scopeContract?.planningDepth;
  if (!planningDepth) return undefined;

  const band = projectBoardComplexityBandFromPlanningDepth(planningDepth);
  const score = projectBoardComplexityScoreFromPlanningDepth(planningDepth);
  const planningMode = band === "small" ? "fast" : band === "medium" ? "balanced" : "detailed";
  const suggestedCardBudget =
    band === "small"
      ? { label: "Target 1-5 cards", min: 1, max: 5 }
      : band === "medium"
        ? { label: "Target 6-10 cards", min: 6, max: 10 }
        : { label: "Target 11-15 cards", min: 11, max: 15 };
  const label = band === "small" ? "Small" : band === "medium" ? "Medium" : "Large";
  const anchorLabel =
    planningDepth.level === "phased"
      ? "Scope contract: phased"
      : planningDepth.level === "deep"
        ? "Scope contract: deep"
        : planningDepth.level === "standard"
          ? "Scope contract: standard"
          : "Scope contract: shallow";
  const summary = planningDepth.guidance.trim() || projectBoardComplexitySummaryForBand(band);
  const signals: ProjectBoardComplexitySignal[] = [
    {
      id: "model-planning-depth",
      label: "Model scope contract",
      detail: `Ambient/Pi assessed planning depth as ${planningDepth.level}.`,
      score: 0,
      tone: "neutral",
    },
    ...planningDepth.signals.slice(0, 8).map((signal, index) => ({
      id: `model-signal-${index + 1}`,
      label: signal.length > 42 ? `${signal.slice(0, 39).trimEnd()}...` : signal,
      detail: signal,
      score: 0,
      tone: "neutral" as const,
    })),
  ];
  const unansweredRequiredQuestions = board.questions.filter((question) => question.required && !question.answer?.trim()).length;
  if (unansweredRequiredQuestions > 0) {
    signals.push({
      id: "unanswered-questions",
      label: `${unansweredRequiredQuestions} unanswered required question${unansweredRequiredQuestions === 1 ? "" : "s"}`,
      detail: "Open kickoff questions block readiness but do not change the model scope-depth assessment.",
      score: 0,
      tone: "neutral",
    });
  }
  if (board.cards.length > 0) {
    signals.push({
      id: "planner-output-observed",
      label: `${board.cards.length} board card${board.cards.length === 1 ? "" : "s"} observed`,
      detail: "Observed card count is shown for comparison but does not override the model scope-depth assessment.",
      score: 0,
      tone: "neutral",
    });
  }

  return {
    score,
    maxScore: 30,
    band,
    source: "model_scope_contract",
    heading: "Scope contract estimate",
    label,
    anchorLabel,
    confidence: "high",
    planningMode,
    suggestedCardBudget,
    summary,
    signals,
  };
}

function projectBoardLatestPlanningDepthSnapshot(board: Pick<ProjectBoardSummary, "synthesisRuns">): ProjectBoardPlanningSnapshot | undefined {
  const snapshots = (board.synthesisRuns ?? [])
    .flatMap((run) => run.planningSnapshots ?? [])
    .filter((snapshot) => snapshot.planningDepth || snapshot.scopeContract?.planningDepth)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return snapshots.find((snapshot) => snapshot.planningStatus === "paused" || snapshot.planningStatus === "succeeded") ?? snapshots[0];
}

function projectBoardComplexityBandFromPlanningDepth(planningDepth: ProjectBoardPlanningDepthAssessment): ProjectBoardComplexityBand {
  if (planningDepth.level === "shallow") return "small";
  if (planningDepth.level === "standard") return "medium";
  return "large";
}

function projectBoardComplexityScoreFromPlanningDepth(planningDepth: ProjectBoardPlanningDepthAssessment): number {
  const band = projectBoardComplexityBandFromPlanningDepth(planningDepth);
  const boundedSourceScore = clampNumber(planningDepth.score, 0, 100) / 100;
  if (band === "small") return clampNumber(Math.round(1 + boundedSourceScore * 4), 1, 5);
  if (band === "medium") return clampNumber(Math.round(6 + boundedSourceScore * 8), 6, 14);
  return clampNumber(Math.round(15 + boundedSourceScore * 15), 15, 30);
}

function projectBoardComplexitySummaryForBand(band: ProjectBoardComplexityBand): string {
  return band === "small"
    ? "The model scope contract says this can stay compact."
    : band === "medium"
      ? "The model scope contract says normal project-board planning is appropriate."
      : "The model scope contract says detailed or phased planning is appropriate.";
}

interface ProjectBoardComplexityPatternSignal {
  id: string;
  label: string;
  detail: string;
  score: number;
  patterns: RegExp[];
  excludePatterns?: RegExp[];
}

function projectBoardComplexitySourceIncluded(source: ProjectBoardSource): boolean {
  return source.kind !== "ignored" && source.authorityRole !== "ignored" && source.includeInSynthesis !== false;
}

function projectBoardComplexityText(
  board: ProjectBoardSummary,
  sources: ProjectBoardSource[],
  options: { includeCharterContext?: boolean } = {},
): string {
  const charter = board.charter;
  const includeCharterContext = options.includeCharterContext !== false;
  return [
    board.title,
    board.summary,
    ...(includeCharterContext
      ? [
          charter?.projectSummary?.summary,
          ...(charter?.projectSummary?.majorSystems ?? []),
          ...(charter?.projectSummary?.risks ?? []),
          ...board.questions.flatMap(projectBoardComplexityQuestionTextParts),
        ]
      : []),
    ...sources.flatMap(projectBoardComplexitySourceTextParts),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

function projectBoardComplexityQuestionTextParts(question: ProjectBoardQuestion): string[] {
  const prompt = question.question.toLowerCase();
  if (
    /source.*authoritative|authoritative.*source|judgment calls?|proof should|required before a card|sequence and retry|card execution|ambient handle/.test(
      prompt,
    )
  ) {
    return [];
  }
  return [question.answer, question.suggestedAnswer].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function projectBoardComplexityScopeSources(sources: ProjectBoardSource[]): ProjectBoardSource[] {
  const durablePlanSources = sources.filter(projectBoardComplexitySourceIsDurablePlan);
  if (durablePlanSources.length > 0) return durablePlanSources;

  const threadSources = sources.filter((source) => source.kind === "thread");
  if (threadSources.length > 0) return threadSources;

  const scopedSources = sources.filter((source) => ["plan_artifact", "architecture_artifact", "functional_spec", "implementation_plan", "markdown"].includes(source.kind));
  return scopedSources.length > 0 ? scopedSources : sources;
}

function projectBoardComplexitySourceIsDurablePlan(source: ProjectBoardSource): boolean {
  const path = source.path?.toLowerCase() ?? "";
  return source.kind === "plan_artifact" || path.includes(".ambient/board/plans/");
}

function projectBoardComplexitySourceCharCount(sources: ProjectBoardSource[]): number {
  return sources.reduce((total, source) => total + projectBoardComplexitySourceTextParts(source).join("\n").length, 0);
}

function projectBoardComplexityRawSourceCharCount(sources: ProjectBoardSource[]): number {
  return sources.reduce((total, source) => {
    if (typeof source.byteSize === "number" && Number.isFinite(source.byteSize) && source.byteSize > 0) return total + source.byteSize;
    return total + [source.title, source.summary, source.excerpt].filter((value): value is string => typeof value === "string").join("\n").length;
  }, 0);
}

function projectBoardComplexitySourceTextParts(source: ProjectBoardSource): string[] {
  const parts = [source.title, source.summary];
  const semanticExcerpt = projectBoardComplexitySemanticExcerpt(source);
  if (semanticExcerpt) parts.push(semanticExcerpt);
  else if (source.excerpt && projectBoardComplexitySourceShouldUseExcerpt(source)) parts.push(source.excerpt);
  return parts.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function projectBoardComplexitySourceShouldUseExcerpt(source: ProjectBoardSource): boolean {
  if (source.kind === "thread") return true;
  return typeof source.byteSize !== "number" || source.byteSize <= 8_000;
}

function projectBoardComplexitySemanticExcerpt(source: ProjectBoardSource): string | undefined {
  if (!source.excerpt || !projectBoardComplexitySourceIsDurablePlan(source)) return undefined;
  if (!projectBoardComplexityExcerptLooksLikeHtml(source.excerpt)) return source.excerpt;
  const sourcePlanMatch = source.excerpt.match(/<section\s+id=["']source-plan["'][\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (sourcePlanMatch?.[1]) return projectBoardComplexityDecodeHtml(projectBoardComplexityStripHtml(sourcePlanMatch[1]));
  const executiveSummaryMatch = source.excerpt.match(/<section\s+id=["']executive-summary["'][\s\S]*?<\/section>/i);
  if (executiveSummaryMatch?.[0]) return projectBoardComplexityDecodeHtml(projectBoardComplexityStripHtml(executiveSummaryMatch[0]));
  return undefined;
}

function projectBoardComplexityExcerptLooksLikeHtml(value: string): boolean {
  return /<\s*(?:!doctype|html|head|body|style|script|svg|section|article|main|div|p|h[1-6])\b/i.test(value);
}

function projectBoardComplexityStripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function projectBoardComplexityDecodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function projectBoardComplexityApplySignals(
  signals: ProjectBoardComplexitySignal[],
  text: string,
  candidates: ProjectBoardComplexityPatternSignal[],
): number {
  let total = 0;
  const chunks = projectBoardComplexityTextChunks(text);
  for (const candidate of candidates) {
    if (!projectBoardComplexitySignalMatches(candidate, chunks)) continue;
    total += candidate.score;
    signals.push({
      id: candidate.id,
      label: candidate.label,
      detail: candidate.detail,
      score: candidate.score,
      tone: candidate.score < 0 ? "reduce" : candidate.score > 0 ? "increase" : "neutral",
    });
  }
  return total;
}

function projectBoardComplexitySignalMatches(candidate: ProjectBoardComplexityPatternSignal, chunks: string[]): boolean {
  for (const chunk of chunks) {
    if (!candidate.patterns.some((pattern) => pattern.test(chunk))) continue;
    if (candidate.excludePatterns?.some((pattern) => pattern.test(chunk))) continue;
    return true;
  }
  return false;
}

function projectBoardComplexityTextChunks(text: string): string[] {
  return text
    .split(/[\n.;!?]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function projectBoardComplexityNegatedPattern(termPattern: string): RegExp {
  return new RegExp(
    [
      `\\b(?:no|not|without|omit(?:ted)?|exclude(?:d)?|disable(?:d)?|skip(?:ped)?|remove(?:d)?|unneeded|unnecessary)\\b[^\\n.;!?]{0,80}\\b${termPattern}\\b`,
      `\\bout\\s+of\\s+scope\\b[^\\n.;!?]{0,120}\\b${termPattern}\\b`,
      `\\b${termPattern}\\b[^\\n.;!?]{0,80}\\b(?:not\\s+required|not\\s+needed|omitted|excluded|disabled|skipped|removed|unneeded|unnecessary)\\b`,
    ].join("|"),
    "i",
  );
}

function projectBoardComplexityConfidence(
  text: string,
  includedSourceCount: number,
  sourceCharCount: number,
  signals: ProjectBoardComplexitySignal[],
): ProjectBoardComplexityConfidence {
  const signalCount = signals.filter((signal) => signal.id !== "base" && signal.id !== "planner-output-observed").length;
  if (includedSourceCount === 0 || text.length < 80) return "low";
  if (signalCount >= 2 || sourceCharCount > 2_000 || includedSourceCount > 1) return "high";
  return "medium";
}

function projectBoardComplexityRankSignals(signals: ProjectBoardComplexitySignal[]): ProjectBoardComplexitySignal[] {
  return [...signals].sort((left, right) => {
    const leftRank = left.id === "base" ? -1 : Math.abs(left.score);
    const rightRank = right.id === "base" ? -1 : Math.abs(right.score);
    if (rightRank !== leftRank) return rightRank - leftRank;
    return left.label.localeCompare(right.label);
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
