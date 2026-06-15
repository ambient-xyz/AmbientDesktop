import { describe, expect, it } from "vitest";

import { workflowSourceDraftStorageKey } from "./automationUiModel";
import {
  persistWorkflowSourceDrafts,
  workflowSourceDraftsFromStorage,
  workflowSourceDraftsWithChange,
  workflowSourceDraftsWithoutArtifact,
  workflowThreadPanelStateWithPanel,
  type WorkflowSourceDraftStorage,
} from "./AutomationsWorkflowWorkspaceController";

describe("Automations workflow workspace controller helpers", () => {
  it("loads and persists workflow source drafts through browser storage", () => {
    const storage = memoryStorage({
      [workflowSourceDraftStorageKey]: '{"artifact-b":"two","artifact-a":"one"}',
    });

    expect(workflowSourceDraftsFromStorage(storage)).toEqual({
      "artifact-a": "one",
      "artifact-b": "two",
    });

    persistWorkflowSourceDrafts(storage, { "artifact-c": "three", empty: "" });
    expect(storage.snapshot()).toEqual({
      [workflowSourceDraftStorageKey]: '{"artifact-c":"three","empty":""}',
    });

    persistWorkflowSourceDrafts(storage, {});
    expect(storage.snapshot()).toEqual({});
  });

  it("keeps source draft mutations immutable", () => {
    const current = { "artifact-a": "one", "artifact-b": "two" };

    expect(workflowSourceDraftsWithChange(current, "artifact-b", "updated")).toEqual({
      "artifact-a": "one",
      "artifact-b": "updated",
    });
    expect(workflowSourceDraftsWithoutArtifact(current, "artifact-a")).toEqual({
      "artifact-b": "two",
    });
    expect(current).toEqual({ "artifact-a": "one", "artifact-b": "two" });
  });

  it("updates per-thread panel state only when a workflow thread is known", () => {
    const current = { "thread-a": "run_console" };

    expect(workflowThreadPanelStateWithPanel(current, "thread-b", "outputs")).toEqual({
      "thread-a": "run_console",
      "thread-b": "outputs",
    });
    expect(workflowThreadPanelStateWithPanel(current, undefined, "outputs")).toBe(current);
  });
});

function memoryStorage(initial: Record<string, string> = {}): WorkflowSourceDraftStorage & { snapshot: () => Record<string, string> } {
  let values = { ...initial };
  return {
    getItem(key) {
      return values[key] ?? null;
    },
    removeItem(key) {
      const next = { ...values };
      delete next[key];
      values = next;
    },
    setItem(key, value) {
      values = { ...values, [key]: value };
    },
    snapshot() {
      return { ...values };
    },
  };
}
