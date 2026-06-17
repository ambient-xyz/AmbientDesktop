import type { ProjectBoardCard } from "../../shared/types";
import type { AmbientRetryPolicy } from "../aggressiveRetries";
import { stableBoardArtifactId } from "./projectBoardArtifacts";
import { parseProjectBoardLlmJson } from "./projectBoardLlmJson";
import { callWorkflowPiText } from "../workflow/workflowPiTransport";

export interface ProjectBoardCandidateConsolidationGroup {
  survivorCardId: string;
  duplicateCardIds: string[];
  reason: string;
}

export const PROJECT_BOARD_CANDIDATE_CONSOLIDATION_SYSTEM_PROMPT = [
  "You are a project-planning auditor reviewing draft kanban cards produced by sectioned planning.",
  "Sections were planned independently, so the same deliverable can appear as multiple cards with different wording.",
  "Your only job is to find groups of cards that describe the same deliverable. Respond with JSON only.",
].join("\n");

/**
 * Synthesis-generated draft candidates are the only consolidation targets: manual,
 * follow-up, and imported cards carry user intent the pass must not override, and
 * anything ticketized or already resolved (evidence/duplicate/rejected) is settled.
 */
export function projectBoardConsolidationCandidates(cards: ProjectBoardCard[]): ProjectBoardCard[] {
  return cards.filter(
    (card) =>
      card.status === "draft" &&
      !card.orchestrationTaskId &&
      card.sourceKind === "board_synthesis" &&
      (card.candidateStatus === "ready_to_create" || card.candidateStatus === "needs_clarification"),
  );
}

export function buildProjectBoardCandidateConsolidationPrompt(input: {
  projectName?: string;
  candidates: ProjectBoardCard[];
}): string {
  const cards = input.candidates.map((card) => ({
    id: card.id,
    title: card.title,
    ...(card.phase ? { phase: card.phase } : {}),
    ...(typeof card.priority === "number" ? { priority: card.priority } : {}),
    description: card.description.replace(/\s+/g, " ").trim().slice(0, 400),
    acceptanceCriteria: (card.acceptanceCriteria ?? []).slice(0, 4).map((item) => item.replace(/\s+/g, " ").trim().slice(0, 160)),
  }));
  return [
    `Review the draft candidate cards${input.projectName ? ` for the project "${input.projectName}"` : ""} listed below.`,
    "Identify groups of cards that describe the SAME deliverable (the same code, endpoint, page, component, or config), even when the wording differs.",
    "",
    "Return JSON matching this exact shape:",
    JSON.stringify(
      {
        groups: [
          {
            survivorCardId: "card id to keep",
            duplicateCardIds: ["card ids that duplicate the survivor"],
            reason: "one sentence naming the shared deliverable",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Be conservative: only group cards when they clearly build the same deliverable. When unsure, leave cards alone.",
    "- Complementary or dependent work is NOT duplicate work: backend vs frontend for the same feature, implementation vs its tests, or a feature vs its error handling stay separate.",
    "- A card that is a strict superset of several focused cards counts as a duplicate of them: keep the focused cards and mark the umbrella card as the duplicate.",
    "- Pick as survivor the card with the most complete, specific description.",
    "- Each card id may appear in at most one group, and a survivor must not appear among duplicateCardIds.",
    '- If there are no duplicate groups, return { "groups": [] }.',
    "",
    "Candidate cards:",
    JSON.stringify(cards, null, 1),
  ].join("\n");
}

export async function runProjectBoardCandidateConsolidation(input: {
  boardId: string;
  projectName?: string;
  candidates: ProjectBoardCard[];
  model: string;
  apiKey: string;
  baseUrl?: string;
  retryPolicy?: AmbientRetryPolicy;
  signal?: AbortSignal;
  piTextCall?: typeof callWorkflowPiText;
}): Promise<ProjectBoardCandidateConsolidationGroup[]> {
  if (input.candidates.length < 2) return [];
  const prompt = buildProjectBoardCandidateConsolidationPrompt({
    projectName: input.projectName,
    candidates: input.candidates,
  });
  const text = await (input.piTextCall ?? callWorkflowPiText)({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.model,
    systemPrompt: PROJECT_BOARD_CANDIDATE_CONSOLIDATION_SYSTEM_PROMPT,
    prompt,
    sessionId: stableBoardArtifactId("project-board-candidate-consolidation-session", [input.boardId]),
    temperature: 0,
    maxTokens: 2048,
    responseFormat: { type: "json_object" },
    retryPolicy: input.retryPolicy,
    signal: input.signal,
  });
  return parseProjectBoardCandidateConsolidationResponse(text, new Set(input.candidates.map((card) => card.id)));
}

export function parseProjectBoardCandidateConsolidationResponse(
  text: string,
  validCardIds: ReadonlySet<string>,
): ProjectBoardCandidateConsolidationGroup[] {
  const parsed = parseProjectBoardLlmJson(text, "candidate consolidation response");
  const rawGroups = Array.isArray((parsed as { groups?: unknown })?.groups) ? ((parsed as { groups: unknown[] }).groups) : [];
  const groups: ProjectBoardCandidateConsolidationGroup[] = [];
  const claimed = new Set<string>();
  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const survivorCardId = typeof record.survivorCardId === "string" ? record.survivorCardId.trim() : "";
    if (!survivorCardId || !validCardIds.has(survivorCardId) || claimed.has(survivorCardId)) continue;
    const duplicateCardIds = [
      ...new Set(
        (Array.isArray(record.duplicateCardIds) ? record.duplicateCardIds : [])
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim()),
      ),
    ].filter((id) => id && id !== survivorCardId && validCardIds.has(id) && !claimed.has(id));
    if (duplicateCardIds.length === 0) continue;
    const reason = typeof record.reason === "string" ? record.reason.trim() : "";
    claimed.add(survivorCardId);
    for (const id of duplicateCardIds) claimed.add(id);
    groups.push({ survivorCardId, duplicateCardIds, reason });
  }
  return groups;
}
