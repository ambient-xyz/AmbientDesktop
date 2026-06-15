export function requiresVisualProof(card) {
  const proofItems = Object.entries(card.testPlan ?? {})
    .filter(([kind]) => kind === "visual" || kind === "manual")
    .flatMap(([, items]) => (Array.isArray(items) ? items : []));
  const visualItems = proofItems.filter((item) => /\b(visual|screenshot|canvas|render|browser|webgl|nonblank|non-blank)\b/i.test(String(item)));
  if (visualItems.length > 0 && visualItems.every(isExplicitlyNoVisualProof)) return false;
  const text = [
    card.title,
    card.description,
    ...card.acceptanceCriteria,
    ...proofItems.filter((item) => !isExplicitlyNoVisualProof(item)),
  ]
    .join("\n")
    .toLowerCase();
  return /\b(visual|screenshot|canvas|render|browser|webgl|nonblank|non-blank)\b/.test(text);
}

function isExplicitlyNoVisualProof(value) {
  const text = String(value ?? "").toLowerCase();
  return /\b(n\/a|not applicable|no visual|no canvas|no browser|pure state|pure logic|text[- ]?only)\b/.test(text);
}
