import type { ProjectBoardUiMockRole } from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisCardInput, ProjectBoardSynthesisDraft } from "./projectBoardSynthesisContracts";

const SYNTHESIS_SOURCE_PREFIX = "synthesis:";
export const UX_MOCK_GATE_SOURCE_ID = `${SYNTHESIS_SOURCE_PREFIX}ux-mock-approval`;
export const UX_MOCK_GATE_LABEL = "ux-mock-approval";

export interface ProjectBoardSynthesisUxMockProfile {
  hasUserInterface?: boolean;
  hasGame?: boolean;
  hasWebGl?: boolean;
}

export function projectBoardSynthesisDraftWithUxMockGate(
  draft: ProjectBoardSynthesisDraft,
  profile?: ProjectBoardSynthesisUxMockProfile,
): ProjectBoardSynthesisDraft {
  if (draft.cards.length === 0) return draft;
  const existingMockCard = draft.cards.find(projectBoardCardIsUxMockGate);
  if (existingMockCard) {
    return projectBoardSynthesisDraftWithCanonicalUxMockDependencies(draft, existingMockCard.sourceId);
  }
  if (!projectBoardDraftNeedsUxMockGate(draft, profile)) return draft;

  const mockCard = projectBoardUxMockGateCard(draft);
  const gatedCards = projectBoardSynthesisCardsWithUxMockDependencies(draft.cards, mockCard.sourceId);
  return {
    ...draft,
    assumptions: [
      ...draft.assumptions,
      "User-facing UI implementation should wait for a reviewable UX mock/spec artifact before downstream cards are ticketized.",
    ].slice(0, 20),
    sourceNotes: [
      ...draft.sourceNotes,
      "UX mock approval gate: UI-affecting implementation cards depend on synthesis:ux-mock-approval until the mock is reviewed.",
    ].slice(0, 20),
    cards: [mockCard, ...gatedCards],
  };
}

export function projectBoardSynthesisDraftWithCanonicalUxMockDependencies(
  draft: ProjectBoardSynthesisDraft,
  mockGateSourceId: string,
): ProjectBoardSynthesisDraft {
  return {
    ...draft,
    cards: projectBoardSynthesisCardsWithUxMockDependencies(draft.cards, mockGateSourceId),
  };
}

function projectBoardSynthesisCardsWithUxMockDependencies(
  cards: ProjectBoardSynthesisCardInput[],
  mockGateSourceId: string,
): ProjectBoardSynthesisCardInput[] {
  return cards.map((card) => {
    if (card.sourceId === mockGateSourceId || projectBoardCardIsUxMockGate(card)) return card;
    if (!projectBoardSynthesisCardRequiresUxMockDependency(card)) return card;
    return {
      ...card,
      blockedBy: [...new Set([mockGateSourceId, ...card.blockedBy])],
      labels: [...new Set([...card.labels, "ux-mock-gated"])],
      uiMockRole: "gated_implementation",
      requiresUiMockApproval: true,
    };
  });
}

function projectBoardSynthesisCardRequiresUxMockDependency(card: ProjectBoardSynthesisCardInput): boolean {
  return Boolean(card.uiMockRole === "gated_implementation" || card.requiresUiMockApproval || projectBoardSynthesisCardTouchesUi(card));
}

function projectBoardUxMockGateCard(draft: ProjectBoardSynthesisDraft): ProjectBoardSynthesisCardInput {
  const sourceRefs = [...new Set(draft.cards.flatMap((card) => card.sourceRefs).filter(Boolean))].slice(0, 8);
  return {
    sourceId: UX_MOCK_GATE_SOURCE_ID,
    title: "Create UX mock for approval",
    description: [
      "Create a self-contained HTML mock/spec artifact for the user-facing surface before downstream UI implementation is ticketized.",
      "The mock should show the intended layout, primary states, interaction affordances, responsive/narrow viewport treatment, and any visual acceptance notes needed for implementation.",
      "Downstream UI cards should remain blocked until the user approves the mock or provides revision feedback.",
    ].join(" "),
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "UX Review",
    labels: [UX_MOCK_GATE_LABEL, "ux", "html"],
    blockedBy: [],
    uiMockRole: "mock_gate",
    requiresUiMockApproval: false,
    acceptanceCriteria: [
      "A self-contained HTML mock/spec artifact exists and can be previewed locally without remote assets.",
      "The mock covers desktop and narrow viewport layouts for the primary user-facing flow.",
      "The artifact includes enough visual and interaction detail for downstream implementation cards to follow.",
      "User approval, rejection, or revision feedback is recorded before UI implementation proceeds.",
    ],
    testPlan: {
      unit: [],
      integration: ["Open the generated HTML mock locally and verify it renders without external dependencies."],
      visual: ["Capture desktop and narrow viewport screenshots of the mock for review."],
      manual: ["User reviews the mock and records approve, reject, or revision feedback."],
    },
    sourceRefs,
    clarificationQuestions: [],
    clarificationSuggestions: [],
    clarificationDecisions: [],
  };
}

export function projectBoardCardIsUxMockGate(
  card: Pick<ProjectBoardSynthesisCardInput, "sourceId" | "title" | "labels" | "description"> & { uiMockRole?: ProjectBoardUiMockRole },
): boolean {
  if (card.uiMockRole === "mock_gate") return true;
  const haystack = `${card.sourceId}\n${card.title}\n${card.description}`.toLowerCase();
  return (
    card.sourceId === UX_MOCK_GATE_SOURCE_ID ||
    card.labels.some((label) => label.toLowerCase() === UX_MOCK_GATE_LABEL) ||
    /\b(ux|ui|user interface)\b.{0,40}\b(mock|prototype|wireframe|approval|review)\b/.test(haystack) ||
    /\b(mock|prototype|wireframe)\b.{0,40}\b(ux|ui|user interface|approval|review)\b/.test(haystack)
  );
}

export function normalizeProjectBoardUiMockRole(value: unknown): ProjectBoardUiMockRole | undefined {
  return value === "mock_gate" || value === "gated_implementation" ? value : undefined;
}

function projectBoardDraftNeedsUxMockGate(draft: ProjectBoardSynthesisDraft, profile?: ProjectBoardSynthesisUxMockProfile): boolean {
  if (profile?.hasUserInterface || (profile?.hasGame && profile?.hasWebGl)) return true;
  return (
    draft.cards.some(projectBoardSynthesisCardTouchesUi) ||
    projectBoardUiSurfacePattern().test(
      `${draft.goal}\n${draft.summary}\n${draft.currentState}\n${draft.targetUser}\n${draft.sourceNotes.join("\n")}`,
    )
  );
}

function projectBoardSynthesisCardTouchesUi(card: ProjectBoardSynthesisCardInput): boolean {
  const text = [
    card.title,
    card.description,
    card.phase ?? "",
    ...card.labels,
    ...card.acceptanceCriteria,
    ...card.testPlan.integration,
    ...card.testPlan.visual,
    ...card.testPlan.manual,
  ].join("\n");
  return projectBoardUiSurfacePattern().test(text);
}

export function projectBoardUiSurfacePattern(): RegExp {
  return /\b(user interface|ui\b|ux\b|frontend|front-end|screen|dashboard|form|modal|layout|responsive|viewport|browser UI|canvas|webgl|pixi\.?js|three\.?js|hud|renderer|render loop|visual editor|landing page|settings page|workflow screen|kanban board|game shell|game loop)\b/i;
}
