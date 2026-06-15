import { describe, expect, it } from "vitest";

import type { BrowserCapabilityState } from "../../shared/types";
import {
  browserCredentialSaveInputFromForm,
  browserProfileModeForState,
  type BrowserCredentialForm,
} from "./RightPanelBrowserController";

describe("RightPanelBrowserController", () => {
  it("selects the copied browser profile when state indicates Chrome profile support", () => {
    expect(browserProfileModeForState()).toBe("isolated");
    expect(browserProfileModeForState(browserState({ profileMode: "copied" }))).toBe("copied");
    expect(browserProfileModeForState(browserState({ copiedProfileAvailable: true }))).toBe("copied");
    expect(browserProfileModeForState(browserState({ sourceProfilePath: "/Users/test/Chrome" }))).toBe("copied");
  });

  it("falls back to the isolated browser profile without copied Chrome support", () => {
    expect(browserProfileModeForState(browserState())).toBe("isolated");
    expect(browserProfileModeForState(browserState({ chromeAvailable: false, copiedProfileAvailable: true }))).toBe("isolated");
  });

  it("normalizes browser credential save input without changing secrets", () => {
    const form: BrowserCredentialForm = {
      id: "credential-1",
      label: "  Admin  ",
      origin: "  https://example.test  ",
      username: "  travis  ",
      password: "  keep surrounding spaces  ",
      scope: "workspace",
    };

    expect(browserCredentialSaveInputFromForm(form)).toEqual({
      id: "credential-1",
      label: "Admin",
      origin: "https://example.test",
      username: "travis",
      password: "  keep surrounding spaces  ",
      scope: "workspace",
    });
  });
});

function browserState(overrides: Partial<BrowserCapabilityState> = {}): BrowserCapabilityState {
  return {
    running: false,
    profileMode: "isolated",
    runtime: "chrome",
    internalAvailable: true,
    copiedProfileAvailable: false,
    chromeAvailable: true,
    browserLoginBrokerAvailable: false,
    ...overrides,
  };
}
