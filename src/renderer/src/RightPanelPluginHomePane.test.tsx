import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RightPanelPluginHomePane, RightPanelPluginOverviewHero } from "./RightPanelPluginHomePane";

function InfoTooltip({ label, text }: { label?: string; text: string }) {
  return <span data-label={label}>{text}</span>;
}

describe("RightPanelPluginHomePane", () => {
  it("renders the plugin overview hero from explicit summary counts", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginOverviewHero
        InfoTooltip={InfoTooltip}
        pluginCount={12}
        availableCapabilityCount={7}
        trustRequiredCapabilityCount={2}
        attentionCapabilityCount={3}
      />,
    );

    expect(html).toContain("Ambient Plugin Host");
    expect(html).toContain("Plugins add capabilities to Ambient.");
    expect(html).toContain("12");
    expect(html).toContain("Plugins known");
    expect(html).toContain("7");
    expect(html).toContain("Available capabilities");
    expect(html).toContain("2");
    expect(html).toContain("Need trust");
    expect(html).toContain("3");
    expect(html).toContain("Need attention");
  });

  it("renders the home runtime model and attention summary without owning host state", () => {
    const html = renderToStaticMarkup(
      <RightPanelPluginHomePane
        permissionMode="full-access"
        installedOrDiscoveredPluginCount={5}
        importablePluginCount={4}
        capabilityCount={9}
        sourceCount={3}
        trustRequiredCapabilityCount={1}
        authRequiredCapabilityCount={2}
        errorCapabilityCount={1}
      />,
    );

    expect(html).toContain("Runtime Model");
    expect(html).toContain("Full access");
    expect(html).toContain("5 installed or discovered");
    expect(html).toContain("4 importable");
    expect(html).toContain("9 capabilities");
    expect(html).toContain("3 sources");
    expect(html).toContain("Attention");
    expect(html).toContain("4 items");
    expect(html).toContain("1 need trust");
    expect(html).toContain("2 need auth");
    expect(html).toContain("1 errors");
  });
});
