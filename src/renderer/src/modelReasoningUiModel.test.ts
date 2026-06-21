import { describe, expect, it } from "vitest";
import {
  AMBIENT_GLM_5_2_FP8_MODEL,
  AMBIENT_KIMI_K2_7_CODE_MODEL,
} from "../../shared/ambientModels";
import { modelReasoningControlModel } from "./modelReasoningUiModel";

describe("modelReasoningControlModel", () => {
  it("shows Standard and Deep controls for GLM 5.2", () => {
    expect(modelReasoningControlModel(AMBIENT_GLM_5_2_FP8_MODEL, "minimal")).toEqual({
      kind: "selectable",
      label: "Standard",
      value: "medium",
      options: [
        {
          value: "medium",
          label: "Standard",
          description: "Use ZAI high effort for normal Ambient work.",
        },
        {
          value: "xhigh",
          label: "Deep",
          description: "Use ZAI max effort for harder reasoning tasks.",
        },
      ],
      tooltip: "Reasoning mode: Standard. Use ZAI high effort for normal Ambient work.",
      settingsDescription: "Maps Ambient reasoning mode to provider-supported request controls for this model.",
    });
    expect(modelReasoningControlModel(AMBIENT_GLM_5_2_FP8_MODEL, "high")).toMatchObject({
      kind: "selectable",
      label: "Deep",
      value: "xhigh",
    });
  });

  it("shows a fixed reasoning-on state for Kimi", () => {
    expect(modelReasoningControlModel(AMBIENT_KIMI_K2_7_CODE_MODEL, "xhigh")).toMatchObject({
      kind: "fixed",
      label: "Reasoning on",
      value: "medium",
    });
  });

  it("keeps a generic thinking effort control for unregistered models", () => {
    expect(modelReasoningControlModel("custom/model", "xhigh")).toMatchObject({
      kind: "selectable",
      label: "Extra High",
      value: "xhigh",
      options: [
        { value: "minimal", label: "Minimal" },
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "xhigh", label: "Extra High" },
      ],
    });
  });
});
