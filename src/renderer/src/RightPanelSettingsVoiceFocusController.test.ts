import { describe, expect, it, vi } from "vitest";

import {
  readFirstRunCapabilityOnboardingDismissed,
  writeFirstRunCapabilityOnboardingDismissed,
} from "./RightPanelSettingsVoiceFocusController";

describe("RightPanelSettingsVoiceFocusController", () => {
  it("reads persisted first-run onboarding dismissal only from the expected flag", () => {
    const storage = {
      getItem: vi.fn((key: string) => (key === "ambient.firstRunCapabilityOnboarding.dismissed.v1" ? "1" : null)),
    };

    expect(readFirstRunCapabilityOnboardingDismissed(storage)).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith("ambient.firstRunCapabilityOnboarding.dismissed.v1");
  });

  it("treats unavailable localStorage as not dismissed", () => {
    expect(
      readFirstRunCapabilityOnboardingDismissed({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });

  it("persists and clears first-run onboarding dismissal best-effort", () => {
    const storage = {
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };

    writeFirstRunCapabilityOnboardingDismissed(true, storage);
    writeFirstRunCapabilityOnboardingDismissed(false, storage);

    expect(storage.setItem).toHaveBeenCalledWith("ambient.firstRunCapabilityOnboarding.dismissed.v1", "1");
    expect(storage.removeItem).toHaveBeenCalledWith("ambient.firstRunCapabilityOnboarding.dismissed.v1");
  });
});
