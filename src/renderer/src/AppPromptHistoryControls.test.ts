import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createAppPromptHistoryControls,
  promptHistoryCanNavigate,
  promptHistoryNavigation,
} from "./AppPromptHistoryControls";

describe("App prompt history controls", () => {
  it("keeps prompt history navigation eligibility stable", () => {
    expect(promptHistoryCanNavigate({
      cursor: undefined,
      direction: "older",
      draftLength: 0,
      historyLength: 2,
      selectionStart: 0,
      selectionEnd: 0,
    })).toBe(true);
    expect(promptHistoryCanNavigate({
      cursor: undefined,
      direction: "older",
      draftLength: 4,
      historyLength: 2,
      selectionStart: 0,
      selectionEnd: 0,
    })).toBe(false);
    expect(promptHistoryCanNavigate({
      cursor: 0,
      direction: "newer",
      draftLength: 0,
      historyLength: 2,
      selectionStart: 0,
      selectionEnd: 0,
    })).toBe(true);
    expect(promptHistoryCanNavigate({
      cursor: undefined,
      direction: "newer",
      draftLength: 0,
      historyLength: 2,
      selectionStart: 0,
      selectionEnd: 0,
    })).toBe(false);
  });

  it("walks older and newer history without dropping the pre-history draft", () => {
    const history = ["latest prompt", "older prompt"];
    expect(promptHistoryNavigation({
      cursor: undefined,
      currentDraft: "scratch",
      direction: "older",
      draftBeforeHistory: "",
      history,
    })).toEqual({
      cursor: 0,
      draft: "latest prompt",
      draftBeforeHistory: "scratch",
    });
    expect(promptHistoryNavigation({
      cursor: 0,
      currentDraft: "latest prompt",
      direction: "older",
      draftBeforeHistory: "scratch",
      history,
    })).toEqual({
      cursor: 1,
      draft: "older prompt",
      draftBeforeHistory: "scratch",
    });
    expect(promptHistoryNavigation({
      cursor: 0,
      currentDraft: "latest prompt",
      direction: "newer",
      draftBeforeHistory: "scratch",
      history,
    })).toEqual({
      cursor: undefined,
      draft: "scratch",
      draftBeforeHistory: "",
    });
  });

  it("applies selected history drafts and clears STT draft metadata", () => {
    const cursor = statefulSetter<number | undefined>(undefined);
    const draftBeforeHistory = statefulSetter("");
    const setComposerDraft = vi.fn();
    const clearSttDraftMetadata = vi.fn();
    const controls = createAppPromptHistoryControls({
      clearSttDraftMetadata,
      draftBeforePromptHistory: draftBeforeHistory.value,
      getComposerDraft: () => "current draft",
      getPromptHistory: () => ["latest prompt"],
      promptHistoryCursor: cursor.value,
      setComposerDraft,
      setDraftBeforePromptHistory: draftBeforeHistory.set,
      setPromptHistoryCursor: cursor.set,
    });

    controls.navigatePromptHistory("older");

    expect(cursor.value).toBe(0);
    expect(draftBeforeHistory.value).toBe("current draft");
    expect(setComposerDraft).toHaveBeenCalledWith("latest prompt", { focusEnd: true });
    expect(clearSttDraftMetadata).toHaveBeenCalled();
  });

  it("resets prompt history cursor and draft buffer", () => {
    const cursor = statefulSetter<number | undefined>(1);
    const draftBeforeHistory = statefulSetter("scratch");
    const controls = createAppPromptHistoryControls({
      clearSttDraftMetadata: vi.fn(),
      draftBeforePromptHistory: draftBeforeHistory.value,
      getComposerDraft: () => "",
      getPromptHistory: () => [],
      promptHistoryCursor: cursor.value,
      setComposerDraft: vi.fn(),
      setDraftBeforePromptHistory: draftBeforeHistory.set,
      setPromptHistoryCursor: cursor.set,
    });

    controls.resetPromptHistory();

    expect(cursor.value).toBeUndefined();
    expect(draftBeforeHistory.value).toBe("");
  });
});

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
