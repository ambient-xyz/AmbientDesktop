import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { probeSignalMessagingReadiness } from "./signalMessagingReadiness";

describe("Signal messaging readiness", () => {
  it("reports unavailable without running signal-cli or inspecting messages", async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), "signal-readiness-empty-"));
    const stateRoot = path.join(workspacePath, ".ambient-agent-state", "signal");
    rmSync(stateRoot, { recursive: true, force: true });

    const readiness = await probeSignalMessagingReadiness({
      workspacePath,
      env: {},
      homeDir: path.join(workspacePath, "home"),
      pathEntries: [],
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });

    expect(readiness).toMatchObject({
      providerId: "signal-cli",
      status: "unavailable",
      configured: false,
      bridgeReachable: false,
      authNeeded: true,
      apiCredentialsPresent: false,
      persistedSessionCount: 0,
      checkedAt: "2026-05-10T00:00:00.000Z",
      sessions: [],
    });
    expect(readiness.diagnostics.join("\n")).toContain("does not run signal-cli");
    expect(readiness.diagnostics.join("\n")).toContain("does not read Signal messages");
    expect(readiness.diagnostics.join("\n")).toContain("Signal Desktop being installed or open is not sufficient");
    expect(readiness.repairHint).toContain("do not ask the user to operate Signal Desktop");
    expect(readiness.diagnostics.join("\n")).toContain("signal-cli binary not found");
  });

  it("reports redacted local preflight and Ambient-owned bridge metadata", async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), "signal-readiness-session-"));
    const binDir = path.join(workspacePath, "bin");
    const configDir = path.join(workspacePath, "signal-cli-config");
    const profileRoot = path.join(workspacePath, ".ambient-agent-state", "signal", "owner");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(profileRoot, { recursive: true });
    const signalCliPath = path.join(binDir, "signal-cli");
    writeFileSync(signalCliPath, "#!/bin/sh\nexit 0\n");
    chmodSync(signalCliPath, 0o755);
    writeFileSync(path.join(profileRoot, "bridge-session.json"), JSON.stringify({
      profileId: "owner",
      signalCliConfigDir: configDir,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
      bridgeSessionReadable: true,
      phoneNumber: "+15551234567",
      sessionKeys: "secret-session-keys",
    }));

    const readiness = await probeSignalMessagingReadiness({
      workspacePath,
      signalCliConfigDir: configDir,
      env: {},
      homeDir: path.join(workspacePath, "home"),
      pathEntries: [binDir],
      fetchFn: async () => {
        throw new Error("ECONNREFUSED");
      },
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });

    expect(readiness).toMatchObject({
      providerId: "signal-cli",
      status: "unavailable",
      configured: true,
      bridgeReachable: false,
      authNeeded: false,
      persistedSessionCount: 1,
      sessions: [{
        profileId: "owner",
        metadataReadable: true,
        signalCliConfigDirPresent: true,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: true,
      }],
    });
    expect(readiness.diagnostics.join("\n")).toContain(`signal-cli binary found at ${signalCliPath}`);
    expect(readiness.diagnostics.join("\n")).toContain(`signal-cli config directory present at ${configDir}`);
    expect(JSON.stringify(readiness)).not.toContain("+15551234567");
    expect(JSON.stringify(readiness)).not.toContain("secret-session-keys");
  });

  it("accepts a fake local Signal bridge contract without enabling provider runtime", async () => {
    const workspacePath = mkdtempSync(path.join(tmpdir(), "signal-readiness-bridge-"));
    const configDir = path.join(workspacePath, "signal-cli-config");
    const profileRoot = path.join(workspacePath, ".ambient-agent-state", "signal", "owner");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(profileRoot, { recursive: true });
    writeFileSync(path.join(profileRoot, "bridge-session.json"), JSON.stringify({
      profileId: "owner",
      signalCliConfigDir: configDir,
      accountIdentifierPresent: true,
      linkedDevicePresent: true,
      registrationMetadataPresent: true,
      bridgeSessionReadable: false,
    }));
    const requests: string[] = [];

    const readiness = await probeSignalMessagingReadiness({
      workspacePath,
      bridgeBaseUrl: "http://127.0.0.1:19092",
      signalCliConfigDir: configDir,
      env: {},
      homeDir: path.join(workspacePath, "home"),
      pathEntries: [],
      now: () => new Date("2026-05-10T00:00:00.000Z"),
      fetchFn: async (url) => {
        requests.push(url);
        if (url === "http://127.0.0.1:19092/") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              providerId: "signal-cli",
              contract: { kind: "ambient-signal-local-bridge", version: "v0" },
              stateRoot: workspacePath,
              profileCount: 1,
              capabilities: {
                profileStatus: true,
                metadataOnlyConversationDirectory: true,
                boundedUnreadWindow: true,
                approvedReplySend: true,
              },
            }),
          };
        }
        if (url === "http://127.0.0.1:19092/profiles/owner/status") {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              ok: true,
              providerId: "signal-cli",
              profileId: "owner",
              ready: true,
              accountIdentifierPresent: true,
              linkedDevicePresent: true,
              registrationMetadataPresent: true,
              bridgeSessionReadable: true,
            }),
          };
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    expect(requests).toEqual([
      "http://127.0.0.1:19092/",
      "http://127.0.0.1:19092/profiles/owner/status",
    ]);
    expect(readiness).toMatchObject({
      providerId: "signal-cli",
      status: "unavailable",
      configured: true,
      bridgeReachable: true,
      authNeeded: false,
      persistedSessionCount: 1,
      bridgeBaseUrl: "http://127.0.0.1:19092",
      bridgeCapabilities: {
        profileStatus: true,
        metadataOnlyConversationDirectory: true,
        boundedUnreadWindow: true,
        approvedReplySend: true,
      },
      bridgeStateRoot: workspacePath,
      bridgeSessionCount: 1,
      sessions: [{
        profileId: "owner",
        bridgeSessionReadable: true,
      }],
    });
    expect(readiness.message).toContain("Signal bridge contract readiness is present");
    expect(readiness.diagnostics.join("\n")).toContain("Signal bridge root contract accepted");
    expect(readiness.diagnostics.join("\n")).toContain("Signal bridge profile status contract accepted");
    expect(readiness.diagnostics.join("\n")).toContain("reviewed local Signal bridge plus Ambient-owned bridge-readable session metadata");
    expect(JSON.stringify(readiness)).not.toContain("message body");
  });
});
