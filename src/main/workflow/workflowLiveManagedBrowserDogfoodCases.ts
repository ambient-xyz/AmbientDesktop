/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { runWorkflowArtifact } from "./workflowRunService";
import {
  createManagedBrowserChallengeServer,
  eventCountsByType,
  externalManagedBrowserArxivCompilerOutput,
  latestRunForArtifact,
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveWorkflowModel,
  managedBrowserInterventionCompilerOutput,
  recordingWorkflowBrowser,
  sleep,
  writeExternalManagedBrowserDogfoodArtifact,
  writeManagedBrowserInterventionDogfoodArtifact,
} from "./workflowDogfoodFixtures";

interface WorkflowLiveManagedBrowserDogfoodDeps {
  BrowserService: new (...args: any[]) => any;
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  workflowGraphEventCards: (...args: any[]) => any[];
  workflowGraphWithRunEvents: (...args: any[]) => { nodes: any[] };
  workflowRuntimeInputCards: (...args: any[]) => any[];
  workflowRunOutputCards: (...args: any[]) => any[];
}

const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));

export function registerWorkflowLiveManagedBrowserDogfoodTests(deps: WorkflowLiveManagedBrowserDogfoodDeps): void {
  const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as ProjectStore, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });
  const { BrowserService, workflowGraphEventCards, workflowGraphWithRunEvents, workflowRuntimeInputCards, workflowRunOutputCards } = deps;

  itLive(
    "dogfoods real managed-browser intervention and reveal with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const challenge = await createManagedBrowserChallengeServer();
      const revealInputs: unknown[] = [];
      const browserService = new BrowserService(() => store.getWorkspace(), undefined, {
        revealManagedChromeWindow: async (input: unknown) => {
          revealInputs.push(input);
          return {
            cdpActivated: true,
            foregroundAttempted: true,
            foregroundSucceeded: true,
            method: "dogfood-stub",
          };
        },
      });
      const { browser, calls } = recordingWorkflowBrowser(browserService);
      try {
        const thread = store.createWorkflowAgentThreadSummary({
          title: "Real Managed Browser Intervention Dogfood",
          initialRequest:
            "Find live shows appropriate for children in Scottsdale next week, using the managed browser and pausing if source access asks for human verification.",
          projectPath: workspacePath,
          traceMode: "debug",
          phase: "planned",
        });
        let compilerPrompt = "";
        const dashboard = await compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest:
            "Compile a workflow that opens a current-looking web source in the real managed browser, pauses with a typed browser-intervention card if verification appears, then resumes in the same browser session and produces rendered output.",
          workspaceSummary:
            "Real managed-browser dogfood. The source URL is a deterministic local web page that first shows a human-verification interstitial and then unlocks into Scottsdale family-show content. Browser calls must use an isolated profile and must not create extra tabs.",
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          stateRoot: store.getWorkspace().statePath,
          model,
          provider: {
            compileProgramIr: vi.fn(async (input) => {
              compilerPrompt = input.prompt;
              return managedBrowserInterventionCompilerOutput(challenge.url);
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
            `Expected real managed-browser intervention card. run=${JSON.stringify({
              status: pausedRun.status,
              error: pausedRun.error,
              events: pausedDetail.events
                .map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data }))
                .slice(-12),
            })}`,
          );
        }
        const revealResult = await browserService.revealActiveBrowser({
          userActionId: inputCard.browserIntervention?.browserUserActionId,
          targetId: inputCard.browserIntervention?.targetId,
        });
        await sleep(2_750);

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
              text: "I completed the browser verification in the managed browser.",
            },
          ],
          browser,
          model,
          ambientProvider,
        });
        const resumedRun = latestRunForArtifact(resumedDashboard, artifact.id);
        const resumedDetail = readWorkflowRunDetail(store, resumedRun.id);
        if (resumedRun.status !== "succeeded") {
          throw new Error(
            `Expected resumed real managed-browser run to succeed. run=${JSON.stringify({
              status: resumedRun.status,
              error: resumedRun.error,
              events: resumedDetail.events
                .map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data }))
                .slice(-18),
            })}`,
          );
        }
        const finalBrowserState = await browserService.getState();
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
          checkpoints?: Record<string, { value?: { html?: string; sources?: unknown[] } }>;
        };

        await writeManagedBrowserInterventionDogfoodArtifact({
          threadId: thread.id,
          sourceUrl: challenge.url,
          pausedRun: { id: pausedRun.id, status: pausedRun.status, error: pausedRun.error },
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
          revealResult,
          revealInputs,
          finalBrowserState: {
            running: finalBrowserState.running,
            runtime: finalBrowserState.runtime,
            profileMode: finalBrowserState.profileMode,
            userAction: finalBrowserState.userAction,
            activeTab: finalBrowserState.activeTab,
          },
          browserCalls: {
            search: calls.search,
            navigate: calls.navigate,
            content: calls.content,
            screenshot: calls.screenshot,
          },
          serverHits: challenge.hits,
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
        expect(pausedRun).toMatchObject({ status: "needs_input" });
        expect(inputCard).toMatchObject({ graphNodeId: "browser-intervention", allowFreeform: true });
        expect(inputCard.browserIntervention).toEqual(
          expect.objectContaining({
            title: "Managed browser verification",
            toolName: "browser_nav",
            runtime: "chrome",
            profileMode: "isolated",
            browserUserActionId: expect.any(String),
            targetId: expect.any(String),
            url: challenge.url,
            message: expect.stringMatching(/browser|verification|human/i),
            preview: expect.objectContaining({
              textExcerpt: expect.stringMatching(/human|verification/i),
              screenshotArtifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
              screenshotWidth: expect.any(Number),
              screenshotHeight: expect.any(Number),
            }),
          }),
        );
        expect(["captcha", "bot-check"]).toContain(inputCard.browserIntervention?.kind);
        expect(inputCard.choices).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "completed", label: "I completed it" }),
            expect.objectContaining({ id: "skip", label: "Skip source" }),
          ]),
        );
        expect(inputCard.contextItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: "Family shows challenge source",
              kind: "data",
              format: "json",
              value: expect.stringMatching(/human-verification|Scottsdale|managed browser/i),
            }),
          ]),
        );
        expect(revealResult).toMatchObject({ runtime: "chrome", status: "revealed" });
        expect(revealInputs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              targetId: inputCard.browserIntervention?.targetId,
              profileMode: "isolated",
            }),
          ]),
        );
        expect(resumedRun).toMatchObject({ status: "succeeded" });
        expect(finalBrowserState.userAction?.active).not.toBe(true);
        expect(calls.search).toHaveLength(0);
        expect(calls.navigate).toEqual([
          expect.objectContaining({ url: challenge.url, waitForUserAction: false, profileMode: "isolated" }),
          expect.objectContaining({
            url: challenge.url,
            waitForUserAction: false,
            profileMode: "isolated",
            userActionId: inputCard.browserIntervention?.browserUserActionId,
          }),
        ]);
        expect(calls.navigate.every((input) => !(input as { newTab?: boolean }).newTab)).toBe(true);
        expect(calls.content).toEqual([expect.objectContaining({ url: challenge.url, waitForUserAction: false, profileMode: "isolated" })]);
        expect(calls.screenshot).toEqual([expect.objectContaining({ profileMode: "isolated" })]);
        expect(challenge.hits.shows).toBeGreaterThanOrEqual(2);
        expect(allEvents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "workflow.input.required", graphNodeId: "browser-intervention" }),
            expect.objectContaining({ type: "workflow.input.received", graphNodeId: "browser-intervention" }),
            expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "final-recommendations" }),
            expect.objectContaining({ type: "workflow.output.ready", graphNodeId: "output" }),
          ]),
        );
        expect(allModelCalls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              task: "dogfood.real_managed_browser_family_shows",
              status: "succeeded",
              graphNodeId: "final-recommendations",
            }),
          ]),
        );
        expect(graphWithRunState.nodes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "browser-intervention", runState: "completed" }),
            expect.objectContaining({ id: "read-source", runState: "completed" }),
            expect.objectContaining({ id: "final-recommendations", runState: "completed" }),
            expect.objectContaining({ id: "output", runState: "completed" }),
          ]),
        );
        expect(graphEventCards).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ graphNodeId: "browser-intervention" }),
            expect.objectContaining({ graphNodeId: "read-source" }),
            expect.objectContaining({ graphNodeId: "final-recommendations" }),
          ]),
        );
        expect(outputCards).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              format: "html",
              artifactPath: "reports/managed-browser-family-shows.html",
              preview: expect.stringMatching(/Scottsdale|family|show|children/i),
            }),
          ]),
        );
        expect(state.checkpoints?.final_output?.value?.html).toMatch(/Scottsdale|family|show|children/i);
        expect(state.checkpoints?.sourceEvidence?.value?.sources).toHaveLength(1);
      } finally {
        await browserService.stop().catch(() => undefined);
        await challenge.close();
      }
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods an external-site managed-browser workflow with live Ambient",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const sourceUrl =
        process.env.AMBIENT_WORKFLOW_EXTERNAL_BROWSER_URL ??
        "https://arxiv.org/search/?query=placebo+effect&searchtype=all&abstracts=show&order=-announced_date_first&size=25";
      const query = "Find recent papers on the placebo effect from arxiv and create summaries of them";
      const revealInputs: unknown[] = [];
      const browserService = new BrowserService(() => store.getWorkspace(), undefined, {
        revealManagedChromeWindow: async (input: unknown) => {
          revealInputs.push(input);
          return {
            cdpActivated: true,
            foregroundAttempted: true,
            foregroundSucceeded: true,
            method: "external-dogfood-stub",
          };
        },
      });
      const { browser, calls } = recordingWorkflowBrowser(browserService);
      try {
        const thread = store.createWorkflowAgentThreadSummary({
          title: "External Managed Browser Arxiv Dogfood",
          initialRequest: query,
          projectPath: workspacePath,
          traceMode: "debug",
          phase: "planned",
        });
        let compilerPrompt = "";
        const dashboard = await compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest:
            "Compile a read-only workflow that opens an external arxiv search page in the managed browser, captures bounded page evidence and a screenshot, handles browser user-action pauses if they appear, then asks Ambient for a rendered summary report.",
          workspaceSummary:
            "External-site managed-browser dogfood. The workflow should use the real isolated managed browser, avoid opening extra tabs, keep page text bounded, and produce a readable HTML report rather than raw JSON.",
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          stateRoot: store.getWorkspace().statePath,
          model,
          provider: {
            compileProgramIr: vi.fn(async (input) => {
              compilerPrompt = input.prompt;
              return externalManagedBrowserArxivCompilerOutput({ query, sourceUrl });
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

        const firstDashboard = await runWorkflowArtifact({
          store,
          artifactId: artifact.id,
          workspacePath,
          permissionMode: "full-access",
          browser,
          model,
          ambientProvider,
        });
        const firstRun = latestRunForArtifact(firstDashboard, artifact.id);
        const firstDetail = readWorkflowRunDetail(store, firstRun.id);
        const [inputCard] = workflowRuntimeInputCards(firstDetail);
        let finalRun = firstRun;
        let finalDetail = firstDetail;
        let interventionResolution: unknown;
        if (firstRun.status === "needs_input" && inputCard?.browserIntervention) {
          const revealResult = await browserService.revealActiveBrowser({
            userActionId: inputCard.browserIntervention.browserUserActionId,
            targetId: inputCard.browserIntervention.targetId,
          });
          const resumedDashboard = await runWorkflowArtifact({
            store,
            artifactId: artifact.id,
            workspacePath,
            permissionMode: "full-access",
            resumeFromRunId: firstRun.id,
            userInputs: [
              {
                requestId: inputCard.requestId,
                choiceId: "skip",
                text: "Skip this external source after recording the browser challenge evidence for dogfood.",
              },
            ],
            browser,
            model,
            ambientProvider,
          });
          finalRun = latestRunForArtifact(resumedDashboard, artifact.id);
          finalDetail = readWorkflowRunDetail(store, finalRun.id);
          interventionResolution = {
            pausedRun: { id: firstRun.id, status: firstRun.status, error: firstRun.error },
            revealResult,
            inputCard: {
              requestId: inputCard.requestId,
              graphNodeId: inputCard.graphNodeId,
              prompt: inputCard.prompt,
              browserIntervention: inputCard.browserIntervention,
              contextItems: inputCard.contextItems,
            },
          };
        }
        if (finalRun.status !== "succeeded") {
          throw new Error(
            `Expected external managed-browser dogfood run to succeed. run=${JSON.stringify({
              firstRun: { status: firstRun.status, error: firstRun.error },
              finalRun: { status: finalRun.status, error: finalRun.error },
              events: finalDetail.events
                .map((event) => ({ type: event.type, message: event.message, graphNodeId: event.graphNodeId, data: event.data }))
                .slice(-18),
            })}`,
          );
        }

        const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
          checkpoints?: Record<string, { value?: { html?: string; summary?: string; sources?: unknown[]; sourceEvidence?: unknown } }>;
        };
        const allEvents = firstRun.id === finalRun.id ? finalDetail.events : [...firstDetail.events, ...finalDetail.events];
        const allModelCalls = firstRun.id === finalRun.id ? finalDetail.modelCalls : [...firstDetail.modelCalls, ...finalDetail.modelCalls];
        const graphWithRunState = workflowGraphWithRunEvents(graph, allEvents);
        const outputCards = workflowRunOutputCards(finalDetail);
        const finalBrowserState = await browserService.getState();
        const sourceEvidence = state.checkpoints?.sourceEvidence?.value as
          | {
              sources?: Array<{
                skipped?: boolean;
                textChars?: number;
                screenshot?: { artifactPath?: string; width?: number; height?: number };
                browserIntervention?: unknown;
              }>;
            }
          | undefined;
        const sourceRecord = sourceEvidence?.sources?.[0];

        await writeExternalManagedBrowserDogfoodArtifact({
          threadId: thread.id,
          sourceUrl,
          query,
          compilerPromptIncludesBrowserInterventionRule: compilerPrompt.includes("Browser user-action rule"),
          run: { id: finalRun.id, status: finalRun.status, error: finalRun.error },
          interventionResolution,
          eventCounts: eventCountsByType(allEvents),
          browserCalls: {
            search: calls.search,
            navigate: calls.navigate,
            content: calls.content,
            screenshot: calls.screenshot,
          },
          finalBrowserState: {
            running: finalBrowserState.running,
            runtime: finalBrowserState.runtime,
            profileMode: finalBrowserState.profileMode,
            userAction: finalBrowserState.userAction,
            activeTab: finalBrowserState.activeTab,
          },
          sourceEvidence: {
            skipped: sourceRecord?.skipped,
            textChars: sourceRecord?.textChars,
            screenshot: sourceRecord?.screenshot,
            browserIntervention: sourceRecord?.browserIntervention,
          },
          graphStates: graphWithRunState.nodes.map((node) => ({ id: node.id, type: node.type, runState: node.runState })),
          modelCalls: allModelCalls.map((call) => ({
            task: call.task,
            status: call.status,
            graphNodeId: call.graphNodeId,
            latencyMs: call.latencyMs,
            outputChars: call.output === undefined ? undefined : JSON.stringify(call.output).length,
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
        expect(finalRun).toMatchObject({ status: "succeeded" });
        expect(calls.search).toHaveLength(0);
        expect(calls.navigate).toEqual(
          expect.arrayContaining([expect.objectContaining({ url: sourceUrl, waitForUserAction: false, profileMode: "isolated" })]),
        );
        expect(calls.navigate.every((input) => !(input as { newTab?: boolean }).newTab)).toBe(true);
        expect(calls.content.length).toBeGreaterThanOrEqual(interventionResolution ? 0 : 1);
        expect(calls.screenshot.length).toBeLessThanOrEqual(1);
        expect(finalBrowserState.profileMode).toBe("isolated");
        expect(allModelCalls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ task: "dogfood.external_managed_browser_arxiv", status: "succeeded", graphNodeId: "final-report" }),
          ]),
        );
        expect(allEvents).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: "ambient.call.progress", graphNodeId: "final-report" })]),
        );
        expect(graphWithRunState.nodes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "open-source", runState: "completed" }),
            expect.objectContaining({ id: "final-report", runState: "completed" }),
            expect.objectContaining({ id: "output", runState: "completed" }),
          ]),
        );
        expect(outputCards).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              format: "html",
              artifactPath: "reports/external-arxiv-placebo-summary.html",
              preview: expect.stringMatching(/arxiv|placebo|browser|source|blocked/i),
            }),
          ]),
        );
        expect(state.checkpoints?.final_output?.value?.html).toMatch(/arxiv|placebo|browser|source|blocked/i);
        if (interventionResolution) {
          expect(outputCards).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                label: "Browser challenge screenshot",
                format: "image",
                artifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
                metadata: expect.arrayContaining(["browser challenge"]),
              }),
            ]),
          );
          expect(interventionResolution).toEqual(
            expect.objectContaining({
              inputCard: expect.objectContaining({
                browserIntervention: expect.objectContaining({
                  preview: expect.objectContaining({
                    textExcerpt: expect.any(String),
                    screenshotArtifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
                  }),
                }),
              }),
            }),
          );
        } else {
          expect(sourceRecord?.skipped).not.toBe(true);
          expect(sourceRecord?.textChars ?? 0).toBeGreaterThan(200);
          expect(sourceRecord?.screenshot?.artifactPath).toMatch(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/);
          expect(outputCards).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                label: "Source evidence screenshot",
                format: "image",
                artifactPath: expect.stringMatching(/\.ambient-codex\/browser\/screenshots\/browser-.*\.png/),
              }),
            ]),
          );
        }
      } finally {
        await browserService.stop().catch(() => undefined);
      }
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );
}
