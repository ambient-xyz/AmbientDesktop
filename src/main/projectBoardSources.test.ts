import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DURABLE_PLAN_SOURCE_AUTHORITY_REASON,
  GENERATED_REPORT_SOURCE_AUTHORITY_REASON,
  GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON,
  hashProjectBoardSourceContent,
  projectBoardSourceIncludedInSynthesis,
  projectBoardSourceKey,
} from "./projectBoardSourceIdentity";
import {
  classifyProjectBoardConfigPath,
  classifyProjectBoardSourcePath,
  scanMarkdownSources,
  scanProjectBoardSources,
  scanProjectConfigSources,
  scanProjectGitStateSource,
  scanProjectStructuredDataSources,
  durablePlanSemanticSourceExcerpt,
  isGeneratedReportArtifactSource,
  isGeneratedWorkflowScaffoldingSource,
  sourceExcerpt,
  summarizeGitState,
  summarizeText,
} from "./projectBoardSources";
import type { ProjectStore } from "./projectStore";

const execFileAsync = promisify(execFile);

const GENERATED_LOCAL_TASK_WORKFLOW = `---
version: 1
tracker:
  kind: local
  active_states: [ready]
terminal_states: [done, canceled, duplicate]
orchestration:
  auto_dispatch: true
---
Work on Local Task {{ task.identifier }} in {{ workspace.path }}.

Description:
{{ task.description }}
`;

describe("projectBoardSources", () => {
  let workspacePath = "";

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), "ambient-board-sources-"));
  });

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true });
  });

  it("classifies source paths by project-management role", () => {
    expect(classifyProjectBoardSourcePath("docs/architecture.md").kind).toBe("architecture_artifact");
    expect(classifyProjectBoardSourcePath("PRD.md").kind).toBe("functional_spec");
    expect(classifyProjectBoardSourcePath("kanbanImplementationPhases.md").kind).toBe("implementation_plan");
    expect(classifyProjectBoardSourcePath("WORKFLOW.md").kind).toBe("workflow_artifact");
    expect(classifyProjectBoardSourcePath("AGENTS.md", "# Agent Notes\n\nPrefer live Ambient validation.").kind).toBe("workflow_artifact");
    expect(classifyProjectBoardConfigPath("package.json")?.kind).toBe("implementation_file");
    expect(classifyProjectBoardConfigPath("vitest.config.ts")?.kind).toBe("test_artifact");
    expect(classifyProjectBoardConfigPath("src/app.ts")).toBeUndefined();
  });

  it("summarizes markdown without headings and excessive whitespace", () => {
    expect(summarizeText("# App\n\n\nBuild a focused project board.\n\n- Keep it tight.")).toBe(
      "App Build a focused project board. - Keep it tight.",
    );
  });

  it("keeps a synthesis excerpt separate from the short UI summary", async () => {
    const content = [
      "# THE LAST VECTOR",
      "",
      "A browser space RPG with PixiJS rendering, Matter.js physics, hybrid Newtonian movement, active shields, charge attacks, enemy factions, mothership bosses, and mission progression.",
      "",
      "The implementation should preserve the detailed mechanics instead of collapsing the project into generic setup work.",
    ].join("\n");
    await writeFile(join(workspacePath, "GAME_DESIGN_DOCUMENT.md"), content, "utf8");

    const [source] = await scanMarkdownSources(workspacePath);

    expect(source.summary.length).toBeLessThanOrEqual(220);
    expect(source.sourceKey).toBe("file:GAME_DESIGN_DOCUMENT.md");
    expect(source.contentHash).toBe(hashProjectBoardSourceContent(content));
    expect(source.byteSize).toBe(Buffer.byteLength(content, "utf8"));
    expect(source.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(source.classifiedBy).toBe("fallback_heuristic");
    expect(source.classificationReason).toContain("Fallback path/content classifier selected");
    expect(source.authorityRole).toBe("primary");
    expect(source.includeInSynthesis).toBe(true);
    expect(source.excerpt).toContain("hybrid Newtonian movement");
    expect(source.excerpt).toContain("mothership bosses");
    expect(sourceExcerpt("a".repeat(25_000))).toContain("characters omitted from middle of source");
  });

  it("extracts source-plan text from durable HTML before building source excerpts", () => {
    const html = [
      "<!doctype html>",
      "<html><body>",
      '<section id="executive-summary"><p>Wrapper summary only.</p></section>',
      '<section id="source-plan"><pre>',
      "A full-stack web application with User Authentication, transaction DB, balance algorithm, and Notifications.",
      "</pre></section>",
      "</body></html>",
    ].join("\n");

    const excerpt = durablePlanSemanticSourceExcerpt(html);

    expect(excerpt).toContain("full-stack web application");
    expect(excerpt).toContain("User Authentication");
    expect(excerpt).toContain("Notifications");
    expect(excerpt).not.toContain("<!doctype html>");
  });

  it("builds stable source keys with thread identity preferred over latest message identity", () => {
    expect(projectBoardSourceKey({ path: "./docs/plan.md" })).toBe("file:docs/plan.md");
    expect(projectBoardSourceKey({ artifactId: "artifact-1", threadId: "thread-1" })).toBe("artifact:artifact-1");
    expect(projectBoardSourceKey({ threadId: "thread-1", messageId: "message-latest" })).toBe("thread:thread-1");
  });

  it("scans markdown files while ignoring generated dependency folders", async () => {
    await writeFile(join(workspacePath, "architecture.md"), "# Architecture\n\nSystem design.", "utf8");
    await writeFile(join(workspacePath, "requirements.md"), "# Requirements\n\nAcceptance criteria.", "utf8");
    await mkdir(join(workspacePath, "node_modules"), { recursive: true });
    await writeFile(join(workspacePath, "node_modules", "ignored.md"), "# Ignored", "utf8");
    await mkdir(join(workspacePath, "test-results", "project-board-dogfood"), { recursive: true });
    await writeFile(join(workspacePath, "test-results", "project-board-dogfood", "README.md"), "# Requirements\n\nAcceptance criteria.", "utf8");
    await mkdir(join(workspacePath, ".ambient", "cli-packages", "imported", "fixture"), { recursive: true });
    await writeFile(join(workspacePath, ".ambient", "cli-packages", "imported", "fixture", "README.md"), "# Imported package", "utf8");
    await mkdir(join(workspacePath, ".ambient", "board", "planner-workspaces", "run-1"), { recursive: true });
    await writeFile(join(workspacePath, ".ambient", "board", "planner-workspaces", "run-1", "plan.md"), "# Generated plan", "utf8");

    const sources = await scanMarkdownSources(workspacePath);

    expect(sources.map((source) => source.path)).toEqual(["architecture.md", "requirements.md"]);
    expect(sources.map((source) => source.kind)).toEqual(["architecture_artifact", "functional_spec"]);
  });

  it("scans mixed project-management docs for board kickoff context", async () => {
    await mkdir(join(workspacePath, "docs"), { recursive: true });
    await writeFile(join(workspacePath, "AGENTS.md"), "# Agent Notes\n\nPrefer live Ambient validation for agent behavior.", "utf8");
    await writeFile(join(workspacePath, "docs", "architecture.md"), "# Architecture\n\nSystem design and data model.", "utf8");
    await writeFile(join(workspacePath, "docs", "product-spec.md"), "# Product Spec\n\nAcceptance criteria for the board.", "utf8");
    await writeFile(join(workspacePath, "docs", "phase-plan.md"), "# Phase Plan\n\nMilestone roadmap and todo list.", "utf8");

    const sources = await scanMarkdownSources(workspacePath);

    expect(sources.map((source) => [source.path, source.kind, source.relevance])).toEqual([
      ["AGENTS.md", "workflow_artifact", 88],
      ["docs/architecture.md", "architecture_artifact", 86],
      ["docs/phase-plan.md", "implementation_plan", 82],
      ["docs/product-spec.md", "functional_spec", 84],
    ]);
  });

  it("demotes generated Local Task workflow scaffolding until the user promotes it", async () => {
    await writeFile(join(workspacePath, "PROJECT.md"), "# Project\n\nBuild the unit converter CLI.", "utf8");
    await writeFile(join(workspacePath, "WORKFLOW.md"), GENERATED_LOCAL_TASK_WORKFLOW, "utf8");
    await mkdir(join(workspacePath, "docs"), { recursive: true });
    await writeFile(join(workspacePath, "docs", "WORKFLOW.md"), "# Workflow\n\nUser-authored delivery workflow notes.", "utf8");

    const sources = await scanMarkdownSources(workspacePath);

    expect(sources.map((source) => source.path).sort()).toEqual(["PROJECT.md", "WORKFLOW.md", "docs/WORKFLOW.md"]);
    expect(sources.find((source) => source.path === "WORKFLOW.md")).toMatchObject({
      kind: "workflow_artifact",
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: expect.stringContaining(GENERATED_WORKFLOW_SOURCE_AUTHORITY_REASON),
    });
    expect(projectBoardSourceIncludedInSynthesis(sources.find((source) => source.path === "WORKFLOW.md")!)).toBe(false);
    expect(sources.find((source) => source.path === "docs/WORKFLOW.md")).toMatchObject({
      kind: "workflow_artifact",
      includeInSynthesis: true,
    });
    expect(isGeneratedWorkflowScaffoldingSource("WORKFLOW.md", "# Workflow\n\nGenerated by Ambient.\n\n## Workflow scaffold")).toBe(true);
  });

  it("demotes generated health report artifacts until the user promotes them", async () => {
    await mkdir(join(workspacePath, "reports"), { recursive: true });
    await writeFile(
      join(workspacePath, "reports", "workspace-health-report.md"),
      [
        "# Workspace Health Report",
        "",
        "Generated by Ambient.",
        "",
        "Generated report artifact for source health.",
        "",
        "Findings:",
        "- Add deterministic smoke coverage for source promotion.",
        "- Capture skipped checks before ticketization.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(workspacePath, "reports", "manual-review.md"), "# Manual Review\n\nUser-authored follow-up report.", "utf8");

    const sources = await scanMarkdownSources(workspacePath);
    const generatedReport = sources.find((source) => source.path === "reports/workspace-health-report.md");
    const manualReport = sources.find((source) => source.path === "reports/manual-review.md");

    expect(generatedReport).toMatchObject({
      kind: "report_artifact",
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: expect.stringContaining(GENERATED_REPORT_SOURCE_AUTHORITY_REASON),
    });
    expect(projectBoardSourceIncludedInSynthesis(generatedReport!)).toBe(false);
    expect(manualReport).toMatchObject({
      kind: "report_artifact",
      includeInSynthesis: true,
      authorityRole: "supporting",
    });
    expect(isGeneratedReportArtifactSource("reports/workspace-health-report.md", "# Workspace Health Report\n\nGenerated by Ambient.")).toBe(true);
  });

  it("scans file sources from the requested board project path instead of the active store workspace", async () => {
    const boardWorkspacePath = await mkdtemp(join(tmpdir(), "ambient-board-target-"));
    try {
      await writeFile(join(workspacePath, "WRONG.md"), "# Wrong\n\nThis belongs to the active app workspace.", "utf8");
      await writeFile(join(boardWorkspacePath, "ASTEROIDS.md"), "# Asteroids clone\n\nCanvas arcade game requirements.", "utf8");
      const fakeStore = {
        getWorkspace: () => ({ path: workspacePath }),
        listThreads: () => [],
        listAutomationThreadChatIds: () => [],
        listMessages: () => [],
        listPlannerPlanArtifacts: () => [],
      } as unknown as ProjectStore;

      const sources = await scanProjectBoardSources(fakeStore, { workspacePath: boardWorkspacePath });

      expect(sources.map((source) => source.path).filter(Boolean)).toContain("ASTEROIDS.md");
      expect(sources.map((source) => source.path).filter(Boolean)).not.toContain("WRONG.md");
    } finally {
      await rm(boardWorkspacePath, { recursive: true, force: true });
    }
  });

  it("scopes chat and planner artifact sources to the requested board thread", async () => {
    const fakeStore = {
      getWorkspace: () => ({ path: workspacePath }),
      listThreads: () => [
        { id: "markdown-thread", title: "Markdown Previewer", lastMessagePreview: "Markdown app." },
        { id: "expense-thread", title: "Expense Splitter", lastMessagePreview: "Expense app." },
      ],
      listAutomationThreadChatIds: () => [],
      listMessages: (threadId: string) =>
        threadId === "markdown-thread"
          ? [
              {
                id: "markdown-message",
                threadId,
                role: "user",
                content: "Create a markdown previewer.",
                createdAt: "2026-06-09T00:00:00.000Z",
              },
            ]
          : [
              {
                id: "expense-message",
                threadId,
                role: "user",
                content: "Create an expense splitter with accounts and notifications.",
                createdAt: "2026-06-09T00:00:00.000Z",
              },
            ],
      listPlannerPlanArtifacts: (threadId: string) =>
        threadId === "markdown-thread"
          ? [
              {
                id: "markdown-artifact",
                threadId,
                sourceMessageId: "markdown-message",
                status: "ready",
                workflowState: "durable_ready",
                title: "Markdown Previewer plan",
                summary: "Markdown only.",
                content: "# Markdown Previewer",
                steps: [],
                openQuestions: [],
                risks: [],
                verification: [],
                diagrams: [],
                warnings: [],
                decisionQuestions: [],
                createdAt: "2026-06-09T00:00:00.000Z",
                updatedAt: "2026-06-09T00:00:00.000Z",
              },
            ]
          : [
              {
                id: "expense-artifact",
                threadId,
                sourceMessageId: "expense-message",
                status: "ready",
                workflowState: "durable_ready",
                title: "Expense Splitter plan",
                summary: "Expense only.",
                content: "# Expense Splitter",
                steps: [],
                openQuestions: [],
                risks: [],
                verification: [],
                diagrams: [],
                warnings: [],
                decisionQuestions: [],
                createdAt: "2026-06-09T00:00:00.000Z",
                updatedAt: "2026-06-09T00:00:00.000Z",
              },
            ],
    } as unknown as ProjectStore;

    const sources = await scanProjectBoardSources(fakeStore, { workspacePath, threadId: "markdown-thread" });

    expect(sources.map((source) => source.threadId).filter(Boolean)).toEqual(["markdown-thread", "markdown-thread"]);
    expect(sources.map((source) => source.title)).toContain("Markdown Previewer");
    expect(sources.map((source) => source.title)).toContain("Markdown Previewer plan");
    expect(sources.map((source) => source.title)).not.toContain("Expense Splitter");
    expect(sources.map((source) => source.title)).not.toContain("Expense Splitter plan");
  });

  it("scans durable planner artifacts from explicit .ambient/board plan paths without generic .ambient markdown scanning", async () => {
    const durablePath = ".ambient/board/plans/Planner-DurablePlan.html";
    const durableHtml = "<!doctype html><html><body><h1>Durable planner output</h1></body></html>";
    await mkdir(join(workspacePath, ".ambient", "board", "plans"), { recursive: true });
    await writeFile(join(workspacePath, durablePath), durableHtml, "utf8");
    await writeFile(join(workspacePath, ".ambient", "board", "plans", "ignored.md"), "# Generic ambient markdown should stay ignored", "utf8");
    await mkdir(join(workspacePath, "docs"), { recursive: true });
    await writeFile(join(workspacePath, "docs", "headless-ui-qa-handoff.md"), "# WebGL spaceship game\n\nBuild a Three.js game.", "utf8");
    await writeFile(join(workspacePath, "package.json"), `${JSON.stringify({ name: "unrelated-repo", scripts: { test: "vitest" } }, null, 2)}\n`, "utf8");
    await mkdir(join(workspacePath, "fixtures"), { recursive: true });
    await writeFile(join(workspacePath, "fixtures", "qa.csv"), "feature,status\nanalytics,done\n", "utf8");
    await execFileAsync("git", ["init", workspacePath]);
    await execFileAsync("git", ["-C", workspacePath, "add", "package.json"]);
    await execFileAsync("git", ["-C", workspacePath, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "init"]);
    await writeFile(join(workspacePath, "unrelated.txt"), "changed\n", "utf8");
    const fakeStore = {
      getWorkspace: () => ({ path: workspacePath }),
      listThreads: () => [
        {
          id: "thread-1",
          title: "Planning thread",
          lastMessagePreview: "Plan ready.",
        },
      ],
      listAutomationThreadChatIds: () => [],
      listMessages: () => [
        {
          id: "message-1",
          threadId: "thread-1",
          role: "user",
          content: "Please turn this durable plan into a board.",
          createdAt: "2026-05-11T00:00:00.000Z",
        },
      ],
      listPlannerPlanArtifacts: () => [
        {
          id: "artifact-1",
          threadId: "thread-1",
          sourceMessageId: "message-1",
          status: "ready",
          workflowState: "durable_ready",
          durableArtifactPath: durablePath,
          durableArtifactGeneratedAt: "2026-05-11T00:00:00.000Z",
          title: "Planner durable plan",
          summary: "Explicit durable plan source.",
          content: "# Durable planner output",
          steps: [],
          openQuestions: [],
          risks: [],
          verification: [],
          diagrams: [],
          warnings: [],
          decisionQuestions: [],
          createdAt: "2026-05-11T00:00:00.000Z",
          updatedAt: "2026-05-11T00:00:00.000Z",
        },
      ],
    } as unknown as ProjectStore;

    const sources = await scanProjectBoardSources(fakeStore, { workspacePath });
    const planSource = sources.find((source) => source.artifactId === "artifact-1");
    const threadSource = sources.find((source) => source.threadId === "thread-1" && source.kind === "thread");
    const unrelatedSources = sources.filter(
      (source) =>
        source.path === "docs/headless-ui-qa-handoff.md" ||
        source.path === "package.json" ||
        source.path === "fixtures/qa.csv" ||
        source.kind === "git_state",
    );

    expect(sources.map((source) => source.path)).not.toContain(".ambient/board/plans/ignored.md");
    expect(planSource).toMatchObject({
      kind: "plan_artifact",
      path: durablePath,
      sourceKey: `file:${durablePath}`,
      contentHash: hashProjectBoardSourceContent(durableHtml),
      byteSize: Buffer.byteLength(durableHtml, "utf8"),
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(unrelatedSources.length).toBe(4);
    for (const source of unrelatedSources) {
      expect(source).toMatchObject({
        authorityRole: "ignored",
        includeInSynthesis: false,
        classificationReason: expect.stringContaining(DURABLE_PLAN_SOURCE_AUTHORITY_REASON),
      });
      expect(projectBoardSourceIncludedInSynthesis(source)).toBe(false);
    }
    expect(threadSource).toMatchObject({
      kind: "thread",
      authorityRole: "ignored",
      includeInSynthesis: false,
      classificationReason: expect.stringContaining(DURABLE_PLAN_SOURCE_AUTHORITY_REASON),
    });
  });

  it("scans package and test config sources for board kickoff context", async () => {
    await writeFile(
      join(workspacePath, "package.json"),
      `${JSON.stringify({ name: "board-fixture", scripts: { test: "vitest", build: "tsc" } }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(workspacePath, "vitest.config.ts"), "export default { test: { include: ['src/**/*.test.ts'] } };\n", "utf8");
    await writeFile(join(workspacePath, "src.ts"), "export const implementation = true;\n", "utf8");
    await mkdir(join(workspacePath, ".ambient", "board"), { recursive: true });
    await writeFile(join(workspacePath, ".ambient", "board", "generated.json"), JSON.stringify({ generated: true }), "utf8");

    const sources = await scanProjectConfigSources(workspacePath);

    expect(sources.map((source) => [source.path, source.kind, source.title])).toEqual([
      ["package.json", "implementation_file", "Package: board-fixture"],
      ["vitest.config.ts", "test_artifact", "vitest.config.ts"],
    ]);
    expect(sources[0].summary).toContain("Scripts: test, build");
  });

  it("scans bounded structured data fixtures for board source provenance", async () => {
    await mkdir(join(workspacePath, "data"), { recursive: true });
    await writeFile(
      join(workspacePath, "data", "expenses.csv"),
      "date,employee,category,merchant,amount,currency,notes\n2026-05-01,Avery,travel,Metro Rail,18.25,USD,client meeting\n",
      "utf8",
    );
    await mkdir(join(workspacePath, "node_modules"), { recursive: true });
    await writeFile(join(workspacePath, "node_modules", "ignored.csv"), "name,value\nignored,true\n", "utf8");

    const sources = await scanProjectStructuredDataSources(workspacePath);

    expect(sources.map((source) => source.path)).toEqual(["data/expenses.csv"]);
    expect(sources[0]).toMatchObject({
      kind: "functional_spec",
      title: "Data: expenses.csv",
      sourceKey: "file:data/expenses.csv",
      contentHash: hashProjectBoardSourceContent(
        "date,employee,category,merchant,amount,currency,notes\n2026-05-01,Avery,travel,Metro Rail,18.25,USD,client meeting\n",
      ),
      authorityRole: "supporting",
      includeInSynthesis: true,
    });
    expect(sources[0].summary).toContain("CSV structured data input with columns date,employee,category,merchant,amount,currency,notes and 1 data row");
    expect(sources[0].excerpt).toContain("Metro Rail");

    const fakeStore = {
      getWorkspace: () => ({ path: workspacePath }),
      listThreads: () => [],
      listAutomationThreadChatIds: () => [],
      listMessages: () => [],
      listPlannerPlanArtifacts: () => [],
    } as unknown as ProjectStore;
    const aggregateSources = await scanProjectBoardSources(fakeStore, { workspacePath });
    expect(aggregateSources.map((source) => source.path).filter(Boolean)).toContain("data/expenses.csv");
  });

  it("summarizes git state as a project board source", async () => {
    await execFileAsync("git", ["init", workspacePath]);
    await writeFile(join(workspacePath, "README.md"), "# Fixture\n", "utf8");
    await execFileAsync("git", ["-C", workspacePath, "add", "README.md"]);
    await execFileAsync("git", ["-C", workspacePath, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "init"]);
    await writeFile(join(workspacePath, "README.md"), "# Fixture\n\nChanged.\n", "utf8");
    await writeFile(join(workspacePath, "untracked.txt"), "new\n", "utf8");

    const source = await scanProjectGitStateSource(workspacePath);

    expect(source).toMatchObject({
      kind: "git_state",
      title: "Git working tree",
      relevance: 78,
    });
    expect(source?.summary).toContain("Last commit:");
    expect(source?.summary).toContain("Changed files: README.md, untracked.txt.");
    expect(summarizeGitState("main", "abc123 init", "")).toBe("Branch: main. Last commit: abc123 init. Working tree clean.");
  });

  it("omits generated Local Task workflow scaffolding from git source summaries", async () => {
    await execFileAsync("git", ["init", workspacePath]);
    await writeFile(join(workspacePath, "PROJECT.md"), "# Fixture\n", "utf8");
    await execFileAsync("git", ["-C", workspacePath, "add", "PROJECT.md"]);
    await execFileAsync("git", ["-C", workspacePath, "-c", "user.name=Ambient Test", "-c", "user.email=ambient@example.test", "commit", "-m", "init"]);
    await writeFile(join(workspacePath, "PROJECT.md"), "# Fixture\n\nChanged.\n", "utf8");
    await writeFile(join(workspacePath, "WORKFLOW.md"), GENERATED_LOCAL_TASK_WORKFLOW, "utf8");

    const source = await scanProjectGitStateSource(workspacePath);

    expect(source?.summary).toContain("Changed files: PROJECT.md.");
    expect(source?.summary).not.toContain("WORKFLOW.md");
  });
});
