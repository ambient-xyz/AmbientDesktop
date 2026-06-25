import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PLANNER_DURABLE_REVISION_PROMPT_MARKER } from "./agentRuntimePlannerFinalizationPrompt";
import { AgentRuntimePlannerFinalizationController } from "./agentRuntimePlannerFinalizationController";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

function createController(store: ProjectStore) {
  return new AgentRuntimePlannerFinalizationController({
    store,
    durableBrowserValidator: async ({ staticValidation }) => staticValidation,
    refreshBrowsersForArtifactChange: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
    emit: vi.fn(),
    commitGitPaths: vi.fn(async () => ({ committed: true })),
  });
}

describe("AgentRuntimePlannerFinalizationController", () => {
  it("uses the run-start Planner Mode snapshot when the thread mode changes before finalization", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-planner-mode-snapshot-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("Planner mode snapshot").id, { collaborationMode: "planner" });
      const finalMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: [
          "# Snapshot Plan",
          "",
          "Answer the captured decision before implementation.",
          "",
          "```ambient-planner-questions",
          "{",
          '  "questions": [',
          "    {",
          '      "id": "route",',
          '      "question": "Which route should the implementation take?",',
          '      "recommendedOptionId": "small",',
          '      "required": true,',
          '      "options": [',
          '        { "id": "small", "label": "Small", "description": "Keep the first implementation narrow." },',
          '        { "id": "broad", "label": "Broad", "description": "Cover more cases with more validation risk." }',
          "      ]",
          "    }",
          "  ]",
          "}",
          "```",
        ].join("\n"),
      });
      store.updateThreadSettings(thread.id, { collaborationMode: "agent" });
      const controller = createController(store);

      const result = await controller.createPlannerPlanArtifactFromMessage(finalMessage, { startedInPlannerMode: true });

      expect(result?.eventType).toBe("created");
      expect(result?.artifact.decisionQuestions).toEqual([
        expect.objectContaining({
          id: "route",
          question: "Which route should the implementation take?",
          recommendedOptionId: "small",
          required: true,
        }),
      ]);
      expect(result?.message.content).not.toContain("ambient-planner-questions");
      expect(result?.message.metadata).toMatchObject({
        kind: "planner-plan",
        plannerPlanArtifactId: result?.artifact.id,
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("completes the source artifact when planner finalization creates a durable artifact", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-planner-finalization-source-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("Planner finalization").id, { collaborationMode: "planner" });
      const sourceMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "# Initial Plan\n\nPick a route.",
      });
      const sourceArtifact = store.createPlannerPlanArtifact({
        threadId: thread.id,
        sourceMessageId: sourceMessage.id,
        title: "Initial Plan",
        summary: "Pick a route.",
        content: "# Initial Plan\n\nPick a route.",
        steps: [{ id: "step-1", title: "Build the selected route." }],
        openQuestions: [],
        risks: [],
        verification: ["Run tests."],
        decisionQuestions: [
          {
            id: "route",
            question: "Which route?",
            recommendedOptionId: "small",
            required: true,
            options: [
              { id: "small", label: "Small", description: "Small route." },
              { id: "large", label: "Large", description: "Large route." },
            ],
            answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:00.000Z" },
          },
        ],
      });
      const finalizing = store.updatePlannerPlanArtifact(sourceArtifact.id, { workflowState: "finalizing" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: [
          "Refine the Planner Mode plan in this same thread using the decisions below. Keep planning only; do not implement yet.",
          "",
          `Source artifact id: ${sourceArtifact.id}`,
          "Plan: Initial Plan",
          "",
          "Durable plan output:",
          "- Produce the final durable plan only. Do not edit files, run implementation commands, or start coding.",
        ].join("\n"),
      });
      const finalMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "# Final Plan\n\nShip the selected route.\n\n## Steps\n\n1. Build the selected route.\n\n## Verification\n\n- Run tests.",
      });
      const controller = createController(store);

      const result = await controller.createPlannerPlanArtifactFromMessage(finalMessage);

      expect(result?.artifact.durableArtifactPath).toMatch(/^\.ambient\/board\/plans\/.+-DurablePlan\.html$/);
      expect(result?.relatedArtifacts).toEqual([
        expect.objectContaining({
          id: sourceArtifact.id,
          status: "superseded",
          workflowState: "answers_complete",
          finalizationAttempt: expect.objectContaining({
            id: finalizing.finalizationAttempt?.id,
            status: "completed",
            completedAt: expect.any(String),
          }),
        }),
      ]);
      expect(store.getPlannerPlanArtifact(sourceArtifact.id).finalizationAttempt).toMatchObject({
        id: finalizing.finalizationAttempt?.id,
        status: "completed",
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("keeps answered-decision finalization on the existing planner artifact", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-planner-finalization-revision-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("Planner decision finalization").id, { collaborationMode: "planner" });
      const sourceMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: "# Initial Plan\n\nPick a route.",
      });
      const sourceArtifact = store.createPlannerPlanArtifact({
        threadId: thread.id,
        sourceMessageId: sourceMessage.id,
        title: "Initial Plan",
        summary: "Pick a route.",
        content: [
          "# Initial Plan",
          "",
          "Pick a route.",
          "",
          "## Implementation Phases",
          "",
          "- Build the generic route.",
          "",
          "## Verification Plan",
          "",
          "- Run tests.",
        ].join("\n"),
        steps: [{ id: "step-1", title: "Build the generic route." }],
        openQuestions: [],
        risks: [],
        verification: ["Run tests."],
        decisionQuestions: [
          {
            id: "route",
            question: "Which route?",
            recommendedOptionId: "small",
            required: true,
            options: [
              { id: "small", label: "Small", description: "Small route." },
              { id: "large", label: "Large", description: "Large route." },
            ],
            answer: { kind: "option", optionId: "small", answeredAt: "2026-05-01T00:00:00.000Z" },
          },
        ],
      });
      const finalizing = store.updatePlannerPlanArtifact(sourceArtifact.id, { workflowState: "finalizing" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: [
          PLANNER_DURABLE_REVISION_PROMPT_MARKER,
          "Revise the existing durable Planner Mode plan in this same thread.",
          "",
          `Artifact id: ${sourceArtifact.id}`,
          "Current durable path: not generated yet",
          "Plan: Initial Plan",
          "",
          "User feedback:",
          "Apply the answered Planner decisions to the current plan and prepare it for durable rendering.",
          "",
          "Durable revision output:",
          "- Return exactly one `ambient-planner-revision` fenced JSON block and no surrounding prose.",
        ].join("\n"),
      });
      const finalMessage = store.addMessage({
        threadId: thread.id,
        role: "assistant",
        content: [
          "```ambient-planner-revision",
          "{",
          '  "mode": "targeted_edit",',
          `  "artifactId": ${JSON.stringify(sourceArtifact.id)},`,
          '  "summary": "Applied the selected small route.",',
          '  "operations": [',
          "    {",
          '      "op": "replace_section",',
          '      "heading": "Implementation Phases",',
          '      "markdown": "- Build the selected small route."',
          "    }",
          "  ]",
          "}",
          "```",
        ].join("\n"),
      });
      const controller = createController(store);

      const result = await controller.createPlannerPlanArtifactFromMessage(finalMessage);
      const updated = store.getPlannerPlanArtifact(sourceArtifact.id);

      expect(result?.eventType).toBe("updated");
      expect(result?.artifact.id).toBe(sourceArtifact.id);
      expect(store.listPlannerPlanArtifacts(thread.id).map((artifact) => artifact.id)).toEqual([sourceArtifact.id]);
      expect(updated.content).toContain("Build the selected small route.");
      expect(updated.durableArtifactPath).toMatch(/^\.ambient\/board\/plans\/.+-DurablePlan\.html$/);
      expect(updated.finalizationAttempt).toMatchObject({
        id: finalizing.finalizationAttempt?.id,
        status: "completed",
        completedAt: expect.any(String),
      });
      expect(result?.message.metadata).toMatchObject({
        plannerPlanArtifactId: sourceArtifact.id,
        plannerDurableRevisionOfArtifactId: sourceArtifact.id,
      });
      const durableHtml = await readFile(join(workspacePath, updated.durableArtifactPath!), "utf8");
      expect(durableHtml).toContain("Build the selected small route.");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
