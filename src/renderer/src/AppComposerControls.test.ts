import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import {
  contextUsageRingMetrics,
  createComposerDraftStore,
  mergeContextAttachments,
  resizeComposerTextarea,
} from "./AppComposerControls";

describe("composer controls helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps context usage ring metrics clamped to the rendered circle", () => {
    const empty = contextUsageRingMetrics(undefined);
    expect(empty.ringFill).toBe(0);
    expect(empty.ringRemainder).toBe(empty.circumference);

    const overFull = contextUsageRingMetrics(125);
    expect(overFull.ringFill).toBeCloseTo(overFull.circumference);
    expect(overFull.ringRemainder).toBeCloseTo(0);

    const belowEmpty = contextUsageRingMetrics(-20);
    expect(belowEmpty.ringFill).toBe(0);
    expect(belowEmpty.ringRemainder).toBeCloseTo(belowEmpty.circumference);
  });

  it("merges context attachments by stable key while skipping blank additions", () => {
    const existing = contextRef("README.md", "file", { size: 10 });
    const replacement = contextRef("README.md", "file", { size: 20 });
    const source = contextRef("src", "directory");

    expect(mergeContextAttachments([existing], [source, contextRef("  ", "file"), replacement])).toEqual([
      replacement,
      source,
    ]);
  });

  it("caps merged context attachments at thirty entries", () => {
    const current = Array.from({ length: 28 }, (_, index) => contextRef(`current-${index}.ts`, "file"));
    const additions = Array.from({ length: 5 }, (_, index) => contextRef(`addition-${index}.ts`, "file"));

    const merged = mergeContextAttachments(current, additions);

    expect(merged).toHaveLength(30);
    expect(merged.at(27)?.path).toBe("current-27.ts");
    expect(merged.at(28)?.path).toBe("addition-0.ts");
    expect(merged.at(29)?.path).toBe("addition-1.ts");
  });

  it("keeps draft updates scoped to subscribers", () => {
    const store = createComposerDraftStore("initial");
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()));

    store.set("initial");
    store.set("next");
    unsubscribe();
    store.set("ignored");

    expect(store.getSnapshot()).toBe("ignored");
    expect(snapshots).toEqual(["next"]);
  });

  it("tracks draft selection inside the local composer store", () => {
    const store = createComposerDraftStore("initial");

    store.setSelection({ start: 2, end: 5 });
    expect(store.getSelectionSnapshot()).toEqual({ start: 2, end: 5 });

    store.set("short");
    expect(store.getSelectionSnapshot()).toEqual({ start: 5, end: 5 });
  });

  it("sizes the composer textarea to content while honoring the CSS maximum", () => {
    vi.stubGlobal("window", {
      getComputedStyle: vi.fn(() => ({ maxHeight: "180px" })),
    });
    const textarea = textareaElement(320);

    resizeComposerTextarea(textarea);

    expect(textarea.style.height).toBe("180px");
    expect(textarea.style.overflowY).toBe("auto");

    textarea.scrollHeight = 72;
    resizeComposerTextarea(textarea);

    expect(textarea.style.height).toBe("72px");
    expect(textarea.style.overflowY).toBe("hidden");
  });
});

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

function textareaElement(scrollHeight: number): HTMLTextAreaElement & { scrollHeight: number } {
  return {
    scrollHeight,
    style: {
      height: "",
      overflowY: "",
    },
  } as unknown as HTMLTextAreaElement & { scrollHeight: number };
}
