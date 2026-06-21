import {
  resolveAmbientModelReasoningCapability,
  resolveAmbientModelReasoningThinkingLevel,
} from "../../shared/ambientModels";
import type { ThinkingLevel } from "../../shared/threadTypes";
import { thinkingLevelLabel, thinkingOptions } from "./thinkingDisplayUiModel";

export type ModelReasoningControlOption = {
  value: ThinkingLevel;
  label: string;
  description: string;
};

export type ModelReasoningControlModel =
  | {
      kind: "selectable";
      label: string;
      value: ThinkingLevel;
      options: ModelReasoningControlOption[];
      tooltip: string;
      settingsDescription: string;
    }
  | {
      kind: "fixed";
      label: string;
      value: ThinkingLevel;
      tooltip: string;
      settingsDescription: string;
    }
  | {
      kind: "hidden";
      label: string;
      value: ThinkingLevel;
      tooltip: string;
      settingsDescription: string;
    };

const genericThinkingLevelOptions: ModelReasoningControlOption[] = thinkingOptions.map((option) => ({
  value: option,
  label: thinkingLevelLabel(option),
  description: "Use the generic thinking effort setting for this model.",
}));

export function modelReasoningControlModel(modelId: string, thinkingLevel: ThinkingLevel): ModelReasoningControlModel {
  const capability = resolveAmbientModelReasoningCapability(modelId);
  const value = resolveAmbientModelReasoningThinkingLevel(modelId, thinkingLevel) as ThinkingLevel;
  if (capability.control === "selectable_effort") {
    const options = capability.selectableThinkingLevels.map((option) => ({
      value: option.thinkingLevel as ThinkingLevel,
      label: option.label,
      description: option.description,
    }));
    const selected = options.find((option) => option.value === value) ?? options[0];
    const label = selected?.label ?? "Standard";
    const description = selected?.description ?? "Use the model default reasoning effort.";
    return {
      kind: "selectable",
      label,
      value,
      options,
      tooltip: `Reasoning mode: ${label}. ${description}`,
      settingsDescription: "Maps Ambient reasoning mode to provider-supported request controls for this model.",
    };
  }
  if (capability.control === "fixed_on") {
    return {
      kind: "fixed",
      label: "Reasoning on",
      value,
      tooltip: "Reasoning mode: Reasoning on. This model controls reasoning internally; Ambient preserves hidden reasoning and omits unsupported request controls.",
      settingsDescription: "This model controls reasoning internally. Ambient preserves hidden reasoning while omitting unsupported request controls.",
    };
  }
  return {
    kind: "selectable",
    label: thinkingLevelLabel(value),
    value,
    options: genericThinkingLevelOptions,
    tooltip: `Thinking effort: ${thinkingLevelLabel(value)}. This model does not have a verified Ambient-specific reasoning contract.`,
    settingsDescription: "Uses the generic thinking effort setting for models without an Ambient-specific reasoning contract.",
  };
}
