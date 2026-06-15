import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceContextReference } from "../../shared/types";
import {
  contextAttachmentsWithoutItem,
  createAppContextAttachmentActions,
} from "./AppContextAttachmentActions";

describe("App context attachment actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes context attachments by the same stable key used by composer chips", () => {
    const first = contextRef("README.md", "file", { size: 10 });
    const duplicate = contextRef("README.md", "file", { size: 20 });
    const other = contextRef("src", "directory");

    expect(contextAttachmentsWithoutItem([first, duplicate, other], first)).toEqual([other]);
  });

  it("adds selected context attachments through the existing merge semantics", () => {
    const existing = contextRef("README.md", "file", { size: 10 });
    const replacement = contextRef("README.md", "file", { size: 20 });
    const source = contextRef("src", "directory");
    const controller = createController({
      attachments: [existing],
      contextError: "previous error",
    });

    controller.actions.addContextAttachments([source, replacement]);

    expect(controller.contextError.value).toBeUndefined();
    expect(controller.attachments.value).toEqual([replacement, source]);
  });

  it("picks composer files with the current external-access policy", async () => {
    const selected = [contextRef("notes.md", "file")];
    const pickWorkspaceContext = vi.fn(async () => selected);
    vi.stubGlobal("window", {
      ambientDesktop: {
        pickWorkspaceContext,
      },
    });
    const controller = createController({ allowExternalContext: true });

    await controller.actions.attachComposerFiles();

    expect(pickWorkspaceContext).toHaveBeenCalledWith({ kind: "file", allowExternal: true });
    expect(controller.attachments.value).toEqual(selected);
    expect(controller.openAttachmentsPanel).not.toHaveBeenCalled();
    expect(controller.contextError.value).toBeUndefined();
  });

  it("reports file picker errors and opens the attachments panel", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        pickWorkspaceContext: vi.fn(async () => {
          throw new Error("Picker failed");
        }),
      },
    });
    const controller = createController({ allowExternalContext: false });

    await controller.actions.attachComposerFiles();

    expect(controller.contextError.value).toBe("Picker failed");
    expect(controller.openAttachmentsPanel).toHaveBeenCalledOnce();
    expect(controller.attachments.value).toEqual([]);
  });

  it("clears all context attachments", () => {
    const controller = createController({
      attachments: [contextRef("README.md", "file")],
    });

    controller.actions.clearContextAttachments();

    expect(controller.attachments.value).toEqual([]);
  });
});

function createController({
  allowExternalContext = false,
  attachments = [],
  contextError = undefined,
}: {
  allowExternalContext?: boolean;
  attachments?: WorkspaceContextReference[];
  contextError?: string | undefined;
} = {}) {
  const attachmentState = statefulSetter<WorkspaceContextReference[]>(attachments);
  const contextErrorState = statefulSetter<string | undefined>(contextError);
  const openAttachmentsPanel = vi.fn();
  return {
    actions: createAppContextAttachmentActions({
      allowExternalContext,
      openAttachmentsPanel,
      setContextAttachments: attachmentState.set,
      setContextError: contextErrorState.set,
    }),
    attachments: attachmentState,
    contextError: contextErrorState,
    openAttachmentsPanel,
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

function contextRef(
  path: string,
  kind: WorkspaceContextReference["kind"],
  options: Partial<WorkspaceContextReference> = {},
): WorkspaceContextReference {
  return {
    path,
    name: path,
    kind,
    ...options,
  };
}
