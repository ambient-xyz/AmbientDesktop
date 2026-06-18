import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrchestrationTask } from "../../shared/workflowTypes";
import {
  ProjectBoardBoardDecisionImpactPanel,
  ProjectBoardExecutionOverviewPanel,
  ProjectBoardExecutionReadinessRailPanel,
  ProjectBoardUnattachedTasks,
  ProjectBoardWorkflowImpactPanel,
} from "./ProjectBoardExecutionViews";
import {
  projectBoardBoardDecisionImpactRail,
  projectBoardExecutionOverview,
  projectBoardExecutionReadinessRail,
  projectBoardWorkflowImpactPreview,
} from "./projectBoardUiModel";

describe("ProjectBoardExecutionViews", () => {
  it("renders the execution overview action surface from the explicit overview contract", () => {
    const overview = {
      state: "ready",
      headline: "Ready to prepare Local Tasks",
      detail: "All planning inputs are ready for the next execution batch.",
      metrics: [{ label: "Ready", value: 3 }],
      action: {
        action: "prepare_run",
        label: "Prepare Runs",
        busyLabel: "Preparing",
        title: "Prepare the next Local Task batch.",
        disabled: false,
        busyKey: "prepare:next",
      },
    } as unknown as ReturnType<typeof projectBoardExecutionOverview>;

    const markup = renderToStaticMarkup(
      <ProjectBoardExecutionOverviewPanel
        overview={overview}
        onSelectCard={() => undefined}
        onSelectTab={() => undefined}
        onOpenSourcePicker={() => undefined}
        onPrepareRuns={() => undefined}
        onStartRun={() => undefined}
      />,
    );

    expect(markup).toContain("Execution next step");
    expect(markup).toContain("Ready to prepare Local Tasks");
    expect(markup).toContain("Prepare Runs");
  });

  it("renders workflow impact preview actions without owning workflow commands", () => {
    const preview = {
      visible: true,
      tone: "ready",
      state: "ready",
      headline: "Workflow is ready",
      detail: "The current workflow can prepare the next execution batch.",
      workflowHashLabel: undefined,
      modelCallRequired: false,
      workflowPath: ".ambient/WORKFLOW.md",
      metrics: [{ label: "Affected", value: 2, title: "Affected prepared runs" }],
      repairPreview: undefined,
      settings: undefined,
      rawEditor: undefined,
      actions: [
        {
          action: "prepare_next",
          label: "Prepare next",
          title: "Prepare the next Local Task batch.",
          tone: "primary",
        },
      ],
      affectedRunIds: [],
    } as unknown as ReturnType<typeof projectBoardWorkflowImpactPreview>;

    const markup = renderToStaticMarkup(
      <ProjectBoardWorkflowImpactPanel
        preview={preview}
        onPrepareRuns={() => undefined}
        onResolveWorkflowImpact={() => undefined}
        onRepairWorkflow={() => undefined}
        onUpdateWorkflowSettings={() => undefined}
        onUpdateWorkflowRaw={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow impact");
    expect(markup).toContain("No current workflow hash");
    expect(markup).toContain("No Pi call for preview");
    expect(markup).toContain("Prepare next");
  });

  it("renders the readiness rail next-step summary and action", () => {
    const rail = {
      tone: "warning",
      headline: "Review planning decisions",
      detail: "One question must be resolved before the board can execute.",
      doneSummary: "Charter accepted",
      pendingSummary: "1 decision",
      nextActionSummary: "Open Decisions",
      secondary: undefined,
      metrics: [{ label: "Pending", value: 1 }],
      action: {
        action: "open_decisions",
        label: "Open Decisions",
        title: "Resolve project board decisions.",
        disabled: false,
      },
    } as unknown as ReturnType<typeof projectBoardExecutionReadinessRail>;

    const markup = renderToStaticMarkup(
      <ProjectBoardExecutionReadinessRailPanel
        rail={rail}
        onSelectCard={() => undefined}
        onSelectTab={() => undefined}
        onOpenSourcePicker={() => undefined}
        onPrepareRuns={() => undefined}
        onStartRun={() => undefined}
      />,
    );

    expect(markup).toContain("Next step");
    expect(markup).toContain("Done");
    expect(markup).toContain("Pending");
    expect(markup).toContain("Open Decisions");
  });

  it("renders decision impact cards with inspect actions", () => {
    const rail = {
      visible: true,
      tone: "attention",
      headline: "Decisions affect executable cards",
      detail: "Recent PM decisions changed card readiness.",
      metrics: [{ label: "Cards", value: 1, title: "Affected cards" }],
      cards: [
        {
          cardId: "card-1",
          title: "Extract execution views",
          sourceLabel: "Decision",
          status: "ready",
          state: "warning",
          question: "Should this stay behavior-preserving?",
          answer: "Yes",
          actionTitle: "Inspect this affected card.",
          actionLabel: "Inspect",
        },
      ],
    } as unknown as ReturnType<typeof projectBoardBoardDecisionImpactRail>;

    const markup = renderToStaticMarkup(
      <ProjectBoardBoardDecisionImpactPanel rail={rail} onSelectCard={() => undefined} />,
    );

    expect(markup).toContain("Decision impact");
    expect(markup).toContain("Extract execution views");
    expect(markup).toContain("Inspect");
  });

  it("renders unattached Local Tasks behind explicit attach actions", () => {
    const task = {
      id: "task-1",
      identifier: "LT-1",
      title: "Keep board execution behavior stable",
      description: "Existing Local Task that can be attached to this board.",
      state: "ready",
    } as OrchestrationTask;

    const markup = renderToStaticMarkup(
      <ProjectBoardUnattachedTasks
        tasks={[task]}
        onAttachLocalTask={() => undefined}
      />,
    );

    expect(markup).toContain("Existing Local Tasks");
    expect(markup).toContain("Keep board execution behavior stable");
    expect(markup).toContain("Attach");
    expect(markup).toContain("Mark Covered");
  });
});
