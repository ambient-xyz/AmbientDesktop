import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";

export type AppUpdateAction = "check" | "download" | "install" | "dismiss";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppUpdateActions({
  setError,
  setState,
  setUpdateBusy,
  setUpdatePopoverOpen,
}: {
  setError: (message: string | undefined) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setUpdateBusy: Dispatch<SetStateAction<boolean>>;
  setUpdatePopoverOpen: Dispatch<SetStateAction<boolean>>;
}): {
  runUpdateAction: (action: AppUpdateAction) => Promise<void>;
} {
  async function runUpdateAction(action: AppUpdateAction): Promise<void> {
    setUpdateBusy(true);
    setError(undefined);
    try {
      const update =
        action === "check"
          ? await window.ambientDesktop.checkForUpdates("manual")
          : action === "download"
            ? await window.ambientDesktop.downloadUpdate()
            : action === "install"
              ? await window.ambientDesktop.installUpdateAndRestart()
              : await window.ambientDesktop.dismissUpdateNotification();
      setState((current) => (current ? { ...current, app: { ...current.app, update } } : current));
      if (action === "dismiss") setUpdatePopoverOpen(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setUpdateBusy(false);
    }
  }

  return { runUpdateAction };
}
