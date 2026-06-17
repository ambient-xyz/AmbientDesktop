import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowDiscoveryProgress } from "../../shared/types";
import { workflowDiscoveryContextReviewModel } from "../../renderer/src/workflowReviewUiModel";
import { pluginMcpToolDescriptor } from "../desktopToolRegistry";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import { googleWorkspaceConnectorDescriptors } from "../google-workspace/googleWorkspaceConnectors";
import { ProjectStore } from "../projectStore/projectStore";
import type { WorkflowDiscoveryContextGatherer } from "./workflowDiscoveryContextGatherer";
import {
  answerWorkflowDiscoveryQuestion,
  resolveWorkflowDiscoveryAccessRequest,
  startWorkflowDiscovery,
  startWorkflowRevisionDiscovery,
} from "./workflowDiscoveryService";
import { workspaceInventoryConnectorDescriptor } from "../workflow/workflowConnectors";
import { AmbientWorkflowDiscoveryProvider, DeterministicWorkflowDiscoveryProvider, type WorkflowDiscoveryProvider } from "./workflowDiscoveryProvider";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const itLive = process.env.AMBIENT_WORKFLOW_DISCOVERY_DOGFOOD_LIVE === "1" ? it : it.skip;
const LIVE_WORKFLOW_DISCOVERY_DOGFOOD_TIMEOUT_MS = Math.max(600_000, Number(process.env.AMBIENT_WORKFLOW_DISCOVERY_DOGFOOD_TEST_TIMEOUT_MS ?? "900000"));

describeNative("workflowDiscoveryService", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-discovery-service-"));
    await writeFile(join(workspacePath, "notes.md"), "# Notes\n", "utf8");
    await writeFile(join(workspacePath, ".env"), "SECRET=value\n", "utf8");
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("starts discovery with safe file metadata and connector capability context", async () => {
    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        connectorDescriptors: [workspaceInventoryConnectorDescriptor()],
      },
    );

    expect(result.thread.phase).toBe("discovery");
    expect(result.thread.discoveryQuestions.map((question) => question.category)).toEqual([
      "scope",
      "data_sources",
      "model_role",
    ]);
    const dataSourceQuestion = result.thread.discoveryQuestions.find((question) => question.category === "data_sources");
    expect(dataSourceQuestion?.context).toContain("notes.md");
    expect(dataSourceQuestion?.context).toContain("Secret-like paths skipped: 1");
    expect(dataSourceQuestion?.context).toContain("Connector metadata");
    expect(dataSourceQuestion?.context).toContain("Connector content");
    expect(dataSourceQuestion?.provider).toBe("deterministic");
    expect(dataSourceQuestion?.policyContextSummary).toContain("1 candidate file");
    expect(dataSourceQuestion?.cacheCheckpoint).toMatchObject({
      stage: "discovery",
      workflowThreadId: result.thread.id,
      stablePrefixHash: expect.any(String),
      mutableSuffixHash: expect.any(String),
    });
    expect(dataSourceQuestion?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "base-directory", description: expect.stringContaining("notes.md") }),
        expect.objectContaining({ id: "connectors", description: expect.stringContaining("Workspace Inventory") }),
      ]),
    );
    expect(result.thread.graph?.summary).toBe("Discovery in progress (0/3).");
  });

  it("emits discovery progress with Pi response character counts", async () => {
    const progress: WorkflowDiscoveryProgress[] = [];
    const provider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async (input, options) => {
        options?.onProgress?.({ outputChars: 37, thinkingChars: 0, elapsedMs: 1250, stage: "streaming" });
        const output = await new DeterministicWorkflowDiscoveryProvider().generate(input);
        return {
          ...output,
          provider: "ambient",
          providerModel: "fixture-model",
          telemetry: {
            responseCharCount: 91,
            durationMs: 1500,
            transport: "pi",
          },
        };
      },
    };

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        provider,
        onProgress: (event) => progress.push(event),
      },
    );

    expect(result.thread.discoveryQuestions[0].provider).toBe("ambient");
    expect(progress.map((event) => `${event.phase}:${event.status}`)).toEqual([
      "context:completed",
      "model:running",
      "model:running",
      "model:completed",
      "completed:completed",
    ]);
    expect(progress[2]).toMatchObject({
      message: "Receiving the Pi discovery response.",
      metrics: { responseChars: 37, thinkingChars: 0, providerElapsedMs: 1250 },
    });
    expect(progress[3]).toMatchObject({
      provider: "ambient",
      providerModel: "fixture-model",
      metrics: { questionCount: 3, responseChars: 91, providerElapsedMs: 1500 },
    });
  });

  it("records discovery policy audit rows and blocked context reasons for withheld file contents", async () => {
    const activeThread = store.createThread("Active chat", workspacePath);

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        permissionMode: "workspace",
        permissionAuditThreadId: activeThread.id,
        workspacePath,
      },
    );

    expect(result.thread.discoveryQuestions[0].blockedReasons?.join("\n")).toContain("file content request");
    expect(store.listPermissionAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: activeThread.id,
          toolName: "workflow_discovery:file_content",
          decision: "denied",
          decisionSource: "denied_by_policy",
          reason: "This discovery context requires an explicit permission grant before it can be included.",
        }),
      ]),
    );
  });

  it("surfaces discovery access requests and applies once grants to later discovery context", async () => {
    const activeThread = store.createThread("Active chat", workspacePath);

    let result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        permissionMode: "workspace",
        permissionAuditThreadId: activeThread.id,
        workspacePath,
      },
    );

    const request = result.thread.discoveryQuestions[0].accessRequests?.find((item) => item.capability === "file_content" && item.targetLabel === "notes.md");
    expect(request).toMatchObject({
      capability: "file_content",
      targetLabel: "notes.md",
      status: "pending",
      reusableScopes: ["workflow_thread", "project", "workspace"],
    });

    result = await resolveWorkflowDiscoveryAccessRequest(
      store,
      {
        questionId: result.thread.discoveryQuestions[0].id,
        accessRequestId: request!.id,
        response: "allow_once",
      },
      {
        permissionMode: "workspace",
        permissionAuditThreadId: activeThread.id,
        workspacePath,
      },
    );

    expect(store.listPermissionGrants()).toHaveLength(0);
    expect(result.thread.discoveryQuestions[0].accessRequests?.find((item) => item.id === request!.id)).toMatchObject({
      status: "allowed",
      response: "allow_once",
    });
    expect(store.listPermissionAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolName: "workflow_discovery:file_content",
          decision: "allowed",
          decisionSource: "prompt_allow_once",
        }),
      ]),
    );

    for (const question of result.thread.discoveryQuestions.filter((item) => !item.answer)) {
      result = await answerWorkflowDiscoveryQuestion(
        store,
        { questionId: question.id, choiceId: question.choices[0].id },
        {
          permissionMode: "workspace",
          permissionAuditThreadId: activeThread.id,
          workspacePath,
        },
      );
    }

    expect(result.thread.discoveryQuestions.some((question) => question.policyContextSummary?.includes("Granted content excerpts: notes.md."))).toBe(true);
  });

  it("turns reusable discovery access approvals into persistent permission grants", async () => {
    const activeThread = store.createThread("Active chat", workspacePath);
    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        permissionMode: "workspace",
        permissionAuditThreadId: activeThread.id,
        workspacePath,
      },
    );
    const request = result.thread.discoveryQuestions[0].accessRequests!.find((item) => item.capability === "file_content" && item.targetLabel === "notes.md")!;

    const updated = await resolveWorkflowDiscoveryAccessRequest(
      store,
      {
        questionId: result.thread.discoveryQuestions[0].id,
        accessRequestId: request.id,
        response: "always_project",
      },
      {
        permissionMode: "workspace",
        permissionAuditThreadId: activeThread.id,
        workspacePath,
      },
    );

    expect(updated.thread.discoveryQuestions[0].accessRequests?.find((item) => item.id === request.id)?.grantId).toBeTruthy();
    expect(store.listPermissionGrants()).toEqual([
      expect.objectContaining({
        scopeKind: "project",
        projectPath: workspacePath,
        actionKind: "file_content_read",
        targetLabel: "notes.md",
        conditions: { discoveryOnly: true, capability: "file_content" },
        source: "workflow_review",
      }),
    ]);
    expect(store.listPermissionAudit()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decision: "allowed",
          decisionSource: "prompt_always_project",
          grantId: store.listPermissionGrants()[0].id,
        }),
      ]),
    );
  });

  it("surfaces web research as an explicit discovery access request", async () => {
    const result = await startWorkflowDiscovery(store, {
      initialRequest: "Search arXiv and current web results for KV-cache optimization papers, then draft a memo from the findings.",
      projectPath: workspacePath,
    });

    const browserRequest = result.thread.discoveryQuestions[0].accessRequests?.find((request) => request.capability === "browser_network");
    expect(browserRequest).toMatchObject({
      actionKind: "browser_network",
      targetKind: "browser_origin",
      targetLabel: expect.stringContaining("arxiv"),
      recommendedResponse: "allow_once",
      reusableScopes: ["workflow_thread"],
      status: "pending",
    });
    expect(result.thread.discoveryQuestions[0].policyContextSummary).toContain("Additional context access needed");
    expect(result.thread.discoveryQuestions[0].blockedReasons?.join("\n")).toContain("browser network");
    expect(result.thread.discoveryQuestions[0].activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "scan", status: "completed", label: "Scanned base directory" }),
        expect.objectContaining({ kind: "access_request", status: "pending", label: "Requested additional context" }),
        expect.objectContaining({ kind: "provider_wait", status: "completed" }),
        expect.objectContaining({ kind: "question_generated", status: "completed" }),
      ]),
    );
  });

  it("grounds arxiv discovery questions in request-specific plugin capability search", async () => {
    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Find recent papers on the placebo effect from arxiv and create summaries of them.",
        projectPath: workspacePath,
      },
      {
        pluginRegistrations: [fixtureArxivPluginRegistration(), fixtureSlackPluginRegistration()],
      },
    );

    const dataSourceQuestion = result.thread.discoveryQuestions.find((question) => question.category === "data_sources");
    expect(dataSourceQuestion?.context).toContain("arXiv paper search via arXiv");
    expect(dataSourceQuestion?.context).not.toContain("Slack workflow search");
    expect(dataSourceQuestion?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "connectors",
          description: expect.stringContaining("arXiv paper search via arXiv"),
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          label: "Searched workflow capabilities",
          detail: expect.stringContaining("arXiv paper search via arXiv"),
        }),
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          label: "Described workflow capabilities",
          detail: expect.stringContaining("arXiv paper search via arXiv"),
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].capabilitySearch).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([expect.objectContaining({ kind: "plugin_tool", label: "arXiv paper search via arXiv" })]),
      }),
    );
    expect(result.thread.discoveryQuestions[0].capabilityDescriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "plugin_tool",
          label: "arXiv paper search via arXiv",
          mutationClass: "plugin_defined",
          permissionCapability: "plugin_tool_execute",
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].accessRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "plugin_tool_execute",
          targetLabel: "arXiv/arXiv paper search",
          recommendedResponse: "allow_once",
        }),
        expect.objectContaining({
          capability: "browser_network",
          targetLabel: expect.stringContaining("arxiv"),
          recommendedResponse: "allow_once",
        }),
      ]),
    );
  });

  it("grounds arxiv discovery questions in request-specific Ambient CLI capability search", async () => {
    for (let index = 0; index < 12; index += 1) {
      await writeFile(join(workspacePath, `local-research-${index}.md`), `# Local research ${index}\n`, "utf8");
    }
    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Find recent papers on the placebo effect from arxiv and create summaries of them.",
        projectPath: workspacePath,
      },
      {
        ambientCliCapabilities: [fixtureArxivAmbientCliCapability()],
      },
    );

    const dataSourceQuestion = result.thread.discoveryQuestions.find((question) => question.category === "data_sources");
    expect(dataSourceQuestion?.context).toContain("pi-arxiv:arxiv_search");
    expect(dataSourceQuestion?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "connectors",
          description: expect.stringContaining("pi-arxiv:arxiv_search"),
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          detail: expect.stringContaining("pi-arxiv:arxiv_search"),
        }),
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          label: "Described workflow capabilities",
          detail: expect.stringContaining("pi-arxiv:arxiv_search"),
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].capabilitySearch).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({
            kind: "ambient_cli",
            label: "pi-arxiv:arxiv_search",
            permissionCapability: "plugin_tool_execute",
          }),
        ]),
      }),
    );
    expect(result.thread.discoveryQuestions[0].capabilityDescriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ambient_cli",
          label: "pi-arxiv:arxiv_search",
          mutationClass: "plugin_defined",
          permissionCapability: "plugin_tool_execute",
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].accessRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "plugin_tool_execute",
          targetLabel: "Ambient CLI/pi-arxiv:arxiv_search",
          recommendedResponse: "allow_once",
        }),
      ]),
    );
  });

  it("gathers approved browser evidence and includes receipts in follow-up discovery context", async () => {
    const gatherer: WorkflowDiscoveryContextGatherer = {
      gather: async (input) => ({
        id: "evidence-arxiv",
        capability: input.accessRequest.capability,
        targetLabel: input.accessRequest.targetLabel,
        gatheredAt: "2026-05-03T00:00:00.000Z",
        provider: "test-arxiv",
        summary: "Gathered 2 arXiv results for discovery context.",
        items: [
          {
            id: "paper-1",
            title: "KV cache reuse for inference",
            snippet: "Prefix reuse lowers repeated planning latency.",
            sourceLabel: "arXiv",
            sourceUrl: "https://arxiv.org/abs/2601.00001",
          },
          {
            id: "paper-2",
            title: "Transformer cache scheduling",
            snippet: "Scheduling cache boundaries improves throughput.",
            sourceLabel: "arXiv",
            sourceUrl: "https://arxiv.org/abs/2601.00002",
          },
        ],
        redacted: true,
        timingMs: 12,
      }),
    };

    let result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Search arXiv for KV-cache optimization papers and draft a memo.",
        projectPath: workspacePath,
      },
      { contextGatherer: gatherer },
    );

    const browserRequest = result.thread.discoveryQuestions[0].accessRequests?.find((request) => request.capability === "browser_network");
    expect(browserRequest).toBeTruthy();

    result = await resolveWorkflowDiscoveryAccessRequest(
      store,
      {
        questionId: result.thread.discoveryQuestions[0].id,
        accessRequestId: browserRequest!.id,
        response: "allow_once",
      },
      { contextGatherer: gatherer },
    );

    expect(result.thread.discoveryQuestions[0].accessRequests?.find((request) => request.id === browserRequest!.id)).toMatchObject({
      status: "allowed",
      evidence: expect.objectContaining({
        provider: "test-arxiv",
        summary: "Gathered 2 arXiv results for discovery context.",
        items: expect.arrayContaining([expect.objectContaining({ sourceUrl: "https://arxiv.org/abs/2601.00001" })]),
      }),
    });
    expect(result.thread.discoveryQuestions[0].activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "access_request", status: "completed", targetLabel: browserRequest!.targetLabel }),
        expect.objectContaining({
          kind: "evidence_gather",
          status: "completed",
          evidenceId: "evidence-arxiv",
          detail: "Gathered 2 arXiv results for discovery context.",
        }),
      ]),
    );

    for (const question of result.thread.discoveryQuestions.filter((item) => !item.answer)) {
      result = await answerWorkflowDiscoveryQuestion(
        store,
        { questionId: question.id, choiceId: question.choices[0].id },
        { contextGatherer: gatherer },
      );
    }

    expect(result.thread.discoveryQuestions.some((question) => question.policyContextSummary?.includes("Approved external context evidence: browser_network"))).toBe(true);
    expect(result.thread.discoveryQuestions.some((question) => question.activityEvents?.some((event) => event.label === "Used approved context evidence"))).toBe(true);
  });

  it("surfaces connector and plugin discovery access requests without executing them", async () => {
    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Use Gmail labels and inbox messages plus the Slack workflow plugin to triage customer follow-ups.",
        projectPath: workspacePath,
      },
      {
        connectorDescriptors: googleWorkspaceConnectorDescriptors({
          states: {
            "google.gmail": {
              status: "available",
              accounts: [{ id: "primary", label: "neo@example.test" }],
            },
          },
        }),
        pluginRegistrations: [fixtureSlackPluginRegistration()],
      },
    );

    const requests = result.thread.discoveryQuestions[0].accessRequests ?? [];
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "connector_content",
          actionKind: "connector_content_read",
          targetLabel: expect.stringContaining("Gmail content"),
          recommendedResponse: "allow_once",
          reusableScopes: ["workflow_thread"],
        }),
        expect.objectContaining({
          capability: "connector_account_data",
          actionKind: "connector_account_data_read",
          targetLabel: expect.stringContaining("Gmail account details"),
          recommendedResponse: "allow_once",
          reusableScopes: ["workflow_thread"],
        }),
        expect.objectContaining({
          capability: "plugin_tool_execute",
          actionKind: "plugin_tool_execute",
          targetLabel: "Slack/Slack workflow search",
          recommendedResponse: "allow_once",
          reusableScopes: ["workflow_thread"],
        }),
      ]),
    );
    expect(result.thread.discoveryQuestions[0].policyContextSummary).toContain("connector content");
    expect(result.thread.discoveryQuestions[0].policyContextSummary).toContain("plugin tool execute");
    expect(JSON.stringify(result.thread.discoveryQuestions)).not.toContain("inbox message body");
  });

  itLive(
    "dogfoods live Ambient discovery with approved and denied discovery context",
    async () => {
      const apiKey = process.env.AMBIENT_API_KEY || process.env.AMBIENT_AGENT_AMBIENT_API_KEY;
      if (!apiKey) throw new Error("Set AMBIENT_API_KEY or AMBIENT_AGENT_AMBIENT_API_KEY for live Workflow Discovery dogfood.");
      await writeFile(
        join(workspacePath, "kv-cache-research.md"),
        [
          "# KV Cache Research Notes",
          "",
          "- Focus on transformer prefix reuse for workflow design prompts.",
          "- Compare prefill amortization, persistent sessions, and cache-aware checkpoint boundaries.",
          "- Avoid reading any secret-like files during discovery.",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        join(workspacePath, "paper-outline.md"),
        [
          "# Paper Outline",
          "",
          "Draft a short research memo explaining how KV-cache reuse can reduce repeated workflow-agent planning latency.",
          "Include recommendations for stable prompt prefixes, mutable suffixes, and audit receipts.",
        ].join("\n"),
        "utf8",
      );

      const activeThread = store.createThread("Live discovery dogfood", workspacePath);
      const progress: WorkflowDiscoveryProgress[] = [];
      const providerOptions = {
        permissionMode: "workspace" as const,
        permissionAuditThreadId: activeThread.id,
        workspacePath,
        onProgress: (event: WorkflowDiscoveryProgress) => progress.push(event),
        provider: new AmbientWorkflowDiscoveryProvider({
          apiKey,
          baseUrl: process.env.AMBIENT_BASE_URL || process.env.AMBIENT_AGENT_AMBIENT_BASE_URL,
          model: process.env.AMBIENT_WORKFLOW_DISCOVERY_MODEL || AMBIENT_DEFAULT_MODEL,
          timeoutMs: Number(process.env.AMBIENT_WORKFLOW_DISCOVERY_DOGFOOD_TIMEOUT_MS || 240_000),
        }),
      };

      let result = await startWorkflowDiscovery(
        store,
        {
          initialRequest:
            "Build a workflow that scans local research notes, searches arXiv/current web research for KV-cache optimizations, asks Ambient to synthesize a concise paper about workflow agents, and preserves a reviewable audit trail.",
          projectPath: workspacePath,
        },
        providerOptions,
      );

      expect(result.thread.discoveryQuestions.some((question) => question.provider === "ambient")).toBe(true);
      const firstQuestion = result.thread.discoveryQuestions[0];
      const fileContentRequest = firstQuestion.accessRequests?.find((request) => request.capability === "file_content");
      const secretRequest = firstQuestion.accessRequests?.find((request) => request.capability === "secret_path_metadata");
      const browserRequest = firstQuestion.accessRequests?.find((request) => request.capability === "browser_network");
      expect(fileContentRequest).toBeTruthy();
      expect(secretRequest).toBeTruthy();
      expect(browserRequest).toMatchObject({ targetLabel: expect.stringContaining("arxiv"), recommendedResponse: "allow_once" });

      result = await resolveWorkflowDiscoveryAccessRequest(
        store,
        {
          questionId: firstQuestion.id,
          accessRequestId: fileContentRequest!.id,
          response: "allow_once",
        },
        providerOptions,
      );
      result = await resolveWorkflowDiscoveryAccessRequest(
        store,
        {
          questionId: firstQuestion.id,
          accessRequestId: secretRequest!.id,
          response: "deny",
        },
        providerOptions,
      );
      result = await resolveWorkflowDiscoveryAccessRequest(
        store,
        {
          questionId: firstQuestion.id,
          accessRequestId: browserRequest!.id,
          response: "allow_once",
        },
        providerOptions,
      );

      for (const question of result.thread.discoveryQuestions.filter((item) => !item.answer)) {
        result = await answerWorkflowDiscoveryQuestion(
          store,
          {
            questionId: question.id,
            choiceId: question.choices.find((choice) => choice.recommended)?.id ?? question.choices[0].id,
          },
          providerOptions,
        );
      }

      expect(result.thread.discoveryQuestions.some((question) => question.policyContextSummary?.includes("Granted content excerpts:"))).toBe(true);
      expect(result.thread.discoveryQuestions.some((question) => question.policyContextSummary?.includes("Approved external context evidence: browser_network"))).toBe(true);
      expect(progress.some((event) => event.phase === "model" && event.metrics?.providerElapsedMs !== undefined)).toBe(true);
      expect(progress.some((event) => event.phase === "model" && event.metrics?.timeoutMode === "idle_watchdog")).toBe(true);
      expect(JSON.stringify(result.thread.discoveryQuestions)).not.toContain("SECRET=value");
      expect(store.listPermissionGrants()).toHaveLength(0);
      expect(store.listPermissionAudit()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "workflow_discovery:file_content", decision: "allowed", decisionSource: "prompt_allow_once" }),
          expect.objectContaining({ toolName: "workflow_discovery:browser_network", decision: "allowed", decisionSource: "prompt_allow_once" }),
          expect.objectContaining({ toolName: "workflow_discovery:secret_path_metadata", decision: "denied", decisionSource: "denied_by_user" }),
        ]),
      );
      const review = workflowDiscoveryContextReviewModel(result.thread);
      expect(review.inspectedCount).toBeGreaterThanOrEqual(1);
      expect(review.withheldCount).toBeGreaterThanOrEqual(1);
      expect(review.deniedCount).toBeGreaterThanOrEqual(1);
      expect(review.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "inspected", targetLabel: fileContentRequest!.targetLabel }),
          expect.objectContaining({ status: "inspected", targetLabel: browserRequest!.targetLabel, detail: expect.stringContaining("Evidence:") }),
          expect.objectContaining({ status: "denied", targetLabel: secretRequest!.targetLabel }),
        ]),
      );
    },
    LIVE_WORKFLOW_DISCOVERY_DOGFOOD_TIMEOUT_MS,
  );

  it("applies validated provider graph patches to discovery snapshots", async () => {
    const provider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async () => ({
        provider: "ambient",
        providerModel: "ambient-test",
        graphPatch: {
          summary: "Request through notes data source to summary output.",
          upsertNodes: [{ id: "notes-data", type: "data_source", label: "Notes data", description: "Safe notes metadata." }],
          upsertEdges: [{ id: "request-to-notes-data", source: "request", target: "notes-data", type: "data_flow" }],
        },
        questions: [
          {
            category: "scope",
            context: "The workflow needs a summary output.",
            question: "What should the notes summary contain?",
            choices: [
              { id: "brief", label: "Brief", description: "Generate a concise brief.", recommended: true },
              { id: "table", label: "Table", description: "Generate a structured table." },
            ],
            allowFreeform: true,
            graphImpact: "Adds the notes data node.",
          },
        ],
      }),
    };

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      { provider },
    );

    expect(result.thread.graph).toMatchObject({
      summary: "Request through notes data source to summary output.",
      nodes: expect.arrayContaining([expect.objectContaining({ id: "notes-data", type: "data_source" })]),
      edges: expect.arrayContaining([expect.objectContaining({ id: "request-to-notes-data", source: "request", target: "notes-data" })]),
    });
    expect(result.thread.discoveryQuestions[0]).toMatchObject({
      provider: "ambient",
      graphPatch: expect.objectContaining({ summary: "Request through notes data source to summary output." }),
    });
  });

  it("ignores invalid provider graph patches while keeping discovery usable", async () => {
    const provider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async () => ({
        provider: "ambient",
        providerModel: "ambient-test",
        graphPatch: {
          summary: "Invalid dangling patch.",
          upsertEdges: [{ id: "bad-edge", source: "request", target: "missing-node", type: "control_flow" }],
        },
        questions: [
          {
            category: "scope",
            context: "The workflow needs a summary output.",
            question: "What should the notes summary contain?",
            choices: [
              { id: "brief", label: "Brief", description: "Generate a concise brief.", recommended: true },
              { id: "table", label: "Table", description: "Generate a structured table." },
            ],
            allowFreeform: true,
          },
        ],
      }),
    };

    const result = await startWorkflowDiscovery(store, { initialRequest: "Summarize local notes every week.", projectPath: workspacePath }, { provider });

    expect(result.thread.graph?.summary).toBe("Discovery in progress (0/1).");
    expect(result.thread.graph?.edges.map((edge) => edge.id)).not.toContain("bad-edge");
    expect(result.thread.discoveryQuestions[0].graphPatch).toBeUndefined();
    expect(result.thread.discoveryQuestions[0].blockedReasons?.join("\n")).toContain("Ignored invalid discovery graph patch");
  });

  it("adds remaining discovery questions after the first batch is answered", async () => {
    let result = await startWorkflowDiscovery(store, {
      initialRequest: "Summarize local notes every week.",
      projectPath: workspacePath,
    });

    for (const question of result.thread.discoveryQuestions) {
      result = await answerWorkflowDiscoveryQuestion(store, {
        questionId: question.id,
        choiceId: question.choices[0].id,
      });
    }

    expect(result.thread.phase).toBe("discovery");
    expect(result.thread.discoveryQuestions.map((question) => question.category)).toEqual([
      "scope",
      "data_sources",
      "model_role",
      "side_effects",
      "error_handling",
    ]);
    expect(result.thread.graph?.summary).toBe("Discovery in progress (3/5).");

    for (const question of result.thread.discoveryQuestions.filter((item) => !item.answer)) {
      result = await answerWorkflowDiscoveryQuestion(store, {
        questionId: question.id,
        choiceId: question.choices[0].id,
      });
    }

    expect(result.thread.phase).toBe("planned");
    expect(result.thread.graph?.summary).toBe("Discovery complete; workflow is ready to compile.");
  });

  it("falls back to deterministic discovery when Ambient fails before usable output", async () => {
    const degradedAmbientProvider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async () => {
        throw new Error("429 Upstream request failed after 326ms (0 output chars, 0 thinking chars, idle 0ms).");
      },
    };

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        provider: degradedAmbientProvider,
      },
    );

    expect(result.thread.phase).toBe("discovery");
    expect(result.thread.discoveryQuestions[0]).toMatchObject({
      provider: "deterministic",
      blockedReasons: expect.arrayContaining([expect.stringContaining("Ambient discovery provider degraded before usable output")]),
      activityEvents: expect.arrayContaining([
        expect.objectContaining({ kind: "provider_wait", status: "completed", label: "Generated deterministic discovery questions" }),
        expect.objectContaining({ kind: "provider_fallback", status: "completed", label: "Discovery fallback used" }),
      ]),
    });
  });

  it("surfaces non-transient Ambient discovery failures instead of using deterministic fallback", async () => {
    const unavailableAmbientProvider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async () => {
        throw new Error("provider unavailable");
      },
    };

    await expect(
      startWorkflowDiscovery(
        store,
        {
          initialRequest: "Summarize local notes every week.",
          projectPath: workspacePath,
        },
        {
          provider: unavailableAmbientProvider,
        },
      ),
    ).rejects.toThrow("Ambient workflow discovery failed: provider unavailable");
    const failedThread = store.listWorkflowAgentFolders().flatMap((folder) => folder.threads)[0];
    expect(failedThread).toMatchObject({ phase: "failed", initialRequest: "Summarize local notes every week." });
  });

  it("classifies Downloads review as local filesystem content access before exploration", async () => {
    const [, , drive] = googleWorkspaceConnectorDescriptors({
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Drive" }],
        },
      },
    });

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Please review the documents and folders in my Downloads directory and classify them into up to 7 categories (could be less)",
        projectPath: workspacePath,
      },
      {
        connectorDescriptors: [drive],
      },
    );

    const firstQuestion = result.thread.discoveryQuestions[0];
    expect(firstQuestion.capabilitySearch?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-directory-downloads",
          kind: "base_directory",
          label: "Local filesystem: Downloads directory",
          permissionCapability: "file_content",
          targetLabel: "local Downloads directory (~/Downloads) contents",
        }),
      ]),
    );
    expect(firstQuestion.capabilitySearch?.results[0]).toMatchObject({ id: "local-directory-downloads" });
    expect(firstQuestion.capabilityDescriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-directory-downloads",
          kind: "base_directory",
          mutationClass: "read_only",
          permissionCapability: "file_content",
        }),
      ]),
    );
    expect(firstQuestion.activityEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capability_search",
          status: "completed",
          label: "Described workflow capabilities",
          detail: expect.stringContaining("Local filesystem: Downloads directory"),
        }),
      ]),
    );
    expect(firstQuestion.capabilitySearch?.results.find((result) => result.connectorId === "google.drive")).toBeUndefined();
    expect(firstQuestion.accessRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: "file_content",
          targetLabel: "local Downloads directory (~/Downloads) contents",
          targetKind: "path",
        }),
      ]),
    );
  });

  it("does not request forbidden connector access or local Desktop access for exact file_read workflows", async () => {
    const [, , drive] = googleWorkspaceConnectorDescriptors({
      states: {
        "google.drive": {
          status: "available",
          accounts: [{ id: "primary", label: "Primary Drive" }],
        },
      },
    });

    const result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: [
          "Create a Workflow Agent that uses Ambient Desktop's local/workspace file_read workflow tool directly to read dogfood-notes/admin.md and dogfood-notes/learning.md.",
          "The only permitted read tool is file_read. Forbidden external sources: Google Drive, Google Workspace, google.drive, connector content, connector account data, cloud accounts, and external accounts.",
          "Do not use workspace.inventory, search, browser, or connector listing.",
        ].join(" "),
        projectPath: workspacePath,
      },
      {
        connectorDescriptors: [workspaceInventoryConnectorDescriptor(), drive],
      },
    );

    const firstQuestion = result.thread.discoveryQuestions[0];
    expect(firstQuestion.capabilitySearch?.results.some((searchResult) => searchResult.kind === "connector")).toBe(false);
    const accessRequests = firstQuestion.accessRequests ?? [];
    expect(accessRequests).not.toEqual(expect.arrayContaining([expect.objectContaining({ capability: "connector_content" })]));
    expect(accessRequests).not.toEqual(expect.arrayContaining([expect.objectContaining({ capability: "connector_account_data" })]));
    expect(accessRequests).not.toEqual(expect.arrayContaining([expect.objectContaining({ targetLabel: expect.stringContaining("~/Desktop") })]));
  });

  it("keeps the answered question retryable when Ambient follow-up generation fails", async () => {
    let callCount = 0;
    const flakyAmbientProvider: WorkflowDiscoveryProvider = {
      kind: "ambient",
      generate: async (input) => {
        callCount += 1;
        if (callCount > 1) throw new Error("credits exhausted");
        return new DeterministicWorkflowDiscoveryProvider().generate({ ...input, remainingCategories: ["scope"] });
      },
    };

    let result = await startWorkflowDiscovery(
      store,
      {
        initialRequest: "Summarize local notes every week.",
        projectPath: workspacePath,
      },
      {
        provider: flakyAmbientProvider,
      },
    );
    const question = result.thread.discoveryQuestions[0];

    await expect(answerWorkflowDiscoveryQuestion(store, { questionId: question.id, choiceId: question.choices[0].id }, { provider: flakyAmbientProvider })).rejects.toThrow(
      "credits exhausted",
    );
    const retryable = store.getWorkflowDiscoveryQuestion(question.id);
    expect(retryable.answer).toBeUndefined();
    expect(retryable.activityEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "provider_wait", status: "failed", label: "Ambient/Pi discovery paused" })]),
    );
  });

  it("runs revision discovery against a draft revision without returning the thread to planned", async () => {
    const thread = store.createWorkflowAgentThreadSummary({
      title: "Weekly notes",
      initialRequest: "Summarize local notes every week.",
      projectPath: workspacePath,
      phase: "approved",
    });
    const artifact = store.createWorkflowArtifact({
      workflowThreadId: thread.id,
      title: "Weekly notes",
      status: "approved",
      manifest: { tools: ["ambient.responses"], mutationPolicy: "read_only" },
      spec: { goal: "Summarize local notes every week.", summary: "Read notes and produce a weekly report." },
      sourcePath: join(workspacePath, ".ambient-codex", "workflows", "weekly-notes", "main.ts"),
      statePath: join(workspacePath, ".ambient-codex", "workflows", "weekly-notes", "state.json"),
    });
    const baseGraph = store.createWorkflowGraphSnapshot({
      workflowThreadId: thread.id,
      source: "compile",
      summary: "Summarize notes.",
      nodes: [{ id: "request", type: "request", label: "Request" }],
      edges: [],
    });
    const version = store.createWorkflowVersion({
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      graphSnapshotId: baseGraph.id,
      sourcePath: artifact.sourcePath,
      repoPath: join(workspacePath, ".ambient-codex", "workflows", "weekly-notes"),
      status: "approved",
      createdBy: "compiler",
    });

    let result = await startWorkflowRevisionDiscovery(store, {
      workflowThreadId: thread.id,
      artifactId: artifact.id,
      requestedChange: "Add review for low-confidence summaries.",
    });

    const revision = store.listWorkflowRevisions(thread.id)[0];
    expect(revision).toMatchObject({
      status: "draft",
      baseVersionId: version.id,
      baseArtifactId: artifact.id,
      requestedChange: "Add review for low-confidence summaries.",
    });
    expect(result.thread.phase).toBe("revision");
    expect(result.thread.graph).toMatchObject({ source: "revision", summary: "Discovery in progress (0/3)." });
    expect(result.thread.discoveryQuestions.map((question) => question.revisionId)).toEqual([revision.id, revision.id, revision.id]);
    expect(result.thread.discoveryQuestions[0].cacheCheckpoint).toMatchObject({
      stage: "revision_discovery",
      workflowThreadId: thread.id,
    });
    expect(result.thread.discoveryQuestions[0].question).toContain("What should change");
    expect(result.thread.discoveryQuestions[0].context).toContain("Revision target: Weekly notes");

    for (const question of result.thread.discoveryQuestions) {
      result = await answerWorkflowDiscoveryQuestion(store, { questionId: question.id, choiceId: question.choices[0].id });
    }

    expect(result.thread.phase).toBe("revision");
    expect(result.thread.discoveryQuestions.filter((question) => question.revisionId === revision.id).map((question) => question.category)).toEqual([
      "scope",
      "data_sources",
      "model_role",
      "side_effects",
      "error_handling",
    ]);

    for (const question of result.thread.discoveryQuestions.filter((item) => item.revisionId === revision.id && !item.answer)) {
      result = await answerWorkflowDiscoveryQuestion(store, { questionId: question.id, choiceId: question.choices[0].id });
    }

    expect(result.thread.phase).toBe("revision");
    expect(result.thread.discoveryQuestions.filter((item) => item.revisionId === revision.id).every((item) => item.answer)).toBe(true);
    expect(result.thread.graph?.summary).toBe("Discovery complete; workflow is ready to compile.");
  });
});

function fixtureSlackPluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "slack_workflow_search",
    label: "Slack workflow search",
    description: "Search Slack messages for workflow discovery fixtures.",
    promptSnippet: "slack_workflow_search: search Slack message metadata.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName: "slack_workflow_search",
    originalName: "search",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "slack-plugin",
      pluginName: "Slack",
      pluginVersion: "1.0.0",
      pluginFingerprint: "slack-fixture",
      serverName: "slack",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "slack-plugin",
      pluginName: "Slack",
      serverName: "slack",
      name: "search",
    },
  };
}

function fixtureArxivPluginRegistration(): PluginMcpToolRegistration {
  const descriptor = pluginMcpToolDescriptor({
    registeredName: "arxiv_paper_search",
    label: "arXiv paper search",
    description: "Search arXiv paper metadata for research workflows.",
    promptSnippet: "arxiv_paper_search: search arXiv paper metadata.",
    promptGuidelines: [],
    parameters: { type: "object", properties: {}, additionalProperties: false },
  });
  return {
    registeredName: "arxiv_paper_search",
    originalName: "search",
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines: descriptor.promptGuidelines,
    parameters: descriptor.inputSchema,
    descriptor,
    launchPlan: {
      pluginId: "arxiv-plugin",
      pluginName: "arXiv",
      pluginVersion: "1.0.0",
      pluginFingerprint: "arxiv-fixture",
      serverName: "arxiv",
      cwd: process.cwd(),
      command: "node",
      args: [],
      envKeys: [],
      enabled: true,
      startable: true,
    },
    tool: {
      pluginId: "arxiv-plugin",
      pluginName: "arXiv",
      serverName: "arxiv",
      name: "search",
    },
  };
}

function fixtureArxivAmbientCliCapability() {
  return {
    capabilityId: "ambient-cli-pi-arxiv:tool:arxiv_search",
    registryPluginId: "cli:ambient-cli-pi-arxiv",
    packageId: "ambient-cli-pi-arxiv",
    packageName: "pi-arxiv",
    command: "arxiv_search",
    description: "Search arXiv paper metadata by query.",
    availability: "available" as const,
    availabilityReason: "Installed Ambient CLI package is available; execution still requires ambient_cli approval.",
    risk: ["run_process"],
    missingEnv: [],
    whyMatched: ["arxiv", "paper", "research"],
  };
}
