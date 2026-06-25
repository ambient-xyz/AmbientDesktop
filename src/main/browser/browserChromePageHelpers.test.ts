import { describe, expect, it } from "vitest";

import {
  BooleanPickSelection,
  PICK_TIMEOUT_MS,
  assertLoginOrigin,
  browserLoginExpression,
  buildBrowserPickExpression,
  cancelBrowserPickExpression,
  clampInteger,
  normalizeBrowserLoginOrigin,
  normalizeBrowserLoginRequest,
  normalizeBrowserLoginResult,
  normalizePickSelection,
} from "./browserChromeRuntimeController";
import {
  BooleanPickSelection as focusedBooleanPickSelection,
  PICK_TIMEOUT_MS as focusedPickTimeoutMs,
  assertLoginOrigin as focusedAssertLoginOrigin,
  browserLoginExpression as focusedBrowserLoginExpression,
  buildBrowserPickExpression as focusedBuildBrowserPickExpression,
  cancelBrowserPickExpression as focusedCancelBrowserPickExpression,
  clampInteger as focusedClampInteger,
  normalizeBrowserLoginOrigin as focusedNormalizeBrowserLoginOrigin,
  normalizeBrowserLoginRequest as focusedNormalizeBrowserLoginRequest,
  normalizeBrowserLoginResult as focusedNormalizeBrowserLoginResult,
  normalizePickSelection as focusedNormalizePickSelection,
} from "./browserChromePageHelpers";

describe("browserChromePageHelpers", () => {
  it("keeps browserChromeRuntimeController page-helper exports wired to the focused module", () => {
    expect(PICK_TIMEOUT_MS).toBe(focusedPickTimeoutMs);
    expect(BooleanPickSelection).toBe(focusedBooleanPickSelection);
    expect(assertLoginOrigin).toBe(focusedAssertLoginOrigin);
    expect(browserLoginExpression).toBe(focusedBrowserLoginExpression);
    expect(buildBrowserPickExpression).toBe(focusedBuildBrowserPickExpression);
    expect(cancelBrowserPickExpression).toBe(focusedCancelBrowserPickExpression);
    expect(clampInteger).toBe(focusedClampInteger);
    expect(normalizeBrowserLoginOrigin).toBe(focusedNormalizeBrowserLoginOrigin);
    expect(normalizeBrowserLoginRequest).toBe(focusedNormalizeBrowserLoginRequest);
    expect(normalizeBrowserLoginResult).toBe(focusedNormalizeBrowserLoginResult);
    expect(normalizePickSelection).toBe(focusedNormalizePickSelection);
  });
});
