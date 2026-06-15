import { describe, expect, it } from "vitest";
import { canRefreshOfficePreview, isPreparedLocalTaskWorkspace } from "./workspaceUiModel";

describe("canRefreshOfficePreview", () => {
  it("allows refresh for failed or missing Office preview conversion", () => {
    expect(canRefreshOfficePreview({ kind: "office", officePreview: { status: "missing-renderer" } })).toBe(true);
    expect(canRefreshOfficePreview({ kind: "office", officePreview: { status: "failed" } })).toBe(true);
  });

  it("does not show refresh for available previews, unsupported previews, or non-Office files", () => {
    expect(canRefreshOfficePreview({ kind: "office", officePreview: { status: "available" } })).toBe(false);
    expect(canRefreshOfficePreview({ kind: "office", officePreview: { status: "unsupported" } })).toBe(false);
    expect(canRefreshOfficePreview({ kind: "office" })).toBe(false);
    expect(canRefreshOfficePreview({ kind: "pdf", officePreview: { status: "failed" } })).toBe(false);
  });
});

describe("isPreparedLocalTaskWorkspace", () => {
  it("matches orchestration prepared local task workspaces", () => {
    expect(
      isPreparedLocalTaskWorkspace(
        "/path/to/project",
        "/path/to/project/.ambient-codex/orchestration/workspaces/task-123",
      ),
    ).toBe(true);
  });

  it("does not match ordinary thread git worktrees", () => {
    expect(
      isPreparedLocalTaskWorkspace(
        "/path/to/project",
        "/path/to/project/.ambient-codex/worktrees/77bbe97a-01ff-40e9-bf1b-1c5e0c41a731",
      ),
    ).toBe(false);
  });

  it("does not match the project root or sibling paths with a similar prefix", () => {
    expect(isPreparedLocalTaskWorkspace("/path/to/project", "/path/to/project")).toBe(false);
    expect(
      isPreparedLocalTaskWorkspace(
        "/path/to/project",
        "/path/to/project-copy/.ambient-codex/orchestration/workspaces/task-123",
      ),
    ).toBe(false);
  });
});
