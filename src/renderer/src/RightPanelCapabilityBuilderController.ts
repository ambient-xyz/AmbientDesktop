import { useState } from "react";

import {
  buildCapabilityBuilderPrompt,
  defaultCapabilityBuilderLauncherDraft,
  type CapabilityBuilderLauncherDraft,
} from "./pluginUiModel";

export function capabilityBuilderDraftWithPatch(
  current: CapabilityBuilderLauncherDraft,
  patch: Partial<CapabilityBuilderLauncherDraft>,
): CapabilityBuilderLauncherDraft {
  return { ...current, ...patch };
}

export function capabilityBuilderLauncherCanSubmit(
  draft: CapabilityBuilderLauncherDraft,
  running: boolean,
): boolean {
  return Boolean(draft.goal.trim()) && !running;
}

export function useRightPanelCapabilityBuilderController({
  running,
  onStartCapabilityBuilder,
}: {
  running: boolean;
  onStartCapabilityBuilder: (prompt: string, newChat: boolean, activityLine?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CapabilityBuilderLauncherDraft>(defaultCapabilityBuilderLauncherDraft);
  const [newChat, setNewChat] = useState(true);
  const [busy, setBusy] = useState(false);

  function updateDraft(patch: Partial<CapabilityBuilderLauncherDraft>) {
    setDraft((current) => capabilityBuilderDraftWithPatch(current, patch));
  }

  function close() {
    if (!busy) setOpen(false);
  }

  async function submit() {
    if (!capabilityBuilderLauncherCanSubmit(draft, running)) return;
    setBusy(true);
    try {
      await onStartCapabilityBuilder(buildCapabilityBuilderPrompt(draft), newChat);
      setOpen(false);
      setDraft(defaultCapabilityBuilderLauncherDraft());
      setNewChat(true);
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    draft,
    updateDraft,
    newChat,
    setNewChat,
    busy,
    close,
    submit,
  };
}
