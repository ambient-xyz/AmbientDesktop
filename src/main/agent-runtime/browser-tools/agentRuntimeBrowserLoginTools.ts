import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserLoginCredential,
  BrowserLoginRequest,
  BrowserLoginResult,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
} from "../../../shared/types";
import { isBrowserUserActionState } from "../../agent/agentBrowserRuntime";
import { browserToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";
import { normalizeBrowserCredentialOrigin } from "../../browser/browserCredentialStore";

type BrowserLoginToolUpdate = BrowserToolTextResult;
type BrowserLoginToolUpdateHandler = (update: BrowserLoginToolUpdate) => void;
type BrowserLoginResultOrUserAction = BrowserLoginResult | BrowserUserActionState;

export interface BrowserLoginToolRegistrationOptions {
  threadId: string;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserLoginToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  resolveBrowserCredential: (credentialId: string) => BrowserLoginCredential;
  markBrowserCredentialUsed: (credentialId: string) => void;
  browserLogin: (input: BrowserLoginRequest) => Promise<BrowserLoginResultOrUserAction>;
  emitBrowserState: () => Promise<void>;
  recordBrowserLoginAudit: (input: { detail: string }) => void;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
}

export function registerBrowserLoginTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserLoginToolRegistrationOptions,
): void {
  registerDesktopTool(pi, browserToolDescriptor("browser_login"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: BrowserLoginToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const credentialId = requiredString(input, "credentialId");
      const expectedOrigin = normalizeBrowserCredentialOrigin(requiredString(input, "expectedOrigin"));
      const { profileMode } = await options.prepareBrowserToolProfile(input, options.threadId, onUpdate);
      const credential = options.resolveBrowserCredential(credentialId);
      onUpdate?.(browserToolUpdate("browser_login", `Filling stored credential "${credential.label}" for ${expectedOrigin}.`));
      const result = await options.browserLogin({
        credential,
        credentialId,
        expectedOrigin,
        usernameSelector: optionalString(input.usernameSelector),
        passwordSelector: optionalString(input.passwordSelector),
        submitSelector: optionalString(input.submitSelector),
        submit: input.submit !== false,
        profileMode,
      });
      await options.emitBrowserState();
      if (isBrowserUserActionState(result)) return browserToolResult(options.formatBrowserUserAction(result), { toolName: "browser_login", profileMode, userAction: result });
      options.markBrowserCredentialUsed(credentialId);
      options.recordBrowserLoginAudit({ detail: browserLoginAuditDetail(result) });
      return browserToolResult(browserLoginText(result), { toolName: "browser_login", profileMode, ...result });
    },
  });
}

export function browserLoginText(result: BrowserLoginResult): string {
  return [
    `Stored browser credential "${result.credentialLabel}" was filled for ${result.origin}.`,
    `Username: ${result.username}`,
    result.title ? `Title: ${result.title}` : "",
    result.url ? `URL: ${result.url}` : "",
    `Submitted: ${result.submitted ? "yes" : "no"}`,
    result.userActionRequired ? "User action appears required before login can continue." : "",
    result.message,
  ]
    .filter(Boolean)
    .join("\n");
}

export function browserLoginAuditDetail(result: BrowserLoginResult): string {
  return [
    `Credential: ${result.credentialLabel} (${result.credentialId})`,
    `Origin: ${result.origin}`,
    `Username: ${result.username}`,
    result.url ? `URL: ${result.url}` : "",
    `Submitted: ${result.submitted ? "yes" : "no"}`,
    `User action required: ${result.userActionRequired ? "yes" : "no"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
