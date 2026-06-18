import { describe, expect, it, vi } from "vitest";

import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import { pickRightPanelWorkspaceContext } from "./RightPanelContextPane";

describe("pickRightPanelWorkspaceContext", () => {
  it("passes picker results through and clears busy/error state", async () => {
    const selected: WorkspaceContextReference[] = [{
      kind: "file",
      path: "notes.md",
      name: "notes.md",
      absolute: false,
      size: 123,
    }];
    const pickWorkspaceContext = vi.fn(async () => selected);
    const onAddContext = vi.fn();
    const onContextError = vi.fn();
    const onBusyChange = vi.fn();
    const onErrorChange = vi.fn();

    await pickRightPanelWorkspaceContext({
      kind: "file",
      allowExternal: true,
      pickWorkspaceContext,
      onAddContext,
      onContextError,
      onBusyChange,
      onErrorChange,
    });

    expect(pickWorkspaceContext).toHaveBeenCalledWith({ kind: "file", allowExternal: true });
    expect(onAddContext).toHaveBeenCalledWith(selected);
    expect(onContextError).toHaveBeenCalledWith(undefined);
    expect(onErrorChange).toHaveBeenCalledWith(undefined);
    expect(onBusyChange.mock.calls).toEqual([["file"], [undefined]]);
  });

  it("surfaces picker errors through local and composer context error channels", async () => {
    const pickWorkspaceContext = vi.fn(async () => {
      throw new Error("Picker canceled");
    });
    const onAddContext = vi.fn();
    const onContextError = vi.fn();
    const onBusyChange = vi.fn();
    const onErrorChange = vi.fn();

    await pickRightPanelWorkspaceContext({
      kind: "directory",
      allowExternal: false,
      pickWorkspaceContext,
      onAddContext,
      onContextError,
      onBusyChange,
      onErrorChange,
    });

    expect(pickWorkspaceContext).toHaveBeenCalledWith({ kind: "directory", allowExternal: false });
    expect(onAddContext).not.toHaveBeenCalled();
    expect(onContextError.mock.calls).toEqual([[undefined], ["Picker canceled"]]);
    expect(onErrorChange.mock.calls).toEqual([[undefined], ["Picker canceled"]]);
    expect(onBusyChange.mock.calls).toEqual([["directory"], [undefined]]);
  });
});
