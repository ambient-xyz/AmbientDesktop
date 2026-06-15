import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import {
  AMBIENT_MODEL_OPTIONS,
  ambientModelLabel,
  type AmbientModelOption,
} from "../../shared/ambientModels";

export type ComposerModelPickerOption = Pick<AmbientModelOption, "id" | "label">;

export function composerModelPickerOptions(
  catalogOptions: AmbientModelOption[] | undefined,
): ComposerModelPickerOption[] {
  return catalogOptions && catalogOptions.length > 0 ? catalogOptions : AMBIENT_MODEL_OPTIONS;
}

export function selectedComposerModelPickerOption({
  modelId,
  options,
}: {
  modelId: string | undefined;
  options: readonly ComposerModelPickerOption[];
}): ComposerModelPickerOption {
  const selectedModelId = modelId ?? options[0]?.id ?? AMBIENT_MODEL_OPTIONS[0].id;
  return options.find((option) => option.id === selectedModelId) ?? { id: selectedModelId, label: ambientModelLabel(selectedModelId) };
}

export function useAppComposerModelPickerControls({
  activeThreadId,
  catalogOptions,
  selectedModelId,
}: {
  activeThreadId: string | undefined;
  catalogOptions: AmbientModelOption[] | undefined;
  selectedModelId: string | undefined;
}): {
  modelPickerRef: RefObject<HTMLDivElement | null>;
  modelPickerButtonRef: RefObject<HTMLButtonElement | null>;
  modelPickerOpen: boolean;
  setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
  composerModelOptions: ComposerModelPickerOption[];
  selectedComposerModelOption: ComposerModelPickerOption;
  focusModelPickerOption: (index?: number) => void;
} {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const modelPickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerModelOptions = useMemo(() => composerModelPickerOptions(catalogOptions), [catalogOptions]);
  const selectedComposerModelOption = useMemo(
    () => selectedComposerModelPickerOption({ modelId: selectedModelId, options: composerModelOptions }),
    [composerModelOptions, selectedModelId],
  );

  useEffect(() => {
    setModelPickerOpen(false);
  }, [activeThreadId, selectedModelId]);

  useEffect(() => {
    if (!modelPickerOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !modelPickerRef.current?.contains(target)) setModelPickerOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelPickerOpen(false);
        modelPickerButtonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelPickerOpen]);

  return {
    modelPickerRef,
    modelPickerButtonRef,
    modelPickerOpen,
    setModelPickerOpen,
    composerModelOptions,
    selectedComposerModelOption,
    focusModelPickerOption(index = 0) {
      window.setTimeout(() => document.getElementById(`composer-model-picker-option-${index}`)?.focus(), 0);
    },
  };
}
