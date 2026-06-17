import { describe, expect, it } from "vitest";
import {
  defaultArtifactDraftRetention,
  defaultArtifactDraftValidationState,
} from "../../shared/artifactDrafts";
import {
  mapArtifactDraftRow,
  mapArtifactDraftEventRow,
  normalizeArtifactDraftAssembly,
  normalizeArtifactDraftKind,
  normalizeArtifactDraftOrigin,
  normalizeArtifactDraftState,
  type ArtifactDraftRow,
  type ArtifactDraftEventRow,
} from "./projectStoreArtifactDraftMappers";

describe("project store artifact draft mappers", () => {
  it("maps artifact draft rows without store state", () => {
    const row: ArtifactDraftRow = {
      ...baseArtifactDraftRow(),
      validation_json: JSON.stringify({
        status: "valid",
        checkedAt: "2026-06-06T21:48:00.000Z",
        errors: [],
        warnings: ["looks fine"],
        suggestedNextOperations: ["commit"],
        metadata: { source: "unit-test" },
      }),
      retention_json: JSON.stringify({
        policy: "committed",
        retainUntil: "2026-06-13T21:50:00.000Z",
        reason: "Keep audit context.",
      }),
      completed_at: "2026-06-06T21:50:00.000Z",
    };

    expect(mapArtifactDraftRow(row, 4)).toEqual({
      schemaVersion: 1,
      draftId: "draft-1",
      kind: "markdown",
      assembly: "whole",
      targetPath: "reports/final.md",
      state: "committed",
      origin: "explicit_draft",
      sourceRunId: "run-1",
      validationState: {
        status: "valid",
        checkedAt: "2026-06-06T21:48:00.000Z",
        errors: [],
        warnings: ["looks fine"],
        suggestedNextOperations: ["commit"],
        metadata: { source: "unit-test" },
      },
      retention: {
        policy: "committed",
        retainUntil: "2026-06-13T21:50:00.000Z",
        reason: "Keep audit context.",
      },
      paths: {
        rootPath: "/workspace/.ambient/artifact-drafts/draft-1",
        manifestPath: "/workspace/.ambient/artifact-drafts/draft-1/manifest.json",
        contentPath: "/workspace/.ambient/artifact-drafts/draft-1/content.md",
        sectionsPath: "/workspace/.ambient/artifact-drafts/draft-1/sections",
        recordsPath: "/workspace/.ambient/artifact-drafts/draft-1/records",
        validationPath: "/workspace/.ambient/artifact-drafts/draft-1/validation",
        eventsPath: "/workspace/.ambient/artifact-drafts/draft-1/events.jsonl",
      },
      createdAt: "2026-06-06T21:40:00.000Z",
      updatedAt: "2026-06-06T21:50:00.000Z",
      completedAt: "2026-06-06T21:50:00.000Z",
      eventCount: 4,
    });
  });

  it("preserves artifact draft fallback and nullable row behavior", () => {
    const row: ArtifactDraftRow = {
      ...baseArtifactDraftRow(),
      state: "needs_revision",
      source_run_id: null,
      content_path: null,
      validation_json: "not-json",
      retention_json: "[]",
      completed_at: null,
    };

    expect(mapArtifactDraftRow(row, 0)).toMatchObject({
      validationState: defaultArtifactDraftValidationState(),
      retention: defaultArtifactDraftRetention("needs_revision", row.updated_at),
      paths: {
        rootPath: row.root_path,
        manifestPath: row.manifest_path,
        sectionsPath: `${row.root_path}/sections`,
        recordsPath: `${row.root_path}/records`,
        validationPath: `${row.root_path}/validation`,
        eventsPath: `${row.root_path}/events.jsonl`,
      },
      eventCount: 0,
    });
    expect(mapArtifactDraftRow(row, 0)).not.toHaveProperty("sourceRunId");
    expect(mapArtifactDraftRow(row, 0).paths).not.toHaveProperty("contentPath");
    expect(mapArtifactDraftRow(row, 0)).not.toHaveProperty("completedAt");
  });

  it("keeps artifact draft normalizer errors explicit", () => {
    expect(() => normalizeArtifactDraftKind("binary")).toThrow("Unsupported artifact draft kind: binary");
    expect(() => normalizeArtifactDraftAssembly("page")).toThrow("Unsupported artifact draft assembly: page");
    expect(() => normalizeArtifactDraftState("published")).toThrow("Unsupported artifact draft state: published");
    expect(() => normalizeArtifactDraftOrigin("manual")).toThrow("Unsupported artifact draft origin: manual");
  });

  it("maps artifact draft event rows without store state", () => {
    const row: ArtifactDraftEventRow = {
      id: "event-1",
      draft_id: "draft-1",
      seq: 3,
      event_type: "state_committed",
      created_at: "2026-06-06T21:45:00.000Z",
      summary: "Committed the draft.",
      metadata_json: JSON.stringify({
        targetPath: "reports/final.md",
        source: "test",
      }),
    };

    expect(mapArtifactDraftEventRow(row)).toEqual({
      id: "event-1",
      draftId: "draft-1",
      seq: 3,
      eventType: "state_committed",
      createdAt: "2026-06-06T21:45:00.000Z",
      summary: "Committed the draft.",
      metadata: {
        targetPath: "reports/final.md",
        source: "test",
      },
    });
  });

  it("preserves artifact draft event metadata fallback behavior", () => {
    expect(mapArtifactDraftEventRow({ ...baseArtifactDraftEventRow(), metadata_json: "not-json" }).metadata).toEqual({});
    expect(mapArtifactDraftEventRow({ ...baseArtifactDraftEventRow(), metadata_json: "[]" }).metadata).toEqual({});
    expect(mapArtifactDraftEventRow({ ...baseArtifactDraftEventRow(), metadata_json: "null" }).metadata).toEqual({});
  });
});

function baseArtifactDraftRow(): ArtifactDraftRow {
  return {
    id: "draft-1",
    workspace_path: "/workspace",
    target_path: "reports/final.md",
    kind: "markdown",
    assembly: "whole",
    state: "committed",
    origin: "explicit_draft",
    source_run_id: "run-1",
    root_path: "/workspace/.ambient/artifact-drafts/draft-1",
    manifest_path: "/workspace/.ambient/artifact-drafts/draft-1/manifest.json",
    content_path: "/workspace/.ambient/artifact-drafts/draft-1/content.md",
    validation_json: JSON.stringify(defaultArtifactDraftValidationState()),
    retention_json: JSON.stringify(defaultArtifactDraftRetention("committed", "2026-06-06T21:50:00.000Z")),
    created_at: "2026-06-06T21:40:00.000Z",
    updated_at: "2026-06-06T21:50:00.000Z",
    completed_at: null,
    expires_at: null,
  };
}

function baseArtifactDraftEventRow(): ArtifactDraftEventRow {
  return {
    id: "event-1",
    draft_id: "draft-1",
    seq: 1,
    event_type: "created",
    created_at: "2026-06-06T21:40:00.000Z",
    summary: "Created the draft.",
    metadata_json: "{}",
  };
}
