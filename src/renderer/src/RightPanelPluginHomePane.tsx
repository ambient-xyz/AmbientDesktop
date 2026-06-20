import type { ComponentType } from "react";
import type { DesktopState } from "../../shared/desktopTypes";

type InfoTooltipProps = {
  label?: string;
  text: string;
  className?: string;
};

export type RightPanelPluginOverviewHeroProps = {
  InfoTooltip: ComponentType<InfoTooltipProps>;
  pluginCount: number;
  availableCapabilityCount: number;
  trustRequiredCapabilityCount: number;
  attentionCapabilityCount: number;
};

export function RightPanelPluginOverviewHero({
  InfoTooltip,
  pluginCount,
  availableCapabilityCount,
  trustRequiredCapabilityCount,
  attentionCapabilityCount,
}: RightPanelPluginOverviewHeroProps) {
  return (
    <section className="plugin-hero">
      <div>
        <div className="panel-section-heading">
          <strong>Ambient Plugin Host</strong>
          <InfoTooltip
            label="What is this?"
            text="Plugins add capabilities to Ambient. Ambient installs and governs Codex plugins, Pi packages, and built-in capabilities, then exposes approved tools and skills to chat, workflows, and automations."
          />
        </div>
        <p>
          Plugins are managed by Ambient, not by a single runtime. Pi chat, Workflow Agent, and automations consume the same enabled
          and trusted capabilities.
        </p>
      </div>
      <div className="plugin-home-grid">
        <div><strong>{pluginCount}</strong><span>Plugins known</span></div>
        <div><strong>{availableCapabilityCount}</strong><span>Available capabilities</span></div>
        <div><strong>{trustRequiredCapabilityCount}</strong><span>Need trust</span></div>
        <div><strong>{attentionCapabilityCount}</strong><span>Need attention</span></div>
      </div>
    </section>
  );
}

export type RightPanelPluginHomePaneProps = {
  permissionMode: DesktopState["settings"]["permissionMode"];
  installedOrDiscoveredPluginCount: number;
  importablePluginCount: number;
  capabilityCount: number;
  sourceCount: number;
  trustRequiredCapabilityCount: number;
  authRequiredCapabilityCount: number;
  errorCapabilityCount: number;
};

export function RightPanelPluginHomePane({
  permissionMode,
  installedOrDiscoveredPluginCount,
  importablePluginCount,
  capabilityCount,
  sourceCount,
  trustRequiredCapabilityCount,
  authRequiredCapabilityCount,
  errorCapabilityCount,
}: RightPanelPluginHomePaneProps) {
  return (
    <div className="plugin-dashboard">
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Runtime Model</strong>
          <span>{permissionMode === "full-access" ? "Full access" : "Workspace scope"}</span>
        </div>
        <p>
          Ambient keeps install, enablement, trust, auth, and diagnostics in one place. Pi and Workflow Agent receive only the
          capabilities approved for the current workspace.
        </p>
        <div className="plugin-badges">
          <span>{installedOrDiscoveredPluginCount} installed or discovered</span>
          <span>{importablePluginCount} importable</span>
          <span>{capabilityCount} capabilities</span>
          <span>{sourceCount} sources</span>
        </div>
      </section>
      <section className="plugin-row">
        <div className="panel-section-heading">
          <strong>Attention</strong>
          <span>{trustRequiredCapabilityCount + authRequiredCapabilityCount + errorCapabilityCount} items</span>
        </div>
        <div className="plugin-badges">
          <span>{trustRequiredCapabilityCount} need trust</span>
          <span>{authRequiredCapabilityCount} need auth</span>
          <span>{errorCapabilityCount} errors</span>
        </div>
        <p>Trust allows local plugin MCP tools to run. Auth is separate and applies to app or connector accounts.</p>
      </section>
    </div>
  );
}
