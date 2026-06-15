export const SECURITY_REPRO_REQUIRED_IDS = Object.freeze([
  "F-001",
  "F-002",
  "F-003",
  "F-004",
  "F-005",
  "F-006",
  "F-007",
  "F-008",
  "F-009",
  "F-010",
  "F-011",
  "F-012",
  "F-013",
  "F-014",
  "F-015",
]);

export function evaluateSecurityReproGateResults(results, options = {}) {
  const requiredIds = options.requiredIds ?? SECURITY_REPRO_REQUIRED_IDS;
  const resultList = Array.isArray(results) ? results : [];
  const byId = new Map(resultList.filter((result) => result && typeof result.id === "string").map((result) => [result.id, result]));
  const issues = [];

  for (const id of requiredIds) {
    const result = byId.get(id);
    if (!result) {
      issues.push({ id, status: "missing", issue: `${id} did not return a repro result.` });
      continue;
    }
    if (result.status !== "not-reproduced") {
      issues.push({
        id,
        status: result.status ?? "unknown",
        issue: `${id} returned ${result.status ?? "unknown"}: ${result.summary ?? "no summary"}`,
      });
    }
  }

  return {
    status: issues.length === 0 ? "passed" : "failed",
    checked: requiredIds.length,
    counts: countStatuses(resultList),
    issues,
  };
}

function countStatuses(results) {
  const counts = {};
  for (const result of results) {
    const status = result?.status ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
