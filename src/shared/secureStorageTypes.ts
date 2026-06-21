export type SecureStoragePlatform = "darwin" | "win32" | "linux" | "other";

export type SecureStorageReadyBackend =
  | "keychain"
  | "dpapi"
  | "gnome_libsecret"
  | "kwallet"
  | "kwallet5"
  | "kwallet6"
  | "portal"
  | "base64-node-test-fallback";

export type SecureStorageBlockedReason = "unavailable" | "basic_text" | "unknown" | "unsupported";

export type SecureStorageSecurity = "os-encrypted" | "test-fallback";

export type SecureStorageStatus =
  | {
      status: "ready";
      platform: SecureStoragePlatform;
      backend: SecureStorageReadyBackend;
      security: SecureStorageSecurity;
      message: string;
    }
  | {
      status: "blocked";
      platform: SecureStoragePlatform;
      reason: SecureStorageBlockedReason;
      backend?: string;
      message: string;
    };

export interface LinuxSecureStorageRepairCommand {
  id: string;
  label: string;
  command: string;
  description: string;
}

export interface SecureStorageRepairGuidance {
  platform: SecureStoragePlatform;
  summary: string;
  commands: LinuxSecureStorageRepairCommand[];
  retryLabel: string;
}
