export interface ProjectBoardPlanIdentityInput {
  artifactTitle?: string;
  threadTitle?: string;
  summary?: string;
  content?: string;
  fallback?: string;
}

const GENERIC_PLAN_TITLE_PATTERN =
  /^(?:plan|scope\s+contract|implementation\s+plan|durable\s+plan|refined\s+durable\s+plan|planner\s+plan|files\s+to\s+create|stages?|technology|risks?|open\s+questions?)$/i;

const GENERIC_PLAN_SECTION_TITLE_PATTERN =
  /^(?:(?:stage|step|phase)\s*\d+\b|tech(?:nology|\s+choice)?\b|architecture\b|scope\s+contract\b|implementation\s+plan\b|files?\s+to\s+(?:create|modify)\b|validation(?:\s+after\s+build)?\b|risks?(?:\s*&\s*open\s+questions?)?\b|open\s+questions?\b|optional\s+next\s+steps?\b)/i;

const BOILERPLATE_BOARD_GOAL_PATTERN =
  /\bship\s+the\s+next\s+coherent,\s*testable\s+increment\b|\busing\s+the\s+included\s+project\s+sources\s+as\s+the\s+scope\s+boundary\b/i;

export function projectBoardPlanDisplayTitle(input: ProjectBoardPlanIdentityInput): string {
  const explicitTitle = cleanPlanTitle(input.artifactTitle);
  if (explicitTitle && !projectBoardPlanTitleIsGeneric(explicitTitle)) return explicitTitle;

  const text = normalizePlanText([input.artifactTitle, input.summary, input.content].filter(Boolean).join("\n"));
  const titledLine = projectBoardPlanTitleFromText(text);
  if (titledLine) return titledLine;

  const goal = projectBoardPlanGoalFromText(text);
  const inferred = goal ? projectBoardPlanTitleFromGoal(goal) : undefined;
  if (inferred) return inferred;

  const threadTitle = cleanPlanTitle(input.threadTitle);
  if (threadTitle && !projectBoardPlanTitleIsGeneric(threadTitle)) return threadTitle;

  return cleanPlanTitle(input.fallback) || "Planner plan";
}

export function projectBoardPlanGoalFromText(text: string): string | undefined {
  const normalized = normalizePlanText(text);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /^(?:goal|what\s+the\s+user\s+wants|what\s+the\s+user\s+requested|what\s+the\s+user\s+asked\s+for|user\s+request|user\s+requested|requested|request)\s*:\s*(.+)$/i,
    );
    const goal = cleanGoal(match?.[1]);
    if (goal && !projectBoardKickoffGoalIsBoilerplate(goal)) return goal;
  }

  for (const line of lines) {
    if (/^(?:included|excluded|out\s+of\s+scope|implementation\s+plan|stages?|files|risks?|open\s+questions?)\b/i.test(line)) break;
    const quotedRequest = cleanGoal(line.match(/"([^"]*(?:user\s+taps|random\s+yes\s*\/\s*no\s*\/\s*maybe)[^"]*)"/i)?.[1]);
    if (quotedRequest) return quotedRequest;
    const yesNoMaybeRequest = cleanGoal(
      line.match(/\buser\s+taps\s+a\s+button\b.*?\brandom\s+yes\s*\/\s*no\s*\/\s*maybe\b.*?(?:answer|$)/i)?.[0],
    );
    if (yesNoMaybeRequest) return yesNoMaybeRequest;
    const goal = cleanGoal(line.match(/\bwhere\s+the\s+user\s+.+$/i)?.[0]);
    if (goal) return goal;
  }

  return undefined;
}

export function projectBoardPlanTitleIsGeneric(title: string | undefined): boolean {
  const normalized = cleanPlanTitle(title);
  return !normalized || GENERIC_PLAN_TITLE_PATTERN.test(normalized) || GENERIC_PLAN_SECTION_TITLE_PATTERN.test(normalized);
}

export function projectBoardKickoffGoalIsBoilerplate(goal: string | undefined): boolean {
  return BOILERPLATE_BOARD_GOAL_PATTERN.test(goal ?? "");
}

function projectBoardPlanTitleFromText(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 40)) {
    const match =
      line.match(/^(?:plan|refined\s+durable\s+plan)\s*[:\-]\s*(.+)$/i) ??
      line.match(/^#+\s*(?:plan\s*:\s*)?(.+)$/i);
    const title = cleanPlanTitle(match?.[1]);
    if (title && !projectBoardPlanTitleIsGeneric(title)) return title;
  }
  return undefined;
}

function projectBoardPlanTitleFromGoal(goal: string): string | undefined {
  if (/\bgradient\b/i.test(goal) && (/\bcss\b/i.test(goal) || /\bcolou?rs?\b/i.test(goal))) return "CSS Gradient Generator";
  if (/\bfind\b/i.test(goal) && /\breplace\b/i.test(goal) && /\btext\b/i.test(goal)) return "Find & Replace Tool";
  if (/\bplaceholder\b/i.test(goal) && /\b(?:paragraphs?|sentences?|words?)\b/i.test(goal)) return "Placeholder Text Generator";
  if (/\bbill\b/i.test(goal) && /\b(?:people|person|split)\b/i.test(goal) && /\btip\b/i.test(goal)) return "Currency Tip Splitter";
  if (/\bpalindrome\b/i.test(goal)) return "Palindrome Checker";
  if (/\byes\s*\/\s*no\s*\/\s*maybe\b/i.test(goal)) return "Yes / No / Maybe Decision App";
  if (/\brandom\b/i.test(goal) && /\boptions?\b/i.test(goal)) return "Random Option Picker";
  if (/\btip\b/i.test(goal) && /\bcalculator\b/i.test(goal)) return "Tip Calculator";
  if (/\bhabit\b/i.test(goal) && /\btracker\b/i.test(goal)) return "Habit Tracker";
  if (/\brevers(?:e|ed|ing)\b/i.test(goal) && /\btext\b/i.test(goal)) return "Reverse Text";
  return undefined;
}

function normalizePlanText(text: string): string {
  return text
    .replace(/<\/(?:h[1-6]|p|li|div|section|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*([^*\n]{1,160}?:)\*\*/g, "$1")
    .replace(/__([^_\n]{1,160}?:)__/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanPlanTitle(title: string | undefined): string {
  return (title ?? "")
    .replace(/^(?:plan|refined\s+durable\s+plan)\s*:\s*/i, "")
    .replace(/\s*[-–—]\s*(?:final\s+)?(?:implementation\s+plan|durable\s+plan|scope\s+contract)$/i, "")
    .replace(/\s+Durable\s+Plan$/i, "")
    .replace(/\s+board$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function cleanGoal(goal: string | undefined): string | undefined {
  const cleaned = (goal ?? "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 12 ? cleaned.slice(0, 500) : undefined;
}
