import {
  MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
  type McpAutowireCandidate,
} from "./mcpAutowireSchemas";

export const mcpAutowirePhase0Fixtures = {
  scrapling: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "scrapling-github-server-json",
    displayName: "Scrapling MCP Server",
    source: {
      kind: "github",
      url: "https://github.com/D4Vinci/Scrapling",
      packageName: "scrapling",
      evidenceRefs: ["scrapling-readme", "scrapling-server-json"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "server-json",
      transport: "stdio",
      package: {
        registryType: "pypi",
        identifier: "scrapling",
        runtimeHint: "uvx",
        packageArguments: [{ type: "positional", valueHint: "mcp", isFixed: true }],
      },
      updatePolicy: {
        mode: "managed-browser-security",
        reason: "Scrapling can use browser-backed fetching and screenshot behavior, so browser engines must follow Ambient's managed security-update lane while the Scrapling package remains separately pinned/reviewed.",
        evidenceRefs: ["scrapling-readme"],
      },
      evidenceRefs: ["scrapling-server-json"],
    },
    secrets: [],
    permissions: {
      network: {
        mode: "broad",
        allowHosts: [],
        allowPorts: [80, 443],
        justification: "Scrapling is a web scraping MCP server; target hosts are task-dependent and must be user-reviewed before broad use.",
      },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["scrapling-readme"],
    },
    validationPlan: {
      preflights: ["toolhive-version", "container-runtime", "scrapling-install", "mcp-tool-discovery"],
      expectedTools: ["get", "fetch", "screenshot"],
      smokeCall: {
        tool: "get",
        arguments: { url: "https://example.com" },
      },
      evidenceRefs: ["scrapling-server-json"],
    },
    evidence: [
      {
        id: "scrapling-readme",
        type: "readme",
        locator: "https://github.com/D4Vinci/Scrapling",
        summary: "Project describes Scrapling as a web scraping library with browser and stealth-oriented fetching capabilities.",
      },
      {
        id: "scrapling-server-json",
        type: "server-json",
        locator: "https://raw.githubusercontent.com/D4Vinci/Scrapling/main/server.json",
        summary: "Official MCP registry metadata declares Scrapling package and stdio MCP command.",
      },
    ],
    openQuestions: [
      {
        question: "What target host allowlist should the user approve for this scraping task?",
        impact: "network",
        blocksInstall: false,
        evidenceRefs: ["scrapling-readme"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Web scraping can hit ToS, robots, login, anti-bot, and broad network-egress boundaries."],
      evidenceRefs: ["scrapling-readme"],
    },
  },
  context7: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "context7-remote-mcp",
    displayName: "Context7 MCP",
    source: {
      kind: "github",
      url: "https://github.com/upstash/context7",
      packageName: "@upstash/context7-mcp",
      evidenceRefs: ["context7-readme", "context7-server-json"],
    },
    recommendedLane: "remote-mcp",
    runtime: {
      provider: "remote-mcp",
      sourceKind: "remote-url",
      transport: "streamable-http",
      remote: {
        url: "https://mcp.context7.com/mcp",
        headers: ["Authorization"],
      },
      evidenceRefs: ["context7-readme", "context7-server-json"],
    },
    secrets: [
      {
        name: "CONTEXT7_API_KEY",
        required: false,
        secret: true,
        purpose: "Optional higher rate limits for Context7 documentation requests.",
        evidenceRefs: ["context7-server-json"],
      },
    ],
    permissions: {
      network: { mode: "allowlist", allowHosts: ["mcp.context7.com"], allowPorts: [443] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["context7-server-json"],
    },
    validationPlan: {
      preflights: ["remote-mcp-reachable", "optional-secret-binding"],
      expectedTools: ["resolve-library-id", "query-docs"],
      smokeCall: {
        tool: "resolve-library-id",
        arguments: { libraryName: "react", query: "hooks" },
      },
      evidenceRefs: ["context7-readme", "context7-server-json"],
    },
    evidence: [
      {
        id: "context7-readme",
        type: "readme",
        locator: "https://raw.githubusercontent.com/upstash/context7/master/README.md",
        summary: "README documents Context7 usage and MCP integration options.",
      },
      {
        id: "context7-server-json",
        type: "server-json",
        locator: "https://raw.githubusercontent.com/upstash/context7/master/server.json",
        summary: "Official server metadata declares remote MCP URL, npm package, MCPB package, and optional API key.",
      },
    ],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Documentation lookup uses a remote service and may optionally use an API key."],
      evidenceRefs: ["context7-readme", "context7-server-json"],
    },
  },
  katzillaInstallFailure: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "katzilla-mcp-standard-mcp",
    displayName: "Katzilla MCP",
    source: {
      kind: "github",
      url: "https://github.com/codeislaw101/katzilla-sdk",
      packageName: "@katzilla/mcp",
      evidenceRefs: ["katzilla-root-readme", "katzilla-mcp-readme", "katzilla-npm-runtime-mismatch"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "npm",
      transport: "stdio",
      package: {
        registryType: "npm",
        identifier: "@katzilla/mcp",
        runtimeHint: "npx -y @katzilla/mcp",
        packageArguments: [],
      },
      evidenceRefs: ["katzilla-mcp-readme", "katzilla-npm-runtime-mismatch"],
    },
    secrets: [
      {
        name: "KATZILLA_API_KEY",
        required: true,
        secret: true,
        purpose: "Katzilla API key required by the MCP server.",
        evidenceRefs: ["katzilla-mcp-readme"],
      },
    ],
    permissions: {
      network: {
        mode: "allowlist",
        allowHosts: ["api.katzilla.dev"],
        allowPorts: [443],
        justification: "The MCP server calls the Katzilla API service.",
      },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["katzilla-mcp-readme"],
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "secret:KATZILLA_API_KEY", "mcp-tool-discovery"],
      expectedTools: ["tools/list"],
      evidenceRefs: ["katzilla-mcp-readme", "katzilla-npm-runtime-mismatch"],
    },
    evidence: [
      {
        id: "katzilla-root-readme",
        type: "readme",
        locator: "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/README.md",
        summary: "The repository uses master as its default branch and lists @katzilla/mcp as the MCP package.",
      },
      {
        id: "katzilla-mcp-readme",
        type: "readme",
        locator: "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/packages/mcp/README.md",
        summary: "The MCP package README documents npx -y @katzilla/mcp and KATZILLA_API_KEY.",
      },
      {
        id: "katzilla-npm-runtime-mismatch",
        type: "package-manifest",
        locator: "ambient-chat-export-install-katzilla-sdk-mcp-server-2026-06-08T04-09-03-390Z.zip (redacted replay)",
        summary: "The exported failure showed @katzilla/mcp starting under ToolHive but failing tools/list because the published @katzilla/sdk package lacked kz.getTools.",
      },
    ],
    openQuestions: [
      {
        question: "Has the publisher released a compatible @katzilla/sdk package version yet?",
        impact: "validation",
        blocksInstall: false,
        evidenceRefs: ["katzilla-npm-runtime-mismatch"],
      },
    ],
    riskSummary: {
      level: "medium",
      reasons: ["Requires a cloud API key and fixed outbound access to api.katzilla.dev."],
      evidenceRefs: ["katzilla-mcp-readme"],
    },
  },
  ghidraMcp: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "ghidramcp-guided-local-bridge",
    displayName: "GhidraMCP",
    source: {
      kind: "github",
      url: "https://github.com/lauriewired/GhidraMCP",
      packageName: "ghidramcp",
      evidenceRefs: ["ghidramcp-readme"],
    },
    recommendedLane: "guided-local-bridge",
    runtime: {
      provider: "guided-local",
      sourceKind: "local-bridge",
      transport: "sse",
      localBridge: {
        commandHint: "python bridge_mcp_ghidra.py --transport sse --mcp-host 127.0.0.1 --mcp-port 8081 --ghidra-server http://127.0.0.1:8080/",
        host: "127.0.0.1",
        port: 8081,
        setupSteps: [
          "Install Ghidra.",
          "Install the GhidraMCP extension into Ghidra.",
          "Open Ghidra and load a project before starting the GhidraMCP HTTP server on 127.0.0.1:8080.",
          "Run bridge_mcp_ghidra.py yourself with SSE on 127.0.0.1:8081 and ghidra-server http://127.0.0.1:8080/.",
        ],
      },
      evidenceRefs: ["ghidramcp-readme"],
    },
    secrets: [],
    permissions: {
      network: { mode: "local-only", allowHosts: ["127.0.0.1", "localhost"], allowPorts: [8080, 8081] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: ["Ghidra"],
      evidenceRefs: ["ghidramcp-readme"],
    },
    validationPlan: {
      preflights: ["ghidra-installed", "ghidramcp-extension-installed", "ghidra-http-server-reachable", "mcp-sse-bridge-reachable", "safe-read-tool-discovery"],
      expectedTools: ["list_functions", "decompile_function"],
      evidenceRefs: ["ghidramcp-readme"],
    },
    evidence: [
      {
        id: "ghidramcp-readme",
        type: "readme",
        locator: "https://raw.githubusercontent.com/lauriewired/GhidraMCP/main/README.md",
        summary: "README describes a Ghidra extension plus Python MCP bridge, with Ghidra serving local HTTP on 127.0.0.1:8080 and the MCP SSE bridge commonly listening on 127.0.0.1:8081.",
      },
    ],
    openQuestions: [
      {
        question: "Is Ghidra installed, is the extension installed, and is a user-approved project loaded?",
        impact: "local-app",
        blocksInstall: true,
        evidenceRefs: ["ghidramcp-readme"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["The bridge controls a reverse-engineering application and can inspect or mutate loaded project state."],
      evidenceRefs: ["ghidramcp-readme"],
    },
  },
  awesomeMcpSearchSeed: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "awesome-mcp-search-seed",
    displayName: "awesome-mcp Search & Data Extraction Seed",
    source: {
      kind: "awesome-mcp",
      url: "https://github.com/punkpeye/awesome-mcp-servers#search",
      evidenceRefs: ["awesome-search-section"],
    },
    recommendedLane: "exploratory",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "unknown",
      evidenceRefs: ["awesome-search-section"],
    },
    secrets: [],
    permissions: {
      network: { mode: "broad", allowHosts: [], allowPorts: [80, 443], justification: "Search/data-extraction entries are heterogeneous and need per-server review." },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["awesome-search-section"],
    },
    validationPlan: {
      preflights: ["select-one-awesome-entry", "find-official-repo", "classify-install-lane"],
      expectedTools: [],
      evidenceRefs: ["awesome-search-section"],
    },
    evidence: [
      {
        id: "awesome-search-section",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#search",
        summary: "awesome-mcp search entries are a discovery corpus, not a single installable server.",
      },
    ],
    openQuestions: [
      {
        question: "Which specific awesome-mcp search entry is being installed, and does it have registry or server metadata?",
        impact: "source",
        blocksInstall: true,
        evidenceRefs: ["awesome-search-section"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Search/data-extraction servers commonly need broad network access and may handle untrusted web content."],
      evidenceRefs: ["awesome-search-section"],
    },
  },
  awesomeMcpKnowledgeMemorySeed: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "awesome-mcp-knowledge-memory-seed",
    displayName: "awesome-mcp Knowledge & Memory Seed",
    source: {
      kind: "awesome-mcp",
      url: "https://github.com/punkpeye/awesome-mcp-servers#knowledge--memory",
      evidenceRefs: ["awesome-knowledge-memory-section"],
    },
    recommendedLane: "exploratory",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "unknown",
      evidenceRefs: ["awesome-knowledge-memory-section"],
    },
    secrets: [],
    permissions: {
      network: { mode: "isolated", allowHosts: [], allowPorts: [] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["awesome-knowledge-memory-section"],
    },
    validationPlan: {
      preflights: ["select-one-awesome-entry", "classify-storage-persistence", "classify-data-retention", "classify-install-lane"],
      expectedTools: [],
      evidenceRefs: ["awesome-knowledge-memory-section"],
    },
    evidence: [
      {
        id: "awesome-knowledge-memory-section",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#knowledge--memory",
        summary: "Knowledge and memory entries need per-server review for persistence, privacy, and deletion semantics.",
      },
    ],
    openQuestions: [
      {
        question: "Which memory/knowledge server is selected, where does it persist data, and how are retention/deletion handled?",
        impact: "filesystem",
        blocksInstall: true,
        evidenceRefs: ["awesome-knowledge-memory-section"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Knowledge and memory servers can persist user data and may require explicit retention and deletion policies."],
      evidenceRefs: ["awesome-knowledge-memory-section"],
    },
  },
  rippr: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "rippr-awesome-search-standard",
    displayName: "rippr",
    source: {
      kind: "github",
      url: "https://github.com/mrslbt/rippr",
      packageName: "rippr",
      evidenceRefs: ["rippr-awesome-entry", "rippr-readme"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "npm",
      transport: "stdio",
      package: {
        registryType: "npm",
        identifier: "rippr",
        runtimeHint: "npx",
        packageArguments: [],
      },
      evidenceRefs: ["rippr-readme"],
    },
    secrets: [],
    permissions: {
      network: {
        mode: "broad",
        allowHosts: [],
        allowPorts: [443],
        justification: "Search and transcript extraction targets are task-dependent and must be reviewed before broad web access.",
      },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["rippr-awesome-entry", "rippr-readme"],
    },
    validationPlan: {
      preflights: ["toolhive-version", "container-runtime", "npm-package-install", "mcp-tool-discovery"],
      expectedTools: ["search", "extract"],
      evidenceRefs: ["rippr-readme"],
    },
    evidence: [
      {
        id: "rippr-awesome-entry",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#search",
        summary: "awesome-mcp lists rippr under Search & Data Extraction.",
      },
      {
        id: "rippr-readme",
        type: "readme",
        locator: "https://github.com/mrslbt/rippr",
        summary: "Repository evidence indicates an npm/stdout MCP-style package suitable for a standard MCP import review.",
      },
    ],
    openQuestions: [
      {
        question: "Which target domains should be approved for transcript/search extraction?",
        impact: "network",
        blocksInstall: false,
        evidenceRefs: ["rippr-awesome-entry"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Search and transcript extraction can touch arbitrary web content and service-specific terms."],
      evidenceRefs: ["rippr-awesome-entry", "rippr-readme"],
    },
  },
  anybrowse: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "anybrowse-awesome-search-evidence-gap",
    displayName: "AnyBrowse",
    source: {
      kind: "github",
      url: "https://github.com/kc23go/anybrowse",
      evidenceRefs: ["anybrowse-awesome-entry"],
    },
    recommendedLane: "exploratory",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "unknown",
      evidenceRefs: ["anybrowse-awesome-entry"],
    },
    secrets: [],
    permissions: {
      network: {
        mode: "broad",
        allowHosts: [],
        allowPorts: [443],
        justification: "Browser/search extraction may require task-dependent web access, but the exact endpoint and runtime are not proven yet.",
      },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["anybrowse-awesome-entry"],
    },
    validationPlan: {
      preflights: ["verify-hosted-endpoint", "verify-auth-requirements", "classify-data-retention", "classify-install-lane"],
      expectedTools: [],
      evidenceRefs: ["anybrowse-awesome-entry"],
    },
    evidence: [
      {
        id: "anybrowse-awesome-entry",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#search",
        summary: "awesome-mcp lists AnyBrowse under Search & Data Extraction, but the fixture intentionally lacks a verified hosted endpoint.",
      },
    ],
    openQuestions: [
      {
        question: "What exact MCP endpoint, auth model, pricing, and retention policy should Ambient present before import?",
        impact: "transport",
        blocksInstall: true,
        evidenceRefs: ["anybrowse-awesome-entry"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Hosted search/browser extraction requires endpoint, auth, cost, and retention evidence before install."],
      evidenceRefs: ["anybrowse-awesome-entry"],
    },
  },
  waypath: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "waypath-awesome-memory-evidence-gap",
    displayName: "Waypath",
    source: {
      kind: "github",
      url: "https://github.com/TheStack-ai/waypath",
      evidenceRefs: ["waypath-awesome-entry"],
    },
    recommendedLane: "exploratory",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "unknown",
      evidenceRefs: ["waypath-awesome-entry"],
    },
    secrets: [],
    permissions: {
      network: { mode: "isolated", allowHosts: [], allowPorts: [] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["waypath-awesome-entry"],
    },
    validationPlan: {
      preflights: ["verify-mcp-server-entrypoint", "classify-storage-persistence", "classify-retention-and-deletion", "mcp-tool-discovery"],
      expectedTools: [],
      evidenceRefs: ["waypath-awesome-entry"],
    },
    evidence: [
      {
        id: "waypath-awesome-entry",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#knowledge--memory",
        summary: "awesome-mcp lists Waypath under Knowledge & Memory; persistence and deletion semantics must be verified before install.",
      },
    ],
    openQuestions: [
      {
        question: "Where does Waypath persist memory data, and how can the user inspect, retain, export, or delete it?",
        impact: "filesystem",
        blocksInstall: true,
        evidenceRefs: ["waypath-awesome-entry"],
      },
    ],
    riskSummary: {
      level: "high",
      reasons: ["Memory tools can retain user or workspace data, so storage and deletion evidence is install-critical."],
      evidenceRefs: ["waypath-awesome-entry"],
    },
  },
  instinct: {
    schemaVersion: MCP_AUTOWIRE_CANDIDATE_SCHEMA_VERSION,
    id: "instinct-toolhive-registry-memory",
    displayName: "Instinct",
    source: {
      kind: "toolhive-registry",
      url: "https://github.com/yakuphanycl/instinct",
      registryId: "io.github.yakuphanycl/instinct",
      packageName: "instinct",
      evidenceRefs: ["instinct-awesome-entry", "instinct-registry-entry"],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "registry",
      transport: "stdio",
      evidenceRefs: ["instinct-registry-entry"],
    },
    secrets: [],
    permissions: {
      network: { mode: "disabled", allowHosts: [], allowPorts: [] },
      filesystem: { workspaceRead: false, workspaceWrite: false, extraMounts: [] },
      localApps: [],
      evidenceRefs: ["instinct-registry-entry"],
    },
    validationPlan: {
      preflights: ["toolhive-version", "container-runtime", "mcp-tool-discovery", "memory-retention-policy-review"],
      expectedTools: ["remember", "recall", "forget"],
      evidenceRefs: ["instinct-registry-entry"],
    },
    evidence: [
      {
        id: "instinct-awesome-entry",
        type: "awesome-mcp",
        locator: "https://github.com/punkpeye/awesome-mcp-servers#knowledge--memory",
        summary: "awesome-mcp lists Instinct under Knowledge & Memory.",
      },
      {
        id: "instinct-registry-entry",
        type: "registry",
        locator: "toolhive registry info io.github.yakuphanycl/instinct",
        summary: "Fixture models the reviewed registry-backed path after persistence, retention, and deletion evidence has been collected.",
      },
    ],
    openQuestions: [],
    riskSummary: {
      level: "medium",
      reasons: ["Memory retention is sensitive but this reviewed registry fixture has explicit no-network and deletion-tool evidence."],
      evidenceRefs: ["instinct-registry-entry"],
    },
  },
} satisfies Record<string, McpAutowireCandidate>;

export const mcpKatzillaInstallFailureReplay = {
  sourceArchive: "ambient-chat-export-install-katzilla-sdk-mcp-server-2026-06-08T04-09-03-390Z.zip",
  candidate: mcpAutowirePhase0Fixtures.katzillaInstallFailure,
  discovery: {
    githubTarget: "https://github.com/codeislaw101/katzilla-sdk",
    failedMainBranchUrls: [
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/main/README.md",
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/main/package.json",
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/main/server.json",
    ],
    masterEvidenceUrls: [
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/README.md",
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/packages/mcp/README.md",
      "https://raw.githubusercontent.com/codeislaw101/katzilla-sdk/master/packages/mcp/package.json",
    ],
    masterReadmeExcerpt: [
      "# Katzilla SDK MCP Server",
      "Install the Model Context Protocol server with `npx -y @katzilla/mcp`.",
      "Set KATZILLA_API_KEY before use.",
      "The server talks to https://api.katzilla.dev/v1.",
    ].join("\n"),
  },
  failure: {
    publishedPackage: "@katzilla/mcp",
    toolHiveRunSource: "npx://@katzilla/mcp",
    protocolError: "kz.getTools is not a function",
    expectedInstallStatus: "validation_failed",
  },
  forbiddenVisibleFragments: [
    "KATZILLA_API_KEY=",
    "kz_your_key_here",
    "npx supergateway",
    "ambient_mcp_guided_bridge_register",
  ],
} as const;
