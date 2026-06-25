/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

import { firstPartyDesktopToolDescriptors } from "./workflowDesktopToolFacade";
import { ProjectStore } from "./workflowProjectStoreFacade";
import { AmbientWorkflowRunProvider } from "./workflowAmbientProvider";
import { AmbientWorkflowCompilerProvider, compileWorkflowArtifact } from "./workflowWorkflowCompilerServiceFacade";
import { readWorkflowRunDetail } from "./workflowDashboard";
import { runWorkflowArtifact } from "./workflowRunService";
import {
  browserResearchCompilerOutput,
  createLocalDownloadsFixture,
  createLocalDownloadsImageFixture,
  eventCountsByType,
  fakeMiniCpmVision,
  fakeResearchBrowser,
  latestRunForArtifact,
  liveAmbientApiKey,
  liveAmbientBaseUrl,
  liveWorkflowModel,
  localFileReportCompilerOutput,
  retentionTraceCompilerOutput,
  writeBrowserResearchRunDogfoodArtifact,
  writeLocalDirectoryRunDogfoodArtifact,
  writeLocalFileRunDogfoodArtifact,
  writeLocalImageRunDogfoodArtifact,
  writeRetentionTraceDogfoodArtifact,
} from "./workflowDogfoodFixtures";

interface WorkflowLiveRuntimeDogfoodDeps {
  getStore: () => ProjectStore;
  getWorkspacePath: () => string;
  workflowTraceRetentionReviewModel: (input: {
    traceMode: "production" | "debug";
    events: ReturnType<typeof readWorkflowRunDetail>["events"];
    modelCalls: ReturnType<typeof readWorkflowRunDetail>["modelCalls"];
  }) => {
    value: string;
    tone: string;
    compactedPayloadCount: number;
    retainedEvidenceCount: number;
  };
}

const LIVE_WORKFLOW_COMPILE_TIMEOUT_MS = Math.max(240_000, Number(process.env.AMBIENT_WORKFLOW_LIVE_TIMEOUT_MS ?? "480000"));

export function registerWorkflowLiveRuntimeDogfoodTests(deps: WorkflowLiveRuntimeDogfoodDeps): void {
  const itLive = process.env.AMBIENT_WORKFLOW_LIVE === "1" ? it : it.skip;
  const store = new Proxy({} as ProjectStore, {
    get(_target, property) {
      const current = deps.getStore() as any;
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    },
  });

  itLive(
    "dogfoods debug versus production trace retention with live Ambient runs",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const productionThread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Production retention trace dogfood.",
        traceMode: "production",
      });
      const debugThread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Debug retention trace dogfood.",
        traceMode: "debug",
      });
      const productionDashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: productionThread.id,
        userRequest: "Create a tiny production trace workflow that calls Ambient once and checkpoints the result.",
        workspaceSummary: "Live retention dogfood production trace.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: { compileProgramIr: vi.fn(async () => retentionTraceCompilerOutput("production")) },
      });
      const debugDashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: debugThread.id,
        userRequest: "Create a tiny debug trace workflow that calls Ambient once and checkpoints the result.",
        workspaceSummary: "Live retention dogfood debug trace.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: { compileProgramIr: vi.fn(async () => retentionTraceCompilerOutput("debug")) },
      });
      const productionArtifact = productionDashboard.artifacts[0];
      const debugArtifact = debugDashboard.artifacts[0];
      const productionRunDashboard = await runWorkflowArtifact({
        store,
        artifactId: productionArtifact.id,
        workspacePath,
        permissionMode: "full-access",
        model,
        baseUrl: liveAmbientBaseUrl(),
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: productionThread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const debugRunDashboard = await runWorkflowArtifact({
        store,
        artifactId: debugArtifact.id,
        workspacePath,
        permissionMode: "full-access",
        model,
        baseUrl: liveAmbientBaseUrl(),
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: debugThread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const productionRun = latestRunForArtifact(productionRunDashboard, productionArtifact.id);
      const debugRun = latestRunForArtifact(debugRunDashboard, debugArtifact.id);
      const productionDetail = readWorkflowRunDetail(store, productionRun.id);
      const debugDetail = readWorkflowRunDetail(store, debugRun.id);
      const productionRetention = deps.workflowTraceRetentionReviewModel({
        traceMode: "production",
        events: productionDetail.events,
        modelCalls: productionDetail.modelCalls,
      });
      const debugRetention = deps.workflowTraceRetentionReviewModel({
        traceMode: "debug",
        events: debugDetail.events,
        modelCalls: debugDetail.modelCalls,
      });

      await writeRetentionTraceDogfoodArtifact({
        production: {
          run: { id: productionRun.id, status: productionRun.status },
          retention: productionRetention,
          events: productionDetail.events.length,
          modelCalls: productionDetail.modelCalls.length,
        },
        debug: {
          run: { id: debugRun.id, status: debugRun.status },
          retention: debugRetention,
          events: debugDetail.events.length,
          modelCalls: debugDetail.modelCalls.length,
        },
      });

      expect(productionRun).toMatchObject({ status: "succeeded" });
      expect(debugRun).toMatchObject({ status: "succeeded" });
      expect(productionRetention).toMatchObject({
        value: "Production trace, Essentials retained",
        tone: "ready",
        compactedPayloadCount: 0,
      });
      expect(debugRetention).toMatchObject({
        value: "Debug trace, 30-day debug cleanup",
        tone: "review",
        compactedPayloadCount: 0,
      });
      expect(productionRetention.retainedEvidenceCount).toBeGreaterThan(0);
      expect(debugRetention.retainedEvidenceCount).toBeGreaterThan(0);
      expect(productionDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
      expect(debugDetail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods a local-file report workflow with a live Ambient runtime call",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      await mkdir(join(workspacePath, "local-report"), { recursive: true });
      await writeFile(
        join(workspacePath, "local-report", "events.md"),
        ["# Events", "- Library story time on Tuesday", "- Park picnic on Friday", "- Museum craft table on Sunday"].join("\n"),
        "utf8",
      );
      await writeFile(
        join(workspacePath, "local-report", "notes.txt"),
        ["Constraints:", "Prefer indoor backup options.", "Keep travel under 20 minutes.", "Flag anything needing registration."].join(
          "\n",
        ),
        "utf8",
      );
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Read local event notes and write a concise planning report.",
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest: "Create a read-only local-file workflow that reads event notes and asks Ambient to summarize them.",
        workspaceSummary: "Local-file live dogfood with two small text files in local-report/.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: {
          compileProgramIr: vi.fn(async () => localFileReportCompilerOutput(["local-report/events.md", "local-report/notes.txt"])),
        },
      });
      const artifact = dashboard.artifacts[0];
      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        model,
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: thread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { report?: { report?: string; files?: string[] } } }>;
      };

      await writeLocalFileRunDogfoodArtifact({
        run: { id: run.id, status: run.status },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
        events: detail.events.length,
        fileReads: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read").length,
        modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
        checkpoint: state.checkpoints?.localFileReport?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "file_read").length).toBe(2);
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.local_file_report", status: "succeeded" })]),
      );
      expect(state.checkpoints?.localFileReport?.value?.report?.report).toMatch(/story|picnic|museum|registration|travel/i);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );

  itLive(
    "dogfoods a local Downloads classification workflow with live Ambient compile and run",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const downloadsFixture = await createLocalDownloadsFixture();
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: `Review the local Downloads fixture at ${downloadsFixture} and classify it into up to 7 categories.`,
        traceMode: "debug",
      });
      try {
        const dashboard = await compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest: [
            `Please review the documents and folders in my Downloads fixture directory at ${downloadsFixture}.`,
            "Classify them into up to 7 categories.",
            "Use local_directory_list for the folder inventory, do not use Google Drive, do not use shell, and ask Ambient for a JSON classification from the directory metadata.",
          ].join(" "),
          workspaceSummary: `External local Downloads fixture directory: ${downloadsFixture}`,
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          stateRoot: store.getWorkspace().statePath,
          model,
          baseUrl: liveAmbientBaseUrl(),
          provider: new AmbientWorkflowCompilerProvider({
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          }),
        });
        const artifact = dashboard.artifacts[0];
        const source = await readFile(artifact.sourcePath, "utf8");

        expect(artifact).toMatchObject({ status: "ready_for_preview" });
        expect(artifact.manifest.tools).toEqual(expect.arrayContaining(["local_directory_list", "ambient.responses"]));
        expect(artifact.manifest.tools).not.toContain("google_workspace_call");
        expect(source).toContain("local_directory_list");

        const runDashboard = await runWorkflowArtifact({
          store,
          artifactId: artifact.id,
          workspacePath,
          permissionMode: "full-access",
          model,
          baseUrl: liveAmbientBaseUrl(),
          ambientProvider: new AmbientWorkflowRunProvider({
            model,
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            workflowThreadId: thread.id,
            idleTimeoutMs: 90_000,
            absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
            enforceAbsoluteTimeout: true,
          }),
        });
        const run = latestRunForArtifact(runDashboard, artifact.id);
        const detail = readWorkflowRunDetail(store, run.id);
        const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
          checkpoints?: Record<string, { value?: unknown }>;
        };

        await writeLocalDirectoryRunDogfoodArtifact({
          mode: "live-provider",
          run: { id: run.id, status: run.status },
          artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
          directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list")
            .length,
          modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
          checkpoint: state.checkpoints?.localDirectoryClassification?.value,
        });

        expect(run).toMatchObject({ status: "succeeded" });
        expect(
          detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list").length,
        ).toBeGreaterThanOrEqual(1);
        expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
      } finally {
        await rm(downloadsFixture, { recursive: true, force: true });
      }
    },
    Math.max(900_000, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS),
  );

  itLive(
    "dogfoods a local Downloads image categorization workflow with live Ambient compile and run",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const downloadsFixture = await createLocalDownloadsImageFixture();
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: `Categorize 10 images from my Downloads image fixture at ${downloadsFixture}.`,
        traceMode: "debug",
      });
      try {
        const dashboard = await compileWorkflowArtifact({
          store,
          workflowThreadId: thread.id,
          userRequest: [
            `Please categorize 10 images from my Downloads image fixture directory at ${downloadsFixture}.`,
            "Use local_directory_list to inventory the folder.",
            "Use ambient_visual_analyze for MiniCPM-V visual evidence for exactly 10 image files.",
            "Then ask the selected Ambient Desktop model to categorize the visual evidence.",
            "Do not use Google Drive, shell, raw ambient_cli, or a generic cloud/local LLM choice.",
          ].join(" "),
          workspaceSummary: `External local Downloads image fixture directory: ${downloadsFixture}. It contains exactly 10 PNG files for live workflow compiler dogfood.`,
          toolDescriptors: firstPartyDesktopToolDescriptors(),
          stateRoot: store.getWorkspace().statePath,
          model,
          baseUrl: liveAmbientBaseUrl(),
          provider: new AmbientWorkflowCompilerProvider({
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            timeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
          }),
        });
        const artifact = dashboard.artifacts[0];
        const source = await readFile(artifact.sourcePath, "utf8");

        expect(artifact).toMatchObject({ status: "ready_for_preview" });
        expect(artifact.manifest.tools).toEqual(
          expect.arrayContaining(["local_directory_list", "ambient_visual_analyze", "ambient.responses"]),
        );
        expect(artifact.manifest.tools).not.toEqual(expect.arrayContaining(["google_workspace_call", "bash", "ambient_cli"]));
        expect(source).toContain("ambient_visual_analyze");

        const vision = fakeMiniCpmVision();
        const runDashboard = await runWorkflowArtifact({
          store,
          artifactId: artifact.id,
          workspacePath,
          permissionMode: "full-access",
          model,
          baseUrl: liveAmbientBaseUrl(),
          vision,
          ambientProvider: new AmbientWorkflowRunProvider({
            model,
            apiKey,
            baseUrl: liveAmbientBaseUrl(),
            workflowThreadId: thread.id,
            idleTimeoutMs: 90_000,
            absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
            enforceAbsoluteTimeout: true,
          }),
        });
        const run = latestRunForArtifact(runDashboard, artifact.id);
        const detail = readWorkflowRunDetail(store, run.id);
        const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
          checkpoints?: Record<string, { value?: unknown }>;
        };

        await writeLocalImageRunDogfoodArtifact({
          mode: "live-provider",
          run: { id: run.id, status: run.status },
          artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId, manifest: artifact.manifest },
          directoryToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "local_directory_list")
            .length,
          visualToolCalls: detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze")
            .length,
          modelCalls: detail.modelCalls.map((call) => ({ task: call.task, status: call.status, latencyMs: call.latencyMs })),
          checkpoint: state.checkpoints?.localImageCategorization?.value,
        });

        expect(run).toMatchObject({ status: "succeeded" });
        expect(vision.analyzeMiniCpm).toHaveBeenCalledTimes(10);
        expect(
          detail.events.filter((event) => event.type === "desktop-tool.end" && event.message === "ambient_visual_analyze"),
        ).toHaveLength(10);
        expect(detail.modelCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]));
      } finally {
        await rm(downloadsFixture, { recursive: true, force: true });
      }
    },
    Math.max(900_000, LIVE_WORKFLOW_COMPILE_TIMEOUT_MS),
  );

  itLive(
    "dogfoods a browser-research workflow with a live Ambient runtime call",
    async () => {
      const apiKey = liveAmbientApiKey();
      const model = liveWorkflowModel();
      const workspacePath = deps.getWorkspacePath();
      const query = "KV cache optimization techniques for long-context LLM inference";
      const browser = fakeResearchBrowser();
      const thread = store.createWorkflowAgentThreadSummary({
        initialRequest: "Research KV cache optimization techniques and cite browser source evidence.",
        traceMode: "debug",
      });
      const dashboard = await compileWorkflowArtifact({
        store,
        workflowThreadId: thread.id,
        userRequest:
          "Create a read-only browser research workflow that searches, opens sources, reads page content, and asks Ambient to synthesize a cited report.",
        workspaceSummary: "Browser-research live dogfood with deterministic browser fixtures and live Ambient synthesis.",
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        stateRoot: store.getWorkspace().statePath,
        model,
        provider: { compileProgramIr: vi.fn(async () => browserResearchCompilerOutput(query)) },
      });
      const artifact = dashboard.artifacts[0];
      const runDashboard = await runWorkflowArtifact({
        store,
        artifactId: artifact.id,
        workspacePath,
        permissionMode: "full-access",
        browser,
        model,
        ambientProvider: new AmbientWorkflowRunProvider({
          model,
          apiKey,
          baseUrl: liveAmbientBaseUrl(),
          workflowThreadId: thread.id,
          idleTimeoutMs: 90_000,
          absoluteTimeoutMs: LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
        }),
      });
      const run = latestRunForArtifact(runDashboard, artifact.id);
      const detail = readWorkflowRunDetail(store, run.id);
      const state = JSON.parse(await readFile(artifact.statePath, "utf8")) as {
        checkpoints?: Record<string, { value?: { query?: string; sources?: string[]; report?: { report?: string; sources?: string[] } } }>;
      };
      const browserToolEnds = detail.events.filter((event) => event.type === "desktop-tool.end" && event.message?.startsWith("browser_"));
      const progressEvents = detail.events.filter((event) => event.type === "ambient.call.progress");

      await writeBrowserResearchRunDogfoodArtifact({
        run: { id: run.id, status: run.status, error: run.error },
        artifact: { id: artifact.id, workflowThreadId: artifact.workflowThreadId },
        eventCounts: eventCountsByType(detail.events),
        browserToolEnds: browserToolEnds.map((event) => ({ message: event.message, graphNodeId: event.graphNodeId })),
        progressEvents: progressEvents.map((event) => ({
          message: event.message,
          outputChars: event.data?.outputChars,
          thinkingChars: event.data?.thinkingChars,
          providerStage: event.data?.providerStage,
        })),
        modelCalls: detail.modelCalls.map((call) => ({
          task: call.task,
          status: call.status,
          latencyMs: call.latencyMs,
          model: call.model,
        })),
        checkpoint: state.checkpoints?.browserResearchReport?.value,
      });

      expect(run).toMatchObject({ status: "succeeded" });
      expect(browser.search).toHaveBeenCalledOnce();
      expect(browser.navigate).toHaveBeenCalledTimes(2);
      expect(browser.content).toHaveBeenCalledTimes(2);
      expect(browserToolEnds).toEqual(expect.arrayContaining([expect.objectContaining({ message: "browser_search" })]));
      expect(browserToolEnds.filter((event) => event.message === "browser_nav")).toHaveLength(2);
      expect(browserToolEnds.filter((event) => event.message === "browser_content")).toHaveLength(2);
      expect(detail.modelCalls).toEqual(
        expect.arrayContaining([expect.objectContaining({ task: "dogfood.browser_research_report", status: "succeeded" })]),
      );
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(state.checkpoints?.browserResearchReport?.value?.sources).toHaveLength(2);
      expect(state.checkpoints?.browserResearchReport?.value?.report?.report).toMatch(/cache|inference|attention|memory|source/i);
    },
    LIVE_WORKFLOW_COMPILE_TIMEOUT_MS,
  );
}
