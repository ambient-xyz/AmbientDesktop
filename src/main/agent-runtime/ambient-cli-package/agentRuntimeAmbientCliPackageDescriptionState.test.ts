import { describe, expect, it } from "vitest";

import {
  AmbientCliPackageDescriptionState,
  ambientCliPackageDescriptionKey,
} from "./agentRuntimeAmbientCliPackageDescriptionState";

describe("AmbientCliPackageDescriptionState", () => {
  it("normalizes package ids and names before storing described state", () => {
    const state = new AmbientCliPackageDescriptionState();

    state.markDescribed("thread-1", " Pkg-123 ", " Ambient-Demo ");

    expect(state.isDescribed("thread-1", "pkg-123", "other")).toBe(true);
    expect(state.isDescribed("thread-1", "other", "ambient-demo")).toBe(true);
    expect(state.isDescribed("thread-2", "pkg-123", "ambient-demo")).toBe(false);
  });

  it("clears described state across all threads", () => {
    const state = new AmbientCliPackageDescriptionState();
    state.markDescribed("thread-1", "pkg-123", "ambient-demo");

    state.clear();

    expect(state.isDescribed("thread-1", "pkg-123", "ambient-demo")).toBe(false);
  });

  it("uses the existing trim and lowercase key normalization", () => {
    expect(ambientCliPackageDescriptionKey(" Ambient-Demo ")).toBe("ambient-demo");
  });
});
