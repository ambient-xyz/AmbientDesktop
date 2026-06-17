import { describe, expect, it } from "vitest";
import {
  createPrivilegedActionAdapter,
  DryRunPrivilegedActionAdapter,
  LinuxPolkitHelperAdapter,
  LinuxPolkitHelperUnavailableAdapter,
  MacosAuthorizedHelperAdapter,
  MacosAuthorizedHelperUnavailableAdapter,
  planLinuxPrivilegedAction,
  planMacosPrivilegedAction,
  planPrivilegedActionAdapterExecution,
  planWindowsPrivilegedAction,
  privilegedActionAdapterSelectionFromEnv,
  validatePrivilegedActionNativeRequestForAdapter,
  WindowsElevatedHelperAdapter,
  WindowsElevatedHelperUnavailableAdapter,
} from "./privilegedActionAdapter";
import { buildPrivilegedActionNativeRequest, planPrivilegedAction } from "./privilegedAction";

describe("DryRunPrivilegedActionAdapter", () => {
  it("selects platform privileged adapters by default while keeping explicit dry-run available", () => {
    expect(createPrivilegedActionAdapter({ platform: "darwin" })).toBeInstanceOf(MacosAuthorizedHelperAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "dry-run", platform: "darwin" })).toBeInstanceOf(DryRunPrivilegedActionAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "macos-authorized-helper", platform: "darwin" })).toBeInstanceOf(MacosAuthorizedHelperUnavailableAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "macos-authorized-helper", platform: "linux" })).toBeInstanceOf(DryRunPrivilegedActionAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "linux-polkit-helper", platform: "linux" })).toBeInstanceOf(LinuxPolkitHelperUnavailableAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "linux-polkit-helper", platform: "darwin" })).toBeInstanceOf(DryRunPrivilegedActionAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "windows-elevated-helper", platform: "win32" })).toBeInstanceOf(WindowsElevatedHelperAdapter);
    expect(createPrivilegedActionAdapter({ adapter: "windows-elevated-helper", platform: "linux" })).toBeInstanceOf(DryRunPrivilegedActionAdapter);
    expect(createPrivilegedActionAdapter({ platform: "darwin" }).name).toBe("macos-authorized-helper");
    expect(createPrivilegedActionAdapter({ platform: "linux" }).name).toBe("linux-polkit-helper");
    expect(createPrivilegedActionAdapter({ platform: "win32" }).name).toBe("windows-elevated-helper");
    expect(createPrivilegedActionAdapter({ adapter: "macos-authorized-helper", platform: "darwin" }).name).toBe("macos-authorized-helper");
    expect(createPrivilegedActionAdapter({ adapter: "linux-polkit-helper", platform: "linux" }).name).toBe("linux-polkit-helper");
    expect(createPrivilegedActionAdapter({ adapter: "windows-elevated-helper", platform: "win32" }).name).toBe("windows-elevated-helper");
    expect(privilegedActionAdapterSelectionFromEnv({ AMBIENT_PRIVILEGED_ACTION_ADAPTER: "macos-authorized-helper" })).toBe("macos-authorized-helper");
    expect(privilegedActionAdapterSelectionFromEnv({ AMBIENT_PRIVILEGED_ACTION_ADAPTER: "linux-polkit-helper" })).toBe("linux-polkit-helper");
    expect(privilegedActionAdapterSelectionFromEnv({ AMBIENT_PRIVILEGED_ACTION_ADAPTER: "windows-elevated-helper" })).toBe("windows-elevated-helper");
    expect(privilegedActionAdapterSelectionFromEnv({ AMBIENT_PRIVILEGED_ACTION_ADAPTER: "bogus" })).toBeUndefined();
  });

  it("exposes status and converts native requests into no-execute results", async () => {
    const adapter = new DryRunPrivilegedActionAdapter({ credentialRehearsalAvailable: true, platform: "darwin" });
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        reason: "Protected path boundary.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/bin/ln", args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-1" },
    );

    expect(adapter.status()).toMatchObject({
      execution: "dry-run-only",
      adapterStatus: "not-implemented",
      selectedAdapter: "dry-run",
      credentialCapture: "rehearsal-available",
    });

    await expect(adapter.execute({ request, credentialCapture: "rehearsed-and-discarded" })).resolves.toMatchObject({
      schemaVersion: "ambient-privileged-action-v1",
      requestId: "request-1",
      status: "not-executed",
      adapter: "dry-run",
      credentialCapture: "rehearsed-and-discarded",
      executionPlan: {
        adapter: "macos-authorized-helper",
        executionMode: "planned-not-executed",
        allowedByPolicy: true,
        executable: "/bin/ln",
        args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"],
        commands: [
          {
            executable: "/bin/ln",
            args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"],
          },
        ],
      },
    });
  });

  it("plans arbitrary macOS structured privileged actions", () => {
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        platform: "darwin",
        packageName: "ambient-kokoro-tts",
        reason: "Install a system package needed by the local voice runtime.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/opt/homebrew/bin/brew",
          args: ["install", "espeak-ng"],
          rationale: "Provide espeak-ng data and libraries for Kokoro phonemization.",
        }],
      }),
      { workspacePath: "/workspace", requestId: "request-3" },
    );

    expect(planMacosPrivilegedAction(request)).toMatchObject({
      adapter: "macos-authorized-helper",
      executionMode: "planned-not-executed",
      allowedByPolicy: true,
      policyReason: expect.stringContaining("arbitrary structured privileged actions"),
      platform: "darwin",
      purpose: "install_system_package",
      requiresCredential: true,
      executesPrivilegedCommands: true,
      executable: "/opt/homebrew/bin/brew",
      args: ["install", "espeak-ng"],
      commands: [{ executable: "/opt/homebrew/bin/brew", args: ["install", "espeak-ng"] }],
    });
    expect(planPrivilegedActionAdapterExecution(request, { platform: "darwin" }).allowedByPolicy).toBe(true);
  });

  it("executes macOS authorized-helper arbitrary structured actions through the adapter boundary", async () => {
    const calls: unknown[] = [];
    const adapter = new MacosAuthorizedHelperAdapter({
      credentialRehearsalAvailable: true,
      commandRunner: async (input) => {
        calls.push(input);
        return { exitCode: 0, stdout: "installed\n", stderr: "" };
      },
    });
    expect(adapter.status()).toMatchObject({
      selectedAdapter: "macos-authorized-helper",
      selectedAdapterExecutesPrivilegedCommands: true,
      execution: "executed",
      adapterStatus: "available",
      policyPlanning: "available",
      credentialCapture: "available",
    });
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        platform: "darwin",
        packageName: "ambient-kokoro-tts",
        reason: "Install a system package needed by the local voice runtime.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/opt/homebrew/bin/brew",
          args: ["install", "espeak-ng"],
        }],
      }),
      { workspacePath: "/workspace", requestId: "request-macos-helper" },
    );

    await expect(adapter.execute({ request, credential: "ambient-password", credentialCapture: "captured-and-discarded" })).resolves.toMatchObject({
      schemaVersion: "ambient-privileged-action-v1",
      requestId: "request-macos-helper",
      status: "succeeded",
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "macos-authorized-helper",
        allowedByPolicy: true,
        executionMode: "executed",
        executesPrivilegedCommands: true,
      },
      continuation: {
        state: "ready-to-resume-validation",
        packageName: "ambient-kokoro-tts",
      },
    });
    expect(calls).toEqual([
      expect.objectContaining({
        executable: "/opt/homebrew/bin/brew",
        args: ["install", "espeak-ng"],
        credential: "ambient-password",
      }),
    ]);
  });

  it("blocks macOS authorized-helper requests for another platform", async () => {
    const adapter = new MacosAuthorizedHelperUnavailableAdapter();
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        platform: "linux",
        reason: "Wrong platform.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/apt-get", args: ["install", "-y", "espeak-ng"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-macos-helper-blocked" },
    );

    await expect(adapter.execute({ request })).resolves.toMatchObject({
      status: "blocked",
      adapter: "macos-authorized-helper",
      executionPlan: {
        allowedByPolicy: false,
        policyReason: expect.stringContaining("not macOS"),
      },
      continuation: {
        state: "blocked-by-policy",
      },
    });
  });

  it("blocks arbitrary privileged plans that contain redacted secret placeholders", () => {
    const secretArg = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "other_privileged_setup",
        platform: "darwin",
        reason: "Do not execute redacted placeholders.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/env", args: ["installer", "password=hunter2"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-5" },
    );

    expect(planMacosPrivilegedAction(secretArg)).toMatchObject({
      adapter: "macos-authorized-helper",
      allowedByPolicy: false,
      policyReason: expect.stringContaining("redacted secret placeholders"),
    });
  });

  it("executes Linux and Windows arbitrary structured actions", async () => {
    const linuxAdapter = new LinuxPolkitHelperAdapter({
      credentialRehearsalAvailable: true,
      commandRunner: async () => ({ exitCode: 0, stdout: "installed token=abcdef\n", stderr: "" }),
    });
    const windowsCalls: unknown[] = [];
    const windowsAdapter = new WindowsElevatedHelperAdapter({
      commandRunner: async (input) => {
        windowsCalls.push(input);
        return { exitCode: 0, stdout: "uac ok\n", stderr: "" };
      },
    });
    const linuxRequest = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        platform: "linux",
        packageName: "ambient-local-provider",
        reason: "Install a package needed by the local provider.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/apt-get", args: ["install", "-y", "espeak-ng"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-cross-platform-helper" },
    );

    expect(linuxAdapter.status()).toMatchObject({
      selectedAdapter: "linux-polkit-helper",
      selectedAdapterExecutesPrivilegedCommands: true,
      credentialCapture: "available",
    });
    await expect(linuxAdapter.execute({ request: linuxRequest, credential: "ambient-password", credentialCapture: "captured-and-discarded" })).resolves.toMatchObject({
      status: "succeeded",
      adapter: "linux-polkit-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "linux-polkit-helper",
        executionMode: "executed",
        allowedByPolicy: true,
        platform: "linux",
      },
      continuation: {
        state: "ready-to-resume-validation",
        packageName: "ambient-local-provider",
      },
    });
    expect(planLinuxPrivilegedAction(linuxRequest)).toMatchObject({
      allowedByPolicy: true,
      executable: "/usr/bin/apt-get",
      args: ["install", "-y", "espeak-ng"],
    });
    const windowsRequest = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        platform: "win32",
        packageName: "ambient-local-provider",
        reason: "Install a package needed by the local provider.",
        commands: [{ exe: "winget", args: ["install", "--id", "eSpeak-NG.eSpeak-NG"] }],
      }),
      { workspacePath: "C:\\workspace", requestId: "request-windows-helper" },
    );
    expect(windowsAdapter.status()).toMatchObject({
      selectedAdapter: "windows-elevated-helper",
      selectedAdapterExecutesPrivilegedCommands: true,
      credentialCapture: "not-implemented",
      adapterStatus: "available",
    });
    await expect(windowsAdapter.execute({ request: windowsRequest })).resolves.toMatchObject({
      status: "succeeded",
      adapter: "windows-elevated-helper",
      executionPlan: {
        adapter: "windows-elevated-helper",
        executionMode: "executed",
        allowedByPolicy: true,
        platform: "win32",
      },
    });
    expect(planWindowsPrivilegedAction(windowsRequest)).toMatchObject({
      allowedByPolicy: true,
      requiresCredential: false,
      executable: "winget",
    });
    expect(windowsCalls).toEqual([
      expect.objectContaining({
        executable: "winget",
        args: ["install", "--id", "eSpeak-NG.eSpeak-NG"],
      }),
    ]);
  });

  it("rejects malformed or non-redacted native requests at the adapter boundary", () => {
    const request = buildPrivilegedActionNativeRequest(
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        reason: "Needs package manager privilege.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{ exe: "/usr/bin/env", args: ["installer", "password=hunter2"] }],
      }),
      { workspacePath: "/workspace", requestId: "request-2" },
    );

    expect(() => validatePrivilegedActionNativeRequestForAdapter(request)).not.toThrow();
    expect(() => validatePrivilegedActionNativeRequestForAdapter({ ...request, template: { ...request.template, credential: "{{AMBIENT_PRIVILEGED_AUTH}}" } })).toThrow(
      /must not include credential/i,
    );
    expect(() => validatePrivilegedActionNativeRequestForAdapter({
      ...request,
      uiPrompt: {
        ...request.uiPrompt,
        detail: `${request.uiPrompt.detail}\npassword=hunter2`,
      },
    })).toThrow(/unredacted secret-like text/i);
  });
});
