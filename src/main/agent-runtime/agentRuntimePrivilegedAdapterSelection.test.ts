import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "./agentRuntime";
import { scaffoldCapabilityBuilderPackage } from "./agentRuntimeCapabilityBuilderFacade";
import {
  MacosAuthorizedHelperUnavailableAdapter,
  privilegedActionAdapterStatus,
  successfulPrivilegedActionNativeRequest,
  type PrivilegedActionAdapter,
  type PrivilegedActionAdapterExecuteInput,
} from "./agentRuntimePrivilegedActionFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const describeNative = process.env.AMBIENT_TEST_NATIVE === "1" ? describe : describe.skip;

describeNative("AgentRuntime privileged adapter selection", () => {
  it("surfaces the selected macOS policy-boundary adapter through privileged tools", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-privileged-adapter-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("privileged adapter").id, { permissionMode: "workspace" });
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
          denyThread: () => undefined,
        },
        {
          privilegedActionAdapter: new MacosAuthorizedHelperUnavailableAdapter({
            commandRunner: async () => ({ exitCode: 0, stdout: "ok\n", stderr: "" }),
          }),
          privilegedCredentials: {
            request: async () => ({ allowed: true, credential: "ambient-password" }),
          },
        },
      );
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPrivilegedActionToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const statusTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_status");
      const requestTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_request");
      if (!statusTool || !requestTool) throw new Error("Expected privileged tools to be registered.");

      const statusResult = await statusTool.execute("status-call", {});
      expect(statusResult.content[0].text).toContain("Selected adapter: macos-authorized-helper");
      expect(statusResult.details.adapterStatus.selectedAdapter).toBe("macos-authorized-helper");

      const requestResult = await requestTool.execute("request-call", {
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        platform: "darwin",
        packageName: "ambient-kokoro-tts",
        reason: "Repair a compiled-in runtime data path.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/bin/ln",
          args: ["-sfn", ".ambient/runtime/espeak-ng-data", "/Library/Application Support/Ambient/protected-runtime/espeak-ng-data"],
        }],
      });

      expect(requestResult.content[0].text).toContain("Status: succeeded");
      expect(requestResult.content[0].text).toContain("Adapter: macos-authorized-helper");
      expect(requestResult.content[0].text).toContain("state: ready-to-resume-validation");
      expect(requestResult.details).toMatchObject({
        status: "succeeded",
        adapter: "macos-authorized-helper",
        credentialCapture: "captured-and-discarded",
        nativeResult: {
          executionPlan: { allowedByPolicy: true },
          continuation: { state: "ready-to-resume-validation" },
        },
      });
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("auto-resumes Builder validation after a successful privileged adapter result", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-privileged-resume-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      await scaffoldCapabilityBuilderPackage(workspacePath, {
        name: "piper-tts",
        goal: "Generate WAV voice files from text using Piper",
      });
      const thread = store.updateThreadSettings(store.createThread("privileged resume").id, { permissionMode: "workspace" });
      const requester = vi.fn(async () => ({ allowed: true, mode: "allow_once" as const }));
      const runtime = new AgentRuntime(
        store,
        {} as any,
        {} as any,
        () => undefined,
        {
          request: requester,
          denyThread: () => undefined,
        },
        {
          privilegedActionAdapter: new SuccessfulPrivilegedActionAdapter(),
        },
      );
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      (runtime as any).createPrivilegedActionToolExtension(thread.id, store.getWorkspace())({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const requestTool = registeredTools.find((tool) => tool.name === "ambient_privileged_action_request");
      if (!requestTool) throw new Error("Expected privileged request tool to be registered.");
      const updates: any[] = [];
      const requestResult = await requestTool.execute("request-call", {
        kind: "privileged_action_template",
        purpose: "create_system_symlink",
        platform: "darwin",
        packageName: "piper-tts",
        reason: "Repair a compiled-in runtime data path.",
        credential: "{{AMBIENT_PRIVILEGED_AUTH}}",
        commands: [{
          exe: "/bin/ln",
          args: ["-sfn", ".ambient/runtime/espeak-ng-data", "/Library/Application Support/Ambient/protected-runtime/espeak-ng-data"],
        }],
      }, undefined, (update: any) => updates.push(update));

      expect(requestResult.content[0].text).toContain("Status: succeeded");
      expect(requestResult.content[0].text).toContain("Auto-resumed Capability Builder validation");
      expect(requestResult.content[0].text).toContain("Ambient Capability Builder validation");
      expect(requestResult.content[0].text).toContain("Package: ambient-piper-tts");
      expect(requestResult.details).toMatchObject({
        status: "succeeded",
        credentialCapture: "captured-and-discarded",
        autoResumeValidation: {
          status: "succeeded",
          packageName: "ambient-piper-tts",
          commandCount: 2,
        },
      });
      expect(updates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          details: expect.objectContaining({
            toolName: "ambient_capability_builder_validate",
            reason: "privileged-action-succeeded",
          }),
        }),
      ]));
      expect(requester).toHaveBeenCalledTimes(2);
      expect(store.listPermissionAudit(10)).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolName: "ambient_privileged_action_request", decision: "allowed" }),
        expect.objectContaining({ toolName: "ambient_capability_builder_validate", decision: "allowed" }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

class SuccessfulPrivilegedActionAdapter implements PrivilegedActionAdapter {
  readonly name = "macos-authorized-helper";

  status() {
    return privilegedActionAdapterStatus({ selectedAdapter: this.name });
  }

  async execute(input: PrivilegedActionAdapterExecuteInput) {
    return successfulPrivilegedActionNativeRequest(input.request, {
      adapter: "macos-authorized-helper",
      credentialCapture: "captured-and-discarded",
      executionPlan: {
        adapter: "macos-authorized-helper",
        executionMode: "planned-not-executed",
        allowedByPolicy: true,
        policyReason: "Allowlisted test privileged action.",
        platform: "darwin",
        purpose: input.request.template.purpose,
        requiresCredential: true,
        executesPrivilegedCommands: false,
        warnings: [],
      },
      logPath: join(input.request.workspacePath, ".ambient/privileged-actions/success.json"),
    });
  }
}
