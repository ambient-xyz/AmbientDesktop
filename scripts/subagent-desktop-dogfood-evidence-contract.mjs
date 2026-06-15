import { readFileSync } from "node:fs";

const contract = JSON.parse(
  readFileSync(new URL("../src/shared/subagentDesktopDogfoodEvidenceContract.json", import.meta.url), "utf8"),
);

export const REQUIRED_DESKTOP_DOGFOOD_SCENARIOS = Object.freeze([
  ...contract.requiredDesktopDogfoodScenarios,
]);

export const REQUIRED_DESKTOP_VISUAL_ASSERTIONS = Object.freeze([
  ...contract.requiredDesktopVisualAssertions,
]);

export const REQUIRED_DESKTOP_MATURITY_ASSERTIONS = Object.freeze(
  contract.requiredDesktopMaturityAssertions.map(freezeMaturityAssertion),
);

export const REQUIRED_DESKTOP_MATURITY_ASSERTION_IDS = Object.freeze(
  REQUIRED_DESKTOP_MATURITY_ASSERTIONS.map((assertion) => assertion.id),
);

function freezeMaturityAssertion(assertion) {
  return Object.freeze({
    id: assertion.id,
    capabilities: Object.freeze([...assertion.capabilities]),
  });
}
