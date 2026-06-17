import { describe, expect, it } from "vitest";

import {
  AmbientWorkflowDescriptionState,
  ambientWorkflowDescriptionKey,
} from "./agentRuntimeAmbientWorkflowDescriptionState";

describe("AmbientWorkflowDescriptionState", () => {
  it("normalizes workflow ids while preserving version-specific described state", () => {
    const state = new AmbientWorkflowDescriptionState();

    state.markDescribed("thread-1", " Workflow-One ", 2);

    expect(state.isDescribed("thread-1", "workflow-one", 2)).toBe(true);
    expect(state.isDescribed("thread-1", "workflow-one", 3)).toBe(false);
    expect(state.isDescribed("thread-2", "workflow-one", 2)).toBe(false);
  });

  it("clears described state across all threads", () => {
    const state = new AmbientWorkflowDescriptionState();
    state.markDescribed("thread-1", "workflow-one", 2);

    state.clear();

    expect(state.isDescribed("thread-1", "workflow-one", 2)).toBe(false);
  });

  it("uses the existing trim and lowercase key normalization", () => {
    expect(ambientWorkflowDescriptionKey(" Workflow-One ", 4)).toBe("workflow-one@4");
  });
});
