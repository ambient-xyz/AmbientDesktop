export const FIX_INSTALLS_REDACTIONS_GATES = [
  {
    id: "G0",
    scenario: "provider-setup-baseline",
    marker: "FIX_INSTALLS_REDACTIONS_G0_BASELINE_OK",
    title: "Baseline provider setup loop",
    artifactPath: "test-results/fix-installs-redactions/provider-setup-baseline/latest.json",
  },
  {
    id: "G1",
    scenario: "redaction-ref-identity",
    marker: "FIX_INSTALLS_REDACTIONS_G1_PATH_IDENTITY_OK",
    title: "Path visibility and stable identity",
    artifactPath: "test-results/fix-installs-redactions/redaction-ref-identity/latest.json",
  },
  {
    id: "G2",
    scenario: "builder-registration-repair",
    marker: "FIX_INSTALLS_REDACTIONS_G2_REGISTRATION_REPAIR_OK",
    title: "Builder registration repair",
    artifactPath: "test-results/fix-installs-redactions/builder-registration-repair/latest.json",
  },
  {
    id: "G3",
    scenario: "provider-device-timeout-profiles",
    marker: "FIX_INSTALLS_REDACTIONS_G3_DEVICE_TIMEOUT_OK",
    title: "Provider device and timeout profiles",
    artifactPath: "test-results/fix-installs-redactions/provider-device-timeout-profiles/latest.json",
  },
  {
    id: "G4",
    scenario: "provider-catalog-onboarding-e2e",
    marker: "FIX_INSTALLS_REDACTIONS_G4_ONBOARDING_OK",
    title: "Provider catalog onboarding end to end",
    artifactPath: "test-results/fix-installs-redactions/provider-catalog-onboarding-e2e/latest.json",
  },
];

const degradedLiveModelPattern = /(?:zai-org\/)?glm[-_. ]?5\.1/i;

export function fixInstallsRedactionsGateForScenario(scenario) {
  const gate = FIX_INSTALLS_REDACTIONS_GATES.find((candidate) => candidate.scenario === scenario);
  if (!gate) {
    throw new Error(`Unsupported fix-installs-redactions gate scenario: ${scenario}`);
  }
  return gate;
}

export function fixInstallsRedactionsLatestArtifactPath(scenario) {
  return fixInstallsRedactionsGateForScenario(scenario).artifactPath;
}

export function assertFixInstallsRedactionsProviderAllowed(input) {
  const providerId = String(input?.providerId ?? "ambient");
  const modelId = String(input?.modelId ?? "");
  if (providerId !== "ambient") {
    throw new Error(`fix-installs-redactions gates must use AMBIENT_PROVIDER=ambient, got ${providerId}.`);
  }
  if (degradedLiveModelPattern.test(modelId)) {
    throw new Error(`fix-installs-redactions gates must not use degraded Example Model model ${modelId}.`);
  }
  if (!modelId.trim()) {
    throw new Error("fix-installs-redactions gates require a non-empty Ambient live model id.");
  }
  return { providerId, modelId };
}

export function fixInstallsRedactionsGatePrompt(gate, context = {}) {
  if (gate.scenario === "provider-setup-baseline") {
    return [
      "This is the Phase 0 live baseline gate for Ambient Desktop provider setup hardening.",
      "Use the live Ambient/Pi provider path only.",
      "Do not call tools, do not inspect files, and do not change workspace state.",
      `Reply exactly ${gate.marker}.`,
    ].join("\n");
  }
  if (gate.scenario === "redaction-ref-identity") {
    const ordinaryPath = requiredContextValue(context, "ordinaryPath", gate.scenario);
    const sensitivePathAlias = requiredContextValue(context, "sensitivePathAlias", gate.scenario);
    return [
      "This is the Phase 1 live gate for Ambient Desktop path redaction identity.",
      "Use the live Ambient/Pi provider path only.",
      "Ordinary inspected workspace paths must remain visible to preserve debugging context.",
      `Ordinary path visible to the agent: ${ordinaryPath}`,
      "Sensitive path identities must be represented by stable opaque aliases that are not filesystem paths.",
      `Sensitive path alias visible to the agent: ${sensitivePathAlias}`,
      "Do not call tools, do not inspect files, and do not change workspace state.",
      `Reply exactly ${gate.marker} if the ordinary path is usable as a real path and the alias is only an identity token.`,
    ].join("\n");
  }
  if (gate.scenario === "builder-registration-repair") {
    const packageName = requiredContextValue(context, "packageName", gate.scenario);
    const sourcePath = requiredContextValue(context, "sourcePath", gate.scenario);
    const staleInstalledPackageId = requiredContextValue(context, "staleInstalledPackageId", gate.scenario);
    const staleInstalledSource = requiredContextValue(context, "staleInstalledSource", gate.scenario);
    return [
      "This is the Phase 2 live gate for Ambient Desktop Capability Builder registration repair.",
      "Use the live Ambient/Pi provider path only.",
      `A generated Builder package named ${packageName} has stale installed metadata after a failed unregister/register recovery.`,
      `Canonical Builder sourcePath: ${sourcePath}`,
      `Stale installedPackageId recorded in metadata: ${staleInstalledPackageId}`,
      `Stale installedSource recorded in metadata: ${staleInstalledSource}`,
      "First call ambient_capability_builder_history with the packageName and confirm the generated source is still marked registered while installed present is no.",
      "Then request approval by calling ambient_capability_builder_repair_registration_metadata with the sourcePath and a reason that this is stale installed metadata recovery.",
      "Do not edit capability-build.json through shell, bash, generic file tools, or manual JSON writes.",
      "Do not call generic Ambient CLI install/uninstall tools for this recovery gate.",
      `After the repair tool succeeds, reply exactly ${gate.marker}.`,
    ].join("\n");
  }
  if (gate.scenario === "provider-device-timeout-profiles") {
    const packageName = requiredContextValue(context, "packageName", gate.scenario);
    const sourcePath = requiredContextValue(context, "sourcePath", gate.scenario);
    return [
      "This is the Phase 3 live gate for provider device selection and timeout profiles.",
      "Use the live Ambient/Pi provider path only.",
      `A generated Builder package named ${packageName} is available at sourcePath ${sourcePath}.`,
      "The descriptor health check simulates a local model cold start and deliberately includes an old unjustified --device cpu argument.",
      "Call ambient_capability_builder_validate with that sourcePath and includeSmokeTests=false.",
      "Do not use shell, bash, generic file tools, or raw test commands for this gate.",
      "Do not manually rewrite descriptor files or capability-build.json.",
      "After validation succeeds, reply with only the exact marker and no other text.",
      `Reply exactly ${gate.marker} only after the Builder validation tool has succeeded.`,
    ].join("\n");
  }
  if (gate.scenario === "provider-catalog-onboarding-e2e") {
    const packageName = requiredContextValue(context, "packageName", gate.scenario);
    const sourcePath = requiredContextValue(context, "sourcePath", gate.scenario);
    const staleInstalledPackageId = requiredContextValue(context, "staleInstalledPackageId", gate.scenario);
    const catalogDisplayName = requiredContextValue(context, "catalogDisplayName", gate.scenario);
    const registrationMarker = requiredContextValue(context, "registrationMarker", gate.scenario);
    return [
      "This is the Phase 4 live gate for end-to-end provider catalog onboarding.",
      "Use the live Ambient/Pi provider path only.",
      `Selected catalog entry: ${catalogDisplayName}.`,
      "Injected catalog contract: installerShape custom-cli, capabilityArea writing-style-transfer, provider TinyStyler, locality local, output artifacts json and txt.",
      "The package declares provider doctor/profile/transfer commands. The doctor and transfer paths use descriptor timeout profiles and MPS-preferred devicePolicy metadata.",
      `Generated Builder package name: ${packageName}`,
      `Canonical Builder sourcePath: ${sourcePath}`,
      `Stale installedPackageId recorded in metadata: ${staleInstalledPackageId}`,
      "This is not a secret-bearing path scenario: ordinary workspace paths must remain visible and usable as real paths.",
      "The packageName and sourcePath above are authoritative. Do not ask the user to restate them if a tool output uses an opaque, hidden, abbreviated, or display-only label.",
      `Step 1: call ambient_capability_builder_history with packageName exactly ${packageName} and confirm the generated source is marked registered while installed present is no. Use history as diagnostic context, not as the source of truth for identity.`,
      `Step 2: call ambient_capability_builder_repair_registration_metadata with sourcePath exactly ${sourcePath} and a reason that this is stale installed metadata recovery during provider catalog onboarding. If history display text is opaque or hidden, still continue with this exact sourcePath.`,
      `Step 3: call ambient_capability_builder_preview with sourcePath exactly ${sourcePath} and confirm installerShape custom-cli, TinyStyler provider metadata, commands tinystyler_doctor/tinystyler_profile/tinystyler_transfer, and artifacts json/txt.`,
      `Step 4: call ambient_capability_builder_validate with sourcePath exactly ${sourcePath} and includeSmokeTests=true.`,
      `Step 5: call ambient_capability_builder_register with sourcePath exactly ${sourcePath} after validation succeeds.`,
      "Do not use shell, bash, browser tools, generic file tools, manual JSON edits, ambient_cli_package_install, or ambient_cli_package_uninstall.",
      "Do not call ambient_cli in this turn; installed-use validation happens in a fresh turn after registration.",
      "Do not call any list-files tool in this gate. The seeded package is intentionally small, and uncontrolled file inventory dumps would fail this gate.",
      `After registration succeeds, reply exactly ${registrationMarker}.`,
    ].join("\n");
  }
  return [
    `This is ${gate.id}: ${gate.title}.`,
    "This gate is intentionally unavailable until its implementation phase is complete.",
    `Reply exactly ${gate.marker} only when the phase implementation installs this scenario.`,
  ].join("\n");
}

export function fixInstallsRedactionsInstalledUsePrompt(gate, context = {}) {
  if (gate.scenario !== "provider-catalog-onboarding-e2e") {
    throw new Error(`Installed-use prompt is only defined for provider-catalog-onboarding-e2e, got ${gate.scenario}.`);
  }
  const packageName = requiredContextValue(context, "packageName", gate.scenario);
  const commandName = requiredContextValue(context, "commandName", gate.scenario);
  const outputPath = requiredContextValue(context, "outputPath", gate.scenario);
  return [
    "This is the fresh installed-use turn for the Phase 4 provider catalog onboarding gate.",
    "Use the live Ambient/Pi provider path only.",
    `Call ambient_cli_search with query exactly TinyStyler writing-style transfer local provider.`,
    `Then call ambient_cli_describe with packageName ${packageName} and command ${commandName}.`,
    `Then call ambient_cli with packageName ${packageName}, command ${commandName}, and args ${JSON.stringify([
      "--source",
      "Gate text should stay legible while TinyStyler preserves concise style.",
      "--profile",
      "validation-artifacts/g4-profile.json",
      "--output",
      outputPath,
      "--device",
      "cpu",
    ])}.`,
    "Pass that args array exactly, including --device cpu. Do not remove, replace, or self-normalize the CPU argument.",
    "This gate verifies Desktop's deterministic devicePolicy boundary rewrites the unjustified CPU request to MPS without Pi doing the correction.",
    "If ambient_cli returns a preflight-description result instead of executing, retry ambient_cli once with the same packageName, command, and exact same args.",
    "Do not use shell, bash, browser tools, Capability Builder tools, generic file tools, manual JSON edits, or package install/uninstall tools.",
    `After ambient_cli executes successfully, reply exactly ${gate.marker}.`,
  ].join("\n");
}

export function newFixInstallsRedactionsReport(gate, input) {
  return {
    schemaVersion: "fix-installs-redactions-gate-v1",
    scenario: gate.scenario,
    gateId: gate.id,
    title: gate.title,
    marker: gate.marker,
    status: "running",
    startedAt: new Date().toISOString(),
    provider: input.provider,
    git: input.git,
    workspacePath: input.workspacePath,
    userDataPath: input.userDataPath,
    threadId: undefined,
    evidence: {
      agentBrowserCommands: [],
      screenshots: [],
      snapshots: [],
      toolNames: [],
      permissionRequests: [],
      permissionApprovals: [],
    },
    checks: {},
  };
}

function requiredContextValue(context, key, scenario) {
  const value = String(context?.[key] ?? "").trim();
  if (!value) throw new Error(`${scenario} gate prompt requires context.${key}.`);
  return value;
}
