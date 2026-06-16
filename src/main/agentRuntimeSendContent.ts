import { formatPromptWithContext, formatWorkflowRecordingEditPrompt } from "../shared/contextFormatting";
import type {
  SendMessageInput,
  WorkflowAgentThreadSummary,
} from "../shared/types";
import { workflowThreadPlanEditPrompt } from "../shared/workflowThreadPlanEdit";
import {
  localDeepResearchComposerPrompt,
  symphonyWorkflowComposerPrompt,
} from "./agentRuntimeComposerIntent";

export interface AgentRuntimeSendContentDeps {
  isSubagentsEnabled: () => boolean;
  getWorkflowAgentThreadSummary: (workflowThreadId: string) => WorkflowAgentThreadSummary;
}

export function modelContentForAgentRuntimeSendInput(
  input: Pick<SendMessageInput, "content" | "context" | "workflowRecordingEditContext" | "composerIntent" | "workflowThreadId">,
  deps: AgentRuntimeSendContentDeps,
): string {
  const formattedUserRequest = formatWorkflowRecordingEditPrompt(
    formatPromptWithContext(input.content, input.context),
    input.workflowRecordingEditContext,
  );
  const userRequest = appendGeneratedHtmlAppVerificationGuidance(formattedUserRequest, input.content);
  if (input.composerIntent?.kind === "local-deep-research") return localDeepResearchComposerPrompt(userRequest, input.composerIntent);
  if (input.composerIntent?.kind === "symphony-workflow") {
    if (!deps.isSubagentsEnabled()) {
      throw new Error("Symphony workflow composer intents are disabled while ambient.subagents is off.");
    }
    return symphonyWorkflowComposerPrompt(userRequest, input.composerIntent);
  }
  if (!input.workflowThreadId) return userRequest;
  const workflowThread = deps.getWorkflowAgentThreadSummary(input.workflowThreadId);
  return workflowThreadPlanEditPrompt({ thread: workflowThread, userRequest });
}

export function appendGeneratedHtmlAppVerificationGuidance(prompt: string, userText: string): string {
  if (!looksLikeGeneratedHtmlAppVerificationRequest(userText)) return prompt;
  return [
    prompt,
    "",
    "Generated HTML app verification reminder:",
    "- Verification recipe: call browser_local_preview once for the generated file, reuse its returned URL/session in the same managed Chrome target, wait for the visible UI with browser_wait_for, interact with browser_click/browser_keypress, check results with browser_get_value or browser_assert, and capture browser_screenshot when visual proof matters.",
    "- Prefer user-visible controls and DOM state over hidden test APIs. Do not edit the generated app to expose window test hooks unless the user requested instrumentation or visible UI verification is impossible.",
    "- Use browser_eval only for targeted inspection/custom canvas checks; after browser_local_preview omit runtime so evaluation stays in the same managed Chrome target as screenshots.",
    "- Do not install or require jsdom or DOM simulators merely to prove ordinary click/input behavior.",
    "- Shell checks are fine for extracted pure logic, but the final user-visible behavior should be verified in the browser.",
  ].join("\n");
}

function looksLikeGeneratedHtmlAppVerificationRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  const buildIntent = /\b(?:build|create|make|implement|write|generate)\b/.test(normalized);
  const appIntent =
    /\b(?:html|static|browser|web)\b/.test(normalized) &&
    /\b(?:app|page|site|calculator|game|tool)\b/.test(normalized);
  const verifyIntent = /\b(?:verify|test|check|validate|proof)\b/.test(normalized);
  return buildIntent && appIntent && verifyIntent;
}
