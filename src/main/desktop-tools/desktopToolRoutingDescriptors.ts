import type { DesktopToolDescriptor, PiToolRegistrationFields } from "./desktopToolDescriptorTypes";
import {
  providerCapabilityAreas,
  providerInstallerShapes,
  providerLocalityOptions,
  providerPlatformOptions,
  providerSourcePreferenceOptions,
} from "./desktopToolsProviderFacade";

const ambientCapabilityRoutingGuidelines = [
  "For ambiguous install, add, use-this-package, setup, provider, MCP, Pi marketplace, or wrapper requests, call ambient_install_route_plan first before choosing MCP, Ambient CLI package install, Pi marketplace wrapper, privileged action, or shell setup.",
  "Capability routing order after route planning: first use built-in and installed Ambient capabilities, then installed Ambient CLI packages via ambient_cli_search, then reviewed Ambient CLI Pi marketplace wrappers, then generated Ambient wrappers through Capability Builder, then privileged Pi review/install only as an explicit exceptional path.",
  "When the user asks to create, build, add, install, wrap, or design a new capability, skill, tool, adapter, connector, artifact generator, model wrapper, API wrapper, or CLI package from a goal, URL, repo, package, model, binary, provider, or tool, use ambient_install_route_plan when the lane is not already known, then follow the selected route. Do not use unsupported plugin marketplace or local plugin install lanes.",
  "When the user wants chat voicing from an existing generated TTS/audio artifact package, route to ambient_capability_builder_repair_plan before validation or registration so it can be converted into installerShape tts-provider with voiceProvider metadata.",
  "Treat anything under .ambient/capability-builder/packages/ as Builder-managed source. Prefer Capability Builder preview, install_deps, validate, register, history, repair_plan, apply_repair, removal_plan, and unregister tools for that source; avoid generic Ambient CLI install/uninstall unless the user explicitly asks for generic package operations.",
  "When a Capability Builder tool returns a Canonical sourcePath, pass that exact sourcePath to later Capability Builder tools. Do not rename Builder folders with shell to resolve packageName/path confusion.",
  "Editing Builder-managed source does not update the installed Ambient CLI copy. After source edits or repairs, preview if package shape changed, validate successfully, then use ambient_capability_builder_register before testing the installed copy.",
  "Treat failed ambient_capability_builder_validate as a hard stop for registration/re-registration. Repair the source, preview if structure changed, validate again, and only register after validation succeeds.",
  "For commands that accept user text or produce user artifacts, preserve exact text including punctuation and quotes. Prefer file-input flags such as --text-file or --ref-text-file when argument fidelity is risky, and write final artifacts to user-visible workspace paths instead of leaving them only inside package internals.",
  "For installed Ambient CLI capabilities, ambient_cli_search is discovery only. After selecting a package from search, always call ambient_cli_describe before the first ambient_cli execution for that package in the thread. If ambient_cli is called first, Ambient Desktop returns a no-execute preflight description and marks the package described; read that preflight and retry ambient_cli only when execution is still appropriate.",
  "For pi.dev package URLs, prefer an Ambient-owned wrapper: ambient_cli_package_install_pi_catalog for reviewed adapters, or ambient_capability_builder_plan for generated wrappers. Do not recommend raw sandboxed Pi extension install as the normal path.",
  "Do not install agent skills by writing directly to ~/.agents/skills, ~/.codex/skills, or ~/.ambient/skills. Use ambient_cli_package_preview followed by ambient_cli_package_install for descriptor-backed skill packages so Ambient owns registration, permissions, and audit state.",
  "Never route first-party Ambient CLI adapters such as pi-arxiv or youtube-transcript through privileged Pi install.",
  "If a capability repair or install reaches a protected system path, service install, driver, package-manager privilege, or admin/sudo credential boundary, call ambient_privileged_action_request with a typed template instead of bash/sudo or asking the user to copy terminal commands.",
];

export const installRouteToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_install_route_plan",
    label: "Install Route Plan",
    description:
      "Classify an install-like request into the correct Ambient lane and return read-only evidence plus the exact next tool sequence.",
    promptSnippet:
      "ambient_install_route_plan: Read-only install routing for MCP, providers, Ambient CLI packages, Pi marketplace wrappers, privileged actions, and normal app setup.",
    promptGuidelines: [
      "Use this before choosing a lane for ambiguous install, add, setup, use-this-package, provider, MCP, Pi marketplace, wrapper, or privileged requests.",
      "This tool is read-only. It does not install, clone into durable state, run package code, write config, activate plugins, or expose secrets.",
      "For Pi marketplace packages, prefer Ambient-owned wrappers: curated wrappers via ambient_cli_package_install_pi_catalog, generated wrappers via ambient_capability_builder_plan, or privileged review/rejection for non-wrappable packages.",
      "Codex/Ambient plugin marketplace and local plugin installs are hidden until supported. If the route plan returns unsupported for that lane, do not call plugin install tools.",
      "After this tool returns a route, follow the listed nextTools and approvalBoundary instead of guessing another install path.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        userRequest: { type: "string", description: "The user's install-like request or a concise faithful restatement." },
        sourceUrl: { type: "string", description: "Optional package, repo, registry, marketplace, provider, or documentation URL." },
        localPath: { type: "string", description: "Optional local source path if the user pointed to a local package or directory." },
        packageName: { type: "string", description: "Optional package/provider/capability name if known." },
        requestedKind: {
          type: "string",
          enum: ["provider", "mcp", "pi-marketplace", "ambient-cli-package", "desktop-app", "unknown"],
          description: "Optional user-provided or source-derived kind hint. Use unknown when unsure.",
        },
        workspaceContext: {
          type: "object",
          properties: {
            cwd: { type: "string" },
            platform: { type: "string", enum: ["darwin", "linux", "win32"] },
          },
          additionalProperties: false,
        },
      },
      required: ["userRequest"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        lane: {
          type: "string",
          enum: [
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
          ],
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        reason: { type: "string" },
        evidence: { type: "array" },
        nextTools: { type: "array" },
        approvalBoundary: { type: "string" },
        blockers: { type: "array" },
        warnings: { type: "array" },
      },
      required: ["lane", "confidence", "reason", "evidence", "nextTools", "approvalBoundary", "blockers", "warnings"],
      additionalProperties: true,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "install-route-plan",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 8_000,
    runtimeSupport: ["chat"],
  },
];

export const providerCatalogToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_provider_catalog",
    label: "Ambient Provider Catalog",
    description: "Read known provider cards and recommendation guidance for capability/provider selection.",
    promptSnippet:
      "ambient_provider_catalog: Read known provider cards and recommendation guidance before choosing or onboarding providers.",
    promptGuidelines: [
      "Use ambient_provider_catalog when the user asks which provider to use, what providers Ambient knows about, or how to choose providers for voice, STT, search, scraping, retrieval, deep research, image/video/doc generation, social media, agentic services, or chat bridging.",
      "This is a read-only catalog of potential known providers, not the list of installed or active providers.",
      "Use installed-provider status tools for current state, such as ambient_voice_status, ambient_stt_status, web_research_status, ambient_cli_search, and ambient_cli_describe.",
      "For setup or onboarding after a catalog choice, use ambient_capability_builder_plan before scaffolding, installing dependencies, registering packages, or calling provider APIs.",
      "For cloud/API providers, use Ambient-managed secret flows. Never ask users to paste API keys into chat.",
      "This tool is read-only and allowed in Planner Mode; it does not write files, install dependencies, call provider APIs, read secret values, or mutate Ambient state.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        capabilityArea: {
          type: "string",
          enum: [...providerCapabilityAreas],
          description: "Optional capability area to filter provider cards.",
        },
        installerShape: {
          type: "string",
          enum: [...providerInstallerShapes],
          description: "Optional installer/tooling shape to filter provider cards.",
        },
        goal: { type: "string", description: "Optional free-text goal for a lightweight card search." },
        locality: {
          type: "string",
          enum: [...providerLocalityOptions],
          description: "Optional locality preference.",
        },
        sourcePreference: {
          type: "string",
          enum: [...providerSourcePreferenceOptions],
          description: "Optional open/closed source preference.",
        },
        platform: {
          type: "string",
          enum: [...providerPlatformOptions],
          description: "Optional target platform filter.",
        },
        includeExperimental: { type: "boolean", description: "Include experimental cards. Defaults to false." },
        includeNeedsResearch: { type: "boolean", description: "Include research-needed cards. Defaults to false." },
        limit: { type: "number", description: "Maximum provider cards to return, capped at 50." },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "provider-catalog-read",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat", "workflow"],
  },
];

export const privilegedActionToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_privileged_action_status",
    label: "Privileged Action Status",
    description: "Inspect the current privileged action adapter boundary and whether native privileged execution is available.",
    promptSnippet:
      "ambient_privileged_action_status: Inspect whether privileged action handoffs are dry-run only or backed by a selected native adapter.",
    promptGuidelines: [
      "Call this before ambient_privileged_action_request when you need to know whether Ambient can execute privileged actions or only record a dry-run handoff.",
      "If adapterStatus is not-implemented, report that privileged setup is review/dry-run only and do not imply a password prompt or command execution will happen.",
      "If adapterStatus is available and selectedAdapterExecutesPrivilegedCommands is true, explain that Ambient can execute structured privileged action templates after user approval and platform-appropriate credential or elevation handling.",
      "Read selectedAdapter and selectedAdapterExecutesPrivilegedCommands before describing what Ambient will do; selectedAdapter may be dry-run, an executing native adapter, or an unavailable platform stub.",
      "If policyPlanning is available, use policyHints to create a policy-checkable request.",
      "Use supportedPurposes to choose the closest typed purpose for ambient_privileged_action_request.",
      "Use policyHints to shape the request exactly for the current platform and action purpose.",
      "Treat allowedByPolicy=false policyHints as stop signs: explain the unavailable platform policy and return to non-privileged repair strategies instead of inventing commands.",
      "Never use this as permission to call shell/sudo/pkexec/doas or ask the user to copy admin commands into Terminal.",
    ],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "privileged-action-status",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 10_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "ambient_privileged_action_request",
    label: "Privileged Action Request",
    description: "Request an Ambient-owned privileged host action handoff using a typed, redacted template.",
    promptSnippet: "ambient_privileged_action_request: Stop at an admin/sudo boundary and hand Ambient a typed privileged action template.",
    promptGuidelines: [
      "Use this when capability install or repair diagnosis reaches a protected system path, service install, driver, package-manager privilege, or admin/sudo credential boundary.",
      "Try provider-local assets, documented path/env/config controls, workspace-local shims/caches, and non-privileged dependency plans first; this tool is for the remaining privileged boundary.",
      "Do not call bash/shell/sudo/pkexec/doas or ask the user to copy Terminal commands for privileged setup.",
      "Do not include real passwords, API keys, tokens, or secrets. If authentication is required, use only the credential sentinel {{AMBIENT_PRIVILEGED_AUTH}}.",
      "Commands must be structured templates: executable path plus args, with short rationales and concrete paths where known.",
      "Execution depends on ambient_privileged_action_status: dry-run records only; available native adapters execute structured templates after user approval and platform-appropriate credential or elevation handling.",
      "Read the returned nativeRequest/nativeResult fields as the future adapter boundary; they are redacted and JSON-safe for IPC/native helper plumbing.",
      "Use rehearseCredentialPrompt=true only when explicitly dogfooding the UI credential flow; Ambient will discard the credential and still execute no privileged command.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["privileged_action_template"], description: "Must be privileged_action_template." },
        purpose: {
          type: "string",
          enum: [
            "create_system_symlink",
            "install_system_package",
            "register_service",
            "install_driver",
            "repair_protected_path",
            "other_privileged_setup",
          ],
          description: "Typed action category. Use the closest category instead of inventing a new purpose.",
        },
        packageName: { type: "string", description: "Capability/package this privileged action supports, if any." },
        reason: { type: "string", description: "Why non-privileged repair options are insufficient." },
        platform: {
          type: "string",
          enum: ["any", "darwin", "linux", "win32"],
          description: "Target platform for this template. Defaults to any.",
        },
        credential: {
          type: "string",
          enum: ["{{AMBIENT_PRIVILEGED_AUTH}}"],
          description: "Optional ephemeral credential sentinel. Never pass an actual credential.",
        },
        rehearseCredentialPrompt: {
          type: "boolean",
          description:
            "Optional UI rehearsal. When true with the credential sentinel, Ambient asks for a one-shot credential and discards it without executing commands.",
        },
        commands: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              exe: { type: "string", description: "Executable path or binary name. Shell/sudo wrappers are rejected." },
              args: {
                type: "array",
                items: { type: "string" },
                description: "Argument vector. Secrets are redacted from Ambient/Pi-visible output.",
              },
              cwd: { type: "string", description: "Optional working directory." },
              rationale: { type: "string", description: "Why this specific command is needed." },
            },
            required: ["exe"],
            additionalProperties: false,
          },
        },
      },
      required: ["kind", "purpose", "reason", "commands"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "run-process",
    permissionScope: "privileged-action",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 30_000,
    runtimeSupport: ["chat"],
  },
];

export function providerCatalogToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = providerCatalogToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown provider catalog tool descriptor: ${name}`);
  return descriptor;
}

export function installRouteToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = installRouteToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown install route tool descriptor: ${name}`);
  return descriptor;
}

export function privilegedActionToolDescriptor(name: string): DesktopToolDescriptor {
  const descriptor = privilegedActionToolDescriptors.find((tool) => tool.name === name);
  if (!descriptor) throw new Error(`Unknown privileged action tool descriptor: ${name}`);
  return descriptor;
}

export function piToolFieldsFromDescriptor(descriptor: DesktopToolDescriptor): PiToolRegistrationFields {
  const promptGuidelines =
    descriptor.source === "first-party" && usesAmbientCapabilityRoutingContract(descriptor.name)
      ? [...ambientCapabilityRoutingGuidelines, ...descriptor.promptGuidelines]
      : descriptor.promptGuidelines;
  return {
    name: descriptor.name,
    label: descriptor.label,
    description: descriptor.description,
    promptSnippet: descriptor.promptSnippet,
    promptGuidelines,
    parameters: descriptor.inputSchema,
  };
}

function usesAmbientCapabilityRoutingContract(name: string): boolean {
  return (
    name === "ambient_install_route_plan" ||
    name.startsWith("ambient_cli") ||
    name.startsWith("ambient_mcp") ||
    name.startsWith("ambient_pi_")
  );
}
