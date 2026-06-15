import {
  Package,
  Plug,
  Settings,
  Zap,
} from "lucide-react";

import type {
  AmbientPluginRegistry,
  ProviderCatalogSettingsCard,
} from "../../shared/types";
import type { WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import {
  formatAmbientAvailability,
  formatAmbientCapabilityKind,
  formatAmbientPluginSourceKind,
} from "./pluginUiModel";
import { ProviderCatalogSettingsCards } from "./RightPanel";
import {
  welcomeCoreSetupSections,
  type WelcomeSetupSection,
} from "./welcomeSetupUiModel";

export function WelcomeSetupMessage({
  pageKind,
  catalogCards,
  catalogVersion,
  generatedAt,
  running,
  registry,
  onStartFirstRun,
  onStartProviderCard,
  onStartRemoteSurfaceActivation,
  onOpenSettings,
  onOpenPlugins,
  onOpenCapabilityBuilder,
}: {
  pageKind: Exclude<WelcomeOnboardingPageKind, "instructions">;
  catalogCards: ProviderCatalogSettingsCard[];
  catalogVersion: string;
  generatedAt: string;
  running: boolean;
  registry?: AmbientPluginRegistry;
  onStartFirstRun: () => void;
  onStartProviderCard: (card: ProviderCatalogSettingsCard) => void;
  onStartRemoteSurfaceActivation: (provider: "telegram" | "signal" | "choose") => void;
  onOpenSettings: () => void;
  onOpenPlugins: () => void;
  onOpenCapabilityBuilder: () => void;
}) {
  if (pageKind === "core_setup") {
    const sections = welcomeCoreSetupSections(catalogCards);
    return (
      <article className="welcome-setup-message">
        <header className="welcome-setup-header">
          <div>
            <h1>Core Setup</h1>
            <p>Current product-level capability setup, generated from the same catalog and Settings actions Ambient Desktop uses elsewhere.</p>
          </div>
          <div className="welcome-setup-actions">
            <button type="button" className="panel-button icon-panel-button" disabled={running} onClick={onStartFirstRun}>
              <Zap size={14} />
              Start guided setup
            </button>
            <button type="button" className="panel-button icon-panel-button" onClick={onOpenSettings}>
              <Settings size={14} />
              Open Settings
            </button>
          </div>
        </header>
        {sections.map((section) => (
          <WelcomeCoreSetupSection
            key={section.id}
            section={section}
            catalogVersion={catalogVersion}
            generatedAt={generatedAt}
            running={running}
            onStart={onStartProviderCard}
          />
        ))}
        <section className="plugin-row welcome-setup-row">
          <div className="plugin-row-header">
            <strong>MCP Runtime and Web Research</strong>
            <div className="plugin-row-actions">
              <button type="button" className="panel-button mini" onClick={onOpenSettings}>
                Review setup
              </button>
            </div>
          </div>
          <p>
            Container runtime recovery, ToolHive readiness, and Ambient's default Scrapling web research capability remain approval-gated.
          </p>
        </section>
        <section className="plugin-row welcome-setup-row">
          <div className="plugin-row-header">
            <strong>Remote Control</strong>
            <div className="plugin-row-actions">
              <button type="button" className="panel-button mini" disabled={running} onClick={() => onStartRemoteSurfaceActivation("telegram")}>
                Set up Telegram
              </button>
              <button type="button" className="panel-button mini" disabled={running} onClick={() => onStartRemoteSurfaceActivation("signal")}>
                Check Signal
              </button>
            </div>
          </div>
          <p>Remote Ambient Surface setup starts the same reviewed chat-first activation prompts used in Settings.</p>
        </section>
        <section className="plugin-row welcome-setup-row">
          <div className="plugin-row-header">
            <strong>Security and Access</strong>
            <div className="plugin-row-actions">
              <button type="button" className="panel-button mini" onClick={onOpenSettings}>
                Review access
              </button>
            </div>
          </div>
          <p>API keys, permission grants, browser credentials, and secret flows stay in Ambient-managed approval surfaces.</p>
        </section>
      </article>
    );
  }

  const { capabilities, installedPluginCount, generatedCapabilityCount } = welcomePluginSetupStats(registry);
  return (
    <article className="welcome-setup-message">
      <header className="welcome-setup-header">
        <div>
          <h1>Plugin Setup</h1>
          <p>Extension setup for custom plugins, Pi packages, custom MCP servers, generated capabilities, and workspace integrations.</p>
        </div>
        <div className="welcome-setup-actions">
          <button type="button" className="panel-button icon-panel-button" onClick={onOpenPlugins}>
            <Plug size={14} />
            Open Plugins
          </button>
          <button type="button" className="panel-button icon-panel-button" disabled={running} onClick={onOpenCapabilityBuilder}>
            <Package size={14} />
            Create capability
          </button>
        </div>
      </header>
      <div className="provider-catalog-settings-grid">
        <section className="provider-catalog-settings-card recommended">
          <div className="provider-catalog-settings-card-header">
            <div>
              <strong>Codex Plugins</strong>
              <span>{installedPluginCount} installed</span>
            </div>
          </div>
          <p>Curated or imported plugin bundles with skills, apps, and MCP servers.</p>
        </section>
        <section className="provider-catalog-settings-card">
          <div className="provider-catalog-settings-card-header">
            <div>
              <strong>Generated Capabilities</strong>
              <span>{generatedCapabilityCount} registered</span>
            </div>
          </div>
          <p>Capability Builder packages with preview, validation, repair, update, and removal flows.</p>
        </section>
      </div>
      {capabilities.length > 0 && (
        <section className="welcome-setup-section">
          <div className="welcome-setup-section-header">
            <div>
              <h2>Registered Capabilities</h2>
              <p>Current registry entries from Ambient plugins and generated capability packages.</p>
            </div>
            <span>{capabilities.length} shown</span>
          </div>
          <div className="welcome-plugin-capability-list">
            {capabilities.map((capability) => (
              <section className="plugin-row" key={capability.id}>
                <div className="plugin-row-header">
                  <strong>{capability.displayName ?? capability.name}</strong>
                  <div className="plugin-row-actions">
                    <button type="button" className="panel-button mini" onClick={onOpenPlugins}>
                      Open actions
                    </button>
                    <span>{formatAmbientAvailability(capability.availability)}</span>
                  </div>
                </div>
                <p>
                  {capability.description ??
                    `${formatAmbientCapabilityKind(capability.kind)} capability from ${formatAmbientPluginSourceKind(capability.sourceKind)}.`}
                </p>
              </section>
            ))}
          </div>
        </section>
      )}
      <section className="plugin-row welcome-setup-row">
        <div className="plugin-row-header">
          <strong>Capability Registry</strong>
          <div className="plugin-row-actions">
            <button type="button" className="panel-button mini" onClick={onOpenPlugins}>
              Review capability buttons
            </button>
          </div>
        </div>
        <p>
          The Plugins panel renders the current installed/importable capabilities and exposes per-capability Connect, Inspect,
          validate, repair, update, re-register, and removal buttons from the live registry.
        </p>
      </section>
    </article>
  );
}

function WelcomeCoreSetupSection({
  section,
  catalogVersion,
  generatedAt,
  running,
  onStart,
}: {
  section: WelcomeSetupSection;
  catalogVersion: string;
  generatedAt: string;
  running: boolean;
  onStart: (card: ProviderCatalogSettingsCard) => void;
}) {
  return (
    <section className="welcome-setup-section">
      <div className="welcome-setup-section-header">
        <div>
          <h2>{section.title}</h2>
          <p>{section.summary}</p>
        </div>
        <span>{section.cards.length} cards</span>
      </div>
      {section.cards.length > 0 ? (
        <ProviderCatalogSettingsCards cards={section.cards} catalogVersion={catalogVersion} generatedAt={generatedAt} running={running} onStart={onStart} />
      ) : (
        <p className="panel-note">No current provider catalog cards are exposed for {section.capabilityAreas.join(", ")}.</p>
      )}
    </section>
  );
}

export function welcomePluginSetupStats(registry?: AmbientPluginRegistry): {
  capabilities: AmbientPluginRegistry["capabilities"];
  installedPluginCount: number;
  generatedCapabilityCount: number;
} {
  const capabilities = registry?.capabilities.slice(0, 12) ?? [];
  return {
    capabilities,
    installedPluginCount: registry?.plugins.filter((plugin) => plugin.installState !== "importable").length ?? 0,
    generatedCapabilityCount: capabilities.filter((capability) => capability.generated).length,
  };
}
