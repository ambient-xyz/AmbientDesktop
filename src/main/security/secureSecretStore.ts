import { createRequire } from "node:module";
import type {
  SecureStorageBlockedReason,
  SecureStoragePlatform,
  SecureStorageReadyBackend,
  SecureStorageRepairGuidance,
  SecureStorageStatus,
} from "../../shared/secureStorageTypes";

const require = createRequire(import.meta.url);
const acceptedLinuxBackends = new Set(["gnome_libsecret", "kwallet", "kwallet5", "kwallet6"]);
const acceptedPortalBackends = new Set(["portal", "secret_portal", "org.freedesktop.portal.Secret"]);

export type SecureSecretStoreEncoding = "electron-safe-storage" | "base64-node-test-fallback";

export interface SecureSecretSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  encryptStringAsync?(value: string): Promise<Buffer>;
  decryptStringAsync?(value: Buffer): Promise<string>;
  getSelectedStorageBackend?(): string;
}

export interface SecureSecretStoreOptions {
  platform?: NodeJS.Platform | SecureStoragePlatform;
  appAvailable?: boolean;
  allowBase64NodeFallback?: boolean;
  safeStorage?: SecureSecretSafeStorage;
}

export interface SecureSecretEncryptedValue {
  encoding: SecureSecretStoreEncoding;
  value: string;
}

interface ElectronRuntime {
  app?: {
    isPackaged?: boolean;
  };
  safeStorage?: SecureSecretSafeStorage;
}

export class SecureSecretStore {
  constructor(
    private readonly safeStorage: SecureSecretSafeStorage | undefined,
    private readonly options: SecureSecretStoreOptions = {},
  ) {}

  status(): SecureStorageStatus {
    return secureSecretStoreStatus({
      safeStorage: this.safeStorage,
      ...this.options,
    });
  }

  assertReady(): SecureStorageStatus & { status: "ready" } {
    const status = this.status();
    if (status.status !== "ready") {
      throw new Error(status.message);
    }
    return status;
  }

  encryptString(value: string): Buffer {
    const status = this.assertReady();
    if (status.security === "test-fallback") return Buffer.from(value, "utf8");
    if (!this.safeStorage) throw new Error("Secure credential storage is not available on this system.");
    return this.safeStorage.encryptString(value);
  }

  decryptString(value: Buffer): string {
    const status = this.assertReady();
    if (status.security === "test-fallback") return value.toString("utf8");
    if (!this.safeStorage) throw new Error("Secure credential storage is not available on this system.");
    return this.safeStorage.decryptString(value);
  }

  async encryptStringAsync(value: string): Promise<Buffer> {
    const status = this.assertReady();
    if (status.security === "test-fallback") return Buffer.from(value, "utf8");
    if (!this.safeStorage) throw new Error("Secure credential storage is not available on this system.");
    return this.safeStorage.encryptStringAsync?.(value) ?? this.safeStorage.encryptString(value);
  }

  async decryptStringAsync(value: Buffer): Promise<string> {
    const status = this.assertReady();
    if (status.security === "test-fallback") return value.toString("utf8");
    if (!this.safeStorage) throw new Error("Secure credential storage is not available on this system.");
    return this.safeStorage.decryptStringAsync?.(value) ?? this.safeStorage.decryptString(value);
  }

  encryptForRecord(value: string): SecureSecretEncryptedValue {
    const status = this.assertReady();
    return {
      encoding: status.security === "test-fallback" ? "base64-node-test-fallback" : "electron-safe-storage",
      value: this.encryptString(value).toString("base64"),
    };
  }

  decryptFromRecord(record: SecureSecretEncryptedValue): string {
    if (record.encoding === "base64-node-test-fallback") {
      if (!this.options.allowBase64NodeFallback) {
        throw new Error("Test-only secret storage fallback is not allowed in Desktop.");
      }
      return Buffer.from(record.value, "base64").toString("utf8");
    }
    return this.decryptString(Buffer.from(record.value, "base64"));
  }
}

export function electronSecureSecretStore(options: SecureSecretStoreOptions = {}): SecureSecretStore {
  const runtime = electronRuntime();
  const { safeStorage, ...storeOptions } = options;
  const appAvailable = options.appAvailable ?? Boolean(runtime.app);
  const e2eOverride = e2eSecureStorageOverride(runtime);
  return new SecureSecretStore(e2eSafeStorage(safeStorage ?? runtime.safeStorage, runtime), {
    ...storeOptions,
    ...e2eOverride,
    appAvailable,
    allowBase64NodeFallback: options.allowBase64NodeFallback ?? !appAvailable,
  });
}

export function electronAppAvailable(): boolean {
  return Boolean(electronRuntime().app);
}

export function currentSecureStorageStatus(options: SecureSecretStoreOptions = {}): SecureStorageStatus {
  return electronSecureSecretStore(options).status();
}

export function secureStorageRepairGuidance(status: SecureStorageStatus): SecureStorageRepairGuidance {
  if (status.platform !== "linux") {
    return {
      platform: status.platform,
      summary: status.status === "ready" ? "Secure OS credential storage is available." : status.message,
      commands: [],
      retryLabel: "Retry secure storage check",
    };
  }
  return {
    platform: "linux",
    summary:
      status.status === "ready"
        ? "Linux secure storage is backed by a supported keyring."
        : "Install and unlock a desktop keyring such as GNOME Keyring/libsecret or KWallet, then restart or retry Ambient.",
    commands: [
      {
        id: "debian-libsecret",
        label: "Debian or Ubuntu",
        command: "sudo apt install gnome-keyring libsecret-1-0",
        description: "Installs GNOME Keyring and libsecret runtime packages.",
      },
      {
        id: "fedora-libsecret",
        label: "Fedora",
        command: "sudo dnf install gnome-keyring libsecret",
        description: "Installs GNOME Keyring and libsecret runtime packages.",
      },
      {
        id: "arch-libsecret",
        label: "Arch",
        command: "sudo pacman -S gnome-keyring libsecret",
        description: "Installs GNOME Keyring and libsecret runtime packages.",
      },
      {
        id: "kde-kwallet",
        label: "KDE KWallet",
        command: "sudo apt install kwalletmanager",
        description: "Installs KWallet tools on Debian-family KDE systems; use the equivalent package for your distribution.",
      },
    ],
    retryLabel: "Retry secure storage check",
  };
}

export function secureSecretStoreStatus(input: {
  safeStorage?: SecureSecretSafeStorage;
  platform?: NodeJS.Platform | SecureStoragePlatform;
  appAvailable?: boolean;
  allowBase64NodeFallback?: boolean;
}): SecureStorageStatus {
  const platform = normalizedPlatform(input.platform ?? process.platform);
  const appAvailable = input.appAvailable ?? true;
  const allowFallback = Boolean(input.allowBase64NodeFallback);
  const unavailableFallback = testFallbackStatus(platform, appAvailable, allowFallback);
  if (!input.safeStorage) {
    return unavailableFallback ?? blocked(platform, "unavailable", undefined, "Secure credential storage is not available on this system.");
  }
  if (!input.safeStorage.isEncryptionAvailable()) {
    return unavailableFallback ?? blocked(platform, "unavailable", undefined, "Secure credential storage is not available on this system.");
  }
  if (platform === "darwin") return ready(platform, "keychain", "Secure credential storage is backed by macOS Keychain.");
  if (platform === "win32") return ready(platform, "dpapi", "Secure credential storage is backed by Windows DPAPI.");
  if (platform !== "linux") {
    return blocked(platform, "unsupported", undefined, `Secure credential storage is unsupported on ${String(input.platform ?? process.platform)}.`);
  }

  const backend = selectedBackend(input.safeStorage);
  if (!backend || backend === "unknown") {
    return blocked("linux", "unknown", backend, "Linux secure credential storage backend could not be identified.");
  }
  if (backend === "basic_text") {
    return blocked("linux", "basic_text", backend, "Linux secure credential storage is using basic_text and is not safe for secrets.");
  }
  if (acceptedLinuxBackends.has(backend)) return ready("linux", backend as SecureStorageReadyBackend, `Linux secure credential storage is backed by ${backend}.`);
  if (acceptedPortalBackends.has(backend)) return ready("linux", "portal", "Linux secure credential storage is backed by the desktop secret portal.");
  return blocked("linux", "unsupported", backend, `Linux secure credential storage backend ${backend} is not supported for secrets.`);
}

function electronRuntime(): ElectronRuntime {
  try {
    const loaded = require("electron") as ElectronRuntime;
    return loaded && typeof loaded === "object" ? loaded : {};
  } catch {
    return {};
  }
}

function e2eSecureStorageOverride(runtime: ElectronRuntime): Pick<SecureSecretStoreOptions, "platform"> | undefined {
  if (!e2eSecureStorageOverrideAllowed(runtime)) return undefined;
  const platform = process.env.AMBIENT_E2E_SECURE_STORAGE_PLATFORM?.trim();
  return platform ? { platform: platform as NodeJS.Platform } : undefined;
}

function e2eSafeStorage(safeStorage: SecureSecretSafeStorage | undefined, runtime: ElectronRuntime): SecureSecretSafeStorage | undefined {
  if (!e2eSecureStorageOverrideAllowed(runtime) || !safeStorage) return safeStorage;
  const backend = process.env.AMBIENT_E2E_SECURE_STORAGE_BACKEND?.trim();
  const available = process.env.AMBIENT_E2E_SECURE_STORAGE_AVAILABLE?.trim();
  if (!backend && !available) return safeStorage;
  return {
    ...safeStorage,
    isEncryptionAvailable: () => available === "0" ? false : safeStorage.isEncryptionAvailable(),
    ...(backend ? { getSelectedStorageBackend: () => backend } : {}),
  };
}

function e2eSecureStorageOverrideAllowed(runtime: ElectronRuntime): boolean {
  return process.env.AMBIENT_E2E === "1" &&
    process.env.AMBIENT_SAFE_STORAGE_DOGFOOD === "1" &&
    runtime.app?.isPackaged === false;
}

function selectedBackend(safeStorage: SecureSecretSafeStorage): string | undefined {
  const backend = safeStorage.getSelectedStorageBackend?.();
  return typeof backend === "string" ? backend.trim() : undefined;
}

function normalizedPlatform(platform: NodeJS.Platform | SecureStoragePlatform): SecureStoragePlatform {
  if (platform === "darwin" || platform === "win32" || platform === "linux") return platform;
  return "other";
}

function testFallbackStatus(
  platform: SecureStoragePlatform,
  appAvailable: boolean,
  allowFallback: boolean,
): SecureStorageStatus | undefined {
  if (!allowFallback || appAvailable) return undefined;
  return ready(platform, "base64-node-test-fallback", "Secure credential storage is using the Node test fallback.");
}

function ready(platform: SecureStoragePlatform, backend: SecureStorageReadyBackend, message: string): SecureStorageStatus {
  return {
    status: "ready",
    platform,
    backend,
    security: backend === "base64-node-test-fallback" ? "test-fallback" : "os-encrypted",
    message,
  };
}

function blocked(
  platform: SecureStoragePlatform,
  reason: SecureStorageBlockedReason,
  backend: string | undefined,
  message: string,
): SecureStorageStatus {
  return {
    status: "blocked",
    platform,
    reason,
    ...(backend ? { backend } : {}),
    message,
  };
}
