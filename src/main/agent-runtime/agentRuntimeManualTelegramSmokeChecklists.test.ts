import { describe, expect, it } from "vitest";
import {
  manualTelegramDirectoryListSmokeChecklist,
  manualTelegramDirectorySmokeChecklist,
  manualTelegramGuidedOwnerLoopSmokeChecklist,
  manualTelegramOwnerHandoffCheckSmokeChecklist,
  manualTelegramOwnerLoopSmokeChecklist,
} from "./agentRuntimeManualTelegramSmokeChecklists";

describe("manual Telegram directory smoke checklist", () => {
  it("explains required real-profile inputs without suggesting UI scraping", () => {
    const checklist = manualTelegramDirectorySmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      ownerUserId: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_PROFILE_ID");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_USER_ID");
    expect(checklist).toContain("AMBIENT_AGENT_TELEGRAM_API_ID");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
    expect(checklist).toContain("existing Ambient owner binding");
    expect(checklist).toContain("previous approved bridge event or polling result");
  });
});

describe("manual Telegram directory-list smoke checklist", () => {
  it("explains the metadata-only conversation picker without requiring owner ids", () => {
    const checklist = manualTelegramDirectoryListSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_DIRECTORY_LIST_SMOKE");
    expect(checklist).toContain("metadata-only conversation directory");
    expect(checklist).toContain("AMBIENT_AGENT_TELEGRAM_API_ID");
    expect(checklist).toContain("Does not read message bodies");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual Telegram owner-handoff check smoke checklist", () => {
  it("explains no-match preflight and same-account outgoing limitations", () => {
    const checklist = manualTelegramOwnerHandoffCheckSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_HANDOFF_CHECK_SMOKE");
    expect(checklist).toContain("Accepts no-match as a valid preflight");
    expect(checklist).toContain("intentionally ignores outgoing messages");
    expect(checklist).toContain("separate inbound owner/delegate account");
    expect(checklist).toContain("Does not create bindings");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual guided Telegram owner loop smoke checklist", () => {
  it("explains the live inbound waiting sequence", () => {
    const checklist = manualTelegramGuidedOwnerLoopSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_SMOKE");
    expect(checklist).toContain("ambient_messaging_telegram_owner_loop_activation_plan before low-level tools");
    expect(checklist).toContain("Start the guided script first");
    expect(checklist).toContain("Send the setup code from an inbound owner/delegate account");
    expect(checklist).toContain("calls the activation plan again after binding creation");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_GUIDED_OWNER_LOOP_POLLING_RUNNER");
    expect(checklist).toContain("will not satisfy owner handoff");
    expect(checklist).toContain("Does not ask Pi to scrape Telegram Desktop");
  });
});

describe("manual Telegram owner loop smoke checklist", () => {
  it("explains the pre-sent setup code and command requirements", () => {
    const checklist = manualTelegramOwnerLoopSmokeChecklist({
      profileId: undefined,
      stateRoot: undefined,
      conversationId: undefined,
      setupCode: undefined,
      apiCredentialsPresent: false,
    });

    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SETUP_CODE");
    expect(checklist).toContain("Send the setup code");
    expect(checklist).toContain("Then send the relay command");
    expect(checklist).toContain("switch project Manual Relay Smoke");
    expect(checklist).toContain("provider-neutral reply alias");
    expect(checklist).toContain("AMBIENT_MANUAL_TELEGRAM_OWNER_LOOP_SEND_REPLY");
    expect(checklist).toContain("bridge intentionally skips outgoing unread items");
    expect(checklist).toContain("ownerHandoffSourceMessageId");
    expect(checklist).toContain("Do not ask Pi to scrape Telegram Desktop");
  });
});
