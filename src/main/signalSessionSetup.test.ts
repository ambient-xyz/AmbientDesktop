import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeSignalMessagingReadiness } from "./signalMessagingReadiness";
import {
  applySignalSessionSetup,
  previewSignalSessionSetup,
  signalSessionSetupInput,
  signalSessionSetupPreviewText,
  signalSessionSetupResultText,
} from "./signalSessionSetup";

describe("Signal session setup", () => {
  it("previews a blocked setup without provider I/O when config dir is missing", async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), "signal-session-setup-missing-"));
    const preview = await previewSignalSessionSetup({
      profileId: "owner",
      signalCliConfigDir: path.join(workspacePath, "missing-config"),
    }, {
      workspacePath,
      homeDir: path.join(workspacePath, "home"),
      now: () => new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(preview).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner",
      canApplyNow: false,
      signalCliConfigDirPresent: false,
      missingInputs: ["signal-cli config directory"],
      wouldRunProviderCli: false,
      wouldInspectSignalDesktop: false,
      wouldReadProviderMessages: false,
      wouldSendProviderMessages: false,
    });
    const text = signalSessionSetupPreviewText(preview);
    expect(text).toContain("Signal session setup preview");
    expect(text).toContain("Runs signal-cli: no");
    expect(text).toContain("Reads Signal messages: no");
  });

  it("writes only Ambient-owned safe metadata and feeds readiness preflight", async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), "signal-session-setup-"));
    const configDir = path.join(workspacePath, "signal-cli-config");
    mkdirSync(configDir, { recursive: true });

    const result = await applySignalSessionSetup({
      profileId: "owner",
      signalCliConfigDir: configDir,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
    }, {
      workspacePath,
      homeDir: path.join(workspacePath, "home"),
      now: () => new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      applyStatus: "applied",
      applied: true,
      providerId: "signal-cli",
      profileId: "owner",
      signalCliConfigDirPresent: true,
      bridgeSessionReadable: false,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
    });
    const metadata = JSON.parse(readFileSync(result.metadataPath, "utf8"));
    expect(metadata).toEqual({
      profileId: "owner",
      signalCliConfigDir: configDir,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
      bridgeSessionReadable: false,
      updatedAt: "2026-05-11T00:00:00.000Z",
    });
    expect(signalSessionSetupResultText(result)).toContain("Signal session setup apply");
    expect(JSON.stringify(result)).not.toContain("phoneNumber");
    expect(JSON.stringify(result)).not.toContain("sessionKeys");

    const readiness = await probeSignalMessagingReadiness({
      workspacePath,
      signalCliConfigDir: configDir,
      env: {},
      pathEntries: [],
      homeDir: path.join(workspacePath, "home"),
      now: () => new Date("2026-05-11T00:00:01.000Z"),
    });
    expect(readiness).toMatchObject({
      providerId: "signal-cli",
      status: "unavailable",
      configured: false,
      persistedSessionCount: 1,
      sessions: [{
        profileId: "owner",
        metadataReadable: true,
        signalCliConfigDirPresent: true,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: false,
      }],
    });

    rmSync(workspacePath, { recursive: true, force: true });
  });

  it("normalizes input and rejects unsafe profile ids", () => {
    expect(signalSessionSetupInput({
      providerId: "signal-cli",
      profileId: "owner.profile-1",
      signalCliConfigDir: "/tmp/signal",
    })).toMatchObject({
      providerId: "signal-cli",
      profileId: "owner.profile-1",
      signalCliConfigDir: "/tmp/signal",
    });
    expect(() => signalSessionSetupInput({ providerId: "telegram-tdlib", profileId: "owner" })).toThrow("providerId must be signal-cli");
    expect(() => signalSessionSetupInput({ profileId: "../owner" })).toThrow("profileId must be 1-64 characters");
  });
});
