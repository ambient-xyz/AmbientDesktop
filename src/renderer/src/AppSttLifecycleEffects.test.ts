import { describe, expect, it } from "vitest";

import {
  shouldCancelSttComposerForActiveThread,
  sttComposerPushToTalkBlocked,
} from "./AppSttLifecycleEffects";

describe("AppSttLifecycleEffects", () => {
  it("cancels composer recording only when the active thread changes away", () => {
    expect(shouldCancelSttComposerForActiveThread({ activeThreadId: undefined, composerThreadId: "thread-1" })).toBe(false);
    expect(shouldCancelSttComposerForActiveThread({ activeThreadId: "thread-1", composerThreadId: undefined })).toBe(false);
    expect(shouldCancelSttComposerForActiveThread({ activeThreadId: "thread-1", composerThreadId: "thread-1" })).toBe(false);
    expect(shouldCancelSttComposerForActiveThread({ activeThreadId: "thread-2", composerThreadId: "thread-1" })).toBe(true);
  });

  it("blocks push-to-talk while recording or saving/transcribing", () => {
    expect(sttComposerPushToTalkBlocked({ hasRecorder: false, status: "idle" })).toBe(false);
    expect(sttComposerPushToTalkBlocked({ hasRecorder: true, status: "idle" })).toBe(true);
    expect(sttComposerPushToTalkBlocked({ hasRecorder: false, status: "saving" })).toBe(true);
    expect(sttComposerPushToTalkBlocked({ hasRecorder: false, status: "transcribing" })).toBe(true);
  });
});
