import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
  validateBoardEventArtifact,
  type BoardEventArtifact,
} from "./projectBoardArtifacts";
import type { ProjectBoardEvent } from "../../shared/types";

export const PROJECT_BOARD_DEFAULT_CLAIM_LEASE_MS = 15 * 60 * 1000;

export interface ProjectBoardClaimEventInput {
  boardId: string;
  cardId: string;
  runId?: string;
  agentId?: string;
  appInstanceId?: string;
  displayName?: string;
  workspaceBranch?: string;
  baseCommit?: string;
  leaseMs?: number;
  now?: string;
}

export interface ProjectBoardClaim {
  cardId: string;
  runId: string;
  agentId: string;
  appInstanceId?: string;
  displayName?: string;
  workspaceBranch?: string;
  baseCommit?: string;
  eventId: string;
  claimedAt: string;
  expiredAt?: string;
  leaseUntil: string;
  lastHeartbeatAt?: string;
  expirationRecorded?: boolean;
}

export interface ProjectBoardClaimConflict {
  cardId: string;
  runId: string;
  agentId: string;
  appInstanceId?: string;
  displayName?: string;
  workspaceBranch?: string;
  baseCommit?: string;
  eventId: string;
  blockedByRunId: string;
  createdAt: string;
  leaseUntil?: string;
}

export interface ProjectBoardClaimProjection {
  activeClaims: ProjectBoardClaim[];
  expiredClaims: ProjectBoardClaim[];
  conflicts: ProjectBoardClaimConflict[];
}

export function createProjectBoardClaimEvent(input: ProjectBoardClaimEventInput): BoardEventArtifact {
  const now = input.now ?? new Date().toISOString();
  const leaseMs = normalizeLeaseMs(input.leaseMs);
  const runId = input.runId?.trim() || `run-${randomUUID()}`;
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: `evt-claim-${randomUUID()}`,
    boardId: input.boardId,
    type: "card.claimed",
    entityKind: "card",
    entityId: input.cardId,
    actor: {
      kind: "ambient-desktop",
      agentId,
      displayName: input.displayName?.trim() || "Ambient Desktop",
      appInstanceId: input.appInstanceId?.trim() || undefined,
    },
    baseCommit: input.baseCommit,
    createdAt: now,
    payload: {
      cardId: input.cardId,
      runId,
      agentId,
      appInstanceId: input.appInstanceId?.trim() || undefined,
      workspaceBranch: input.workspaceBranch?.trim() || undefined,
      baseCommit: input.baseCommit,
      leaseUntil: new Date(Date.parse(now) + leaseMs).toISOString(),
      leaseMs,
    },
  });
}

export function createProjectBoardHeartbeatEvent(input: ProjectBoardClaimEventInput & { runId: string }): BoardEventArtifact {
  const now = input.now ?? new Date().toISOString();
  const leaseMs = normalizeLeaseMs(input.leaseMs);
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: `evt-heartbeat-${randomUUID()}`,
    boardId: input.boardId,
    type: "card.heartbeat",
    entityKind: "card",
    entityId: input.cardId,
    actor: {
      kind: "ambient-desktop",
      agentId,
      displayName: input.displayName?.trim() || "Ambient Desktop",
      appInstanceId: input.appInstanceId?.trim() || undefined,
    },
    baseCommit: input.baseCommit,
    createdAt: now,
    payload: {
      cardId: input.cardId,
      runId: input.runId,
      agentId,
      leaseUntil: new Date(Date.parse(now) + leaseMs).toISOString(),
      leaseMs,
    },
  });
}

export function createProjectBoardClaimReleaseEvent(
  input: ProjectBoardClaimEventInput & { runId: string; reason?: string; force?: boolean },
): BoardEventArtifact {
  const now = input.now ?? new Date().toISOString();
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: `evt-release-${randomUUID()}`,
    boardId: input.boardId,
    type: "card.claim_released",
    entityKind: "card",
    entityId: input.cardId,
    actor: {
      kind: "ambient-desktop",
      agentId,
      displayName: input.displayName?.trim() || "Ambient Desktop",
      appInstanceId: input.appInstanceId?.trim() || undefined,
    },
    baseCommit: input.baseCommit,
    createdAt: now,
    payload: {
      cardId: input.cardId,
      runId: input.runId,
      agentId,
      reason: input.reason?.trim() || undefined,
      force: input.force === true,
    },
  });
}

export function createProjectBoardClaimExpiredEvent(
  input: ProjectBoardClaimEventInput & { runId: string; expiredClaimEventId?: string },
): BoardEventArtifact {
  const now = input.now ?? new Date().toISOString();
  const agentId = input.agentId?.trim() || defaultProjectBoardClaimAgentId();
  return validateBoardEventArtifact({
    schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
    eventId: `evt-expired-${randomUUID()}`,
    boardId: input.boardId,
    type: "card.claim_expired",
    entityKind: "card",
    entityId: input.cardId,
    actor: {
      kind: "ambient-desktop",
      agentId,
      displayName: input.displayName?.trim() || "Ambient Desktop",
      appInstanceId: input.appInstanceId?.trim() || undefined,
    },
    baseCommit: input.baseCommit,
    createdAt: now,
    payload: {
      cardId: input.cardId,
      runId: input.runId,
      agentId,
      expiredClaimEventId: input.expiredClaimEventId,
    },
  });
}

export function projectBoardClaimProjectionFromEvents(
  events: BoardEventArtifact[],
  options: { now?: string } = {},
): ProjectBoardClaimProjection {
  const activeByCard = new Map<string, ProjectBoardClaim>();
  const expiredByRun = new Map<string, ProjectBoardClaim>();
  const conflictsByRun = new Map<string, ProjectBoardClaimConflict>();
  const sorted = [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventId.localeCompare(right.eventId));

  for (const event of sorted) {
    if (event.type === "card.claimed") {
      const claim = claimFromEvent(event);
      if (!claim) continue;
      const current = activeByCard.get(claim.cardId);
      if (current && !claimExpiredAt(current, event.createdAt)) {
        if (current.runId !== claim.runId) {
          conflictsByRun.set(claimKey(claim.cardId, claim.runId), {
            cardId: claim.cardId,
            runId: claim.runId,
            agentId: claim.agentId,
            appInstanceId: claim.appInstanceId,
            displayName: claim.displayName,
            workspaceBranch: claim.workspaceBranch,
            baseCommit: claim.baseCommit,
            eventId: claim.eventId,
            blockedByRunId: current.runId,
            createdAt: claim.claimedAt,
            leaseUntil: claim.leaseUntil,
          });
        }
        continue;
      }
      if (current) expiredByRun.set(claimKey(current.cardId, current.runId), { ...current, expiredAt: current.leaseUntil, expirationRecorded: false });
      activeByCard.set(claim.cardId, claim);
    } else if (event.type === "card.heartbeat") {
      const cardId = payloadString(event, "cardId") ?? event.entityId;
      const runId = payloadString(event, "runId");
      const leaseUntil = payloadString(event, "leaseUntil");
      if (!cardId || !runId || !leaseUntil) continue;
      const current = activeByCard.get(cardId);
      if (!current || current.runId !== runId) continue;
      activeByCard.set(cardId, {
        ...current,
        leaseUntil,
        lastHeartbeatAt: event.createdAt,
      });
    } else if (event.type === "card.claim_released" || event.type === "card.claim_expired") {
      const cardId = payloadString(event, "cardId") ?? event.entityId;
      const runId = payloadString(event, "runId");
      if (!cardId) continue;
      const current = activeByCard.get(cardId);
      if (current && (!runId || current.runId === runId || (event.payload.force === true && event.type === "card.claim_released"))) {
        if (event.type === "card.claim_expired") {
          expiredByRun.set(claimKey(cardId, current.runId), {
            ...current,
            expiredAt: event.createdAt,
            eventId: event.eventId,
            expirationRecorded: true,
          });
        }
        activeByCard.delete(cardId);
        continue;
      }
      if (runId) {
        const conflictKey = claimKey(cardId, runId);
        const conflict = conflictsByRun.get(conflictKey);
        if (!conflict) continue;
        if (event.type === "card.claim_expired") {
          expiredByRun.set(conflictKey, {
            cardId: conflict.cardId,
            runId: conflict.runId,
            agentId: conflict.agentId,
            appInstanceId: conflict.appInstanceId,
            displayName: conflict.displayName,
            workspaceBranch: conflict.workspaceBranch,
            baseCommit: conflict.baseCommit,
            eventId: event.eventId,
            claimedAt: conflict.createdAt,
            expiredAt: event.createdAt,
            leaseUntil: conflict.leaseUntil ?? event.createdAt,
            expirationRecorded: true,
          });
        }
        conflictsByRun.delete(conflictKey);
      }
    } else if (event.type === "card.completed" || event.type === "card.blocked") {
      const cardId = payloadString(event, "cardId") ?? event.entityId;
      const runId = payloadString(event, "runId");
      if (!cardId) continue;
      const current = activeByCard.get(cardId);
      if (current && (!runId || current.runId === runId)) activeByCard.delete(cardId);
    }
  }

  const now = options.now ?? new Date().toISOString();
  for (const [cardId, claim] of [...activeByCard]) {
    if (!claimExpiredAt(claim, now)) continue;
    expiredByRun.set(claimKey(cardId, claim.runId), { ...claim, expiredAt: claim.leaseUntil, expirationRecorded: false });
    activeByCard.delete(cardId);
  }

  return {
    activeClaims: [...activeByCard.values()].sort(compareClaims),
    expiredClaims: [...expiredByRun.values()].sort(compareClaims),
    conflicts: [...conflictsByRun.values()].sort(compareClaimConflicts),
  };
}

export function projectBoardClaimProjectionFromProjectBoardEvents(
  events: ProjectBoardEvent[],
  options: { now?: string } = {},
): ProjectBoardClaimProjection {
  return projectBoardClaimProjectionFromEvents(events.flatMap(projectBoardEventToClaimArtifact), options);
}

export function assertProjectBoardCardClaimAvailable(
  events: BoardEventArtifact[],
  cardId: string,
  options: { now?: string } = {},
): void {
  const projection = projectBoardClaimProjectionFromEvents(events, options);
  const activeClaim = projection.activeClaims.find((claim) => claim.cardId === cardId);
  if (!activeClaim) return;
  throw new Error(
    `Project board card ${cardId} is already claimed by ${activeClaim.agentId} until ${activeClaim.leaseUntil}. Pull again or wait for the claim to expire.`,
  );
}

export function defaultProjectBoardClaimAgentId(): string {
  return `ambient-${hostname() || "desktop"}`.replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 120);
}

function projectBoardEventToClaimArtifact(event: ProjectBoardEvent): BoardEventArtifact[] {
  const type = claimArtifactTypeForProjectBoardEvent(event);
  if (!type) return [];
  const cardId = metadataString(event, "cardId") ?? event.entityId ?? "";
  const runId = metadataString(event, "runId") ?? "";
  const agentId = metadataString(event, "agentId") ?? event.metadata.actorAgentId ?? event.metadata.agent ?? "";
  if (!cardId || !runId) return [];
  return [
    validateBoardEventArtifact({
      schemaVersion: PROJECT_BOARD_ARTIFACT_SCHEMA_VERSION,
      eventId: event.id,
      boardId: event.boardId,
      type,
      entityKind: "card",
      entityId: cardId,
      actor: {
        kind: "ambient-desktop",
        agentId: typeof agentId === "string" && agentId.trim() ? agentId.trim() : undefined,
        displayName: metadataString(event, "displayName"),
        appInstanceId: metadataString(event, "appInstanceId"),
      },
      baseCommit: metadataString(event, "baseCommit"),
      createdAt: event.createdAt,
      payload: {
        ...event.metadata,
        cardId,
        runId,
      },
    }),
  ];
}

function claimArtifactTypeForProjectBoardEvent(event: ProjectBoardEvent): BoardEventArtifact["type"] | undefined {
  if (event.kind === "card_claimed") return "card.claimed";
  if (event.kind === "card_heartbeat") return "card.heartbeat";
  if (event.kind === "card_claim_released") return "card.claim_released";
  if (event.kind === "card_claim_expired") return "card.claim_expired";
  const artifactType = metadataString(event, "artifactEventType");
  if (artifactType === "card.claimed") return artifactType;
  if (artifactType === "card.heartbeat") return artifactType;
  if (artifactType === "card.claim_released") return artifactType;
  if (artifactType === "card.claim_expired") return artifactType;
  return undefined;
}

function metadataString(event: ProjectBoardEvent, key: string): string | undefined {
  const value = event.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimFromEvent(event: BoardEventArtifact): ProjectBoardClaim | undefined {
  const cardId = payloadString(event, "cardId") ?? event.entityId;
  const runId = payloadString(event, "runId");
  const agentId = payloadString(event, "agentId") ?? event.actor?.agentId;
  const leaseUntil = payloadString(event, "leaseUntil");
  if (!cardId || !runId || !agentId || !leaseUntil || Number.isNaN(Date.parse(leaseUntil))) return undefined;
  return {
    cardId,
    runId,
    agentId,
    appInstanceId: payloadString(event, "appInstanceId") ?? event.actor?.appInstanceId,
    displayName: event.actor?.displayName,
    workspaceBranch: payloadString(event, "workspaceBranch"),
    baseCommit: payloadString(event, "baseCommit") ?? event.baseCommit,
    eventId: event.eventId,
    claimedAt: event.createdAt,
    leaseUntil,
  };
}

function payloadString(event: BoardEventArtifact, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function claimExpiredAt(claim: Pick<ProjectBoardClaim, "leaseUntil">, at: string): boolean {
  return Date.parse(claim.leaseUntil) <= Date.parse(at);
}

function normalizeLeaseMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return PROJECT_BOARD_DEFAULT_CLAIM_LEASE_MS;
  return Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Math.round(value)));
}

function compareClaims(left: ProjectBoardClaim, right: ProjectBoardClaim): number {
  return left.cardId.localeCompare(right.cardId) || left.claimedAt.localeCompare(right.claimedAt) || left.runId.localeCompare(right.runId);
}

function compareClaimConflicts(left: ProjectBoardClaimConflict, right: ProjectBoardClaimConflict): number {
  return left.cardId.localeCompare(right.cardId) || left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId);
}

function claimKey(cardId: string, runId: string): string {
  return `${cardId}\u0000${runId}`;
}
