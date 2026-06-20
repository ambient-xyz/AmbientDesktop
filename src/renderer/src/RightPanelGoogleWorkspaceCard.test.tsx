import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FirstPartyGoogleIntegrationState } from "../../shared/pluginTypes";
import {
  RightPanelGoogleWorkspaceCard,
  type RightPanelGoogleWorkspaceCardProps,
} from "./RightPanelGoogleWorkspaceCard";

function baseProps(overrides: Partial<RightPanelGoogleWorkspaceCardProps> = {}): RightPanelGoogleWorkspaceCardProps {
  return {
    googleSetupAccountHint: "",
    setGoogleSetupAccountHint: vi.fn(),
    setPluginAuthStatus: vi.fn(),
    startPluginAppAuth: vi.fn(),
    installGoogleWorkspaceCli: vi.fn(),
    confirmGoogleWorkspaceAccount: vi.fn(),
    startGoogleWorkspaceSetup: vi.fn(),
    importGoogleWorkspaceOAuthClient: vi.fn(),
    validateGoogleWorkspace: vi.fn(),
    cancelGoogleWorkspaceSetup: vi.fn(),
    testPluginAuthAccount: vi.fn(),
    disconnectGoogleWorkspace: vi.fn(),
    disconnectPluginAuthAccount: vi.fn(),
    revokePluginAuthAccount: vi.fn(),
    ...overrides,
  };
}

function googleIntegrationFixture(): FirstPartyGoogleIntegrationState {
  const account = {
    id: "account-1",
    accountId: "travis@example.test",
    label: "travis@example.test",
    email: "travis@example.test",
    status: "available" as const,
    grantedScopes: ["gmail.readonly", "calendar.readonly", "drive.readonly"],
    connectedAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    lastValidatedAt: "2026-05-04T00:00:00.000Z",
  };
  return {
    enabled: true,
    authMode: "gws",
    connectors: ["google.gmail", "google.calendar", "google.drive"].map((connectorId) => ({
      connectorId,
      status: "available" as const,
      accounts: [account],
    })),
    install: {
      status: "completed",
      version: "0.22.3",
      platform: "darwin",
      arch: "arm64",
      binaryPath: "/tmp/gws",
    },
    setup: { status: "idle" },
    sidecar: {
      adapter: "gws",
      state: "available",
      binaryPath: "/tmp/gws",
      configDir: "/tmp/gws-config",
      pending: 0,
    },
  };
}

describe("RightPanelGoogleWorkspaceCard", () => {
  it("renders the unavailable state without a Google integration", () => {
    const html = renderToStaticMarkup(<RightPanelGoogleWorkspaceCard {...baseProps()} />);

    expect(html).toContain("Google Workspace");
    expect(html).toContain("Unavailable");
  });

  it("renders authenticated gws account status and actions", () => {
    const html = renderToStaticMarkup(
      <RightPanelGoogleWorkspaceCard
        {...baseProps({
          googleIntegration: googleIntegrationFixture(),
          googleSetupAccountHint: "travis@example.test",
        })}
      />,
    );

    expect(html).toContain("using Ambient-managed gws");
    expect(html).toContain("travis@example.test");
    expect(html).toContain("Gmail - Available");
    expect(html).toContain("Validate");
  });
});
