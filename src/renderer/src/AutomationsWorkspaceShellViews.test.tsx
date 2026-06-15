import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AutomationPaneRouter,
  AutomationProjectField,
  AutomationWorkspaceHeader,
  AutomationWorkspaceTabs,
  WorkflowAgentPaneRouter,
  automationWorkspaceActivePaneTooltip,
  automationWorkspaceHeaderModel,
  automationWorkspacePaneTitle,
  automationWorkspaceProjectSelectionModel,
  automationWorkspaceShellModel,
  type AutomationWorkspaceTab,
} from "./AutomationsWorkspaceShellViews";

describe("Automations workspace shell views", () => {
  it("models header copy for home, selected workflow recording, and selected threads", () => {
    expect(
      automationWorkspaceHeaderModel({
        activePaneTitle: "Automation Home",
        activePaneTooltip: "Home tooltip",
        legacyCompilerEnabled: false,
        totalThreadCount: 2,
        folderCount: 1,
      }),
    ).toMatchObject({
      kickerTitle: "Home tooltip",
      kickerLabel: "Automation Home",
      title: "Automation Home",
      description: "2 threads across 1 folder.",
    });

    expect(
      automationWorkspaceHeaderModel({
        selectedWorkflowRecording: { title: "Publish playbook", summary: "Captured successful publishing workflow." },
        activePaneTitle: "Automation Home",
        activePaneTooltip: "Home tooltip",
        legacyCompilerEnabled: false,
        totalThreadCount: 0,
        folderCount: 0,
      }),
    ).toMatchObject({
      kickerLabel: "Workflow Playbook",
      title: "Publish playbook",
      description: "Captured successful publishing workflow.",
    });

    expect(
      automationWorkspaceHeaderModel({
        selectedThread: {
          title: "Legacy workflow",
          preview: "Legacy preview.",
          kind: "workflow_artifact",
        },
        activePaneTitle: "Automation Home",
        activePaneTooltip: "Home tooltip",
        legacyCompilerEnabled: true,
        totalThreadCount: 0,
        folderCount: 0,
      }),
    ).toMatchObject({
      kickerLabel: "Workflow Agent Thread",
      title: "Legacy workflow",
      description: "Legacy preview.",
    });
  });

  it("renders header stats and tab active state from explicit props", () => {
    const tabs: AutomationWorkspaceTab[] = [
      { id: "home", label: "Home", title: "Home tooltip" },
      { id: "workflow_agent", label: "New Workflow", title: "Workflow tooltip" },
      { id: "runs_reviews", label: "Runs", title: "Runs tooltip" },
    ];
    const headerMarkup = renderToStaticMarkup(
      <AutomationWorkspaceHeader
        model={{
          kickerTitle: "Home tooltip",
          kickerLabel: "Home",
          title: "Automation Home",
          titleTooltip: "Home tooltip",
          description: "2 threads across 1 folder.",
        }}
        helpText="Automation help text."
        stats={{ total: 2, running: 1, attention: 0, review: 1 }}
      />,
    );
    const tabsMarkup = renderToStaticMarkup(
      <AutomationWorkspaceTabs
        homeTitle="Automations"
        tabs={tabs}
        activePane="workflow_agent"
        selectedThreadActive={false}
        onSelectPane={() => undefined}
      />,
    );
    const selectedThreadTabsMarkup = renderToStaticMarkup(
      <AutomationWorkspaceTabs
        homeTitle="Automations"
        tabs={tabs}
        activePane="workflow_agent"
        selectedThreadActive={true}
        onSelectPane={() => undefined}
      />,
    );

    expect(headerMarkup).toContain("automation-workspace-header");
    expect(headerMarkup).toContain("Automation Home");
    expect(headerMarkup).toContain("Automation help text.");
    expect(headerMarkup).toContain("<strong>2</strong>");
    expect(headerMarkup).toContain("Running");
    expect(headerMarkup).toContain("Review");
    expect(tabsMarkup).toContain("aria-label=\"Automations views\"");
    expect(tabsMarkup).toContain("New Workflow");
    expect(tabsMarkup).toContain("class=\"active\"");
    expect(selectedThreadTabsMarkup).not.toContain("class=\"active\"");
  });

  it("models pane copy, header stats, and project selection in the shell owner", () => {
    const tooltips = {
      home: "Home tooltip",
      folders: "Folder tooltip",
      workflowAgent: "Workflow tooltip",
      localTasks: "Local task tooltip",
      workflowLab: "Workflow Lab tooltip",
      schedules: "Schedule tooltip",
      runsReviews: "Runs tooltip",
    };

    expect(automationWorkspacePaneTitle("folder", { name: "Ops" }, { homeTitle: "Automation Home", workflowAgentLabel: "New Workflow" })).toBe("Ops Folder");
    expect(automationWorkspaceActivePaneTooltip("workflow_lab", tooltips)).toBe("Workflow Lab tooltip");

    const shell = automationWorkspaceShellModel({
      activePane: "folder",
      selectedFolder: { name: "Ops" },
      allAutomationThreads: [
        { status: "running", needsReview: false },
        { status: "failed", needsReview: false },
        { status: "paused", needsReview: true },
      ],
      folders: [{ name: "Ops" }, { name: "Backlog" }],
      projects: [{ path: "/workspace/other", name: "Other" }],
      activeProjectName: "Current",
      activeProjectPath: "/workspace/current",
      taskProjectPath: "/workspace/missing",
      legacyCompilerEnabled: false,
      paneCopy: {
        homeTitle: "Automation Home",
        workflowAgentLabel: "New Workflow",
        tooltips,
      },
    });

    expect(shell).toMatchObject({
      activePaneTitle: "Ops Folder",
      activePaneTooltip: "Folder tooltip",
      header: {
        kickerLabel: "Ops Folder",
        title: "Ops Folder",
        description: "3 threads across 2 folders.",
      },
      stats: {
        total: 3,
        running: 1,
        attention: 1,
        review: 1,
      },
      projectSelection: {
        selectedProject: { path: "/workspace/current", name: "Current" },
        selectedTaskProject: { path: "/workspace/current", name: "Current" },
        selectedTaskProjectPath: "/workspace/current",
      },
    });
    expect(shell.projectSelection.projectOptions.map((project) => project.path)).toEqual([
      "/workspace/current",
      "/workspace/other",
    ]);
  });

  it("keeps selected task project when it exists in project options", () => {
    expect(
      automationWorkspaceProjectSelectionModel({
        projects: [
          { path: "/workspace/current", name: "Current" },
          { path: "/workspace/task", name: "Task Project" },
        ],
        activeProjectPath: "/workspace/current",
        activeProjectName: "Current",
        taskProjectPath: "/workspace/task",
      }),
    ).toMatchObject({
      selectedProject: { path: "/workspace/current", name: "Current" },
      selectedTaskProject: { path: "/workspace/task", name: "Task Project" },
      selectedTaskProjectPath: "/workspace/task",
    });
  });

  it("renders the shared project picker field from explicit options", () => {
    const markup = renderToStaticMarkup(
      <AutomationProjectField
        projects={[
          { path: "/workspace/alpha", name: "Alpha" },
          { path: "/workspace/beta", name: "Beta" },
        ]}
        selectedPath="/workspace/beta"
        tooltip="Project tooltip"
        onProjectPathChange={() => undefined}
        onCreateProject={() => undefined}
      />,
    );

    expect(markup).toContain("Project tooltip");
    expect(markup).toContain("Alpha");
    expect(markup).toContain("Beta");
    expect(markup).toContain("selected=\"\"");
    expect(markup).toContain("/workspace/beta");
    expect(markup).toContain("New project");
  });

  it("routes automation panes lazily and prioritizes selected playbooks", () => {
    const calls: string[] = [];
    const slot = (label: string) => () => {
      calls.push(label);
      return <section>{label}</section>;
    };
    const slots = {
      renderWorkflowRecordingPlaybookPane: slot("playbook"),
      renderLocalTasksPane: slot("local-tasks"),
      renderWorkflowAgentPane: slot("workflow-agent"),
      renderWorkflowLabHomePane: slot("workflow-lab"),
      renderSchedulesPane: slot("schedules"),
      renderRunsReviewsPane: slot("runs"),
      renderFolderPane: slot("folder"),
      renderHomePane: slot("home"),
    };

    const scheduleMarkup = renderToStaticMarkup(<AutomationPaneRouter activePane="schedules" selectedWorkflowRecordingActive={false} {...slots} />);
    expect(scheduleMarkup).toContain("schedules");
    expect(calls).toEqual(["schedules"]);

    calls.length = 0;
    const playbookMarkup = renderToStaticMarkup(<AutomationPaneRouter activePane="local_tasks" selectedWorkflowRecordingActive={true} {...slots} />);
    expect(playbookMarkup).toContain("playbook");
    expect(calls).toEqual(["playbook"]);

    calls.length = 0;
    const folderMarkup = renderToStaticMarkup(<AutomationPaneRouter activePane="folder" selectedWorkflowRecordingActive={false} {...slots} />);
    expect(folderMarkup).toContain("folder");
    expect(calls).toEqual(["folder"]);
  });

  it("routes Workflow Agent panes from legacy and recorder state", () => {
    const calls: string[] = [];
    const slot = (label: string) => () => {
      calls.push(label);
      return <section>{label}</section>;
    };
    const slots = {
      renderWorkflowRecordingPlaybookPane: slot("playbook"),
      renderLegacyWorkflowHiddenPane: slot("legacy-hidden"),
      renderWorkflowRecorderStartPane: slot("recorder-start"),
      renderWorkflowDiscoveryThread: slot("discovery"),
      renderWorkflowThreadDetail: slot("thread-detail"),
      renderWorkflowAgentCompilerStartPane: slot("compiler-start"),
    };

    renderToStaticMarkup(
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={false}
        selectedWorkflowRecordingActive={true}
        selectedDraftRevisionActive={false}
        selectedWorkflowAgentThread={{ activeArtifactId: "artifact-1" }}
        {...slots}
      />,
    );
    expect(calls).toEqual(["playbook"]);

    calls.length = 0;
    renderToStaticMarkup(
      <WorkflowAgentPaneRouter legacyCompilerEnabled={false} selectedWorkflowRecordingActive={false} selectedDraftRevisionActive={false} {...slots} />,
    );
    expect(calls).toEqual(["recorder-start"]);

    calls.length = 0;
    renderToStaticMarkup(
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={true}
        selectedWorkflowRecordingActive={false}
        selectedDraftRevisionActive={true}
        selectedWorkflowAgentThread={{ activeArtifactId: "artifact-1" }}
        {...slots}
      />,
    );
    expect(calls).toEqual(["discovery"]);

    calls.length = 0;
    renderToStaticMarkup(
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={true}
        selectedWorkflowRecordingActive={false}
        selectedDraftRevisionActive={false}
        selectedWorkflowAgentThread={{ activeArtifactId: undefined }}
        {...slots}
      />,
    );
    expect(calls).toEqual(["discovery"]);

    calls.length = 0;
    renderToStaticMarkup(
      <WorkflowAgentPaneRouter
        legacyCompilerEnabled={true}
        selectedWorkflowRecordingActive={false}
        selectedDraftRevisionActive={false}
        selectedWorkflowAgentThread={{ activeArtifactId: "artifact-1" }}
        {...slots}
      />,
    );
    expect(calls).toEqual(["thread-detail"]);

    calls.length = 0;
    renderToStaticMarkup(
      <WorkflowAgentPaneRouter legacyCompilerEnabled={true} selectedWorkflowRecordingActive={false} selectedDraftRevisionActive={false} {...slots} />,
    );
    expect(calls).toEqual(["compiler-start"]);
  });
});
