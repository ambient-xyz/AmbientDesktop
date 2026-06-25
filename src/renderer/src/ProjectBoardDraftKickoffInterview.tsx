import { Bot, Check, CheckCircle2, Info, RefreshCw, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { projectBoardRunBlocksPlanning, projectBoardRunIsKickoffDefaults } from "../../shared/projectBoardSynthesisGate";
import type {
  ProjectBoardQuestion,
  ProjectBoardSynthesisRun,
  ProjectSummary,
  SuggestProjectBoardKickoffDefaultsInput,
} from "../../shared/projectBoardTypes";
import { projectBoardKickoffDefaultAnswer, projectBoardKickoffDefaultProviderErrorMessage } from "./projectBoardCardEditUiModel";
import { projectBoardSourceInclusion } from "./projectBoardUiModel";

export type ProjectBoardKickoffInterviewProps = {
  board: NonNullable<ProjectSummary["board"]>;
  finalizeBusy: boolean;
  suggestDefaultsBusy: boolean;
  questions: ProjectBoardQuestion[];
  onAnswerQuestion: (question: ProjectBoardQuestion, answer: string) => void;
  onFinalizeKickoff: (boardId: string) => void;
  onCancelRevision: (boardId: string) => void;
  onSuggestKickoffDefaults: (input: SuggestProjectBoardKickoffDefaultsInput) => Promise<void> | void;
  onReviewIgnoredThreads: (sourceId?: string) => void;
};

type ProjectBoardKickoffInterviewModel = ReturnType<typeof useProjectBoardKickoffInterviewModel>;

export function projectBoardKickoffDefaultDraftingStatus(
  board: NonNullable<ProjectSummary["board"]>,
  questionId?: string,
): string | undefined {
  if (!questionId) return undefined;
  const run = projectBoardLatestVisibleSynthesisRun(board.synthesisRuns);
  if (!run || run.status !== "running" || run.stage !== "kickoff_defaults") return undefined;
  const latestQuestionEvent = [...run.events].reverse().find((event) => event.metadata.questionId === questionId);
  if (!latestQuestionEvent || latestQuestionEvent.stage !== "kickoff_defaults") return undefined;
  const total = typeof latestQuestionEvent.metadata.total === "number" ? latestQuestionEvent.metadata.total : undefined;
  const position = typeof latestQuestionEvent.metadata.position === "number" ? latestQuestionEvent.metadata.position : undefined;
  const received =
    run.responseCharCount && run.responseCharCount > 0 ? `${run.responseCharCount.toLocaleString()} response characters received. ` : "";
  const progress = position && total ? `Question ${position}/${total}. ` : "";
  return `${progress}${received}The editable answer will appear here as soon as Ambient/Pi finishes a valid response for this question.`;
}

export function ProjectBoardKickoffInterview(props: ProjectBoardKickoffInterviewProps) {
  const model = useProjectBoardKickoffInterviewModel(props);
  return (
    <section
      className={`project-board-kickoff ${props.board.status === "draft" && model.activeQuestion ? "needs-input" : ""}`}
      aria-label="Project board kickoff interview"
    >
      <ProjectBoardKickoffHeader model={model} />
      {model.activeQuestion ? (
        <ProjectBoardKickoffQuestionPanel model={model} />
      ) : model.showReady && props.board.status === "draft" ? (
        <ProjectBoardKickoffReadyPanel model={model} />
      ) : (
        <p className="project-board-kickoff-complete">The project charter is active and will guide future board cards.</p>
      )}
    </section>
  );
}

function useProjectBoardKickoffInterviewModel({
  board,
  finalizeBusy,
  suggestDefaultsBusy,
  questions,
  onAnswerQuestion,
  onFinalizeKickoff,
  onCancelRevision,
  onSuggestKickoffDefaults,
  onReviewIgnoredThreads,
}: ProjectBoardKickoffInterviewProps) {
  const isRevision = (board.charter?.version ?? 1) > 1;
  const firstUnansweredIndex = questions.findIndex((question) => !question.answer);
  const initialQuestionIndex = isRevision ? 0 : firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length;
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(initialQuestionIndex);
  const activeQuestion = questions[activeQuestionIndex];
  const activeSuggestion = activeQuestion?.suggestedAnswer?.trim() ?? "";
  const activeProviderError = projectBoardKickoffDefaultProviderErrorMessage(activeQuestion?.suggestedAnswerProviderError);
  const activeDraftingStatus = projectBoardKickoffDefaultDraftingStatus(board, activeQuestion?.id);
  const activeSuggestionFresh = Boolean(activeSuggestion && !activeQuestion?.suggestedAnswerStale);
  const activeStaticDefault = activeQuestion ? projectBoardKickoffDefaultAnswer(board, activeQuestion, activeQuestionIndex) : "";
  const activeDraftDefault = activeQuestion?.answer ?? (activeSuggestionFresh ? activeSuggestion : activeStaticDefault);
  const [draft, setDraft] = useState(activeDraftDefault);
  const [draftDirty, setDraftDirty] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Preserves the moved kickoff answer sync behavior for this extraction. */
  useEffect(() => {
    const nextIndex = isRevision ? 0 : firstUnansweredIndex >= 0 ? firstUnansweredIndex : questions.length;
    setActiveQuestionIndex(nextIndex);
  }, [board.id, board.charter?.id, firstUnansweredIndex, isRevision, questions.length]);

  useEffect(() => {
    setDraft(activeDraftDefault);
    setDraftDirty(false);
    // Reset only when the question changes; a changing default must not clobber typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (!draftDirty) setDraft(activeDraftDefault);
  }, [activeDraftDefault, draftDirty]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const unansweredQuestionIds = questions.filter((question) => !question.answer?.trim()).map((question) => question.id);
  const missingSuggestionQuestionIds = questions
    .filter((question) => !question.answer?.trim() && (!question.suggestedAnswer?.trim() || question.suggestedAnswerStale))
    .map((question) => question.id);
  const suggestedCount = questions.filter((question) => !question.answer?.trim() && question.suggestedAnswer?.trim()).length;
  const staleSuggestionCount = questions.filter(
    (question) => !question.answer?.trim() && question.suggestedAnswer?.trim() && question.suggestedAnswerStale,
  ).length;
  const answered = questions.filter((question) => question.answer?.trim()).length;
  const displayStep = questions.length === 0 ? 0 : activeQuestion ? activeQuestionIndex + 1 : questions.length;
  const currentSection = activeQuestion ? projectBoardQuestionSectionLabel(activeQuestion, activeQuestionIndex) : undefined;
  const ignoredThreads = board.sources.filter((source) => source.kind === "thread" && !projectBoardSourceInclusion(source).included);
  const canMoveNext = Boolean(activeQuestion && draft.trim());
  const statusText =
    board.status === "active"
      ? "Charter active"
      : !activeQuestion
        ? "Ready to activate"
        : isRevision || activeQuestion.answer?.trim()
          ? "Review answer"
          : "Needs input";

  const moveNext = () => {
    if (!activeQuestion || !draft.trim()) return;
    const trimmed = draft.trim();
    if (trimmed !== activeQuestion.answer?.trim()) onAnswerQuestion(activeQuestion, trimmed);
    setActiveQuestionIndex(Math.min(activeQuestionIndex + 1, questions.length));
  };
  const requestDefaults = async (questionIds: string[]) => {
    const targetIds = questionIds.filter(Boolean);
    if (suggestDefaultsBusy || targetIds.length === 0) return;
    try {
      await onSuggestKickoffDefaults({ boardId: board.id, questionIds: targetIds });
    } catch {
      // The top-level project board error banner carries provider failures.
    }
  };
  const updateDraft = (value: string) => {
    setDraft(value);
    setDraftDirty(true);
  };

  return {
    board,
    finalizeBusy,
    suggestDefaultsBusy,
    questions,
    isRevision,
    activeQuestionIndex,
    activeQuestion,
    activeSuggestion,
    activeProviderError,
    activeDraftingStatus,
    draft,
    unansweredQuestionIds,
    missingSuggestionQuestionIds,
    suggestedCount,
    staleSuggestionCount,
    answered,
    displayStep,
    currentSection,
    ignoredThreads,
    canMoveNext,
    statusText,
    showReady: !activeQuestion,
    onFinalizeKickoff,
    onCancelRevision,
    onReviewIgnoredThreads,
    moveNext,
    requestDefaults,
    updateDraft,
  };
}

function ProjectBoardKickoffHeader({ model }: { model: ProjectBoardKickoffInterviewModel }) {
  const { board, questions, isRevision, answered, displayStep, statusText, suggestDefaultsBusy } = model;
  return (
    <header>
      <div>
        <span className="project-board-kicker">{isRevision ? "Charter revision interview" : "Kickoff interview"}</span>
        <h3>
          {displayStep} of {questions.length}
        </h3>
        {board.status === "draft" && (
          <p>
            {isRevision
              ? "Review or adjust the existing answers before applying this charter revision."
              : "Answer these questions to create the project charter."}{" "}
            {answered} answered. The execution board stays empty until the charter is active and draft candidates are ticketized.
          </p>
        )}
      </div>
      {questions.length > 0 && (
        <div className="project-board-kickoff-actions">
          <span className="project-board-status">{statusText}</span>
          {board.status === "draft" && model.unansweredQuestionIds.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              disabled={suggestDefaultsBusy || model.missingSuggestionQuestionIds.length === 0}
              title={
                model.missingSuggestionQuestionIds.length === 0
                  ? "All unanswered kickoff questions already have current Ambient/Pi defaults."
                  : "Ask Ambient/Pi for editable source-derived defaults for unanswered kickoff questions."
              }
              onClick={() => void model.requestDefaults(model.missingSuggestionQuestionIds)}
            >
              <Bot size={14} className={suggestDefaultsBusy ? "spin" : ""} />
              <span>
                {suggestDefaultsBusy ? "Suggesting" : model.staleSuggestionCount > 0 ? "Regenerate Defaults" : "Suggest Defaults"}
              </span>
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function ProjectBoardKickoffQuestionPanel({ model }: { model: ProjectBoardKickoffInterviewModel }) {
  const { activeQuestion, board, currentSection, draft, isRevision } = model;
  if (!activeQuestion) return null;
  return (
    <div className="project-board-question">
      <label>
        <span>{activeQuestion.question}</span>
        {currentSection && <em>Updates charter section: {currentSection}</em>}
        <textarea value={draft} onChange={(event) => model.updateDraft(event.target.value)} placeholder="Answer for the project charter" />
      </label>
      <ProjectBoardKickoffDefaultCard model={model} />
      <div className="project-board-question-actions">
        {isRevision && (
          <button
            type="button"
            className="secondary-button"
            title="Cancel this draft charter revision and restore the previous active charter."
            onClick={() => model.onCancelRevision(board.id)}
          >
            <X size={14} />
            <span>Cancel Revision</span>
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={!model.canMoveNext}
          title={
            model.canMoveNext
              ? "Save this charter answer and move to the next section."
              : "Enter an answer before moving to the next charter section."
          }
          onClick={model.moveNext}
        >
          <Check size={14} />
          <span>{model.activeQuestionIndex >= model.questions.length - 1 ? "Finish Questions" : "Next"}</span>
        </button>
      </div>
    </div>
  );
}

function ProjectBoardKickoffDefaultCard({ model }: { model: ProjectBoardKickoffInterviewModel }) {
  const { activeQuestion, activeSuggestion, activeProviderError, activeDraftingStatus, suggestDefaultsBusy } = model;
  if (!activeQuestion || activeQuestion.answer?.trim()) return null;
  if (activeSuggestion) {
    return (
      <div className="project-board-kickoff-default" aria-label="Suggested kickoff default">
        <div>
          <Bot size={14} />
          <strong>Ambient/Pi editable default</strong>
          <span className={`project-board-kickoff-default-badge ${activeQuestion.suggestedAnswerStale ? "stale" : ""}`}>
            {activeQuestion.suggestedAnswerStale ? "Needs review" : (activeQuestion.suggestedAnswerConfidence ?? "Suggested")}
          </span>
        </div>
        <p className="project-board-kickoff-default-answer">{activeSuggestion}</p>
        {activeQuestion.suggestedAnswerRationale && (
          <p className="project-board-kickoff-default-rationale">{activeQuestion.suggestedAnswerRationale}</p>
        )}
        {activeQuestion.suggestedAnswerStale && (
          <p className="project-board-kickoff-default-warning">
            This suggestion was generated before the latest source or question changes. Review it, regenerate it, or use it as a draft.
          </p>
        )}
        {activeQuestion.suggestedAnswerSourceIds && activeQuestion.suggestedAnswerSourceIds.length > 0 && (
          <p className="project-board-kickoff-default-sources">
            {activeQuestion.suggestedAnswerSourceIds.length} cited source
            {activeQuestion.suggestedAnswerSourceIds.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="project-board-kickoff-default-actions">
          <button
            type="button"
            className="secondary-button"
            title={
              activeQuestion.suggestedAnswerStale
                ? "Copy this older Ambient/Pi suggestion into the editable draft answer so you can review or revise it."
                : "Use this Ambient/Pi default as the editable draft answer."
            }
            onClick={() => model.updateDraft(activeSuggestion)}
          >
            <RotateCcw size={14} />
            <span>{activeQuestion.suggestedAnswerStale ? "Use Anyway" : "Use Default"}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={suggestDefaultsBusy}
            title="Regenerate this default from the current source scan."
            onClick={() => void model.requestDefaults([activeQuestion.id])}
          >
            <RefreshCw size={14} className={suggestDefaultsBusy ? "spin" : ""} />
            <span>Regenerate</span>
          </button>
        </div>
      </div>
    );
  }
  if (activeProviderError) {
    return (
      <div className="project-board-kickoff-default warning" aria-label="Kickoff default unavailable">
        <div>
          <Bot size={14} />
          <strong>Ambient/Pi default unavailable</strong>
        </div>
        <p className="project-board-kickoff-default-answer">{activeProviderError}</p>
        <button
          type="button"
          className="secondary-button"
          disabled={suggestDefaultsBusy}
          title="Retry Ambient/Pi default generation for this question."
          onClick={() => void model.requestDefaults([activeQuestion.id])}
        >
          <RefreshCw size={14} className={suggestDefaultsBusy ? "spin" : ""} />
          <span>Retry</span>
        </button>
      </div>
    );
  }
  if (!activeDraftingStatus) return null;
  return (
    <div className="project-board-kickoff-default streaming" aria-label="Kickoff default drafting">
      <div>
        <Bot size={14} />
        <strong>Ambient/Pi is drafting</strong>
        <span className="project-board-kickoff-default-badge">Live</span>
      </div>
      <p className="project-board-kickoff-default-answer">{activeDraftingStatus}</p>
    </div>
  );
}

function ProjectBoardKickoffReadyPanel({ model }: { model: ProjectBoardKickoffInterviewModel }) {
  const { board, finalizeBusy, ignoredThreads, isRevision, suggestedCount } = model;
  const ignoredThreadCount = ignoredThreads.length;
  return (
    <div className="project-board-kickoff-ready">
      {suggestedCount > 0 && (
        <span className="project-board-status ready">
          {suggestedCount} Pi default{suggestedCount === 1 ? "" : "s"} reviewed
        </span>
      )}
      {ignoredThreadCount > 0 && (
        <button
          type="button"
          className="project-board-source-authority-callout compact interactive"
          aria-label="Review ignored threads before activation"
          title="Jump to the ignored thread in Source review."
          onClick={() => model.onReviewIgnoredThreads(ignoredThreads[0]?.id)}
        >
          <Info size={15} />
          <div>
            <strong>
              {ignoredThreadCount} ignored thread{ignoredThreadCount === 1 ? "" : "s"} before activation
            </strong>
            <p>Open Source review and include any ignored thread that should influence synthesis before activating this charter.</p>
          </div>
        </button>
      )}
      <p className="project-board-kickoff-complete">
        The charter answers are captured. Activate the board to freeze the charter, unlock ticketized execution, and make ready candidates
        eligible for Local Task creation.
      </p>
      <div className="project-board-card-actions">
        {isRevision && (
          <button
            type="button"
            className="secondary-button"
            title="Cancel this draft charter revision and restore the previous active charter."
            onClick={() => model.onCancelRevision(board.id)}
          >
            <X size={14} />
            <span>Cancel Revision</span>
          </button>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={finalizeBusy}
          title="Activate this charter so ready candidate cards can be ticketized into Local Tasks."
          onClick={() => model.onFinalizeKickoff(board.id)}
        >
          <CheckCircle2 size={14} className={finalizeBusy ? "spin" : ""} />
          <span>
            {finalizeBusy ? (isRevision ? "Applying Revision" : "Activating Board") : isRevision ? "Apply Revision" : "Activate Board"}
          </span>
        </button>
      </div>
    </div>
  );
}

function projectBoardLatestVisibleSynthesisRun(runs?: ProjectBoardSynthesisRun[]): ProjectBoardSynthesisRun | undefined {
  if (!runs?.length) return undefined;
  return (
    runs.find(projectBoardRunBlocksPlanning) ??
    runs.find((run) => (run.status === "running" || run.status === "pause_requested") && projectBoardRunIsKickoffDefaults(run)) ??
    runs.find((run) => (run.status === "paused" || run.status === "succeeded") && !projectBoardRunIsKickoffDefaults(run)) ??
    runs[0]
  );
}

export function projectBoardQuestionSectionLabel(question: ProjectBoardQuestion, index: number): string {
  const text = question.question.toLowerCase();
  if (text.includes("primary outcome") || text.includes("goal")) return "Project goal";
  if (text.includes("source") || text.includes("authority")) return "Source authority";
  if (text.includes("proof") || text.includes("test") || text.includes("quality")) return "Proof bar";
  if (text.includes("decision") || text.includes("judgment") || text.includes("ambiguous")) return "Judgment policy";
  if (text.includes("dependency") || text.includes("order")) return "Dependency policy";
  if (text.includes("scope") || text.includes("non-goal")) return "Scope boundaries";
  return ["Project goal", "Source authority", "Judgment policy", "Proof bar", "Execution policy"][index] ?? "Project charter";
}
