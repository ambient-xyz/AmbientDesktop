import { describe, expect, it, vi } from "vitest";
import type { AmbientPermissionGrant, CreateAmbientPermissionGrantInput, PermissionRequest } from "../../shared/permissionTypes";
import {
  enrichPermissionRequest,
  findMatchingPermissionGrant,
  grantInputFromPromptResponse,
  permissionGrantTargetHash,
  resolvePermissionWithGrants,
} from "./permissionGrants";

const baseContext = {
  permissionMode: "workspace" as const,
  threadId: "thread-1",
  workflowThreadId: "workflow-1",
  projectPath: "/workspaces/project",
  workspacePath: "/workspaces/project/app",
};

function request(overrides: Partial<Omit<PermissionRequest, "id">> = {}): Omit<PermissionRequest, "id"> {
  return {
    threadId: "thread-1",
    toolName: "bash",
    title: "Allow command?",
    message: "Review the command",
    detail: "npm test",
    risk: "workspace-command",
    ...overrides,
  };
}

function grant(overrides: Partial<AmbientPermissionGrant> = {}): AmbientPermissionGrant {
  const enriched = enrichPermissionRequest(request(), baseContext);
  return {
    id: "grant-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "workspace",
    workspacePath: baseContext.workspacePath,
    actionKind: enriched.grantActionKind!,
    targetKind: enriched.grantTargetKind!,
    targetHash: enriched.grantTargetHash!,
    targetLabel: enriched.grantTargetLabel!,
    source: "permission_prompt",
    reason: "Allowed from prompt",
    ...overrides,
  };
}

describe("permission grants", () => {
  it("enriches permission prompts with reusable scopes and stable grant targets", () => {
    const enriched = enrichPermissionRequest(request(), baseContext);

    expect(enriched.reusableScopes).toEqual(["thread", "workflow_thread", "project", "workspace"]);
    expect(enriched.grantActionKind).toBe("shell_command");
    expect(enriched.grantTargetKind).toBe("shell_command_prefix");
    expect(enriched.grantTargetLabel).toBe("npm test");
    expect(enriched.grantTargetHash).toBe(permissionGrantTargetHash("shell_command", "shell_command_prefix", "npm test"));
  });

  it("limits sensitive grants to thread-level scopes by default", () => {
    const secret = enrichPermissionRequest(request({ risk: "secret-path", detail: "<local-user>/.ssh/id_rsa" }), baseContext);
    const login = enrichPermissionRequest(request({ risk: "browser-login", detail: "https://example.com" }), baseContext);
    const privileged = enrichPermissionRequest(request({ risk: "privileged-action", toolName: "ambient_privileged_action_request" }), baseContext);

    expect(secret.reusableScopes).toEqual(["thread", "workflow_thread"]);
    expect(login.reusableScopes).toEqual(["thread", "workflow_thread"]);
    expect(privileged.reusableScopes).toEqual(["thread", "workflow_thread"]);
    expect(privileged.grantActionKind).toBe("plugin_tool_execute");
    expect(privileged.grantTargetKind).toBe("tool");
  });

  it("uses stable grant targets for repeated browser profile and control prompts", () => {
    const profileNav = enrichPermissionRequest(
      request({ toolName: "browser_nav", risk: "browser-profile", detail: "file:///workspace/index.html" }),
      baseContext,
    );
    const profileEval = enrichPermissionRequest(
      request({ toolName: "browser_eval", risk: "browser-profile", detail: "document.body.innerText" }),
      baseContext,
    );
    const controlEval = enrichPermissionRequest(
      request({ toolName: "browser_eval", risk: "browser-control", detail: "document.getElementById('start').click()" }),
      baseContext,
    );
    const controlScreenshot = enrichPermissionRequest(
      request({ toolName: "browser_screenshot", risk: "browser-control", detail: "current viewport" }),
      baseContext,
    );

    expect(profileNav).toMatchObject({
      grantActionKind: "browser_profile",
      grantTargetKind: "risk",
      grantTargetLabel: "copied-chrome-profile",
    });
    expect(profileEval.grantTargetHash).toBe(profileNav.grantTargetHash);

    expect(controlEval).toMatchObject({
      grantActionKind: "browser_control",
      grantTargetKind: "risk",
      grantTargetLabel: "browser-page-control",
    });
    expect(controlScreenshot.grantTargetHash).toBe(controlEval.grantTargetHash);
  });

  it("uses a reusable grant target for loopback network proof commands", () => {
    const serverProof = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "python3 -m http.server 8742 &>/dev/null &\necho \"Server PID: $!\"\nsleep 1\ncurl -s http://localhost:8742/ | head -20",
      }),
      baseContext,
    );
    const curlProbe = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "lsof -i :8765 2>/dev/null; sleep 1; curl -s http://127.0.0.1:8765/ | head -5",
      }),
      baseContext,
    );
    const external = enrichPermissionRequest(
      request({
        risk: "network-command",
        detail: "curl -s https://example.com/ | head -5",
      }),
      baseContext,
    );

    expect(serverProof).toMatchObject({
      grantActionKind: "shell_command",
      grantTargetKind: "shell_command_prefix",
      grantTargetLabel: "loopback shell network commands",
    });
    expect(curlProbe.grantTargetHash).toBe(serverProof.grantTargetHash);
    expect(external.grantTargetHash).not.toBe(serverProof.grantTargetHash);
    expect(external.grantTargetLabel).toBe("curl -s https://example.com/ | head -5");
  });

  it("matches grants only inside their scope", () => {
    const matching = grant();

    expect(findMatchingPermissionGrant([matching], request(), baseContext)?.id).toBe("grant-1");
    expect(
      findMatchingPermissionGrant([matching], request(), {
        ...baseContext,
        workspacePath: "/other/workspace",
      }),
    ).toBeUndefined();
    expect(findMatchingPermissionGrant([grant({ revokedAt: "2026-05-02T00:00:00.000Z" })], request(), baseContext)).toBeUndefined();
    expect(
      findMatchingPermissionGrant([grant({ expiresAt: "2026-04-30T00:00:00.000Z" })], request(), baseContext, new Date("2026-05-01T00:00:00.000Z")),
    ).toBeUndefined();
  });

  it("turns reusable prompt responses into persisted grant inputs", () => {
    expect(grantInputFromPromptResponse(request(), baseContext, "allow_once")).toBeUndefined();

    const input = grantInputFromPromptResponse(request(), baseContext, "always_workspace");

    expect(input).toMatchObject({
      permissionModeAtCreation: "workspace",
      scopeKind: "workspace",
      workspacePath: baseContext.workspacePath,
      actionKind: "shell_command",
      targetKind: "shell_command_prefix",
      targetLabel: "npm test",
      source: "permission_prompt",
    });
  });

  it("reuses a persisted grant before opening a prompt", async () => {
    const store = {
      listPermissionGrants: vi.fn(() => [grant()]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: false, mode: "deny" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: request(), context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "persistent_grant",
      grant: expect.objectContaining({ id: "grant-1" }),
    });
    expect(requester.request).not.toHaveBeenCalled();
  });

  it("reuses a persisted loopback network grant for later localhost proof variants", async () => {
    const first = request({
      risk: "network-command",
      detail: "python3 -m http.server 8742 &>/dev/null &\necho \"Server PID: $!\"\nsleep 1\ncurl -s http://localhost:8742/ | head -20",
    });
    const second = request({
      risk: "network-command",
      detail: "lsof -i :8765 2>/dev/null; sleep 1; curl -s http://127.0.0.1:8765/ | head -5",
    });
    const enriched = enrichPermissionRequest(first, baseContext);
    const store = {
      listPermissionGrants: vi.fn(() => [
        grant({
          id: "loopback-grant",
          actionKind: enriched.grantActionKind!,
          targetKind: enriched.grantTargetKind!,
          targetHash: enriched.grantTargetHash!,
          targetLabel: enriched.grantTargetLabel!,
        }),
      ]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: false, mode: "deny" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: second, context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "persistent_grant",
      grant: expect.objectContaining({ id: "loopback-grant" }),
    });
    expect(requester.request).not.toHaveBeenCalled();
  });

  it("creates a persistent grant when the user chooses an always mode", async () => {
    const created = grant({ id: "grant-created" });
    const store = {
      listPermissionGrants: vi.fn(() => []),
      createPermissionGrant: vi.fn((_input: CreateAmbientPermissionGrantInput) => created),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: true, mode: "always_project" as const })),
    };

    await expect(resolvePermissionWithGrants({ store: store as any, requester, request: request(), context: baseContext })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "prompt_always_project",
      grant: expect.objectContaining({ id: "grant-created" }),
    });
    expect(store.createPermissionGrant).toHaveBeenCalledWith(expect.objectContaining({ scopeKind: "project", projectPath: baseContext.projectPath }));
  });

  it("can require a fresh prompt even when a persistent grant exists", async () => {
    const store = {
      listPermissionGrants: vi.fn(() => [grant()]),
      createPermissionGrant: vi.fn(),
    };
    const requester = {
      request: vi.fn(async () => ({ allowed: true, mode: "always_project" as const })),
    };

    await expect(resolvePermissionWithGrants({
      store: store as any,
      requester,
      request: request(),
      context: baseContext,
      requireFreshPrompt: true,
    })).resolves.toMatchObject({
      allowed: true,
      decisionSource: "prompt_allow_once",
      response: "always_project",
    });
    expect(requester.request).toHaveBeenCalledWith(expect.objectContaining({ reusableScopes: [] }));
    expect(store.createPermissionGrant).not.toHaveBeenCalled();
  });
});
