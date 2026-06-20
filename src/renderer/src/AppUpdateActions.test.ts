import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { createAppUpdateActions } from "./AppUpdateActions";

describe("App update actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs an update check and writes the returned app update state", async () => {
    const update = { status: "checking", canCheck: false };
    const checkForUpdates = vi.fn(async () => update);
    vi.stubGlobal("window", {
      ambientDesktop: {
        checkForUpdates,
      },
    });
    const controller = createController();

    await controller.actions.runUpdateAction("check");

    expect(checkForUpdates).toHaveBeenCalledWith("manual");
    expect(controller.error).toBeUndefined();
    expect(controller.busy.value).toBe(false);
    expect(controller.state.value?.app.update).toBe(update);
  });

  it("closes the update popover after dismissing an update notice", async () => {
    const update = { status: "dismissed", canCheck: true };
    const dismissUpdateNotification = vi.fn(async () => update);
    vi.stubGlobal("window", {
      ambientDesktop: {
        dismissUpdateNotification,
      },
    });
    const controller = createController();
    controller.popoverOpen.set(true);

    await controller.actions.runUpdateAction("dismiss");

    expect(dismissUpdateNotification).toHaveBeenCalledOnce();
    expect(controller.popoverOpen.value).toBe(false);
    expect(controller.state.value?.app.update).toBe(update);
  });
});

function createController() {
  const state = statefulSetter<DesktopState | undefined>({
    app: {
      update: { status: "idle", canCheck: true },
    },
  } as DesktopState);
  const busy = statefulSetter(false);
  const popoverOpen = statefulSetter(false);
  let error: string | undefined;

  return {
    actions: createAppUpdateActions({
      setError: (message) => {
        error = message;
      },
      setState: state.set,
      setUpdateBusy: busy.set,
      setUpdatePopoverOpen: popoverOpen.set,
    }),
    busy,
    get error() {
      return error;
    },
    popoverOpen,
    state,
  };
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}
