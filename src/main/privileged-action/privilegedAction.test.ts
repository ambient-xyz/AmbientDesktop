import { describe, expect, it } from "vitest";
import {
  buildPrivilegedActionNativeRequest,
  dryRunPrivilegedAction,
  dryRunPrivilegedActionNativeRequest,
  planPrivilegedAction,
  privilegedActionAdapterStatus,
  privilegedActionAdapterStatusText,
  privilegedActionApprovalDetail,
  privilegedActionResultFromNativeResult,
  privilegedActionResultText,
  privilegedActionUiPrompt,
  redactPrivilegedOutputPreview,
  successfulPrivilegedActionNativeRequest,
  withPrivilegedActionLogPath,
} from "./privilegedAction";

describe("privileged action handoff", () => {
  it("reports current adapter status as dry-run only", () => {
    const status = privilegedActionAdapterStatus();
    const text = privilegedActionAdapterStatusText(status);

    expect(status).toMatchObject({
      schemaVersion: "ambient-privileged-action-v1",
      execution: "dry-run-only",
      adapterStatus: "not-implemented",
      selectedAdapter: "dry-run",
      selectedAdapterExecutesPrivilegedCommands: false,
      policyPlanning: "available",
      credentialCapture: "not-implemented",
    });
    expect(status.supportedPurposes).toContain("create_system_symlink");
    expect(status.policyHints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adapter: "macos-authorized-helper",
          platform: "darwin",
          purpose: "create_system_symlink",
          executionMode: "planned-not-executed",
          allowedByPolicy: true,
          commandPattern: "<structured executable> <structured args...>",
        }),
        expect.objectContaining({
          adapter: "linux-polkit-helper",
          platform: "linux",
          purpose: "install_system_package",
          allowedByPolicy: true,
          commandPattern: "<structured executable> <structured args...>",
        }),
        expect.objectContaining({
          adapter: "windows-elevated-helper",
          platform: "win32",
          purpose: "install_system_package",
          allowedByPolicy: true,
          commandPattern: "<structured executable> <structured args...>",
        }),
      ]),
    );
    expect(status.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "dry-run", available: true, executesPrivilegedCommands: false }),
        expect.objectContaining({ name: "macos-authorized-helper", available: false, executesPrivilegedCommands: true }),
      ]),
    );
    expect(text).toContain("Execution: dry-run-only");
    expect(text).toContain("Selected adapter: dry-run");
    expect(text).toContain("Policy planning: available");
    expect(text).toContain("Policy hints:");
    expect(text).toContain("<structured executable> <structured args...>");
    expect(text).toContain("Windows UAC");
    expect(text).toContain("Do not ask the user to copy sudo/admin commands");
  });

  it("normalizes a typed request without exposing the credential sentinel", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "create_system_symlink",
      packageName: "ambient-kokoro-tts",
      reason: "The espeak-ng runtime expects data at a compiled-in protected path.",
      platform: "darwin",
      credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
      commands: [
        { exe: "/bin/mkdir", args: ["-p", "/usr/local/share/espeak-ng-data"], rationale: "Create the protected parent directory." },
        {
          exe: "/bin/ln",
          args: ["-sfn", "/workspace/.ambient/kokoro/espeak-ng-data", "/usr/local/share/espeak-ng-data"],
          rationale: "Point the compiled-in path at the provider-local assets.",
        },
      ],
    });

    expect(plan.commandCount).toBe(2);
    expect(plan.adapterReadiness).toEqual({
      execution: "dry-run-only",
      adapterStatus: "not-implemented",
      actionCategory: "create_system_symlink",
      executablePolicy: "template-reviewed-no-shell",
      futureAdapters: ["macos-authorized-helper", "linux-polkit-helper", "windows-elevated-helper"],
    });
    expect(plan.credentialPolicy).toEqual({
      visibleToPi: false,
      persistence: "ephemeral",
      expiresAfterUse: true,
      logPolicy: "redact-all",
    });
    expect(privilegedActionApprovalDetail(plan, "/workspace")).toContain("Credential: ephemeral Ambient privileged auth sentinel");
    expect(privilegedActionApprovalDetail(plan, "/workspace")).toContain("Execution: dry-run-only; adapter not-implemented");
  });

  it("rejects general sudo and shell wrappers", () => {
    expect(() =>
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        reason: "Needs elevation.",
        commands: [{ exe: "sudo", args: ["ln", "-sfn", "a", "b"] }],
      }),
    ).toThrow(/must not invoke shell\/sudo wrappers/i);

    expect(() =>
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        reason: "Needs elevation.",
        commands: [{ exe: "/bin/bash", args: ["-lc", "sudo whoami"] }],
      }),
    ).toThrow(/must not invoke shell\/sudo wrappers/i);
  });

  it("keeps dry-run output redacted and non-executing", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "install_system_package",
      reason: "A dependency is only available from the platform package manager.",
      credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
      commands: [{ exe: "/usr/bin/env", args: ["installer", "password=hunter2", "{{AMBIENT_PRIVILEGED_AUTH}}"] }],
    });
    const result = dryRunPrivilegedAction(plan);
    const text = privilegedActionResultText(result);

    expect(result.status).toBe("not-executed");
    expect(result.adapter).toBe("dry-run");
    expect(result.nativeResult.continuation).toMatchObject({
      state: "blocked-until-native-adapter",
      recommendedTools: ["ambient_privileged_action_status"],
    });
    expect(text).toContain("No command was executed");
    expect(text).toContain("Request adapter readiness: not-implemented");
    expect(text).toContain("Continuation:");
    expect(text).toContain("state: blocked-until-native-adapter");
    expect(text).toContain("executablePolicy: template-reviewed-no-shell");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("{{AMBIENT_PRIVILEGED_AUTH}}");
    expect(text).toContain("password=[REDACTED]");
    expect(text).toContain("[AMBIENT_PRIVILEGED_AUTH]");
  });

  it("builds a JSON-safe native request and dry-run result contract", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "create_system_symlink",
      packageName: "ambient-kokoro-tts",
      reason: "The native runtime needs a protected data path.",
      platform: "darwin",
      credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
      commands: [{ exe: "/bin/ln", args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data", "token=secret"] }],
    });
    const prompt = privilegedActionUiPrompt(plan, "/workspace");
    const request = buildPrivilegedActionNativeRequest(plan, {
      workspacePath: "/workspace",
      threadId: "thread-1",
      requestId: "privileged-request-1",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    const result = dryRunPrivilegedActionNativeRequest(request);

    expect(prompt).toMatchObject({
      responseMode: "native-credential-required",
      credentialPrompt: "ephemeral-native-prompt-required",
      title: "Review privileged action: create_system_symlink?",
    });
    expect(request).toMatchObject({
      schemaVersion: "ambient-privileged-action-v1",
      requestId: "privileged-request-1",
      threadId: "thread-1",
      workspacePath: "/workspace",
      credentialPolicy: { visibleToPi: false, persistence: "ephemeral", expiresAfterUse: true, logPolicy: "redact-all" },
      adapterReadiness: { execution: "dry-run-only", adapterStatus: "not-implemented" },
    });
    expect(JSON.stringify(request)).not.toContain("{{AMBIENT_PRIVILEGED_AUTH}}");
    expect(JSON.stringify(request.uiPrompt)).not.toContain("token=secret");
    expect(result).toMatchObject({
      schemaVersion: "ambient-privileged-action-v1",
      requestId: "privileged-request-1",
      status: "not-executed",
      adapter: "dry-run",
      commandCount: 1,
      credentialCapture: "not-requested",
      continuation: {
        state: "blocked-until-native-adapter",
        packageName: "ambient-kokoro-tts",
        reason: "The request was accepted for review, but no native privileged adapter executed it.",
        recommendedTools: ["ambient_privileged_action_status"],
        instructions: expect.arrayContaining([
          expect.stringContaining("Wait for a privileged adapter result with status succeeded"),
        ]),
      },
    });
    expect(result.redactedCommands[0]?.args).toContain("token=[REDACTED]");

    expect(dryRunPrivilegedActionNativeRequest(request, { credentialCapture: "rehearsed-and-discarded" })).toMatchObject({
      status: "not-executed",
      credentialCapture: "rehearsed-and-discarded",
    });
  });

  it("marks rejected adapter policies as blocked continuations", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "create_system_symlink",
      packageName: "ambient-kokoro-tts",
      reason: "The native runtime needs a protected data path.",
      platform: "darwin",
      credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
      commands: [{ exe: "/bin/ln", args: ["-sfn", "/outside/data", "/etc/espeak-ng-data"] }],
    });
    const request = buildPrivilegedActionNativeRequest(plan, {
      workspacePath: "/workspace",
      requestId: "privileged-request-2",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    const result = dryRunPrivilegedActionNativeRequest(request, {
      executionPlan: {
        adapter: "dry-run",
        executionMode: "dry-run-only",
        allowedByPolicy: false,
        policyReason: "macOS protected symlink target must be inside an Ambient-owned protected path.",
        platform: "darwin",
        purpose: "create_system_symlink",
        requiresCredential: false,
        executesPrivilegedCommands: false,
        warnings: ["No privileged command was executed."],
      },
    });

    expect(result.continuation).toMatchObject({
      state: "blocked-by-policy",
      packageName: "ambient-kokoro-tts",
      reason: "macOS protected symlink target must be inside an Ambient-owned protected path.",
      recommendedTools: ["ambient_privileged_action_status"],
    });
  });

  it("builds successful adapter results that resume capability validation", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "create_system_symlink",
      packageName: "ambient-kokoro-tts",
      reason: "The native runtime needs a protected data path.",
      platform: "darwin",
      credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
      commands: [{ exe: "/bin/ln", args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"] }],
    });
    const request = buildPrivilegedActionNativeRequest(plan, {
      workspacePath: "/workspace",
      requestId: "privileged-request-3",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    const result = successfulPrivilegedActionNativeRequest(request, {
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "macos-authorized-helper",
        executionMode: "planned-not-executed",
        allowedByPolicy: true,
        policyReason: "macOS adapter allows arbitrary structured privileged actions after explicit user approval.",
        platform: "darwin",
        purpose: "create_system_symlink",
        requiresCredential: true,
        executesPrivilegedCommands: false,
        executable: "/bin/ln",
        args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"],
        warnings: ["No privileged command was executed."],
      },
      stdoutPreview: "linked password=hunter2\n",
      stderrPreview: "token=abcdef",
      logPath: "/workspace/.ambient/logs/privileged-action.json",
    });

    expect(result).toMatchObject({
      status: "succeeded",
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        executionMode: "executed",
        executesPrivilegedCommands: true,
      },
      continuation: {
        state: "ready-to-resume-validation",
        packageName: "ambient-kokoro-tts",
        recommendedTools: ["ambient_capability_builder_validate", "ambient_capability_builder_register-after-validation"],
        redactedLogPath: "/workspace/.ambient/logs/privileged-action.json",
        resumeAction: {
          toolName: "ambient_capability_builder_validate",
          input: { packageName: "ambient-kokoro-tts", includeSmokeTests: true },
          requiresApproval: true,
          runAfter: "privileged-action-succeeded",
        },
      },
      stdoutPreview: "linked password=[REDACTED]\n",
      stderrPreview: "token=[REDACTED]",
      logPath: "/workspace/.ambient/logs/privileged-action.json",
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("abcdef");
    expect(result.executionPlan?.warnings).toEqual([]);
    expect(privilegedActionResultFromNativeResult(plan, result)).toMatchObject({
      status: "succeeded",
      adapter: "macos-authorized-helper",
      nativeResult: {
        continuation: {
          state: "ready-to-resume-validation",
          resumeAction: {
            toolName: "ambient_capability_builder_validate",
            input: { packageName: "ambient-kokoro-tts", includeSmokeTests: true },
          },
        },
      },
    });
    expect(privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result))).toContain("Request adapter readiness: not-implemented");
    expect(privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result))).toContain("Adapter execution plan:");
    expect(privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result))).toContain("executionMode: executed");
    expect(privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result))).toContain("Redacted log path: /workspace/.ambient/logs/privileged-action.json");
    expect(privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result))).toContain("- redactedLogPath: /workspace/.ambient/logs/privileged-action.json");
    expect(() => successfulPrivilegedActionNativeRequest(request, {
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "dry-run",
        executionMode: "dry-run-only",
        allowedByPolicy: false,
        policyReason: "Rejected.",
        platform: "darwin",
        purpose: "create_system_symlink",
        requiresCredential: false,
        executesPrivilegedCommands: false,
        warnings: [],
      },
    })).toThrow(/approved execution plan/i);
    expect(() => successfulPrivilegedActionNativeRequest(request, {
      adapter: "macos-authorized-helper",
      credentialCapture: "rehearsed-and-discarded" as any,
      executionPlan: {
        adapter: "macos-authorized-helper",
        executionMode: "planned-not-executed",
        allowedByPolicy: true,
        policyReason: "Approved.",
        platform: "darwin",
        purpose: "create_system_symlink",
        requiresCredential: true,
        executesPrivilegedCommands: false,
        warnings: [],
      },
    })).toThrow(/captured-and-discarded/i);
  });

  it("attaches redacted log paths to adapter continuation text", () => {
    const plan = planPrivilegedAction({
      kind: "privileged_action_template",
      purpose: "repair_protected_path",
      packageName: "ambient-kokoro-tts",
      reason: "The provider needs a protected data-path repair.",
      platform: "darwin",
      commands: [{ exe: "/bin/ln", args: ["-sfn", "/workspace/data", "/Library/Application Support/Ambient/data"] }],
    });
    const request = buildPrivilegedActionNativeRequest(plan, {
      workspacePath: "/workspace",
      requestId: "privileged-request-log",
      createdAt: "2026-05-10T00:00:00.000Z",
    });
    const result = withPrivilegedActionLogPath(
      dryRunPrivilegedActionNativeRequest(request),
      "/workspace/.ambient/privileged-actions/privileged-request-log.json",
    );
    const text = privilegedActionResultText(privilegedActionResultFromNativeResult(plan, result));

    expect(result.logPath).toBe("/workspace/.ambient/privileged-actions/privileged-request-log.json");
    expect(result.continuation.redactedLogPath).toBe("/workspace/.ambient/privileged-actions/privileged-request-log.json");
    expect(text).toContain("Redacted log path: /workspace/.ambient/privileged-actions/privileged-request-log.json");
    expect(text).toContain("- redactedLogPath: /workspace/.ambient/privileged-actions/privileged-request-log.json");
    expect(text).toContain("Use file_read on redactedLogPath");
  });

  it("redacts privileged output previews before they become Pi-visible", () => {
    expect(redactPrivilegedOutputPreview("ok password=hunter2 token=abcdef")).toBe("ok password=[REDACTED] token=[REDACTED]");
    expect(redactPrivilegedOutputPreview("{{AMBIENT_PRIVILEGED_AUTH}}")).toBe("[AMBIENT_PRIVILEGED_AUTH]");
  });

  it("rejects credential values instead of sentinel placeholders", () => {
    expect(() =>
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "install_system_package",
        reason: "Needs admin auth.",
        credential: "real-password",
        commands: [{ exe: "/usr/bin/true" }],
      }),
    ).toThrow(/must be the sentinel/);
  });

  it("rejects invented action purposes so adapters get a stable contract", () => {
    expect(() =>
      planPrivilegedAction({
        kind: "privileged_action_template",
        purpose: "sudo_fix_it",
        reason: "Needs admin auth.",
        commands: [{ exe: "/usr/bin/true" }],
      }),
    ).toThrow(/Unsupported privileged action purpose/);
  });
});
