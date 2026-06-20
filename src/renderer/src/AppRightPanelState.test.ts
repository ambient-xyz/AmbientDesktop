import { describe, expect, it } from "vitest";

import {
  APP_RIGHT_PANEL_DEFAULT_WIDTH,
  createInitialAppRightPanelState,
} from "./AppRightPanelState";

describe("AppRightPanelState", () => {
  it("keeps the right panel owner initial state aligned with the previous App shell defaults", () => {
    expect(createInitialAppRightPanelState()).toEqual({
      rightPanel: undefined,
      rightPanelWidth: APP_RIGHT_PANEL_DEFAULT_WIDTH,
      settingsFocusRequest: undefined,
      artifactPreviewRequest: undefined,
      localFilePreviewRequest: undefined,
      gitPanelTabRequest: { tab: "summary", nonce: 0 },
    });
  });
});
