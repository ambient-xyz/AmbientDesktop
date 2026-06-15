export function latestLiveRunStatus(live) {
  const statuses = Array.isArray(live?.statuses) ? live.statuses : [];
  return statuses.length ? String(statuses[statuses.length - 1]) : undefined;
}

export function liveRunSettledAfterCurrentSend(live, input = {}) {
  if (!live?.sendResolved || !live?.sawRunStart || latestLiveRunStatus(live) !== "idle") return false;
  const idleGraceMs = Math.max(0, Math.floor(input.idleGraceMs ?? 0));
  if (idleGraceMs <= 0) return true;
  const lastStatusAtMs = Number(live.lastStatusAtMs);
  if (!Number.isFinite(lastStatusAtMs)) return true;
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  return nowMs - lastStatusAtMs >= idleGraceMs;
}
