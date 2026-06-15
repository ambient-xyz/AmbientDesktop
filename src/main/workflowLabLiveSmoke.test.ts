import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL } from "../shared/ambientModels";
import { liveAmbientDirectHelperProfile, liveAmbientProviderBaseUrl, liveAmbientProviderModel, readLiveAmbientProviderApiKey } from "./liveAmbientProviderConfig";
import { ProjectStore } from "./projectStore";
import { AmbientWorkflowLabJudgeProvider, runWorkflowLab } from "./workflowLab";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;
const runLive = process.env.AMBIENT_WORKFLOW_LAB_LIVE === "1";
const liveIt = runLive ? it : it.skip;
const liveProfile = liveAmbientDirectHelperProfile();

describeNative("Workflow Lab live GMI smoke", () => {
  let workspacePath = "";
  let store: ProjectStore;

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-workflow-lab-live-"));
    store = new ProjectStore();
    store.openWorkspace(workspacePath);
  });

  afterEach(async () => {
    store.close();
    await rm(workspacePath, { recursive: true, force: true });
  });

  liveIt("judges and adopts a bounded Workflow Lab candidate with the live Ambient-compatible provider", async () => {
    const apiKey = readLiveAmbientProviderApiKey({ purpose: "live Workflow Lab smoke" });
    const playbook = seedLiveWorkflowPlaybook(store, workspacePath);
    const run = store.createWorkflowLabRun({
      workflowId: playbook.id,
      goal: "Improve recovery guidance and validation for changing source pages.",
      attemptBudget: 1,
      plateauThreshold: 0.03,
      heldOutEnabled: true,
    });

    const judge = new AmbientWorkflowLabJudgeProvider({
      apiKey,
      baseUrl: liveAmbientProviderBaseUrl(),
      model: liveAmbientProviderModel({
        preferredModelEnvNames: ["AMBIENT_WORKFLOW_LAB_MODEL", "AMBIENT_LIVE_MODEL"],
        fallbackModel: AMBIENT_DEFAULT_MODEL,
      }),
      idleTimeoutMs: liveProfile.streamIdleTimeoutMs,
      retryPolicy: liveProfile.retryPolicy,
    });
    const completed = await runWorkflowLab(store, run.id, { judge: (input) => judge.judge(input) });
    const accepted = completed.variants.find((variant) => variant.id === completed.bestVariantId);

    expect(completed.status).toBe("completed");
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.evaluations.some((evaluation) => evaluation.judge.provider === "ambient")).toBe(true);
    expect(accepted?.evaluations.every((evaluation) => evaluation.gates.every((gate) => gate.status === "passed"))).toBe(true);

    const adopted = store.adoptWorkflowLabVariant(completed.id, completed.bestVariantId!);
    expect(adopted).toMatchObject({
      id: playbook.id,
      version: 2,
    });
  }, liveProfile.testTimeoutMs);
});

function seedLiveWorkflowPlaybook(store: ProjectStore, workspacePath: string) {
  const thread = store.createWorkflowRecordingThread({
    goal: "Summarize current Scottsdale theatre options for a date night.",
    workspacePath,
  });
  store.addMessage({ threadId: thread.id, role: "user", content: "Find Scottsdale theatre options for this weekend." });
  store.addMessage({
    threadId: thread.id,
    role: "tool",
    content: "browser_search completed\nFound venue listings, dates, and ticket pages.",
    metadata: { toolName: "browser_search", toolCallId: "search-1", status: "done" },
  });
  store.addMessage({
    threadId: thread.id,
    role: "tool",
    content: "browser_open failed\nOne venue page was blocked.",
    metadata: { toolName: "browser_open", toolCallId: "open-1", status: "error" },
  });
  store.addMessage({
    threadId: thread.id,
    role: "assistant",
    content: "Rank source-backed theatre options and note blocked pages.",
    metadata: { status: "done" },
  });
  store.stopWorkflowRecording(thread.id);
  store.updateWorkflowRecordingReviewDraft(thread.id, {
    intent: "Summarize current Scottsdale theatre options for a date night.",
    inputs: ["Location", "Date window", "Source freshness requirement"],
    successfulExamples: [
      {
        toolName: "browser_search",
        inputPreview: "Scottsdale theatre this weekend",
        resultPreview: "Venue listings, dates, and ticket pages.",
      },
    ],
    doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid treating blocked pages as verified current listings." }],
    validation: ["Final answer uses current source-backed theatre options and flags uncertainty."],
    outputShape: ["Ranked shortlist with dates, links, caveats, and fit rationale."],
  });
  return store.confirmWorkflowRecordingReview(thread.id).review!.savedPlaybook!;
}
