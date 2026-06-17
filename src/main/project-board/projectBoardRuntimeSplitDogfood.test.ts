import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { AgentRuntime, AgentRuntimeSendHooks } from "../agentRuntime";
import { startPreparedOrchestrationRun } from "../orchestrationRunner";
import { ProjectStore } from "../projectStore";
import type { SendMessageInput } from "../../shared/types";

const execFileAsync = promisify(execFile);
const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("project-board runtime split dogfood", () => {
  it("turns a product runtime-budget stop with progress into an actionable split decision", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "ambient-runtime-split-dogfood-"));
    const workspacePath = join(projectRoot, "worker-workspace");
    const store = new ProjectStore();
    try {
      await writeWorkflow(projectRoot);
      await mkdir(join(workspacePath, "src"), { recursive: true });
      await mkdir(join(workspacePath, "test"), { recursive: true });
      await writeFile(join(workspacePath, "README.md"), "Runtime split dogfood workspace\n", "utf8");
      await execFileAsync("git", ["init"], { cwd: workspacePath });
      await execFileAsync("git", ["add", "."], { cwd: workspacePath });
      await execFileAsync("git", ["-c", "user.name=Ambient Dogfood", "-c", "user.email=dogfood@ambient.local", "commit", "-m", "Seed worker workspace"], {
        cwd: workspacePath,
      });

      store.openWorkspace(projectRoot);
      const board = store.createProjectBoard({ title: "Runtime split dogfood board" });
      forceRuntimeBudget(store, board.charterId!, 40);
      const draft = store.createProjectBoardManualCard({
        boardId: board.id,
        title: "Runtime split progress marker",
        description: "Create the first marker, then keep working until the product runtime budget stops the card.",
      });
      const ready = store.updateProjectBoardCard({
        cardId: draft.id,
        candidateStatus: "ready_to_create",
        acceptanceCriteria: ["Create a runtime split marker.", "Record completed and remaining scope before the budget stop."],
        testPlan: { unit: ["Prepare a focused runtime split marker test."], integration: [], visual: [], manual: [] },
      });
      const approved = store.approveProjectBoardCard(ready.id);
      const run = store.recordPreparedOrchestrationRun({ taskId: approved.orchestrationTaskId!, workspacePath });
      const runtime = new RuntimeSplitFakeRuntime(store, workspacePath);

      await startPreparedOrchestrationRun(projectRoot, store, runtime as unknown as AgentRuntime, run.id);
      await waitFor(() => Boolean(store.getOrchestrationRun(run.id).finishedAt), 2500);

      const finishedRun = store.getOrchestrationRun(run.id);
      const reviewed = store.getProjectBoardCard(approved.id);
      expect(finishedRun.status).toBe("completed");
      expect(finishedRun.proofOfWork?.projectBoardRuntimeBudget).toMatchObject({ exceeded: true, maxRuntimeMs: 40 });
      expect(reviewed).toMatchObject({
        status: "blocked",
        proofReview: { status: "needs_follow_up", recommendedAction: "follow_up" },
        splitOutcome: { status: "proposed", source: "runtime_budget", sourceRunId: run.id },
      });
      expect(reviewed.splitOutcome?.childCardIds).toHaveLength(1);
      const child = store.getProjectBoardCard(reviewed.splitOutcome!.childCardIds[0]);
      expect(child).toMatchObject({
        status: "draft",
        candidateStatus: "needs_clarification",
        blockedBy: [],
      });
      expect(child.labels).toEqual(expect.arrayContaining(["runtime-split-follow-up", "derived-from-parent"]));
      expect(child.clarificationQuestions).toEqual([
        'Confirm this runtime-budget follow-up accurately captures the remaining scope for "Runtime split progress marker" before ticketizing it.',
      ]);

      const resolved = store.resolveProjectBoardSplitDecision({ cardId: reviewed.id, action: "approve_split" });
      expect(resolved.splitOutcome).toMatchObject({ status: "approved" });
      expect(store.getProjectBoardCard(child.id).candidateStatus).toBe("needs_clarification");
    } finally {
      store.close();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

class RuntimeSplitFakeRuntime {
  private aborted = false;

  constructor(
    private readonly store: ProjectStore,
    private readonly workspacePath: string,
  ) {}

  async send(input: SendMessageInput, hooks: AgentRuntimeSendHooks = {}): Promise<void> {
    expect(input.content.indexOf("Project-board task action protocol")).toBeGreaterThanOrEqual(0);
    expect(input.content.indexOf("Project-board task action protocol")).toBeLessThan(input.content.indexOf("Execute the project-board card and report proof."));
    expect(input.content).toContain("mandatory durable progress/proof checkpoints");
    expect(input.content).toContain("Your first observable board action");
    expect(input.content).toContain("Before reading files, editing files, or running shell commands");
    await writeFile(join(this.workspacePath, "src", "runtime-split-progress.ts"), 'export const runtimeSplitCheckpoint = "created-before-budget";\n', "utf8");
    await writeFile(
      join(this.workspacePath, "test", "runtime-split-progress.test.ts"),
      'import { runtimeSplitCheckpoint } from "../../src/runtime-split-progress";\n\nif (!runtimeSplitCheckpoint) throw new Error("missing checkpoint");\n',
      "utf8",
    );
    this.store.addMessage({
      threadId: input.threadId,
      role: "assistant",
      content: [
        "Created the runtime split marker and a focused test before continuing broader work.",
        "",
        "```task_actions",
        JSON.stringify([
          {
            actionId: "runtime-split-progress",
            action: "task_heartbeat",
            summary: "Created the runtime split marker before the runtime budget stopped the run.",
            completed: ["Created src/runtime-split-progress.ts.", "Created test/runtime-split-progress.test.ts."],
            remaining: ["Run the focused test and finish broader cleanup."],
            changedFiles: ["src/runtime-split-progress.ts", "test/runtime-split-progress.test.ts"],
          },
        ]),
        "```",
      ].join("\n"),
      metadata: { status: "streaming" },
    });
    hooks.onActivity?.();
    while (!this.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      hooks.onActivity?.();
    }
    this.store.addMessage({
      threadId: input.threadId,
      role: "assistant",
      content: "Runtime budget abort observed after the checkpoint files were created.",
      metadata: { status: "aborted" },
    });
  }

  async abort(_threadId: string): Promise<void> {
    this.aborted = true;
  }
}

async function writeWorkflow(projectRoot: string): Promise<void> {
  await writeFile(
    join(projectRoot, "WORKFLOW.md"),
    [
      "---",
      "version: 1",
      "tracker:",
      "  active_states: [todo, ready, in_progress]",
      "  review_states: [review]",
      "  terminal_states: [done, canceled, duplicate]",
      "orchestration:",
      "  poll_interval_ms: 30000",
      "  max_concurrent_agents: 1",
      "  max_turns: 2",
      "  stall_timeout_ms: 600000",
      "  auto_dispatch: false",
      "workspace:",
      "  strategy: git-worktree",
      "  root: .ambient-codex/orchestration/workspaces",
      "  branch_prefix: dogfood/",
      "  cleanup_terminal_workspaces: false",
      "  reuse_existing: true",
      "agent:",
      "  permission_mode: full-access",
      "  thinking_level: low",
      "proof_of_work:",
      "  require_tests: true",
      "  require_diff_summary: true",
      "  require_screenshots: false",
      "---",
      "Execute the project-board card and report proof.",
    ].join("\n"),
    "utf8",
  );
}

function forceRuntimeBudget(store: ProjectStore, charterId: string, maxRuntimeMsPerCard: number): void {
  type TestSqliteDb = { prepare: (sql: string) => { run: (...args: unknown[]) => void } };
  (store as unknown as { requireDb: () => TestSqliteDb })
    .requireDb()
    .prepare("UPDATE project_board_charters SET status = 'active', budget_policy_json = ? WHERE id = ?")
    .run(JSON.stringify({ maxPassesPerCard: 6, maxRuntimeMsPerCard, pauseOnTerminalBlocker: true }), charterId);
}

async function waitFor(read: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (read()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for runtime split dogfood condition.");
}
