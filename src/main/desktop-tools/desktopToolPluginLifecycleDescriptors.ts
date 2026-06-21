import type { DesktopToolDescriptor } from "./desktopToolDescriptorTypes";

export const pluginLifecycleToolDescriptors: DesktopToolDescriptor[] = [
  {
    name: "ambient_plugin_install_preview",
    label: "Plugin Install Preview",
    description: "Inspect a Codex plugin marketplace source and summarize install candidates without installing anything.",
    promptSnippet: "ambient_plugin_install_preview: Preview installable Codex plugins from a marketplace source URL or local path.",
    promptGuidelines: [
      "Use ambient_plugin_install_preview when the user asks Ambient to install a plugin from a URL or local marketplace reference.",
      "This tool is read-only: it inspects marketplace metadata and does not install, enable, trust, or run plugin code.",
      "After previewing, summarize candidates, risks, missing pins, dependencies, and whether a separate install approval would be needed.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Marketplace source to inspect. Supports local marketplace paths, marketplace URLs, GitHub marketplace URLs, or owner/repo shorthand.",
        },
        name: { type: "string", description: "Optional display label for this source." },
      },
      required: ["source"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "read-external",
    permissionScope: "plugin-install-preview",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 30_000,
  },
  {
    name: "ambient_plugin_install_commit",
    label: "Plugin Install Commit",
    description: "Install one selected pinned Git-backed Codex plugin candidate from a previewed marketplace source after approval.",
    promptSnippet:
      "ambient_plugin_install_commit: With explicit approval, install one pinned Git-backed Codex plugin from a marketplace source URL or local path.",
    promptGuidelines: [
      "Use ambient_plugin_install_commit only after previewing and selecting a specific installable Codex plugin candidate.",
      "This tool writes Ambient-owned local plugin import state, clones the selected Git source, and resets stale plugin MCP runtimes.",
      "It does not enable the plugin, trust plugin MCP tools, install plugin dependencies, or run plugin code; those remain separate steps.",
      "Do not use this tool in Planner Mode.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Marketplace source to install from. Supports local marketplace paths, marketplace URLs, GitHub marketplace URLs, or owner/repo shorthand.",
        },
        name: { type: "string", description: "Optional display label for this source." },
        pluginId: { type: "string", description: "Exact candidate id from ambient_plugin_install_preview. Required when the source has multiple candidates." },
        pluginName: { type: "string", description: "Candidate name or display name from ambient_plugin_install_preview." },
      },
      required: ["source"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "run-process",
    permissionScope: "plugin-install",
    supportsDryRun: false,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 120_000,
  },
  {
    name: "ambient_plugin_activate",
    label: "Plugin Activate",
    description: "Enable an installed Codex plugin and optionally install its declared dependencies after approval.",
    promptSnippet:
      "ambient_plugin_activate: With explicit approval, activate an installed Codex plugin; optionally install declared dependencies first.",
    promptGuidelines: [
      "Use ambient_plugin_activate after a plugin has been installed/imported and the user wants it available to Ambient.",
      "Set installDependencies only when the plugin declares missing dependencies and the user has approved running the package manager install.",
      "This tool enables the plugin and resets stale plugin MCP runtimes, but plugin MCP tool trust still happens on first tool use.",
      "Tell the user that newly activated plugin tools are available after the Pi session refreshes or on the next turn.",
      "Do not use this tool in Planner Mode.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        pluginId: { type: "string", description: "Exact installed plugin id. Required when pluginName is ambiguous." },
        pluginName: { type: "string", description: "Installed plugin name or display name." },
        installDependencies: {
          type: "boolean",
          description: "Whether to run the plugin's declared dependency install command before enabling it.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "run-process",
    permissionScope: "plugin-activate",
    supportsDryRun: false,
    supportsUndo: true,
    idempotency: "recommended",
    defaultTimeoutMs: 120_000,
  },
  {
    name: "ambient_setup_runtime_preflight",
    label: "Setup Runtime Preflight",
    description:
      "Inspect host/runtime architecture, Node, shell, package manager, lockfiles, and native dependency signals before installing or rebuilding project dependencies.",
    promptSnippet:
      "ambient_setup_runtime_preflight: Run a read-only runtime and architecture preflight before package-manager installs or native dependency rebuilds.",
    promptGuidelines: [
      "Use ambient_setup_runtime_preflight after Autowire classifies a source as normal_app or containerized_app and before running npm, pnpm, yarn, bun, node-gyp, electron-rebuild, or native package installs.",
      "This tool is read-only: it does not install dependencies, run project scripts, start servers, edit files, read secret-like files, or change runtime configuration.",
      "Read warnings before dependency installs. Treat mixed host/runtime architecture plus native dependency signals as a blocker until the user confirms the intended arm64/x64 environment.",
      "On macOS Apple Silicon, prefer arm64 Node and package-manager paths unless the repository explicitly documents an x64/Rosetta setup.",
      "If this preflight reports missing or mismatched package managers, resolve that first or ask the user which package-manager/runtime path they want.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        packageManager: {
          type: "string",
          enum: ["auto", "npm", "pnpm", "yarn", "bun"],
          description: "Optional package manager to probe first. Defaults to auto, using package.json and lockfiles.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "setup-runtime-preflight",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 15_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "ambient_setup_recipe_describe",
    label: "Setup Recipe Describe",
    description:
      "Describe a bounded setup recipe for a detected project shape, starting with containerized apps that use Docker, Podman, Compose, or local service containers.",
    promptSnippet:
      "ambient_setup_recipe_describe: Load just-in-time setup guidance and read-only preflight for a detected setup recipe such as containerized_app.",
    promptGuidelines: [
      "Use ambient_setup_recipe_describe with recipe containerized_app after Autowire classifies a source as containerized_app or after repository files show Dockerfile, Containerfile, compose.yaml, docker-compose.yml, or package scripts that invoke Docker/Podman Compose.",
      "This tool is read-only: it does not install dependencies, build images, start or stop containers, edit compose files, change ports, create volumes, read secret env files, or run application code.",
      "Read the returned container files, compose services, published ports, host runtime readiness, compose command availability, port conflicts, and existing project containers before running Docker or Podman commands.",
      "If a port conflict is reported, prefer a compose override or documented env port override. Do not abandon the container path just because the default host port is occupied.",
      "Keep normal app containers separate from ToolHive-managed MCP workloads. This recipe can reuse Docker/Podman readiness facts, but it should not manipulate ToolHive workloads.",
      "If the recipe is inactive, do not keep Docker/Podman instructions in context; continue ordinary setup with normal file, shell, browser, and runtime preflight tools.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        recipe: {
          type: "string",
          enum: ["containerized_app"],
          description: "Setup recipe to describe. Currently only containerized_app is supported.",
        },
        includeHostPreflight: {
          type: "boolean",
          description: "Whether to run read-only Docker/Podman host and compose command probes. Defaults to true when container signals are present.",
        },
        includePortProbe: {
          type: "boolean",
          description: "Whether to check detected published host ports for local listener conflicts. Defaults to true when container signals are present.",
        },
      },
      required: ["recipe"],
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "none",
    permissionScope: "setup-recipe-describe",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 20_000,
    runtimeSupport: ["chat"],
  },
  {
    name: "ambient_setup_final_report",
    label: "Setup Final Report",
    description:
      "Build a final setup report from local validation evidence, active URL readiness, listening process, git changes, env template placeholders, and known limitations.",
    promptSnippet:
      "ambient_setup_final_report: Generate a final validation/reporting checklist after normal app or containerized app setup.",
    promptGuidelines: [
      "Use ambient_setup_final_report near the end of normal_app or containerized_app setup, after you have attempted the smallest practical validation.",
      "Pass activeUrl when you know a local app URL, startCommand when you know how the app was launched, commandsRun for install/test/start commands actually run, validationSummary for evidence you directly observed, and knownLimitations for untested or partially working areas.",
      "Pass validationChecks for concrete behavior you tested. Use passed, failed, or skipped with short evidence, such as a command result, page-load observation, or reason a feature was not exercised.",
      "Pass editsRequiredToRun and editSummary when prior tool evidence shows whether code/config edits were needed to get the app running. This lets the final user report separate original project state from Ambient/Pi setup fixes.",
      "Use the returned runtimeStatus and validationStatus as the baseline for the final user-facing status. Do not upgrade partially-validated or not-validated status in prose unless prior tool evidence justifies it.",
      "Use changedFileSummary to separate app/source edits, setup/dependency changes, env templates, generated artifacts, and Ambient evidence artifacts in the final user-facing report.",
      "This tool does not start servers, run tests, install dependencies, read real secret env files, or mutate git state. By default it writes Ambient-managed evidence artifacts under .ambient/setup-final-reports; set exportEvidence false for a no-write diagnostic.",
      "By default, HTTP readiness and browser page-load probes only run for localhost/loopback URLs. Do not set allowExternalUrlProbe unless the user explicitly asked you to validate an external URL.",
      "For local web apps, leave includeBrowserProbe enabled unless you already have equivalent browser evidence. The browser page-load probe opens the active URL in Ambient's managed browser and records title, URL, readable text size, and link count.",
      "Use the returned checklist to produce the user-facing final answer. Do not claim a running app, passing validation, clean git state, or complete feature coverage unless the report or prior tool evidence supports it.",
      "If placeholder env template values remain, call them out as user configuration still needed before full validation.",
    ],
    inputSchema: {
      type: "object",
      properties: {
        activeUrl: {
          type: "string",
          description: "Optional local app URL to probe, such as http://localhost:3000.",
        },
        startCommand: {
          type: "string",
          description: "Command used to start the app, if known.",
        },
        commandsRun: {
          type: "array",
          items: { type: "string" },
          description: "Install, test, start, or validation commands actually run.",
          maxItems: 30,
        },
        validationSummary: {
          type: "string",
          description: "Concise statement of validation evidence already observed.",
        },
        validationChecks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Specific behavior, command, page, or capability that was checked.",
              },
              status: {
                type: "string",
                enum: ["passed", "failed", "skipped"],
                description: "Outcome of the validation check.",
              },
              evidence: {
                type: "string",
                description: "Short supporting evidence or reason the check was skipped or failed.",
              },
            },
            required: ["name", "status"],
            additionalProperties: false,
          },
          description: "Concrete validation checks actually attempted or intentionally skipped.",
          maxItems: 30,
        },
        knownLimitations: {
          type: "array",
          items: { type: "string" },
          description: "Known unvalidated features, placeholder secrets, setup caveats, or partial failures.",
          maxItems: 30,
        },
        editsRequiredToRun: {
          type: "string",
          enum: ["yes", "no", "unknown"],
          description: "Whether code or config edits were required to get the app running, based on prior tool evidence. Defaults to unknown.",
        },
        editSummary: {
          type: "string",
          description: "Concise summary of required setup edits or why no edits were required.",
        },
        includeHttpProbe: {
          type: "boolean",
          description: "Whether to attempt HTTP readiness for activeUrl. Defaults to true.",
        },
        includeBrowserProbe: {
          type: "boolean",
          description: "Whether to attempt a managed browser page-load probe for activeUrl. Defaults to true when a browser probe is available.",
        },
        includeGitStatus: {
          type: "boolean",
          description: "Whether to collect git status changed files. Defaults to true.",
        },
        includeEnvTemplateScan: {
          type: "boolean",
          description: "Whether to scan env template/example files for placeholder values. Defaults to true.",
        },
        allowExternalUrlProbe: {
          type: "boolean",
          description: "Allow HTTP readiness probing for non-loopback URLs. Defaults to false.",
        },
        exportEvidence: {
          type: "boolean",
          description: "Whether to write latest and archived JSON/Markdown evidence files under .ambient/setup-final-reports. Defaults to true.",
        },
      },
      additionalProperties: false,
    },
    source: "first-party",
    sideEffects: "write-workspace",
    permissionScope: "setup-final-report",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "required",
    defaultTimeoutMs: 20_000,
    runtimeSupport: ["chat"],
  },
];
