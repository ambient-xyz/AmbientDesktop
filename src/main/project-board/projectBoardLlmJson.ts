// Shared lenient parser for LLM JSON responses. Models routinely prefix a fenced or
// bare JSON payload with prose ("Here is the result: ..."); a strict JSON.parse turns
// that into a burned retry on every attempt. Strategy: try the whole text, then a
// fence anywhere in the text, then the outermost brace slice.
export function parseProjectBoardLlmJson(text: string, context: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${context} returned an empty response.`);
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through to the brace slice
      }
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    throw new Error(`${context} did not return valid JSON.`);
  }
}
