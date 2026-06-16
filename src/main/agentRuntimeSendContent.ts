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
  const userRequest = appendSelectedContextSubagentDelegationGuidance(
    appendGeneratedHtmlAppVerificationGuidance(formattedUserRequest, input.content, deps),
    input,
    deps,
  );
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

function appendSelectedContextSubagentDelegationGuidance(
  prompt: string,
  input: Pick<SendMessageInput, "content" | "context" | "composerIntent" | "workflowThreadId">,
  deps: Pick<AgentRuntimeSendContentDeps, "isSubagentsEnabled">,
): string {
  if (input.composerIntent || input.workflowThreadId) return prompt;
  if (!deps.isSubagentsEnabled()) return prompt;
  const contextFiles = (input.context ?? []).filter((item) => item.kind === "file" && item.path);
  if (contextFiles.length < 3) return prompt;
  if (!looksLikeSelectedFileComparisonRequest(input.content)) return prompt;
  return [
    prompt,
    "",
    "Selected-context sub-agent delegation contract:",
    "- This request asks for synthesis across several selected local files. Because ambient.subagents is enabled, use a visible map-reduce shape: spawn one required read-only explorer child per file or logical slice, wait on all required children with wait_agent, then synthesize in the parent.",
    "- The parent may inspect enough context to plan child slices, but should not directly read/process every selected file to complete this comparison unless child launch is explicitly unavailable or the user asks for direct parent-only work.",
    "- For each file-read child, use least-privilege childAuthority: taskIntent file_read, readPaths limited to the exact selected file path, mutation deny, network deny, and nestedFanout deny. Do not give write access for read-only comparison work.",
    "- If a child fails, times out, or needs approval, resolve the wait barrier or ask the user through the parent instead of silently doing the child's required work in the parent.",
    "- Selected files for likely child slices: " + contextFiles.map((item) => item.path).join(", "),
  ].join("\n");
}

function looksLikeSelectedFileComparisonRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  const readIntent = /\b(?:read|inspect|review|summarize|extract|compare|analyze|audit)\b/.test(normalized);
  const synthesisIntent = /\b(?:agree|contradict|conflict|compare|consistent|inconsistent|differences?|same|across|synthesis|summarize|summary|verify)\b/.test(normalized);
  const documentIntent = /\b(?:document|documents|docs|files?|attachments?|selected context)\b/.test(normalized);
  return readIntent && synthesisIntent && documentIntent;
}

export function appendGeneratedHtmlAppVerificationGuidance(
  prompt: string,
  userText: string,
  deps: Pick<AgentRuntimeSendContentDeps, "isSubagentsEnabled"> = { isSubagentsEnabled: () => false },
): string {
  if (!looksLikeGeneratedHtmlAppVerificationRequest(userText)) return prompt;
  const lines = [
    prompt,
    "",
    "Generated HTML app verification reminder:",
    "- Verification recipe: call browser_local_preview once for the generated file, reuse its returned URL/session in the same managed Chrome target, wait for the visible UI with browser_wait_for, interact with browser_click/browser_keypress, check results with browser_get_value or browser_assert, and capture browser_screenshot when visual proof matters.",
    "- Prefer user-visible controls and DOM state over hidden test APIs. Do not edit the generated app to expose window test hooks unless the user requested instrumentation or visible UI verification is impossible.",
    "- Use browser_eval only for targeted inspection/custom canvas checks; after browser_local_preview omit runtime so evaluation stays in the same managed Chrome target as screenshots.",
    "- Do not install or require jsdom or DOM simulators merely to prove ordinary click/input behavior.",
    "- Shell checks are fine for extracted pure logic, but the final user-visible behavior should be verified in the browser.",
  ];
  if (deps.isSubagentsEnabled() && looksLikeSelfHealingHtmlAppRequest(userText)) {
    lines.push(
      "",
      "Self-healing sub-agent verification contract:",
      "- Because ambient.subagents is enabled and this request asks to keep checking or repairing until ready, use visible read-only reviewer/tester children for objective verification between repair attempts.",
      "- If a mutating worker cannot launch because isolated worktree support is unavailable, the parent may create or repair the requested artifact inside the allowed workspace, but must still spawn and wait on reviewer/tester children before final synthesis.",
      "- Do not substitute parent-only browser or shell testing for the child reviewer path unless child launch is explicitly rejected; record the rejection and recover with a child role/tool scope that can inspect the artifact safely.",
    );
  }
  return lines.join("\n");
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

function looksLikeSelfHealingHtmlAppRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(?:keep checking|repair|repairing|self-heal|self healing|until it seems ready|actually use|tester|edge cases?)\b/.test(normalized);
}
