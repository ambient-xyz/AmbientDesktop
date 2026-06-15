import { describe, expect, it } from "vitest";
import { requiresVisualProof } from "./project-board-dogfood-proof.mjs";

describe("project-board dogfood proof helpers", () => {
  it("does not require screenshots for pure logic cards with explicit N/A visual proof", () => {
    expect(
      requiresVisualProof({
        title: "Implement deterministic GameState module",
        description: "Create pure state helpers with no renderer dependency.",
        acceptanceCriteria: ["State can be created from a default factory and advanced by a pure update function."],
        testPlan: {
          unit: ["createDefaultState() returns valid initial state."],
          integration: ["GameState update function is callable from GameLoop without renderer import."],
          visual: ["N/A - pure state module, no canvas output"],
          manual: ["Verify no Three.js or DOM imports in GameState module."],
        },
      }),
    ).toBe(false);
  });

  it("requires screenshots for browser rendering cards", () => {
    expect(
      requiresVisualProof({
        title: "Render nonblank WebGL canvas",
        description: "Mount a browser canvas and render a nonblank scene.",
        acceptanceCriteria: ["Canvas renders a nonblank starfield."],
        testPlan: {
          unit: [],
          integration: ["Run app."],
          visual: ["Capture a screenshot proving the canvas is nonblank."],
          manual: [],
        },
      }),
    ).toBe(true);
  });
});
