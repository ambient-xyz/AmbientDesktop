import { describe, expect, it } from "vitest";
import { SecureSecretStore, secureSecretStoreStatus, secureStorageRepairGuidance, type SecureSecretSafeStorage } from "./secureSecretStore";

describe("secureSecretStoreStatus", () => {
  it("accepts macOS Keychain and Windows DPAPI when encryption is available", () => {
    expect(secureSecretStoreStatus({ platform: "darwin", safeStorage: fakeSafeStorage() })).toMatchObject({
      status: "ready",
      backend: "keychain",
      security: "os-encrypted",
    });
    expect(secureSecretStoreStatus({ platform: "win32", safeStorage: fakeSafeStorage() })).toMatchObject({
      status: "ready",
      backend: "dpapi",
      security: "os-encrypted",
    });
  });

  it("accepts supported Linux keyring and portal backends", () => {
    for (const backend of ["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"] as const) {
      expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend }) })).toMatchObject({
        status: "ready",
        backend,
      });
    }
    expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend: "portal" }) })).toMatchObject({
      status: "ready",
      backend: "portal",
    });
    expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend: "org.freedesktop.portal.Secret" }) })).toMatchObject({
      status: "ready",
      backend: "portal",
    });
  });

  it("rejects unsafe or unidentified Linux backends even when Electron reports encryption", () => {
    expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend: "basic_text" }) })).toMatchObject({
      status: "blocked",
      reason: "basic_text",
      backend: "basic_text",
    });
    expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend: "unknown" }) })).toMatchObject({
      status: "blocked",
      reason: "unknown",
      backend: "unknown",
    });
    expect(secureSecretStoreStatus({ platform: "linux", safeStorage: fakeSafeStorage({ backend: "custom_cleartext" }) })).toMatchObject({
      status: "blocked",
      reason: "unsupported",
      backend: "custom_cleartext",
    });
  });

  it("fails closed inside Desktop when encryption is unavailable", () => {
    expect(secureSecretStoreStatus({
      platform: "darwin",
      appAvailable: true,
      allowBase64NodeFallback: true,
      safeStorage: fakeSafeStorage({ available: false }),
    })).toMatchObject({
      status: "blocked",
      reason: "unavailable",
    });
  });

  it("allows the base64 fallback only outside Desktop test contexts", () => {
    expect(secureSecretStoreStatus({
      platform: "darwin",
      appAvailable: false,
      allowBase64NodeFallback: true,
      safeStorage: undefined,
    })).toMatchObject({
      status: "ready",
      backend: "base64-node-test-fallback",
      security: "test-fallback",
    });
    expect(secureSecretStoreStatus({
      platform: "darwin",
      appAvailable: false,
      allowBase64NodeFallback: false,
      safeStorage: undefined,
    })).toMatchObject({
      status: "blocked",
      reason: "unavailable",
    });
  });
});

describe("SecureSecretStore", () => {
  it("encrypts and decrypts through the selected secure backend", () => {
    const store = new SecureSecretStore(fakeSafeStorage({ backend: "gnome_libsecret" }), { platform: "linux", appAvailable: true });
    const encrypted = store.encryptForRecord("test-secret");

    expect(encrypted).toEqual({
      encoding: "electron-safe-storage",
      value: Buffer.from("wrapped:test-secret", "utf8").toString("base64"),
    });
    expect(store.decryptFromRecord(encrypted)).toBe("test-secret");
  });

  it("supports async Electron safeStorage methods when available", async () => {
    const safeStorage = fakeSafeStorage({ backend: "gnome_libsecret" });
    safeStorage.encryptStringAsync = async (value) => Buffer.from(`async:${value}`, "utf8");
    safeStorage.decryptStringAsync = async (value) => value.toString("utf8").replace(/^async:/, "");
    const store = new SecureSecretStore(safeStorage, { platform: "linux", appAvailable: true });

    const encrypted = await store.encryptStringAsync("async-secret");
    expect(encrypted.toString("utf8")).toBe("async:async-secret");
    await expect(store.decryptStringAsync(encrypted)).resolves.toBe("async-secret");
  });

  it("blocks encryption through Linux basic_text", () => {
    const store = new SecureSecretStore(fakeSafeStorage({ backend: "basic_text" }), { platform: "linux", appAvailable: true });

    expect(() => store.encryptForRecord("secret")).toThrow(/basic_text/);
  });

  it("does not decode test fallback records unless explicitly allowed", () => {
    const record = {
      encoding: "base64-node-test-fallback" as const,
      value: Buffer.from("legacy-secret", "utf8").toString("base64"),
    };

    expect(() => new SecureSecretStore(undefined, { appAvailable: true }).decryptFromRecord(record)).toThrow(/not allowed/);
    expect(new SecureSecretStore(undefined, { appAvailable: false, allowBase64NodeFallback: true }).decryptFromRecord(record)).toBe("legacy-secret");
  });
});

describe("secureStorageRepairGuidance", () => {
  it("returns explicit Linux repair commands without executing them", () => {
    const guidance = secureStorageRepairGuidance({
      status: "blocked",
      platform: "linux",
      reason: "basic_text",
      backend: "basic_text",
      message: "Linux secure credential storage is using basic_text and is not safe for secrets.",
    });

    expect(guidance.commands.map((command) => command.id)).toContain("debian-libsecret");
    expect(JSON.stringify(guidance)).not.toContain("secret-value");
  });
});

function fakeSafeStorage({
  available = true,
  backend,
}: {
  available?: boolean;
  backend?: string;
} = {}): SecureSecretSafeStorage {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`wrapped:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^wrapped:/, ""),
    ...(backend ? { getSelectedStorageBackend: () => backend } : {}),
  };
}
