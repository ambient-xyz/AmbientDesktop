import { z } from "zod";

export const ambientInstallRouteLaneSchema = z.enum([
  "installed-capability",
  "provider-capability-builder",
  "ambient-cli-package",
  "pi-marketplace-curated-wrapper",
  "pi-marketplace-generated-wrapper",
  "pi-marketplace-privileged-review",
  "mcp-autowire",
  "normal-app-setup",
  "privileged-action",
  "unsupported",
  "needs-clarification",
]);

export type AmbientInstallRouteLane = z.infer<typeof ambientInstallRouteLaneSchema>;

const ambientInstallRouteRequestedKindSchema = z.enum([
  "provider",
  "mcp",
  "pi-marketplace",
  "ambient-cli-package",
  "desktop-app",
  "unknown",
]);

export const ambientInstallRoutePlanInputSchema = z.object({
  userRequest: z.string().min(1),
  sourceUrl: z.string().min(1).optional(),
  localPath: z.string().min(1).optional(),
  packageName: z.string().min(1).optional(),
  requestedKind: ambientInstallRouteRequestedKindSchema.optional(),
  workspaceContext: z
    .object({
      cwd: z.string().min(1).optional(),
      platform: z.enum(["darwin", "linux", "win32"]).optional(),
    })
    .optional(),
});

export type AmbientInstallRoutePlanInput = z.infer<typeof ambientInstallRoutePlanInputSchema>;

const ambientInstallRouteEvidenceKindSchema = z.enum([
  "url",
  "manifest",
  "registry-hit",
  "existing-capability",
  "provider-card",
  "source-scan",
  "user-intent",
  "platform",
]);

const ambientInstallRouteApprovalBoundarySchema = z.enum([
  "none-readonly",
  "user-approval-before-write",
  "user-approval-before-execute",
  "privileged-approval-required",
]);

const ambientInstallRouteValidationTargetSchema = z.enum([
  "route-only",
  "health-check",
  "tool-smoke",
  "provider-smoke",
  "app-launch",
]);

export const ambientInstallRoutePlanSchema = z.object({
  lane: ambientInstallRouteLaneSchema,
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
  evidence: z.array(z.object({ kind: ambientInstallRouteEvidenceKindSchema, summary: z.string().min(1) })),
  nextTools: z.array(
    z.object({
      name: z.string().min(1),
      purpose: z.string().min(1),
      requiredBefore: z.array(z.string().min(1)).optional(),
    }),
  ),
  approvalBoundary: ambientInstallRouteApprovalBoundarySchema,
  secretHandling: z
    .object({
      requiresSecret: z.boolean(),
      allowedMechanism: z.enum(["ambient_capability_builder_secret_request", "ambient_cli_secret_request", "ambient_cli_env_bind", "none"]).optional(),
      warning: z.string().min(1).optional(),
    })
    .optional(),
  validationTarget: z
    .object({
      kind: ambientInstallRouteValidationTargetSchema,
      description: z.string().min(1),
    })
    .optional(),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type AmbientInstallRoutePlan = z.infer<typeof ambientInstallRoutePlanSchema>;

export interface AmbientInstallRouteSummary {
  kind: "ambient-install-route-summary";
  lane: AmbientInstallRouteLane;
  confidence: AmbientInstallRoutePlan["confidence"];
  reason: string;
  approvalBoundary: AmbientInstallRoutePlan["approvalBoundary"];
  nextTools: string[];
  blockers: string[];
  warnings: string[];
  secretHandling?: AmbientInstallRoutePlan["secretHandling"];
  validationTarget?: AmbientInstallRoutePlan["validationTarget"];
}

export interface AmbientInstallRouteTelemetry {
  kind: "ambient-install-route-telemetry";
  lane: AmbientInstallRouteLane;
  confidence: AmbientInstallRoutePlan["confidence"];
  approvalBoundary: AmbientInstallRoutePlan["approvalBoundary"];
  selectedNextTool?: string;
  nextToolCount: number;
  blockerCount: number;
  warningCount: number;
  requiresSecret: boolean;
  secretMechanism?: NonNullable<AmbientInstallRoutePlan["secretHandling"]>["allowedMechanism"];
  validationKind?: NonNullable<AmbientInstallRoutePlan["validationTarget"]>["kind"];
  status: "planned" | "completed" | "failed";
}

export interface AmbientInstallRoutePlannerContext {
  installedAmbientCliPackages?: Array<{ name: string; commands?: string[]; skills?: string[] }>;
  localSourceKinds?: Record<string, "ambient-cli-package" | "codex-plugin" | "unknown">;
}

const curatedPiWrapperPackages = [
  {
    packageName: "pi-arxiv",
    matches: ["pi-arxiv", "arxiv", "https://pi.dev/packages/pi-arxiv"],
  },
  {
    packageName: "youtube-transcript",
    matches: ["youtube-transcript", "badlogic/pi-skills/blob/main/youtube-transcript", "youtube transcript"],
  },
  {
    packageName: "brave-search",
    matches: ["brave-search", "brave search pi skill", "badlogic/pi-skills/blob/main/brave-search"],
  },
];

const knownCloudProviderSignals = [
  { provider: "Brave Search", terms: ["brave search", "brave api", "brave"], envName: "BRAVE_API_KEY" },
  { provider: "ElevenLabs", terms: ["elevenlabs", "eleven labs"], envName: "ELEVENLABS_API_KEY" },
  { provider: "Cartesia", terms: ["cartesia"], envName: "CARTESIA_API_KEY" },
];

const knownLocalProviderSignals = [
  { provider: "SearXNG", terms: ["searxng", "searx"] },
  { provider: "Piper TTS", terms: ["piper tts", "piper voice", "piper"] },
  { provider: "Kokoro ONNX", terms: ["kokoro", "kokoro onnx"] },
];

export function ambientInstallRoutePlanInput(raw: unknown): AmbientInstallRoutePlanInput {
  return ambientInstallRoutePlanInputSchema.parse(raw);
}

export function planAmbientInstallRoute(input: AmbientInstallRoutePlanInput, context: AmbientInstallRoutePlannerContext = {}): AmbientInstallRoutePlan {
  const text = normalizedText(input);
  const evidence = baseEvidence(input);

  const installed = shouldPreferInstalledCapability(input, text) ? findInstalledCapability(text, context) : undefined;
  if (installed) {
    return validatePlan({
      lane: "installed-capability",
      confidence: "high",
      reason: `The request appears to target installed Ambient CLI package "${installed.name}".`,
      evidence: [...evidence, { kind: "existing-capability", summary: `Installed Ambient CLI package matched: ${installed.name}.` }],
      nextTools: [
        { name: "ambient_cli_search", purpose: "Find the installed package and relevant command." },
        { name: "ambient_cli_describe", purpose: "Inspect the selected package contract before first execution.", requiredBefore: ["ambient_cli"] },
        { name: "ambient_cli", purpose: "Run the described command if still appropriate." },
      ],
      approvalBoundary: "none-readonly",
      validationTarget: { kind: "tool-smoke", description: "Describe and run a tiny mediated Ambient CLI command only after the package contract is loaded." },
      blockers: [],
      warnings: [],
    });
  }

  if (isHiddenPluginInstall(text, input, context)) {
    return validatePlan({
      lane: "unsupported",
      confidence: "high",
      reason: "Codex/Ambient plugin marketplace and local plugin installs are intentionally hidden until this product surface is supported.",
      evidence: [...evidence, { kind: "user-intent", summary: "Request matches deprecated plugin marketplace or local plugin install language." }],
      nextTools: [],
      approvalBoundary: "none-readonly",
      validationTarget: { kind: "route-only", description: "Refuse the unsupported plugin install route; do not call plugin install tools." },
      blockers: ["Plugin marketplace and local plugin installs are not currently supported as active install routes."],
      warnings: ["Do not call ambient_plugin_install_preview, ambient_plugin_install_commit, or ambient_plugin_activate for this request."],
    });
  }

  if (isPrivilegedAction(text)) {
    return validatePlan({
      lane: "privileged-action",
      confidence: "high",
      reason: "The request reaches a protected system path, service, driver, daemon, or admin boundary.",
      evidence: [...evidence, { kind: "user-intent", summary: "Request contains privileged system setup language." }],
      nextTools: [{ name: "ambient_privileged_action_request", purpose: "Prepare a typed privileged action template for explicit user approval." }],
      approvalBoundary: "privileged-approval-required",
      validationTarget: { kind: "route-only", description: "Confirm the privileged template boundary without emitting sudo or credential instructions in chat." },
      blockers: [],
      warnings: ["Do not provide sudo commands, manual credential instructions, or shell snippets that mutate protected system state."],
    });
  }

  if (isPiMarketplace(text, input)) {
    const curated = findCuratedPiWrapper(text);
    if (curated) {
      return validatePlan({
        lane: "pi-marketplace-curated-wrapper",
        confidence: "high",
        reason: `The Pi marketplace source has a reviewed Ambient wrapper for "${curated.packageName}".`,
        evidence: [...evidence, { kind: "registry-hit", summary: `Curated Ambient wrapper matched: ${curated.packageName}.` }],
        nextTools: [
          { name: "ambient_cli_package_install_pi_catalog", purpose: "Install the reviewed Pi catalog package as an Ambient CLI wrapper." },
          { name: "ambient_cli_search", purpose: "Find the installed wrapper command after install." },
          { name: "ambient_cli_describe", purpose: "Inspect the wrapper contract before first execution.", requiredBefore: ["ambient_cli"] },
        ],
        approvalBoundary: "user-approval-before-write",
        validationTarget: { kind: "tool-smoke", description: "Run a tiny command through the installed Ambient CLI wrapper after describe." },
        blockers: [],
        warnings: ["Do not route this source through sandboxed or privileged raw Pi extension install."],
      });
    }
    if (requiresPiPrivilegedReview(text)) {
      return validatePlan({
        lane: "pi-marketplace-privileged-review",
        confidence: "high",
        reason: "The Pi package appears to require lifecycle hooks, broad filesystem/process access, startup mutation, or another privileged behavior.",
        evidence: [...evidence, { kind: "source-scan", summary: "Request language indicates behavior that cannot be safely exposed as a normal Ambient wrapper." }],
        nextTools: [{ name: "ambient_pi_privileged_scan", purpose: "Run a static privileged review before any privileged install decision." }],
        approvalBoundary: "privileged-approval-required",
        validationTarget: { kind: "route-only", description: "Scan or reject the privileged Pi package; do not silently activate it." },
        blockers: [],
        warnings: ["Raw sandboxed Pi extension install is not the normal route. Prefer rejection unless the privileged behavior is product-supported and approved."],
      });
    }
    return validatePlan({
      lane: "pi-marketplace-generated-wrapper",
      confidence: "medium",
      reason: "The request targets a Pi marketplace package without a known curated wrapper, so Ambient should inspect whether it can generate a permissioned wrapper.",
      evidence: [...evidence, { kind: "url", summary: "Pi marketplace source detected without a curated wrapper match." }],
      nextTools: [{ name: "ambient_capability_builder_plan", purpose: "Plan an Ambient-owned wrapper package without executing upstream extension code." }],
      approvalBoundary: "user-approval-before-write",
      validationTarget: { kind: "health-check", description: "Preview, validate, register, then live-test the generated wrapper from a fresh Pi turn." },
      blockers: [],
      warnings: ["Do not execute raw upstream Pi extension code. If wrapper inspection finds hooks or broad host access, reroute to privileged review or unsupported."],
    });
  }

  if (isMcpSource(text, input)) {
    return validatePlan({
      lane: "mcp-autowire",
      confidence: "high",
      reason: "The source looks like an MCP server, MCP registry entry, remote MCP endpoint, or local-app bridge candidate.",
      evidence: [...evidence, { kind: "user-intent", summary: "MCP source or Model Context Protocol language detected." }],
      nextTools: [{ name: "ambient_mcp_autowire_plan", purpose: "Delegate install-lane classification to the MCP autowire schema and permission profile flow." }],
      approvalBoundary: "none-readonly",
      validationTarget: { kind: "route-only", description: "Use MCP autowire output to choose ToolHive, remote MCP, package import, guided bridge, CLI wrapper, or normal app setup." },
      blockers: [],
      warnings: ["Do not duplicate MCP lane classification inside the install route planner."],
    });
  }

  const provider = providerSignal(text, input);
  if (provider) {
    return validatePlan({
      lane: "provider-capability-builder",
      confidence: provider.confidence,
      reason: `The request matches ${provider.provider} provider onboarding or a typed provider capability setup.`,
      evidence: [...evidence, { kind: "provider-card", summary: `Provider signal: ${provider.provider}.` }],
      nextTools: [
        { name: "ambient_provider_catalog", purpose: "Read provider card defaults and operational caveats." },
        { name: "ambient_capability_builder_plan", purpose: "Plan the provider capability package using catalog defaults." },
      ],
      approvalBoundary: "user-approval-before-write",
      secretHandling: provider.envName
        ? {
            requiresSecret: true,
            allowedMechanism: "ambient_capability_builder_secret_request",
            warning: `If validation requires ${provider.envName}, request it through Ambient-managed secret entry. Never ask for the value in chat.`,
          }
        : { requiresSecret: false, allowedMechanism: "none" },
      validationTarget: { kind: "provider-smoke", description: "Run the smallest live provider validation after Builder preview, secrets, validation, and registration." },
      blockers: [],
      warnings: ["Do not detour through MCP or generic package installation unless the provider card or user explicitly asks for that lane."],
    });
  }

  if (isAmbientCliPackage(text, input, context)) {
    return validatePlan({
      lane: "ambient-cli-package",
      confidence: "high",
      reason: "The source appears to be a descriptor-backed Ambient CLI package.",
      evidence: [...evidence, { kind: "manifest", summary: "Ambient CLI package source or descriptor language detected." }],
      nextTools: [
        { name: "ambient_cli_package_preview", purpose: "Preview manifest, declared commands, health checks, and installability without executing package code." },
        { name: "ambient_cli_package_install", purpose: "Install only after preview confirms a descriptor-backed package and the user approves.", requiredBefore: ["ambient_cli_search"] },
        { name: "ambient_cli_search", purpose: "Find installed package commands after install." },
        { name: "ambient_cli_describe", purpose: "Inspect command contract before first execution.", requiredBefore: ["ambient_cli"] },
      ],
      approvalBoundary: "user-approval-before-write",
      validationTarget: { kind: "health-check", description: "Run declared health checks or a tiny mediated command after install and describe." },
      blockers: [],
      warnings: ["Do not install bare SKILL.md content without a descriptor or reviewed descriptor overlay."],
    });
  }

  if (isNormalAppSetup(text, input)) {
    return validatePlan({
      lane: "normal-app-setup",
      confidence: "medium",
      reason: "The request appears to be ordinary local application, runtime, or package setup rather than an Ambient capability install.",
      evidence: [...evidence, { kind: "user-intent", summary: "Normal app/runtime setup language detected." }],
      nextTools: [
        { name: "ambient_setup_runtime_preflight", purpose: "Inspect host runtime, package manager, architecture, and setup constraints before shell commands." },
        { name: "ambient_setup_recipe_describe", purpose: "Use a typed setup recipe when one exists for the requested package or runtime." },
      ],
      approvalBoundary: "user-approval-before-execute",
      validationTarget: { kind: "app-launch", description: "Run a narrow version, health, or launch check after setup." },
      blockers: [],
      warnings: ["Do not convert this into an Ambient capability unless the user explicitly asks to wrap or expose it as one."],
    });
  }

  return validatePlan({
    lane: "needs-clarification",
    confidence: "low",
    reason: "The install request does not provide enough source or intent detail to choose a safe install lane.",
    evidence,
    nextTools: [{ name: "ambient_install_route_plan", purpose: "Retry with sourceUrl, localPath, packageName, or requestedKind after asking one targeted question." }],
    approvalBoundary: "none-readonly",
    validationTarget: { kind: "route-only", description: "Ask one targeted clarification before any install side effects." },
    blockers: ["Install source or intended capability kind is unclear."],
    warnings: [],
  });
}

export function ambientInstallRoutePlanText(plan: AmbientInstallRoutePlan): string {
  const lines = [
    "Ambient install route plan",
    `Lane: ${plan.lane}`,
    `Confidence: ${plan.confidence}`,
    `Reason: ${plan.reason}`,
    "",
    "Evidence:",
    ...listOrNone(plan.evidence.map((item) => `- ${item.kind}: ${item.summary}`)),
    "",
    "Next tools:",
    ...listOrNone(plan.nextTools.map((item) => `- ${item.name}: ${item.purpose}${item.requiredBefore?.length ? ` Required before: ${item.requiredBefore.join(", ")}` : ""}`)),
    "",
    `Approval boundary: ${plan.approvalBoundary}`,
    plan.secretHandling
      ? `Secret handling: ${plan.secretHandling.requiresSecret ? "requires Ambient-managed secret flow" : "no secret expected"}${plan.secretHandling.allowedMechanism ? ` (${plan.secretHandling.allowedMechanism})` : ""}${plan.secretHandling.warning ? `. ${plan.secretHandling.warning}` : ""}`
      : undefined,
    plan.validationTarget ? `Validation target: ${plan.validationTarget.kind} - ${plan.validationTarget.description}` : undefined,
    plan.blockers.length ? "" : undefined,
    plan.blockers.length ? "Blockers:" : undefined,
    ...plan.blockers.map((item) => `- ${item}`),
    plan.warnings.length ? "" : undefined,
    plan.warnings.length ? "Warnings:" : undefined,
    ...plan.warnings.map((item) => `- ${item}`),
  ].filter((line) => line !== undefined);
  return lines.join("\n");
}

export function ambientInstallRouteSummary(plan: AmbientInstallRoutePlan): AmbientInstallRouteSummary {
  return {
    kind: "ambient-install-route-summary",
    lane: plan.lane,
    confidence: plan.confidence,
    reason: plan.reason,
    approvalBoundary: plan.approvalBoundary,
    nextTools: plan.nextTools.map((tool) => tool.name),
    blockers: [...plan.blockers],
    warnings: [...plan.warnings],
    ...(plan.secretHandling ? { secretHandling: plan.secretHandling } : {}),
    ...(plan.validationTarget ? { validationTarget: plan.validationTarget } : {}),
  };
}

export function ambientInstallRouteTelemetry(
  plan: AmbientInstallRoutePlan,
  status: AmbientInstallRouteTelemetry["status"] = "planned",
): AmbientInstallRouteTelemetry {
  return {
    kind: "ambient-install-route-telemetry",
    lane: plan.lane,
    confidence: plan.confidence,
    approvalBoundary: plan.approvalBoundary,
    ...(plan.nextTools[0]?.name ? { selectedNextTool: plan.nextTools[0].name } : {}),
    nextToolCount: plan.nextTools.length,
    blockerCount: plan.blockers.length,
    warningCount: plan.warnings.length,
    requiresSecret: plan.secretHandling?.requiresSecret === true,
    ...(plan.secretHandling?.allowedMechanism ? { secretMechanism: plan.secretHandling.allowedMechanism } : {}),
    ...(plan.validationTarget?.kind ? { validationKind: plan.validationTarget.kind } : {}),
    status,
  };
}

function validatePlan(plan: AmbientInstallRoutePlan): AmbientInstallRoutePlan {
  return ambientInstallRoutePlanSchema.parse(plan);
}

function normalizedText(input: AmbientInstallRoutePlanInput): string {
  return [input.userRequest, input.sourceUrl, input.localPath, input.packageName, input.requestedKind].filter(Boolean).join(" ").toLowerCase();
}

function baseEvidence(input: AmbientInstallRoutePlanInput): AmbientInstallRoutePlan["evidence"] {
  const evidence: AmbientInstallRoutePlan["evidence"] = [{ kind: "user-intent", summary: truncate(input.userRequest) }];
  if (input.sourceUrl) evidence.push({ kind: "url", summary: input.sourceUrl });
  if (input.localPath) evidence.push({ kind: "manifest", summary: `Local path provided: ${input.localPath}.` });
  if (input.packageName) evidence.push({ kind: "registry-hit", summary: `Package name provided: ${input.packageName}.` });
  if (input.workspaceContext?.platform) evidence.push({ kind: "platform", summary: `Host platform: ${input.workspaceContext.platform}.` });
  return evidence;
}

function findInstalledCapability(text: string, context: AmbientInstallRoutePlannerContext): { name: string } | undefined {
  const packages = context.installedAmbientCliPackages ?? [];
  return packages.find((pkg) => textIncludesToken(text, pkg.name) || (pkg.commands ?? []).some((command) => textIncludesToken(text, command)));
}

function shouldPreferInstalledCapability(input: AmbientInstallRoutePlanInput, text: string): boolean {
  if (input.sourceUrl || input.localPath || input.requestedKind) return false;
  return !/\b(install|add|set up|setup|wrap|adapt|wire up|configure|onboard)\b/.test(text);
}

function isHiddenPluginInstall(text: string, input: AmbientInstallRoutePlanInput, context: AmbientInstallRoutePlannerContext): boolean {
  if (input.localPath && context.localSourceKinds?.[input.localPath] === "codex-plugin") return true;
  return /\b(codex|ambient)\s+plugin\b/.test(text) ||
    /\bplugin\s+(marketplace|install|activation|activate)\b/.test(text) ||
    text.includes(".codex-plugin") ||
    text.includes("marketplace.json") ||
    text.includes("ambient_plugin_install");
}

function isPrivilegedAction(text: string): boolean {
  return /\b(launch\s*daemon|kernel\s*(extension|driver)|system\s*(driver|daemon|service)|protected\s+system|admin\s+rights|administrator|root-owned|sudo)\b/.test(text) ||
    /\b(create|install|write|symlink).{0,40}(\/library\/launchdaemons|\/system|\/usr\/bin|\/usr\/sbin|\/etc)(\/|\s|$)/.test(text);
}

function isPiMarketplace(text: string, input: AmbientInstallRoutePlanInput): boolean {
  return input.requestedKind === "pi-marketplace" ||
    text.includes("pi.dev/packages") ||
    /\bpi\s+(marketplace|catalog|package|skill|extension)\b/.test(text) ||
    /\bwrap.{0,30}\bpi\b/.test(text) ||
    /\badapt.{0,30}\bpi\b/.test(text);
}

function findCuratedPiWrapper(text: string): { packageName: string } | undefined {
  return curatedPiWrapperPackages.find((pkg) => pkg.matches.some((match) => text.includes(match.toLowerCase())));
}

function requiresPiPrivilegedReview(text: string): boolean {
  return /\b(lifecycle\s+hooks?|startup|mutat(e|es|ing).{0,30}(pi settings|global|shell config|host)|unrestricted|broad\s+(filesystem|process)|raw\s+process|background\s+service|daemon)\b/.test(text);
}

function isMcpSource(text: string, input: AmbientInstallRoutePlanInput): boolean {
  return input.requestedKind === "mcp" ||
    /\bmcp\b/.test(text) ||
    text.includes("model context protocol") ||
    text.includes("server.json") ||
    text.includes("context7") ||
    /\blocal\s+bridge\b/.test(text);
}

function providerSignal(
  text: string,
  input: AmbientInstallRoutePlanInput,
): { provider: string; confidence: "high" | "medium"; envName?: string } | undefined {
  if (input.requestedKind === "provider") {
    const cloud = knownCloudProviderSignals.find((provider) => provider.terms.some((term) => text.includes(term)));
    if (cloud) return { provider: cloud.provider, confidence: "high", envName: cloud.envName };
    const local = knownLocalProviderSignals.find((provider) => provider.terms.some((term) => text.includes(term)));
    if (local) return { provider: local.provider, confidence: "high" };
    return { provider: "custom provider", confidence: "medium" };
  }
  const cloud = knownCloudProviderSignals.find((provider) => provider.terms.some((term) => text.includes(term)));
  if (cloud && providerSetupLanguage(text)) return { provider: cloud.provider, confidence: "high", envName: cloud.envName };
  const local = knownLocalProviderSignals.find((provider) => provider.terms.some((term) => text.includes(term)));
  if (local && providerSetupLanguage(text)) return { provider: local.provider, confidence: "high" };
  if (/\b(search|tts|voice|stt|scraping|retrieval|deep research|model)\s+provider\b/.test(text)) return { provider: "typed provider", confidence: "medium" };
  return undefined;
}

function providerSetupLanguage(text: string): boolean {
  return /\b(add|install|set up|setup|use|configure|onboard|provider|voice|tts|search)\b/.test(text);
}

function isAmbientCliPackage(text: string, input: AmbientInstallRoutePlanInput, context: AmbientInstallRoutePlannerContext): boolean {
  if (input.requestedKind === "ambient-cli-package") return true;
  if (input.localPath && context.localSourceKinds?.[input.localPath] === "ambient-cli-package") return true;
  return text.includes("ambient-cli.json") ||
    text.includes("ambient cli package") ||
    text.includes("descriptor-backed") ||
    /\binstall.{0,40}\bambient\s+cli\b/.test(text);
}

function isNormalAppSetup(text: string, input: AmbientInstallRoutePlanInput): boolean {
  if (input.requestedKind === "desktop-app") return true;
  return /\b(install|set up|setup|configure)\b/.test(text) &&
    /\b(ffmpeg|uv|node|python|ghidra|docker|podman|homebrew|brew|runtime|toolchain|desktop app|local app)\b/.test(text);
}

function textIncludesToken(text: string, token: string): boolean {
  const normalized = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${normalized}([^a-z0-9]|$)`).test(text);
}

function truncate(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}...`;
}

function listOrNone(items: string[]): string[] {
  return items.length ? items : ["- none"];
}
