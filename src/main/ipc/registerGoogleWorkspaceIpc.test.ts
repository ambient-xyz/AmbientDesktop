import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import type {
  FirstPartyGoogleIntegrationState,
  GoogleWorkspaceCliInstallState,
  GoogleWorkspaceOAuthClientImportInput,
  GoogleWorkspaceSetupInput,
  GoogleWorkspaceSetupState,
  GoogleWorkspaceValidationInput,
  GoogleWorkspaceValidationResult,
} from "../../shared/pluginTypes";
import {
  googleDisconnectIpcChannels,
  googleInstallCliIpcChannels,
  googleIntegrationStateIpcChannels,
  googleOAuthClientImportIpcChannels,
  googleSetupCancelIpcChannels,
  googleSetupStartIpcChannels,
  googleValidateIpcChannels,
  registerGoogleDisconnectIpc,
  registerGoogleInstallCliIpc,
  registerGoogleIntegrationStateIpc,
  registerGoogleOAuthClientImportIpc,
  registerGoogleSetupCancelIpc,
  registerGoogleSetupStartIpc,
  registerGoogleValidateIpc,
  type RegisterGoogleDisconnectIpcDependencies,
  type RegisterGoogleInstallCliIpcDependencies,
  type RegisterGoogleIntegrationStateIpcDependencies,
  type RegisterGoogleOAuthClientImportIpcDependencies,
  type RegisterGoogleSetupCancelIpcDependencies,
  type RegisterGoogleSetupStartIpcDependencies,
  type RegisterGoogleValidateIpcDependencies,
} from "./registerGoogleWorkspaceIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerGoogleIntegrationStateIpc", () => {
  it("registers the Google integration state channel", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...googleIntegrationStateIpcChannels]);
  });

  it("reads the first-party Google integration state", async () => {
    const { deps, invoke, state } = registerWithFakes();

    await expect(invoke("integrations:google")).resolves.toEqual(state);

    expect(deps.readFirstPartyGoogleIntegration).toHaveBeenCalledOnce();
  });

  it("propagates Google integration state read errors", async () => {
    const error = new Error("Google integration unavailable");
    const { deps, invoke } = registerWithFakes({ error });

    await expect(invoke("integrations:google")).rejects.toThrow("Google integration unavailable");

    expect(deps.readFirstPartyGoogleIntegration).toHaveBeenCalledOnce();
  });
});

describe("registerGoogleInstallCliIpc", () => {
  it("registers the Google Workspace CLI install channel", () => {
    const { handlers } = registerInstallCliWithFakes();

    expect([...handlers.keys()]).toEqual([...googleInstallCliIpcChannels]);
  });

  it("installs the Google Workspace CLI, refreshes connector mode, resets runtimes, and returns install state", async () => {
    const { deps, install, invoke } = registerInstallCliWithFakes();

    await expect(invoke("integrations:google-install-cli")).resolves.toEqual(install);

    expect(deps.installGoogleWorkspaceCli).toHaveBeenCalledOnce();
    expect(deps.refreshGoogleWorkspaceConnectorMode).toHaveBeenCalledOnce();
    expect(deps.resetRuntimeAndPluginServers).toHaveBeenCalledOnce();
  });

  it("does not refresh or reset runtimes when CLI install fails", async () => {
    const error = new Error("install failed");
    const { deps, invoke } = registerInstallCliWithFakes({ error });

    await expect(invoke("integrations:google-install-cli")).rejects.toThrow("install failed");

    expect(deps.installGoogleWorkspaceCli).toHaveBeenCalledOnce();
    expect(deps.refreshGoogleWorkspaceConnectorMode).not.toHaveBeenCalled();
    expect(deps.resetRuntimeAndPluginServers).not.toHaveBeenCalled();
  });
});

describe("registerGoogleSetupStartIpc", () => {
  it("registers the Google Workspace setup start channel", () => {
    const { handlers } = registerSetupStartWithFakes();

    expect([...handlers.keys()]).toEqual([...googleSetupStartIpcChannels]);
  });

  it("starts Google Workspace setup with default input and returns redacted state", async () => {
    const { deps, invoke, redacted } = registerSetupStartWithFakes();

    await expect(invoke("integrations:google-setup-start")).resolves.toEqual(redacted);

    expect(deps.startGoogleWorkspaceSetup).toHaveBeenCalledWith({});
    expect(deps.redactGoogleWorkspaceSetupState).toHaveBeenCalledWith(sampleGoogleWorkspaceSetupState());
  });

  it("parses setup start input before starting setup", async () => {
    const { deps, invoke, redacted } = registerSetupStartWithFakes();

    await expect(
      invoke("integrations:google-setup-start", {
        accountHint: "  user@example.com  ",
        command: "setup",
        openAuthUrl: true,
        extra: "ignored",
      }),
    ).resolves.toEqual(redacted);

    expect(deps.startGoogleWorkspaceSetup).toHaveBeenCalledWith({
      accountHint: "user@example.com",
      command: "setup",
      openAuthUrl: true,
    });
  });

  it("rejects invalid setup start input before calling dependencies", () => {
    const { deps, invoke } = registerSetupStartWithFakes();

    expect(() => invoke("integrations:google-setup-start", { accountHint: "" })).toThrow();

    expect(deps.startGoogleWorkspaceSetup).not.toHaveBeenCalled();
    expect(deps.redactGoogleWorkspaceSetupState).not.toHaveBeenCalled();
  });

  it("propagates setup start errors before redaction", () => {
    const error = new Error("setup unavailable");
    const { deps, invoke } = registerSetupStartWithFakes({ error });

    expect(() => invoke("integrations:google-setup-start")).toThrow("setup unavailable");

    expect(deps.startGoogleWorkspaceSetup).toHaveBeenCalledWith({});
    expect(deps.redactGoogleWorkspaceSetupState).not.toHaveBeenCalled();
  });
});

describe("registerGoogleSetupCancelIpc", () => {
  it("registers the Google Workspace setup cancel channel", () => {
    const { handlers } = registerSetupCancelWithFakes();

    expect([...handlers.keys()]).toEqual([...googleSetupCancelIpcChannels]);
  });

  it("cancels Google Workspace setup and returns redacted state", async () => {
    const { deps, invoke, redacted, setup } = registerSetupCancelWithFakes();

    await expect(invoke("integrations:google-setup-cancel")).resolves.toEqual(redacted);

    expect(deps.cancelGoogleWorkspaceSetup).toHaveBeenCalledOnce();
    expect(deps.redactGoogleWorkspaceSetupState).toHaveBeenCalledWith(setup);
  });

  it("propagates setup cancel errors before redaction", () => {
    const error = new Error("cancel unavailable");
    const { deps, invoke } = registerSetupCancelWithFakes({ error });

    expect(() => invoke("integrations:google-setup-cancel")).toThrow("cancel unavailable");

    expect(deps.cancelGoogleWorkspaceSetup).toHaveBeenCalledOnce();
    expect(deps.redactGoogleWorkspaceSetupState).not.toHaveBeenCalled();
  });
});

describe("registerGoogleOAuthClientImportIpc", () => {
  it("registers the Google Workspace OAuth client import channel", () => {
    const { handlers } = registerOAuthClientImportWithFakes();

    expect([...handlers.keys()]).toEqual([...googleOAuthClientImportIpcChannels]);
  });

  it("opens the OAuth client JSON picker, imports the selected file, and returns redacted state", async () => {
    const { deps, imported, invoke, redacted } = registerOAuthClientImportWithFakes();

    await expect(
      invoke("integrations:google-import-oauth-client", {
        accountHint: "  user@example.com  ",
        extra: "ignored",
      }),
    ).resolves.toEqual(redacted);

    expect(deps.showOpenDialog).toHaveBeenCalledWith({
      title: "Import Google OAuth client JSON",
      properties: ["openFile"],
      filters: [{ name: "Google OAuth client JSON", extensions: ["json"] }],
    });
    expect(deps.importGoogleWorkspaceOAuthClientConfig).toHaveBeenCalledWith({
      accountHint: "user@example.com",
      sourcePath: "/tmp/client_secret.json",
    });
    expect(deps.redactGoogleWorkspaceSetupState).toHaveBeenCalledWith(imported);
  });

  it("returns redacted current setup state when the OAuth client picker is canceled", async () => {
    const current = sampleGoogleWorkspaceSetupState({ status: "idle", authUrl: undefined, openedAuthUrl: undefined });
    const redacted = sampleGoogleWorkspaceSetupState({ status: "idle", authUrl: undefined, openedAuthUrl: undefined });
    const { deps, invoke } = registerOAuthClientImportWithFakes({
      dialogResult: { canceled: true, filePaths: ["/tmp/ignored.json"] },
      current,
      redacted,
    });

    await expect(invoke("integrations:google-import-oauth-client")).resolves.toEqual(redacted);

    expect(deps.readGoogleWorkspaceSetupState).toHaveBeenCalledOnce();
    expect(deps.redactGoogleWorkspaceSetupState).toHaveBeenCalledWith(current);
    expect(deps.importGoogleWorkspaceOAuthClientConfig).not.toHaveBeenCalled();
  });

  it("returns redacted current setup state when the OAuth client picker has no file path", async () => {
    const current = sampleGoogleWorkspaceSetupState({ status: "idle", authUrl: undefined, openedAuthUrl: undefined });
    const redacted = sampleGoogleWorkspaceSetupState({ status: "idle", authUrl: undefined, openedAuthUrl: undefined });
    const { deps, invoke } = registerOAuthClientImportWithFakes({
      dialogResult: { canceled: false, filePaths: [] },
      current,
      redacted,
    });

    await expect(invoke("integrations:google-import-oauth-client")).resolves.toEqual(redacted);

    expect(deps.readGoogleWorkspaceSetupState).toHaveBeenCalledOnce();
    expect(deps.redactGoogleWorkspaceSetupState).toHaveBeenCalledWith(current);
    expect(deps.importGoogleWorkspaceOAuthClientConfig).not.toHaveBeenCalled();
  });

  it("rejects invalid OAuth client import input before opening the picker", async () => {
    const { deps, invoke } = registerOAuthClientImportWithFakes();

    await expect(invoke("integrations:google-import-oauth-client", { accountHint: "" })).rejects.toThrow();

    expect(deps.showOpenDialog).not.toHaveBeenCalled();
    expect(deps.importGoogleWorkspaceOAuthClientConfig).not.toHaveBeenCalled();
    expect(deps.redactGoogleWorkspaceSetupState).not.toHaveBeenCalled();
  });

  it("propagates OAuth client import errors before redaction", async () => {
    const error = new Error("import failed");
    const { deps, invoke } = registerOAuthClientImportWithFakes({ importError: error });

    await expect(invoke("integrations:google-import-oauth-client")).rejects.toThrow("import failed");

    expect(deps.importGoogleWorkspaceOAuthClientConfig).toHaveBeenCalledOnce();
    expect(deps.redactGoogleWorkspaceSetupState).not.toHaveBeenCalled();
  });
});

describe("registerGoogleValidateIpc", () => {
  it("registers the Google Workspace validate channel", () => {
    const { handlers } = registerValidateWithFakes();

    expect([...handlers.keys()]).toEqual([...googleValidateIpcChannels]);
  });

  it("validates Google Workspace with default input", async () => {
    const { deps, invoke, validation } = registerValidateWithFakes();

    await expect(invoke("integrations:google-validate")).resolves.toEqual(validation);

    expect(deps.validateGoogleWorkspace).toHaveBeenCalledWith({});
  });

  it("parses validation input before validating", async () => {
    const { deps, invoke, validation } = registerValidateWithFakes();

    await expect(
      invoke("integrations:google-validate", {
        accountHint: "  user@example.com  ",
        extra: "ignored",
      }),
    ).resolves.toEqual(validation);

    expect(deps.validateGoogleWorkspace).toHaveBeenCalledWith({ accountHint: "user@example.com" });
  });

  it("rejects invalid validation input before calling dependencies", async () => {
    const { deps, invoke } = registerValidateWithFakes();

    await expect(invoke("integrations:google-validate", { accountHint: "" })).rejects.toThrow();

    expect(deps.validateGoogleWorkspace).not.toHaveBeenCalled();
  });

  it("propagates validation errors", async () => {
    const error = new Error("validation failed");
    const { deps, invoke } = registerValidateWithFakes({ error });

    await expect(invoke("integrations:google-validate")).rejects.toThrow("validation failed");

    expect(deps.validateGoogleWorkspace).toHaveBeenCalledWith({});
  });
});

describe("registerGoogleDisconnectIpc", () => {
  it("registers the Google Workspace disconnect channel", () => {
    const { handlers } = registerDisconnectWithFakes();

    expect([...handlers.keys()]).toEqual([...googleDisconnectIpcChannels]);
  });

  it("forgets the Google Workspace account and returns first-party Google integration state", async () => {
    const { deps, invoke, state } = registerDisconnectWithFakes();

    await expect(invoke("integrations:google-disconnect")).resolves.toEqual(state);

    expect(deps.forgetGoogleWorkspaceAccount).toHaveBeenCalledWith({});
    expect(deps.readFirstPartyGoogleIntegration).toHaveBeenCalledOnce();
  });

  it("parses disconnect input before forgetting the account", async () => {
    const { deps, invoke, state } = registerDisconnectWithFakes();

    await expect(
      invoke("integrations:google-disconnect", {
        accountHint: "  user@example.com  ",
        extra: "ignored",
      }),
    ).resolves.toEqual(state);

    expect(deps.forgetGoogleWorkspaceAccount).toHaveBeenCalledWith({ accountHint: "user@example.com" });
  });

  it("rejects invalid disconnect input before calling dependencies", async () => {
    const { deps, invoke } = registerDisconnectWithFakes();

    await expect(invoke("integrations:google-disconnect", { accountHint: "" })).rejects.toThrow();

    expect(deps.forgetGoogleWorkspaceAccount).not.toHaveBeenCalled();
    expect(deps.readFirstPartyGoogleIntegration).not.toHaveBeenCalled();
  });

  it("propagates disconnect errors before reading integration state", async () => {
    const error = new Error("disconnect failed");
    const { deps, invoke } = registerDisconnectWithFakes({ forgetError: error });

    await expect(invoke("integrations:google-disconnect")).rejects.toThrow("disconnect failed");

    expect(deps.forgetGoogleWorkspaceAccount).toHaveBeenCalledWith({});
    expect(deps.readFirstPartyGoogleIntegration).not.toHaveBeenCalled();
  });

  it("propagates integration state read errors after disconnect", async () => {
    const error = new Error("state unavailable");
    const { deps, invoke } = registerDisconnectWithFakes({ readError: error });

    await expect(invoke("integrations:google-disconnect")).rejects.toThrow("state unavailable");

    expect(deps.forgetGoogleWorkspaceAccount).toHaveBeenCalledWith({});
    expect(deps.readFirstPartyGoogleIntegration).toHaveBeenCalledOnce();
  });
});

function registerWithFakes({
  state = sampleFirstPartyGoogleIntegrationState(),
  error,
}: {
  state?: FirstPartyGoogleIntegrationState;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    readFirstPartyGoogleIntegration: vi.fn(async () => {
      if (error) throw error;
      return state;
    }),
  } satisfies RegisterGoogleIntegrationStateIpcDependencies;
  registerGoogleIntegrationStateIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    state,
  };
}

function registerInstallCliWithFakes({
  install = sampleGoogleWorkspaceCliInstallState(),
  error,
}: {
  install?: GoogleWorkspaceCliInstallState;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    installGoogleWorkspaceCli: vi.fn(async () => {
      if (error) throw error;
      return install;
    }),
    refreshGoogleWorkspaceConnectorMode: vi.fn(),
    resetRuntimeAndPluginServers: vi.fn(),
  } satisfies RegisterGoogleInstallCliIpcDependencies;
  registerGoogleInstallCliIpc(deps);

  return {
    deps,
    handlers,
    install,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
  };
}

function registerSetupStartWithFakes({
  setup = sampleGoogleWorkspaceSetupState(),
  redacted = sampleGoogleWorkspaceSetupState({ authUrl: undefined, openedAuthUrl: undefined }),
  error,
}: {
  setup?: GoogleWorkspaceSetupState;
  redacted?: GoogleWorkspaceSetupState;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    startGoogleWorkspaceSetup: vi.fn((_input: GoogleWorkspaceSetupInput) => {
      if (error) throw error;
      return setup;
    }),
    redactGoogleWorkspaceSetupState: vi.fn(() => redacted),
  } satisfies RegisterGoogleSetupStartIpcDependencies;
  registerGoogleSetupStartIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    redacted,
    setup,
  };
}

function registerSetupCancelWithFakes({
  setup = sampleGoogleWorkspaceSetupState({ status: "canceled", finishedAt: "2026-06-04T12:01:00.000Z" }),
  redacted = sampleGoogleWorkspaceSetupState({
    status: "canceled",
    finishedAt: "2026-06-04T12:01:00.000Z",
    authUrl: undefined,
    openedAuthUrl: undefined,
  }),
  error,
}: {
  setup?: GoogleWorkspaceSetupState;
  redacted?: GoogleWorkspaceSetupState;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    cancelGoogleWorkspaceSetup: vi.fn(() => {
      if (error) throw error;
      return setup;
    }),
    redactGoogleWorkspaceSetupState: vi.fn(() => redacted),
  } satisfies RegisterGoogleSetupCancelIpcDependencies;
  registerGoogleSetupCancelIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent));
    },
    redacted,
    setup,
  };
}

function registerOAuthClientImportWithFakes({
  dialogResult = { canceled: false, filePaths: ["/tmp/client_secret.json"] },
  current = sampleGoogleWorkspaceSetupState({ status: "running" }),
  imported = sampleGoogleWorkspaceSetupState({
    status: "completed",
    command: "setup",
    oauthClientConfigured: true,
  }),
  redacted = sampleGoogleWorkspaceSetupState({
    status: "completed",
    command: "setup",
    oauthClientConfigured: true,
    authUrl: undefined,
    openedAuthUrl: undefined,
  }),
  dialogError,
  importError,
}: {
  dialogResult?: { canceled: boolean; filePaths: string[] };
  current?: GoogleWorkspaceSetupState;
  imported?: GoogleWorkspaceSetupState;
  redacted?: GoogleWorkspaceSetupState;
  dialogError?: Error;
  importError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    showOpenDialog: vi.fn(async () => {
      if (dialogError) throw dialogError;
      return dialogResult;
    }),
    readGoogleWorkspaceSetupState: vi.fn(() => current),
    importGoogleWorkspaceOAuthClientConfig: vi.fn((_input: GoogleWorkspaceOAuthClientImportInput & { sourcePath: string }) => {
      if (importError) throw importError;
      return imported;
    }),
    redactGoogleWorkspaceSetupState: vi.fn(() => redacted),
  } satisfies RegisterGoogleOAuthClientImportIpcDependencies;
  registerGoogleOAuthClientImportIpc(deps);

  return {
    deps,
    handlers,
    imported,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    redacted,
  };
}

function registerValidateWithFakes({
  validation = sampleGoogleWorkspaceValidationResult(),
  error,
}: {
  validation?: GoogleWorkspaceValidationResult;
  error?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    validateGoogleWorkspace: vi.fn((_input: GoogleWorkspaceValidationInput) => {
      if (error) throw error;
      return validation;
    }),
  } satisfies RegisterGoogleValidateIpcDependencies;
  registerGoogleValidateIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    validation,
  };
}

function registerDisconnectWithFakes({
  state = sampleFirstPartyGoogleIntegrationState({ enabled: true, authMode: "gws" }),
  forgetError,
  readError,
}: {
  state?: FirstPartyGoogleIntegrationState;
  forgetError?: Error;
  readError?: Error;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const deps = {
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    forgetGoogleWorkspaceAccount: vi.fn((_input: GoogleWorkspaceValidationInput) => {
      if (forgetError) throw forgetError;
    }),
    readFirstPartyGoogleIntegration: vi.fn(() => {
      if (readError) throw readError;
      return state;
    }),
  } satisfies RegisterGoogleDisconnectIpcDependencies;
  registerGoogleDisconnectIpc(deps);

  return {
    deps,
    handlers,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
    state,
  };
}

function sampleFirstPartyGoogleIntegrationState(
  overrides: Partial<FirstPartyGoogleIntegrationState> = {},
): FirstPartyGoogleIntegrationState {
  return {
    enabled: false,
    authMode: "disabled",
    connectors: [],
    sidecar: {
      adapter: "ambient-go",
      state: "missing",
      binaryPath: "",
      pending: 0,
    },
    unavailableReason: "Google Workspace connectors are disabled.",
    ...overrides,
  };
}

function sampleGoogleWorkspaceSetupState(overrides: Partial<GoogleWorkspaceSetupState> = {}): GoogleWorkspaceSetupState {
  return {
    status: "running",
    command: "login",
    accountHint: "user@example.com",
    startedAt: "2026-06-04T12:00:00.000Z",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    openedAuthUrl: true,
    ...overrides,
  };
}

function sampleGoogleWorkspaceCliInstallState(): GoogleWorkspaceCliInstallState {
  return {
    status: "completed",
    version: "1.2.3",
    platform: "darwin",
    arch: "arm64",
    binaryPath: "/tmp/google-workspace-cli",
    finishedAt: "2026-06-04T12:00:00.000Z",
  };
}

function sampleGoogleWorkspaceValidationResult(): GoogleWorkspaceValidationResult {
  return {
    account: {
      id: "gws:user@example.com",
      accountId: "user@example.com",
      label: "user@example.com",
      email: "user@example.com",
      status: "available",
      grantedScopes: ["gws:gmail", "gws:calendar", "gws:drive"],
      connectedAt: "2026-06-04T12:00:00.000Z",
      updatedAt: "2026-06-04T12:00:00.000Z",
    },
    checks: [
      { service: "identity", label: "Account identity", ok: true },
      { service: "gmail", label: "Gmail labels", ok: true },
      { service: "calendar", label: "Calendar list", ok: true },
      { service: "drive", label: "Drive search", ok: true },
    ],
    identity: {
      email: "user@example.com",
      displayName: "User Example",
      source: "gmail.profile",
    },
  };
}
