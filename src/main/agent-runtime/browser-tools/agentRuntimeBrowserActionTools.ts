import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  BrowserEvaluateInput,
  BrowserProfileMode,
  BrowserRuntimeKind,
  BrowserUserActionState,
} from "../../../shared/browserTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import {
  browserToolRecoverableFailure,
  browserUnavailableText,
  isBrowserToolRecoverableError,
  isBrowserUnavailableFallback,
  isBrowserUserActionState,
  type BrowserToolRecoverableError,
  type BrowserUnavailableFallback,
} from "../agentRuntimeAgentFacade";
import { browserToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  browserToolErrorResult,
  browserToolResult,
  browserToolUpdate,
  type BrowserToolTextResult,
} from "./agentRuntimeBrowserToolFormatting";

export type BrowserActionToolName = "browser_click" | "browser_get_value" | "browser_wait_for" | "browser_assert";

type BrowserActionToolUpdate = BrowserToolTextResult;
type BrowserActionToolUpdateHandler = (update: BrowserActionToolUpdate) => void;
type BrowserEvaluateWithActivityInput = BrowserEvaluateInput & { onActivity?: (activityMessage?: string) => void };
type BrowserActionResult = Record<string, unknown>;
type BrowserActionResultOrUserAction = BrowserActionResult | BrowserUserActionState;
type BrowserActionResultOrFallback = BrowserActionResultOrUserAction | BrowserUnavailableFallback | BrowserToolRecoverableError;

export interface BrowserActionToolRegistrationOptions {
  threadId: string;
  workspace: Pick<WorkspaceState, "path">;
  prepareBrowserToolProfile: (
    input: Record<string, unknown>,
    threadId: string,
    onUpdate?: BrowserActionToolUpdateHandler,
  ) => Promise<{ profileMode: BrowserProfileMode; runtime: BrowserRuntimeKind | undefined }>;
  browserEvaluate: (input: BrowserEvaluateWithActivityInput) => Promise<unknown | BrowserUserActionState>;
  emitBrowserState: () => Promise<void>;
  recordBrowserActionAudit: (input: { toolName: BrowserActionToolName; profileMode: BrowserProfileMode; detail: string }) => void;
  withBrowserToolHeartbeat: <T>(
    toolName: string,
    message: string,
    operation: (markActivity: (activityMessage?: string) => Promise<void> | void) => Promise<T>,
    onUpdate: BrowserActionToolUpdateHandler | undefined,
    options?: { signal?: AbortSignal; timeoutMs?: number; heartbeatMs?: number },
  ) => Promise<T>;
  formatBrowserUserAction: (state: BrowserUserActionState) => string;
}

export function registerBrowserActionTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserActionToolRegistrationOptions,
): void {
  for (const toolName of ["browser_click", "browser_get_value", "browser_wait_for", "browser_assert"] as const) {
    registerBrowserActionTool(pi, options, toolName);
  }
}

function registerBrowserActionTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: BrowserActionToolRegistrationOptions,
  toolName: BrowserActionToolName,
): void {
  registerDesktopTool(pi, browserToolDescriptor(toolName), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal, onUpdate?: BrowserActionToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const misuse = browserActionInputMisuse(toolName, input);
      if (misuse) return browserToolErrorResult(misuse, { toolName });
      const profileInput = { allowInternalRuntime: true, ...input };
      const { profileMode, runtime } = await options.prepareBrowserToolProfile(profileInput, options.threadId, onUpdate);
      onUpdate?.(browserToolUpdate(toolName, runningMessage(toolName, input)));
      const result: BrowserActionResultOrFallback = await options.withBrowserToolHeartbeat(
        toolName,
        heartbeatMessage(toolName),
        (markActivity) =>
          options.browserEvaluate({
            code: browserActionExpression(toolName, input),
            profileMode,
            runtime,
            onActivity: markActivity,
          }) as Promise<BrowserActionResultOrUserAction>,
        onUpdate,
        { signal, timeoutMs: timeoutMsFor(toolName, input) },
      )
        .catch((error) => browserToolRecoverableFailure(error));
      await options.emitBrowserState();
      if (isBrowserUnavailableFallback(result)) return browserToolResult(browserUnavailableText(result), { toolName, profileMode, runtime });
      if (isBrowserToolRecoverableError(result)) return browserToolErrorResult(result.message, { toolName, profileMode, runtime });
      if (isBrowserUserActionState(result)) return browserToolResult(options.formatBrowserUserAction(result), { toolName, profileMode, userAction: result });
      options.recordBrowserActionAudit({ toolName, profileMode, detail: browserActionAuditDetail(toolName, input, result) });
      return browserToolResult(browserActionText(toolName, result), { toolName, profileMode, runtime, ...result });
    },
  });
}

function browserActionInputMisuse(toolName: BrowserActionToolName, input: Record<string, unknown>): string | undefined {
  if (typeof input.code === "string") {
    return [
      `${toolName} does not accept or execute JavaScript code.`,
      "Use browser_click/browser_get_value/browser_wait_for/browser_assert with selector or text fields.",
      "Use browser_eval only when you intentionally need JavaScript evaluation.",
    ].join(" ");
  }
  if (!optionalString(input.selector) && !optionalString(input.text)) {
    return `${toolName} requires selector or text. Use selector for a stable CSS target or text for a visible label such as "2", "+", or "=".`;
  }
  return undefined;
}

function runningMessage(toolName: BrowserActionToolName, input: Record<string, unknown>): string {
  switch (toolName) {
    case "browser_click":
      return `Clicking ${targetDescription(input)} in the active browser page.`;
    case "browser_get_value":
      return `Reading ${targetDescription(input)} from the active browser page.`;
    case "browser_wait_for":
      return `Waiting for ${targetDescription(input)} in the active browser page.`;
    case "browser_assert":
      return `Checking ${targetDescription(input)} in the active browser page.`;
  }
}

function heartbeatMessage(toolName: BrowserActionToolName): string {
  switch (toolName) {
    case "browser_click":
      return "Browser click is still running.";
    case "browser_get_value":
      return "Browser value read is still running.";
    case "browser_wait_for":
      return "Browser wait is still running.";
    case "browser_assert":
      return "Browser assertion is still running.";
  }
}

function targetDescription(input: Record<string, unknown>): string {
  const selector = optionalString(input.selector);
  const text = optionalString(input.text);
  if (selector && text) return `selector ${JSON.stringify(selector)} with text ${JSON.stringify(text)}`;
  if (selector) return `selector ${JSON.stringify(selector)}`;
  if (text) return `text ${JSON.stringify(text)}`;
  return "the target";
}

function timeoutMsFor(toolName: BrowserActionToolName, input: Record<string, unknown>): number | undefined {
  if (toolName !== "browser_wait_for" && toolName !== "browser_assert") return undefined;
  const raw = input.timeoutMs;
  const timeoutMs = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 5_000;
  return Math.max(250, Math.min(timeoutMs, 30_000)) + 2_000;
}

function browserActionAuditDetail(toolName: BrowserActionToolName, input: Record<string, unknown>, result: BrowserActionResult): string {
  const url = typeof result.url === "string" ? result.url : undefined;
  return [
    toolName,
    targetDescription(input),
    url ? `URL: ${url}` : undefined,
  ].filter(Boolean).join("\n");
}

function browserActionText(toolName: BrowserActionToolName, result: BrowserActionResult): string {
  const element = formatElement(result.element);
  switch (toolName) {
    case "browser_click":
      return [
        "Browser click completed.",
        result.title ? `Title: ${String(result.title)}` : undefined,
        result.url ? `URL: ${String(result.url)}` : undefined,
        element ? `Element: ${element}` : undefined,
      ].filter(Boolean).join("\n");
    case "browser_get_value":
      return [
        "Browser value read.",
        result.title ? `Title: ${String(result.title)}` : undefined,
        result.url ? `URL: ${String(result.url)}` : undefined,
        element ? `Element: ${element}` : undefined,
        `Value: ${JSON.stringify(result.value ?? "")}`,
        `Text: ${JSON.stringify(result.text ?? "")}`,
      ].filter(Boolean).join("\n");
    case "browser_wait_for":
      return [
        "Browser target found.",
        result.title ? `Title: ${String(result.title)}` : undefined,
        result.url ? `URL: ${String(result.url)}` : undefined,
        element ? `Element: ${element}` : undefined,
        typeof result.elapsedMs === "number" ? `Elapsed: ${result.elapsedMs}ms` : undefined,
      ].filter(Boolean).join("\n");
    case "browser_assert":
      return [
        "Browser assertion passed.",
        result.title ? `Title: ${String(result.title)}` : undefined,
        result.url ? `URL: ${String(result.url)}` : undefined,
        element ? `Element: ${element}` : undefined,
        "actual" in result ? `Actual: ${JSON.stringify(result.actual)}` : undefined,
      ].filter(Boolean).join("\n");
  }
}

function formatElement(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const element = value as Record<string, unknown>;
  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "element";
  const id = typeof element.id === "string" && element.id ? `#${element.id}` : "";
  const text = typeof element.text === "string" && element.text ? ` ${JSON.stringify(element.text)}` : "";
  return `${tag}${id}${text}`;
}

function browserActionExpression(toolName: BrowserActionToolName, rawInput: Record<string, unknown>): string {
  return `
const input = ${JSON.stringify(rawInput)};
const toolName = ${JSON.stringify(toolName)};
const startedAt = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clampTimeout = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(250, Math.min(Math.floor(number), 30000)) : fallback;
};
const textOf = (element) => {
  if (!element) return "";
  const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
  for (const value of [element.getAttribute?.("aria-label"), "value" in element ? element.value : undefined, element.innerText, element.textContent]) {
    const text = normalize(value);
    if (text) return text;
  }
  return "";
};
const elementSummary = (element) => ({
  tagName: element.tagName,
  id: element.id || null,
  className: typeof element.className === "string" ? element.className : "",
  type: element.getAttribute?.("type") || null,
  role: element.getAttribute?.("role") || null,
  text: textOf(element).slice(0, 200),
  value: "value" in element ? String(element.value ?? "") : undefined,
});
const candidateSummary = () => Array.from(document.querySelectorAll("button,a,input,textarea,select,[role=button],[role=link],label,summary,[onclick]"))
  .slice(0, 20)
  .map(elementSummary);
const findBySelector = (selector) => {
  try {
    const elements = Array.from(document.querySelectorAll(selector));
    const nth = Number.isFinite(Number(input.nth)) ? Math.max(0, Math.floor(Number(input.nth))) : 0;
    return elements[nth] || null;
  } catch (error) {
    throw new Error("Invalid CSS selector " + JSON.stringify(selector) + ": " + (error instanceof Error ? error.message : String(error)));
  }
};
const findByText = (text) => {
  const target = String(text).replace(/\\s+/g, " ").trim().toLowerCase();
  const exact = input.exact !== false;
  const elements = Array.from(document.querySelectorAll("button,a,input,textarea,select,[role=button],[role=link],label,summary,[onclick],output,span,div"));
  const matches = elements.filter((element) => {
    const candidate = textOf(element).toLowerCase();
    return exact ? candidate === target : candidate.includes(target);
  });
  const nth = Number.isFinite(Number(input.nth)) ? Math.max(0, Math.floor(Number(input.nth))) : 0;
  return matches[nth] || null;
};
const findBySelectorAndText = (selector, text) => {
  let elements;
  try {
    elements = Array.from(document.querySelectorAll(selector));
  } catch (error) {
    throw new Error("Invalid CSS selector " + JSON.stringify(selector) + ": " + (error instanceof Error ? error.message : String(error)));
  }
  const target = String(text).replace(/\\s+/g, " ").trim().toLowerCase();
  const exact = input.exact !== false;
  const matches = elements.filter((element) => {
    const candidate = textOf(element).toLowerCase();
    return exact ? candidate === target : candidate.includes(target);
  });
  const nth = Number.isFinite(Number(input.nth)) ? Math.max(0, Math.floor(Number(input.nth))) : 0;
  return matches[nth] || null;
};
const findElement = () => {
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (selector && text) return findBySelectorAndText(selector, text);
  if (selector) return findBySelector(selector);
  if (text) return findByText(text);
  throw new Error("Provide selector or text.");
};
const waitForElement = async () => {
  const timeoutMs = clampTimeout(input.timeoutMs, toolName === "browser_wait_for" || toolName === "browser_assert" ? 5000 : 250);
  const deadline = Date.now() + timeoutMs;
  let element = findElement();
  while (!element && Date.now() < deadline) {
    await sleep(100);
    element = findElement();
  }
  if (!element) {
    throw new Error("Browser target not found: " + JSON.stringify({ selector: input.selector, text: input.text, exact: input.exact !== false }) + ". Visible candidates: " + JSON.stringify(candidateSummary()));
  }
  return element;
};
const element = await waitForElement();
const valueOf = (target) => "value" in target ? String(target.value ?? "") : textOf(target);
if (toolName === "browser_click") {
  if (element.disabled === true || element.getAttribute?.("aria-disabled") === "true") throw new Error("Browser target is disabled: " + JSON.stringify(elementSummary(element)));
  element.scrollIntoView?.({ block: "center", inline: "center" });
  element.focus?.();
  element.click();
  await sleep(75);
  return { ok: true, title: document.title, url: location.href, element: elementSummary(element) };
}
if (toolName === "browser_get_value") {
  return { ok: true, title: document.title, url: location.href, element: elementSummary(element), value: valueOf(element), text: textOf(element) };
}
if (toolName === "browser_wait_for") {
  return { ok: true, title: document.title, url: location.href, element: elementSummary(element), elapsedMs: Date.now() - startedAt };
}
const mode = input.mode === "value" ? "value" : input.mode === "text" ? "text" : input.mode === "exists" ? "exists" : (typeof input.expectedValue === "string" ? "value" : typeof input.expected === "string" || typeof input.expectedText === "string" || typeof input.contains === "string" || typeof input.equals === "string" ? "text" : "exists");
const actual = mode === "value" ? valueOf(element) : mode === "text" ? textOf(element) : true;
const expected = input.equals ?? input.expected ?? (mode === "value" ? input.expectedValue : input.expectedText);
if (mode !== "exists" && typeof expected !== "string" && typeof input.contains !== "string") {
  throw new Error("browser_assert requires expected, equals, contains, expectedText, or expectedValue when mode is " + mode + ".");
}
let pass = true;
if (typeof input.contains === "string") pass = String(actual).includes(input.contains);
else if (mode !== "exists") pass = String(actual) === String(expected);
if (!pass) {
  const comparison = typeof input.contains === "string" ? { contains: input.contains } : { expected };
  throw new Error("Browser assertion failed: " + JSON.stringify({ mode, actual, ...comparison, element: elementSummary(element) }));
}
return { ok: true, title: document.title, url: location.href, element: elementSummary(element), mode, actual };
`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
