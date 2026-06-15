import type { PermissionMode } from "./permissionTypes";

export interface TerminalSession {
  id: string;
  cwd: string;
  workspacePath?: string;
  sessionToken: string;
  threadId?: string;
  permissionMode?: PermissionMode;
  sandboxKind?: "none" | "macos-sandbox-exec" | "policy-only";
  sandboxReason?: string;
}

export interface RequestTerminalStartInput {
  threadId: string;
}

export interface TerminalStartIntent {
  threadId: string;
  token: string;
  expiresAt: number;
}

export interface StartTerminalInput {
  threadId: string;
  startToken: string;
}

export interface SubmitTerminalCommandInput {
  threadId: string;
  terminalId: string;
  sessionToken: string;
  command: string;
}

export type TerminalControlAction = "enter" | "interrupt";

export interface TerminalControlInput {
  threadId: string;
  terminalId: string;
  sessionToken: string;
  action: TerminalControlAction;
}

export interface ResizeTerminalInput {
  threadId: string;
  terminalId: string;
  sessionToken: string;
  cols: number;
  rows: number;
}

export interface StopTerminalInput {
  threadId: string;
  terminalId: string;
  sessionToken: string;
}
