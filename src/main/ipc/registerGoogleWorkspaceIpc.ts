import type { IpcMain, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { z } from "zod";

import type {
  FirstPartyGoogleIntegrationState,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceOAuthClientImportInput,
  GoogleWorkspaceSetupInput,
  GoogleWorkspaceSetupState,
  GoogleWorkspaceValidationInput,
  GoogleWorkspaceValidationResult,
} from "../../shared/pluginTypes";

type HandleIpc = (channel: string, listener: Parameters<IpcMain["handle"]>[1]) => void;
type MaybePromise<T> = T | Promise<T>;
type GoogleOAuthClientImportDialogResult = Pick<OpenDialogReturnValue, "canceled" | "filePaths">;

export const googleIntegrationStateIpcChannels = ["integrations:google"] as const;
export const googleInstallCliIpcChannels = ["integrations:google-install-cli"] as const;
export const googleSetupStartIpcChannels = ["integrations:google-setup-start"] as const;
export const googleSetupCancelIpcChannels = ["integrations:google-setup-cancel"] as const;
export const googleOAuthClientImportIpcChannels = ["integrations:google-import-oauth-client"] as const;
export const googleValidateIpcChannels = ["integrations:google-validate"] as const;
export const googleDisconnectIpcChannels = ["integrations:google-disconnect"] as const;

export interface RegisterGoogleIntegrationStateIpcDependencies {
  handleIpc: HandleIpc;
  readFirstPartyGoogleIntegration(): MaybePromise<FirstPartyGoogleIntegrationState>;
}

export interface RegisterGoogleInstallCliIpcDependencies {
  handleIpc: HandleIpc;
  installGoogleWorkspaceCli(): Promise<GoogleWorkspaceCliInstallState>;
  refreshGoogleWorkspaceConnectorMode(): void;
  resetRuntimeAndPluginServers(): void;
}

export interface RegisterGoogleSetupStartIpcDependencies {
  handleIpc: HandleIpc;
  startGoogleWorkspaceSetup(input: GoogleWorkspaceSetupInput): GoogleWorkspaceSetupState;
  redactGoogleWorkspaceSetupState(setup: GoogleWorkspaceSetupState): GoogleWorkspaceSetupState | undefined;
}

export interface RegisterGoogleSetupCancelIpcDependencies {
  handleIpc: HandleIpc;
  cancelGoogleWorkspaceSetup(): GoogleWorkspaceSetupState;
  redactGoogleWorkspaceSetupState(setup: GoogleWorkspaceSetupState): GoogleWorkspaceSetupState | undefined;
}

export interface RegisterGoogleOAuthClientImportIpcDependencies {
  handleIpc: HandleIpc;
  showOpenDialog(options: OpenDialogOptions): MaybePromise<GoogleOAuthClientImportDialogResult>;
  readGoogleWorkspaceSetupState(): GoogleWorkspaceSetupState;
  importGoogleWorkspaceOAuthClientConfig(
    input: GoogleWorkspaceOAuthClientImportInput & { sourcePath: string },
  ): MaybePromise<GoogleWorkspaceSetupState>;
  redactGoogleWorkspaceSetupState(setup: GoogleWorkspaceSetupState): GoogleWorkspaceSetupState | undefined;
}

export interface RegisterGoogleValidateIpcDependencies {
  handleIpc: HandleIpc;
  validateGoogleWorkspace(input: GoogleWorkspaceValidationInput): MaybePromise<GoogleWorkspaceValidationResult>;
}

export interface RegisterGoogleDisconnectIpcDependencies {
  handleIpc: HandleIpc;
  forgetGoogleWorkspaceAccount(input: GoogleWorkspaceValidationInput): MaybePromise<unknown>;
  readFirstPartyGoogleIntegration(): MaybePromise<FirstPartyGoogleIntegrationState>;
}

const googleWorkspaceSetupSchema = z.object({
  accountHint: z.string().trim().min(1).max(256).optional(),
  command: z.enum(["setup", "login"]).optional(),
  openAuthUrl: z.boolean().optional(),
}) satisfies z.ZodType<GoogleWorkspaceSetupInput>;
const googleWorkspaceOAuthClientImportSchema = z.object({
  accountHint: z.string().trim().min(1).max(256).optional(),
}) satisfies z.ZodType<GoogleWorkspaceOAuthClientImportInput>;
const googleWorkspaceValidationSchema = z.object({
  accountHint: z.string().trim().min(1).max(256).optional(),
}) satisfies z.ZodType<GoogleWorkspaceValidationInput>;

export function registerGoogleIntegrationStateIpc({
  handleIpc,
  readFirstPartyGoogleIntegration,
}: RegisterGoogleIntegrationStateIpcDependencies): void {
  handleIpc("integrations:google", () => readFirstPartyGoogleIntegration());
}

export function registerGoogleInstallCliIpc({
  handleIpc,
  installGoogleWorkspaceCli,
  refreshGoogleWorkspaceConnectorMode,
  resetRuntimeAndPluginServers,
}: RegisterGoogleInstallCliIpcDependencies): void {
  handleIpc("integrations:google-install-cli", async () => {
    const install = await installGoogleWorkspaceCli();
    refreshGoogleWorkspaceConnectorMode();
    resetRuntimeAndPluginServers();
    return install;
  });
}

export function registerGoogleSetupStartIpc({
  handleIpc,
  startGoogleWorkspaceSetup,
  redactGoogleWorkspaceSetupState,
}: RegisterGoogleSetupStartIpcDependencies): void {
  handleIpc("integrations:google-setup-start", (_event, raw: unknown) =>
    redactGoogleWorkspaceSetupState(startGoogleWorkspaceSetup(googleWorkspaceSetupSchema.parse(raw ?? {}))),
  );
}

export function registerGoogleSetupCancelIpc({
  handleIpc,
  cancelGoogleWorkspaceSetup,
  redactGoogleWorkspaceSetupState,
}: RegisterGoogleSetupCancelIpcDependencies): void {
  handleIpc("integrations:google-setup-cancel", () =>
    redactGoogleWorkspaceSetupState(cancelGoogleWorkspaceSetup()),
  );
}

export function registerGoogleOAuthClientImportIpc({
  handleIpc,
  showOpenDialog,
  readGoogleWorkspaceSetupState,
  importGoogleWorkspaceOAuthClientConfig,
  redactGoogleWorkspaceSetupState,
}: RegisterGoogleOAuthClientImportIpcDependencies): void {
  handleIpc("integrations:google-import-oauth-client", async (_event, raw: unknown) => {
    const input = googleWorkspaceOAuthClientImportSchema.parse(raw ?? {});
    const result = await showOpenDialog({
      title: "Import Google OAuth client JSON",
      properties: ["openFile"],
      filters: [{ name: "Google OAuth client JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return redactGoogleWorkspaceSetupState(readGoogleWorkspaceSetupState());
    }
    return redactGoogleWorkspaceSetupState(
      await importGoogleWorkspaceOAuthClientConfig({
        ...input,
        sourcePath: result.filePaths[0],
      }),
    );
  });
}

export function registerGoogleValidateIpc({
  handleIpc,
  validateGoogleWorkspace,
}: RegisterGoogleValidateIpcDependencies): void {
  handleIpc("integrations:google-validate", async (_event, raw: unknown) =>
    validateGoogleWorkspace(googleWorkspaceValidationSchema.parse(raw ?? {})),
  );
}

export function registerGoogleDisconnectIpc({
  handleIpc,
  forgetGoogleWorkspaceAccount,
  readFirstPartyGoogleIntegration,
}: RegisterGoogleDisconnectIpcDependencies): void {
  handleIpc("integrations:google-disconnect", async (_event, raw: unknown) => {
    await forgetGoogleWorkspaceAccount(googleWorkspaceValidationSchema.parse(raw ?? {}));
    return readFirstPartyGoogleIntegration();
  });
}
