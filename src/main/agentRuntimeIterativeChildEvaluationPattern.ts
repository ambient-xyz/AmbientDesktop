import { AMBIENT_SUBAGENT_TOOL_NAME } from "./subagents/subagentPiTools";

const ITERATIVE_REVISION_PATTERNS = [
  /\biterat(?:e|ive|ion|ions)\b/i,
  /\bloop(?:s|ing)?\b/i,
  /\brounds?\b/i,
  /\bsuccessive\b/i,
  /\buntil\b/i,
  /\bplateau\b/i,
  /\brev(?:ise|ision|isions)\b/i,
  /\bimprov(?:e|es|ing|ement)\b/i,
];

const CHILD_EVALUATION_PATTERNS = [
  /\bsub[-\s]?agents?\b/i,
  /\bchild[-\s]?agents?\b/i,
  /\bfeedback\b/i,
  /\bjudge\b/i,
  /\bevaluator\b/i,
  /\bevaluate\b/i,
  /\bscore\b/i,
  /\breview(?:er)?\b/i,
  /\bcritic\b/i,
];

const MEASURABLE_HISTORY_PATTERNS = [
  /\bscore\b/i,
  /\bmetric\b/i,
  /\btable\b/i,
  /\bhistory\b/i,
  /\bversion\b/i,
  /\bdelta\b/i,
  /\bcounter\b/i,
  /\brationale\b/i,
  /\bprogress\b/i,
];

const STOP_CONDITION_PATTERNS = [
  /\bstop\b/i,
  /\bplateau\b/i,
  /\bmax(?:imum)?\b/i,
  /\battempts?\b/i,
  /\btime(?:out| limit)?\b/i,
  /\bminutes?\b/i,
  /\bfails? to improve\b/i,
  /\bnon[-\s]?improvements?\b/i,
];

export interface IterativeChildEvaluationPatternMatch {
  kind: "iterative_child_evaluation_loop";
  guidance: string;
}

export function detectIterativeChildEvaluationPattern(prompt: string): IterativeChildEvaluationPatternMatch | undefined {
  const text = stripProductSubagentPromptScaffolding(prompt);
  if (!matchesAny(text, ITERATIVE_REVISION_PATTERNS)) return undefined;
  if (!matchesAtLeast(text, CHILD_EVALUATION_PATTERNS, 2)) return undefined;
  if (!matchesAny(text, MEASURABLE_HISTORY_PATTERNS)) return undefined;
  if (!matchesAny(text, STOP_CONDITION_PATTERNS)) return undefined;
  return {
    kind: "iterative_child_evaluation_loop",
    guidance: iterativeChildEvaluationLoopGuidance(),
  };
}

export function stripProductSubagentPromptScaffolding(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .map((line) => {
      const withoutTaskPrefix = line.replace(/^\s*Sub-agent task:\s*/i, "");
      const withoutProtocolNames = withoutTaskPrefix
        .replace(/\bambient-subagent-[a-z0-9-]+\b/gi, "");
      const withoutChildRoleIdentity = stripProductChildRoleIdentity(withoutProtocolNames);
      if (isProductSubagentScaffoldLine(withoutChildRoleIdentity)) return "";
      return withoutChildRoleIdentity;
    })
    .join("\n");
}

function stripProductChildRoleIdentity(line: string): string {
  return line
    .replace(/\b(?:you are|act as)\s+(?:an?\s+|the\s+)?[^.\n]{0,80}\bsub[-\s]?agent\b(?:\s+for[^.\n]*)?[.:\-]?\s*/gi, "")
    .replace(/\bas\s+(?:an?\s+|the\s+)?[^.\n]{0,80}\bsub[-\s]?agent\b(?:\s+for[^.\n]*)?[,:\-]?\s*/gi, "");
}

function isProductSubagentScaffoldLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "Ambient sub-agent child run." ||
    /^Sub-agent reserved:/i.test(trimmed) ||
    /^Canonical path:/i.test(trimmed) ||
    /^Run id:/i.test(trimmed) ||
    /^Dependency mode:/i.test(trimmed) ||
    /^Scheduling policy:/i.test(trimmed) ||
    /^Do not spawn sub-agents\./i.test(trimmed) ||
    /^Parent-only sub-agent orchestration instructions,/i.test(trimmed) ||
    /^Child sessions do not receive this parent-facing tool/i.test(trimmed) ||
    /^Phase \d+ note:.*child thread is durable and inspectable/i.test(trimmed);
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function matchesAtLeast(text: string, patterns: readonly RegExp[], minimum: number): boolean {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count += 1;
    if (count >= minimum) return true;
  }
  return false;
}

function iterativeChildEvaluationLoopGuidance(): string {
  return [
    "Workflow pattern: iterative_child_evaluation_loop",
    "- This pattern applies because the user asked for iterative parent work with separate child feedback/evaluation, measurable history, and a stop rule.",
    "- Completion requires running the loop and saving iteration artifacts; do not stop after only writing instructions, a plan, or a reusable skill unless the user explicitly asks for a template only.",
    "- If the user asks to create a skill/package for this loop, first create the skill/package, then exercise it on a small sample so the requested score/history artifacts exist.",
    `- For each iteration: spawn a feedback/proposer child with ${AMBIENT_SUBAGENT_TOOL_NAME} spawn_agent; wait_agent; apply exactly one parent revision; spawn a separate judge/evaluator child; wait_agent; parse the metric/evaluation; append an iteration row; then check the stop condition.`,
    "- In child task text, do not call the child a subagent or ask it to manage subagents. Use plain role names such as feedback reviewer, proposal reviewer, or scoring judge so child-session fanout guards do not misread the task as a nested subagent request.",
    '- Keep child tasks narrow and read-only when possible: pass the current artifact text directly in the child task, include exact artifact paths only when needed, and use roleId reviewer unless the user specifies otherwise. Usually omit toolScope and let role defaults apply; if explicitly narrowing scope, use exactly toolScope.requestedCategories and nested toolScope.childAuthority, for example {"requestedCategories":["workspace.read"],"childAuthority":{"taskIntent":"file_read","mutation":"deny"}}.',
    "- Children cannot discover hidden sibling transcripts or guessed scratch files. Pass prior child summaries, current essay text, score table rows, and exact artifact paths into each next child; if those inputs are missing, retry or ask instead of letting the child search the workspace.",
    "- Do not fight Ambient child structured-result contracts with 'output only' prompts. Ask the child to put the feedback idea, score, and rationale in its structured summary/evidence so the parent can parse and cite the completed child result.",
    "- The parent must not fabricate child feedback, scores, or rationale. If a required child fails or returns an unparseable metric, record the failure explicitly and follow the wait barrier resolution policy before continuing; use resolve_barrier decision retry_child for retry attempts, and reserve cancel_parent only for actually stopping the parent run.",
    "- Save the iteration history in the workspace with version/iteration id, child feedback idea, evaluator score/metric, delta, stop-state counter, and short evaluator rationale when requested.",
    "- Before final synthesis, inspect the saved artifacts. If the score table is absent, empty, missing required columns, lacks an integer 1-100 judge score, or lacks plateau/stop-state evidence, save an issue log and report the run as blocked/failed instead of claiming the loop passed.",
    "- Final response should name the saved artifacts, summarize why the loop stopped, and include enough of the table for the user to verify the progress history.",
  ].join("\n");
}
