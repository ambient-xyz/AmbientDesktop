export function detectDirectHelperOperation(body) {
  const text = chatCompletionPromptText(body);
  if (text.includes("charter_summary") || /charter project summary|charter summary/i.test(text)) return "charter-summary";
  if (text.includes("source_classification") || /source classification/i.test(text)) return "source-classification";
  if (text.includes("proof_judgment") || /proof judgment|proof review/i.test(text)) return "proof-judgment";
  return "unknown";
}

export function chatCompletionPromptText(body) {
  const raw = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
  try {
    const parsed = JSON.parse(raw);
    const chunks = [];
    if (Array.isArray(parsed?.messages)) {
      for (const message of parsed.messages) collectTextChunks(message?.content, chunks);
    } else {
      collectTextChunks(parsed, chunks);
    }
    if (chunks.length > 0) return chunks.join("\n\n");
  } catch {
    // Fall back to the raw request body for malformed diagnostics.
  }
  return raw;
}

export function sourceClassificationDecisionsFromBody(body) {
  const sources = sourceClassificationInputsFromBody(body);
  if (sources.length === 0) {
    throw new Error("Deterministic source-classification setup could not find sourceId/sourceKey lines in the request prompt.");
  }
  return sources.map(({ sourceId, sourceKey }) => ({
    sourceId,
    sourceKey,
    effectiveKind: sourceKindForSourceKey(sourceKey),
    classificationReason: "Deterministic setup classification for the charter-summary retry smoke.",
    classificationConfidence: 0.91,
    authorityRole: "primary",
    includeInSynthesis: true,
  }));
}

export function sourceClassificationInputsFromBody(body) {
  return sourceClassificationInputsFromPrompt(chatCompletionPromptText(body));
}

export function sourceClassificationInputsFromPrompt(text) {
  const sources = [];
  let current;
  const finishCurrent = () => {
    if (current?.sourceId) {
      sources.push({
        sourceId: current.sourceId,
        sourceKey: current.sourceKey || current.sourceId,
      });
    }
    current = undefined;
  };

  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (/^\s*---\s+SOURCE\b/i.test(line)) {
      finishCurrent();
      current = {};
      continue;
    }
    const sourceId = line.match(/^\s*sourceId:\s*(.+?)\s*$/);
    if (sourceId) {
      current ??= {};
      current.sourceId = sourceId[1];
      continue;
    }
    const sourceKey = line.match(/^\s*sourceKey:\s*(.+?)\s*$/);
    if (sourceKey) {
      current ??= {};
      current.sourceKey = sourceKey[1];
    }
  }
  finishCurrent();

  if (sources.length > 0) return sources;

  const ids = [...String(text ?? "").matchAll(/^\s*sourceId:\s*(.+?)\s*$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const keys = [...String(text ?? "").matchAll(/^\s*sourceKey:\s*(.+?)\s*$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return ids.map((sourceId, index) => ({ sourceId, sourceKey: keys[index] || sourceId }));
}

export function sourceKindForSourceKey(sourceKey) {
  const normalized = String(sourceKey).toLowerCase();
  if (normalized.includes("technical") || normalized.includes("architecture")) return "architecture_artifact";
  if (normalized.includes("brief") || normalized.includes("readme")) return "functional_spec";
  return "implementation_plan";
}

function collectTextChunks(value, chunks) {
  if (typeof value === "string") {
    if (value.trim()) chunks.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTextChunks(item, chunks);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of ["text", "content", "input_text"]) {
    collectTextChunks(value[key], chunks);
  }
}
