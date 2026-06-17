import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowManifest } from "../../shared/types";
import { createWorkflowConnectorBridge, validateWorkflowConnectorDescriptor, type WorkflowConnectorDescriptor } from "./workflowConnectors";
import {
  MemoryWorkflowConnectorTokenVault,
  SafeStorageWorkflowConnectorTokenVault,
  WorkflowConnectorAuthService,
  fakeOAuthConnectorProvider,
  workflowConnectorAccountAuthorizer,
} from "./workflowConnectorAuth";

describe("Workflow connector OAuth lifecycle", () => {
  it("connects fake OAuth accounts without exposing token material in public records", async () => {
    const vault = new MemoryWorkflowConnectorTokenVault();
    const auth = new WorkflowConnectorAuthService({
      providers: [fakeOAuthConnectorProvider()],
      tokenVault: vault,
    });

    const pending = auth.startConnect({ providerId: "fake.oauth", scopes: ["fake.records.read"] });
    const authorizationUrl = new URL(pending.authorizationUrl);

    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("scope")).toBe("fake.records.read");
    expect(authorizationUrl.searchParams.get("state")).toBe(pending.state);

    const account = await auth.completeConnect({ state: pending.state, code: "primary" });
    const publicJson = JSON.stringify(account);

    expect(account).toMatchObject({
      id: "fake.oauth:fake-user",
      providerId: "fake.oauth",
      connectorId: "fake.oauth.records",
      accountId: "fake-user",
      grantedScopes: ["fake.records.read"],
      status: "available",
    });
    expect(vault.snapshot()[account.tokenRef]).toMatchObject({ accessToken: "fake-access-primary" });
    expect(publicJson).not.toContain("fake-access-primary");
    expect(publicJson).not.toContain("fake-refresh-primary");
  });

  it("refreshes, tests, revokes, disconnects, and reconnects OAuth accounts", async () => {
    const revokeToken = vi.fn();
    const auth = new WorkflowConnectorAuthService({
      providers: [fakeOAuthConnectorProvider({ revokeToken })],
    });
    const pending = auth.startConnect({ providerId: "fake.oauth", scopes: ["fake.records.read"] });
    const account = await auth.completeConnect({ state: pending.state, code: "primary" });

    const refreshed = await auth.refreshAccount(account.id);
    expect(refreshed).toMatchObject({
      id: account.id,
      status: "available",
      lastRefreshedAt: expect.any(String),
    });

    await expect(auth.testAccount(account.id)).resolves.toMatchObject({
      id: account.id,
      status: "available",
      lastValidatedAt: expect.any(String),
    });

    await expect(auth.revokeAccount(account.id)).resolves.toMatchObject({
      id: account.id,
      status: "revoked",
      revokedAt: expect.any(String),
    });
    expect(revokeToken).toHaveBeenCalledOnce();

    const reconnect = auth.startConnect({ providerId: "fake.oauth", scopes: ["fake.records.read", "fake.records.write"] });
    await expect(auth.completeConnect({ state: reconnect.state, code: "secondary" })).resolves.toMatchObject({
      id: account.id,
      grantedScopes: ["fake.records.read", "fake.records.write"],
      status: "available",
    });

    await expect(auth.disconnectAccount(account.id)).resolves.toMatchObject({
      id: account.id,
      status: "not_configured",
      disconnectedAt: expect.any(String),
    });
  });

  it("allows one OAuth provider to back multiple first-party connector ids", async () => {
    const auth = new WorkflowConnectorAuthService({
      providers: [fakeOAuthConnectorProvider({ connectorIds: ["fake.oauth.alias"] })],
    });
    const pending = auth.startConnect({ providerId: "fake.oauth", scopes: ["fake.records.read"] });
    const account = await auth.completeConnect({ state: pending.state, code: "primary" });
    const bridge = createWorkflowConnectorBridge({
      manifest: {
        tools: [],
        mutationPolicy: "read_only",
        connectors: [
          {
            connectorId: "fake.oauth.alias",
            accountId: "fake-user",
            scopes: ["fake.records.read"],
            operations: ["listRecords"],
            dataRetention: "redacted_audit",
          },
        ],
      },
      registrations: [{ ...fakeOAuthRegistration(), descriptor: fakeOAuthDescriptor("fake.oauth.alias") }],
      accountAuthorizer: workflowConnectorAccountAuthorizer(auth),
    });

    await expect(
      bridge.call({ connectorId: "fake.oauth.alias", operation: "listRecords", accountId: "fake-user", input: {} }),
    ).resolves.toEqual({ records: [{ id: "record-1" }] });
    await expect(auth.accessTokenForConnectorAccount("fake.oauth", "fake.oauth.alias", account.accountId)).resolves.toMatchObject({
      accessToken: "fake-access-primary",
      account: { id: account.id },
      scopes: ["fake.records.read"],
    });
  });

  it("rejects invalid states, missing scopes, and revoked accounts before connector calls", async () => {
    const auth = new WorkflowConnectorAuthService({ providers: [fakeOAuthConnectorProvider()] });

    expect(() => auth.startConnect({ providerId: "fake.oauth", scopes: ["missing.scope"] })).toThrow("does not expose scope");
    await expect(auth.completeConnect({ state: "missing", code: "primary" })).rejects.toThrow("state was not found");

    const pending = auth.startConnect({ providerId: "fake.oauth", scopes: ["fake.records.read"] });
    const account = await auth.completeConnect({ state: pending.state, code: "primary" });
    const bridge = createWorkflowConnectorBridge({
      manifest: fakeOAuthManifest("fake.records.read"),
      registrations: [fakeOAuthRegistration()],
      accountAuthorizer: workflowConnectorAccountAuthorizer(auth),
    });

    await expect(
      bridge.call({ connectorId: "fake.oauth.records", operation: "listRecords", accountId: "fake-user", input: {} }),
    ).resolves.toEqual({ records: [{ id: "record-1" }] });

    await expect(
      createWorkflowConnectorBridge({
        manifest: fakeOAuthManifest("fake.records.write"),
        registrations: [fakeOAuthRegistration()],
        accountAuthorizer: workflowConnectorAccountAuthorizer(auth),
        connectorApprovalDecision: () => "approved",
      }).call({ connectorId: "fake.oauth.records", operation: "writeRecord", accountId: "fake-user", input: { id: "record-2" }, idempotencyKey: "idem-1" }),
    ).rejects.toThrow("missing scope");

    await auth.revokeAccount(account.id);
    await expect(
      bridge.call({ connectorId: "fake.oauth.records", operation: "listRecords", accountId: "fake-user", input: {} }),
    ).rejects.toThrow("not available");
  });

  it("stores OAuth tokens through an encrypted safe-storage vault", async () => {
    const root = await mkdtemp(join(tmpdir(), "ambient-connector-vault-"));
    try {
      const vaultPath = join(root, "tokens.json");
      const vault = new SafeStorageWorkflowConnectorTokenVault(vaultPath, reversibleSafeStorage());
      await vault.save("connector:primary", {
        accessToken: "sensitive-access-token",
        refreshToken: "sensitive-refresh-token",
        scopes: ["fake.records.read"],
      });

      const raw = await readFile(vaultPath, "utf8");
      expect(raw).not.toContain("sensitive-access-token");
      expect(raw).not.toContain("sensitive-refresh-token");
      await expect(vault.read("connector:primary")).resolves.toMatchObject({
        accessToken: "sensitive-access-token",
        refreshToken: "sensitive-refresh-token",
      });

      await vault.delete("connector:primary");
      await expect(vault.read("connector:primary")).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function fakeOAuthManifest(scope: string): WorkflowManifest {
  return {
    tools: [],
    mutationPolicy: scope.endsWith(".write") ? "staged_until_approved" : "read_only",
    connectors: [
      {
        connectorId: "fake.oauth.records",
        accountId: "fake-user",
        scopes: [scope],
        operations: [scope.endsWith(".write") ? "writeRecord" : "listRecords"],
        dataRetention: "redacted_audit",
      },
    ],
  };
}

function fakeOAuthRegistration() {
  return {
    descriptor: fakeOAuthDescriptor(),
    handlers: {
      listRecords: () => ({ records: [{ id: "record-1" }] }),
      writeRecord: () => ({ applied: true }),
    },
  };
}

function fakeOAuthDescriptor(connectorId = "fake.oauth.records"): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: connectorId,
    label: "Fake OAuth records",
    description: "Fake account-backed connector used to test OAuth account authorization.",
    auth: { type: "oauth2_pkce", providerId: "fake.oauth", status: "available" },
    accounts: [{ id: "fake-user", label: "Fake User" }],
    scopes: [
      {
        id: "fake.records.read",
        label: "Read fake records",
        description: "Read fake OAuth records.",
        personalData: false,
      },
      {
        id: "fake.records.write",
        label: "Write fake records",
        description: "Write fake OAuth records.",
        personalData: false,
      },
    ],
    operations: [
      {
        name: "listRecords",
        label: "List records",
        description: "List fake OAuth records.",
        inputSchema: { type: "object", additionalProperties: false },
        requiredScopes: ["fake.records.read"],
        sideEffects: "none",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        defaultTimeoutMs: 5_000,
      },
      {
        name: "writeRecord",
        label: "Write record",
        description: "Write a fake OAuth record.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        requiredScopes: ["fake.records.write"],
        sideEffects: "write_external",
        supportsDryRun: false,
        idempotencyKey: "required",
        mutationPolicy: "staged_until_approved",
        defaultTimeoutMs: 5_000,
      },
    ],
    rateLimit: { requestsPerMinute: 60, burst: 5 },
    sync: { cursorKind: "opaque", supportsIncremental: true },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Fake OAuth connector tests never expose real account data."],
  });
}

function reversibleSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${Buffer.from(value, "utf8").toString("base64")}`, "utf8"),
    decryptString: (value: Buffer) => {
      const text = value.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("Invalid encrypted token fixture.");
      return Buffer.from(text.slice(4), "base64").toString("utf8");
    },
  };
}
