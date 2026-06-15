import { useEffect } from "react";
import type { MutableRefObject } from "react";

import type { DesktopState } from "../../shared/types";
import type { SttComposerUiState } from "./AppComposerShell";
import {
  shouldSuppressSttShortcutEventTarget,
  sttShortcutMatchesEvent,
  sttShortcutReleaseMatchesEvent,
} from "./sttShortcut";
import type { SttMicrophoneRecorder } from "./sttMicrophoneRecorder";

export function shouldCancelSttComposerForActiveThread({
  activeThreadId,
  composerThreadId,
}: {
  activeThreadId: string | undefined;
  composerThreadId: string | undefined;
}): boolean {
  return Boolean(activeThreadId && composerThreadId && composerThreadId !== activeThreadId);
}

export function sttComposerPushToTalkBlocked({
  hasRecorder,
  status,
}: {
  hasRecorder: boolean;
  status: SttComposerUiState["status"];
}): boolean {
  return hasRecorder || status === "saving" || status === "transcribing";
}

export function useAppSttLifecycleEffects({
  cancelSttComposerRecording,
  loadSttMicrophoneDeviceList,
  running,
  startSttComposerRecording,
  state,
  stopSttComposerRecording,
  sttComposerRecorderRef,
  sttComposerShortcutActiveRef,
  sttComposerStatus,
  sttComposerThreadRef,
}: {
  cancelSttComposerRecording: () => void;
  loadSttMicrophoneDeviceList: () => void | Promise<void>;
  running: boolean;
  startSttComposerRecording: (options: { requireShortcutActive?: boolean }) => void | Promise<void>;
  state: DesktopState | undefined;
  stopSttComposerRecording: () => void | Promise<void>;
  sttComposerRecorderRef: MutableRefObject<SttMicrophoneRecorder | undefined>;
  sttComposerShortcutActiveRef: MutableRefObject<boolean>;
  sttComposerStatus: SttComposerUiState["status"];
  sttComposerThreadRef: MutableRefObject<string | undefined>;
}): void {
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const refreshMicrophones = () => void loadSttMicrophoneDeviceList();
    mediaDevices.addEventListener("devicechange", refreshMicrophones);
    return () => mediaDevices.removeEventListener("devicechange", refreshMicrophones);
  }, []);

  useEffect(() => {
    const activeThreadId = state?.activeThreadId;
    if (!shouldCancelSttComposerForActiveThread({ activeThreadId, composerThreadId: sttComposerThreadRef.current })) return;
    cancelSttComposerRecording();
  }, [state?.activeThreadId]);

  useEffect(() => {
    const shortcut = state?.settings.stt.pushToTalkShortcut;
    if (!shortcut) {
      sttComposerShortcutActiveRef.current = false;
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !sttShortcutMatchesEvent(shortcut, event)) return;
      if (shouldSuppressSttShortcutEventTarget(event.target, shortcut)) return;
      event.preventDefault();
      event.stopPropagation();
      if (sttComposerPushToTalkBlocked({ hasRecorder: Boolean(sttComposerRecorderRef.current), status: sttComposerStatus })) return;
      sttComposerShortcutActiveRef.current = true;
      void startSttComposerRecording({ requireShortcutActive: true });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!sttComposerShortcutActiveRef.current || !sttShortcutReleaseMatchesEvent(shortcut, event)) return;
      event.preventDefault();
      event.stopPropagation();
      sttComposerShortcutActiveRef.current = false;
      if (sttComposerRecorderRef.current) void stopSttComposerRecording();
    };

    const onBlur = () => {
      if (!sttComposerShortcutActiveRef.current) return;
      sttComposerShortcutActiveRef.current = false;
      if (sttComposerRecorderRef.current) void stopSttComposerRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [state, sttComposerStatus, running]);
}
