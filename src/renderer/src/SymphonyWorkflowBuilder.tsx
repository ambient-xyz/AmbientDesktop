import { Music } from "lucide-react";
import { useMemo } from "react";

import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { SymphonyWorkflowPatternId } from "../../shared/symphonyWorkflowRecipes";
import {
  symphonyWorkflowBuilderComposerUiModel,
  type SymphonyWorkflowBuilderDraft,
  type SymphonyWorkflowBuilderUiModel,
} from "./symphonyWorkflowBuilderUiModel";
import {
  type ComposerDraftStore,
  useComposerDraftValue,
} from "./AppComposerControls";

export function SymphonyWorkflowComposerToggle({
  model,
  onToggle,
}: {
  model: SymphonyWorkflowBuilderUiModel["toggle"];
  onToggle: () => void;
}) {
  if (!model.visible) return null;
  return (
    <button
      type="button"
      className={`icon-button subtle symphony-composer-button ${model.active ? "active" : ""}`}
      data-tooltip={model.active ? "Symphony on" : "Symphony"}
      aria-label={model.ariaLabel}
      aria-pressed={model.active}
      disabled={model.disabled}
      onClick={onToggle}
    >
      <Music size={17} />
    </button>
  );
}

export function SymphonyWorkflowBuilderPanel({
  model,
  featureFlagSnapshot,
  draft,
  composerDraftStore,
  onSelectPattern,
  onSelectStepChoice,
  onChangeStepCustomText,
  onChangeMetric,
  onChangeBlocking,
  onRunOnce,
  onSaveRecipe,
  actionBusy,
}: {
  model: SymphonyWorkflowBuilderUiModel;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  draft: SymphonyWorkflowBuilderDraft;
  composerDraftStore: ComposerDraftStore;
  onSelectPattern: (patternId: SymphonyWorkflowPatternId) => void;
  onSelectStepChoice: (stepId: string, choiceId: string) => void;
  onChangeStepCustomText: (stepId: string, value: string) => void;
  onChangeMetric: (metricId: string, value: string) => void;
  onChangeBlocking: (blocking: boolean) => void;
  onRunOnce: () => void;
  onSaveRecipe: () => void;
  actionBusy?: "run-once" | "save-recipe";
}) {
  if (!model.visible || !model.toggle.active) return null;
  return (
    <OpenSymphonyWorkflowBuilderPanel
      featureFlagSnapshot={featureFlagSnapshot}
      draft={draft}
      composerDraftStore={composerDraftStore}
      onSelectPattern={onSelectPattern}
      onSelectStepChoice={onSelectStepChoice}
      onChangeStepCustomText={onChangeStepCustomText}
      onChangeMetric={onChangeMetric}
      onChangeBlocking={onChangeBlocking}
      onRunOnce={onRunOnce}
      onSaveRecipe={onSaveRecipe}
      actionBusy={actionBusy}
    />
  );
}

function OpenSymphonyWorkflowBuilderPanel({
  featureFlagSnapshot,
  draft,
  composerDraftStore,
  onSelectPattern,
  onSelectStepChoice,
  onChangeStepCustomText,
  onChangeMetric,
  onChangeBlocking,
  onRunOnce,
  onSaveRecipe,
  actionBusy,
}: {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  draft: SymphonyWorkflowBuilderDraft;
  composerDraftStore: ComposerDraftStore;
  onSelectPattern: (patternId: SymphonyWorkflowPatternId) => void;
  onSelectStepChoice: (stepId: string, choiceId: string) => void;
  onChangeStepCustomText: (stepId: string, value: string) => void;
  onChangeMetric: (metricId: string, value: string) => void;
  onChangeBlocking: (blocking: boolean) => void;
  onRunOnce: () => void;
  onSaveRecipe: () => void;
  actionBusy?: "run-once" | "save-recipe";
}) {
  const composerGoal = useComposerDraftValue(composerDraftStore);
  const model = useMemo(
    () =>
      symphonyWorkflowBuilderComposerUiModel({
        featureFlagSnapshot,
        draft,
        composerGoal,
        openOverride: true,
      }),
    [composerGoal, draft, featureFlagSnapshot],
  );
  const launchCard = model.launchCard;
  return (
    <div className="symphony-builder-panel" aria-label="Symphony workflow builder">
      <div className="symphony-builder-heading">
        <span className="symphony-builder-kicker">
          <Music size={14} aria-hidden="true" />
          {model.title}
        </span>
        <strong>{model.selectedPattern?.label ?? "Workflow pattern"}</strong>
        <small>{model.subtitle}</small>
      </div>

      <div className="symphony-pattern-grid" aria-label="Symphony workflow patterns">
        {model.patternCards.map((card) => (
          <button
            type="button"
            key={card.id}
            className={`symphony-pattern-card ${card.selected ? "selected" : ""}`}
            data-pattern-id={card.id}
            aria-pressed={card.selected}
            onClick={() => onSelectPattern(card.id)}
          >
            <span className="symphony-pattern-svg" dangerouslySetInnerHTML={{ __html: card.diagramSvg }} />
            <span className="symphony-pattern-title">{card.label}</span>
            <span className="symphony-pattern-summary">{card.summary}</span>
            <span className="symphony-pattern-meta">
              <span>{card.roleLabels.join(", ")}</span>
              <span>{card.metricLabel}</span>
              <span>{card.budgetLabel}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="symphony-builder-columns">
        <div className="symphony-builder-column">
          {model.steps.map((step) => (
            <section className="symphony-builder-step" key={step.id} aria-label={step.question}>
              <header>
                <strong>{step.question}</strong>
                <small>{step.impact}</small>
              </header>
              <div className="symphony-choice-row">
                {step.choices.map((choice) => (
                  <button
                    type="button"
                    key={choice.id}
                    className={`symphony-choice-button ${choice.selected ? "selected" : ""}`}
                    aria-pressed={choice.selected}
                    onClick={() => onSelectStepChoice(step.id, choice.id)}
                  >
                    <span>{choice.label}</span>
                    <small>{choice.description}</small>
                  </button>
                ))}
              </div>
              <label className={`symphony-custom-choice ${step.customChoice.selected ? "selected" : ""}`}>
                <span>{step.customChoice.label}</span>
                <input
                  type="text"
                  value={step.customChoice.value}
                  placeholder={step.customChoice.title}
                  onChange={(event) => onChangeStepCustomText(step.id, event.target.value)}
                />
              </label>
            </section>
          ))}
        </div>

        <div className="symphony-builder-column">
          <section className="symphony-builder-metrics" aria-label="Symphony metrics and rubrics">
            {model.metrics.map((metric) => (
              <label className="symphony-metric-editor" key={metric.id}>
                <span>{metric.label}</span>
                <small>{metric.prompt}</small>
                <textarea
                  value={metric.value}
                  placeholder={metric.placeholder}
                  rows={3}
                  onChange={(event) => onChangeMetric(metric.id, event.target.value)}
                />
              </label>
            ))}
          </section>

          {launchCard && (
            <section className="symphony-launch-card" aria-label="Symphony launch card">
              <header>
                <strong>{launchCard.card.title}</strong>
                <span className={`symphony-risk-pill ${launchCard.card.riskLevel}`}>{launchCard.riskLabel}</span>
              </header>
              <div className="symphony-launch-facts">
                <span>{launchCard.agentLabel}</span>
                <span>{launchCard.tokenBudgetLabel}</span>
                <span>{launchCard.memoryLabel}</span>
              </div>
              <label className="symphony-blocking-toggle">
                <input
                  type="checkbox"
                  checked={launchCard.card.blocking}
                  onChange={(event) => onChangeBlocking(event.target.checked)}
                />
                <span>Block parent synthesis until complete</span>
              </label>
              <div className="symphony-launch-requirements">
                {launchCard.requirementLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
                {launchCard.metricRequirementLabels.map((label) => (
                  <span
                    key={`metric-${label}`}
                    className={launchCard.missingMetricRequirementLabels.includes(label) ? "missing" : "ready"}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {launchCard.policyWarningLabels.length > 0 && (
                <div className="symphony-launch-warnings">
                  {launchCard.policyWarningLabels.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              )}
              <div className="symphony-launch-actions">
                <span className={`symphony-confirmation-state ${launchCard.confirmDisabled ? "disabled" : "ready"}`}>
                  {launchCard.confirmDisabledReason ?? launchCard.confirmationLabel}
                </span>
                <button
                  type="button"
                  disabled={launchCard.confirmDisabled || Boolean(actionBusy)}
                  title={launchCard.confirmDisabledReason ?? "Send this Symphony plan as a one-off callable workflow launch intent."}
                  onClick={onRunOnce}
                >
                  {actionBusy === "run-once" ? "Sending..." : model.catalogAction.oneOffRunLabel}
                </button>
                <button
                  type="button"
                  disabled={launchCard.confirmDisabled || Boolean(actionBusy)}
                  title={launchCard.confirmDisabledReason ?? "Save this Symphony plan as a reusable workflow catalog recipe."}
                  onClick={onSaveRecipe}
                >
                  {actionBusy === "save-recipe" ? "Saving..." : model.catalogAction.saveRecipeLabel}
                </button>
              </div>
              <div className="symphony-recorder-policy">
                <span>{model.catalogAction.compactRecorderTraceLabel}</span>
                <span>{model.catalogAction.diagnosticsTraceLabel}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
