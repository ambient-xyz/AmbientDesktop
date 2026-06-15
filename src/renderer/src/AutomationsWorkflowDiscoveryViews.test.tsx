import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkflowAgentThreadSummary, WorkflowCompileProgress, WorkflowDiscoveryProgress, WorkflowRevisionSummary } from "../../shared/types";
import {
  WorkflowDiscoveryActivity,
  WorkflowDiscoveryContextReview,
  WorkflowDiscoveryQuestionView,
  WorkflowDiscoverySummary,
  WorkflowDiscoveryThreadWorkspace,
  WorkflowRequestEditor,
  WorkflowRevisionPanel,
  discoveryAccessResponseLabel,
  formatDiscoveryCapability,
  workflowDiscoveryThreadQuestions,
  workflowDiscoveryThreadWorkspaceViewModel,
} from "./AutomationsWorkflowDiscoveryViews";

describe("Automations workflow discovery views", () => {
  it("renders the discovery thread workspace from parent-owned state and render slots", () => {
    const thread = workflowThread();
    const markup = renderToStaticMarkup(
      <WorkflowDiscoveryThreadWorkspace
        thread={thread}
        layoutStyle={{ gridTemplateColumns: "58% 6px 1fr" }}
        splitHandle={<div data-testid="split-handle" />}
        diagramPane={<section className="automation-section workflow-agent-diagram-section">Diagram pane</section>}
        persistentStatus={{
          tone: "blocked",
          title: "Discovery questions block compile",
          detail: "Answer 1 remaining discovery question before compiling a reviewable workflow.",
          badges: ["1 unanswered", "Discovery"],
          action: {
            label: "Answer questions",
            title: "Open discovery",
            target: "discovery",
          },
        }}
        workflowDiscoveryProgress={{
          operationId: "operation-1",
          workflowThreadId: thread.id,
          phase: "model",
          status: "running",
          message: "Thinking",
          metrics: {
            thinkingChars: 1200,
            providerElapsedMs: 3400,
          },
          createdAt: "2026-06-14T10:00:00.000Z",
        }}
        workflowDiscoveryBusy="start"
        workflowDiscoveryAnswers={{}}
        optimisticWorkflowDiscoveryAnswers={{}}
        workflowCompileProgress={[]}
        revisions={[]}
        onOpenPersistentStatusTarget={() => undefined}
        renderRequestEditor={(workflowThread) => <div className="request-slot">Request editor for {workflowThread.title}</div>}
        renderExplorationPanel={() => <div className="exploration-slot">Exploration slot</div>}
        onCustomValueChange={() => undefined}
        onAnswer={() => undefined}
        onResolveAccessRequest={() => undefined}
        onCompile={() => undefined}
        onOpenCompileDiagnostics={() => undefined}
        onEditRequest={() => undefined}
        onReportCompileUnsupported={() => undefined}
        onStartRevision={() => undefined}
        onResolveRevision={() => undefined}
      />,
    );

    expect(markup).toContain("Workflow Discovery locked on");
    expect(markup).toContain("Request editor for Daily support digest");
    expect(markup).toContain("Exploration slot");
    expect(markup).toContain("Discovery questions");
    expect(markup).toContain("0/1 answered");
    expect(markup).toContain("Pi is thinking through discovery");
    expect(markup).toContain("thinking: 1,200 chars");
    expect(markup).toContain("Diagram pane");
    expect(markup).toContain("split-handle");
  });

  it("renders discovery question actions, evidence, activity, and answer summary without owning commands", () => {
    const thread = workflowThread();
    const question = thread.discoveryQuestions[0]!;
    const markup = renderToStaticMarkup(
      <>
        <WorkflowDiscoveryQuestionView
          question={question}
          customValue="Use the support inbox"
          workflowDiscoveryBusy={`access:${question.id}:access-1`}
          onCustomValueChange={() => undefined}
          onAnswer={() => undefined}
          onResolveAccessRequest={() => undefined}
        />
        <WorkflowDiscoveryActivity questions={thread.discoveryQuestions} />
        <WorkflowDiscoverySummary
          questions={thread.discoveryQuestions.map((item) => ({
            ...item,
            answer: {
              choiceId: "choice-1",
              answeredAt: "2026-06-14T10:01:00.000Z",
            },
          }))}
        />
      </>,
    );

    expect(markup).toContain("More context would help");
    expect(markup).toContain("Connector Metadata: Support inbox");
    expect(markup).toContain("Evidence: Account metadata found");
    expect(markup).toContain("gmail@example.com");
    expect(markup).toContain("Always for workflow");
    expect(markup).toContain("Deny");
    expect(markup).toContain("Use freeform");
    expect(markup).toContain("Capability lookup");
    expect(markup).toContain("Support inbox");
  });

  it("scopes the discovery workspace model to the active revision and compile thread", () => {
    const revision = workflowRevision();
    const baseThread = workflowThread();
    const baseQuestion = baseThread.discoveryQuestions[0]!;
    const revisionQuestion = {
      ...baseQuestion,
      id: "revision-question-1",
      revisionId: revision.id,
      accessRequests: [],
      answer: {
        choiceId: "choice-1",
        answeredAt: "2026-06-14T10:02:00.000Z",
      },
    };
    const otherRevisionQuestion = {
      ...baseQuestion,
      id: "revision-question-other",
      revisionId: "revision-other",
      accessRequests: [],
      answer: undefined,
    };
    const thread = {
      ...baseThread,
      phase: "revision",
      discoveryQuestions: [baseQuestion, revisionQuestion, otherRevisionQuestion],
    } as WorkflowAgentThreadSummary;
    const compileProgress: WorkflowCompileProgress[] = [
      {
        compileId: "compile-1",
        phase: "model",
        status: "running",
        message: "Compiling revised graph.",
        current: 2,
        total: 4,
        createdAt: "2026-06-14T10:03:00.000Z",
      },
    ];
    const discoveryProgress: WorkflowDiscoveryProgress = {
      operationId: "operation-1",
      workflowThreadId: thread.id,
      revisionId: revision.id,
      phase: "model",
      status: "running",
      message: "Thinking",
      createdAt: "2026-06-14T10:04:00.000Z",
    };

    expect(workflowDiscoveryThreadQuestions(thread, revision).map((question) => question.id)).toEqual(["revision-question-1"]);

    const model = workflowDiscoveryThreadWorkspaceViewModel({
      thread,
      revision,
      workflowBusy: "compile",
      workflowCompileThreadId: thread.id,
      workflowCompileProgress: compileProgress,
      workflowDiscoveryProgress: discoveryProgress,
    });

    expect(model.questions.map((question) => question.id)).toEqual(["revision-question-1"]);
    expect(model.persistentStatus).toMatchObject({
      tone: "running",
      title: "Compile is running",
      action: { target: "compile" },
    });
    expect(model.scopedDiscoveryProgress?.revisionId).toBe(revision.id);

    const inactiveProgressModel = workflowDiscoveryThreadWorkspaceViewModel({
      thread,
      revision,
      workflowCompileProgress: [],
      workflowDiscoveryProgress: {
        ...discoveryProgress,
        revisionId: "revision-other",
      },
    });

    expect(inactiveProgressModel.scopedDiscoveryProgress).toBeUndefined();
  });

  it("renders request editor, context review, and revision panel from explicit props", () => {
    const thread = workflowThread();
    const revision = workflowRevision();
    const markup = renderToStaticMarkup(
      <>
        <WorkflowRequestEditor
          thread={thread}
          requestDraft="Summarize customer email follow-ups."
          requestChanged
          restartBusy={false}
          textareaRef={{ current: null }}
          onDraftChange={() => undefined}
          onReset={() => undefined}
          onRestart={() => undefined}
        />
        <WorkflowDiscoveryContextReview
          model={{
            items: [
              {
                id: "context-1",
                questionId: "question-1",
                questionLabel: "Inbox choice",
                category: "connectors",
                categoryLabel: "Connectors",
                capabilityLabel: "Gmail",
                targetLabel: "Support inbox",
                status: "inspected",
                statusLabel: "Inspected",
                scopeLabel: "Allowed once",
                detail: "Discovery inspected available Gmail labels.",
                grantId: "grant-1",
              },
            ],
            inspectedCount: 1,
            withheldCount: 0,
            deniedCount: 0,
            tileValue: "1 inspected",
            tileDetail: "1 context source inspected",
            tone: "ready",
          }}
        />
        <WorkflowRevisionPanel
          thread={thread}
          revisions={[revision]}
          workflowBusy={`revision:${revision.id}:applied`}
          onStartRevision={() => undefined}
          onResolveRevision={() => undefined}
        />
      </>,
    );

    expect(markup).toContain("Restart discovery");
    expect(markup).toContain("Discovery context inspected");
    expect(markup).toContain("Support inbox");
    expect(markup).toContain("Grant grant-1");
    expect(markup).toContain("Proposed revision");
    expect(markup).toContain("Based on saved version and artifact");
    expect(markup).toContain("Applying");
    expect(markup).toContain("+review()");
  });

  it("keeps discovery helper labels stable", () => {
    expect(formatDiscoveryCapability("connector_metadata")).toBe("Connector Metadata");
    expect(discoveryAccessResponseLabel("always_workspace")).toBe("Always allowed for workspace");
    expect(discoveryAccessResponseLabel("deny")).toBe("Allowed");
  });
});

function workflowThread(): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    title: "Daily support digest",
    initialRequest: "Summarize customer email follow-ups.",
    projectName: "Inbox Ops",
    projectPath: "/tmp/inbox-ops",
    phase: "discovery",
    status: "needs_input",
    traceMode: "production",
    discoveryQuestions: [
      {
        id: "question-1",
        question: "Which inbox should the workflow inspect?",
        category: "data_source",
        context: "Pick the customer support source.",
        graphImpact: "Adds the source node.",
        choices: [
          {
            id: "choice-1",
            label: "Support inbox",
            description: "Use the shared support mailbox.",
            recommended: true,
          },
        ],
        allowFreeform: true,
        accessRequests: [
          {
            id: "access-1",
            capability: "connector_metadata",
            actionKind: "connector_read",
            targetKind: "connector",
            targetLabel: "Support inbox",
            reason: "Validate label availability before compiling.",
            auditDetail: "Needs Gmail metadata.",
            risk: "low",
            reusableScopes: ["workflow_thread", "project"],
            recommendedResponse: "allow_once",
            status: "pending",
            evidence: {
              provider: "gmail",
              summary: "Account metadata found",
              timingMs: 1250,
              redacted: true,
              truncated: false,
              items: [
                {
                  id: "evidence-1",
                  title: "Gmail account",
                  sourceLabel: "gmail@example.com",
                  snippet: "Labels include Support and VIP.",
                },
              ],
            },
          },
        ],
        activityEvents: [
          {
            id: "activity-1",
            kind: "capability_lookup",
            status: "completed",
            label: "Capability lookup",
            detail: "Found Gmail metadata capability.",
            durationMs: 250,
            createdAt: "2026-06-14T10:00:00.000Z",
          },
        ],
        createdAt: "2026-06-14T10:00:00.000Z",
      },
    ],
  } as unknown as WorkflowAgentThreadSummary;
}

function workflowRevision(): WorkflowRevisionSummary {
  return {
    id: "revision-1",
    workflowThreadId: "workflow-thread-1",
    baseVersionId: "version-1",
    baseArtifactId: "artifact-1",
    proposedVersionId: "version-2",
    proposedArtifactId: "artifact-2",
    requestedChange: "Add a review gate before sending the digest.",
    status: "proposed",
    sourceDiff: "diff --git a/main.ts b/main.ts\n--- a/main.ts\n+++ b/main.ts\n-old()\n+new()\n+review()",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:05:00.000Z",
  };
}
