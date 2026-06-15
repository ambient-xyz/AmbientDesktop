import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXPECTED_UPDATE_BASE_URL = "https://updates.ambient.xyz/desktop";
const EXPECTED_UPDATE_CHANNELS = ["stable", "beta"];
const EXPECTED_UI_MODEL_STRICT_SCRIPT = "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --fail-on-violations";
const EXPECTED_UI_MODEL_ALL_SCRIPT = "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --profile=core,stress,interaction --isolate-scenarios";
const EXPECTED_UI_MODEL_ALL_ZERO_SCRIPT =
  "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --profile=core,stress,interaction --isolate-scenarios --fail-on-any-violation";
const EXPECTED_UI_MODEL_INTERACTIONS_SCRIPT = "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --profile=interaction --isolate-scenarios";
const EXPECTED_UI_MODEL_SELF_TEST_SCRIPT = "node --experimental-websocket scripts/ui-model/collect-ui-model.mjs --scenario=main-shell-desktop --self-test-defects";
const APPROVED_ENTITLEMENT_KEYS = [
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
];

export async function evaluateDesktopReleaseGate({ repoRoot }) {
  const facts = await readDesktopReleaseGateFacts(repoRoot);
  return evaluateDesktopReleaseGateFacts(facts);
}

export async function readDesktopReleaseGateFacts(repoRoot) {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const policy = JSON.parse(await readFile(join(repoRoot, "build", "release-hardening-policy.json"), "utf8"));
  const mainEntitlementsXml = await readFile(join(repoRoot, "build", "entitlements.mac.plist"), "utf8");
  const inheritEntitlementsXml = await readFile(join(repoRoot, "build", "entitlements.mac.inherit.plist"), "utf8");
  const updateServiceSource = await readFile(join(repoRoot, "src", "main", "updateService.ts"), "utf8");
  const publishScriptSource = await readFile(join(repoRoot, "scripts", "publish-desktop-update.mjs"), "utf8");
  const policyDocument = await readFile(join(repoRoot, "docs", "release-hardening-policy.md"), "utf8");
  const uiModelCollectorSource = await readFile(join(repoRoot, "scripts", "ui-model", "collect-ui-model.mjs"), "utf8");
  const uiModelReadme = await readFile(join(repoRoot, "scripts", "ui-model", "README.md"), "utf8");
  const uiModelHandoff = await readFile(join(repoRoot, "docs", "headless-ui-qa-handoff.md"), "utf8");
  const uiModelPlan = await readFile(join(repoRoot, "adoptMaxUIFixSuggestions.md"), "utf8");

  return {
    packageJson,
    policy,
    mainEntitlements: parseEntitlements(mainEntitlementsXml),
    inheritEntitlements: parseEntitlements(inheritEntitlementsXml),
    updateServiceSource,
    publishScriptSource,
    policyDocument,
    uiModelCollectorSource,
    uiModelReadme,
    uiModelHandoff,
    uiModelPlan,
  };
}

export function evaluateDesktopReleaseGateFacts(facts) {
  const checks = [
    packageUpdateFeedCheck(facts),
    updateRuntimePolicyCheck(facts),
    publishTargetCheck(facts),
    publishManifestCheck(facts),
    signingPolicyCheck(facts),
    hardenedRuntimeCheck(facts),
    entitlementPolicyCheck("main entitlements", facts.mainEntitlements, facts),
    entitlementPolicyCheck("inherited entitlements", facts.inheritEntitlements, facts),
    policyDocumentCheck(facts),
    packageScriptCheck(facts),
    uiModelStrictScriptCheck(facts),
    uiModelStrictCollectorCheck(facts),
    uiModelStrictChecklistCheck(facts),
  ];
  const issues = checks.filter((check) => check.status === "fail").map((check) => check.issue);
  return {
    status: issues.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    summary:
      issues.length === 0
        ? "Desktop release/update hardening gate passed."
        : `Desktop release/update hardening gate failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}.`,
    issues,
    checks,
  };
}

function signingPolicyCheck(facts) {
  const signing = facts.policy.signing ?? {};
  const ok =
    signing.releaseRequiresSignedNotarizedArtifacts === true &&
    signing.localUnsignedBuilds === "allowed-before-release-cut" &&
    typeof signing.owner === "string" &&
    signing.owner.trim().length > 0 &&
    typeof signing.reviewBy === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(signing.reviewBy);
  return check(
    "release signing policy",
    ok,
    "Release signing/notarization expectations must be explicit even though local unsigned builds are allowed before a release cut.",
    `releaseRequiresSignedNotarizedArtifacts=${signing.releaseRequiresSignedNotarizedArtifacts}; localUnsignedBuilds=${signing.localUnsignedBuilds}; owner=${signing.owner}; reviewBy=${signing.reviewBy}`,
  );
}

function packageUpdateFeedCheck(facts) {
  const publish = Array.isArray(facts.packageJson.build?.publish) ? facts.packageJson.build.publish : [];
  const genericFeeds = publish.filter((entry) => entry?.provider === "generic").map((entry) => entry.url);
  return check(
    "package update feed",
    genericFeeds.length === 1 && genericFeeds[0] === `${EXPECTED_UPDATE_BASE_URL}/stable`,
    `Expected one generic production feed at ${EXPECTED_UPDATE_BASE_URL}/stable; found ${JSON.stringify(genericFeeds)}.`,
    `genericFeeds=${JSON.stringify(genericFeeds)}`,
  );
}

function updateRuntimePolicyCheck(facts) {
  const source = facts.updateServiceSource;
  const sourceLooksGated =
    /\bisProductionUpdateRuntime\b/.test(source) &&
    /\bproductionUpdateChannels\b/.test(source) &&
    source.includes("AMBIENT_DESKTOP_UPDATE_URL") &&
    source.includes("AMBIENT_DESKTOP_UPDATE_BASE_URL") &&
    /\$\{defaultUpdateBaseUrl\}\/\$\{input\.channel\}/.test(source);
  const policyLooksGated =
    facts.policy.updateFeeds?.productionBaseUrl === EXPECTED_UPDATE_BASE_URL &&
    equalStringArrays(facts.policy.updateFeeds?.allowedProductionChannels, EXPECTED_UPDATE_CHANNELS) &&
    facts.policy.updateFeeds?.packagedRuntimeEnvOverrides === "disabled";
  return check(
    "packaged update feed override policy",
    sourceLooksGated && policyLooksGated,
    "Packaged production update feeds must ignore arbitrary runtime env URL/base overrides and use Ambient-owned stable/beta feeds.",
    `sourceLooksGated=${sourceLooksGated}; policyLooksGated=${policyLooksGated}`,
  );
}

function publishTargetCheck(facts) {
  const source = facts.publishScriptSource;
  const hasExplicitTargetGuard =
    source.includes("requirePublishTarget") &&
    source.includes("--host or AMBIENT_UPDATE_HOST") &&
    source.includes("--user or AMBIENT_UPDATE_USER") &&
    source.includes("--key or AMBIENT_UPDATE_SSH_KEY");
  const hasHardcodedSensitiveTarget =
    /15\.204\.236\.102|ambientmarketing_ovh|\/Users\/Neo\/logins|const\s+user\s*=.*ubuntu/.test(source);
  return check(
    "publish target hygiene",
    hasExplicitTargetGuard && !hasHardcodedSensitiveTarget && facts.policy.updateFeeds?.publishRequiresExplicitTarget === true,
    "Real update publishing must require explicit host/user/key inputs and must not carry private deployment defaults in the repo.",
    `hasExplicitTargetGuard=${hasExplicitTargetGuard}; hasHardcodedSensitiveTarget=${hasHardcodedSensitiveTarget}`,
  );
}

function publishManifestCheck(facts) {
  const source = facts.publishScriptSource;
  const policyManifests = facts.policy.updateFeeds?.publishManifests;
  const hasReleaseJson = source.includes("release.json");
  const hasShaSums = source.includes("SHA256SUMS");
  return check(
    "publish manifest/hash outputs",
    hasReleaseJson && hasShaSums && equalStringArrays(policyManifests, ["release.json", "SHA256SUMS"]),
    "Update publishing must produce release.json and SHA256SUMS for recovery policy and artifact hash audit.",
    `hasReleaseJson=${hasReleaseJson}; hasShaSums=${hasShaSums}; policyManifests=${JSON.stringify(policyManifests)}`,
  );
}

function hardenedRuntimeCheck(facts) {
  const mac = facts.packageJson.build?.mac ?? {};
  return check(
    "mac hardened runtime configuration",
    mac.hardenedRuntime === true &&
      mac.entitlements === "build/entitlements.mac.plist" &&
      mac.entitlementsInherit === "build/entitlements.mac.inherit.plist",
    "macOS packaging must keep hardened runtime enabled and point at the reviewed entitlement files.",
    `hardenedRuntime=${mac.hardenedRuntime}; entitlements=${mac.entitlements}; entitlementsInherit=${mac.entitlementsInherit}`,
  );
}

function entitlementPolicyCheck(label, entitlements, facts) {
  const entitlementKeys = Object.keys(entitlements).sort();
  const unknown = entitlementKeys.filter((key) => !APPROVED_ENTITLEMENT_KEYS.includes(key));
  const policy = facts.policy.macEntitlements ?? {};
  const missingPolicy = entitlementKeys.filter((key) => {
    const record = policy[key];
    return (
      !record ||
      record.allowed !== true ||
      typeof record.owner !== "string" ||
      record.owner.trim().length === 0 ||
      typeof record.reviewBy !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewBy) ||
      typeof record.rationale !== "string" ||
      record.rationale.trim().length < 30
    );
  });
  const nonTrue = Object.entries(entitlements).filter((entry) => entry[1] !== true).map((entry) => entry[0]);
  return check(
    label,
    unknown.length === 0 && missingPolicy.length === 0 && nonTrue.length === 0,
    `${label} contain undocumented, unapproved, or non-true hardened-runtime exceptions.`,
    `keys=${JSON.stringify(entitlementKeys)}; unknown=${JSON.stringify(unknown)}; missingPolicy=${JSON.stringify(missingPolicy)}; nonTrue=${JSON.stringify(nonTrue)}`,
  );
}

function policyDocumentCheck(facts) {
  const document = facts.policyDocument;
  const requiredFragments = [
    "Packaged production builds use Ambient-owned update feeds only",
    "AMBIENT_DESKTOP_UPDATE_URL",
    "Release Signing And Notarization",
    "signed and notarized",
    ...APPROVED_ENTITLEMENT_KEYS,
  ];
  const missing = requiredFragments.filter((fragment) => !document.includes(fragment));
  return check(
    "release hardening policy document",
    missing.length === 0,
    "docs/release-hardening-policy.md must document update feed restrictions and every approved macOS entitlement exception.",
    `missing=${JSON.stringify(missing)}`,
  );
}

function packageScriptCheck(facts) {
  return check(
    "package release gate script",
    facts.packageJson.scripts?.["test:desktop-release-gate"] === "node scripts/desktop-release-gate.mjs",
    "package.json must expose the local desktop release hardening gate.",
    `script=${facts.packageJson.scripts?.["test:desktop-release-gate"]}`,
  );
}

function uiModelStrictScriptCheck(facts) {
  const scripts = facts.packageJson.scripts ?? {};
  const ok =
    scripts["test:ui-model:strict"] === EXPECTED_UI_MODEL_STRICT_SCRIPT &&
    scripts["test:ui-model:all"] === EXPECTED_UI_MODEL_ALL_SCRIPT &&
    scripts["test:ui-model:all:zero"] === EXPECTED_UI_MODEL_ALL_ZERO_SCRIPT &&
    scripts["test:ui-model:interactions"] === EXPECTED_UI_MODEL_INTERACTIONS_SCRIPT &&
    scripts["test:ui-model:self-test"] === EXPECTED_UI_MODEL_SELF_TEST_SCRIPT;
  return check(
    "UI model strict local gate scripts",
    ok,
    "package.json must expose the strict UI model local gate, the full report-only suite with interaction coverage, the zero-baseline ratchet, and the rule self-test lane.",
    `strict=${scripts["test:ui-model:strict"]}; all=${scripts["test:ui-model:all"]}; zero=${scripts["test:ui-model:all:zero"]}; interactions=${scripts["test:ui-model:interactions"]}; selfTest=${scripts["test:ui-model:self-test"]}`,
  );
}

function uiModelStrictCollectorCheck(facts) {
  const source = facts.uiModelCollectorSource;
  const hasStrictExit =
    source.includes("failOnViolations") &&
    source.includes("gateFailureCount > 0") &&
    source.includes("process.exitCode = 1");
  const hasZeroBaselineExit =
    source.includes("failOnAnyViolation") &&
    source.includes("violationCount > 0") &&
    source.includes("zero-baseline");
  const hasGatePolicy =
    source.includes('impact === "blocker"') &&
    source.includes('exposure === "common"') &&
    source.includes('exposure === "plausible-heavy"') &&
    source.includes('impact === "major"') &&
    source.includes('impact === "accessibility"');
  const hasSelfTestGuard = source.includes("assertSelfTestDetections") && source.includes("selfTestDefects");
  return check(
    "UI model strict collector behavior",
    hasStrictExit && hasZeroBaselineExit && hasGatePolicy && hasSelfTestGuard,
    "The UI model collector must fail strict mode on gated violations, fail zero-baseline mode on any deterministic finding, and retain self-test coverage for detector regressions.",
    `hasStrictExit=${hasStrictExit}; hasZeroBaselineExit=${hasZeroBaselineExit}; hasGatePolicy=${hasGatePolicy}; hasSelfTestGuard=${hasSelfTestGuard}`,
  );
}

function uiModelStrictChecklistCheck(facts) {
  const releaseDocument = facts.policyDocument;
  const uiDocs = [facts.uiModelReadme, facts.uiModelHandoff, facts.uiModelPlan].join("\n");
  const requiredReleaseFragments = [
    "pnpm run test:ui-model:strict",
    "pnpm run test:ui-model:all",
    "pnpm run test:ui-model:all:zero",
    "pnpm run test:ui-model:self-test",
    "0 gate failures",
    "0 report-only findings",
  ];
  const requiredUiFragments = [
    "Strict mode fails",
    "zero-baseline",
    "0 report-only findings",
    "23 scenarios",
    "0 total findings",
    "interaction profile",
    "settings-search-active",
    "api-key-dialog-open",
    "model-selector-open",
    "project-board-pm-review-open",
    "workflow-run-console-open",
    "workflow-artifact-preview-open",
    "dialog-outside-viewport",
    "focus-ring-clipped",
    "required-action-hidden",
    "offscreen-active-menu-item",
    "sticky-header-overlap",
    "unreachable-scroll-content",
    "Strict mode passes on current `main`",
    "Strict mode is listed in the local release checklist",
  ];
  const missingRelease = requiredReleaseFragments.filter((fragment) => !releaseDocument.includes(fragment));
  const missingUi = requiredUiFragments.filter((fragment) => !uiDocs.includes(fragment));
  return check(
    "UI model strict release checklist",
    missingRelease.length === 0 && missingUi.length === 0,
    "The local release checklist and UI model docs must document the strict UI gate, full report-only sweep, self-test, and current zero-gate baseline.",
    `missingRelease=${JSON.stringify(missingRelease)}; missingUi=${JSON.stringify(missingUi)}`,
  );
}

function check(name, ok, issue, evidence) {
  return {
    name,
    status: ok ? "pass" : "fail",
    evidence,
    ...(ok ? {} : { issue }),
  };
}

function parseEntitlements(xml) {
  const entitlements = {};
  const pattern = /<key>([^<]+)<\/key>\s*<(true|false)\/>/g;
  for (const match of xml.matchAll(pattern)) entitlements[match[1]] = match[2] === "true";
  return entitlements;
}

function equalStringArrays(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
