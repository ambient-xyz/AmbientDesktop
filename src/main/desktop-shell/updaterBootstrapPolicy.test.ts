import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  evaluateBootstrapRecoveryPolicy,
  fetchBootstrapRecoveryPolicy,
} from "./updaterBootstrapPolicy";

describe("compareAppVersions", () => {
  it("orders dotted release versions numerically", () => {
    expect(compareAppVersions("0.1.9", "0.1.10")).toBeLessThan(0);
    expect(compareAppVersions("0.2.0", "0.1.99")).toBeGreaterThan(0);
    expect(compareAppVersions("1.0.0", "1.0")).toBe(0);
  });

  it("treats prereleases as lower than final releases", () => {
    expect(compareAppVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    expect(compareAppVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
  });
});

describe("evaluateBootstrapRecoveryPolicy", () => {
  it("enters recovery when the current version is explicitly blocked", () => {
    expect(
      evaluateBootstrapRecoveryPolicy(
        {
          blockedVersions: ["0.1.15"],
          recoveryMessage: "A startup fix is available.",
        },
        "0.1.15",
      ),
    ).toEqual({
      shouldEnterRecovery: true,
      reason: "Version 0.1.15 is blocked by the update feed.",
      message: "A startup fix is available.",
    });
  });

  it("enters recovery when the current version is below the forced update floor", () => {
    const decision = evaluateBootstrapRecoveryPolicy({ forceUpdateBelow: "0.1.16" }, "0.1.15");

    expect(decision.shouldEnterRecovery).toBe(true);
    expect(decision.reason).toContain("0.1.16");
  });

  it("allows startup when the current version satisfies the policy", () => {
    expect(
      evaluateBootstrapRecoveryPolicy(
        {
          blockedVersions: ["0.1.14"],
          forceUpdateBelow: "0.1.15",
          minimumHealthyVersion: "0.1.15",
        },
        "0.1.15",
      ),
    ).toEqual({ shouldEnterRecovery: false });
  });
});

describe("fetchBootstrapRecoveryPolicy", () => {
  it("fetches release.json with no-store cache semantics", async () => {
    const calls: Array<{ url: string; cache?: RequestCache }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), cache: init?.cache });
      return new Response(JSON.stringify({ blockedVersions: ["0.1.15"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const decision = await fetchBootstrapRecoveryPolicy({
      feedUrl: "https://updates.example.test/desktop/stable/",
      currentVersion: "0.1.15",
      timeoutMs: 1_000,
      fetchImpl,
    });

    expect(calls).toEqual([{ url: "https://updates.example.test/desktop/stable/release.json", cache: "no-store" }]);
    expect(decision.shouldEnterRecovery).toBe(true);
  });
});

