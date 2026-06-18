import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { MessageVoiceState, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import { voiceThreadStatusDismissKey } from "./AppChatChrome";
import {
  latestReadyVoiceAutoplayTarget,
  nextVoiceAutoplayDecision,
  voiceProviderForCapabilityId,
  voiceProviderLabelMap,
  voiceStateMatchesSelectedProvider,
  voiceThreadStatusModel,
} from "./voiceUiModel";

type VoiceSettings = DesktopState["settings"]["voice"];
type ThreadVoiceStatus = ReturnType<typeof voiceThreadStatusModel>;

export function activeThreadVoiceStatusPresentation({
  activeThreadId,
  dismissedKeys,
  providerCapabilityId,
  status,
}: {
  activeThreadId: string | undefined;
  dismissedKeys: Set<string>;
  providerCapabilityId: string | undefined;
  status: ThreadVoiceStatus | undefined;
}): {
  dismissKey?: string;
  visible: boolean;
} {
  const dismissKey = activeThreadId && status ? voiceThreadStatusDismissKey(activeThreadId, providerCapabilityId, status) : undefined;
  return {
    dismissKey,
    visible: Boolean(status?.visible && dismissKey && !dismissedKeys.has(dismissKey)),
  };
}

export function activeVoiceMessageStillPlayable({
  activeVoiceMessageId,
  messageVoiceStates,
  providerCapabilityId,
}: {
  activeVoiceMessageId: string | undefined;
  messageVoiceStates: Record<string, MessageVoiceState> | undefined;
  providerCapabilityId: string | undefined;
}): boolean {
  if (!activeVoiceMessageId) return false;
  const voiceState = messageVoiceStates?.[activeVoiceMessageId];
  return Boolean(
    voiceState?.status === "ready" &&
    voiceState.mediaUrl &&
    voiceStateMatchesSelectedProvider(voiceState, providerCapabilityId),
  );
}

export function useAppVoiceThreadControls({
  activeThreadId,
  messages,
  messageVoiceStates,
  settings,
  voiceProviders,
}: {
  activeThreadId: string | undefined;
  messages: DesktopState["messages"] | undefined;
  messageVoiceStates: DesktopState["messageVoiceStates"] | undefined;
  settings: VoiceSettings | undefined;
  voiceProviders: VoiceProviderCandidate[];
}): {
  voiceProviderLabels: ReturnType<typeof voiceProviderLabelMap>;
  latestReadyVoiceAutoplay: ReturnType<typeof latestReadyVoiceAutoplayTarget>;
  autoplayVoiceKey: string | undefined;
  activeVoiceMessageId: string | undefined;
  setActiveVoiceMessageId: Dispatch<SetStateAction<string | undefined>>;
  activeThreadVoiceStatus: ThreadVoiceStatus | undefined;
  activeThreadVoiceStatusDismissKey: string | undefined;
  activeThreadVoiceStatusVisible: boolean;
  dismissActiveThreadVoiceStatus: (dismissKey: string) => void;
} {
  const [activeVoiceMessageId, setActiveVoiceMessageId] = useState<string | undefined>();
  const [autoplayVoiceKey, setAutoplayVoiceKey] = useState<string | undefined>();
  const [dismissedVoiceStatusKeys, setDismissedVoiceStatusKeys] = useState<Set<string>>(() => new Set());
  const voiceAutoplayInitializedRef = useRef(false);
  const lastVoiceAutoplayKeyRef = useRef<string | undefined>(undefined);
  const voiceProviderLabels = useMemo(() => voiceProviderLabelMap(voiceProviders), [voiceProviders]);
  const latestReadyVoiceAutoplay = useMemo(() => {
    return latestReadyVoiceAutoplayTarget({
      messages: messages ?? [],
      messageVoiceStates: messageVoiceStates ?? {},
      autoplay: Boolean(settings?.autoplay),
      providerCapabilityId: settings?.providerCapabilityId,
    });
  }, [messageVoiceStates, messages, settings?.autoplay, settings?.providerCapabilityId]);
  const activeThreadVoiceStatus = useMemo(() => {
    if (!settings) return undefined;
    return voiceThreadStatusModel({
      settings,
      messageVoiceStates: messageVoiceStates ?? {},
      providerLabels: voiceProviderLabels,
      selectedProvider: voiceProviderForCapabilityId(voiceProviders, settings.providerCapabilityId),
    });
  }, [messageVoiceStates, settings, voiceProviderLabels, voiceProviders]);
  const {
    dismissKey: activeThreadVoiceStatusDismissKey,
    visible: activeThreadVoiceStatusVisible,
  } = activeThreadVoiceStatusPresentation({
    activeThreadId,
    dismissedKeys: dismissedVoiceStatusKeys,
    providerCapabilityId: settings?.providerCapabilityId,
    status: activeThreadVoiceStatus,
  });

  useEffect(() => {
    voiceAutoplayInitializedRef.current = false;
    lastVoiceAutoplayKeyRef.current = undefined;
    setAutoplayVoiceKey(undefined);
    setActiveVoiceMessageId(undefined);
  }, [activeThreadId]);

  useEffect(() => {
    const key = latestReadyVoiceAutoplay?.key;
    const decision = nextVoiceAutoplayDecision(
      { initialized: voiceAutoplayInitializedRef.current, lastKey: lastVoiceAutoplayKeyRef.current },
      key,
    );
    voiceAutoplayInitializedRef.current = decision.next.initialized;
    lastVoiceAutoplayKeyRef.current = decision.next.lastKey;
    setAutoplayVoiceKey(decision.autoplayKey);
  }, [latestReadyVoiceAutoplay?.key]);

  useEffect(() => {
    if (!activeVoiceMessageId) return;
    if (activeVoiceMessageStillPlayable({ activeVoiceMessageId, messageVoiceStates, providerCapabilityId: settings?.providerCapabilityId })) return;
    setActiveVoiceMessageId(undefined);
  }, [activeVoiceMessageId, messageVoiceStates, settings?.providerCapabilityId]);

  useEffect(() => {
    void window.ambientDesktop.setSttTtsSpeaking({ speaking: Boolean(activeVoiceMessageId) }).catch(() => undefined);
  }, [activeVoiceMessageId]);

  return {
    voiceProviderLabels,
    latestReadyVoiceAutoplay,
    autoplayVoiceKey,
    activeVoiceMessageId,
    setActiveVoiceMessageId,
    activeThreadVoiceStatus,
    activeThreadVoiceStatusDismissKey,
    activeThreadVoiceStatusVisible,
    dismissActiveThreadVoiceStatus(dismissKey: string) {
      setDismissedVoiceStatusKeys((current) => {
        const next = new Set(current);
        next.add(dismissKey);
        return next;
      });
    },
  };
}
