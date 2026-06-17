import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ProjectBoardCard } from "../shared/types";
import type { ProjectStore } from "./projectStore";
import {
  projectBoardNativeTaskToolDefinitions,
  projectBoardTaskToolActionFromNativeCall,
  projectBoardTaskToolActionWithNativeMetadata,
  projectBoardTaskToolNativeResultText,
  type ProjectBoardNativeTaskToolName,
} from "./project-board/projectBoardTaskTools";

export interface ProjectBoardTaskToolExtensionOptions {
  threadId: string;
  store: Pick<ProjectStore, "getProjectBoardCardForExecutionThread" | "listOrchestrationRuns" | "recordProjectBoardTaskToolAction">;
  now?: () => string;
}

export function createProjectBoardTaskToolExtension(options: ProjectBoardTaskToolExtensionOptions): ExtensionFactory {
  return (pi) => {
    const card = options.store.getProjectBoardCardForExecutionThread(options.threadId);
    if (!card) return;
    for (const definition of projectBoardNativeTaskToolDefinitions()) {
      pi.registerTool({
        ...definition,
        parameters: definition.parameters as any,
        executionMode: "sequential",
        execute: async (toolCallId, params, _signal, onUpdate) => {
          onUpdate?.({
            content: [{ type: "text", text: `Recording ${definition.label.toLowerCase()} for project-board card "${card.title}".` }],
            details: {
              runtime: "project-board-task",
              toolName: definition.name,
              status: "running",
              cardId: card.id,
            },
          });
          const now = options.now?.() ?? new Date().toISOString();
          const latestRun = options.store
            .listOrchestrationRuns(50)
            .find((run) => run.threadId === options.threadId && ["claimed", "prepared", "preparing", "running", "retry_queued"].includes(run.status)) ??
            options.store.listOrchestrationRuns(50).find((run) => run.threadId === options.threadId);
          const action = projectBoardTaskToolActionWithNativeMetadata(
            projectBoardTaskToolActionFromNativeCall(definition.name, params, {
              actionId: projectBoardNativeTaskActionId(definition.name, toolCallId),
              createdAt: now,
              cardId: card.id,
              taskId: card.orchestrationTaskId,
              runId: latestRun?.id,
            }),
            definition.name,
          );
          const recordedRun = latestRun
            ? options.store.recordProjectBoardTaskToolAction({
                runId: latestRun.id,
                cardId: card.id,
                taskId: card.orchestrationTaskId,
                action,
                toolName: definition.name,
                source: "native_tool",
              })
            : undefined;
          const contextText = action.action === "task_show" ? projectBoardTaskShowContextText(card) : undefined;
          return {
            content: [{ type: "text", text: projectBoardTaskToolNativeResultText(action, contextText) }],
            details: {
              runtime: "project-board-task",
              toolName: definition.name,
              status: "complete",
              action: action.action,
              actionId: action.actionId,
              cardId: card.id,
              taskId: card.orchestrationTaskId ?? "",
              runId: latestRun?.id ?? "",
              durablyRecorded: Boolean(recordedRun),
            },
          };
        },
      });
    }
  };
}

function projectBoardNativeTaskActionId(toolName: ProjectBoardNativeTaskToolName, toolCallId: string): string {
  const cleaned = `${toolName}-${toolCallId}`
    .replace(/[^A-Za-z0-9._:#-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 160);
  return cleaned || `${toolName}-${Date.now()}`;
}

function projectBoardTaskShowContextText(card: ProjectBoardCard): string {
  const testLines = [
    ...card.testPlan.unit.map((item) => `- Unit proof: ${item}`),
    ...card.testPlan.integration.map((item) => `- Integration proof: ${item}`),
    ...card.testPlan.visual.map((item) => `- Visual proof: ${item}`),
    ...card.testPlan.manual.map((item) => `- Manual proof: ${item}`),
  ];
  const feedbackLines = (card.runFeedback ?? []).map((item) => {
    const source = item.source === "decision_impact" ? "decision impact" : item.source === "proof_review" ? "proof review" : "manual";
    const decision = item.decisionQuestion ? ` (${item.decisionQuestion}${item.decisionAnswer ? ` -> ${item.decisionAnswer}` : ""})` : "";
    return `- ${source}${decision}: ${item.feedback}`;
  });
  return [
    "Current project-board card context",
    `Card id: ${card.id}`,
    `Title: ${card.title}`,
    card.description ? `Description:\n${card.description}` : undefined,
    card.acceptanceCriteria.length ? ["Acceptance criteria:", ...card.acceptanceCriteria.map((item) => `- ${item}`)].join("\n") : undefined,
    card.blockedBy.length ? ["Dependencies / blockers:", ...card.blockedBy.map((item) => `- ${item}`)].join("\n") : undefined,
    feedbackLines.length ? ["Next-run feedback / additive PM instructions:", ...feedbackLines].join("\n") : undefined,
    testLines.length ? ["Proof expectations:", ...testLines].join("\n") : undefined,
    card.sourceRefs?.length ? ["Source refs:", ...card.sourceRefs.map((ref) => `- ${ref}`)].join("\n") : undefined,
    card.clarificationQuestions?.length ? ["Clarification questions:", ...card.clarificationQuestions.map((question) => `- ${question}`)].join("\n") : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
