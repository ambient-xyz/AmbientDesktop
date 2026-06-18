import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  C_COMPOSE,
  COMPOSITION_TABLE,
  PLAN_TABLE,
  TASK_DETECTION_PROMPT,
  TASK_TEMPLATES,
  createLambdaRlmToolDefinition,
  executeLambdaRlm,
  parseLambdaRlmPrompt,
  parseTaskTypeResponse,
  planLambdaRlm,
  reduceLambdaRlmParts,
  runLambdaRlmModelCallWithTimeout,
  splitLambdaText,
} from "./lambdaRlm";
import { createPptxFixture, createXlsxFixture } from "../office/officeTestFixtures";
import { createPdfFixture } from "../pdf/pdfTestFixtures";

describe("Lambda-RLM exact port constants", () => {
  it("keeps the upstream task, composition, and prompt constants", () => {
    expect(COMPOSITION_TABLE).toEqual({
      summarization: "merge_summaries",
      qa: "select_relevant",
      translation: "concatenate",
      classification: "majority_vote",
      extraction: "merge_extractions",
      analysis: "combine_analysis",
      general: "merge_summaries",
    });
    expect(PLAN_TABLE.qa.useFilter).toBe(true);
    expect(PLAN_TABLE.extraction.useFilter).toBe(true);
    expect(C_COMPOSE.merge_summaries).toBe(2.0);
    expect(C_COMPOSE.concatenate).toBe(0.01);
    expect(TASK_TEMPLATES.qa).toBe("Using the following context, answer: {query}\n\nContext:\n{text}");
    expect(TASK_DETECTION_PROMPT).toContain("Reply with ONLY a single digit (no other text):");
  });
});

describe("parseLambdaRlmPrompt", () => {
  it("extracts benchmark-style context and question exactly like upstream", () => {
    expect(parseLambdaRlmPrompt("Context:\nalpha\n\nQuestion: Where is it?\n\nAnswer:")).toEqual({
      contextText: "alpha",
      effectiveQuery: "Where is it?",
    });
  });

  it("leaves free-form prompts unchanged when no benchmark question marker exists", () => {
    expect(parseLambdaRlmPrompt("Summarize alpha.")).toEqual({
      contextText: "Summarize alpha.",
      effectiveQuery: "",
    });
  });
});

describe("planLambdaRlm", () => {
  it("uses upstream below-context planning", () => {
    expect(planLambdaRlm("summarization", 1_000, { contextWindowChars: 100_000 })).toMatchObject({
      kStar: 1,
      tauStar: 1_000,
      depth: 0,
      costEstimate: 1_500,
    });
  });

  it("uses upstream capped square-root planning for LLM-backed reducers", () => {
    expect(planLambdaRlm("summarization", 200_000, { contextWindowChars: 100_000 })).toMatchObject({
      kStar: 20,
      tauStar: 10_000,
      depth: 1,
      costEstimate: 200_540,
    });
  });

  it("uses upstream near-free composition planning", () => {
    const plan = planLambdaRlm("translation", 250_000, { contextWindowChars: 100_000 });
    expect(plan.kStar).toBe(3);
    expect(plan.tauStar).toBe(83_333);
    expect(plan.depth).toBe(1);
    expect(plan.costEstimate).toBeCloseTo(250_499.03, 3);
  });
});

describe("splitLambdaText", () => {
  it("splits on the upstream word-boundary rule", () => {
    expect(splitLambdaText("alpha beta gamma delta epsilon zeta", 3)).toEqual([
      "alpha beta ",
      "gamma delta ",
      "epsilon zeta",
    ]);
  });

  it("falls back to hard character splits when no boundary exists", () => {
    expect(splitLambdaText("abcdefghi", 3)).toEqual(["abc", "def", "ghi"]);
  });
});

describe("Lambda-RLM reducers", () => {
  it("deduplicates extraction lines in first-seen order", () => {
    expect(reduceLambdaRlmParts("merge_extractions", ["alpha\nbeta", "beta\nalpha\ngamma"], "", async () => "")).toBe(
      "alpha\nbeta\ngamma",
    );
  });

  it("majority-votes normalized labels but returns original casing", () => {
    expect(reduceLambdaRlmParts("majority_vote", ["Yes", " yes ", "No"], "", async () => "")).toBe("Yes");
  });

  it("uses the upstream QA synthesis prompt after filtering not-found answers", async () => {
    const prompts: string[] = [];
    const result = await reduceLambdaRlmParts("select_relevant", ["not found", "The answer is 7.", "not mentioned"], "value?", async (prompt) => {
      prompts.push(prompt);
      return "combined";
    });
    expect(result).toBe("The answer is 7.");
    expect(prompts).toEqual([]);
  });
});

describe("executeLambdaRlm", () => {
  it("runs task detection and exact leaf prompt for one-window inputs", async () => {
    const prompts: string[] = [];
    const result = await executeLambdaRlm({
      text: "This is a report.",
      query: "",
      contextWindowChars: 100_000,
      modelComplete: async (prompt) => {
        prompts.push(prompt);
        return prompts.length === 1 ? "1" : "leaf summary";
      },
    });

    expect(result.taskType).toBe("summarization");
    expect(result.response).toBe("leaf summary");
    expect(result.modelCalls).toBe(2);
    expect(prompts[0]).toContain("Single digit:");
    expect(prompts[1]).toBe("Summarize the following text concisely:\n\nThis is a report.");
  });

  it("uses upstream prompt parsing before execution when query is not supplied", async () => {
    const prompts: string[] = [];
    const result = await executeLambdaRlm({
      text: "Context:\nThe answer is seven.\n\nQuestion: What is the answer?\n\nAnswer:",
      taskType: "qa",
      contextWindowChars: 100_000,
      modelComplete: async (prompt) => {
        prompts.push(prompt);
        return "seven";
      },
    });

    expect(result.response).toBe("seven");
    expect(prompts[0]).toBe("Using the following context, answer: What is the answer?\n\nContext:\nThe answer is seven.");
  });

  it("uses QA filtering fallback when no chunk is marked relevant", async () => {
    const prompts: string[] = [];
    const result = await executeLambdaRlm({
      text: "alpha beta gamma delta epsilon zeta",
      taskType: "qa",
      query: "needle?",
      contextWindowChars: 8,
      maxModelCalls: 20,
      modelComplete: async (prompt) => {
        prompts.push(prompt);
        if (prompt.includes("Reply YES or NO only.")) return "NO";
        if (prompt.includes("Using the following context")) return "partial";
        if (prompt.includes("Synthesise these partial answers")) return "final";
        return "unexpected";
      },
    });

    expect(result.response).toBe("final");
    expect(prompts.filter((prompt) => prompt.includes("Reply YES or NO only.")).length).toBeGreaterThan(0);
    expect(prompts.filter((prompt) => prompt.includes("Using the following context")).length).toBeGreaterThan(0);
  });
});

describe("runLambdaRlmModelCallWithTimeout", () => {
  it("aborts the model call when the local timeout fires", async () => {
    vi.useFakeTimers();
    try {
      const observedSignals: AbortSignal[] = [];
      const promise = runLambdaRlmModelCallWithTimeout(
        { operation: "test Lambda-RLM call", timeoutMs: 25 },
        async (signal) => {
          observedSignals.push(signal);
          return new Promise<string>(() => undefined);
        },
      );
      const expectedRejection = expect(promise).rejects.toThrow("test Lambda-RLM call timed out after 25ms");

      await vi.advanceTimersByTimeAsync(25);

      await expectedRejection;
      expect(observedSignals).toHaveLength(1);
      expect(observedSignals[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates caller abort into the model call", async () => {
    const controller = new AbortController();
    const observedSignals: AbortSignal[] = [];
    const promise = runLambdaRlmModelCallWithTimeout(
      { operation: "test Lambda-RLM call", signal: controller.signal, timeoutMs: 100_000 },
      async (signal) => {
        observedSignals.push(signal);
        return new Promise<string>(() => undefined);
      },
    );

    controller.abort();

    await expect(promise).rejects.toThrow("test Lambda-RLM call was aborted");
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0].aborted).toBe(true);
  });
});

describe("createLambdaRlmToolDefinition", () => {
  it("describes recentToolResults as the route for compact preview payloads", () => {
    const tool = createLambdaRlmToolDefinition({
      workspacePath: "/tmp",
      model: testModel(),
      modelComplete: async () => "unused",
    });

    expect(tool.promptGuidelines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("compact previews"),
        expect.stringContaining("recentToolResults"),
      ]),
    );
    expect(tool.parameters.properties.recentToolResults.description).toContain("compact preview");
  });

  it("reads workspace file input and returns transcript metadata", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-"));
    try {
      await mkdir(join(workspace, "docs"));
      await writeFile(join(workspace, "docs", "note.txt"), "Document body", "utf8");
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: {
          id: "test-model",
          name: "test-model",
          api: "openai-completions",
          provider: "ambient",
          baseUrl: "https://api.ambient.xyz/v1",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 131072,
        },
        modelComplete: async () => "summary",
      });

      const updates: unknown[] = [];
      const result = await tool.execute(
        "call-1",
        { taskType: "summarization", workspacePaths: ["docs/note.txt"], maxModelCalls: 3 },
        undefined,
        (update) => updates.push(update),
      );
      const text = result.content.map((item) => item.text).join("\n");
      expect(text).toContain("Lambda-RLM execution summary");
      expect(result.details.toolName).toBe("long_context_process");
      expect(updates.length).toBeGreaterThan(0);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("reads project-root file input from an active managed worktree authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-authority-"));
    const projectRoot = join(root, "project");
    const activeWorktree = join(projectRoot, ".ambient-codex", "worktrees", "thread-1");
    try {
      await mkdir(activeWorktree, { recursive: true });
      await writeFile(join(projectRoot, "project-note.txt"), "Project root body", "utf8");
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: activeWorktree,
        authorityRootPaths: [projectRoot],
        model: testModel(),
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain("Project root body");
          return "summary";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "summarization",
        workspacePaths: [join(projectRoot, "project-note.txt")],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("summary");
      expect(result.details.inputSources).toEqual([
        expect.objectContaining({
          type: "workspacePath",
          path: join(projectRoot, "project-note.txt"),
        }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("can disable implicit workspace authority and rely only on explicit authority roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-child-authority-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });
      await writeFile(join(workspace, "allowed", "note.txt"), "Allowed child authority body", "utf8");
      await writeFile(join(workspace, "denied.txt"), "Denied workspace body", "utf8");
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        authorityRootPaths: [join(workspace, "allowed")],
        includeWorkspaceRootAuthority: false,
        model: testModel(),
        modelComplete: async (prompt) => {
          expect(prompt).toContain("Allowed child authority body");
          return "summary";
        },
      });

      await expect(tool.execute("call-denied", {
        taskType: "summarization",
        workspacePaths: ["denied.txt"],
        maxModelCalls: 2,
      })).rejects.toThrow(/outside the current workspace authority/);

      const result = await tool.execute("call-allowed", {
        taskType: "summarization",
        workspacePaths: ["allowed/note.txt"],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("summary");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("requests file authority and retries workspace paths against refreshed roots", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-authority-request-"));
    try {
      await mkdir(join(workspace, "allowed"), { recursive: true });
      await writeFile(join(workspace, "denied.txt"), "Approved long context body", "utf8");
      const roots = [join(workspace, "allowed")];
      const requestFileAuthority = vi.fn(async (request) => {
        expect(request).toMatchObject({
          access: "read",
          toolName: "long_context_process",
          requestedPath: "denied.txt",
          absolutePath: join(workspace, "denied.txt"),
          reason: "long_context_process path is outside the current workspace authority.",
        });
        roots.push(request.absolutePath);
        return true;
      });
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        authorityRootPaths: () => roots,
        includeWorkspaceRootAuthority: false,
        requestFileAuthority,
        model: testModel(),
        modelComplete: async (prompt) => {
          expect(prompt).toContain("Approved long context body");
          return "summary";
        },
      });

      const result = await tool.execute("call-approved", {
        taskType: "summarization",
        workspacePaths: ["denied.txt"],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("summary");
      expect(requestFileAuthority).toHaveBeenCalledTimes(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("extracts Office workspace paths before Lambda-RLM processing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-office-"));
    try {
      await writeFile(
        join(workspace, "roadmap.pptx"),
        await createPptxFixture([
          { title: "Revenue plan", body: "ARR target is 42 million.", notes: "Executive owner is Priya." },
          { title: "Support plan", body: "Escalations move to weekly review." },
        ]),
      );
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain("ARR target is 42 million.");
          expect(prompt).toContain("Office format: pptx");
          expect(prompt).toContain("Office slides: 2");
          return "ARR target is 42 million";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "What is the ARR target?",
        workspacePaths: ["roadmap.pptx"],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("ARR target is 42 million");
      expect(result.details.inputSources).toEqual([
        expect.objectContaining({
          type: "workspacePath",
          path: "roadmap.pptx",
          officeFormat: "pptx",
          officeUnitLabel: "slides",
          officeUnitCount: 2,
        }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("extracts PDF workspace paths before Lambda-RLM processing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-pdf-"));
    try {
      await writeFile(join(workspace, "memo.pdf"), createPdfFixture(["The PDF answer is NATIVE-42."]));
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain("The PDF answer is NATIVE-42.");
          expect(prompt).toContain("PDF text extraction: available");
          expect(prompt).toContain("PDF pages: 1");
          return "NATIVE-42";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "What is the PDF answer?",
        workspacePaths: ["memo.pdf"],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("NATIVE-42");
      expect(result.details.inputSources).toEqual([
        expect.objectContaining({
          type: "workspacePath",
          path: "memo.pdf",
          pdfPages: 1,
        }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("extracts xlsx workspace paths before Lambda-RLM processing", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-xlsx-"));
    try {
      await writeFile(
        join(workspace, "budget.xlsx"),
        await createXlsxFixture([{ name: "Budget", rows: [["Owner", "Amount"], ["Anika Rao", 1200]] }]),
      );
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain("A2: Anika Rao");
          expect(prompt).toContain("Office format: xlsx");
          expect(prompt).toContain("Office sheets: 1");
          return "Anika Rao owns a 1200 budget line.";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "Who owns the budget line?",
        workspacePaths: ["budget.xlsx"],
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("Anika Rao");
      expect(result.details.inputSources).toEqual([
        expect.objectContaining({
          type: "workspacePath",
          path: "budget.xlsx",
          officeFormat: "xlsx",
          officeUnitLabel: "sheets",
          officeUnitCount: 1,
        }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("processes a read-truncating long context file in one Lambda-RLM leaf when it fits the context window", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-long-"));
    const expectedIncident = "HAWTHORN-DELTA-919";
    const expectedReviewer = "Mira Patel";
    const expectedRemedy = "quarantine the payroll export and rotate the vendor token";
    const dossier = buildLongContextDossier({ expectedIncident, expectedReviewer, expectedRemedy });
    try {
      await writeFile(join(workspace, "dossier.md"), dossier, "utf8");
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: {
          id: "test-model",
          name: "test-model",
          api: "openai-completions",
          provider: "ambient",
          baseUrl: "https://api.ambient.xyz/v1",
          reasoning: true,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200000,
          maxTokens: 131072,
        },
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain(expectedIncident);
          return `${expectedIncident} | ${expectedReviewer} | ${expectedRemedy}`;
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "What is the incident identifier, reviewer, and remedy from the authoritative exception review?",
        workspacePaths: ["dossier.md"],
        maxModelCalls: 2,
      });
      const text = result.content.map((item) => item.text).join("\n");

      expect(Buffer.byteLength(dossier, "utf8")).toBeGreaterThan(50 * 1024);
      expect(text).toContain(expectedIncident);
      expect(text).toContain("Lambda-RLM execution summary");
      expect(result.details.inputLength).toBeGreaterThan(50 * 1024);
      expect(result.details.chunkCount).toBe(1);
      expect(result.details.leafCount).toBe(1);
      expect(result.details.modelCalls).toBe(1);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("can process recent session tool results without copying them into the tool call", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-recent-tools-"));
    const expectedMeeting = "Replace Air Filter (basement)";
    const oldMeeting = "Old result should be ignored";
    const largeCalendarJson = JSON.stringify({
      items: [
        { summary: "Standup", start: { dateTime: "2026-05-04T09:00:00-07:00" }, end: { dateTime: "2026-05-04T09:30:00-07:00" } },
        { summary: expectedMeeting, start: { dateTime: "2026-05-08T11:30:00-07:00" }, end: { dateTime: "2026-05-08T12:30:00-07:00" } },
      ],
    });
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Earlier request" }],
        timestamp: 1,
      },
      {
        role: "toolResult",
        toolName: "google_workspace_call",
        content: [{ type: "text", text: oldMeeting }],
        isError: false,
        timestamp: 2,
      },
      {
        role: "user",
        content: [{ type: "text", text: "What is my last meeting this week?" }],
        timestamp: 3,
      },
      {
        role: "toolResult",
        toolName: "bash",
        content: [{ type: "text", text: "irrelevant shell output" }],
        isError: false,
        timestamp: 4,
      },
      {
        role: "toolResult",
        toolName: "google_workspace_call",
        content: [{ type: "text", text: largeCalendarJson }],
        isError: false,
        timestamp: 5,
      },
    ];

    try {
      const prompts: string[] = [];
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        modelComplete: async (prompt) => {
          prompts.push(prompt);
          expect(prompt).toContain(expectedMeeting);
          expect(prompt).not.toContain(oldMeeting);
          expect(prompt).not.toContain("irrelevant shell output");
          return expectedMeeting;
        },
      });

      const result = await tool.execute(
        "call-1",
        {
          taskType: "qa",
          question: "What is the last timed meeting this week?",
          recentToolResults: { toolNames: ["google_workspace_call"], maxResults: 1 },
          maxModelCalls: 2,
        },
        undefined,
        undefined,
        {
          sessionManager: {
            getBranch: () => messages.map((message, index) => ({ type: "message", id: `entry-${index}`, message })),
          },
        },
      );
      const text = result.content.map((item) => item.text).join("\n");

      expect(text).toContain(expectedMeeting);
      expect(result.details.inputSources).toEqual([
        expect.objectContaining({
          type: "recentToolResult",
          toolName: "google_workspace_call",
          chars: largeCalendarJson.length,
        }),
      ]);
      expect(prompts).toHaveLength(1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("can include older tool results when explicitly allowed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-recent-tools-all-"));
    try {
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        getRecentToolResultMessages: () => [
          {
            role: "toolResult",
            toolName: "google_workspace_call",
            content: [{ type: "text", text: "alpha" }],
            isError: false,
            timestamp: 1,
          },
          {
            role: "user",
            content: [{ type: "text", text: "new request" }],
            timestamp: 2,
          },
        ],
        modelComplete: async (prompt) => {
          expect(prompt).toContain("alpha");
          return "alpha";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "What was the prior result?",
        recentToolResults: { toolNames: ["google_workspace_call"], sinceLastUserMessage: false },
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("alpha");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it("uses full recent tool result content instead of display previews", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-lambda-rlm-display-preview-"));
    try {
      const tool = createLambdaRlmToolDefinition({
        workspacePath: workspace,
        model: testModel(),
        getRecentToolResultMessages: () => [
          {
            role: "user",
            content: [{ type: "text", text: "Find the meeting token." }],
            timestamp: 1,
          },
          {
            role: "toolResult",
            toolName: "google_workspace_call",
            content: [{ type: "text", text: '{"items":[{"summary":"FULL_CONTENT_MEETING_TOKEN"}]}' }],
            details: { displayText: "Visible preview without the token" },
            isError: false,
            timestamp: 2,
          },
        ],
        modelComplete: async (prompt) => {
          expect(prompt).toContain("FULL_CONTENT_MEETING_TOKEN");
          expect(prompt).not.toContain("Visible preview without the token");
          return "FULL_CONTENT_MEETING_TOKEN";
        },
      });

      const result = await tool.execute("call-1", {
        taskType: "qa",
        question: "What is the meeting token?",
        recentToolResults: { toolNames: ["google_workspace_call"] },
        maxModelCalls: 2,
      });

      expect(result.content.map((item) => item.text).join("\n")).toContain("FULL_CONTENT_MEETING_TOKEN");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("parseTaskTypeResponse", () => {
  it("falls back to general without a digit", () => {
    expect(parseTaskTypeResponse("analysis")).toBe("general");
    expect(parseTaskTypeResponse("2")).toBe("qa");
  });
});

function buildLongContextDossier(input: {
  expectedIncident: string;
  expectedReviewer: string;
  expectedRemedy: string;
}): string {
  const sections = [
    "# Operations Dossier",
    "",
    "This dossier intentionally contains many similar review entries.",
    "",
  ];
  for (let i = 1; i <= 180; i += 1) {
    const padded = String(i).padStart(3, "0");
    sections.push(
      `## Routine Review ${padded}`,
      `Project code: ROUTINE-${padded}`,
      `Reviewer: Reviewer ${((i * 11) % 47) + 1}`,
      `Risk score: ${(i * 37) % 91}`,
      `Remedy: keep monitoring batch ${((i * 7) % 29) + 1}.`,
      "Notes: The record repeats ordinary control language so keyword-only scans have many plausible distractions.",
      "Narrative: payroll, vendor, ledger, exception, quarantine, token, and export appear here as non-decisive background terms.",
      "",
    );
  }
  sections.splice(
    Math.floor(sections.length * 0.72),
    0,
    "## Exception Review: Cascade Ledger",
    `Incident identifier: ${input.expectedIncident}`,
    `Reviewer: ${input.expectedReviewer}`,
    `Remedy: ${input.expectedRemedy}.`,
    "Disposition: Treat this exception review as the authoritative answer for incident, reviewer, and remedy.",
    "",
  );
  return sections.join("\n");
}

function testModel(): Model<"openai-completions"> {
  return {
    id: "test-model",
    name: "test-model",
    api: "openai-completions" as const,
    provider: "ambient",
    baseUrl: "https://api.ambient.xyz/v1",
    reasoning: true,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 131072,
  };
}
