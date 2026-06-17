import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { ThreadSummary, WorkspaceState } from "../../../shared/types";
import { registerSignalSessionTools } from "./agentRuntimeSignalSessionTools";

describe("registerSignalSessionTools", () => {
  it("registers preview/apply tools and writes only safe Signal setup metadata", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-signal-session-tools-"));
    const signalCliConfigDir = join(workspacePath, "signal-cli-config");
    const refreshProviderReadiness = vi.fn(async () => []);
    const resolveFirstPartyPluginPermission = vi.fn(async (request) => {
      expect(request.thread.id).toBe("thread-signal");
      expect(request.toolName).toBe("ambient_messaging_signal_session_apply");
      expect(request.detail).toContain("Would run signal-cli: no");
      expect(request.detail).toContain("Would read Signal messages: no");
      return true;
    });
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];

    try {
      await mkdir(signalCliConfigDir, { recursive: true });
      registerSignalSessionTools({
        registerTool: (tool: any) => registeredTools.push(tool),
      }, {
        threadId: "thread-signal",
        workspace: { path: workspacePath, statePath: join(workspacePath, ".ambient") } as WorkspaceState,
        getThread: () => ({ id: "thread-signal", permissionMode: "workspace" }) as ThreadSummary,
        resolveFirstPartyPluginPermission,
        gatewayRunner: { refreshProviderReadiness },
        setupOptions: {
          homeDir: join(workspacePath, "home"),
          now: () => new Date("2026-05-11T00:00:00.000Z"),
        },
      });

      expect(registeredTools.map((tool) => tool.name)).toEqual([
        "ambient_messaging_signal_session_preview",
        "ambient_messaging_signal_session_apply",
      ]);

      const preview = await toolByName(registeredTools, "ambient_messaging_signal_session_preview").execute("preview", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir,
      });
      expect(preview.content[0].text).toContain("Signal session setup preview");
      expect(preview.content[0].text).toContain("Runs signal-cli: no");
      expect(preview.content[0].text).toContain("Reads Signal messages: no");
      expect(preview.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_session_preview",
        status: "complete",
        providerId: "signal-cli",
        profileId: "owner",
        canApplyNow: true,
        wouldRunProviderCli: false,
        wouldInspectSignalDesktop: false,
      });

      const apply = await toolByName(registeredTools, "ambient_messaging_signal_session_apply").execute("apply", {
        providerId: "signal-cli",
        profileId: "owner",
        signalCliConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
      });

      expect(resolveFirstPartyPluginPermission).toHaveBeenCalledTimes(1);
      expect(refreshProviderReadiness).toHaveBeenCalledWith("signal-cli");
      expect(apply.content[0].text).toContain("Signal session setup apply");
      expect(apply.content[0].text).toContain("Apply status: applied");
      expect(apply.details).toMatchObject({
        runtime: "ambient-messaging-gateway",
        toolName: "ambient_messaging_signal_session_apply",
        status: "applied",
        providerId: "signal-cli",
        profileId: "owner",
        applyStatus: "applied",
        applied: true,
        bridgeSessionReadable: false,
      });

      const metadata = JSON.parse(await readFile(join(workspacePath, ".ambient-agent-state", "signal", "owner", "bridge-session.json"), "utf8"));
      expect(metadata).toEqual({
        profileId: "owner",
        signalCliConfigDir,
        accountIdentifierPresent: true,
        linkedDevicePresent: true,
        registrationMetadataPresent: true,
        bridgeSessionReadable: false,
        updatedAt: "2026-05-11T00:00:00.000Z",
      });
      expect(JSON.stringify(apply)).not.toContain("phoneNumber");
      expect(JSON.stringify(apply)).not.toContain("sessionKeys");
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function toolByName<T extends { name: string }>(tools: T[], name: string): T {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool).toBeTruthy();
  return tool!;
}
