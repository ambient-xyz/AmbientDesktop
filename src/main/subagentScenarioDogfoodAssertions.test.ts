import { describe, expect, it } from "vitest";

import { forbiddenClaimLooksPromised, forbiddenClaimPromises } from "./subagentScenarioDogfoodAssertions";

describe("subagent scenario dogfood assertions", () => {
  it("does not treat verification-table negation as a forbidden promise", () => {
    const answer = [
      "| Requirement | Status |",
      "|---|---|",
      "| No promise of zero missed notifications | Not present |",
      "| No promise of instant delivery | Not present |",
      "| No \"finally perfect\" / absolute language | Not present |",
      "| No forbidden claims | No zero-missed, instant-delivery, or \"finally perfect\" claims |",
    ].join("\n");

    expect(forbiddenClaimPromises(answer, ["zero missed notifications", "instant delivery", "finally perfect"])).toEqual({
      "zero missed notifications": false,
      "instant delivery": false,
      "finally perfect": false,
    });
  });

  it("flags an actual forbidden promise", () => {
    expect(forbiddenClaimLooksPromised(
      "The new Notifications Center guarantees zero missed notifications and instant delivery.",
      "zero missed notifications",
    )).toBe(true);
  });
});
