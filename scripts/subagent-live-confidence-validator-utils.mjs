export function prefixIssues(label, issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => `${label}: ${issue}`);
}

export function parentApprovalEventForArtifact(artifact, expected) {
  const deliveryState = expected.deliveryState ?? "queued";
  return (Array.isArray(artifact?.parentMailboxEvents) ? artifact.parentMailboxEvents : []).find((event) => {
    if (event?.type !== "subagent.child_approval_requested") return false;
    const payload = objectValue(event.payload);
    const parentBlockingState = objectValue(payload.parentBlockingState);
    return (
      event.deliveryState === deliveryState &&
      payload.childRunId === expected.childRunId &&
      payload.childThreadId === expected.childThreadId &&
      payload.approvalId === expected.approvalId &&
      payload.requestedToolId === expected.requestedToolId &&
      payload.requestedAction === expected.requestedAction &&
      parentBlockingState.action === "forward_child_approval_then_wait" &&
      parentBlockingState.childRunId === expected.childRunId &&
      parentBlockingState.childThreadId === expected.childThreadId &&
      parentBlockingState.resumeParentBlocking === true
    );
  });
}

export function latestArrayItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[value.length - 1] : undefined;
}

export function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function objectValue(value) {
  return value && typeof value === "object" ? value : {};
}

export function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.some(nonEmptyString);
}

export function arrayIncludesAll(value, expected) {
  return Array.isArray(value) && expected.every((item) => value.includes(item));
}

export function safeRelativePath(value) {
  return nonEmptyString(value) && !value.startsWith("/") && !value.split("/").includes("..");
}

export function sha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
