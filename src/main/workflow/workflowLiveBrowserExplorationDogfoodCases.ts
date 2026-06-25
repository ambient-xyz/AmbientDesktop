/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { runWorkflowThreadExploration } from "./workflowExplorationService";
import { runWorkflowArtifact } from "./workflowRunService";
import {
  browserExplorationReviewCompilerOutput,
  browserInterventionRecoveryCompilerOutput,
  eventCountsByType,
  fakeScottsdaleEntertainmentBrowser,
  fakeScottsdaleEntertainmentBrowserWithIntervention,
  latestRunForArtifact,
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveWorkflowModel,
  sequenceExplorationProvider,
  writeBrowserExplorationReviewDogfoodArtifact,
  writeBrowserInterventionRecoveryDogfoodArtifact,
} from "./workflowDogfoodFixtures";

interface WorkflowLiveBrowserExplorationDogfoodDeps {
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  workflowExplorationGateModel: (...args: any[]) => any;
  workflowExplorationTraceCards: (...args: any[]) => any[];
  workflowGraphEventCards: (...args: any[]) => any[];
  workflowGraphWithRunEvents: (...args: any[]) => { nodes: any[] };
  workflowRuntimeInputCards: (...args: any[]) => any[];
  workflowRunOutputCards: (...args: any[]) => any[];
  workflowThreadComposerModel: (...args: any[]) => any;
}

const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));

export function registerWorkflowLiveBrowserExplorationDogfoodTests(deps: WorkflowLiveBrowserExplorationDogfoodDeps): void {
  const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as ProjectStore, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
  const {
    workflowExplorationGateModel,
    workflowExplorationTraceCards,
    workflowGraphEventCards,
    workflowGraphWithRunEvents,
    workflowRuntimeInputCards,
    workflowRunOutputCards,
    workflowThreadComposerModel,
  } = deps;

  itLive(
    "dogfoods browser exploration into artifact review and final rendered output",
    async () => {
      const workspacePath = deps.getWorkspacePath();
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const query = "best movies and live shows for couples in Scottsdale Arizona this week";
      const browser = fakeScottsdaleEntertainmentBrowser();
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Scottsdale Couples Entertainment Browser Dogfood",
        initialRequest: "Find the best movies and live shows for couples playing in Scottsdale Arizona this week.",
        projectPath: workspacePath,
        traceMode: "debug",
        phase: "planned",
      });
      const recommendedGate = workflowExplorationGateModel({ chatTurnCount: 1 });
      const explorationProgress: Array<{ status: string; phase: string; message: string; graphNodeId?: string }> = [];
      const exploration = await runWorkflowThreadExploration({
        store,
        workflowThreadId: thread.id,
        workspacePath,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        permissionMode: "full-access",
        browser,
        provider: sequenceExplorationProvider([
          {
            action: "call_tool",
            toolName: "browser_search",
            input: { query, maxResults: 5, fetchContent: false },
            reason: "Probe live-search result shape before compiling a deterministic browser workflow.",
            nodeId: "explore-search",
          },
          {
            action: "call_tool",
            toolName: "browser_content",
            input: { url: "https://example.test/scottsdale/couples-movies" },
            reason: "Inspect one promising result so compile can model source cards and review artifacts.",
            nodeId: "explore-read",
          },
          {
            action: "finish",
            distillation: {
              summary:
                "Exploration found browser-search result cards and source-page text suitable for a deterministic entertainment shortlist workflow with a user review gate.",
              observedCalls: [
                {
                  kind: "tool",
                  name: "browser_search",
                  status: "succeeded",
                  inputSummary: query,
                  outputSummary: "Three compact Scottsdale entertainment result cards with title, url, and snippet.",
                },
                {
                  kind: "tool",
                  name: "browser_content",
                  status: "succeeded",
                  inputSummary: "https://example.test/scottsdale/couples-movies",
                  outputSummary: "Movie listings with date-night and couples-friendly evidence.",
                },
              ],
              successfulPatterns: [
                "Use browser_search for the first result set, then browser_nav/browser_content on a bounded shortlist instead of opening many windows.",
                "Checkpoint normalized source cards before asking Ambient to synthesize recommendations.",
                "Pause with an HTML shortlist artifact so the user can adjust source preference before final output.",
              ],
              dataShapes: [
                "Search result: {title,url,snippet}",
                "Source page: {url,title,text,links}",
                "Review artifact: {artifactPath,html,markdown,summary,sources[]}",
              ],
              requiredGrants: ["browser network/search access"],
              recommendedGraph: {
                summary: "Request -> browser search -> read source pages -> Ambient shortlist -> user review -> final report.",
                nodes: [
                  { id: "request", type: "request", label: "Entertainment request" },
                  { id: "search-sources", type: "data_source", label: "Search entertainment sources" },
                  { id: "read-source-pages", type: "data_source", label: "Read top sources" },
                  {
                    id: "draft-shortlist",
                    type: "model_call",
                    label: "Draft shortlist",
                    modelRole: "Create a source-backed shortlist for user review.",
                    inputSummary: "Search results and page text.",
                    outputSummary: "Draft picks plus source evidence.",
                    retryPolicy: "Retry invalid structured output.",
                  },
                  { id: "review-shortlist", type: "review_gate", label: "Review shortlist" },
                  {
                    id: "final-recommendations",
                    type: "model_call",
                    label: "Final recommendations",
                    modelRole: "Apply feedback and produce final report.",
                    inputSummary: "Draft shortlist and user feedback.",
                    outputSummary: "Readable HTML/Markdown recommendation report.",
                    retryPolicy: "Retry invalid structured output.",
                  },
                  { id: "output", type: "output", label: "Rendered report" },
                ],
                edges: [
                  {
                    id: "request-search",
                    source: "request",
                    target: "search-sources",
                    type: "control_flow",
                    label: "needs current listings",
                  },
                  { id: "search-read", source: "search-sources", target: "read-source-pages", type: "data_flow", label: "top sources" },
                  { id: "read-draft", source: "read-source-pages", target: "draft-shortlist", type: "data_flow", label: "source evidence" },
                  { id: "draft-review", source: "draft-shortlist", target: "review-shortlist", type: "control_flow", label: "ask user" },
                  { id: "review-final", source: "review-shortlist", target: "final-recommendations", type: "data_flow", label: "feedback" },
                  { id: "final-output", source: "final-recommendations", target: "output", type: "data_flow", label: "report" },
                ],
              },
              recommendedManifest: {
                tools: ["browser_search", "browser_nav", "browser_content", "ambient.responses"],
                mutationPolicy: "read_only",
                maxToolCalls: 8,
                maxModelCalls: 2,
              },
              deterministicSourceStrategy:
                "Search once, read two source pages in the same browser adapter, checkpoint normalized evidence, ask Ambient for a draft shortlist, pause for user review with an artifact preview, then ask Ambient for final rendered output.",
              unresolvedQuestions: [],
            },
          },
        ]),
        budgets: { maxModelTurns: 4, maxToolCalls: 2, maxElapsedMs: 90_000 },
        onProgress: (progress) => {
          explorationProgress.push({
            status: progress.status,
            phase: progress.phase,
            message: progress.message,
            graphNodeId: progress.graphNodeId,
          });
        },
      });
      const traceCards = workflowExplorationTraceCards(store.listWorkflowExplorationTraces(thread.id));
      const completedGate = workflowExplorationGateModel({ chatTurnCount: 1, traceCount: traceCards.length });

      let compilerPrompt = "";
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Compile the deterministic browser workflow from the retained exploration trace.",
        workspaceSummary:
          "Browser exploration dogfood. Use the observed browser_search/browser_content pattern, keep browser calls bounded, and include a runtime input review artifact before the final report.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: {
          compileProgramIr: vi.fn(async (input) => {
            compilerPrompt = input.prompt;
            return browserExplorationReviewCompilerOutput(query);
          }),
        },
      });
      const artifact = dashboard.artifacts[0];
      const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
      const ambientProvider = new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      });
      const pausedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        browser,
        model,
        ambientProvider,
      });
      const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
      const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
      const [inputCard] = workflowRuntimeInputCards(pausedDetail);
      if (!inputCard) throw new Error("Expected browser shortlist runtime input card.");
      const inputComposer = workflowThreadComposerModel({
        draft: "Prioritize date-night atmosphere, include one movie and one live show, and explain why each is couples-friendly.",
        detail: pausedDetail,
      });

      const resumedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        resumeFromRunId: pausedRun.id,
        userInputs: [
          {
            requestId: inputCard.requestId,
            choiceId: "revise",
            text: "Prioritize date-night atmosphere, include one movie and one live show, and explain why each is couples-friendly.",
          },
        ],
        browser,
        model,
        ambientProvider,
      });
      const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
      const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
      const allEvents = [...pausedDetail.events, ...resumedDetail.events];
      const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
      const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
      const graphEventCards = workflowGraphEventCards(allEvents, graph, {
        modelCalls: allModelCalls,
        checkpoints: resumedDetail.checkpoints,
        limit: 10,
      });
      const graphCoverageCards = workflowGraphEventCards(allEvents, graph, {
        modelCalls: allModelCalls,
        checkpoints: resumedDetail.checkpoints,
        limit: allEvents.length,
      });
      const outputCards = workflowRunOutputCards(resumedDetail);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<
          string,
          { value?: { html?: string; markdown?: string; summary?: string; artifactPath?: string; picks?: unknown[]; sources?: unknown[] } }
        >;
      };

      await writeBrowserExplorationReviewDogfoodArtifact({
        threadId: thread.id,
        explorationTraceId: exploration.trace.id,
        recommendedGate,
        completedGate,
        traceCard: traceCards[0],
        explorationProgress,
        compilerPromptIncludesTrace: compilerPrompt.includes(exploration.trace.id),
        pausedRun: { id: pausedRun.id, status: pausedRun.status },
        inputCard: {
          requestId: inputCard.requestId,
          graphNodeId: inputCard.graphNodeId,
          contextItems: inputCard.contextItems,
        },
        inputComposer: {
          mode: inputComposer.mode,
          submitLabel: inputComposer.submitLabel,
          disabled: inputComposer.disabled,
        },
        resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
        browserCalls: {
          search: browser.search.mock.calls.length,
          navigate: browser.navigate.mock.calls.length,
          content: browser.content.mock.calls.length,
        },
        eventCounts: eventCountsByType(allEvents),
        graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
        graphEventCards: graphEventCards.map((card) => ({
          label: card.label,
          state: card.state,
          graphNodeId: card.graphNodeId,
          detail: card.detail,
          summaries: card.summaries,
        })),
        modelCalls: allModelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          graphNodeId: call.graphNodeId,
          latencyMs: call.latencyMs,
        })),
        outputCards: outputCards.map((card) => ({
          kind: card.kind,
          label: card.label,
          format: card.format,
          artifactPath: card.artifactPath,
          preview: card.preview?.slice(0, 420),
          metadata: card.metadata,
        })),
        finalOutput: state.checkpoints?.final_output?.value,
      });

      expect(recommendedGate).toMatchObject({ state: "recommended", canRun: true, canSkip: true });
      expect(completedGate).toMatchObject({ state: "completed", canCompileFromExploration: true });
      expect(traceCards[0]).toMatchObject({
        summary: expect.stringMatching(/browser-search|search result|shortlist/i),
        deterministicSourceStrategy: expect.stringMatching(/Search once|pause|review/i),
      });
      expect(compilerPrompt).toContain(exploration.trace.id);
      expect(compilerPrompt).toContain("browser_search");
      expect(pausedRun).toMatchObject({ status: "needs_input" });
      expect(inputCard).toMatchObject({ graphNodeId: "review-shortlist", allowFreeform: true });
      expect(inputCard.contextItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Source shortlist",
            kind: "artifact",
            format: "html",
            artifactPath: "reports/scottsdale-entertainment-shortlist.html",
          }),
        ]),
      );
      expect(inputComposer).toMatchObject({ mode: "run_input", disabled: false });
      expect(resumedRun).toMatchObject({ status: "succeeded" });
      expect(browser.search).toHaveBeenCalledTimes(2);
      expect(browser.navigate).toHaveBeenCalledTimes(2);
      expect(browser.content).toHaveBeenCalledTimes(3);
      expect(allModelCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ task: "dogfood.browser_source_shortlist", status: "succeeded", graphNodeId: "draft-shortlist" }),
          expect.objectContaining({
            task: "dogfood.browser_final_recommendations",
            status: "succeeded",
            graphNodeId: "final-recommendations",
          }),
        ]),
      );
      expect(graphWithRunState.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "review-shortlist", runState: "completed" }),
          expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
          expect.objectContaining({ id: "output", runState: "completed" }),
        ]),
      );
      expect(graphCoverageCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ graphNodeId: "review-shortlist" }),
          expect.objectContaining({ graphNodeId: "final-recommendations" }),
        ]),
      );
      expect(outputCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            format: "html",
            artifactPath: "reports/scottsdale-entertainment-final.html",
            preview: expect.stringMatching(/Scottsdale|movie|show|couples|date/i),
          }),
        ]),
      );
      expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|movie|show|couples|date/i);
      expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(2);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods browser user intervention pause and resume with live Ambient",
    async () => {
      const workspacePath = deps.getWorkspacePath();
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const query = "best live shows appropriate for children in Scottsdale Arizona in the next week";
      const browser = fakeScottsdaleEntertainmentBrowserWithIntervention();
      const thread = store.createWorkflowAgentThreadSummary({
        title: "Scottsdale Family Shows Browser Intervention Dogfood",
        initialRequest:
          "Find the best live shows appropriate for children playing in Scottsdale Arizona in the next week, and pause if browser verification blocks source access.",
        projectPath: workspacePath,
        traceMode: "debug",
        phase: "planned",
      });
      let compilerPrompt = "";
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Compile a browser workflow that pauses cleanly if a browser CAPTCHA or verification page blocks source access.",
        workspaceSummary:
          "Browser intervention dogfood. The workflow must checkpoint search results, pause with workflow.askUser when browser tools return BrowserUserActionState, then retry the same browser operation after the user completes the challenge.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: {
          compileProgramIr: vi.fn(async (input) => {
            compilerPrompt = input.prompt;
            return browserInterventionRecoveryCompilerOutput(query);
          }),
        },
      });
      const artifact = dashboard.artifacts[0];
      const graph = store.getWorkflowAgentThreadSummary(thread.id).graph ?? store.listWorkflowGraphSnapshots(thread.id)[0];
      const ambientProvider = new AmbientWorkflowRunProvider({
        model,
        apiKey,
        baseUrl: liveAmbientBaseUrl(),
        workflowThreadId: thread.id,
        idleTimeoutMs: 90_000,
        absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
      });

      const pausedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        browser,
        model,
        ambientProvider,
      });
      const pausedRun = latestRunForArtifact(pausedDashboard, artifact.id);
      const pausedDetail = readWorkflowRunDetail(store, pausedRun.id);
      const [inputCard] = workflowRuntimeInputCards(pausedDetail);
      if (!inputCard) {
        throw new Error(
          `Expected browser intervention runtime input card. run=${JSON.stringify({
            status: pausedRun.status,
            error: pausedRun.error,
            events: pausedDetail.events
              .map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data }))
              .slice(-12),
          })}`,
        );
      }
      const inputComposer = workflowThreadComposerModel({
        draft: "I completed the browser verification. Continue from the same page.",
        detail: pausedDetail,
      });

      const resumedDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        resumeFromRunId: pausedRun.id,
        userInputs: [
          {
            requestId: inputCard.requestId,
            choiceId: "completed",
            text: "I completed the browser verification. Continue from the same page.",
          },
        ],
        browser,
        model,
        ambientProvider,
      });
      const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
      const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
      const allEvents = [...pausedDetail.events, ...resumedDetail.events];
      const allModelCalls = [...pausedDetail.modelCalls, ...resumedDetail.modelCalls];
      const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
      const graphEventCards = workflowGraphEventCards(allEvents, graph, {
        modelCalls: allModelCalls,
        checkpoints: resumedDetail.checkpoints,
        limit: allEvents.length,
      });
      const outputCards = workflowRunOutputCards(resumedDetail);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { html?: string; sources?: unknown[]; browserIntervention?: unknown } }>;
      };

      await writeBrowserInterventionRecoveryDogfoodArtifact({
        threadId: thread.id,
        pausedRun: { id: pausedRun.id, status: pausedRun.status },
        resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
        compilerPromptIncludesBrowserInterventionRule: compilerPrompt.includes("Browser user-action rule"),
        inputCard: {
          requestId: inputCard.requestId,
          graphNodeId: inputCard.graphNodeId,
          prompt: inputCard.prompt,
          choices: inputCard.choices,
          browserIntervention: inputCard.browserIntervention,
          contextItems: inputCard.contextItems,
        },
        inputComposer: {
          mode: inputComposer.mode,
          submitLabel: inputComposer.submitLabel,
          disabled: inputComposer.disabled,
        },
        browserCalls: {
          search: browser.search.mock.calls.length,
          navigate: browser.navigate.mock.calls.map((call) => call[0]),
          content: browser.content.mock.calls.map((call) => call[0]),
        },
        eventCounts: eventCountsByType(allEvents),
        graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
        graphEventCards: graphEventCards.map((card) => ({
          label: card.label,
          state: card.state,
          graphNodeId: card.graphNodeId,
          detail: card.detail,
          summaries: card.summaries,
        })),
        modelCalls: allModelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          graphNodeId: call.graphNodeId,
          latencyMs: call.latencyMs,
        })),
        outputCards: outputCards.map((card) => ({
          kind: card.kind,
          label: card.label,
          format: card.format,
          artifactPath: card.artifactPath,
          preview: card.preview?.slice(0, 420),
          metadata: card.metadata,
        })),
        finalOutput: state.checkpoints?.final_output?.value,
      });

      expect(compilerPrompt).toContain("Browser user-action rule");
      expect(compilerPrompt).toContain("options.data.browserIntervention");
      expect(pausedRun).toMatchObject({ status: "needs_input" });
      expect(inputCard).toMatchObject({ graphNodeId: "browser-intervention", allowFreeform: true });
      expect(inputCard.browserIntervention).toEqual(
        expect.objectContaining({
          title: "Browser challenge",
          kind: "captcha",
          provider: "recaptcha",
          toolName: "browser_nav",
          browserUserActionId: "browser-action-family-shows",
          url: "https://example.test/scottsdale/family-shows",
          message: expect.stringMatching(/managed browser/i),
          preview: expect.objectContaining({
            textExcerpt: expect.stringMatching(/captcha|managed browser/i),
            screenshotArtifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
            screenshotWidth: 1200,
            screenshotHeight: 800,
          }),
        }),
      );
      expect(inputCard.choices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "completed", label: "I completed it" }),
          expect.objectContaining({ id: "skip", label: "Skip this source" }),
        ]),
      );
      expect(inputCard.contextItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Scottsdale Family Shows Calendar",
            kind: "data",
            format: "json",
            value: expect.stringMatching(/family shows|example\.test/i),
          }),
        ]),
      );
      expect(inputComposer).toMatchObject({ mode: "run_input", disabled: false, submitLabel: "Continue workflow" });
      if (resumedRun.status !== "succeeded") {
        throw new Error(
          `Expected browser intervention recovery dogfood run to succeed. run=${JSON.stringify({
            resumedRun: { id: resumedRun.id, status: resumedRun.status, error: resumedRun.error },
            eventCounts: eventCountsByType(allEvents),
            modelCalls: allModelCalls.map((call) => ({
              task: call.task,
              status: call.status,
              graphNodeId: call.graphNodeId,
              validationError: call.validationError,
              latencyMs: call.latencyMs,
            })),
          })}`,
        );
      }
      expect(resumedRun).toMatchObject({ status: "succeeded" });
      expect(browser.search).toHaveBeenCalledTimes(1);
      expect(browser.navigate.mock.calls).toEqual([
        [expect.objectContaining({ url: "https://example.test/scottsdale/family-shows", waitForUserAction: false })],
        [
          expect.objectContaining({
            url: "https://example.test/scottsdale/family-shows",
            waitForUserAction: false,
            userActionId: "browser-action-family-shows",
          }),
        ],
      ]);
      expect(browser.content).toHaveBeenCalledTimes(1);
      expect(allEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "workflow.input.required", graphNodeId: "browser-intervention" }),
          expect.objectContaining({ type: "workflow.input.received", graphNodeId: "browser-intervention" }),
        ]),
      );
      expect(allModelCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            task: "dogfood.browser_intervention_family_shows",
            status: "succeeded",
            graphNodeId: "final-recommendations",
          }),
        ]),
      );
      expect(graphWithRunState.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "search-sources", runState: "completed" }),
          expect.objectContaining({ id: "browser-intervention", runState: "completed" }),
          expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
          expect.objectContaining({ id: "output", runState: "completed" }),
        ]),
      );
      expect(graphEventCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ graphNodeId: "browser-intervention" }),
          expect.objectContaining({ graphNodeId: "final-recommendations" }),
        ]),
      );
      expect(outputCards).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            format: "html",
            artifactPath: "reports/scottsdale-family-shows.html",
            preview: expect.stringMatching(/Scottsdale|family|show|children/i),
          }),
        ]),
      );
      expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|family|show|children/i);
      expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(1);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );
}
