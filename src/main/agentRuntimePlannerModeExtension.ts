import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { ThreadSummary } from "../shared/types";
import type { WorkflowPlanEditIntentKind } from "../shared/workflowThreadPlanEdit";
import {
  isPlannerModeAllowedTool,
  plannerModeToolsForWorkflowPlanEditIntent,
  PLANNER_MODE_ALLOWED_TOOLS,
  PLANNER_MODE_DIRECT_ACTIVE_TOOLS,
} from "./plannerMode";

const PLANNER_MODE_CONTEXT_CUSTOM_TYPE = "ambient-planner-mode-context";

export const PLANNER_MODE_SYSTEM_PROMPT = `Ambient Planner Mode is active.

Planner Mode is read-only. Inspect the workspace and visible web pages as needed, but do not edit files, run tests, install dependencies, start servers, change git state, submit forms, log in, or mutate browser/app state.

Available tools are limited to read-only workspace inspection, safe local shell inspection, and visible browser navigation/content/screenshot tools. Use browser_nav only for research or visual inspection; use the isolated browser profile unless the user explicitly leaves Planner Mode.

Workflow Agent Plan/Edit exception: workflow_native proposal and validation tools may create local, review-only workflow revision records. workflow_update_run_settings may also be used with action preview_foreground because it only previews one-off foreground run limits and does not persist settings. These tools do not apply revisions, run workflows, restore versions, mutate generated files directly, or touch external services.

End with a concrete implementation plan. Include ordered stages, files/modules likely to change, tests or validation to run after leaving Planner Mode, risks, and open questions.

When a user-facing choice would materially affect implementation, include Ambient Desktop native planner decision questions in exactly one fenced ambient-planner-questions JSON block. Native Planner questions only render if they are emitted as that fenced block. Do not write ambient-planner-questions as a heading, label, XML tag, or plain text. Do not use a generic \`\`\`json fence for native questions. If the user explicitly asks you to ask questions, asks for a specific number of decisions, or asks not to proceed without user input, treat that as a hard output contract and include the native question block even if one option seems obvious. Each question should have id, question, recommendedOptionId, required, and 2-3 mutually exclusive options. Put the recommended option first and give every option a description with the practical tradeoff. Do not include a Custom option; Ambient Desktop will add Custom in the UI.

Do not duplicate native planner decision questions in the plan body. Ambient Desktop will render the fenced block as one-at-a-time multiple choice UI with custom answer support.

Before sending, verify the response contains exactly one native question block when questions are needed: the opening line is exactly \`\`\`ambient-planner-questions, the next non-empty line starts the JSON object with {, and the block closes with \`\`\`. If that self-check fails, fix the response before sending.

Use this shape exactly when questions are needed:
\`\`\`ambient-planner-questions
{
  "questions": [
    {
      "id": "short-stable-id",
      "question": "Which implementation route should Ambient plan around?",
      "recommendedOptionId": "recommended-route",
      "required": true,
      "options": [
        {
          "id": "recommended-route",
          "label": "Recommended route",
          "description": "Why this is the practical default and what tradeoff it makes."
        },
        {
          "id": "alternate-route",
          "label": "Alternate route",
          "description": "When this is better and what it costs."
        }
      ]
    }
  ]
}
\`\`\``;

export interface PlannerModeExtensionOptions {
  threadId: string;
  getThread: (threadId: string) => Pick<ThreadSummary, "collaborationMode">;
  getPlanEditIntentKind: () => WorkflowPlanEditIntentKind | undefined;
}

export function createPlannerModeExtension(options: PlannerModeExtensionOptions): ExtensionFactory {
  return (pi) => {
    let normalTools: string[] | undefined;

    const configureActiveTools = () => {
      const thread = options.getThread(options.threadId);
      const activeTools = pi.getActiveTools();
      if (!normalTools || activeTools.some((tool) => !isPlannerModeAllowedTool(tool))) {
        normalTools = activeTools;
      }
      if (thread.collaborationMode === "planner") {
        const registeredToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
        const plannerTools = (normalTools ?? activeTools).filter((tool) => isPlannerModeAllowedTool(tool));
        for (const tool of PLANNER_MODE_DIRECT_ACTIVE_TOOLS) {
          if (registeredToolNames.has(tool)) plannerTools.push(tool);
        }
        pi.setActiveTools(
          plannerModeToolsForWorkflowPlanEditIntent([...new Set(plannerTools)], options.getPlanEditIntentKind()),
        );
      } else if (normalTools) {
        pi.setActiveTools(normalTools);
      }
    };

    (pi as any).on("session_start", async () => {
      configureActiveTools();
    });

    (pi as any).on("context", async (event: any) => {
      if (options.getThread(options.threadId).collaborationMode === "planner") return undefined;
      if (!Array.isArray(event.messages)) return undefined;
      return {
        messages: event.messages.filter((message: any) => message?.customType !== PLANNER_MODE_CONTEXT_CUSTOM_TYPE),
      };
    });

    (pi as any).on("before_agent_start", async (event: any) => {
      configureActiveTools();
      if (options.getThread(options.threadId).collaborationMode !== "planner") return undefined;
      return {
        systemPrompt: `${event.systemPrompt}\n\n${PLANNER_MODE_SYSTEM_PROMPT}`,
        message: {
          customType: PLANNER_MODE_CONTEXT_CUSTOM_TYPE,
          content: `[AMBIENT PLANNER MODE ACTIVE]\nAllowed tools: ${PLANNER_MODE_ALLOWED_TOOLS.join(", ")}.\nDo not mutate files, git state, running processes, browser sessions, accounts, or external services. Produce a plan only.`,
          display: false,
        },
      };
    });
  };
}
