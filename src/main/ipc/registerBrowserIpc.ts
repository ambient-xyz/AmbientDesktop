import type { IpcMain } from "electron";
import { z } from "zod";

import type {
  BrowserCapabilityState,
  BrowserContentInput,
  BrowserCredentialSummary,
  BrowserKeypressInput,
  BrowserKeypressResult,
  BrowserLocalPreviewInput,
  BrowserLocalPreviewResult,
  BrowserLocalPreviewSession,
  BrowserNavigateInput,
  BrowserPageContent,
  BrowserPickInput,
  BrowserPickResult,
  BrowserRevealInput,
  BrowserRevealResult,
  BrowserScreenshotResult,
  BrowserSearchInput,
  BrowserSearchResult,
  BrowserStartInput,
  BrowserUserActionState,
  BrowserViewBoundsInput,
  DeleteBrowserCredentialInput,
  SaveBrowserCredentialInput,
} from "../../shared/types";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;

export const browserCredentialIpcChannels = [
  "browser-credentials:list",
  "browser-credentials:save",
  "browser-credentials:delete",
] as const;

export const browserSessionIpcChannels = [
  "browser:get-state",
  "browser:start",
  "browser:stop",
  "browser:screenshot",
] as const;

export const browserRevealIpcChannels = ["browser:reveal"] as const;

export const browserProfileIpcChannels = [
  "browser:clear-isolated-profile",
  "browser:copy-chrome-profile",
  "browser:clear-copied-profile",
] as const;

export const browserViewBoundsIpcChannels = ["browser:set-view-bounds"] as const;

export const browserKeypressIpcChannels = ["browser:keypress"] as const;

export const browserContentIpcChannels = ["browser:content"] as const;

export const browserSearchIpcChannels = ["browser:search"] as const;

export const browserUserActionIpcChannels = ["browser:user-action-resume", "browser:user-action-cancel"] as const;

export const browserNavigateIpcChannels = ["browser:navigate"] as const;

export const browserLocalPreviewIpcChannels = ["browser:local-preview"] as const;

export const browserPickIpcChannels = ["browser:pick", "browser:cancel-pick"] as const;

export interface RegisterBrowserCredentialIpcDependencies<Host> {
  handleIpc: HandleIpc;
  browserLoginBrokerEnabled: boolean;
  requireActiveProjectRuntimeHost(): Host;
  listBrowserCredentials(host: Host): MaybePromise<BrowserCredentialSummary[]>;
  saveBrowserCredential(host: Host, input: SaveBrowserCredentialInput): MaybePromise<BrowserCredentialSummary[]>;
  deleteBrowserCredential(host: Host, input: DeleteBrowserCredentialInput): MaybePromise<BrowserCredentialSummary[]>;
}

export interface RegisterBrowserSessionIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  readBrowserState(host: Host): Promise<BrowserCapabilityState>;
  startBrowser(host: Host, input: BrowserStartInput | undefined): Promise<BrowserCapabilityState>;
  stopBrowser(host: Host): Promise<BrowserCapabilityState>;
  screenshotBrowser(host: Host, input: BrowserStartInput | undefined): Promise<BrowserScreenshotResult | BrowserUserActionState>;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserRevealIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  revealBrowser(host: Host, input: BrowserRevealInput | undefined): Promise<BrowserRevealResult>;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserProfileIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  clearIsolatedBrowserProfile(host: Host): Promise<BrowserCapabilityState>;
  copyChromeProfile(host: Host): Promise<BrowserCapabilityState>;
  clearCopiedChromeProfile(host: Host): Promise<BrowserCapabilityState>;
  recordBrowserProfileAudit(host: Host, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserViewBoundsIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  setBrowserViewBounds(host: Host, input: BrowserViewBoundsInput): void;
}

export interface RegisterBrowserKeypressIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  keypressBrowser(host: Host, input: BrowserKeypressInput): Promise<BrowserKeypressResult | BrowserUserActionState>;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserContentIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  readBrowserContent(host: Host, input: BrowserContentInput): Promise<BrowserPageContent | BrowserUserActionState>;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserSearchIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  searchBrowser(host: Host, input: BrowserSearchInput): Promise<BrowserSearchResult[] | BrowserUserActionState>;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserUserActionIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  resumeBrowserUserAction(host: Host): Promise<BrowserCapabilityState>;
  cancelBrowserUserAction(host: Host): Promise<BrowserCapabilityState>;
  browserAuditFallbackTarget(host: Host): string;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserNavigateIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  isLoopbackWebUrl(url: string): boolean;
  navigateBrowser(host: Host, input: BrowserNavigateInput): Promise<BrowserPageContent | BrowserUserActionState>;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserLocalPreviewIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  openBrowserLocalPreview(host: Host, input: BrowserLocalPreviewInput): Promise<BrowserLocalPreviewSession>;
  navigateBrowser(host: Host, input: BrowserNavigateInput): Promise<BrowserPageContent | BrowserUserActionState>;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

export interface RegisterBrowserPickIpcDependencies<Host> {
  handleIpc: HandleIpc;
  requireActiveProjectRuntimeHost(): Host;
  pickBrowser(host: Host, input: BrowserPickInput): Promise<BrowserPickResult | BrowserUserActionState>;
  readBrowserState(host: Host): Promise<BrowserCapabilityState>;
  cancelBrowserPick(host: Host): Promise<BrowserCapabilityState>;
  emitBrowserStateForHost(host: Host): Promise<void>;
  browserAuditFallbackTarget(host: Host): string;
  recordBrowserControlAudit(host: Host, toolName: string, detail: string, reason: string): void;
  withBrowserState<T>(host: Host, operation: Promise<T>): Promise<T>;
}

const browserCredentialScopeSchema = z.enum(["workspace", "global"]);
const saveBrowserCredentialSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(120),
  origin: z.string().min(1).max(4096),
  username: z.string().min(1).max(500),
  password: z.string().min(1).max(20_000),
  scope: browserCredentialScopeSchema.optional(),
});
const deleteBrowserCredentialSchema = z.object({
  id: z.string().min(1).max(120),
});
const browserProfileModeSchema = z.enum(["isolated", "copied"]);
const browserRuntimeSchema = z.enum(["internal", "chrome"]);
const browserStartSchema = z
  .object({
    profileMode: browserProfileModeSchema.optional(),
    runtime: browserRuntimeSchema.optional(),
  })
  .optional();
const browserRevealSchema = z
  .object({
    userActionId: z.string().min(1).max(200).optional(),
    targetId: z.string().min(1).max(512).optional(),
  })
  .optional();
const browserViewBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
  visible: z.boolean(),
});
const browserKeypressSchema = z.object({
  keys: z
    .array(
      z.object({
        key: z.string().min(1).max(80).optional(),
        code: z.string().min(1).max(80).optional(),
        text: z.string().max(20).optional(),
        durationMs: z.number().finite().min(0).max(5_000).optional(),
      }),
    )
    .min(1)
    .max(100),
  focus: z.string().min(1).max(500).optional(),
  profileMode: browserProfileModeSchema.optional(),
  runtime: browserRuntimeSchema.optional(),
});
const browserContentSchema = z.object({
  url: z.string().min(1).max(4096).optional(),
  profileMode: browserProfileModeSchema.optional(),
  runtime: browserRuntimeSchema.optional(),
  waitForUserAction: z.boolean().optional(),
  userActionId: z.string().min(1).max(200).optional(),
});
const browserSearchSchema = z.object({
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(10).optional(),
  fetchContent: z.boolean().optional(),
  profileMode: browserProfileModeSchema.optional(),
  runtime: browserRuntimeSchema.optional(),
  waitForUserAction: z.boolean().optional(),
  userActionId: z.string().min(1).max(200).optional(),
});
const browserNavigateSchema = z.object({
  url: z.string().min(1).max(4096),
  newTab: z.boolean().optional(),
  profileMode: browserProfileModeSchema.optional(),
  runtime: browserRuntimeSchema.optional(),
  waitForUserAction: z.boolean().optional(),
  userActionId: z.string().min(1).max(200).optional(),
});
const browserLocalPreviewSchema = z.object({
  path: z.string().min(1).max(4096),
});
const browserPickSchema = z.object({
  prompt: z.string().min(1).max(500),
  profileMode: browserProfileModeSchema.optional(),
  runtime: browserRuntimeSchema.optional(),
});

export function registerBrowserCredentialIpc<Host>({
  handleIpc,
  browserLoginBrokerEnabled,
  requireActiveProjectRuntimeHost,
  listBrowserCredentials,
  saveBrowserCredential,
  deleteBrowserCredential,
}: RegisterBrowserCredentialIpcDependencies<Host>): void {
  handleIpc("browser-credentials:list", () =>
    browserLoginBrokerEnabled ? listBrowserCredentials(requireActiveProjectRuntimeHost()) : [],
  );

  handleIpc("browser-credentials:save", (_event, raw: SaveBrowserCredentialInput) => {
    if (!browserLoginBrokerEnabled) throw new Error("Browser login broker is disabled by AMBIENT_BROWSER_LOGIN_BROKER=0.");
    const host = requireActiveProjectRuntimeHost();
    const input = saveBrowserCredentialSchema.parse(raw);
    return saveBrowserCredential(host, input);
  });

  handleIpc("browser-credentials:delete", (_event, raw: DeleteBrowserCredentialInput) => {
    if (!browserLoginBrokerEnabled) throw new Error("Browser login broker is disabled by AMBIENT_BROWSER_LOGIN_BROKER=0.");
    const host = requireActiveProjectRuntimeHost();
    const input = deleteBrowserCredentialSchema.parse(raw);
    return deleteBrowserCredential(host, input);
  });
}

export function registerBrowserContentIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  readBrowserContent,
  withBrowserState,
}: RegisterBrowserContentIpcDependencies<Host>): void {
  handleIpc("browser:content", (_event, raw: BrowserContentInput) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserContentSchema.parse(raw);
    return withBrowserState(host, readBrowserContent(host, input));
  });
}

export function registerBrowserSearchIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  searchBrowser,
  withBrowserState,
}: RegisterBrowserSearchIpcDependencies<Host>): void {
  handleIpc("browser:search", (_event, raw: BrowserSearchInput) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserSearchSchema.parse(raw);
    return withBrowserState(host, searchBrowser(host, input));
  });
}

export function registerBrowserUserActionIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  resumeBrowserUserAction,
  cancelBrowserUserAction,
  browserAuditFallbackTarget,
  recordBrowserControlAudit,
  withBrowserState,
}: RegisterBrowserUserActionIpcDependencies<Host>): void {
  handleIpc("browser:user-action-resume", async () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(
      host,
      resumeBrowserUserAction(host).then((state) => {
        recordBrowserControlAudit(
          host,
          "browser_user_action",
          state.userAction?.url ?? state.activeTab?.url ?? browserAuditFallbackTarget(host),
          "User asked Ambient to continue after completing a browser challenge.",
        );
        return state;
      }),
    );
  });

  handleIpc("browser:user-action-cancel", async () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(
      host,
      cancelBrowserUserAction(host).then((state) => {
        recordBrowserControlAudit(
          host,
          "browser_user_action",
          state.userAction?.url ?? state.activeTab?.url ?? browserAuditFallbackTarget(host),
          "User canceled a browser challenge wait.",
        );
        return state;
      }),
    );
  });
}

export function registerBrowserNavigateIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  isLoopbackWebUrl,
  navigateBrowser,
  withBrowserState,
}: RegisterBrowserNavigateIpcDependencies<Host>): void {
  handleIpc("browser:navigate", (_event, raw: BrowserNavigateInput) => {
    const host = requireActiveProjectRuntimeHost();
    const parsed = browserNavigateSchema.parse(raw);
    const input = isLoopbackWebUrl(parsed.url)
      ? { ...parsed, profileMode: "isolated" as const, runtime: "internal" as const }
      : parsed;
    return withBrowserState(host, navigateBrowser(host, input));
  });
}

export function registerBrowserLocalPreviewIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  openBrowserLocalPreview,
  navigateBrowser,
  recordBrowserControlAudit,
  withBrowserState,
}: RegisterBrowserLocalPreviewIpcDependencies<Host>): void {
  handleIpc("browser:local-preview", async (_event, raw: BrowserLocalPreviewInput): Promise<BrowserLocalPreviewResult> => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserLocalPreviewSchema.parse(raw);
    const preview = await openBrowserLocalPreview(host, input);
    const content = await withBrowserState(
      host,
      navigateBrowser(host, {
        url: preview.url,
        profileMode: "isolated",
        runtime: "internal",
        waitForUserAction: false,
      }),
    );
    recordBrowserControlAudit(host, "browser_local_preview", preview.url, `User opened local preview for ${preview.workspaceRelativeRequestedPath}.`);
    return { preview, content };
  });
}

export function registerBrowserPickIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  pickBrowser,
  readBrowserState,
  cancelBrowserPick,
  emitBrowserStateForHost,
  browserAuditFallbackTarget,
  recordBrowserControlAudit,
  withBrowserState,
}: RegisterBrowserPickIpcDependencies<Host>): void {
  handleIpc("browser:pick", async (_event, raw: BrowserPickInput) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserPickSchema.parse(raw);
    const operation = pickBrowser(host, input).then((result) => {
      if ("active" in result && "kind" in result) return result;
      recordBrowserControlAudit(
        host,
        "browser_pick",
        [result.url ?? browserAuditFallbackTarget(host), input.prompt].join("\n"),
        result.canceled
          ? "User canceled browser picker from the Browser panel."
          : `User completed browser picker with ${result.selections.length} selection(s).`,
      );
      return result;
    });
    await emitBrowserStateForHost(host);
    return withBrowserState(host, operation);
  });

  handleIpc("browser:cancel-pick", async () => {
    const host = requireActiveProjectRuntimeHost();
    const prompt = (await readBrowserState(host)).pickerPrompt;
    return withBrowserState(
      host,
      cancelBrowserPick(host).then((state) => {
        recordBrowserControlAudit(host, "browser_pick", prompt ?? "Browser picker", "User requested browser picker cancellation.");
        return state;
      }),
    );
  });
}

export function registerBrowserKeypressIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  keypressBrowser,
  withBrowserState,
}: RegisterBrowserKeypressIpcDependencies<Host>): void {
  handleIpc("browser:keypress", (_event, raw: BrowserKeypressInput) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserKeypressSchema.parse(raw);
    return withBrowserState(host, keypressBrowser(host, input));
  });
}

export function registerBrowserViewBoundsIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  setBrowserViewBounds,
}: RegisterBrowserViewBoundsIpcDependencies<Host>): void {
  handleIpc("browser:set-view-bounds", (_event, raw: BrowserViewBoundsInput) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserViewBoundsSchema.parse(raw);
    setBrowserViewBounds(host, input);
  });
}

export function registerBrowserProfileIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  clearIsolatedBrowserProfile,
  copyChromeProfile,
  clearCopiedChromeProfile,
  recordBrowserProfileAudit,
  withBrowserState,
}: RegisterBrowserProfileIpcDependencies<Host>): void {
  handleIpc("browser:clear-isolated-profile", async () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(
      host,
      clearIsolatedBrowserProfile(host).then((state) => {
        recordBrowserProfileAudit(host, state.isolatedProfilePath ?? "Ambient isolated browser profile", "User cleared isolated browser profile state.");
        return state;
      }),
    );
  });

  handleIpc("browser:copy-chrome-profile", async () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(
      host,
      copyChromeProfile(host).then((state) => {
        recordBrowserProfileAudit(
          host,
          [`Source: ${state.copiedProfileSourcePath ?? state.sourceProfilePath ?? "unknown"}`, `Copy: ${state.copiedProfilePath}`].join("\n"),
          "User copied a Chrome profile into Ambient-controlled browser state.",
        );
        return state;
      }),
    );
  });

  handleIpc("browser:clear-copied-profile", async () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(
      host,
      clearCopiedChromeProfile(host).then((state) => {
        recordBrowserProfileAudit(host, state.copiedProfilePath ?? "Ambient browser copied profile", "User cleared the copied Chrome profile.");
        return state;
      }),
    );
  });
}

export function registerBrowserSessionIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  readBrowserState,
  startBrowser,
  stopBrowser,
  screenshotBrowser,
  withBrowserState,
}: RegisterBrowserSessionIpcDependencies<Host>): void {
  handleIpc("browser:get-state", () => readBrowserState(requireActiveProjectRuntimeHost()));

  handleIpc("browser:start", (_event, raw: BrowserStartInput | undefined) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserStartSchema.parse(raw);
    return withBrowserState(host, startBrowser(host, input));
  });

  handleIpc("browser:stop", () => {
    const host = requireActiveProjectRuntimeHost();
    return withBrowserState(host, stopBrowser(host));
  });

  handleIpc("browser:screenshot", (_event, raw: BrowserStartInput | undefined) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserStartSchema.parse(raw);
    return withBrowserState(host, screenshotBrowser(host, input));
  });
}

export function registerBrowserRevealIpc<Host>({
  handleIpc,
  requireActiveProjectRuntimeHost,
  revealBrowser,
  recordBrowserControlAudit,
  withBrowserState,
}: RegisterBrowserRevealIpcDependencies<Host>): void {
  handleIpc("browser:reveal", (_event, raw: BrowserRevealInput | undefined) => {
    const host = requireActiveProjectRuntimeHost();
    const input = browserRevealSchema.parse(raw);
    return withBrowserState(
      host,
      revealBrowser(host, input).then((result) => {
        recordBrowserControlAudit(
          host,
          "browser_reveal",
          result.activeTab?.url ?? result.target,
          result.status === "revealed" ? result.message : `${result.message}${result.fallbackReason ? ` ${result.fallbackReason}` : ""}`,
        );
        return result;
      }),
    );
  });
}
