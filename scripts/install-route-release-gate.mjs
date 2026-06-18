import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

const files = {
  packageJson: read("package.json"),
  planner: read("src/main/install-route/installRoutePlanner.ts"),
  plannerTest: read("src/main/install-route/installRoutePlanner.test.ts"),
  matrixTest: read("src/main/install-route/installRoutePlannerMatrix.test.ts"),
  liveTest: read("src/main/install-route/installRoutePlanner.live.test.ts"),
  router: read("src/main/ambient/ambientToolRouter.ts"),
  registry: read("src/main/desktop-tools/desktopToolRegistry.ts"),
  agentRuntime: read("src/main/agent-runtime/agentRuntime.ts"),
  installReadOnlyTools: read("src/main/plugins/runtime-tools/agentRuntimePluginInstallReadOnlyTools.ts"),
  rendererModel: read("src/renderer/src/toolMessageUiModel.ts"),
};

const checks = [
  [
    "route planner tool is registered and exposed as a direct active tool",
    files.registry.includes('name: "ambient_install_route_plan"') &&
      files.installReadOnlyTools.includes('toolName: "ambient_install_route_plan"'),
  ],
  [
    "route planner emits redacted summary and telemetry metadata",
    files.planner.includes("ambientInstallRouteSummary") &&
      files.planner.includes("ambientInstallRouteTelemetry") &&
      files.installReadOnlyTools.includes("installRouteSummary") &&
      files.installReadOnlyTools.includes("installRouteTelemetry"),
  ],
  [
    "renderer has a dedicated install route transcript preview",
    files.rendererModel.includes("ToolInstallRoutePreviewData") &&
      files.rendererModel.includes("extractInstallRoutePreview"),
  ],
  [
    "unsupported plugin installs are classified as unsupported",
    files.planner.includes("Codex/Ambient plugin marketplace and local plugin installs are intentionally hidden") &&
      files.plannerTest.includes("hidden Codex plugin") &&
      files.plannerTest.includes("hidden local plugin") &&
      files.plannerTest.includes("hidden ambient plugin direct tool"),
  ],
  [
    "plugin and raw sandboxed Pi extension tools are hidden from generic routing",
    files.router.includes('name.startsWith("ambient_plugin_")') &&
      files.router.includes('name === "ambient_pi_extension_install_sandboxed"'),
  ],
  [
    "curated Pi wrappers include at least three real reviewed wrappers",
    ["pi-arxiv", "youtube-transcript", "brave-search"].every((name) => files.planner.includes(name)),
  ],
  [
    "generated Pi wrappers have real Capability Builder install smoke coverage",
    countMatches(files.matrixTest, /ambient-generated-pi-/g) >= 3 &&
      files.matrixTest.includes("scaffoldCapabilityBuilderPackage") &&
      files.matrixTest.includes("validateCapabilityBuilderPackage") &&
      files.matrixTest.includes("registerCapabilityBuilderPackage") &&
      files.matrixTest.includes("runAmbientCliPackageCommand"),
  ],
  [
    "live categorization covers at least three hidden plugin refusal prompts",
    countMatches(files.liveTest, /hidden-plugin-/g) >= 3,
  ],
  [
    "deterministic corpus covers active source areas and refusal paths",
    countMatches(files.plannerTest, /expectedLane:/g) >= 45 &&
      files.plannerTest.includes('"mcp-autowire"') &&
      files.plannerTest.includes('"provider-capability-builder"') &&
      files.plannerTest.includes('"privileged-action"') &&
      files.plannerTest.includes('"unsupported"'),
  ],
  [
    "package scripts expose local and live install route gates",
    files.packageJson.includes('"test:install-route"') &&
      files.packageJson.includes('"test:install-route:live"') &&
      files.packageJson.includes('"test:install-route:gate"'),
  ],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

if (failed.length) {
  console.error(`\nInstall route release gate failed ${failed.length} check(s).`);
  process.exit(1);
}

console.log("\nInstall route release gate passed.");

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}
