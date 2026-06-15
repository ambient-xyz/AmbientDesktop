export const artifactDraftSchemaVersion = 1 as const;

export const artifactDraftKinds = ["json", "document", "markdown", "record_set", "code", "mixed"] as const;
export type ArtifactDraftKind = (typeof artifactDraftKinds)[number];

export const artifactDraftAssemblies = ["whole", "sectioned", "chunked", "record_batch", "patch"] as const;
export type ArtifactDraftAssembly = (typeof artifactDraftAssemblies)[number];

export const artifactDraftStates = ["created", "drafting", "validating", "needs_revision", "committed", "failed", "aborted"] as const;
export type ArtifactDraftState = (typeof artifactDraftStates)[number];

export const artifactDraftOrigins = ["explicit_draft", "oversize_write_recovery", "imported_partial"] as const;
export type ArtifactDraftOrigin = (typeof artifactDraftOrigins)[number];

export type ArtifactDraftRetentionPolicy = "active" | "recoverable" | "committed" | "aborted";

export interface ArtifactDraftValidationState {
  status: "unknown" | "pending" | "valid" | "invalid" | "failed";
  checkedAt?: string;
  errors: string[];
  warnings: string[];
  suggestedNextOperations: string[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactDraftRetention {
  policy: ArtifactDraftRetentionPolicy;
  retainUntil?: string;
  reason: string;
}

export interface ArtifactDraftManifest {
  schemaVersion: typeof artifactDraftSchemaVersion;
  draftId: string;
  kind: ArtifactDraftKind;
  assembly: ArtifactDraftAssembly;
  targetPath: string;
  state: ArtifactDraftState;
  origin: ArtifactDraftOrigin;
  sourceRunId?: string;
  validationState: ArtifactDraftValidationState;
  retention: ArtifactDraftRetention;
  paths: {
    rootPath: string;
    manifestPath: string;
    contentPath?: string;
    sectionsPath: string;
    recordsPath: string;
    validationPath: string;
    eventsPath: string;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ArtifactDraftSummary extends ArtifactDraftManifest {
  eventCount: number;
}

export interface ArtifactDraftEvent {
  id: string;
  draftId: string;
  seq: number;
  eventType: string;
  createdAt: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface CreateArtifactDraftInput {
  id?: string;
  targetPath: string;
  kind: ArtifactDraftKind;
  assembly: ArtifactDraftAssembly;
  origin: ArtifactDraftOrigin;
  sourceRunId?: string;
  createdAt?: string;
  validationState?: Partial<ArtifactDraftValidationState>;
  retention?: ArtifactDraftRetention;
}

export interface UpdateArtifactDraftStateInput {
  draftId: string;
  state: ArtifactDraftState;
  eventType?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  validationState?: Partial<ArtifactDraftValidationState>;
  retention?: ArtifactDraftRetention;
  updatedAt?: string;
}

export interface ListArtifactDraftOptions {
  state?: ArtifactDraftState | ArtifactDraftState[];
  includeExpired?: boolean;
  limit?: number;
}

export function defaultArtifactDraftValidationState(input: Partial<ArtifactDraftValidationState> = {}): ArtifactDraftValidationState {
  return {
    status: input.status ?? "unknown",
    ...(input.checkedAt ? { checkedAt: input.checkedAt } : {}),
    errors: input.errors ?? [],
    warnings: input.warnings ?? [],
    suggestedNextOperations: input.suggestedNextOperations ?? [],
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function defaultArtifactDraftRetention(state: ArtifactDraftState, nowIso: string): ArtifactDraftRetention {
  if (state === "committed") {
    return {
      policy: "committed",
      retainUntil: addDaysIso(nowIso, 7),
      reason: "Committed draft metadata is retained briefly for audit and rollback context.",
    };
  }
  if (state === "aborted") {
    return {
      policy: "aborted",
      retainUntil: addDaysIso(nowIso, 1),
      reason: "Aborted draft metadata is retained briefly for audit and user-visible recovery context.",
    };
  }
  if (state === "failed" || state === "needs_revision") {
    return {
      policy: "recoverable",
      reason: "Recoverable drafts are retained until the user commits, aborts, or a future recovery policy handles them.",
    };
  }
  return {
    policy: "active",
    reason: "Active drafts are retained while they can still receive updates.",
  };
}

export function artifactDraftStateIsTerminal(state: ArtifactDraftState): boolean {
  return state === "committed" || state === "aborted";
}

function addDaysIso(nowIso: string, days: number): string {
  const date = new Date(nowIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
