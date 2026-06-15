import { describe, expect, it } from "vitest";
import { initialWorkflowDiscoveryQuestions, workflowDiscoveryAnswerText, workflowDiscoveryGraph } from "./workflowDiscovery";
import type { WorkflowDiscoveryQuestion } from "./types";

describe("workflow discovery model", () => {
  it("creates planner-style initial questions across scope, data, and model role", () => {
    const questions = initialWorkflowDiscoveryQuestions({
      workflowThreadId: "thread-1",
      request: "Summarize local markdown notes weekly.",
      projectPath: "/project",
      intelligence: {
        contextSummary: "Discovery scan: 2 candidate files (.md, .csv).\nPlugin tools: Fixture tool.",
        fileCandidates: ["notes.md", "events.csv"],
        connectorLabels: ["Local workspace"],
        pluginToolLabels: ["Fixture tool"],
        policyNotes: ["Metadata only."],
      },
    });

    expect(questions.map((question) => question.category)).toEqual(["scope", "data_sources", "model_role", "side_effects", "error_handling"]);
    expect(questions[0].choices.some((choice) => choice.recommended)).toBe(true);
    expect(questions.every((question) => question.allowFreeform)).toBe(true);
    expect(questions[0].context).toContain("/project");
    expect(questions[1].context).toContain("Metadata only");
    expect(questions[1].choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "base-directory", description: expect.stringContaining("notes.md") }),
        expect.objectContaining({ id: "connectors", description: expect.stringContaining("Fixture tool") }),
      ]),
    );
  });

  it("projects discovery answers onto a workflow graph", () => {
    const questions: WorkflowDiscoveryQuestion[] = initialWorkflowDiscoveryQuestions({
      workflowThreadId: "thread-1",
      request: "Summarize local markdown notes weekly.",
      projectPath: "/project",
    }).map((question, index) => ({
      ...question,
      id: `question-${index}`,
      workflowThreadId: "thread-1",
      createdAt: "2026-05-02T00:00:00.000Z",
      answer: index === 0 ? { choiceId: question.choices[0].id, answeredAt: "2026-05-02T00:00:01.000Z" } : undefined,
    }));

    const graph = workflowDiscoveryGraph({
      workflowThreadId: "thread-1",
      request: "Summarize local markdown notes weekly.",
      questions,
    });

    expect(graph.summary).toBe("Discovery in progress (1/5).");
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "scope", runState: "completed" }),
        expect.objectContaining({ id: "data-sources", runState: "active" }),
        expect.objectContaining({ id: "side-effects", runState: "pending" }),
        expect.objectContaining({ id: "error-handling", runState: "pending" }),
      ]),
    );
    expect(workflowDiscoveryAnswerText(questions[0])).toBe("Manual briefing");
  });

  it("creates revision-specific questions and lets newer revision answers drive graph labels", () => {
    const initialQuestion: WorkflowDiscoveryQuestion = {
      ...initialWorkflowDiscoveryQuestions({
        workflowThreadId: "thread-1",
        request: "Summarize local markdown notes weekly.",
        projectPath: "/project",
      })[0],
      id: "initial-scope",
      workflowThreadId: "thread-1",
      createdAt: "2026-05-02T00:00:00.000Z",
      answer: { choiceId: "manual-report", answeredAt: "2026-05-02T00:00:01.000Z" },
    };
    const revisionQuestions = initialWorkflowDiscoveryQuestions({
      workflowThreadId: "thread-1",
      request: "Add low-confidence review.",
      projectPath: "/project",
      revisionContext: {
        baseTitle: "Weekly Notes",
        baseGoal: "Summarize notes.",
        requestedChange: "Add low-confidence review.",
      },
    }).map((question, index): WorkflowDiscoveryQuestion => ({
      ...question,
      id: `revision-${index}`,
      workflowThreadId: "thread-1",
      revisionId: "revision-1",
      createdAt: "2026-05-02T00:00:02.000Z",
      answer: index === 0 ? { choiceId: "expanded-scope", answeredAt: "2026-05-02T00:00:03.000Z" } : undefined,
    }));

    const graph = workflowDiscoveryGraph({
      workflowThreadId: "thread-1",
      request: "Summarize local markdown notes weekly.\n\nRevision request:\nAdd low-confidence review.",
      questions: [initialQuestion, ...revisionQuestions],
    });

    expect(revisionQuestions.map((question) => question.category)).toEqual(["scope", "data_sources", "model_role", "side_effects", "error_handling"]);
    expect(revisionQuestions[0].question).toContain("What should change");
    expect(revisionQuestions[0].context).toContain("Revision target: Weekly Notes");
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "scope", description: "Expanded scope" }),
        expect.objectContaining({ id: "data-sources", runState: "active" }),
      ]),
    );
  });
});
