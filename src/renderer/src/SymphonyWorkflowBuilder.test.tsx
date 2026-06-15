import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { createComposerDraftStore } from "./AppComposerControls";
import { SymphonyWorkflowBuilderPanel, SymphonyWorkflowComposerToggle } from "./SymphonyWorkflowBuilder";
import { symphonyWorkflowBuilderUiModel, type SymphonyWorkflowBuilderDraft } from "./symphonyWorkflowBuilderUiModel";

describe("SymphonyWorkflowBuilder", () => {
  it("renders nothing while ambient.subagents hides the builder", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: false } });
    const draft = { open: true, patternId: "map_reduce" } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    expect(renderToStaticMarkup(<SymphonyWorkflowComposerToggle model={model.toggle} onToggle={() => undefined} />)).toBe("");
    expect(renderPanel(model, { featureFlagSnapshot, draft })).toBe("");
  });

  it("renders the active green toggle and all six inline SVG pattern previews", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      patternId: "pipeline",
      goal: "Build a cited implementation plan.",
      blocking: true,
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const toggle = renderToStaticMarkup(<SymphonyWorkflowComposerToggle model={model.toggle} onToggle={() => undefined} />);
    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(toggle).toContain("symphony-composer-button active");
    expect(toggle).toContain("aria-pressed=\"true\"");
    for (const patternId of SYMPHONY_WORKFLOW_PATTERN_IDS) {
      expect(panel).toContain(patternId);
    }
    expect(panel.match(/<svg viewBox="0 0 360 120"/g)).toHaveLength(6);
    expect(panel).toContain("Pipeline");
    expect(panel).toContain("Fetch, cite, synthesize");
  });

  it("renders Custom choices, metric editing, blocking state, and launch-card facts", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      patternId: "adversarial_debate",
      goal: "Compare the riskiest sub-agent launch policies.",
      blocking: true,
      stepAnswers: {
        "limits-and-policy": { customText: "Read-only, two reviewers, no connector writes." },
      },
      metricCustomizations: {
        "adversarial_debate-metric": "Score evidence, uncertainty, and unresolved dissent.",
      },
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(panel).toContain("Custom");
    expect(panel).toContain("Read-only, two reviewers, no connector writes.");
    expect(panel).toContain("Score evidence, uncertainty, and unresolved dissent.");
    expect(panel).toContain("Block parent synthesis until complete");
    expect(panel).toContain("Symphony Adversarial Debate");
    expect(panel).toContain("Budget: 180,000 tokens");
    expect(panel).toContain("Estimated agents");
  });

  it("renders actionable run and save controls once the launch card is complete", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      patternId: "map_reduce",
      goal: "Audit every implementation phase.",
      metricCustomizations: {
        "map_reduce-metric": "Every phase has an implementation commit, local validation, and remaining-risk note.",
      },
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });
    const busyPanel = renderPanel(model, { featureFlagSnapshot, draft, actionBusy: "run-once" });

    expect(panel).toContain("Send this Symphony plan as a one-off callable workflow launch intent.");
    expect(panel).toContain(">Run once</button>");
    expect(panel).toContain(">Save recipe</button>");
    expect(panel).not.toContain("Callable workflow execution UI is not attached");
    expect(busyPanel).toContain(">Sending...</button>");
  });

  it("renders missing metric criteria as launch-card preflight blockers", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      patternId: "imitate_and_verify",
      goal: "Generate and verify a migration plan.",
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(panel).toContain("Complete required verifier criteria before confirming the launch card.");
    expect(panel).toContain("<span class=\"missing\">Verifier criteria</span>");
    expect(panel).toContain("disabled=\"\"");
  });
});

function renderPanel(
  model: ReturnType<typeof symphonyWorkflowBuilderUiModel>,
  options: {
    featureFlagSnapshot: ReturnType<typeof resolveAmbientFeatureFlags>;
    draft: SymphonyWorkflowBuilderDraft;
    actionBusy?: "run-once" | "save-recipe";
  },
) {
  return renderToStaticMarkup(
    <SymphonyWorkflowBuilderPanel
      model={model}
      featureFlagSnapshot={options.featureFlagSnapshot}
      draft={options.draft}
      composerDraftStore={createComposerDraftStore(options.draft.goal ?? "")}
      onSelectPattern={() => undefined}
      onSelectStepChoice={() => undefined}
      onChangeStepCustomText={() => undefined}
      onChangeMetric={() => undefined}
      onChangeBlocking={() => undefined}
      onRunOnce={() => undefined}
      onSaveRecipe={() => undefined}
      actionBusy={options.actionBusy}
    />,
  );
}
