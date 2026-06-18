import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";

import type {
  RequestTerminalStartInput,
  ResizeTerminalInput,
  StartTerminalInput,
  StopTerminalInput,
  SubmitTerminalCommandInput,
  TerminalControlInput,
  TerminalSession,
  TerminalStartIntent,
} from "../../shared/terminalTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const terminalRequestStartIpcChannels = ["terminal:request-start"] as const;
export const terminalStartIpcChannels = ["terminal:start"] as const;
export const terminalSubmitCommandIpcChannels = ["terminal:submit-command"] as const;
export const terminalControlIpcChannels = ["terminal:control"] as const;
export const terminalResizeIpcChannels = ["terminal:resize"] as const;
export const terminalStopIpcChannels = ["terminal:stop"] as const;

export interface RegisterTerminalRequestStartIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  requestTerminalStart(input: RequestTerminalStartInput): MaybePromise<TerminalStartIntent>;
}

export interface RegisterTerminalStartIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  startTerminal(input: StartTerminalInput): MaybePromise<TerminalSession>;
}

export interface RegisterTerminalSubmitCommandIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  submitTerminalCommand(input: SubmitTerminalCommandInput): MaybePromise<void>;
}

export interface RegisterTerminalControlIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  controlTerminal(input: TerminalControlInput): MaybePromise<void>;
}

export interface RegisterTerminalResizeIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  resizeTerminal(input: ResizeTerminalInput): MaybePromise<void>;
}

export interface RegisterTerminalStopIpcDependencies {
  handleIpc: HandleIpc;
  assertTrustedTerminalIpc(event: IpcMainInvokeEvent): void;
  stopTerminal(input: StopTerminalInput): MaybePromise<void>;
}

const terminalStartRequestSchema = z.object({
  threadId: z.string().min(1),
}) satisfies z.ZodType<RequestTerminalStartInput>;
const terminalIdSchema = z.string().min(1);
const terminalSessionTokenSchema = z.string().min(1).max(200);
const terminalStartSchema = z.object({
  threadId: z.string().min(1),
  startToken: terminalSessionTokenSchema,
}) satisfies z.ZodType<StartTerminalInput>;
const terminalCommandSchema = z.object({
  threadId: z.string().min(1),
  terminalId: terminalIdSchema,
  sessionToken: terminalSessionTokenSchema,
  command: z.string().min(1).max(20_000),
}) satisfies z.ZodType<SubmitTerminalCommandInput>;
const terminalControlSchema = z.object({
  threadId: z.string().min(1),
  terminalId: terminalIdSchema,
  sessionToken: terminalSessionTokenSchema,
  action: z.enum(["enter", "interrupt"]),
}) satisfies z.ZodType<TerminalControlInput>;
const terminalResizeSchema = z.object({
  threadId: z.string().min(1),
  terminalId: terminalIdSchema,
  sessionToken: terminalSessionTokenSchema,
  cols: z.number().int().min(20).max(240),
  rows: z.number().int().min(8).max(80),
}) satisfies z.ZodType<ResizeTerminalInput>;
const terminalStopSchema = z.object({
  threadId: z.string().min(1),
  terminalId: terminalIdSchema,
  sessionToken: terminalSessionTokenSchema,
}) satisfies z.ZodType<StopTerminalInput>;

export function registerTerminalRequestStartIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  requestTerminalStart,
}: RegisterTerminalRequestStartIpcDependencies): void {
  handleIpc("terminal:request-start", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return requestTerminalStart(terminalStartRequestSchema.parse(raw));
  });
}

export function registerTerminalStartIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  startTerminal,
}: RegisterTerminalStartIpcDependencies): void {
  handleIpc("terminal:start", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return startTerminal(terminalStartSchema.parse(raw));
  });
}

export function registerTerminalSubmitCommandIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  submitTerminalCommand,
}: RegisterTerminalSubmitCommandIpcDependencies): void {
  handleIpc("terminal:submit-command", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return submitTerminalCommand(terminalCommandSchema.parse(raw));
  });
}

export function registerTerminalControlIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  controlTerminal,
}: RegisterTerminalControlIpcDependencies): void {
  handleIpc("terminal:control", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return controlTerminal(terminalControlSchema.parse(raw));
  });
}

export function registerTerminalResizeIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  resizeTerminal,
}: RegisterTerminalResizeIpcDependencies): void {
  handleIpc("terminal:resize", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return resizeTerminal(terminalResizeSchema.parse(raw));
  });
}

export function registerTerminalStopIpc({
  handleIpc,
  assertTrustedTerminalIpc,
  stopTerminal,
}: RegisterTerminalStopIpcDependencies): void {
  handleIpc("terminal:stop", (event, raw: unknown) => {
    assertTrustedTerminalIpc(event);
    return stopTerminal(terminalStopSchema.parse(raw));
  });
}
