const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "all",
  "be",
  "been",
  "before",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "how",
  "if",
  "in",
  "is",
  "it",
  "its",
  "need",
  "needs",
  "of",
  "on",
  "or",
  "should",
  "some",
  "that",
  "the",
  "then",
  "these",
  "this",
  "those",
  "to",
  "use",
  "uses",
  "using",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
  "would",
]);

export function projectBoardQuestionDedupeKey(question: string): string {
  return projectBoardQuestionTokens(question).join(" ");
}

export function dedupeProjectBoardQuestions(questions: string[], limit = 20): string[] {
  const deduped: string[] = [];
  for (const question of questions) {
    const trimmed = question.trim();
    if (!trimmed) continue;
    if (deduped.some((existing) => projectBoardQuestionsAreNearDuplicates(existing, trimmed))) continue;
    deduped.push(trimmed);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export function projectBoardQuestionsAreNearDuplicates(left: string, right: string): boolean {
  const leftKey = projectBoardQuestionDedupeKey(left);
  const rightKey = projectBoardQuestionDedupeKey(right);
  if (!leftKey || !rightKey) return left.trim().toLowerCase() === right.trim().toLowerCase();
  if (leftKey === rightKey) return true;

  const leftTokens = new Set(leftKey.split(" ").filter(Boolean));
  const rightTokens = new Set(rightKey.split(" ").filter(Boolean));
  const shorter = Math.min(leftTokens.size, rightTokens.size);
  if (shorter < 4) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  const shorterCoverage = overlap / shorter;
  const dice = (2 * overlap) / (leftTokens.size + rightTokens.size);
  // A hard floor of 6 made near-duplicate detection inert for short questions
  // (4-5 content tokens), so reworded short questions stayed open after being
  // answered. Scale the floor to the shorter question's size.
  return overlap >= Math.min(6, shorter) && (shorterCoverage >= 0.72 || dice >= 0.62);
}

function projectBoardQuestionTokens(question: string): string[] {
  return normalizeProjectBoardQuestionText(question)
    .split(/\s+/)
    .map((token) => stemQuestionToken(token))
    .filter((token) => token.length > 1 && !QUESTION_STOP_WORDS.has(token));
}

function normalizeProjectBoardQuestionText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:e\.g|eg|i\.e|ie)\.?,?/g, " ")
    .replace(/\bimplementation plan\b/g, "plan")
    .replace(/\bproject charter\b/g, "charter")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function stemQuestionToken(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}
