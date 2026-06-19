import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import * as pty from "node-pty";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { TerminalSession } from "../../shared/terminalTypes";
import { TerminalTextBuffer } from "./terminalText";
import { buildTerminalShellInvocation } from "./terminalToolRuntimeFacade";

interface ManagedTerminal {
  id: string;
  threadId: string;
  workspacePath: string;
  sessionToken: string;
  pty: IPty;
  output: TerminalTextBuffer;
}

export class TerminalService {
  private terminals = new Map<string, ManagedTerminal>();

  constructor(
    private readonly getWindow: () => BrowserWindow | undefined,
    private readonly workspacePath: string,
  ) {}

  start(cwd: string, input: { threadId: string; permissionMode: PermissionMode }): TerminalSession {
    const id = randomUUID();
    const sessionToken = randomUUID();
    const shell = defaultTerminalShell();
    const invocation = buildTerminalShellInvocation(
      {
        permissionMode: input.permissionMode,
        workspacePath: cwd,
        subject: "terminal",
      },
      shell,
      cwd,
      {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    );
    const child = pty.spawn(invocation.command, invocation.args, {
      name: "xterm-256color",
      cols: 84,
      rows: 24,
      cwd: invocation.cwd,
      env: invocation.env,
    });

    const terminal = { id, threadId: input.threadId, workspacePath: this.workspacePath, sessionToken, pty: child, output: new TerminalTextBuffer() };
    this.terminals.set(id, terminal);
    child.onData((data) => {
      terminal.output.write(data);
      this.emit({
        type: "terminal-data",
        terminalId: id,
        threadId: input.threadId,
        workspacePath: this.workspacePath,
        data: terminal.output.text(),
        replace: true,
      });
    });
    child.onExit(({ exitCode, signal }) => {
      this.terminals.delete(id);
      this.emit({ type: "terminal-exit", terminalId: id, threadId: input.threadId, workspacePath: this.workspacePath, exitCode, signal });
    });
    return {
      id,
      cwd: invocation.cwd,
      workspacePath: this.workspacePath,
      sessionToken,
      threadId: input.threadId,
      permissionMode: input.permissionMode,
      sandboxKind: invocation.sandbox.kind,
      sandboxReason: invocation.sandbox.reason,
    };
  }

  write(id: string, data: string, input: { threadId: string; sessionToken: string }): void {
    this.requireTerminal(id, input).pty.write(data);
  }

  resize(id: string, cols: number, rows: number, input: { threadId: string; sessionToken: string }): void {
    this.requireTerminal(id, input).pty.resize(clamp(cols, 20, 240), clamp(rows, 8, 80));
  }

  stop(id: string, input?: { threadId: string; sessionToken: string }): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;
    if (input) this.requireTerminal(id, input);
    terminal.pty.kill();
    this.terminals.delete(id);
  }

  stopAll(): void {
    for (const id of this.terminals.keys()) this.stop(id);
  }

  has(id: string): boolean {
    return this.terminals.has(id);
  }

  private requireTerminal(id: string, input: { threadId: string; sessionToken: string }): ManagedTerminal {
    const terminal = this.terminals.get(id);
    if (!terminal) throw new Error("Terminal session not found.");
    if (terminal.threadId !== input.threadId) throw new Error("Terminal session is not bound to the active thread.");
    if (terminal.sessionToken !== input.sessionToken) throw new Error("Terminal session token is invalid.");
    return terminal;
  }

  private emit(event: DesktopEvent): void {
    this.getWindow()?.webContents.send("desktop:event", event);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function defaultTerminalShell(): string {
  if (process.platform === "win32") return "powershell.exe";
  if (process.platform === "darwin") return "/bin/zsh";
  return process.env.SHELL || "/bin/sh";
}
