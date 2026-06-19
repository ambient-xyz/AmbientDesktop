import { describe, expect, it, vi } from "vitest";
import type { CodexPluginSummary } from "../../shared/pluginTypes";
import { MemoryWorkflowConnectorTokenVault, fakeOAuthConnectorProvider } from "./pluginsWorkflowAuthFacade";
import { PluginAuthService } from "./pluginAuthService";

function appPlugin(): CodexPluginSummary {
  return {
    id: "marketplace:fake-app",
    name: "fake-app",
    version: "1.0.0",
    description: "Fake app plugin",
    marketplaceName: "Fixture",
    marketplacePath: ".agents/plugins/marketplace.json",
    rootPath: "/tmp/fake-app",
    sourceKind: "workspace",
    compatibilityTier: "partial",
    compatibilityNotes: [],
    supportLabels: [],
    skills: [],
    mcpServers: [],
    appsPath: "/tmp/fake-app/.app.json",
    apps: [{ name: "fake", connectorId: "fake.oauth.records", path: "/tmp/fake-app/.app.json" }],
    imported: true,
    enabled: true,
    trusted: false,
    errors: [],
  };
}

describe("PluginAuthService", () => {
  it("maps Codex app descriptors to OAuth provider and account state without exposing tokens", async () => {
    const vault = new MemoryWorkflowConnectorTokenVault();
    const service = new PluginAuthService({
      providers: [fakeOAuthConnectorProvider()],
      tokenVault: vault,
    });

    expect(service.listAppAuthStates([appPlugin()])).toEqual([
      expect.objectContaining({
        connectorId: "fake.oauth.records",
        providerId: "fake.oauth",
        status: "not_configured",
        accounts: [],
      }),
    ]);

    const pending = service.startConnectForApp({ connectorId: "fake.oauth.records", scopes: ["fake.records.read"] });
    const connected = await service.completeConnect({ state: pending.state, code: "primary" });

    expect(connected).toMatchObject({
      id: "fake.oauth:fake-user",
      accountId: "fake-user",
      status: "available",
      grantedScopes: ["fake.records.read"],
    });
    expect(JSON.stringify(connected)).not.toContain("fake-access-primary");
    expect(JSON.stringify(connected)).not.toContain("fake-refresh-primary");
    expect(vault.snapshot()["workflow-connector:fake.oauth:fake-user"]).toMatchObject({
      accessToken: "fake-access-primary",
    });
    expect(service.appAuthState("fake.oauth.records")).toMatchObject({
      status: "available",
      accounts: [expect.objectContaining({ email: "fake-user@example.test" })],
    });
  });

  it("revokes app accounts through the underlying auth provider", async () => {
    const revokeToken = vi.fn();
    const service = new PluginAuthService({
      providers: [fakeOAuthConnectorProvider({ revokeToken })],
    });

    const pending = service.startConnectForApp({ connectorId: "fake.oauth.records", scopes: ["fake.records.read"] });
    const connected = await service.completeConnect({ state: pending.state, code: "primary" });
    const revoked = await service.revokeAccount(connected.id);

    expect(revoked).toMatchObject({ id: connected.id, status: "revoked" });
    expect(revokeToken).toHaveBeenCalledOnce();
    expect(service.appAuthState("fake.oauth.records")).toMatchObject({
      status: "revoked",
      accounts: [expect.objectContaining({ status: "revoked" })],
    });
  });

  it("maps aliased first-party connector ids to the same OAuth provider account", async () => {
    const service = new PluginAuthService({
      providers: [fakeOAuthConnectorProvider({ connectorIds: ["fake.oauth.alias"] })],
    });

    const pending = service.startConnectForApp({ connectorId: "fake.oauth.alias", scopes: ["fake.records.read"] });
    const connected = await service.completeConnect({ state: pending.state, code: "primary" });

    expect(service.appAuthState("fake.oauth.alias")).toMatchObject({
      status: "available",
      accounts: [expect.objectContaining({ id: connected.id, accountId: "fake-user" })],
    });
    await expect(service.accessTokenForApp("fake.oauth.alias", "fake-user")).resolves.toMatchObject({
      accessToken: "fake-access-primary",
      account: { id: connected.id },
    });
  });

  it("disconnects app accounts locally without revoking provider tokens", async () => {
    const revokeToken = vi.fn();
    const service = new PluginAuthService({
      providers: [fakeOAuthConnectorProvider({ revokeToken })],
    });

    const pending = service.startConnectForApp({ connectorId: "fake.oauth.records", scopes: ["fake.records.read"] });
    const connected = await service.completeConnect({ state: pending.state, code: "primary" });
    const disconnected = await service.disconnectAccount(connected.id);

    expect(disconnected).toMatchObject({ id: connected.id, status: "not_configured" });
    expect(revokeToken).not.toHaveBeenCalled();
    expect(service.appAuthState("fake.oauth.records")).toMatchObject({
      status: "not_configured",
      accounts: [expect.objectContaining({ status: "not_configured" })],
    });
  });

  it("marks Codex app descriptors unavailable when no Ambient auth provider exists", () => {
    const service = new PluginAuthService();

    expect(service.listAppAuthStates([appPlugin()])).toEqual([
      expect.objectContaining({
        connectorId: "fake.oauth.records",
        status: "unavailable",
        unavailableReason: "No Ambient auth provider is registered for this Codex app connector.",
      }),
    ]);
    expect(() => service.startConnectForApp({ connectorId: "fake.oauth.records" })).toThrow(
      "No Ambient auth provider is registered",
    );
  });
});
