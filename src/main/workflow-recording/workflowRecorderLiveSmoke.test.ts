import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type, type Tool } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../../shared/ambientModels";
import type { WorkflowRecordingPlaybookAvoidPattern } from "../../shared/workflowTypes";
import { ambientWorkflowsInjectText, describeAmbientWorkflowPlaybook, injectAmbientWorkflowPlaybook, isRetryableAmbientProviderError, liveAmbientDirectHelperProfile, liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey, searchAmbientWorkflowPlaybooks } from "./workflowRecordingAmbientFacade";
import { ProjectStore } from "./workflowRecordingProjectStoreFacade";
import { callWorkflowPiText, type WorkflowPiToolProgress } from "./workflowRecordingWorkflowLiveFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const runLive = process.env.AMBIENT_WORKFLOW_RECORDER_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();
const liveScenarioRetries = Math.max(0, Math.floor(Number(process.env.AMBIENT_WORKFLOW_RECORDER_LIVE_SCENARIO_RETRIES ?? "3")));
const liveScenarioRetryBackoffMs = [5_000, 10_000, 20_000, 30_000];

interface LiveRecorderScenario {
  id: string;
  goal: string;
  userRequest: string;
  tool: Tool;
  toolCallInstruction: string;
  expectedArgs: Record<string, string>;
  toolResult: Record<string, unknown>;
  searchQuery: string;
  intent: string;
  inputs: string[];
  doNot: WorkflowRecordingPlaybookAvoidPattern[];
  validation: string[];
  outputShape: string[];
}

const LIVE_RECORDER_SCENARIOS: LiveRecorderScenario[] = [
  {
    id: "web-research-date-night",
    goal: "Live GMI web research recorder smoke for Scottsdale date-night theater.",
    userRequest: "Find live upcoming theatrical events in Scottsdale that would work for a romantic date night.",
    tool: {
      name: "browser_search",
      description: "Searches the web and returns a bounded result list for live Workflow Recorder tool-call validation.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query." }),
      }),
    },
    toolCallInstruction: "Call browser_search exactly once with query `Scottsdale romantic theater date night`.",
    expectedArgs: { query: "Scottsdale romantic theater date night" },
    toolResult: {
      resultCount: 2,
      results: [
        {
          title: "Scottsdale performing arts event listings",
          url: "https://example.test/scottsdale-performing-arts",
          note: "Smoke result only; live/current event details must be verified in a real run.",
        },
        {
          title: "Nearby theater date-night listings",
          url: "https://example.test/nearby-theater-date-night",
          note: "Smoke result only; use venue pages for final recommendations.",
        },
      ],
    },
    searchQuery: "Scottsdale date night browser_search web research",
    intent: "Find Scottsdale theatrical date-night options by searching first, then verifying venue pages before recommending.",
    inputs: ["Location: Scottsdale", "Occasion: romantic date night", "Need current event pages before final recommendations"],
    doNot: [
      {
        toolName: "workflow_program_ir_compiler",
        status: "skipped",
        reason: "Workflow Recorder replay stays in the normal chat/tool loop; do not compile WorkflowProgramIR for this path.",
      },
    ],
    validation: ["A live Pi/GMI call selected the browser_search tool and the saved playbook remains searchable and injectable."],
    outputShape: ["Ranked date-night shortlist with venue, date, booking link, source caveat, and fit rationale."],
  },
  {
    id: "browser-navigation-proof",
    goal: "Live GMI browser navigation recorder smoke for a tiny preview proof.",
    userRequest: "Open the local animated hello-world preview and confirm the visible title before summarizing the proof.",
    tool: {
      name: "browser_open",
      description: "Opens a bounded browser URL and returns a small preview for live Workflow Recorder validation.",
      parameters: Type.Object({
        url: Type.String({ description: "URL to open." }),
      }),
    },
    toolCallInstruction: "Call browser_open exactly once with url `file:///tmp/ambient-recorder-hello/index.html`.",
    expectedArgs: { url: "file:///tmp/ambient-recorder-hello/index.html" },
    toolResult: {
      title: "Animated Hello Workflow",
      visibleText: "Hello Workflow",
      animationObserved: true,
    },
    searchQuery: "animated hello browser_open preview proof",
    intent: "Verify a tiny browser preview by opening the target URL and recording visible proof before claiming success.",
    inputs: ["Preview URL", "Expected visible title", "Animation proof requirement"],
    doNot: [
      {
        toolName: "browser_snapshot",
        status: "failed",
        reason: "Do not accept a blank or title-less browser proof as a successful preview.",
      },
    ],
    validation: ["Browser-open proof includes the visible title and an animation-observed signal."],
    outputShape: ["Preview URL, visible text, animation proof, and caveats."],
  },
  {
    id: "gmail-summary-metadata",
    goal: "Live GMI Gmail summary recorder smoke with metadata-safe examples.",
    userRequest: "Review recent Gmail threads for action items while keeping private message bodies out of the workflow record.",
    tool: {
      name: "gmail_search",
      description: "Searches Gmail metadata and returns bounded thread summaries for live Workflow Recorder validation.",
      parameters: Type.Object({
        q: Type.String({ description: "Gmail query string." }),
      }),
    },
    toolCallInstruction: "Call gmail_search exactly once with q `newer_than:7d label:inbox action items`.",
    expectedArgs: { q: "newer_than:7d label:inbox action items" },
    toolResult: {
      threads: [
        {
          threadId: "redacted-thread-1",
          subject: "Dinner follow-up",
          safeAction: "Reply with available dates.",
        },
      ],
      bodyIncluded: false,
    },
    searchQuery: "gmail_search action items metadata safe summary",
    intent: "Find Gmail action items through metadata-safe search, then summarize follow-ups without storing private bodies.",
    inputs: ["Recent inbox scope", "Action-item extraction", "No raw private body text in workflow files"],
    doNot: [
      {
        toolName: "file_write",
        status: "permission_blocked",
        reason: "Do not write raw email bodies into workflow markdown, sidecars, or transcript artifacts.",
      },
    ],
    validation: ["Saved playbook keeps tool examples useful while avoiding raw Gmail body text."],
    outputShape: ["Action queue grouped by needs reply, waiting, FYI, and source caveat."],
  },
  {
    id: "local-file-classification",
    goal: "Live GMI local file classification recorder smoke.",
    userRequest: "Classify a tiny local folder by file type and write a concise evidence report.",
    tool: {
      name: "file_list",
      description: "Lists bounded workspace-local files for live Workflow Recorder validation.",
      parameters: Type.Object({
        path: Type.String({ description: "Workspace-local folder path." }),
      }),
    },
    toolCallInstruction: "Call file_list exactly once with path `./demo-files`.",
    expectedArgs: { path: "./demo-files" },
    toolResult: {
      files: [
        { name: "index.html", size: 320 },
        { name: "notes.md", size: 180 },
        { name: "logo.png", size: 2048 },
      ],
      counts: { html: 1, markdown: 1, image: 1 },
    },
    searchQuery: "file_list local folder classification report",
    intent: "Classify a bounded local folder using metadata first, then write a concise report with counts and evidence.",
    inputs: ["Workspace-local folder", "Counts by extension", "Short report artifact"],
    doNot: [
      {
        toolName: "file_read",
        status: "skipped",
        reason: "Do not read large binary contents when filename and metadata are enough for classification.",
      },
    ],
    validation: ["Report counts match listed files and no large binary content is copied into the workflow."],
    outputShape: ["Markdown report path plus counts by category and evidence note."],
  },
  {
    id: "ambient-cli-preflight",
    goal: "Live GMI Ambient CLI package preflight recorder smoke.",
    userRequest: "Find the right installed Ambient CLI package for a bounded markdown transform before running anything.",
    tool: {
      name: "ambient_cli_search",
      description: "Searches installed Ambient CLI package descriptors before any command execution.",
      parameters: Type.Object({
        query: Type.String({ description: "Capability search query." }),
      }),
    },
    toolCallInstruction: "Call ambient_cli_search exactly once with query `markdown transform summarize`.",
    expectedArgs: { query: "markdown transform summarize" },
    toolResult: {
      matches: [
        {
          packageId: "markdown-tools",
          commandName: "summarize",
          nextStep: "Call ambient_cli_describe before execution.",
        },
      ],
    },
    searchQuery: "ambient_cli_search markdown transform describe before use",
    intent: "Search installed Ambient CLI packages, describe the exact command shape, and only then consider execution.",
    inputs: ["Installed package catalog", "Bounded markdown transform", "Describe-before-use requirement"],
    doNot: [
      {
        toolName: "ambient_cli",
        status: "failed",
        reason: "Do not execute guessed package commands without exact package id, command name, and schema.",
      },
    ],
    validation: ["Final guidance names the package candidate and preserves the describe-before-use boundary."],
    outputShape: ["Package recommendation, exact preflight command shape, and safety note."],
  },
];

describeNative("workflow recorder live GMI smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-recorder-live-smoke-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  liveIt(
    "records and injects a five-scenario live Pi tool-call matrix through the recorder path",
    async () => {
      const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Workflow Recorder GMI smoke" });
      const savedIds = new Set<string>();
      const matrixProbe = await runLiveMatrixProbeWithRetries(apiKey);

      expect(matrixProbe.toolCalls).toEqual(["workflow_recorder_matrix_probe"]);
      expect(matrixProbe.toolProgress.some((event) => event.toolName === "workflow_recorder_matrix_probe" && event.status === "done")).toBe(true);
      expect(normalizeLiveResponse(parseJsonObject(matrixProbe.text).tool)).toBe("workflowrecordermatrixprobe");
      for (const scenario of LIVE_RECORDER_SCENARIOS) {
        expect(matrixProbe.acceptedScenarioIds).toContain(scenario.id);
      }

      for (const scenario of LIVE_RECORDER_SCENARIOS) {
        const inputPreview = JSON.stringify(scenario.expectedArgs);
        const resultPreview = JSON.stringify({
          ...scenario.toolResult,
          liveMatrixProbe: {
            tool: "workflow_recorder_matrix_probe",
            scenarioId: scenario.id,
            acceptedScenarioCount: matrixProbe.acceptedScenarioIds.length,
          },
        });

        const thread = store.createWorkflowRecordingThread({
          goal: scenario.goal,
          workspacePath,
        });
        store.addMessage({
          threadId: thread.id,
          role: "user",
          content: scenario.userRequest,
        });
        store.addMessage({
          threadId: thread.id,
          role: "tool",
          content: [`${scenario.tool.name} completed`, "", "Input", inputPreview, "", "Result", resultPreview].join("\n"),
          metadata: {
            toolName: scenario.tool.name,
            toolCallId: `${thread.id}-live-${scenario.id}`,
            status: "done",
          },
        });
        store.addMessage({
          threadId: thread.id,
          role: "assistant",
          content: `Live Pi/GMI matrix probe covered ${scenario.id}: ${matrixProbe.text.trim()}`,
          metadata: { status: "done" },
        });

        const stopped = store.stopWorkflowRecording(thread.id);
        expect(stopped.capture).toMatchObject({
          successfulToolResultCount: 1,
          failedToolResultCount: 0,
        });

        store.updateWorkflowRecordingReviewDraft(thread.id, {
          intent: scenario.intent,
          inputs: scenario.inputs,
          successfulExamples: [
            {
              toolName: scenario.tool.name,
              inputPreview,
              resultPreview,
            },
          ],
          doNot: scenario.doNot,
          validation: scenario.validation,
          outputShape: scenario.outputShape,
        });
        const confirmed = store.confirmWorkflowRecordingReview(thread.id);
        const saved = confirmed.review?.savedPlaybook;
        expect(saved).toMatchObject({ enabled: true, version: 1 });
        expect(savedIds.has(saved!.id)).toBe(false);
        savedIds.add(saved!.id);

        const search = searchAmbientWorkflowPlaybooks(store, {
          query: scenario.searchQuery,
          limit: 3,
        });
        expect(search.results[0]).toMatchObject({ id: saved!.id, version: 1 });

        const described = describeAmbientWorkflowPlaybook(store, {
          id: saved!.id,
          includeMarkdown: true,
          maxMarkdownChars: 900,
        });
        expect(described.playbook?.successfulExamples[0]?.toolName).toBe(scenario.tool.name);

        const injected = injectAmbientWorkflowPlaybook(store, { id: saved!.id, version: 1, maxMarkdownChars: 900 });
        const injectedText = ambientWorkflowsInjectText(injected);
        expect(injectedText).toContain("Injected Workflow Playbook");
        expect(injectedText).toContain(scenario.tool.name);
        expect(injectedText).toContain(scenario.doNot[0].reason);
      }

      expect(savedIds.size).toBe(LIVE_RECORDER_SCENARIOS.length);
    },
    Math.max(liveProfile.testTimeoutMs, LIVE_RECORDER_SCENARIOS.length * 60_000),
  );
});

async function runLiveMatrixProbeWithRetries(
  apiKey: string,
): Promise<Awaited<ReturnType<typeof runLiveMatrixProbe>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= liveScenarioRetries; attempt += 1) {
    try {
      return await runLiveMatrixProbe(apiKey);
    } catch (error) {
      lastError = error;
      if (!isRetryableAmbientProviderError(error) || attempt >= liveScenarioRetries) break;
      await wait(liveScenarioRetryBackoffMs[Math.min(attempt, liveScenarioRetryBackoffMs.length - 1)] ?? 30_000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runLiveMatrixProbe(
  apiKey: string,
): Promise<{
  text: string;
  toolCalls: string[];
  toolProgress: WorkflowPiToolProgress[];
  acceptedScenarioIds: string[];
}> {
  const toolCalls: string[] = [];
  const toolProgress: WorkflowPiToolProgress[] = [];
  let acceptedScenarioIds = LIVE_RECORDER_SCENARIOS.map((scenario) => scenario.id);
  const scenarioIds = LIVE_RECORDER_SCENARIOS.map((scenario) => scenario.id);

  const text = await callWorkflowPiText({
    apiKey,
    baseUrl: liveAmbientProviderBaseUrl(),
    model: liveAmbientProviderModel({
      preferredModelEnvNames: ["AMBIENT_WORKFLOW_RECORDER_MODEL", "AMBIENT_LIVE_MODEL"],
      fallbackModel: AMBIENT_DEFAULT_MODEL,
    }),
    prompt: [
      "Call workflow_recorder_matrix_probe exactly once with every scenario id listed below.",
      `Scenario ids: ${scenarioIds.join(", ")}`,
      "After the tool result, return JSON only with this exact shape:",
      JSON.stringify({ tool: "workflow_recorder_matrix_probe", scenarioCount: scenarioIds.length }),
    ].join("\n"),
    responseFormat: { type: "json_object" },
    reasoning: false,
    maxTokens: 220,
    idleTimeoutMs: liveProfile.streamIdleTimeoutMs,
    retryPolicy: liveProfile.retryPolicy,
    tools: [
      {
        name: "workflow_recorder_matrix_probe",
        description: "Confirms the live model understood the Workflow Recorder smoke scenario matrix before deterministic recorder fixtures run.",
        parameters: Type.Object({
          scenarioIds: Type.Array(Type.String({ description: "Workflow Recorder live smoke scenario id." }), {
            description: "All scenario ids to cover in this live smoke.",
          }),
        }),
      },
    ],
    initialToolChoice: { type: "function", function: { name: "workflow_recorder_matrix_probe" } },
    maxToolRounds: 1,
    executeTool: async (toolCall, args) => {
      toolCalls.push(toolCall.name);
      const requestedIds = Array.isArray(objectValue(args).scenarioIds)
        ? (objectValue(args).scenarioIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      acceptedScenarioIds = requestedIds.length ? requestedIds : scenarioIds;
      const resultPreview = JSON.stringify({
        acceptedScenarioIds,
        fixtureMode: "bounded tool-shaped recorder scenarios",
        note: "The live provider call validates instruction following once; each named scenario then exercises recorder persistence and injection.",
      });
      return resultPreview;
    },
    onToolProgress: (event) => toolProgress.push(event),
  });

  return { text, toolCalls, toolProgress, acceptedScenarioIds };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonObject(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  try {
    return objectValue(JSON.parse(trimmed));
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? objectValue(JSON.parse(match[0])) : {};
  }
}

function normalizeLiveResponse(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").toLowerCase() : "";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}
