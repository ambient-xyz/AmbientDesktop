import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  autoCommitCompletedTaskWorkspaceChanges,
  collectProofOfWork,
  collectRunTranscriptProgress,
  collectStructuredProofArtifacts,
  createElapsedBudgetMonitor,
  createStallMonitor,
  mergeProjectBoardTaskActionProof,
  orchestrationWorkspaceScopePromptSection,
  orchestrationClosePolicyForRun,
  orchestrationFocusDecisionAfterRun,
  orchestrationProofHasTrustworthyTaskCompletion,
  orchestrationProofPolicyForRun,
  orchestrationTaskStateAfterRun,
  shouldSimulateFinalResponseErrorAfterDurableTaskComplete,
} from "./orchestrationRunner";
import { RESTART_INTERRUPTED_LOCAL_TASK_ERROR, restartInterruptedContinuationPrompt } from "./orchestrationRecovery";

const execFileAsync = promisify(execFile);

function rgbaPngFixture(red: number, green: number, blue: number, alpha = 255): Buffer {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(Buffer.from([0, red, green, blue, alpha]));
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function redPngFixture(): Buffer {
  return rgbaPngFixture(255, 0, 0);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

describe("createStallMonitor", () => {
  it("fires when activity stops for the configured timeout", async () => {
    vi.useFakeTimers();
    const onStalled = vi.fn(async () => {});
    const monitor = createStallMonitor({ timeoutMs: 100, onStalled });

    await vi.advanceTimersByTimeAsync(99);
    expect(monitor.stalled).toBe(false);
    expect(onStalled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(monitor.stalled).toBe(true);
    expect(onStalled).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("resets the timeout on touch and stops cleanly", async () => {
    vi.useFakeTimers();
    const onStalled = vi.fn(async () => {});
    const monitor = createStallMonitor({ timeoutMs: 100, onStalled });

    await vi.advanceTimersByTimeAsync(80);
    monitor.touch();
    await vi.advanceTimersByTimeAsync(80);
    expect(onStalled).not.toHaveBeenCalled();

    monitor.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.stalled).toBe(false);
    expect(onStalled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not arm when stall detection is disabled", async () => {
    vi.useFakeTimers();
    const onStalled = vi.fn(async () => {});
    const monitor = createStallMonitor({ timeoutMs: 0, onStalled });

    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.stalled).toBe(false);
    expect(onStalled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("createElapsedBudgetMonitor", () => {
  it("fires once after the configured elapsed budget and does not reset on activity", async () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn(async () => {});
    const monitor = createElapsedBudgetMonitor({ timeoutMs: 100, onElapsed });

    await vi.advanceTimersByTimeAsync(99);
    expect(monitor.elapsed).toBe(false);
    expect(onElapsed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(monitor.elapsed).toBe(true);
    expect(onElapsed).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not arm when elapsed-budget enforcement is disabled", async () => {
    vi.useFakeTimers();
    const onElapsed = vi.fn(async () => {});
    const monitor = createElapsedBudgetMonitor({ timeoutMs: 0, onElapsed });

    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.elapsed).toBe(false);
    expect(onElapsed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("orchestrationWorkspaceScopePromptSection", () => {
  it("marks a prepared worktree as the only write scope", () => {
    const prompt = orchestrationWorkspaceScopePromptSection({
      projectRoot: "/repo/project",
      workspacePath: "/repo/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
      workspaceStrategy: "git-worktree",
    });

    expect(prompt).toContain("Writable task workspace: /repo/project/.ambient-codex/orchestration/workspaces/LOCAL-1");
    expect(prompt).toContain("Workspace strategy: git-worktree.");
    expect(prompt).toContain("Owning project root: /repo/project. Use it as read-only context only");
    expect(prompt).toContain("Create, modify, delete, stage, and commit task files only inside the writable task workspace");
    expect(prompt).toContain("Put scratch files, fixtures, generated reports, proof outputs, and temporary files inside the writable task workspace");
    expect(prompt).toContain("do not write them to /tmp");
    expect(prompt).toContain("Do not request outside-workspace file or shell permissions to mutate the owning project root");
  });

  it("does not label the project root read-only when it is the writable workspace", () => {
    const prompt = orchestrationWorkspaceScopePromptSection({
      projectRoot: "/repo/project",
      workspacePath: "/repo/project",
      workspaceStrategy: "directory",
    });

    expect(prompt).toContain("Writable task workspace: /repo/project");
    expect(prompt).toContain("Workspace strategy: directory.");
    expect(prompt).not.toContain("Owning project root:");
  });
});

describe("collectRunTranscriptProgress", () => {
  it("builds a lightweight running proof snapshot from the execution transcript", () => {
    const proof = collectRunTranscriptProgress(
      {
        listMessages: () => [
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content: [
              "I mounted the first component and am running tests.",
              "```task_actions",
              JSON.stringify([
                {
                  actionId: "heartbeat-1",
                  action: "task_heartbeat",
                  createdAt: "2026-05-05T12:00:05.000Z",
                  summary: "Shell is mounted; verification is running.",
                  completed: ["Created the render loop."],
                  remaining: ["Collect proof."],
                },
              ]),
              "```",
            ].join("\n"),
            createdAt: "2026-05-05T12:00:05.000Z",
          },
          {
            id: "tool-1",
            threadId: "thread-1",
            role: "tool",
            content: "pnpm vitest src/game/renderLoop.test.ts\nrunning...",
            createdAt: "2026-05-05T12:00:06.000Z",
            metadata: { status: "running", toolName: "bash" },
          },
        ],
      },
      "thread-1",
      "2026-05-05T12:00:00.000Z",
      new Date("2026-05-05T12:00:07.500Z"),
    );

    expect(proof).toMatchObject({
      kind: "agent-run-progress",
      messageCount: 2,
      assistantMessageCount: 1,
      toolMessageCount: 1,
      runningToolMessageCount: 1,
      elapsedMs: 7500,
      lastAssistantStatus: "streaming",
      progress: {
        status: "running",
        elapsedMs: 7500,
        taskActionCount: 1,
        runningToolMessageCount: 1,
      },
      taskToolActions: [expect.objectContaining({ action: "task_heartbeat", summary: "Shell is mounted; verification is running." })],
      taskActionDiagnostics: expect.objectContaining({
        actionCount: 1,
        nativeToolActionCount: 0,
        fencedFallbackActionCount: 1,
      }),
    });
    expect(proof.outputCharCount).toBeGreaterThan(0);
  });

  it("scopes reused-thread proof actions to the current run", () => {
    const proof = collectRunTranscriptProgress(
      {
        listMessages: () => [
          {
            id: "assistant-old",
            threadId: "thread-1",
            role: "assistant",
            content: [
              "Old run completed.",
              "```task_actions",
              JSON.stringify([
                {
                  actionId: "old-complete",
                  runId: "run-old",
                  action: "task_complete",
                  createdAt: "2026-05-05T12:00:05.000Z",
                  summary: "Old run was complete.",
                  completed: ["Old work."],
                  remaining: [],
                  risks: [],
                  commands: ["pnpm test"],
                  changedFiles: ["old.ts"],
                  screenshots: [],
                  browserTraces: [],
                  visualChecks: [],
                  manualChecks: [],
                },
              ]),
              "```",
            ].join("\n"),
            createdAt: "2026-05-05T12:00:05.000Z",
          },
          {
            id: "assistant-new",
            threadId: "thread-1",
            role: "assistant",
            content: [
              "New run started.",
              "```task_actions",
              JSON.stringify([
                {
                  actionId: "new-heartbeat",
                  runId: "run-new",
                  action: "task_heartbeat",
                  createdAt: "2026-05-05T12:10:05.000Z",
                  summary: "New run is collecting proof.",
                  completed: [],
                  remaining: ["Run tests."],
                },
              ]),
              "```",
            ].join("\n"),
            createdAt: "2026-05-05T12:10:05.000Z",
          },
        ],
      },
      "thread-1",
      "2026-05-05T12:10:00.000Z",
      new Date("2026-05-05T12:10:10.000Z"),
      { runId: "run-new" },
    );

    expect(proof.messageCount).toBe(1);
    expect(proof.taskToolActions).toEqual([expect.objectContaining({ actionId: "new-heartbeat", runId: "run-new" })]);
    expect(orchestrationProofHasTrustworthyTaskCompletion(proof, { runId: "run-new" })).toBe(false);
  });
});

describe("orchestrationTaskStateAfterRun", () => {
  it("maps completed and canceled runs to terminal task states", () => {
    expect(orchestrationTaskStateAfterRun({ status: "completed" })).toBe("needs_review");
    expect(orchestrationTaskStateAfterRun({ status: "completed", proofOfWork: { lastAssistantText: "Need API credentials." } })).toBe("needs_info");
    expect(orchestrationTaskStateAfterRun({ status: "canceled" })).toBe("canceled");
    expect(orchestrationTaskStateAfterRun({ status: "stalled" })).toBe("terminal_blocker");
    expect(orchestrationTaskStateAfterRun({ status: "stalled", error: RESTART_INTERRUPTED_LOCAL_TASK_ERROR })).toBe("needs_info");
  });

  it("classifies failed runs into actionable pause states", () => {
    expect(orchestrationTaskStateAfterRun({ status: "failed", error: "Need API credentials before continuing." })).toBe("needs_info");
    expect(orchestrationTaskStateAfterRun({ status: "failed", error: "Token budget limit exceeded." })).toBe("budget_exhausted");
    expect(orchestrationTaskStateAfterRun({ status: "failed", proofOfWork: { lastAssistantText: "Build failed with unrecoverable compiler errors." } })).toBe("terminal_blocker");
  });

  it("does not treat ordinary completion or preparation wording as a needs-info pause", () => {
    expect(
      orchestrationTaskStateAfterRun({
        status: "completed",
        proofOfWork: {
          lastAssistantText:
            "Task complete. I wrote the requested calendar summary with a preparation note, and the file includes the DOGFOOD_DONE marker as required.",
        },
      }),
    ).toBe("needs_review");
  });

  it("builds a continuation prompt for restart-interrupted browser tasks", () => {
    const prompt = restartInterruptedContinuationPrompt({
      task: {
        identifier: "LOCAL-1",
        title: "Asteroids Clone",
        description: "Please make a working browser based clone of the 1970s asteroids arcade game",
      },
      workspacePath: "/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1",
    });

    expect(prompt).toContain("Continue the interrupted Local Task");
    expect(prompt).toContain("Do not restart from scratch");
    expect(prompt).toContain("Inspect existing files first");
    expect(prompt).toContain("LOCAL-1 - Asteroids Clone");
    expect(prompt).toContain("/tmp/project/.ambient-codex/orchestration/workspaces/LOCAL-1");
    expect(prompt).toContain("Do not claim gameplay works unless captured evidence shows the app moved past its start screen");
  });
});

describe("orchestrationClosePolicyForRun", () => {
  it("uses the project-board pass budget for board-linked cards", () => {
    expect(
      orchestrationClosePolicyForRun({
        workflowMaxTurns: 20,
        projectBoardCard: { id: "card-1", title: "Build shell" },
        budgetPolicy: { maxPassesPerCard: 3, maxRuntimeMsPerCard: 90_000, pauseOnTerminalBlocker: true, smallestSufficientProof: true },
      }),
    ).toMatchObject({
      source: "project_board",
      maxPasses: 3,
      maxRuntimeMs: 90_000,
      pauseOnTerminalBlocker: true,
      smallestSufficientProof: true,
    });
  });

  it("accepts minute-based project-board runtime budgets", () => {
    expect(
      orchestrationClosePolicyForRun({
        workflowMaxTurns: 20,
        projectBoardCard: { id: "card-1", title: "Build shell" },
        budgetPolicy: { maxPassesPerCard: 2, maxRuntimeMinutesPerCard: 1.5 },
      }),
    ).toMatchObject({
      source: "project_board",
      maxPasses: 2,
      maxRuntimeMs: 90_000,
    });
  });

  it("falls back to workflow turns when no usable board budget exists", () => {
    expect(
      orchestrationClosePolicyForRun({
        workflowMaxTurns: 4,
        projectBoardCard: { id: "card-1", title: "Build shell" },
        budgetPolicy: { maxPassesPerCard: 0 },
      }),
    ).toMatchObject({
      source: "workflow",
      maxPasses: 4,
      pauseOnTerminalBlocker: true,
      smallestSufficientProof: true,
    });
  });
});

describe("collectStructuredProofArtifacts", () => {
  it("collects screenshots, traces, and text-first visual check metadata", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    try {
      const screenshotDir = join(projectRoot, ".ambient-codex", "browser", "screenshots");
      const resultsDir = join(workspacePath, "test-results");
      await mkdir(screenshotDir, { recursive: true });
      await mkdir(resultsDir, { recursive: true });
      await writeFile(join(screenshotDir, "proof.png"), redPngFixture());
      await writeFile(join(resultsDir, "playwright-trace.zip"), "trace bytes", "utf8");

      const proof = await collectStructuredProofArtifacts(projectRoot, workspacePath);

      expect(proof.screenshots).toEqual([
        expect.objectContaining({
          path: ".ambient-codex/browser/screenshots/proof.png",
          source: "project_browser_screenshots",
          bytes: expect.any(Number),
        }),
      ]);
      expect(proof.visualChecks).toEqual([
        expect.objectContaining({
          path: ".ambient-codex/browser/screenshots/proof.png",
          sha256: expect.any(String),
          pixelHash: expect.any(String),
          width: 1,
          height: 1,
          nonBlackPixels: 1,
          meaningfulNonBackgroundPixels: 0,
          dominantColor: "255,0,0",
          result: "nonblank_image_detected",
          summary: expect.stringContaining("nonblack pixels"),
        }),
      ]);
      expect(proof.browserTraces).toEqual([
        expect.objectContaining({
          path: "test-results/playwright-trace.zip",
          source: "test_results",
        }),
      ]);
      expect(proof.browserEvidence).toMatchObject({
        screenshotCount: 1,
        traceCount: 1,
        visualCheckCount: 1,
        nonblankVisualCheckCount: 1,
        pngVisualCheckCount: 1,
        uniquePixelHashCount: 1,
        unchangedScreenshotEvidence: false,
        visualEvidenceStatus: "single_screenshot_recorded",
        largestImage: "1x1",
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("flags duplicate PNG screenshots as weak unchanged visual evidence", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    try {
      const screenshotDir = join(workspacePath, ".ambient-codex", "browser", "screenshots");
      await mkdir(screenshotDir, { recursive: true });
      await writeFile(join(screenshotDir, "before.png"), redPngFixture());
      await writeFile(join(screenshotDir, "after.png"), redPngFixture());

      const proof = await collectStructuredProofArtifacts(projectRoot, workspacePath);

      expect(proof.browserEvidence).toMatchObject({
        screenshotCount: 2,
        visualCheckCount: 2,
        pngVisualCheckCount: 2,
        uniquePixelHashCount: 1,
        unchangedScreenshotEvidence: true,
        visualEvidenceStatus: "weak_unchanged_screenshots",
        visualWarnings: [expect.stringContaining("identical decoded pixels")],
      });
      expect(proof.visualChecks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ".ambient-codex/browser/screenshots/before.png", pixelHash: expect.any(String) }),
          expect.objectContaining({ path: ".ambient-codex/browser/screenshots/after.png", pixelHash: expect.any(String) }),
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("records distinct PNG pixel hashes when screenshots visibly change", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    try {
      const screenshotDir = join(workspacePath, ".ambient-codex", "browser", "screenshots");
      await mkdir(screenshotDir, { recursive: true });
      await writeFile(join(screenshotDir, "before.png"), redPngFixture());
      await writeFile(join(screenshotDir, "after.png"), rgbaPngFixture(0, 255, 0));

      const proof = await collectStructuredProofArtifacts(projectRoot, workspacePath);

      expect(proof.browserEvidence).toMatchObject({
        screenshotCount: 2,
        uniquePixelHashCount: 2,
        unchangedScreenshotEvidence: false,
        visualEvidenceStatus: "visual_change_observed",
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("mergeProjectBoardTaskActionProof", () => {
  it("preserves durable native task actions when a later transcript snapshot has the same action without metadata", () => {
    const storedProof = {
      taskToolActions: [
        {
          actionId: "native-complete-1",
          action: "task_complete",
          createdAt: "2026-05-05T12:00:00.000Z",
          summary: "Checker is implemented and verified.",
          completed: ["Contrast checker implemented."],
          remaining: [],
          risks: [],
          commands: ["node scripts/check-contrast.mjs tokens.json"],
          changedFiles: ["scripts/check-contrast.mjs"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
          metadata: { transport: "native_tool", toolName: "task_complete" },
        },
      ],
    };

    const merged = mergeProjectBoardTaskActionProof(
      {
        kind: "agent-run-progress",
        taskToolActions: [
          {
            actionId: "native-complete-1",
            action: "task_complete",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Checker is implemented and verified.",
            completed: ["Contrast checker implemented."],
            remaining: [],
            risks: [],
            commands: ["node scripts/check-contrast.mjs tokens.json"],
            changedFiles: ["scripts/check-contrast.mjs"],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ],
      },
      storedProof,
    );

    expect(merged.taskToolActions).toEqual([
      expect.objectContaining({
        actionId: "native-complete-1",
        metadata: expect.objectContaining({ transport: "native_tool", toolName: "task_complete" }),
      }),
    ]);
    expect(merged.taskActionDiagnostics).toMatchObject({
      nativeToolActionCount: 1,
      fencedFallbackActionCount: 0,
      terminalActionCount: 1,
    });
    expect(orchestrationProofHasTrustworthyTaskCompletion(merged)).toBe(true);
  });

  it("gates simulated final-response errors on E2E durable task completion proof", () => {
    const proofOfWork = {
      taskToolActions: [
        {
          actionId: "complete-1",
          action: "task_complete",
          createdAt: "2026-05-17T12:00:00.000Z",
          summary: "CLI work is complete.",
          completed: ["Implemented CLI."],
          remaining: [],
          risks: [],
          commands: ["node tests/verify-cli.mjs"],
          changedFiles: ["src/cli.mjs", "tests/verify-cli.mjs"],
          screenshots: [],
          browserTraces: [],
          visualChecks: [],
          manualChecks: [],
          metadata: { transport: "native_tool", toolName: "task_complete" },
        },
      ],
    };

    expect(
      shouldSimulateFinalResponseErrorAfterDurableTaskComplete({
        runId: "run-1",
        proofOfWork,
        env: {
          AMBIENT_E2E: "1",
          AMBIENT_E2E_PROJECT_BOARD_FINAL_ERROR_AFTER_TASK_COMPLETE: "run-1",
        },
      }),
    ).toBe(true);
    expect(
      shouldSimulateFinalResponseErrorAfterDurableTaskComplete({
        runId: "run-1",
        proofOfWork,
        env: {
          AMBIENT_E2E: "0",
          AMBIENT_E2E_PROJECT_BOARD_FINAL_ERROR_AFTER_TASK_COMPLETE: "run-1",
        },
      }),
    ).toBe(false);
    expect(
      shouldSimulateFinalResponseErrorAfterDurableTaskComplete({
        runId: "run-1",
        proofOfWork: { taskToolActions: [] },
        env: {
          AMBIENT_E2E: "1",
          AMBIENT_E2E_PROJECT_BOARD_FINAL_ERROR_AFTER_TASK_COMPLETE: "run-1",
        },
      }),
    ).toBe(false);
  });
});

describe("collectProofOfWork", () => {
  it("captures structured project-board task actions from assistant output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, "workspace");
    try {
      await mkdir(workspacePath, { recursive: true });
      const proof = await collectProofOfWork(
        projectRoot,
        workspacePath,
        {
          listMessages: () => [
            {
              id: "assistant-1",
              threadId: "thread-1",
              role: "assistant",
              content: [
                "The shell is implemented.",
                "```task_actions",
                JSON.stringify([
                  {
                    actionId: "proof-1",
                    action: "task_report_proof",
                    createdAt: "2026-05-05T12:00:00.000Z",
                    summary: "Tests passed.",
                    commands: ["pnpm test"],
                    changedFiles: ["src/App.tsx"],
                    screenshots: [],
                    browserTraces: [],
                    visualChecks: [],
                    manualChecks: [],
                  },
                ]),
                "```",
              ].join("\n"),
              createdAt: "2026-05-05T12:00:00.000Z",
            },
          ],
        },
        "thread-1",
      );

      expect(proof.taskToolActions).toEqual([
        expect.objectContaining({
          actionId: "proof-1",
          action: "task_report_proof",
          summary: "Tests passed.",
          changedFiles: ["src/App.tsx"],
        }),
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("ignores task action samples embedded in user prompts", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, "workspace");
    try {
      await mkdir(workspacePath, { recursive: true });
      const promptSample = [
        "Project-board task action protocol",
        "```task_actions",
        JSON.stringify([
          {
            actionId: "unique-proof-id",
            action: "task_report_proof",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Summarize the actual proof collected in this run.",
            commands: [],
            changedFiles: [],
            screenshots: [],
            browserTraces: [],
            visualChecks: [],
            manualChecks: [],
          },
        ]),
        "```",
      ].join("\n");
      const proof = await collectProofOfWork(
        projectRoot,
        workspacePath,
        {
          listMessages: () => [
            {
              id: "user-1",
              threadId: "thread-1",
              role: "user",
              content: promptSample,
              createdAt: "2026-05-05T12:00:00.000Z",
            },
            {
              id: "assistant-1",
              threadId: "thread-1",
              role: "assistant",
              content: "I have not reported proof yet.",
              createdAt: "2026-05-05T12:00:01.000Z",
            },
          ],
        },
        "thread-1",
      );

      expect(proof.taskToolActions).toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("marks browser keypress proof weak when collected screenshots do not change", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, ".ambient-codex", "orchestration", "workspaces", "LOCAL-1");
    try {
      const screenshotDir = join(workspacePath, ".ambient-codex", "browser", "screenshots");
      await mkdir(screenshotDir, { recursive: true });
      await writeFile(join(screenshotDir, "before.png"), redPngFixture());
      await writeFile(join(screenshotDir, "after.png"), redPngFixture());

      const proof = await collectProofOfWork(
        projectRoot,
        workspacePath,
        {
          listMessages: () => [
            {
              id: "tool-1",
              threadId: "thread-1",
              role: "tool",
              content: "Browser keypress dispatched.",
              createdAt: "2026-05-05T12:00:00.000Z",
              metadata: { toolName: "browser_keypress", status: "done" },
            },
            {
              id: "assistant-1",
              threadId: "thread-1",
              role: "assistant",
              content: "I pressed Space and captured the game again.",
              createdAt: "2026-05-05T12:00:01.000Z",
            },
          ],
        },
        "thread-1",
      );

      expect(proof.browserEvidence).toMatchObject({
        browserKeypressCount: 1,
        interactionEvidenceStatus: "weak_no_visual_change_after_input",
        unchangedScreenshotEvidence: true,
        visualWarnings: expect.arrayContaining([expect.stringContaining("browser_keypress was used")]),
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("treats write/edit tool outputs as changed-file proof in directory workspaces", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, "workspace");
    try {
      await mkdir(workspacePath, { recursive: true });
      const proof = await collectProofOfWork(
        projectRoot,
        workspacePath,
        {
          listMessages: () => [
            {
              id: "tool-1",
              threadId: "thread-1",
              role: "tool",
              content: "write completed\n\nResult\nSuccessfully wrote 830 bytes to dogfood-summary.md",
              metadata: { toolName: "write", status: "done" },
              createdAt: "2026-05-05T12:00:00.000Z",
            },
          ],
        },
        "thread-1",
      );

      expect(proof.toolChangedFiles).toEqual(["dogfood-summary.md"]);
      expect(
        orchestrationFocusDecisionAfterRun({
          status: "completed",
          proofOfWork: proof,
          proofPolicy: {
            requireTests: false,
            requireDiffSummary: true,
            requireScreenshots: false,
            maxSummaryChars: 4000,
          },
          passNumber: 1,
          maxTurns: 1,
        }),
      ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("captures native task tool actions from tool output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-proof-project-"));
    const workspacePath = join(projectRoot, "workspace");
    try {
      await mkdir(workspacePath, { recursive: true });
      const proof = await collectProofOfWork(
        projectRoot,
        workspacePath,
        {
          listMessages: () => [
            {
              id: "tool-1",
              threadId: "thread-1",
              role: "tool",
              content: [
                "Project board task action captured.",
                "```task_actions",
                JSON.stringify([
                  {
                    actionId: "native-proof-1",
                    action: "task_report_proof",
                    createdAt: "2026-05-05T12:00:00.000Z",
                    summary: "Native tool proof passed.",
                    commands: ["pnpm test"],
                    changedFiles: ["src/App.tsx"],
                    metadata: { transport: "native_tool", toolName: "task_report_proof" },
                  },
                ]),
                "```",
              ].join("\n"),
              createdAt: "2026-05-05T12:00:00.000Z",
              metadata: { status: "done", toolName: "task_report_proof" },
            },
          ],
        },
        "thread-1",
      );

      expect(proof.taskToolActions).toEqual([
        expect.objectContaining({
          actionId: "native-proof-1",
          action: "task_report_proof",
          summary: "Native tool proof passed.",
          metadata: expect.objectContaining({ transport: "native_tool" }),
        }),
      ]);
      expect(proof.taskActionDiagnostics).toMatchObject({
        actionCount: 1,
        nativeToolActionCount: 1,
        fencedFallbackActionCount: 0,
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("autoCommitCompletedTaskWorkspaceChanges", () => {
  it("commits completed task files while leaving runtime artifacts untracked", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-task-autocommit-"));
    try {
      await makeGitRepo(workspacePath);
      await mkdir(join(workspacePath, "fixtures"), { recursive: true });
      await mkdir(join(workspacePath, ".ambient", "cli-packages"), { recursive: true });
      await writeFile(join(workspacePath, "fixtures", "links.md"), "# Links\n\n[Missing](missing.md)\n");
      await writeFile(join(workspacePath, ".ambient", "cli-packages", "packages.json"), "{}\n");

      const result = await autoCommitCompletedTaskWorkspaceChanges(workspacePath, "LOCAL-1", {
        kind: "agent-run",
        changedFiles: [
          { path: "fixtures/links.md", status: "??" },
          { path: ".ambient/cli-packages/packages.json", status: "??" },
        ],
        taskToolActions: [
          {
            actionId: "complete-1",
            action: "task_complete",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Fixture complete.",
            changedFiles: ["fixtures/links.md", ".ambient/cli-packages/packages.json"],
            completed: ["Created fixtures."],
            remaining: [],
          },
        ],
      });

      expect(result).toMatchObject({
        status: "committed",
        changedFiles: ["fixtures/links.md"],
        excludedFiles: [".ambient/cli-packages/packages.json"],
      });
      expect(result?.commit).toMatch(/^[0-9a-f]+$/);

      const tracked = await execFileAsync("git", ["-C", workspacePath, "ls-tree", "--name-only", "HEAD", "fixtures/links.md"]);
      expect(tracked.stdout.trim()).toBe("fixtures/links.md");
      const status = await execFileAsync("git", ["-C", workspacePath, "status", "--short"]);
      expect(status.stdout).toContain("?? .ambient/");
      expect(status.stdout).not.toContain("fixtures/links.md");
      const message = await execFileAsync("git", ["-C", workspacePath, "log", "-1", "--pretty=%s"]);
      expect(message.stdout.trim()).toBe("Complete LOCAL-1");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not commit task workspaces before terminal task completion", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-task-autocommit-"));
    try {
      await makeGitRepo(workspacePath);
      await writeFile(join(workspacePath, "notes.md"), "work in progress\n");

      const result = await autoCommitCompletedTaskWorkspaceChanges(workspacePath, "LOCAL-2", {
        kind: "agent-run",
        changedFiles: [{ path: "notes.md", status: "??" }],
        taskToolActions: [
          {
            actionId: "proof-1",
            action: "task_report_proof",
            createdAt: "2026-05-05T12:00:00.000Z",
            summary: "Partial proof.",
            changedFiles: ["notes.md"],
            commands: [],
          },
        ],
      });

      expect(result).toBeUndefined();
      const status = await execFileAsync("git", ["-C", workspacePath, "status", "--short"]);
      expect(status.stdout).toContain("?? notes.md");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

describe("orchestrationFocusDecisionAfterRun", () => {
  const proofPolicy = {
    requireTests: false,
    requireDiffSummary: true,
    requireScreenshots: false,
    maxSummaryChars: 4000,
  };

  it("continues completed passes that are missing required proof", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", lastAssistantText: "I made progress." },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({
      action: "continue",
      reason: "missing-proof",
      missingProof: ["diff summary or changed files"],
    });
  });

  it("finishes when proof is satisfied or the focus-loop budget is exhausted", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", changedFiles: ["src/app.ts"] },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });

    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", lastAssistantText: "No proof yet." },
        proofPolicy,
        passNumber: 3,
        maxTurns: 3,
      }),
    ).toEqual({
      action: "finish",
      reason: "max-turns-exhausted",
      missingProof: ["diff summary or changed files"],
    });
  });

  it("treats model-facing task proof actions as proof for focus-loop close decisions", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          taskToolActions: [
            {
              actionId: "proof-1",
              action: "task_report_proof",
              createdAt: "2026-05-05T12:00:00.000Z",
              summary: "Tests passed.",
              commands: ["pnpm test"],
              changedFiles: ["src/App.tsx"],
            },
          ],
        },
        proofPolicy: {
          requireTests: true,
          requireDiffSummary: true,
          requireScreenshots: false,
          maxSummaryChars: 4000,
        },
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
  });

  it("treats project-board task action commands as command-output proof even without test-framework keywords", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          taskToolActions: [
            {
              actionId: "cli-proof-1",
              action: "task_report_proof",
              createdAt: "2026-05-05T12:00:00.000Z",
              summary: "CLI smoke proof passed.",
              commands: ["node cli.js . -> EXIT=0", "node cli.js -> Usage: todo-scanner <path>; EXIT=1"],
              changedFiles: ["package.json", "cli.js", "lib/.gitkeep"],
            },
            {
              actionId: "cli-complete-1",
              action: "task_complete",
              createdAt: "2026-05-05T12:01:00.000Z",
              summary: "Scaffold complete.",
              completed: ["CLI scaffold files created and verified."],
              remaining: [],
              risks: [],
              commands: ["node cli.js . -> EXIT=0"],
              changedFiles: ["package.json", "cli.js", "lib/.gitkeep"],
              screenshots: [],
              browserTraces: [],
              visualChecks: [],
              manualChecks: [],
            },
          ],
        },
        proofPolicy: {
          requireTests: true,
          requireDiffSummary: true,
          requireScreenshots: false,
          maxSummaryChars: 4000,
        },
        passNumber: 2,
        maxTurns: 6,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
  });

  it("continues when task proof actions copy sample values instead of real proof", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          taskToolActions: [
            {
              actionId: "proof-1",
              action: "task_report_proof",
              createdAt: "2026-05-05T12:00:00.000Z",
              summary: "Verification passed.",
              commands: [],
              changedFiles: [],
            },
          ],
        },
        proofPolicy: {
          requireTests: true,
          requireDiffSummary: true,
          requireScreenshots: false,
          maxSummaryChars: 4000,
        },
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({
      action: "continue",
      reason: "missing-proof",
      missingProof: [
        "non-placeholder task action proof (task_report_proof proof-1 appears to contain copied sample value(s): actionId, summary.)",
        "diff summary or changed files",
        "test or command output",
      ],
    });
  });

  it("treats structured visual checks as screenshot proof", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", visualChecks: [{ result: "nonblank_image_detected", width: 1280, height: 720 }] },
        proofPolicy: {
          requireTests: false,
          requireDiffSummary: false,
          requireScreenshots: true,
          maxSummaryChars: 4000,
        },
        passNumber: 1,
        maxTurns: 2,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
  });

  it("continues interactive visual work when screenshots stay unchanged after browser input", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          screenshots: [{ path: "before.png" }, { path: "after.png" }],
          visualChecks: [
            { result: "nonblank_image_detected", pixelHash: "same", width: 1280, height: 720 },
            { result: "nonblank_image_detected", pixelHash: "same", width: 1280, height: 720 },
          ],
          browserEvidence: {
            screenshotCount: 2,
            visualCheckCount: 2,
            uniquePixelHashCount: 1,
            unchangedScreenshotEvidence: true,
            interactionEvidenceStatus: "weak_no_visual_change_after_input",
          },
        },
        proofPolicy: {
          requireTests: false,
          requireDiffSummary: false,
          requireScreenshots: true,
          maxSummaryChars: 4000,
        },
        passNumber: 1,
        maxTurns: 2,
      }),
    ).toEqual({
      action: "continue",
      reason: "missing-proof",
      missingProof: ["changed visual evidence after browser input"],
    });
  });

  it("accepts changed screenshots after browser input as visual proof", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          screenshots: [{ path: "before.png" }, { path: "after.png" }],
          visualChecks: [
            { result: "nonblank_image_detected", pixelHash: "before", width: 1280, height: 720 },
            { result: "nonblank_image_detected", pixelHash: "after", width: 1280, height: 720 },
          ],
          browserEvidence: {
            screenshotCount: 2,
            visualCheckCount: 2,
            uniquePixelHashCount: 2,
            unchangedScreenshotEvidence: false,
            interactionEvidenceStatus: "visual_change_observed_after_input",
          },
        },
        proofPolicy: {
          requireTests: false,
          requireDiffSummary: false,
          requireScreenshots: true,
          maxSummaryChars: 4000,
        },
        passNumber: 1,
        maxTurns: 2,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
  });

  it("requires artifact-backed screenshot proof for visual project-board cards", () => {
    const proofPolicy = orchestrationProofPolicyForRun(
      {
        requireTests: false,
        requireDiffSummary: true,
        requireScreenshots: false,
        maxSummaryChars: 4000,
      },
      {
        testPlan: {
          unit: [],
          integration: [],
          visual: ["Capture a nonblank browser screenshot."],
          manual: [],
        },
      },
    );

    expect(proofPolicy.requireScreenshots).toBe(true);
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          changedFiles: ["src/App.tsx"],
          lastAssistantText: "Implemented the app. Visual proof was not captured because no headless browser was available.",
        },
        proofPolicy,
        passNumber: 1,
        maxTurns: 2,
      }),
    ).toEqual({ action: "continue", reason: "missing-proof", missingProof: ["screenshot evidence"] });
  });

  it("honors project-board close policy pass budgets", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", lastAssistantText: "No proof yet." },
        proofPolicy,
        passNumber: 2,
        maxTurns: 2,
        closePolicy: {
          source: "project_board",
          maxPasses: 2,
          pauseOnTerminalBlocker: true,
          smallestSufficientProof: true,
          summary: "Project-board card close policy.",
        },
      }),
    ).toEqual({
      action: "finish",
      reason: "max-passes-exhausted",
      missingProof: [
        "diff summary or changed files",
        "project-board task action protocol: any_task_action",
        "project-board task action protocol: task_heartbeat",
        "project-board task action protocol: terminal_task_action",
      ],
    });
  });

  it("continues project-board runs that have proof but no terminal task action", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          changedFiles: ["src/renderer.ts"],
          taskToolActions: [
            {
              actionId: "heartbeat-1",
              action: "task_heartbeat",
              createdAt: "2026-05-05T12:00:00.000Z",
              summary: "Renderer files changed; proof still needs reporting.",
              completed: ["Created renderer shell."],
              remaining: ["Report proof."],
            },
          ],
        },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
        closePolicy: {
          source: "project_board",
          maxPasses: 3,
          pauseOnTerminalBlocker: true,
          smallestSufficientProof: true,
          summary: "Project-board card close policy.",
        },
      }),
    ).toEqual({
      action: "continue",
      reason: "missing-proof",
      missingProof: [
        "project-board task action protocol: terminal_task_action",
        "project-board task action protocol: proof_block_complete_followup_or_handoff",
      ],
    });
  });

  it("recovers failed project-board runs that abort before terminal task actions", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "failed",
        proofOfWork: {
          kind: "agent-run",
          lastAssistantText: "The Pi/Ambient runtime returned an error:\n\nRequest was aborted.",
          changedFiles: ["src/main.ts"],
          taskToolActions: [
            {
              actionId: "heartbeat-1",
              action: "task_heartbeat",
              createdAt: "2026-05-05T12:00:00.000Z",
              summary: "Started implementation.",
              completed: [],
              remaining: ["Continue after runtime abort."],
            },
          ],
        },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
        closePolicy: {
          source: "project_board",
          maxPasses: 3,
          pauseOnTerminalBlocker: true,
          smallestSufficientProof: true,
          summary: "Project-board card close policy.",
        },
      }),
    ).toEqual({
      action: "continue",
      reason: "failed-missing-terminal-task-action",
      missingProof: [
        "project-board task action protocol: terminal_task_action",
        "project-board task action protocol: proof_block_complete_followup_or_handoff",
      ],
    });
  });

  it("does not continue terminal pauses or failed runs", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", lastAssistantText: "Need an API key before continuing." },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({ action: "finish", reason: "needs_info", missingProof: [] });

    expect(
      orchestrationFocusDecisionAfterRun({
        status: "failed",
        proofOfWork: { kind: "agent-run" },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
      }),
    ).toEqual({ action: "finish", reason: "run-failed", missingProof: [] });
  });

  it("does not classify satisfied completion text containing required/preparation wording as a pause", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: {
          kind: "agent-run",
          lastAssistantText: "Task complete. The file includes the marker as required and a preparation note.",
          changedFiles: [{ path: "dogfood-calendar-summary.md", status: "??" }],
        },
        proofPolicy,
        passNumber: 1,
        maxTurns: 1,
      }),
    ).toEqual({ action: "finish", reason: "proof-satisfied", missingProof: [] });
  });

  it("can continue past pause-like evidence when the close policy explicitly allows it", () => {
    expect(
      orchestrationFocusDecisionAfterRun({
        status: "completed",
        proofOfWork: { kind: "agent-run", lastAssistantText: "Need to collect the final diff summary." },
        proofPolicy,
        passNumber: 1,
        maxTurns: 3,
        closePolicy: {
          source: "project_board",
          maxPasses: 3,
          pauseOnTerminalBlocker: false,
          smallestSufficientProof: true,
          summary: "Project-board card close policy.",
        },
      }),
    ).toEqual({
      action: "continue",
      reason: "missing-proof",
      missingProof: [
        "diff summary or changed files",
        "project-board task action protocol: any_task_action",
        "project-board task action protocol: task_heartbeat",
        "project-board task action protocol: terminal_task_action",
      ],
    });
  });
});

async function makeGitRepo(workspacePath: string): Promise<void> {
  await execFileAsync("git", ["init", workspacePath]);
  await writeFile(join(workspacePath, "README.md"), "initial\n");
  await execFileAsync("git", ["-C", workspacePath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    workspacePath,
    "-c",
    "user.name=Ambient Test",
    "-c",
    "user.email=ambient@example.test",
    "commit",
    "--no-gpg-sign",
    "-m",
    "initial",
  ]);
}
