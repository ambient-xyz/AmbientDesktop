/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, it } from "vitest";

import type { DesktopEvent } from "../../shared/desktopTypes";
import type { WorkflowGraphDiff } from "../../shared/workflowGraphDiff";
import { AgentRuntime } from "./workflowAgentRuntimeDogfoodFacade";
import { applyLiveAmbientProviderApiKeyEnv } from "./workflowAmbientFacade";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { invokeWorkflowNativeTool } from "./workflowNativeTools";
import { ProjectStore } from "./workflowProjectStoreFacade";
import {
  createApplyRestoreFixtureWorkflow,
  createPlanEditFixtureWorkflow,
  fakeBrowserCredentialSafeStorage,
  liveAmbientApiKey,
  liveWorkflowModel,
  writePlanEditActionDogfoodArtifact,
  writePlanEditApplyRestoreDogfoodArtifact,
  writePlanEditDogfoodArtifact,
  writePlanEditPreviewDogfoodArtifact,
  writePlanEditRunVersionDogfoodArtifact,
} from "./workflowDogfoodFixtures";

interface WorkflowLivePlanEditDogfoodDeps {
  BrowserCredentialStore: new (...args: any[]) => any;
  BrowserService: new (...args: any[]) => any;
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  workflowGraphEventCards: (...args: any[]) => any[];
  workflowGraphWithRunEvents: (...args: any[]) => { nodes: any[] };
  workflowThreadTranscriptCards: (...args: any[]) => any[];
}

const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));

export function registerWorkflowLivePlanEditDogfoodTests(deps: WorkflowLivePlanEditDogfoodDeps): void {
  const itLivePlanEdit = process.env.AMBIENT_WORKFLOW_PLAN_EDIT_LIVE === "1" ? it : it.skip;
  const { BrowserCredentialStore, BrowserService, workflowGraphEventCards, workflowGraphWithRunEvents, workflowThreadTranscriptCards } =
    deps;
  const store = new Proxy({} as ProjectStore, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });

  itLivePlanEdit(
    "dogfoods workflow Plan/Edit through the live Pi chat tool surface",
    async () => {
      const apiKey = liveAmbientApiKey();
      applyLiveAmbientProviderApiKeyEnv(apiKey);
      const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
      const fixture = await createPlanEditFixtureWorkflow(store, deps.getWorkspacePath());
      const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
      const chatThreadId = workflowThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

      const emittedEvents: DesktopEvent[] = [];
      const runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during workflow Plan/Edit dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: chatThreadId,
          workflowThreadId: fixture.threadId,
          permissionMode: "full-access",
          collaborationMode: "planner",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live Workflow Agent Plan/Edit dogfood test.",
            `Use workflowThreadId exactly ${fixture.threadId}.`,
            "Inspect the current workflow with workflow_current_context and workflow_get_artifact.",
            "Create a manifest-only revision with workflow_propose_manifest_revision that changes maxModelCalls to 3 and maxToolCalls to 8.",
            "Do not change source or graph, and do not call workflow_propose_revision.",
            "Then call workflow_validate_revision and workflow_explain_revision_diff for the created revision.",
            "After the tools finish, answer with one short sentence containing PLAN_EDIT_DOGFOOD_OK and the revision id.",
            "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
          ].join("\n"),
        });
      } finally {
        await runtime.shutdownPluginMcpServers();
      }

      const revisions = store.listWorkflowRevisions(fixture.threadId);
      const transcriptMessages = store.listMessages(chatThreadId);
      const transcript = transcriptMessages.map((message) => message.content).join("\n");
      const toolNames = transcriptMessages
        .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
        .filter((value): value is string => Boolean(value));
      const toolMessages = transcriptMessages
        .filter((message) => message.role === "tool")
        .map((message) => ({
          toolName: typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined,
          status: typeof message.metadata?.status === "string" ? message.metadata.status : undefined,
          contentPreview: message.content.slice(0, 4000),
        }));
      const streamActivities = emittedEvents.flatMap((event) =>
        event.type === "runtime-activity" && event.activity.kind === "stream" ? [event.activity] : [],
      );
      const latestRevision = revisions[0];

      await writePlanEditDogfoodArtifact({
        workflowThreadId: fixture.threadId,
        chatThreadId,
        revisionCount: revisions.length,
        latestRevision: latestRevision
          ? {
              id: latestRevision.id,
              status: latestRevision.status,
              requestedChange: latestRevision.requestedChange,
              graphDiff: latestRevision.graphDiff,
              hasSourceDiff: Boolean(latestRevision.sourceDiff),
            }
          : undefined,
        toolNames,
        toolMessages,
        streamActivities: streamActivities.map((activity) => ({
          status: activity.status,
          outputChars: activity.outputChars,
          thinkingChars: activity.thinkingChars,
          idleElapsedMs: activity.idleElapsedMs,
          idleTimeoutMs: activity.idleTimeoutMs,
        })),
        transcriptPreview: transcript.slice(0, 4000),
      });

      expect(toolNames).toEqual(expect.arrayContaining(["workflow_current_context", "workflow_get_artifact"]));
      expect(toolNames).toContain("workflow_validate_revision");
      expect(toolNames).toContain("workflow_explain_revision_diff");
      expect(toolNames).toContain("workflow_propose_manifest_revision");
      expect(streamActivities.length).toBeGreaterThan(0);
      expect(transcript).toContain("PLAN_EDIT_DOGFOOD_OK");
      expect(latestRevision).toMatchObject({
        workflowThreadId: fixture.threadId,
        status: "proposed",
      });
      expect(latestRevision?.sourceDiff).toBeUndefined();
      const graphDiff = latestRevision?.graphDiff as WorkflowGraphDiff | undefined;
      expect(graphDiff?.addedNodes).toEqual([]);
      expect(graphDiff?.removedNodes).toEqual([]);
      expect(graphDiff?.changedNodes).toEqual([]);
      expect(graphDiff?.addedEdges).toEqual([]);
      expect(graphDiff?.removedEdges).toEqual([]);
      expect(graphDiff?.changedEdges).toEqual([]);
      expect(graphDiff?.manifest.fieldChanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "maxToolCalls", before: 2, after: 8 }),
          expect.objectContaining({ field: "maxModelCalls", before: 1, after: 3 }),
        ]),
      );
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLivePlanEdit(
    "dogfoods workflow-native run settings action transcript cards with live Pi",
    async () => {
      const apiKey = liveAmbientApiKey();
      applyLiveAmbientProviderApiKeyEnv(apiKey);
      const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
      const fixture = await createPlanEditFixtureWorkflow(store, deps.getWorkspacePath());
      const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
      const chatThreadId = workflowThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

      const emittedEvents: DesktopEvent[] = [];
      const runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during workflow run-settings dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: chatThreadId,
          workflowThreadId: fixture.threadId,
          permissionMode: "full-access",
          collaborationMode: "planner",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live Workflow Agent run-settings action card dogfood test.",
            `Use workflowThreadId exactly ${fixture.threadId}.`,
            "Call workflow_update_run_settings exactly once with action preview_foreground, idleTimeoutMs 300000, and clearMaxRunMs true.",
            "Do not call workflow_propose_manifest_revision, workflow_propose_revision, workflow_apply_revision, workflow_run_preview, or workflow_run_version.",
            "After the tool finishes, answer with one short sentence containing RUN_SETTINGS_DOGFOOD_OK.",
            "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
          ].join("\n"),
        });
      } finally {
        await runtime.shutdownPluginMcpServers();
      }

      const transcriptMessages = store.listMessages(chatThreadId);
      const transcript = transcriptMessages.map((message) => message.content).join("\n");
      const toolNames = transcriptMessages
        .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
        .filter((value): value is string => Boolean(value));
      const cards = workflowThreadTranscriptCards({
        thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
        artifact: store.getWorkflowArtifact(fixture.artifactId),
        chatMessages: transcriptMessages,
      });
      const actionCards = cards.filter((card) => card.kind === "action");

      await writePlanEditActionDogfoodArtifact({
        workflowThreadId: fixture.threadId,
        chatThreadId,
        toolNames,
        actionCards,
        streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
        transcriptPreview: transcript.slice(0, 4000),
      });

      expect(toolNames).toContain("workflow_update_run_settings");
      expect(toolNames).not.toContain("workflow_propose_manifest_revision");
      expect(transcript).toContain("RUN_SETTINGS_DOGFOOD_OK");
      expect(actionCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "action",
            tone: "warning",
            title: "Run settings previewed",
            detail:
              "Foreground run settings preview only. Pass the returned runLimits to a workflow run action; no workflow revision was created.",
            badges: expect.arrayContaining(["Workflow action", "Run settings", "Preview Foreground", "Idle timeout 5m", "No total cap"]),
            panelActions: [{ id: "manifest", label: "Inspect limits", panel: "manifest" }],
          }),
        ]),
      );
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLivePlanEdit(
    "dogfoods workflow-native run preview action transcript cards with live Pi",
    async () => {
      const apiKey = liveAmbientApiKey();
      applyLiveAmbientProviderApiKeyEnv(apiKey);
      const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
      const fixture = await createPlanEditFixtureWorkflow(store, deps.getWorkspacePath());
      const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
      const chatThreadId = workflowThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow Plan/Edit chat thread was not created.");

      const emittedEvents: DesktopEvent[] = [];
      const runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during workflow run-preview dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: chatThreadId,
          workflowThreadId: fixture.threadId,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live Workflow Agent run-preview action card dogfood test.",
            `Use workflowThreadId exactly ${fixture.threadId}.`,
            "Call workflow_run_preview exactly once with idleTimeoutMs 120000 and clearMaxRunMs true.",
            "Do not call workflow_update_run_settings, workflow_run_version, workflow_apply_revision, workflow_restore_version, or any proposal tools.",
            "After the tool finishes, answer with one short sentence containing RUN_PREVIEW_DOGFOOD_OK and the run id.",
            "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
          ].join("\n"),
        });
      } finally {
        await runtime.shutdownPluginMcpServers();
      }

      const transcriptMessages = store.listMessages(chatThreadId);
      const transcript = transcriptMessages.map((message) => message.content).join("\n");
      const toolNames = transcriptMessages
        .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
        .filter((value): value is string => Boolean(value));
      const cards = workflowThreadTranscriptCards({
        thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
        artifact: store.getWorkflowArtifact(fixture.artifactId),
        chatMessages: transcriptMessages,
      });
      const actionCards = cards.filter((card) => card.kind === "action");
      const previewActionCard = actionCards.find((card) => card.title.startsWith("Preview run"));

      await writePlanEditPreviewDogfoodArtifact({
        workflowThreadId: fixture.threadId,
        chatThreadId,
        toolNames,
        actionCards,
        previewActionCard,
        streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
        transcriptPreview: transcript.slice(0, 4000),
      });

      expect(toolNames).toContain("workflow_run_preview");
      expect(toolNames).not.toContain("workflow_update_run_settings");
      expect(transcript).toContain("RUN_PREVIEW_DOGFOOD_OK");
      expect(previewActionCard).toMatchObject({
        kind: "action",
        tone: "success",
        title: "Preview run completed",
        detail: expect.stringContaining("Dry-run preview completed with run"),
        badges: expect.arrayContaining([
          "Workflow action",
          "Run preview",
          "Done",
          "Succeeded",
          "1 model call",
          "Idle timeout 2m",
          "No total cap",
        ]),
        panelActions: expect.arrayContaining([
          { id: "run_console", label: "Open run console", panel: "run_console" },
          { id: "outputs", label: "Inspect outputs", panel: "outputs" },
        ]),
      });
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLivePlanEdit(
    "dogfoods workflow-native approved-version run action transcript cards with live Pi",
    async () => {
      const apiKey = liveAmbientApiKey();
      applyLiveAmbientProviderApiKeyEnv(apiKey);
      const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
      const fixture = await createPlanEditFixtureWorkflow(store, deps.getWorkspacePath());
      const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
      const chatThreadId = workflowThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow approved-version chat thread was not created.");

      const emittedEvents: DesktopEvent[] = [];
      const runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during workflow run-version dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: chatThreadId,
          workflowThreadId: fixture.threadId,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live Workflow Agent approved-version run action card dogfood test.",
            `Use workflowThreadId exactly ${fixture.threadId}.`,
            `Use versionId exactly ${fixture.versionId}.`,
            "Call workflow_run_version exactly once with idleTimeoutMs 120000 and clearMaxRunMs true.",
            "Do not call workflow_run_preview, workflow_update_run_settings, workflow_apply_revision, workflow_restore_version, or any proposal tools.",
            "After the tool finishes, answer with one short sentence containing RUN_VERSION_DOGFOOD_OK and the run id.",
            "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
          ].join("\n"),
        });
      } finally {
        await runtime.shutdownPluginMcpServers();
      }

      const transcriptMessages = store.listMessages(chatThreadId);
      const transcript = transcriptMessages.map((message) => message.content).join("\n");
      const toolNames = transcriptMessages
        .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
        .filter((value): value is string => Boolean(value));
      const cards = workflowThreadTranscriptCards({
        thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
        artifact: store.getWorkflowArtifact(fixture.artifactId),
        chatMessages: transcriptMessages,
      });
      const actionCards = cards.filter((card) => card.kind === "action");
      const runActionCard = actionCards.find((card) => card.title.startsWith("Workflow run"));
      const latestRun = store.listWorkflowRuns(fixture.artifactId, 1)[0];
      if (!latestRun) throw new Error("workflow_run_version did not create a workflow run.");
      const detail = readWorkflowRunDetail(store, latestRun.id);
      const graph = store.listWorkflowGraphSnapshots(fixture.threadId)[0];
      const runtimeGraph = workflowGraphWithRunEvents(graph, detail.events);
      const graphEventCards = workflowGraphEventCards(detail.events, graph, {
        checkpoints: detail.checkpoints,
        modelCalls: detail.modelCalls,
        limit: 8,
      });
      const draftNode = runtimeGraph.nodes.find((node) => node.id === "draft-list");

      await writePlanEditRunVersionDogfoodArtifact({
        workflowThreadId: fixture.threadId,
        chatThreadId,
        versionId: fixture.versionId,
        toolNames,
        actionCards,
        runActionCard,
        run: latestRun,
        runEventTypes: detail.events.map((event) => event.type),
        graphNodeStates: runtimeGraph.nodes.map((node) => ({ id: node.id, state: node.runState })),
        graphEventCards: graphEventCards.map((card) => ({
          label: card.label,
          graphNodeId: card.graphNodeId,
          nodeLabel: card.nodeLabel,
          state: card.state,
          summaries: card.summaries,
        })),
        streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
        transcriptPreview: transcript.slice(0, 4000),
      });

      expect(toolNames).toContain("workflow_run_version");
      expect(toolNames).not.toContain("workflow_run_preview");
      expect(toolNames).not.toContain("workflow_update_run_settings");
      expect(transcript).toContain("RUN_VERSION_DOGFOOD_OK");
      expect(latestRun).toMatchObject({ artifactId: fixture.artifactId, status: "succeeded" });
      expect(detail.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "workflow.succeeded" })]));
      expect(detail.modelCalls).toHaveLength(1);
      expect(detail.checkpoints).toEqual(expect.arrayContaining([expect.objectContaining({ key: "readingList" })]));
      expect(draftNode).toMatchObject({ runState: "completed" });
      expect(graphEventCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            graphNodeId: "draft-list",
            nodeLabel: "Draft list",
          }),
        ]),
      );
      expect(runActionCard).toMatchObject({
        kind: "action",
        tone: "success",
        title: "Workflow run completed",
        detail: expect.stringContaining("Workflow execution completed with run"),
        badges: expect.arrayContaining([
          "Workflow action",
          "Run workflow",
          "Done",
          "Succeeded",
          "1 model call",
          "1 checkpoint",
          "Idle timeout 2m",
          "No total cap",
        ]),
        panelActions: expect.arrayContaining([
          { id: "run_console", label: "Open run console", panel: "run_console" },
          { id: "outputs", label: "Inspect outputs", panel: "outputs" },
          { id: "permissions", label: "Inspect audit", panel: "permissions" },
        ]),
      });
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLivePlanEdit(
    "dogfoods workflow-native apply and restore action transcript cards with live Pi",
    async () => {
      const apiKey = liveAmbientApiKey();
      applyLiveAmbientProviderApiKeyEnv(apiKey);
      const model = liveWorkflowModel(["AMBIENT_WORKFLOW_PLAN_EDIT_MODEL", "AMBIENT_WORKFLOW_MODEL"]);
      const fixture = await createApplyRestoreFixtureWorkflow(store, deps.getWorkspacePath());
      const workflowThread = store.ensureWorkflowAgentChatThread(fixture.threadId);
      const chatThreadId = workflowThread.chatThreadId;
      if (!chatThreadId) throw new Error("Workflow apply/restore chat thread was not created.");

      const proposal = await invokeWorkflowNativeTool(
        {
          store,
          workspacePath: deps.getWorkspacePath(),
          permissionMode: "full-access",
          planEditIntentKind: "manifest_limits",
          defaultWorkflowThreadId: fixture.threadId,
        },
        {
          toolName: "workflow_propose_manifest_revision",
          arguments: {
            requestedChange: "Raise fixture model/tool budgets before immediately restoring the original approved version.",
            maxModelCalls: 2,
            maxToolCalls: 5,
          },
        },
      );
      const revisionId = (proposal.data as { revision?: { id?: string } }).revision?.id;
      if (!revisionId) throw new Error(`Manifest proposal did not return a revision id: ${proposal.text}`);

      const emittedEvents: DesktopEvent[] = [];
      const runtime = new AgentRuntime(
        store,
        new BrowserService(() => store.getWorkspace()),
        new BrowserCredentialStore(() => store.getWorkspace(), fakeBrowserCredentialSafeStorage),
        () =>
          ({
            webContents: {
              send: (_channel: string, event: DesktopEvent) => emittedEvents.push(event),
            },
          }) as any,
        {
          request: async (request) => {
            throw new Error(`Unexpected permission prompt during workflow apply/restore dogfood: ${request.title}`);
          },
          denyThread: () => undefined,
        },
      );

      try {
        await runtime.send({
          threadId: chatThreadId,
          workflowThreadId: fixture.threadId,
          permissionMode: "full-access",
          collaborationMode: "agent",
          model,
          thinkingLevel: "minimal",
          content: [
            "This is a live Workflow Agent apply/restore action card dogfood test.",
            `Use workflowThreadId exactly ${fixture.threadId}.`,
            `First call workflow_apply_revision exactly once with revisionId ${revisionId}.`,
            `Then call workflow_restore_version exactly once with versionId ${fixture.versionId} and approveRestored true.`,
            "Do not call workflow_run_preview, workflow_run_version, workflow_update_run_settings, workflow_apply_revision more than once, workflow_restore_version more than once, or any proposal tools.",
            "After both tools finish, answer with one short sentence containing APPLY_RESTORE_DOGFOOD_OK and the restored version id.",
            "Do not use shell, bash, browser, filesystem, connector, plugin install, or direct file edit tools.",
          ].join("\n"),
        });
      } finally {
        await runtime.shutdownPluginMcpServers();
      }

      const transcriptMessages = store.listMessages(chatThreadId);
      const transcript = transcriptMessages.map((message) => message.content).join("\n");
      const toolNames = transcriptMessages
        .map((message) => (typeof message.metadata?.toolName === "string" ? message.metadata.toolName : undefined))
        .filter((value): value is string => Boolean(value));
      const cards = workflowThreadTranscriptCards({
        thread: store.getWorkflowAgentThreadSummary(fixture.threadId),
        artifact: store.getWorkflowArtifact(fixture.artifactId),
        chatMessages: transcriptMessages,
      });
      const actionCards = cards.filter((card) => card.kind === "action");
      const applyActionCard = actionCards.find((card) => card.title === "Workflow revision applied");
      const restoreActionCard = actionCards.find((card) => card.title === "Workflow version restored");
      const versions = store.listWorkflowVersions(fixture.threadId);
      const thread = store.getWorkflowAgentThreadSummary(fixture.threadId);
      const activeArtifact = store.getWorkflowArtifact(thread.activeArtifactId!);
      const appliedRevision = store.getWorkflowRevision(revisionId);

      await writePlanEditApplyRestoreDogfoodArtifact({
        workflowThreadId: fixture.threadId,
        chatThreadId,
        revisionId,
        originalVersionId: fixture.versionId,
        toolNames,
        actionCards,
        applyActionCard,
        restoreActionCard,
        appliedRevision,
        versions: versions.map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status,
          createdBy: version.createdBy,
          artifactId: version.artifactId,
        })),
        activeArtifact: {
          id: activeArtifact.id,
          status: activeArtifact.status,
          manifest: activeArtifact.manifest,
        },
        streamActivityCount: emittedEvents.filter((event) => event.type === "runtime-activity" && event.activity.kind === "stream").length,
        transcriptPreview: transcript.slice(0, 4000),
      });

      expect(toolNames).toContain("workflow_apply_revision");
      expect(toolNames).toContain("workflow_restore_version");
      expect(toolNames).not.toContain("workflow_run_preview");
      expect(toolNames).not.toContain("workflow_run_version");
      expect(toolNames).not.toContain("workflow_update_run_settings");
      expect(transcript).toContain("APPLY_RESTORE_DOGFOOD_OK");
      expect(appliedRevision).toMatchObject({ id: revisionId, status: "applied" });
      expect(versions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: fixture.versionId, version: 1, status: "approved", createdBy: "compiler" }),
          expect.objectContaining({ version: 2, status: "approved", createdBy: "workflow_revision" }),
          expect.objectContaining({ version: 3, status: "approved", createdBy: "version_revert" }),
        ]),
      );
      expect(thread.latestVersion).toMatchObject({ version: 3, status: "approved", createdBy: "version_revert" });
      expect(activeArtifact).toMatchObject({
        id: fixture.artifactId,
        status: "approved",
        manifest: expect.objectContaining({ maxModelCalls: 1, maxToolCalls: 2 }),
      });
      expect(applyActionCard).toMatchObject({
        kind: "action",
        tone: "success",
        title: "Workflow revision applied",
        badges: expect.arrayContaining(["Workflow action", "Apply revision", "Done", "Full Access audited", "Version 2"]),
        panelActions: expect.arrayContaining([
          { id: "diagram", label: "Inspect diagram", panel: "diagram" },
          { id: "versions", label: "Inspect version", panel: "versions" },
          { id: "permissions", label: "Inspect audit", panel: "permissions" },
        ]),
      });
      expect(restoreActionCard).toMatchObject({
        kind: "action",
        tone: "success",
        title: "Workflow version restored",
        badges: expect.arrayContaining([
          "Workflow action",
          "Restore version",
          "Done",
          "Target 1",
          "Restored 3",
          "Approved restored version",
          "Full Access audited",
        ]),
        panelActions: expect.arrayContaining([
          { id: "versions", label: "Inspect versions", panel: "versions" },
          { id: "diagram", label: "Inspect diagram", panel: "diagram" },
          { id: "permissions", label: "Inspect audit", panel: "permissions" },
        ]),
      });
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );
}
