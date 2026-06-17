export function termsPresent(text: string, terms: string[]): Record<string, boolean> {
  const haystack = text.toLowerCase();
  return Object.fromEntries(terms.map((term) => [term, haystack.includes(term.toLowerCase())]));
}

export function forbiddenClaimPromises(text: string, terms: string[]): Record<string, boolean> {
  return Object.fromEntries(terms.map((term) => [term, forbiddenClaimLooksPromised(text, term)]));
}

export function forbiddenClaimLooksPromised(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  let index = haystack.indexOf(needle);
  if (index < 0) return false;
  while (index >= 0) {
    const context = haystack.slice(Math.max(0, index - 120), Math.min(haystack.length, index + needle.length + 160));
    const before = haystack.slice(Math.max(0, index - 80), index);
    if (!forbiddenClaimMentionIsNegated(context, before)) return true;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return false;
}

function forbiddenClaimMentionIsNegated(context: string, beforeMention: string): boolean {
  return [
    /\bno\s+(?:promise|claim|mention|assertion)\s+of\b/,
    /\bno\b[^\n|]{0,160}\bclaims?\b/,
    /\bnot\s+(?:present|claimed|promised|included|used|found)\b/,
    /\bno\s+forbidden\s+claims?\s+(?:are\s+)?(?:present|included|found)\b/,
    /\b(?:do\s+not|does\s+not|did\s+not)\s+promise\b/,
    /\bavoid(?:ed|s|ing)?\b/,
    /\bforbidden\s+claims?\s+(?:avoided|excluded|absent)\b/,
    /\bwithout\s+(?:claiming|promising|saying)\b/,
    /\bremoved\b/,
    /\babsent\b/,
    /\bnot\s+ready\s+yet\b/,
  ].some((pattern) => pattern.test(context)) || forbiddenClaimMentionHasNegatedPrefix(beforeMention);
}

function forbiddenClaimMentionHasNegatedPrefix(beforeMention: string): boolean {
  return [
    /\bno\s+["'`“”‘’]?\s*$/,
    /\bnot\s+["'`“”‘’]?\s*$/,
    /\bwithout\s+["'`“”‘’]?\s*$/,
    /\bavoid(?:ed|s|ing)?\s+["'`“”‘’]?\s*$/,
    /\bexcluded\s+["'`“”‘’]?\s*$/,
  ].some((pattern) => pattern.test(beforeMention));
}
