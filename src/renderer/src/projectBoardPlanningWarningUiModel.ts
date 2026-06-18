import type { ProjectBoardCard, ProjectBoardSummary, ProjectBoardSynthesisProposal, ProjectBoardSynthesisRun, ProjectBoardSynthesisRunProgressiveRecord } from "../../shared/projectBoardTypes";
import {
  projectBoardProofArray,
  projectBoardProofObject,
  projectBoardProofText,
  projectBoardUniqueProofItems,
} from "./projectBoardProofEvidenceUiModel";

export interface ProjectBoardPlanningWarning {
  code: string;
  message: string;
  suggestedFix: string;
  runId?: string;
  createdAt?: string;
  cardRef?: string;
  title?: string;
  proofOwnership?: string;
  visualProofItems: string[];
}

export type ProjectBoardProofScopeWarningPolicy = "advisory" | "acknowledgement_required";

type ProjectBoardPlanningWarningCardLike =
  | Pick<ProjectBoardCard, "id" | "sourceId" | "title">
  | (Pick<ProjectBoardSynthesisProposal["cards"][number], "sourceId" | "title"> & { id?: string });

const PROJECT_BOARD_PROOF_SCOPE_WARNING_CODE = "proof_scope_mismatch";
const PROJECT_BOARD_PROOF_SCOPE_SUGGESTED_FIX =
  "Move screenshot/browser/visual proof to a downstream renderer, gameplay, HUD, or proof card; keep this card focused on unit, API, or integration evidence for the behavior it directly owns.";

export function projectBoardPlanningWarningsForCard(
  card: ProjectBoardPlanningWarningCardLike,
  board?: ProjectBoardSummary,
): ProjectBoardPlanningWarning[] {
  if (!board?.synthesisRuns?.length) return [];
  const cardRefs = projectBoardPlanningWarningCardRefs(card);
  const warnings = board.synthesisRuns.flatMap((run) =>
    projectBoardSynthesisRunProofScopeWarnings(run).filter((warning) => projectBoardPlanningWarningMatchesCard(warning, cardRefs)),
  );
  return projectBoardUniqueProofItems(warnings, (warning) => `${warning.code}:${warning.runId ?? ""}:${warning.cardRef ?? ""}:${warning.message}`).slice(0, 4);
}

export function projectBoardSynthesisRunProofScopeWarnings(run?: ProjectBoardSynthesisRun): ProjectBoardPlanningWarning[] {
  if (!run?.progressiveRecords?.length) return [];
  return run.progressiveRecords.flatMap((record) => projectBoardPlanningWarningFromRecord(record, run.id));
}

export function projectBoardPlanningWarningActionTitle(warnings: ProjectBoardPlanningWarning[]): string | undefined {
  const warning = warnings[0];
  if (!warning) return undefined;
  return `Proof-scope warning: ${warning.message} ${warning.suggestedFix}`;
}

export function projectBoardProofScopeWarningPolicy(board?: ProjectBoardSummary): ProjectBoardProofScopeWarningPolicy {
  const value = board?.charter?.testPolicy?.proofScopeWarningPolicy;
  return value === "acknowledgement_required" ? "acknowledgement_required" : "advisory";
}

export function projectBoardCardHasProofScopeWarningAcknowledgement(card: ProjectBoardCard): boolean {
  const acknowledgedFields = new Set([
    "description",
    "candidateStatus",
    "acceptanceCriteria",
    "testPlan",
    "clarificationQuestions",
    "clarificationAnswers",
  ]);
  return Boolean(card.userTouchedFields?.some((field) => acknowledgedFields.has(field)));
}

export function projectBoardCardBlockedByStrictProofScopeWarning(card: ProjectBoardCard, board?: ProjectBoardSummary): boolean {
  return (
    projectBoardProofScopeWarningPolicy(board) === "acknowledgement_required" &&
    projectBoardPlanningWarningsForCard(card, board).length > 0 &&
    !projectBoardCardHasProofScopeWarningAcknowledgement(card)
  );
}

function projectBoardPlanningWarningFromRecord(record: ProjectBoardSynthesisRunProgressiveRecord, runId: string): ProjectBoardPlanningWarning[] {
  if (record.type !== "warning") return [];
  const code = projectBoardProofText(record.code);
  const message = projectBoardProofText(record.message);
  if (code !== PROJECT_BOARD_PROOF_SCOPE_WARNING_CODE || !message) return [];
  const metadata = projectBoardProofObject(record.metadata) ?? {};
  const visualProofItems = projectBoardProofArray(metadata.visualProofItems)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 5);
  return [
    {
      code,
      message,
      suggestedFix: PROJECT_BOARD_PROOF_SCOPE_SUGGESTED_FIX,
      runId,
      createdAt: projectBoardProofText(record.createdAt),
      cardRef: projectBoardProofText(metadata.cardId) ?? projectBoardProofText(metadata.sourceId),
      title: projectBoardProofText(metadata.title),
      proofOwnership: projectBoardProofText(metadata.proofOwnership),
      visualProofItems,
    },
  ];
}

function projectBoardPlanningWarningCardRefs(card: ProjectBoardPlanningWarningCardLike): { ids: Set<string>; titleKey: string } {
  const ids = new Set<string>();
  if ("id" in card && typeof card.id === "string" && card.id.trim()) ids.add(card.id.trim());
  if (typeof card.sourceId === "string" && card.sourceId.trim()) ids.add(card.sourceId.trim());
  return { ids, titleKey: projectBoardPlanningWarningTitleKey(card.title) };
}

function projectBoardPlanningWarningMatchesCard(warning: ProjectBoardPlanningWarning, refs: { ids: Set<string>; titleKey: string }): boolean {
  if (warning.cardRef && refs.ids.has(warning.cardRef)) return true;
  if (warning.title && projectBoardPlanningWarningTitleKey(warning.title) === refs.titleKey) return true;
  return false;
}

function projectBoardPlanningWarningTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
