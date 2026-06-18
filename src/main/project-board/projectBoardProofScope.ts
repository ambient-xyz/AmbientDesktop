import type { ProjectBoardCardTestPlan } from "../../shared/projectBoardTypes";
import { validateProposalJsonlRecordArtifact, type ProposalJsonlRecordArtifact } from "./projectBoardArtifacts";

export interface ProjectBoardProofScopeCandidate {
  sourceId: string;
  title: string;
  description: string;
  phase?: string;
  labels?: string[];
  acceptanceCriteria?: string[];
  testPlan: ProjectBoardCardTestPlan;
}

export type ProjectBoardProofOwnership = "pure_module" | "visible_surface" | "integration" | "unspecified";

const PURE_MODULE_BOUNDARY_PATTERN =
  /\b(input[- ]?(adapter|mapping|intent)|keyboard[- ]?to[- ]?intent|reducer|pure (state|logic|module)|state model|game[- ]?state|data model|schema|parser|serializer|service adapter|api client|helper|physics helper|collision helper|spawn scheduler)\b/i;

const VISIBLE_SURFACE_PATTERN =
  /\b(renderer|render loop|rendering|canvas|webgl|pixi\.?js|three\.?js|html5 canvas|hud|overlay|screen|viewport|scene|sprite|animation|layout|visual|browser shell|game shell|nonblank|non-blank)\b/i;

const VISUAL_PROOF_PATTERN =
  /\b(screenshot|visual|browser|canvas|render(?:ed|ing)?|pixel|viewport|hud|scene|sprite|animation|visible|nonblank|non-blank|accelerat(?:e|es|ion) visually)\b/i;

export function projectBoardProofScopePromptRules(): string[] {
  return [
    "Classify each card's proof ownership boundary before filling testPlan.",
    "Pure module cards such as input adapters, reducers, state models, data models, parsers, schemas, service adapters, and helper modules should use unit/API/integration proof, not screenshot or browser-visual proof.",
    "Integration cards should prove cross-system behavior with tests, traces, commands, logs, or controlled browser metrics; add visual proof only when the card itself changes a visible UI/canvas/HUD/screen.",
    "Visible-surface cards such as renderers, game shells, scenes, HUDs, overlays, responsive layout, sprites, animation, or browser-visible gameplay should include visual proof when feasible.",
    "If a source mentions screenshot or visual proof but the current card does not own rendered pixels, put that proof on a downstream renderer/gameplay/HUD/proof card instead of this card.",
  ];
}

export function projectBoardProofOwnershipForCard(card: ProjectBoardProofScopeCandidate): ProjectBoardProofOwnership {
  const stableBoundaryText = normalizeProofScopeText([card.sourceId, card.title, card.phase ?? "", ...(card.labels ?? [])].join("\n"));
  if (VISIBLE_SURFACE_PATTERN.test(stableBoundaryText)) return "visible_surface";
  if (PURE_MODULE_BOUNDARY_PATTERN.test(stableBoundaryText)) return "pure_module";

  const broadText = normalizeProofScopeText(
    [card.description, ...(card.acceptanceCriteria ?? []), card.testPlan.unit.join("\n"), card.testPlan.integration.join("\n")].join("\n"),
  );
  if (VISIBLE_SURFACE_PATTERN.test(broadText)) return "integration";
  if (PURE_MODULE_BOUNDARY_PATTERN.test(broadText)) return "pure_module";
  return "unspecified";
}

export function projectBoardProofScopeWarnings(card: ProjectBoardProofScopeCandidate): string[] {
  const ownership = projectBoardProofOwnershipForCard(card);
  if (ownership !== "pure_module") return [];
  const visualProofItems = card.testPlan.visual.filter((item) => VISUAL_PROOF_PATTERN.test(item));
  if (visualProofItems.length === 0) return [];
  return [
    `"${card.title}" looks like a pure/module-boundary card but has browser or screenshot proof. Move visual proof to a downstream renderer, gameplay, HUD, or proof card unless this card directly changes rendered pixels.`,
  ];
}

export function projectBoardProofScopeWarningRecords(
  cards: ProjectBoardProofScopeCandidate[],
  createdAt: string,
): ProposalJsonlRecordArtifact[] {
  return cards.flatMap((card) =>
    projectBoardProofScopeWarnings(card).map((message) =>
      validateProposalJsonlRecordArtifact({
        type: "warning",
        code: "proof_scope_mismatch",
        message,
        createdAt,
        metadata: {
          cardId: card.sourceId,
          title: card.title,
          proofOwnership: projectBoardProofOwnershipForCard(card),
          visualProofItems: card.testPlan.visual.filter((item) => VISUAL_PROOF_PATTERN.test(item)).slice(0, 5),
        },
      }),
    ),
  );
}

function normalizeProofScopeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
