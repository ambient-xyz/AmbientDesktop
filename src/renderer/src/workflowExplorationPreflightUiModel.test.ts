import { describe, expect, it } from "vitest";
import type { WorkflowAgentThreadSummary, WorkflowArtifactSummary } from "../../shared/workflowTypes";
import { workflowExplorationGateModel } from "./workflowExplorationGateUiModel";
import { workflowExplorationPreflightModel } from "./workflowExplorationPreflightUiModel";

const baseThread: Pick<
  WorkflowAgentThreadSummary,
  "title" | "initialRequest" | "activeArtifactId" | "latestVersion" | "discoveryQuestions" | "projectName"
> = {
  title: "Workflow",
  initialRequest: "Find the best movies for couples playing in Scottsdale Arizona this week.",
  activeArtifactId: undefined,
  latestVersion: undefined,
  discoveryQuestions: [],
  projectName: "Home",
};

describe("workflowExplorationPreflightUiModel", () => {
  it("surfaces exact default bounded exploration budget", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1 }),
      thread: baseThread,
    });

    expect(sectionItems(model, "budget")).toEqual(["6 Pi turns", "4 tool calls", "4 connector calls", "2 Ambient calls", "3m wall-clock cap"]);
  });

  it("surfaces caller-provided bounded exploration budget overrides", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1 }),
      thread: baseThread,
      budgets: { maxModelTurns: 8, maxToolCalls: 6, maxConnectorCalls: 10, maxAmbientCalls: 3, maxElapsedMs: 600_000 },
    });

    expect(sectionItems(model, "budget")).toEqual(["8 Pi turns", "6 tool calls", "10 connector calls", "3 Ambient calls", "10m wall-clock cap"]);
  });

  it("predicts browser/search access and grants for current web research tasks", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1 }),
      thread: baseThread,
    });

    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Browser/search exploration"]));
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Browser/network read grant"]));
  });

  it("prefers persisted discovery capability search over keyword-only access guesses", () => {
    const thread = {
      ...baseThread,
      initialRequest: "Find recent papers on the placebo effect from arxiv and create summaries of them.",
      discoveryQuestions: [
        {
          id: "question-1",
          workflowThreadId: "thread-1",
          category: "data_sources",
          context: "Capability-aware arxiv discovery.",
          question: "How should the workflow access arxiv?",
          choices: [],
          allowFreeform: true,
          capabilitySearch: {
            query: "Find recent papers on the placebo effect from arxiv and create summaries of them.",
            policy: "Safe metadata only.",
            totalCandidateCount: 2,
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
          createdAt: "2026-05-13T00:00:00.000Z",
        },
      ],
    } satisfies typeof baseThread;
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1, capabilitySearch: thread.discoveryQuestions[0].capabilitySearch }),
      thread,
    });

    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Plugin capability: arXiv paper search via arXiv"]));
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Plugin tool grant: arXiv/arXiv paper search"]));
  });

  it("surfaces Ambient CLI capability search hits distinctly from MCP plugins", () => {
    const capabilitySearch = {
      query: "Find recent papers on arxiv.",
      policy: "Safe metadata only.",
      totalCandidateCount: 1,
      omittedCandidateCount: 0,
      results: [
        {
          id: "ambient-cli:ambient-cli-pi-arxiv:tool:arxiv_search",
          kind: "ambient_cli" as const,
          label: "pi-arxiv:arxiv_search",
          description: "Search arXiv paper metadata.",
          status: "workflow_safe" as const,
          recommendation: "recommended" as const,
          reason: "The request matched an installed Ambient CLI command capability.",
          matchedTerms: ["arxiv"],
          capabilityId: "ambient-cli-pi-arxiv:tool:arxiv_search",
          permissionCapability: "plugin_tool_execute" as const,
          targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
        },
      ],
    };
    const thread = {
      ...baseThread,
      initialRequest: "Find recent papers on arxiv.",
      discoveryQuestions: [
        {
          id: "question-1",
          workflowThreadId: "thread-1",
          category: "data_sources" as const,
          context: "Capability-aware arxiv discovery.",
          question: "How should the workflow access arxiv?",
          choices: [],
          allowFreeform: true,
          capabilitySearch,
          createdAt: "2026-05-13T00:00:00.000Z",
        },
      ],
    } satisfies typeof baseThread;

    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1, capabilitySearch }),
      thread,
    });

    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Ambient CLI capability: pi-arxiv:arxiv_search"]));
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Ambient CLI execution grant: Ambient CLI/pi-arxiv:arxiv_search"]));
  });

  it("predicts Gmail read access from the request text", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ chatTurnCount: 1 }),
      thread: {
        ...baseThread,
        initialRequest: "Read my last 100 Gmail emails and categorize them into a report.",
      },
    });

    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Gmail connector"]));
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Gmail read grant"]));
  });

  it("treats Downloads document review as local filesystem access, not Google Drive", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ requestContext: true }),
      thread: {
        ...baseThread,
        initialRequest: "Please review the documents and folders in my Downloads directory and classify them into up to 7 categories.",
      },
    });

    expect(sectionItems(model, "scope")).toEqual(expect.arrayContaining(["Project: Home", "Requested local folder: Downloads"]));
    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Local filesystem: Downloads directory"]));
    expect(sectionItems(model, "likely_access")).not.toContain("Google Drive connector");
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Local file read grant: Downloads directory contents"]));
    expect(sectionItems(model, "grants")).not.toContain("Drive read grant");
  });

  it("does not treat Ambient Desktop product text or denied source clauses as exploration access", () => {
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ requestContext: true }),
      thread: {
        ...baseThread,
        initialRequest: [
          "Create a Workflow Agent that uses Ambient Desktop's local/workspace file_read workflow tool directly to read dogfood-notes/admin.md and dogfood-notes/learning.md.",
          "The only permitted read tool is file_read. Forbidden external sources: Google Drive, Google Workspace, google.drive, connector content, connector account data, cloud accounts, and external accounts.",
          "Do not use workspace.inventory, search, browser, or connector listing.",
        ].join(" "),
      },
    });

    expect(sectionItems(model, "scope")).not.toContain("Requested local folder: Desktop");
    expect(sectionItems(model, "likely_access")).toEqual(expect.arrayContaining(["Workspace file inspection"]));
    expect(sectionItems(model, "likely_access")).not.toEqual(expect.arrayContaining(["Browser/search exploration", "Google Drive connector"]));
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["Workspace file read grant"]));
    expect(sectionItems(model, "grants")).not.toEqual(expect.arrayContaining(["Browser/network read grant", "Drive read grant", "Local file read grant: Desktop directory contents"]));
  });

  it("includes compiled artifact manifest capabilities when available", () => {
    const artifact: Pick<WorkflowArtifactSummary, "title" | "status" | "manifest"> = {
      title: "Movie Picks",
      status: "ready_for_preview",
      manifest: {
        tools: ["ambient.responses", "browser_search"],
        connectors: [
          {
            connectorId: "google.gmail",
            accountId: "default",
            scopes: ["gmail.readonly"],
            operations: ["messages.search", "messages.read"],
            dataRetention: "redacted_audit",
          },
        ],
        pluginCapabilities: [
          {
            capabilityId: "arxiv.search",
            pluginId: "arxiv",
            pluginName: "arXiv",
            serverName: "arxiv",
            toolName: "search",
            registeredName: "arxiv.search",
          },
        ],
        mutationPolicy: "read_only",
      },
    };
    const model = workflowExplorationPreflightModel({
      gate: workflowExplorationGateModel({ compiledContext: true }),
      thread: { ...baseThread, activeArtifactId: "artifact-1" },
      artifact,
    });

    expect(sectionItems(model, "scope")).toEqual(expect.arrayContaining(["Artifact: Movie Picks", "Compiled artifact context"]));
    expect(sectionItems(model, "likely_access")).toEqual(
      expect.arrayContaining(["Ambient model call", "Browser/search tool: browser_search", "Connector: google.gmail (messages.search, messages.read)", "Plugin: arXiv (search)"]),
    );
    expect(sectionItems(model, "grants")).toEqual(expect.arrayContaining(["google.gmail scopes: gmail.readonly", "arXiv plugin capability", "Mutation policy: Read Only"]));
  });
});

function sectionItems(model: ReturnType<typeof workflowExplorationPreflightModel>, sectionId: string): string[] {
  return model.sections.find((section) => section.id === sectionId)?.items ?? [];
}
