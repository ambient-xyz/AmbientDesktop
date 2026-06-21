import { useMemo, useRef, useState } from "react";

import type { SlashCommandSelection } from "../../shared/slashCommandTypes";
import {
  createComposerDraftStore,
  type ChatComposerInputHandle,
} from "./AppComposerControls";
import { slashCommandComposerCanSubmit } from "./slashCommandUiModel";

export type AppComposerDraftSetOptions = {
  focusEnd?: boolean;
  clearSlashCommandSelection?: boolean;
};

export function useAppComposerShellState() {
  const [composerCanSubmit, setComposerCanSubmit] = useState(false);
  const composerInputRef = useRef<ChatComposerInputHandle>(null);
  const composerDraftRef = useRef("");
  const composerDraftStore = useMemo(() => createComposerDraftStore(), []);
  const selectedSlashCommandRef = useRef<SlashCommandSelection | undefined>(undefined);
  const [selectedSlashCommand, setSelectedSlashCommandState] =
    useState<SlashCommandSelection | undefined>();

  function getComposerDraft() {
    return composerInputRef.current?.getValue() ?? composerDraftRef.current;
  }

  function focusComposerEnd() {
    window.setTimeout(() => composerInputRef.current?.focusEnd(), 0);
  }

  function setComposerDraft(value: string, options: AppComposerDraftSetOptions = {}) {
    const slashSelection = options.clearSlashCommandSelection
      ? undefined
      : selectedSlashCommandRef.current;
    if (options.clearSlashCommandSelection && selectedSlashCommandRef.current) {
      selectedSlashCommandRef.current = undefined;
      setSelectedSlashCommandState(undefined);
    }
    composerDraftRef.current = value;
    composerDraftStore.set(value);
    composerInputRef.current?.setValue(value);
    setComposerCanSubmit((current) => {
      const next = slashCommandComposerCanSubmit(value, slashSelection);
      return current === next ? current : next;
    });
    if (options.focusEnd) focusComposerEnd();
  }

  function setSelectedSlashCommand(next: SlashCommandSelection | undefined): void {
    selectedSlashCommandRef.current = next;
    setSelectedSlashCommandState(next);
    setComposerCanSubmit((current) => {
      const canSubmit = slashCommandComposerCanSubmit(composerDraftRef.current, next);
      return current === canSubmit ? current : canSubmit;
    });
  }

  function updateComposerDraftValue(value: string) {
    composerDraftRef.current = value;
    composerDraftStore.set(value);
    setComposerCanSubmit((current) => {
      const next = slashCommandComposerCanSubmit(value, selectedSlashCommandRef.current);
      return current === next ? current : next;
    });
  }

  return {
    composerCanSubmit,
    composerInputRef,
    composerDraftStore,
    selectedSlashCommand,
    selectedSlashCommandRef,
    getComposerDraft,
    setComposerDraft,
    setSelectedSlashCommand,
    updateComposerDraftValue,
    focusComposerEnd,
  };
}
