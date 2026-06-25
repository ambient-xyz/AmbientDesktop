export function subagentPiToolsTestCoverage(files) {
  return [files.subagentPiToolsTest, files.subagentPiToolsWaitSynthesisTest].filter(Boolean).join("\n");
}

export function sourceAnchorCheck(input) {
  const text = typeof input.text === "string" ? input.text : "";
  const missing = input.anchors.filter((anchor) => !text.includes(anchor));
  return check({
    id: input.id,
    area: "source",
    status: missing.length ? "failed" : "passed",
    label: input.label,
    evidence: [
      `anchors: ${input.anchors.length - missing.length}/${input.anchors.length}`,
      ...(missing.length ? [] : ["all required anchors present"]),
    ],
    issues: missing.map((anchor) => `${input.label} is missing source anchor: ${anchor}`),
  });
}

function check(input) {
  return {
    id: input.id,
    area: input.area,
    status: input.status,
    label: input.label,
    evidence: input.evidence ?? [],
    issues: input.issues ?? [],
    warnIssues: input.warnIssues ?? [],
  };
}
