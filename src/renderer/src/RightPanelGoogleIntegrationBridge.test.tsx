import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useRightPanelGoogleIntegrationBridge } from "./RightPanelGoogleIntegrationBridge";

describe("RightPanelGoogleIntegrationBridge", () => {
  it("starts without a Google integration and exposes the shared update callback", () => {
    let bridge: ReturnType<typeof useRightPanelGoogleIntegrationBridge> | undefined;

    function Probe() {
      bridge = useRightPanelGoogleIntegrationBridge();
      return <span>{bridge.googleIntegration ? "connected" : "empty"}</span>;
    }

    expect(renderToStaticMarkup(<Probe />)).toContain("empty");
    expect(bridge?.googleIntegration).toBeUndefined();
    expect(typeof bridge?.onGoogleIntegrationChanged).toBe("function");
  });
});
