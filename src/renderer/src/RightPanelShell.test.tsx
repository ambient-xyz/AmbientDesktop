import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  RightPanelShell,
  rightPanelShellClassName,
} from "./RightPanelShell";

describe("RightPanelShell", () => {
  it("keeps panel host classes and close affordance stable", () => {
    const markup = renderToStaticMarkup(
      <RightPanelShell
        panel="browser"
        title="Browser"
        panelWidth={420}
        browserFocused
        onClose={vi.fn()}
      >
        <div className="panel-child">Browser body</div>
      </RightPanelShell>,
    );

    expect(markup).toContain("right-panel");
    expect(markup).toContain("browser-focused-panel");
    expect(markup).toContain("style=\"width:420px\"");
    expect(markup).toContain("Close Browser panel");
    expect(markup).toContain("panel-child");
  });

  it("marks file and settings panel hosts for their existing layout CSS", () => {
    expect(rightPanelShellClassName("files", false)).toContain("files-panel-host");
    expect(rightPanelShellClassName("settings", false)).toContain("settings-panel-host");
    expect(rightPanelShellClassName("browser", false)).not.toContain("browser-focused-panel");
  });
});
