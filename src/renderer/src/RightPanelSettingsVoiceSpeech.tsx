import { SettingsSection } from "./RightPanelSettingsPrimitives";
import { RightPanelSpeechSettingsRows } from "./RightPanelSpeechSettingsRows";
import { RightPanelVoiceSettingsRows } from "./RightPanelVoiceSettingsRows";
import type {
  RightPanelSpeechSettingsSectionProps,
  RightPanelVoiceSettingsSectionProps,
} from "./RightPanelSettingsVoiceSpeechTypes";

export type { RightPanelSpeechSettingsSectionProps, RightPanelVoiceSettingsSectionProps } from "./RightPanelSettingsVoiceSpeechTypes";

export function RightPanelVoiceSettingsSection(props: RightPanelVoiceSettingsSectionProps) {
  return (
    <SettingsSection
      id="voice"
      title="Voice Output"
      description="Configure spoken assistant replies, provider health, voice selection, and artifact retention."
      badges={<span className="settings-section-badge">{props.voiceProviderModel.statusLabel}</span>}
      focused={props.focusedSettingsSection === "voice"}
      sectionRef={props.voiceSettingsRowRef}
    >
      <RightPanelVoiceSettingsRows {...props} />
    </SettingsSection>
  );
}

export function RightPanelSpeechSettingsSection(props: RightPanelSpeechSettingsSectionProps) {
  return (
    <SettingsSection
      id="speech"
      title="Speech Input"
      description="Configure push-to-talk, transcription provider setup, microphone validation, and speech behavior."
      badges={<span className="settings-section-badge">{props.sttProviderModel.statusLabel}</span>}
    >
      <RightPanelSpeechSettingsRows {...props} />
    </SettingsSection>
  );
}
