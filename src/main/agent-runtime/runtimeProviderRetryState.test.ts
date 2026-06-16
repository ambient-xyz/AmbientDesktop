import { describe, expect, it } from "vitest";

import { createRuntimeProviderRetryState } from "./runtimeProviderRetryState";

describe("createRuntimeProviderRetryState", () => {
  it("starts with no provider retry evidence", () => {
    const state = createRuntimeProviderRetryState();

    expect(state.snapshot()).toEqual({
      providerRetryAttemptCount: 0,
      providerRetryLastError: undefined,
      providerRetryBeforeVisibleOutput: false,
      providerRetryRecovered: false,
    });
  });

  it("tracks provider retry counters, error, and recovery flags", () => {
    const state = createRuntimeProviderRetryState();

    state.setProviderRetryAttemptCount(2);
    state.setProviderRetryLastError("rate limited");
    state.setProviderRetryBeforeVisibleOutput(true);
    state.setProviderRetryRecovered(true);

    expect(state.providerRetryAttemptCount()).toBe(2);
    expect(state.providerRetryLastError()).toBe("rate limited");
    expect(state.providerRetryBeforeVisibleOutput()).toBe(true);
    expect(state.providerRetryRecovered()).toBe(true);
    expect(state.snapshot()).toEqual({
      providerRetryAttemptCount: 2,
      providerRetryLastError: "rate limited",
      providerRetryBeforeVisibleOutput: true,
      providerRetryRecovered: true,
    });
  });

  it("allows the last provider retry error to be cleared", () => {
    const state = createRuntimeProviderRetryState();

    state.setProviderRetryLastError("temporary provider failure");
    state.setProviderRetryLastError(undefined);

    expect(state.providerRetryLastError()).toBeUndefined();
    expect(state.snapshot().providerRetryLastError).toBeUndefined();
  });
});
