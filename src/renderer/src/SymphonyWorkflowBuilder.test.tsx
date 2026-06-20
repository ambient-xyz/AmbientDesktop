import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { SYMPHONY_WORKFLOW_PATTERN_IDS } from "../../shared/symphonyWorkflowRecipes";
import { SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION } from "../../shared/symphonyPatternPreflight";
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

  it("renders auto-selected preflight rationale, confidence, roles, and expected children", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      patternId: "map_reduce",
      goal: "Compare each source packet and synthesize a recommendation.",
      preflightSelection: {
        schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
        source: "auto-selected",
        patternId: "map_reduce",
        label: "Map-Reduce",
        goal: "Compare each source packet and synthesize a recommendation.",
        confidence: 0.68,
        rationale: "The request asks Symphony to split comparable inputs, inspect them independently, and reduce the findings.",
        rolePlan: ["explorer", "summarizer"],
        expectedChildren: "One explorer child per source packet plus a reducer/summarizer.",
        candidatePatternIds: ["map_reduce", "pipeline", "ensemble"],
      },
      metricCustomizations: {
        "map_reduce-metric": "Every source packet has a cited summary before reduction.",
      },
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(panel).toContain("data-pattern-preflight=\"map_reduce\"");
    expect(panel).toContain("Auto-selected by preflight");
    expect(panel).toContain("68% confidence");
    expect(panel).toContain("split comparable inputs");
    expect(panel).toContain("Role plan: explorer, summarizer");
    expect(panel).toContain("One explorer child per source packet");
  });

  it("renders pending preflight clarification as clickable bounded choices", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      goal: "Help me with this.",
      preflightClarification: {
        schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
        goal: "Help me with this.",
        question: "Which Symphony pattern should coordinate this request?",
        candidates: [
          {
            patternId: "map_reduce",
            label: "Map-Reduce",
            confidenceLabel: "20% confidence",
            rationale: "Possible wide-analysis fit.",
            expectedChildren: "Explorer children plus a reducer.",
          },
          {
            patternId: "pipeline",
            label: "Pipeline",
            confidenceLabel: "20% confidence",
            rationale: "Possible staged handoff fit.",
            expectedChildren: "Stage children with handoff contracts.",
          },
        ],
        customOption: {
          label: "Custom details",
          description: "Add custom orchestration details to the request, then send again.",
        },
        missingInputs: ["Select a pattern before launch."],
      },
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(panel).toContain("aria-label=\"Symphony pattern clarification\"");
    expect(panel).toContain("Which Symphony pattern should coordinate this request?");
    expect(panel).toContain("data-preflight-choice=\"map_reduce\"");
    expect(panel).toContain("Map-Reduce · 20% confidence");
    expect(panel).toContain("data-preflight-choice=\"pipeline\"");
    expect(panel).toContain("data-preflight-refine=\"custom\"");
    expect(panel).toContain("Custom details");
    expect(panel).toContain("Select a pattern before launch.");
  });

  it("hides stale preflight clarification after the composer goal changes", () => {
    const featureFlagSnapshot = resolveAmbientFeatureFlags({ settings: { subagents: true } });
    const draft = {
      open: true,
      goal: "Compare each packet and synthesize a recommendation.",
      preflightClarification: {
        schemaVersion: SYMPHONY_PATTERN_PREFLIGHT_SCHEMA_VERSION,
        goal: "Help me with this.",
        question: "Which Symphony pattern should coordinate this request?",
        candidates: [
          {
            patternId: "map_reduce",
            label: "Map-Reduce",
            confidenceLabel: "20% confidence",
            rationale: "Possible wide-analysis fit.",
            expectedChildren: "Explorer children plus a reducer.",
          },
        ],
        customOption: {
          label: "Custom details",
          description: "Add custom orchestration details to the request, then send again.",
        },
        missingInputs: ["Select a pattern before launch."],
      },
    } satisfies SymphonyWorkflowBuilderDraft;
    const model = symphonyWorkflowBuilderUiModel({
      featureFlagSnapshot,
      draft,
    });

    const panel = renderPanel(model, { featureFlagSnapshot, draft });

    expect(panel).not.toContain("aria-label=\"Symphony pattern clarification\"");
    expect(panel).not.toContain("data-preflight-choice=\"map_reduce\"");
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
      onChoosePreflightCustom={() => undefined}
      onRunOnce={() => undefined}
      onSaveRecipe={() => undefined}
      actionBusy={options.actionBusy}
    />,
  );
}
