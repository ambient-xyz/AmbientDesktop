import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AgentRuntimeInstallRouteGuard,
  appendMcpInstallRouteGuidance,
  formatInstallRouteGateBlockedMessage,
  formatMcpInstallShellBlockedMessage,
  formatRawPiInstallRootBlockedMessage,
  isInstallRouteGateSideEffectTool,
  looksLikeManualMcpInstallShellCommand,
  looksLikeRawPiInstallRootWriteShellCommand,
} from "./agentRuntimeInstallRouteGuard";
import type { AmbientInstallRoutePlan } from "./agentRuntimeInstallRouteFacade";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

describe("AgentRuntimeInstallRouteGuard", () => {
  it("blocks install side-effect tools after a needs-clarification plan and clears on a resolved lane", () => {
    const guard = new AgentRuntimeInstallRouteGuard();
    guard.recordInstallRoutePlan("thread-1", needsClarificationPlan(), "2026-06-11T00:00:00.000Z");

    expect(guard.latestInstallRouteLane("thread-1")).toBe("needs-clarification");
    expect(isInstallRouteGateSideEffectTool("ambient_cli_package_install")).toBe(true);
    expect(isInstallRouteGateSideEffectTool("ambient_install_route_plan")).toBe(false);
    expect(guard.installRouteGateBlockForTool("thread-1", "ambient_install_route_plan")).toBeUndefined();

    const block = guard.installRouteGateBlockForTool("thread-1", "bash");
    expect(block?.reason).toContain("needs-clarification");
    expect(block?.gate).toMatchObject({
      lane: "needs-clarification",
      blockers: ["Need package source."],
      createdAt: "2026-06-11T00:00:00.000Z",
    });
    expect(block?.detail).toContain("Ask one targeted clarification before any install side effects.");
    expect(block?.detail).toContain("Retry ambient_install_route_plan with sourceUrl, localPath, packageName, or requestedKind");
    expect(formatInstallRouteGateBlockedMessage("bash", block!.detail)).toContain("Ambient install route gate blocked bash.");

    guard.recordInstallRoutePlan("thread-1", normalAppSetupPlan(), "2026-06-11T00:01:00.000Z");

    expect(guard.latestInstallRouteLane("thread-1")).toBe("normal-app-setup");
    expect(guard.installRouteGateBlockForTool("thread-1", "bash")).toBeUndefined();
  });

  it("blocks MCP install-like bash commands after route context or an MCP install user request", () => {
    const guard = new AgentRuntimeInstallRouteGuard();
    const rawToolInput = { command: "git clone https://github.com/acme/example-mcp" };

    expect(looksLikeManualMcpInstallShellCommand(rawToolInput.command)).toBe(true);
    expect(guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "please run tests",
    })).toBeUndefined();

    const userRequestBlock = guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "Install this MCP from github.com/acme/example-mcp",
    });
    expect(userRequestBlock?.reason).toContain("Blocked MCP install-like bash command");
    expect(userRequestBlock?.detail).toContain("No install route plan has been completed in this thread.");
    expect(formatMcpInstallShellBlockedMessage("bash", userRequestBlock!.detail)).toContain("Ambient MCP install guard blocked bash.");

    guard.recordInstallRoutePlan("thread-1", normalAppSetupPlan());
    const routeStateBlock = guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "bash",
      rawToolInput,
      latestUserText: "please run tests",
    });
    expect(routeStateBlock?.detail).toContain("Latest install route lane: normal-app-setup");
    expect(guard.mcpInstallShellBlockForTool({
      threadId: "thread-1",
      toolName: "write",
      rawToolInput,
      latestUserText: "Install this MCP from github.com/acme/example-mcp",
    })).toBeUndefined();
  });

  it("tracks MCP autowire state and appends prompt guidance only for sourced MCP install requests", () => {
    const guard = new AgentRuntimeInstallRouteGuard();

    expect(guard.mcpAutowirePlanned("thread-1")).toBe(false);
    guard.recordMcpAutowirePlan("thread-1");
    expect(guard.mcpAutowirePlanned("thread-1")).toBe(true);

    expect(appendMcpInstallRouteGuidance("Base prompt", "please explain MCP")).toBe("Base prompt");
    const guided = appendMcpInstallRouteGuidance(
      "Base prompt",
      "Please install this MCP server from https://github.com/acme/example-mcp",
    );
    expect(guided).toContain("Ambient MCP install route reminder:");
    expect(guided).toContain("First call ambient_mcp_autowire_plan");
  });

  it("blocks side-effect writes to durable agent skill and plugin roots", () => {
    const guard = new AgentRuntimeInstallRouteGuard();

    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p ~/.codex/skills/example")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p ~/.CoDeX/skills/demo && cp SKILL.md ~/.CoDeX/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("ls -la ~/.codex/skills")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("ls -la ~/.codex/skills > skills.txt")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("grep foo ~/.codex/skills/demo/SKILL.md > /tmp/matches")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("grep foo ~/.codex/skills/demo/SKILL.md > ~/.codex/skills/out.txt")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cat ~/.codex/skills/demo/SKILL.md > ~/.codex/plugins/demo/plugin.json")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cp ~/.codex/skills/demo/SKILL.md ~/.codex/plugins/demo/plugin.json")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=plugins; cp ~/.codex/skills/demo/SKILL.md \"$root/$leaf/demo/plugin.json\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("ls ~/.codex/skills; root=$HOME/.codex; leaf=plugins; cp plugin.json \"$root/$leaf/demo/plugin.json\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=plugins; cp ~/.codex/skills/demo/SKILL.md /tmp/plugin.json")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=skills; mkdir -p /tmp/demo")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=skills; cp \"$root/$leaf/demo/SKILL.md\" /tmp/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("printf x >| ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("find ~/.codex/skills -maxdepth 2 -type f")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("find ~/.codex/skills -fprint0 ~/.codex/skills/out")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("head ~/.codex/skills/demo/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -n '1,20p' ~/.codex/skills/demo/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed 's/error/warn/g' ~/.codex/skills/demo/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -n '1w ~/.codex/skills/out' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -n \"1w$HOME/.codex/skills/out\" input")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed '/./w ~/.codex/skills/out' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed 'w ~/.codex/skills/out' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed 'e touch ~/.codex/skills/out' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed 's#x#touch ~/.codex/skills/out#e' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("tar -czf /tmp/skills.tgz ~/.codex/skills")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("tar -czf ~/.codex/skills/archive.tgz ~/.codex/skills/demo")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cp -R ~/.codex/skills /tmp/backup")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cp SKILL.md ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("ls -la ~/.codex/skills && mkdir -p /tmp/pi-demo")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && git clone https://example.com/pkg demo")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.agents/plugins; touch plugin.json")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && ls -la")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && echo x > demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && ls -la > /tmp/skills.txt")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && tar -czf /tmp/skills.tgz .")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills && cp -R . /tmp/backup")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("node -e \"require('fs').writeFileSync(process.env.HOME + '/.codex/skills/demo/SKILL.md','x')\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("echo x>~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p ${HOME}/.codex/skills/demo && cp SKILL.md ${HOME}/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p \"$HOME\"/.codex/skills/demo && cp SKILL.md \"${HOME}\"/.agents/plugins/demo/plugin.json")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("d=.codex/skills/demo; mkdir -p ~/$d && cp SKILL.md ~/$d/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; mkdir -p \"$root/skills/demo\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=skills; printf x > \"$root/$leaf/demo/SKILL.md\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("root=$HOME/.codex; leaf=skills; mkdir -p \"$root/$leaf/demo\"; cp SKILL.md \"$root/$leaf/demo/SKILL.md\"")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p .codex/skills/demo && cp SKILL.md .codex/skills/demo/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p ~/.codex/skills-backup/demo && cp SKILL.md ~/.codex/skills-backup/demo/SKILL.md")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("mkdir -p $HOME/.agents/plugins.old/demo && cp plugin.json $HOME/.agents/plugins.old/demo/plugin.json")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("echo $(mkdir -p ~/.codex/skills/demo && cp SKILL.md ~/.codex/skills/demo/SKILL.md)")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -i s/a/b/ ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -ibak 's/a/b/' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("sed -i.bak 's/a/b/' ~/.codex/skills/demo/SKILL.md")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("find ~/.codex/skills/demo -delete")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("touch demo/SKILL.md", "~/.codex/skills")).toBe(true);
    expect(looksLikeRawPiInstallRootWriteShellCommand("ls -la", "~/.codex/skills")).toBe(false);
    expect(looksLikeRawPiInstallRootWriteShellCommand("cd ~/.codex/skills", undefined, { blockProtectedRootCd: true })).toBe(true);

    const bashBlock = guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "mkdir -p ~/.codex/skills/example && cp SKILL.md ~/.codex/skills/example/SKILL.md" },
    });
    expect(bashBlock?.reason).toContain("Blocked direct write");
    expect(bashBlock?.protectedRoot).toBe("~/.codex/skills");
    expect(formatRawPiInstallRootBlockedMessage("bash", bashBlock!.detail)).toContain("Ambient raw Pi install root guard blocked bash.");

    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "ls -la ~/.codex/skills" },
    })).toBeUndefined();
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "file_write",
      rawToolInput: { path: "~/.agents/plugins/example/plugin.json" },
    })?.protectedRoot).toBe("~/.agents/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "file_write",
      rawToolInput: { path: "~/.AGENTS/plugins/example/plugin.json" },
    })?.protectedRoot).toBe("~/.agents/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "file_write",
      rawToolInput: { path: ".codex/skills/example/SKILL.md" },
    })).toBeUndefined();
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "mkdir -p ~/.codex/skills/example && cp SKILL.md ~/.codex/skills/example/SKILL.md" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "touch demo/SKILL.md", cwd: "~/.codex/skills" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "ls -la", cwd: "~/.codex/skills" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "cd ~/.codex/skills" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "cd ~/.codex/skills" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "mkdir -p ~/.codex/skills/example" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "root=$HOME/.codex; leaf=skills; printf x > \"$root/$leaf/example/SKILL.md\"" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "mkdir -p ~/.codex/skills/example" },
      permissionMode: "full-access",
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "mkdir -p ~/.codex/plugins/example" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "cat ~/.codex/skills/example/SKILL.md > ~/.codex/plugins/example/plugin.json" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "cp ~/.codex/skills/example/SKILL.md ~/.codex/plugins/example/plugin.json" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "root=$HOME/.codex; leaf=plugins; cp ~/.codex/skills/example/SKILL.md \"$root/$leaf/example/plugin.json\"" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "ls ~/.codex/skills; root=$HOME/.codex; leaf=plugins; cp plugin.json \"$root/$leaf/example/plugin.json\"" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "mkdir -p ~/.pi/skills/example" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.pi/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "mkdir -p skills/demo && cp SKILL.md skills/demo/SKILL.md", cwd: "~/.codex" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "mkdir -p skills/demo && cp SKILL.md skills/demo/SKILL.md", cwd: "~/.codex" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash",
      rawToolInput: { command: "cat skills/demo/SKILL.md > plugins/demo/plugin.json", cwd: "~/.codex" },
      permissionMode: "workspace",
    })?.protectedRoot).toBe("~/.codex/plugins");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "ls -la skills > /tmp/skills.txt", cwd: "~/.codex" },
    })?.protectedRoot).toBe("~/.codex");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_start",
      rawToolInput: { cmd: "cp -R skills /tmp/backup", cwd: "~/.codex" },
    })?.protectedRoot).toBe("~/.codex");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_write",
      rawToolInput: { chars: "cd ~/.codex/skills\n" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_write",
      rawToolInput: { chars: "cd ~/.codex\n" },
    })?.protectedRoot).toBe("~/.codex/skills");
    expect(guard.rawPiInstallRootBlockForTool({
      toolName: "bash_write",
      rawToolInput: { chars: "cd skills\n" },
    })).toBeUndefined();
  });
});

describe("AgentRuntime install route gates", () => {
  it("blocks install side-effect tools after a needs-clarification route plan until Pi replans", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-install-route-gate-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("install route gate").id, { permissionMode: "full-access" });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });
      const controllers = (runtime as any).controllers;
      const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
      controllers.pluginSetupTools.createPluginInstallToolExtension(thread.id, workspace, {} as any, undefined)({
        registerTool: (tool: any) => registeredTools.push(tool),
      });

      const routeTool = registeredTools.find((tool) => tool.name === "ambient_install_route_plan");
      expect(routeTool).toBeDefined();

      const ambiguousPlan = await routeTool!.execute("route-ambiguous", {
        userRequest: "Install this thing.",
        requestedKind: "unknown",
      });
      expect(ambiguousPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "needs-clarification",
      });

      const blocked = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "mkdir -p ~/.agents/skills/mystery",
      });
      expect(blocked?.reason).toContain("needs-clarification");
      expect(permissionRequest).not.toHaveBeenCalled();

      const gateMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-install-route-gate");
      expect(gateMessage?.content).toContain("Ambient install route gate blocked bash.");
      expect(gateMessage?.content).toContain("Ask one targeted clarification before any install side effects.");
      expect(gateMessage?.content).toContain("Retry ambient_install_route_plan with sourceUrl, localPath, packageName, or requestedKind");

      const clarifiedPlan = await routeTool!.execute("route-clarified", {
        userRequest: "Install ffmpeg for this project.",
      });
      expect(clarifiedPlan.details).toMatchObject({
        runtime: "ambient-install-route",
        toolName: "ambient_install_route_plan",
        lane: "normal-app-setup",
      });

      await expect(controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "echo ok",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks MCP install-like bash commands before permission approval", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Install this MCP from https://github.com/alanpcf/brasil-data-mcp",
      });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });
      const controllers = (runtime as any).controllers;

      const blocked = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "git clone https://github.com/alanpcf/brasil-data-mcp /tmp/brasil-data-mcp",
      });
      const blockedReadmeFetch = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "curl -L https://raw.githubusercontent.com/Ratnaditya-J/csvglow/main/README.md",
      });
      const blockedToolHiveRun = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "thv run uvx://csvglow --name ambient-csvglow",
      });
      const allowedReadOnlyPathCheck = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "ls -la /private/tmp/ambient-mcp-toolhive-route-detection && find . -name 'test_csvglow*' -maxdepth 2",
      });

      expect(blocked?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedReadmeFetch?.reason).toContain("Blocked MCP install-like bash command");
      expect(blockedToolHiveRun?.reason).toContain("Blocked MCP install-like bash command");
      expect(allowedReadOnlyPathCheck).toBeUndefined();
      expect(permissionRequest).not.toHaveBeenCalled();
      const guardMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-mcp-install-shell-guard");
      expect(guardMessage?.content).toContain("Ambient MCP install guard blocked bash.");
      expect(guardMessage?.content).toContain("ToolHive wrapper");
      expect(guardMessage?.content).toContain("ambient_mcp_autowire_plan");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks direct raw agent skill root writes before permission approval", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-raw-pi-root-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("raw pi root guard").id, { permissionMode: "full-access" });
      const permissionRequest = vi.fn();
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: permissionRequest,
        denyThread: () => undefined,
      });
      const controllers = (runtime as any).controllers;

      const blocked = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "mkdir -p ~/.codex/skills/pi-demo && cp SKILL.md ~/.codex/skills/pi-demo/SKILL.md",
      });
      const blockedDetached = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash_start", {
        cmd: "node -e \"require('fs').writeFileSync(process.env.HOME + '/.codex/skills/pi-demo/SKILL.md','x')\"",
      });
      const blockedProtectedCwd = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash_start", {
        cmd: "touch pi-demo/SKILL.md",
        cwd: "~/.codex/skills",
      });
      const blockedBashWriteCd = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash_write", {
        job_id: "job-1",
        chars: "cd ~/.codex/skills\n",
      });
      const blockedBashWriteNamespaceCd = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash_write", {
        job_id: "job-1",
        chars: "cd ~/.codex\n",
      });
      const allowedReadOnly = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "ls -la ~/.codex/skills",
      });
      const allowedWorkspaceDraft = await controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "file_write", {
        path: ".codex/skills/pi-demo/SKILL.md",
        content: "draft",
      });

      expect(blocked?.reason).toContain("Blocked direct write to durable agent skill/plugin root");
      expect(blockedDetached?.reason).toContain("Blocked direct write to durable agent skill/plugin root");
      expect(blockedProtectedCwd?.reason).toContain("Blocked direct write to durable agent skill/plugin root");
      expect(blockedBashWriteCd?.reason).toContain("Blocked direct write to durable agent skill/plugin root");
      expect(blockedBashWriteNamespaceCd?.reason).toContain("Blocked direct write to durable agent skill/plugin root");
      expect(allowedReadOnly).toBeUndefined();
      expect(allowedWorkspaceDraft).toBeUndefined();
      expect(permissionRequest).not.toHaveBeenCalled();
      const guardMessage = store
        .listMessages(thread.id)
        .find((message) => message.metadata?.runtime === "ambient-raw-pi-install-root-guard");
      expect(guardMessage?.content).toContain("Ambient raw Pi install root guard blocked bash.");
      expect(guardMessage?.content).toContain("ambient_cli_package_install_pi_catalog");
      expect(guardMessage?.metadata?.protectedRoot).toBe("~/.codex/skills");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("allows ToolHive shell diagnostics outside MCP install context", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-mcp-install-shell-guard-"));
    const store = new ProjectStore();
    try {
      const workspace = store.openWorkspace(workspacePath);
      const thread = store.updateThreadSettings(store.createThread("mcp shell guard diagnostic").id, { permissionMode: "full-access" });
      store.addMessage({
        threadId: thread.id,
        role: "user",
        content: "Check the ToolHive version.",
      });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(async () => ({ allowed: true, mode: "allow_once" as const })),
        denyThread: () => undefined,
      });
      const controllers = (runtime as any).controllers;

      await expect(controllers.toolPermissions.resolveToolCallPermission(thread.id, workspace, "bash", {
        command: "toolhive version",
      })).resolves.toBeUndefined();
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function needsClarificationPlan(): AmbientInstallRoutePlan {
  return {
    lane: "needs-clarification",
    confidence: "low",
    reason: "The target source is ambiguous.",
    evidence: [],
    blockers: ["Need package source."],
    nextTools: [
      {
        name: "ambient_install_route_plan",
        purpose: "Replan with clarified source.",
      },
    ],
    approvalBoundary: "none-readonly",
    validationTarget: {
      kind: "route-only",
      description: "Ask one targeted clarification before any install side effects.",
    },
    warnings: [],
  };
}

function normalAppSetupPlan(): AmbientInstallRoutePlan {
  return {
    lane: "normal-app-setup",
    confidence: "high",
    reason: "This is normal project setup.",
    evidence: [],
    blockers: [],
    nextTools: [
      {
        name: "bash",
        purpose: "Run the local setup command.",
      },
    ],
    approvalBoundary: "user-approval-before-execute",
    validationTarget: {
      kind: "health-check",
      description: "Run a local smoke command.",
    },
    warnings: [],
  };
}
