import { describe, expect, it } from "vitest";

import type { AmbientModelOption } from "../../shared/ambientModels";
import {
  composerModelPickerOptions,
  selectedComposerModelPickerOption,
} from "./AppComposerModelPickerControls";

describe("AppComposerModelPickerControls", () => {
  it("uses catalog options when the runtime catalog exposes selectable models", () => {
    const catalogOptions = [
      modelOption({ id: "provider/alpha", label: "Alpha" }),
      modelOption({ id: "provider/beta", label: "Beta" }),
    ];

    expect(composerModelPickerOptions(catalogOptions)).toBe(catalogOptions);
  });

  it("falls back to bundled Ambient model options when the catalog has no selectable models", () => {
    const options = composerModelPickerOptions([]);

    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toMatchObject({ id: expect.any(String), label: expect.any(String) });
  });

  it("selects the active model or builds a stable label for unknown model ids", () => {
    const options = [
      modelOption({ id: "provider/alpha", label: "Alpha" }),
      modelOption({ id: "provider/beta", label: "Beta" }),
    ];

    expect(selectedComposerModelPickerOption({ modelId: "provider/beta", options })).toEqual(options[1]);
    expect(selectedComposerModelPickerOption({ modelId: "provider/custom", options })).toEqual({
      id: "provider/custom",
      label: "provider/custom (unavailable)",
    });
  });
});

function modelOption(overrides: Pick<AmbientModelOption, "id" | "label">): AmbientModelOption {
  return {
    id: overrides.id,
    label: overrides.label,
    profileId: `${overrides.id}:profile`,
    providerId: "ambient",
    locality: "cloud",
    costClass: "included",
    privacyLabel: "Ambient managed cloud model",
  };
}
