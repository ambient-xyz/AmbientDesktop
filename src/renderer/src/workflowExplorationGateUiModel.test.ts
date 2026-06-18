import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../shared/threadTypes";
import type { WorkflowAgentThreadSummary, WorkflowDiscoveryQuestion, WorkflowExplorationProgress, WorkflowExplorationTraceSummary, WorkflowRevisionSummary } from "../../shared/workflowTypes";
import { workflowExplorationGateForThread, workflowExplorationGateModel } from "./workflowExplorationGateUiModel";

describe("workflowExplorationGateUiModel", () => {
  it("locks exploration before chat, discovery, revision, or compiled context exists", () => {
    expect(workflowExplorationGateModel({})).toMatchObject({
      enabled: false,
      canRun: false,
      canSkip: false,
      state: "locked",
      label: "Locked",
      title: "Exploration unlocks after workflow context",
    });
  });

  it("recommends exploration once the workflow has scoped conversational context", () => {
    expect(workflowExplorationGateModel({ requestContext: true })).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: true,
      state: "recommended",
      label: "Recommended",
      reasonLabels: expect.arrayContaining(["Workflow request"]),
    });
    expect(workflowExplorationGateModel({ chatTurnCount: 1 })).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: true,
      state: "recommended",
      label: "Recommended",
    });
    expect(workflowExplorationGateModel({ answeredQuestionCount: 1 })).toMatchObject({
      enabled: true,
      label: "Recommended",
    });
    expect(workflowExplorationGateModel({ compiledContext: true })).toMatchObject({
      enabled: true,
      label: "Recommended",
    });
    expect(workflowExplorationGateModel({ revisionContext: true })).toMatchObject({
      enabled: true,
      label: "Recommended",
    });
  });

  it("surfaces running progress before completed traces", () => {
    expect(
      workflowExplorationGateModel({
        chatTurnCount: 1,
        traceCount: 1,
        progressStatus: "running",
        progressMessage: "Calling browser_search.",
      }),
    ).toMatchObject({
      enabled: true,
      canRun: false,
      canSkip: false,
      state: "running",
      label: "Running",
      detail: "Calling browser_search.",
    });
  });

  it("marks exploration complete when a trace exists", () => {
    expect(workflowExplorationGateModel({ chatTurnCount: 1, traceCount: 2 })).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: false,
      canCompileFromExploration: true,
      state: "completed",
      label: "Completed",
      reasonLabels: expect.arrayContaining(["2 traces"]),
    });
  });

  it("allows direct compile after the user skips exploration", () => {
    expect(workflowExplorationGateModel({ chatTurnCount: 1, skipped: true })).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: false,
      canCompileWithoutExploration: true,
      state: "skipped",
      label: "Skipped",
      reasonLabels: expect.arrayContaining(["User skipped"]),
    });
  });

  it("keeps a failed attempt recommended so the user can retry or skip", () => {
    expect(workflowExplorationGateModel({ chatTurnCount: 1, progressStatus: "failed", progressMessage: "Browser grant denied." })).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: true,
      state: "recommended",
      label: "Recommended",
      title: "Exploration failed; retry or skip",
      detail: "Browser grant denied.",
    });
  });

  it("grounds recommendation detail and reasons in discovery capability search results", () => {
    expect(
      workflowExplorationGateModel({
        chatTurnCount: 1,
        capabilitySearch: {
          query: "Find recent papers on arxiv.",
          policy: "Safe metadata only.",
          totalCandidateCount: 1,
          omittedCandidateCount: 0,
          results: [
            {
              id: "plugin:arxiv_paper_search",
              kind: "plugin_tool",
              label: "arXiv paper search via arXiv",
              description: "Search arXiv paper metadata.",
              status: "workflow_safe",
              recommendation: "recommended",
              reason: "The request matched a workflow-safe plugin tool.",
              matchedTerms: ["arxiv"],
              permissionCapability: "plugin_tool_execute",
              targetLabel: "arXiv/arXiv paper search",
            },
          ],
        },
      }),
    ).toMatchObject({
      enabled: true,
      state: "recommended",
      detail: expect.stringContaining("Capability search found arXiv paper search via arXiv."),
      reasonLabels: expect.arrayContaining(["Plugin: arXiv paper search via arXiv"]),
    });
  });

  it("grounds recommendation detail and reasons in Ambient CLI capability hits", () => {
    expect(
      workflowExplorationGateModel({
        chatTurnCount: 1,
        capabilitySearch: {
          query: "Find recent papers on arxiv.",
          policy: "Safe metadata only.",
          totalCandidateCount: 1,
          omittedCandidateCount: 0,
          results: [
            {
              id: "ambient-cli:ambient-cli-pi-arxiv:tool:arxiv_search",
              kind: "ambient_cli",
              label: "pi-arxiv:arxiv_search",
              description: "Search arXiv paper metadata.",
              status: "workflow_safe",
              recommendation: "recommended",
              reason: "The request matched an installed Ambient CLI command capability.",
              matchedTerms: ["arxiv"],
              capabilityId: "ambient-cli-pi-arxiv:tool:arxiv_search",
              permissionCapability: "plugin_tool_execute",
              targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
            },
          ],
        },
      }),
    ).toMatchObject({
      enabled: true,
      state: "recommended",
      detail: expect.stringContaining("Capability search found pi-arxiv:arxiv_search."),
      reasonLabels: expect.arrayContaining(["Ambient CLI: pi-arxiv:arxiv_search"]),
    });
  });

  it("assembles a thread-scoped exploration gate from workspace-owned state", () => {
    const revision = workflowRevision();
    const model = workflowExplorationGateForThread({
      thread: workflowThread({
        discoveryQuestions: [
          workflowQuestion({ id: "base-question", answer: { freeform: "Use the current workspace.", answeredAt: "2026-06-14T10:01:00.000Z" } }),
          workflowQuestion({
            id: "revision-question",
            revisionId: revision.id,
            answer: { freeform: "Check the provider status first.", answeredAt: "2026-06-14T10:02:00.000Z" },
            capabilitySearch: {
              query: "Check provider status",
              policy: "Safe metadata only.",
              totalCandidateCount: 1,
              omittedCandidateCount: 0,
              results: [
                {
                  id: "connector:status",
                  kind: "connector",
                  label: "Provider status connector",
                  description: "Read provider health.",
                  status: "workflow_safe",
                  recommendation: "recommended",
                  reason: "The request matched a workflow-safe connector.",
                  matchedTerms: ["provider"],
                  connectorId: "provider-status",
                  permissionCapability: "connector_content",
                  targetLabel: "Connector/provider-status",
                },
              ],
            },
          }),
          workflowQuestion({ id: "other-revision-question", revisionId: "other-revision" }),
        ],
      }),
      revision,
      chatMessages: [
        chatMessage({ id: "user-1", role: "user", content: "Please make this reliable." }),
        chatMessage({ id: "assistant-1", role: "assistant", content: "I will inspect the workflow." }),
        chatMessage({ id: "tool-1", role: "tool", content: "ignored" }),
        chatMessage({ id: "assistant-empty", role: "assistant", content: "   " }),
      ],
      traces: [
        workflowTrace({ id: "trace-1", status: "succeeded" }),
        workflowTrace({ id: "trace-2", status: "failed" }),
        workflowTrace({ id: "trace-3" }),
      ],
      progress: workflowProgress({ status: "failed", message: "Connector grant denied." }),
      skipped: true,
    });

    expect(model).toMatchObject({
      enabled: true,
      canRun: true,
      canSkip: false,
      canCompileFromExploration: true,
      state: "completed",
      label: "Completed",
      reasonLabels: expect.arrayContaining([
        "Workflow request",
        "2 chat turns",
        "1 discovery answer",
        "Revision context",
        "Connector: Provider status connector",
        "2 traces",
      ]),
    });
  });
});

function workflowThread(overrides: Partial<WorkflowAgentThreadSummary> = {}): WorkflowAgentThreadSummary {
  return {
    id: "workflow-thread-1",
    folderId: "folder-1",
    projectName: "Demo Project",
    projectPath: "/tmp/demo",
    title: "Provider status workflow",
    phase: "planned",
    initialRequest: "Check provider status before running.",
    preview: "Provider status workflow",
    status: "planned",
    traceMode: "production",
    discoveryQuestions: [],
    badges: [],
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowQuestion(overrides: Partial<WorkflowDiscoveryQuestion> = {}): WorkflowDiscoveryQuestion {
  return {
    id: "question-1",
    workflowThreadId: "workflow-thread-1",
    category: "scope",
    context: "The workflow needs enough context before exploration.",
    question: "What should the workflow inspect?",
    choices: [],
    allowFreeform: true,
    createdAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowRevision(overrides: Partial<WorkflowRevisionSummary> = {}): WorkflowRevisionSummary {
  return {
    id: "revision-1",
    workflowThreadId: "workflow-thread-1",
    requestedChange: "Check provider status first.",
    status: "draft",
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "chat-thread-1",
    role: "user",
    content: "Inspect the workflow.",
    createdAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowTrace(overrides: Partial<WorkflowExplorationTraceSummary> = {}): WorkflowExplorationTraceSummary {
  return {
    id: "trace-1",
    workflowThreadId: "workflow-thread-1",
    explorationId: "exploration-1",
    explorationNodeId: "agent-exploration",
    request: "Inspect provider state.",
    capabilityManifest: {},
    observations: [],
    events: [],
    distillation: {},
    createdAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}

function workflowProgress(overrides: Partial<WorkflowExplorationProgress> = {}): WorkflowExplorationProgress {
  return {
    workflowThreadId: "workflow-thread-1",
    explorationId: "exploration-1",
    graphNodeId: "agent-exploration",
    eventType: "workflow.exploration.progress",
    phase: "failed",
    status: "failed",
    message: "Connector grant denied.",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...overrides,
  };
}
