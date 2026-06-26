import { extractMcpAutowireManifestFacts, extractMcpAutowireSecretFacts, isSafePackageIdentifier } from "./mcpAutowireFacts";
import type { McpAutowireCandidate } from "./mcpAutowireSchemas";
import {
  bestNetworkEvidenceLocator,
  classificationFetchPreview,
  deterministicMcpAutowireNetworkFacts,
  networkJustification,
  uniqueSortedNumbers,
  type McpAutowireNetworkFacts,
  type McpAutowireNetworkPackageIdentity,
} from "./mcpAutowirePlannerNetworkFacts";

export interface McpAutowireDeterministicTarget {
  url: URL;
  package?: {
    registryType: "npm" | "pypi";
    identifier: string;
  };
  github?: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    pathKind?: "tree" | "blob";
  };
}

export interface McpAutowireDeterministicFetch {
  url: string;
  status: string;
  contentType?: string;
  textPreview?: string;
}

export interface McpAutowireDeterministicSearch {
  query: string;
  defaultBranch?: string;
  results?: Array<{
    path: string;
    rawUrl: string;
    reason: string;
  }>;
}

export function deterministicStandardMcpPackageCandidate(input: {
  target: McpAutowireDeterministicTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDeterministicFetch[];
  searches: McpAutowireDeterministicSearch[];
  networkFacts?: McpAutowireNetworkFacts;
}): McpAutowireCandidate | undefined {
  const evidenceText = deterministicEvidenceText(input);
  if (!hasExplicitMcpPackageSignal(evidenceText)) return undefined;
  const packageIdentity = deterministicPackageIdentity(input, evidenceText);
  const npmPackage = packageIdentity?.registryType === "npm" ? packageIdentity.identifier : undefined;
  const pypiPackage = packageIdentity?.registryType === "pypi" ? packageIdentity.identifier : undefined;
  const packageName = npmPackage ?? pypiPackage;
  if (!packageName) return undefined;
  const registryType = packageIdentity?.registryType ?? (npmPackage ? ("npm" as const) : ("pypi" as const));
  const packageEvidenceLocator = packageIdentity?.locator ?? bestDeterministicEvidenceLocator(input);
  const packageId = safeCandidateId(`${packageName}-standard-mcp`);
  const secretFact = extractPrimarySecretFact(evidenceText);
  const envName = secretFact?.name;
  const fallbackNetworkFacts = deterministicMcpAutowireNetworkFacts(input);
  const networkFacts =
    input.networkFacts?.runtimeHosts.length || input.networkFacts?.needsBroadNetwork ? input.networkFacts : fallbackNetworkFacts;
  const localOnlyRuntime = packageEvidenceIndicatesLocalOnlyRuntime(evidenceText, packageName);
  const effectiveRuntimeHosts = localOnlyRuntime ? [] : networkFacts.runtimeHosts;
  const hosts = effectiveRuntimeHosts.map((fact) => fact.host);
  const ports = uniqueSortedNumbers(effectiveRuntimeHosts.flatMap((fact) => (fact.ports.length ? fact.ports : [443])));
  const evidenceId = "discovery-summary";
  const networkEvidenceId = hosts.length ? "network-requirements" : evidenceId;
  const secretEvidenceId = envName ? "secret-requirement" : evidenceId;
  const updatePolicy = deterministicBrowserRuntimeUpdatePolicy({
    packageName,
    fetches: input.fetches,
    evidenceId,
  });
  const runtimeImage = deterministicToolHiveRuntimeImage({
    registryType,
    fetches: input.fetches,
    browserRuntime: updatePolicy?.mode === "managed-browser-security",
  });
  const packageArguments = deterministicMcpPackageArguments({
    registryType,
    packageName,
    evidenceText,
  });
  const entrypoint = packageArguments.some((arg) => arg.type === "switch" && arg.name === "--mcp")
    ? undefined
    : deterministicMcpPackageEntrypoint({
        registryType,
        packageName,
        evidenceText,
        fetches: input.fetches,
      });
  const runtimeHint = runtimeHintForDeterministicPackage({
    registryType,
    packageName,
    packageArguments,
    entrypoint,
  });
  const evidence: McpAutowireCandidate["evidence"] = [
    {
      id: evidenceId,
      type: "readme",
      locator: packageEvidenceLocator,
      summary: `Discovery found a documented Model Context Protocol server package ${packageName}.`,
    },
    ...(envName
      ? [
          {
            id: secretEvidenceId,
            type: "readme" as const,
            locator: packageEvidenceLocator,
            summary: `Discovery found ${secretFact.requiredness} environment secret ${envName} for the MCP server.`,
          },
        ]
      : []),
    ...(hosts.length
      ? [
          {
            id: networkEvidenceId,
            type: "other" as const,
            locator: bestNetworkEvidenceLocator(networkFacts) ?? packageEvidenceLocator,
            summary: `Discovery identified runtime outbound host${hosts.length === 1 ? "" : "s"} ${hosts.join(", ")} for ${packageName}.`,
          },
        ]
      : []),
  ];
  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: packageId,
    displayName: displayNameForPackage(packageName),
    source: {
      kind: input.target.github ? "github" : "other",
      url: input.target.url.toString(),
      packageName,
      evidenceRefs: [evidenceId],
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: registryType === "npm" ? "npm" : "pypi",
      transport: "stdio",
      package: {
        registryType,
        identifier: packageName,
        runtimeHint,
        ...(runtimeImage ? { runtimeImage } : {}),
        ...(entrypoint ? { entrypoint } : {}),
        packageArguments,
      },
      ...(updatePolicy ? { updatePolicy } : {}),
      evidenceRefs: [evidenceId],
    },
    secrets: envName
      ? [
          {
            name: envName,
            required: secretFact.requiredness === "required",
            secret: true,
            purpose:
              secretFact.requiredness === "optional"
                ? `Optional API key or token supported by ${displayNameForPackage(packageName)}.`
                : `API key or token required by ${displayNameForPackage(packageName)}.`,
            evidenceRefs: [secretEvidenceId],
          },
        ]
      : [],
    permissions: {
      network: {
        mode: hosts.length ? "allowlist" : localOnlyRuntime ? "disabled" : "broad",
        allowHosts: hosts,
        allowPorts: hosts.length ? ports : [],
        justification: hosts.length
          ? networkJustification(networkFacts, packageName)
          : localOnlyRuntime
            ? "Discovery indicates this MCP works against local SQLite/database files and does not require runtime network access."
            : networkFacts.needsBroadNetwork
              ? "The MCP server needs runtime network access, but bounded discovery did not expose a fixed public host."
              : "The MCP server may require API/network access, but discovery did not expose a fixed host.",
      },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [],
      },
      localApps: [],
      evidenceRefs: hosts.length ? [evidenceId, networkEvidenceId] : [evidenceId],
    },
    validationPlan: {
      preflights: [
        "toolhive-runtime",
        "container-runtime",
        ...(envName && secretFact.requiredness === "required" ? [`secret:${envName}`] : []),
      ],
      expectedTools: [],
      evidenceRefs: [evidenceId],
    },
    evidence,
    openQuestions:
      hosts.length || localOnlyRuntime
        ? []
        : networkFacts.openQuestions.length
          ? networkFacts.openQuestions.map((question) => ({
              question,
              impact: "network" as const,
              blocksInstall: false,
              evidenceRefs: [evidenceId],
            }))
          : [
              {
                question: "What exact public API hosts should this MCP server be allowed to contact?",
                impact: "network",
                blocksInstall: false,
                evidenceRefs: [evidenceId],
              },
            ],
    riskSummary: {
      level: hosts.length || localOnlyRuntime ? "medium" : "high",
      reasons: [
        hosts.length
          ? "Package-backed MCP server uses an external API with explicit host allowlist."
          : localOnlyRuntime
            ? "Package-backed MCP server is scoped to local SQLite/database files without runtime network egress."
            : "Package-backed MCP server requires external API access but host evidence is incomplete.",
      ],
      evidenceRefs: [evidenceId],
    },
  };
}

export function deterministicSourceOnlyMcpCandidate(input: {
  target: McpAutowireDeterministicTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDeterministicFetch[];
  searches: McpAutowireDeterministicSearch[];
  networkFacts?: McpAutowireNetworkFacts;
  invalidCandidateText?: string;
  forceSourceOnly?: boolean;
}): McpAutowireCandidate | undefined {
  if (!input.target.github) return undefined;
  const evidenceText = [deterministicEvidenceText(input), input.invalidCandidateText ?? ""].join("\n");
  if (!input.forceSourceOnly && !hasFetchedSourceOnlyMcpSignal(input.fetches) && !hasSourceOnlyMcpSignal(sourceOnlyMcpHintText(input)))
    return undefined;

  const evidence = sourceOnlyMcpEvidence(input);
  const evidenceRefs = evidence.map((entry) => entry.id);
  const runtimeText = sourceOnlyRuntimeEvidenceText(input.fetches);
  const sourceNetworkFacts = input.networkFacts?.runtimeHosts.length
    ? input.networkFacts
    : deterministicMcpAutowireNetworkFacts({
        target: input.target,
        instructions: input.instructions,
        discoverySummary: runtimeText,
        fetches: [],
        searches: input.searches,
      });
  const runtimeHosts = sourceNetworkFacts.runtimeHosts.map((fact) => fact.host);
  const runtimePorts = uniqueSortedNumbers(sourceNetworkFacts.runtimeHosts.flatMap((fact) => (fact.ports.length ? fact.ports : [443])));
  const runtimeNetworkSignal = /\b(?:requests|httpx|aiohttp|urllib|fetch\(|axios|websocket|https?:\/\/)/i.test(runtimeText);
  const secretFacts = extractMcpAutowireSecretFacts(evidenceText)
    .secrets.filter((secret) => /(?:API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(secret.name))
    .slice(0, 6);
  const expectedTools = extractSourceOnlyMcpToolNames(evidenceText);
  const repo = input.target.github.repo;
  const displayName = displayNameForPackage(repo);
  const filesystemQuestions = /SQLITE_DB_PATH/i.test(evidenceText)
    ? [
        {
          question: "Which SQLite database file should be mounted read-only for validation and runtime?",
          impact: "filesystem" as const,
          blocksInstall: false,
          evidenceRefs,
        },
      ]
    : [];

  return {
    schemaVersion: "ambient-mcp-autowire-v1",
    id: safeCandidateId(`${repo}-source-mcp`),
    displayName,
    source: {
      kind: "github",
      url: input.target.url.toString(),
      packageName: repo,
      evidenceRefs,
    },
    recommendedLane: "standard-mcp",
    runtime: {
      provider: "toolhive",
      sourceKind: "unknown",
      transport: "stdio",
      evidenceRefs,
    },
    secrets: secretFacts.map((secret) => ({
      name: secret.name,
      required: secret.requiredness === "required",
      secret: true as const,
      purpose: secret.requiredness === "required" ? `Secret required by ${displayName}.` : `Optional secret supported by ${displayName}.`,
      evidenceRefs,
    })),
    permissions: {
      network: runtimeHosts.length
        ? {
            mode: "allowlist",
            allowHosts: runtimeHosts,
            allowPorts: runtimePorts.length ? runtimePorts : [443],
            justification: networkJustification(sourceNetworkFacts, displayName),
          }
        : runtimeNetworkSignal
          ? {
              mode: "broad",
              allowHosts: [],
              allowPorts: [],
              justification: "Source code uses network libraries, but deterministic evidence did not expose fixed runtime hosts.",
            }
          : {
              mode: "disabled",
              allowHosts: [],
              allowPorts: [],
              justification: "Deterministic source evidence did not identify a runtime network requirement.",
            },
      filesystem: {
        workspaceRead: false,
        workspaceWrite: false,
        extraMounts: [],
      },
      localApps: [],
      evidenceRefs,
    },
    validationPlan: {
      preflights: ["toolhive-runtime", "container-runtime", "custom-source-build-review"],
      expectedTools,
      evidenceRefs,
    },
    evidence,
    openQuestions: filesystemQuestions,
    riskSummary: {
      level: runtimeNetworkSignal || secretFacts.length ? "high" : "medium",
      reasons: [
        "GitHub source-only MCP server needs a reviewed custom ToolHive source build before execution.",
        "No npm, PyPI, OCI, ToolHive registry, or remote MCP endpoint metadata was deterministically confirmed.",
      ],
      evidenceRefs,
    },
  };
}

export function hasSourceOnlyMcpSignal(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /not an? mcp|not an? mcp server|not a model context protocol server|without mcp support|does not expose.*mcp|no mcp server scripts/.test(
      lower,
    )
  )
    return false;
  return /\bmcp server\b|\bmcp servers\b|fastmcp|from fastmcp import|fastmcp\s*\(|mcp\s*=\s*fastmcp|@mcp\.tool\s*\(/.test(lower);
}

export function sourceOnlyMcpHintText(input: {
  target: McpAutowireDeterministicTarget;
  instructions?: string;
  searches: McpAutowireDeterministicSearch[];
}): string {
  return [
    input.target.url.toString(),
    input.instructions ?? "",
    ...input.searches.flatMap((search) => [search.query, ...(search.results ?? []).flatMap((result) => [result.path, result.reason])]),
  ].join("\n");
}

export function deterministicEvidenceText(input: {
  target: McpAutowireDeterministicTarget;
  instructions?: string;
  discoverySummary: string;
  fetches: McpAutowireDeterministicFetch[];
  searches: McpAutowireDeterministicSearch[];
}): string {
  return [
    input.target.package ? `${input.target.package.registryType} package: ${input.target.package.identifier}` : "",
    input.instructions ?? "",
    input.discoverySummary,
    ...input.fetches.map((fetch) => fetch.url),
    ...input.fetches.map((fetch) => classificationFetchPreview(fetch)),
    ...input.searches.flatMap((search) => [
      search.query,
      search.defaultBranch ?? "",
      ...(search.results ?? []).flatMap((result) => [result.path, result.rawUrl, result.reason]),
    ]),
  ].join("\n");
}

export function deterministicPackageIdentity(
  input: {
    target: McpAutowireDeterministicTarget;
    instructions?: string;
    fetches: McpAutowireDeterministicFetch[];
  },
  evidenceText: string,
): McpAutowireNetworkPackageIdentity | undefined {
  if (input.target.package) {
    return {
      registryType: input.target.package.registryType,
      identifier: input.target.package.identifier,
      locator: packageRegistryMetadataUrl(input.target.package) ?? input.target.url.toString(),
    };
  }

  const instructionNpm = extractNpmPackageOverride(input.instructions ?? "");
  if (instructionNpm) {
    return {
      registryType: "npm",
      identifier: instructionNpm,
      locator: "user-instructions",
    };
  }

  const manifestPackage = bestFetchedPackageIdentity(input.fetches);
  if (manifestPackage) return manifestPackage;

  const npmPackage = extractNpmMcpPackageName(evidenceText);
  if (npmPackage) return { registryType: "npm", identifier: npmPackage };
  const pypiPackage = extractPyPiMcpPackageName(evidenceText);
  if (pypiPackage) return { registryType: "pypi", identifier: pypiPackage };
  return undefined;
}

function packageEvidenceIndicatesLocalOnlyRuntime(evidenceText: string, packageName: string): boolean {
  const text = `${packageName}\n${evidenceText}`.toLowerCase();
  if (!/\bsqlite\b|\.sqlite3?\b|\.db\b/.test(text)) return false;
  const localSignals = [
    /\breads?\s+local\s+(?:`?\.db`?\s+)?files?\b/,
    /\blocal\s+(?:sqlite\s+)?database\b/,
    /\blocal-first\b/,
    /\bno auth needed\b/,
    /\bread-only by default\b/,
    /\bopens? the database read-only\b/,
  ];
  if (!localSignals.some((pattern) => pattern.test(text))) return false;
  const remoteRequirementSignals = [
    /\brequires?\s+(?:an?\s+)?api\s+key\b/,
    /\bapi[_ -]?key\b/,
    /\btoken\b/,
    /\bbase\s*url\b/,
    /\bremote\s+api\b/,
    /\bcloud\s+(?:api|service|database)\b/,
  ];
  return !remoteRequirementSignals.some((pattern) => pattern.test(text));
}

export function hasFetchedSourceOnlyMcpSignal(fetches: McpAutowireDeterministicFetch[]): boolean {
  return fetches.some(
    (fetch) => fetch.status === "fetched" && Boolean(fetch.textPreview) && hasSourceOnlyMcpSignal(fetch.textPreview ?? ""),
  );
}

function sourceOnlyMcpEvidence(input: {
  target: McpAutowireDeterministicTarget;
  fetches: McpAutowireDeterministicFetch[];
  searches: McpAutowireDeterministicSearch[];
}): McpAutowireCandidate["evidence"] {
  const entries: McpAutowireCandidate["evidence"] = [];
  const addEntry = (entry: McpAutowireCandidate["evidence"][number]) => {
    if (!entries.some((existing) => existing.id === entry.id)) entries.push(entry);
  };
  for (const fetch of input.fetches) {
    if (fetch.status !== "fetched" || !fetch.textPreview || !hasSourceOnlyMcpSignal(fetch.textPreview)) continue;
    const lowerUrl = fetch.url.toLowerCase();
    if (/readme\.mdx?$/.test(lowerUrl)) {
      addEntry({
        id: "source-readme",
        type: "readme",
        locator: fetch.url,
        summary: "README describes this repository as an MCP server source.",
      });
    } else if (/\.(?:py|js|ts|mjs|cjs|go|rs)$/.test(lowerUrl)) {
      addEntry({
        id: "source-code",
        type: "file",
        locator: fetch.url,
        summary: "Source code contains MCP server implementation evidence.",
      });
    } else if (/(?:requirements\.txt|pyproject\.toml|package\.json|uv\.lock)$/.test(lowerUrl)) {
      addEntry({
        id: "source-dependencies",
        type: "package-manifest",
        locator: fetch.url,
        summary: "Dependency metadata references MCP server runtime libraries.",
      });
    }
  }
  if (!entries.length) {
    const searched = input.searches
      .flatMap((search) => search.results ?? [])
      .find((result) => /mcp|fastmcp/i.test(`${result.path} ${result.reason}`));
    entries.push({
      id: "source-discovery",
      type: "other",
      locator: searched?.rawUrl ?? input.target.url.toString(),
      summary: "Bounded discovery found source-only MCP server evidence.",
    });
  }
  return entries.slice(0, 6);
}

function sourceOnlyRuntimeEvidenceText(fetches: McpAutowireDeterministicFetch[]): string {
  return fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .map((fetch) => fetch.textPreview)
    .join("\n");
}

function extractSourceOnlyMcpToolNames(text: string): string[] {
  const tools = new Set<string>();
  for (const match of text.matchAll(/@mcp\.tool\s*\(\s*\)\s*(?:\r?\n|\s)*def\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (match[1]) tools.add(match[1]);
  }
  for (const match of text.matchAll(/^###\s+([a-z_][a-z0-9_]*)\s*$/gm)) {
    if (match[1]) tools.add(match[1]);
  }
  return [...tools].slice(0, 12);
}

function bestFetchedPackageIdentity(fetches: McpAutowireDeterministicFetch[]): McpAutowireNetworkPackageIdentity | undefined {
  const candidates = fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .flatMap((fetch) => packageIdentitiesFromFetchedText(fetch));
  return candidates.sort((a, b) => b.score - a.score)[0]?.identity;
}

function packageIdentitiesFromFetchedText(
  fetch: McpAutowireDeterministicFetch,
): Array<{ identity: McpAutowireNetworkPackageIdentity; score: number }> {
  const text = fetch.textPreview ?? "";
  const lowerUrl = fetch.url.toLowerCase();
  const fromJson = packageIdentityFromJsonText(text, fetch.url);
  if (fromJson) {
    const mcpScore = /mcp|modelcontextprotocol/i.test(text) || /mcp/i.test(fromJson.identifier) ? 200 : 0;
    const locatorScore =
      lowerUrl.includes("package.json") || lowerUrl.includes("registry.npmjs.org") || lowerUrl.includes("/pypi/") ? 600 : 0;
    return [{ identity: fromJson, score: locatorScore + mcpScore }];
  }
  const fromManifest = packageIdentitiesFromManifestText(text, fetch.url);
  if (fromManifest.length) return fromManifest;
  return [];
}

function packageIdentityFromJsonText(text: string, locator: string): McpAutowireNetworkPackageIdentity | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const npmName = typeof record.name === "string" ? record.name.trim() : undefined;
    if (npmName && isSafePackageIdentifier(npmName, "npm") && packageJsonLooksLikeMcp(record, npmName)) {
      return { registryType: "npm", identifier: npmName, locator };
    }
    const info =
      record.info && typeof record.info === "object" && !Array.isArray(record.info) ? (record.info as Record<string, unknown>) : undefined;
    const pypiName = typeof info?.name === "string" ? info.name.trim() : undefined;
    if (info && pypiName && isSafePackageIdentifier(pypiName, "pypi") && packageJsonLooksLikeMcp(info, pypiName)) {
      return { registryType: "pypi", identifier: pypiName, locator };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function packageIdentitiesFromManifestText(
  text: string,
  locator: string,
): Array<{ identity: McpAutowireNetworkPackageIdentity; score: number }> {
  const facts = extractMcpAutowireManifestFacts([{ locator, text }]);
  return facts.manifests
    .filter((manifest) => manifest.packageName && manifest.registryType && manifest.looksLikeMcp)
    .map((manifest) => ({
      identity: {
        registryType: manifest.registryType!,
        identifier: manifest.packageName!,
        locator: manifest.locator,
      },
      score: manifestScore(manifest),
    }));
}

function manifestScore(manifest: ReturnType<typeof extractMcpAutowireManifestFacts>["manifests"][number]): number {
  const base = manifest.kind === "pyproject-toml" ? 520 : 500;
  const mcpEntrypoint = manifest.scriptTargets.some(
    (script) => mcpEntrypointSignal(script.name) || mcpEntrypointSignal(script.target ?? ""),
  );
  if (mcpEntrypoint) return base + 430;
  if (manifest.scriptNames.some(mcpEntrypointSignal)) return base + 240;
  return base;
}

function deterministicMcpPackageArguments(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  evidenceText: string;
}): NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"] {
  const packagePattern = escapeRegex(input.packageName);
  const launchPattern =
    input.registryType === "npm"
      ? new RegExp(`\\bnpx\\s+(?:-[A-Za-z0-9_-]+\\s+)*${packagePattern}\\s+--mcp\\b`, "i")
      : new RegExp(`\\b(?:uvx\\s+)?${packagePattern}\\s+--mcp\\b`, "i");
  const arrayArgPattern = /["']--mcp["']/i;
  const usagePattern = new RegExp(`\\b${packagePattern}\\s+--mcp\\b`, "i");
  if (launchPattern.test(input.evidenceText) || usagePattern.test(input.evidenceText) || arrayArgPattern.test(input.evidenceText)) {
    return [{ type: "switch", name: "--mcp", isFixed: true }];
  }
  return [];
}

function deterministicMcpPackageEntrypoint(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  evidenceText: string;
  fetches: McpAutowireDeterministicFetch[];
}): NonNullable<McpAutowireCandidate["runtime"]["package"]>["entrypoint"] | undefined {
  const manifestEntrypoint = input.fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview)
    .flatMap((fetch) => extractMcpAutowireManifestFacts([{ locator: fetch.url, text: fetch.textPreview ?? "" }]).manifests)
    .flatMap((manifest) => manifest.scriptTargets)
    .filter((script) => mcpEntrypointSignal(script.name) || mcpEntrypointSignal(script.target ?? ""))
    .sort((left, right) => mcpEntrypointScore(right) - mcpEntrypointScore(left))[0];
  if (manifestEntrypoint?.name && !sameDefaultPackageExecutable(input.registryType, input.packageName, manifestEntrypoint.name)) {
    return {
      kind: "package-bin",
      command: manifestEntrypoint.name,
      fromPackage: input.packageName,
    };
  }
  const moduleMatch = /\bpython(?:3)?\s+-m\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/i.exec(input.evidenceText);
  const moduleName = moduleMatch?.[1];
  if (moduleName && mcpEntrypointSignal(moduleName)) {
    return {
      kind: "module",
      module: moduleName,
      fromPackage: input.packageName,
    };
  }
  return undefined;
}

function runtimeHintForDeterministicPackage(input: {
  registryType: "npm" | "pypi";
  packageName: string;
  packageArguments: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"];
  entrypoint?: NonNullable<McpAutowireCandidate["runtime"]["package"]>["entrypoint"];
}): string {
  const base = input.registryType === "npm" ? `npx -y ${input.packageName}` : `uvx ${input.packageName}`;
  const args = input.packageArguments
    .map((arg) => packageArgumentHint(arg))
    .filter(Boolean)
    .join(" ");
  if (args) return `${base} ${args}`;
  if (input.entrypoint?.kind === "package-bin" && input.entrypoint.command)
    return `${base} (entrypoint ${input.entrypoint.command} from ${input.packageName})`;
  if (input.entrypoint?.kind === "module" && input.entrypoint.module) return `${base} (module ${input.entrypoint.module})`;
  return base;
}

function packageArgumentHint(arg: NonNullable<McpAutowireCandidate["runtime"]["package"]>["packageArguments"][number]): string | undefined {
  if (arg.type === "switch") return arg.name;
  if (arg.type === "flag" && arg.name && arg.valueHint) return `${arg.name} ${arg.valueHint}`;
  if (arg.type === "positional") return arg.valueHint;
  return undefined;
}

function mcpEntrypointScore(script: { name: string; target?: string }): number {
  const text = `${script.name}\n${script.target ?? ""}`;
  let score = 0;
  if (/\bmcp\b/i.test(script.name)) score += 10;
  if (/mcp_server|fastmcp|\.mcp\b|\bmcp\b/i.test(text)) score += 20;
  if (/server/i.test(text)) score += 5;
  return score;
}

function mcpEntrypointSignal(value: string): boolean {
  return /\bmcp\b|mcp_server|fastmcp|modelcontextprotocol/i.test(value);
}

function sameDefaultPackageExecutable(registryType: "npm" | "pypi", packageName: string, command: string): boolean {
  if (registryType === "npm") return command.toLowerCase() === defaultNpmExecutableName(packageName).toLowerCase();
  return normalizePackageExecutableName(command) === normalizePackageExecutableName(packageName);
}

function defaultNpmExecutableName(identifier: string): string {
  const parts = identifier.split("/");
  return parts[parts.length - 1] ?? identifier;
}

function normalizePackageExecutableName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function packageJsonLooksLikeMcp(record: Record<string, unknown>, packageName: string): boolean {
  if (/mcp|modelcontextprotocol/i.test(packageName)) return true;
  const depsText = JSON.stringify({
    dependencies: record.dependencies,
    devDependencies: record.devDependencies,
    peerDependencies: record.peerDependencies,
    optionalDependencies: record.optionalDependencies,
    bin: record.bin,
    scripts: record.scripts,
    keywords: record.keywords,
  }).toLowerCase();
  return depsText.includes("@modelcontextprotocol") || /\bmcp\b/.test(depsText);
}

export function hasExplicitMcpPackageSignal(text: string): boolean {
  return /model context protocol|modelcontextprotocol|@modelcontextprotocol|mcpservers?|mcp clients?|mcp server|claude desktop|cursor|windsurf|npx:\/\/|uvx:\/\/|\bnpx\s+(?:-[\w-]+\s+)*@?[a-z0-9_.-]+\/?mcp\b|@[a-z0-9_.-]+\/mcp\b/i.test(
    text,
  );
}

function extractNpmMcpPackageName(text: string): string | undefined {
  const patterns = [
    /\bnpx:\/\/((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/,
    /\bnpx\s+(?:-[\w-]+\s+)*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/,
    /\b(?:npm package|package(?: name)?|published as|registry)\s*[:=]?\s*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
    /\b(@[A-Za-z0-9_.-]+\/mcp)\b/,
    /\b(@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "npm")) return value;
  }
  return undefined;
}

function extractNpmPackageOverride(text: string): string | undefined {
  const patterns = [
    /\bnpm:((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+)\b/i,
    /\b(?:exact|correct|preferred|override|scoped)?\s*(?:npm\s+)?package(?:\s+name|\s+coordinate)?\s*(?:is|=|:)?\s*((?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
    /\b((?:@[A-Za-z0-9_.-]+\/)[A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "npm")) return value;
  }
  return undefined;
}

function extractPyPiMcpPackageName(text: string): string | undefined {
  const patterns = [
    /\buvx:\/\/([A-Za-z0-9_.-]+)\b/,
    /\buvx\s+([A-Za-z0-9_.-]+)\b/,
    /\b(?:pypi package|python package)\s*[:=]?\s*([A-Za-z0-9_.-]*mcp[A-Za-z0-9_.-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value && isSafePackageIdentifier(value, "pypi")) return value;
  }
  return undefined;
}

function extractPrimarySecretFact(text: string) {
  const facts = extractMcpAutowireSecretFacts(text).secrets;
  return (
    facts.find((fact) => fact.requiredness === "required" && /API_KEY|TOKEN/.test(fact.name)) ??
    facts.find((fact) => fact.requiredness === "required") ??
    facts.find((fact) => fact.requiredness === "optional" && /API_KEY|TOKEN/.test(fact.name)) ??
    facts.find((fact) => fact.requiredness === "optional")
  );
}

function deterministicBrowserRuntimeUpdatePolicy(input: {
  packageName: string;
  fetches: McpAutowireDeterministicFetch[];
  evidenceId: string;
}): NonNullable<McpAutowireCandidate["runtime"]["updatePolicy"]> | undefined {
  const text = [input.packageName, ...browserRuntimeManifestSignals(input.fetches)].join("\n");
  if (!/\b(?:browser|chrome|chromium|playwright|puppeteer|selenium|webdriver|headless|screenshot|screenshots|browserless)\b/i.test(text))
    return undefined;
  return {
    mode: "managed-browser-security",
    reason:
      "Browser-class MCP runtime uses browser automation packages; Ambient and ToolHive must manage browser runtime security updates.",
    evidenceRefs: [input.evidenceId],
  };
}

function deterministicToolHiveRuntimeImage(input: {
  registryType: "npm" | "pypi";
  fetches: McpAutowireDeterministicFetch[];
  browserRuntime: boolean;
}): string | undefined {
  if (input.registryType === "npm") return input.browserRuntime ? "node:22-alpine" : undefined;
  if (input.registryType !== "pypi") return undefined;
  const manifestDeps = input.fetches
    .filter((fetch) => fetch.status === "fetched" && fetch.textPreview && /pyproject\.toml/i.test(fetch.url))
    .flatMap((fetch) =>
      extractMcpAutowireManifestFacts([{ locator: fetch.url, text: fetch.textPreview ?? "" }]).manifests.flatMap(
        (manifest) => manifest.dependencies,
      ),
    )
    .join("\n");
  if (/\b(?:onnxruntime|fastembed)\b/i.test(manifestDeps)) return "python:3.11-slim";
  return undefined;
}

function browserRuntimeManifestSignals(fetches: McpAutowireDeterministicFetch[]): string[] {
  return fetches
    .filter(
      (fetch) =>
        fetch.status === "fetched" &&
        fetch.textPreview &&
        /(?:package\.json|pyproject\.toml|registry\.npmjs\.org|pypi\.org\/pypi)/i.test(fetch.url),
    )
    .flatMap((fetch) => {
      const text = fetch.textPreview ?? "";
      const lowerUrl = fetch.url.toLowerCase();
      if (lowerUrl.endsWith("pyproject.toml")) {
        return extractMcpAutowireManifestFacts([{ locator: fetch.url, text }]).manifests.flatMap((manifest) => [
          manifest.packageName ?? "",
          ...manifest.dependencies,
        ]);
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
        const record = parsed as Record<string, unknown>;
        return [
          typeof record.name === "string" ? record.name : "",
          ...dependencyObjectKeys(record.dependencies),
          ...dependencyObjectKeys(record.optionalDependencies),
          ...dependencyObjectKeys(record.peerDependencies),
        ];
      } catch {
        return [];
      }
    })
    .filter((value): value is string => Boolean(value));
}

function dependencyObjectKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

function bestDeterministicEvidenceLocator(input: {
  target: McpAutowireDeterministicTarget;
  fetches: McpAutowireDeterministicFetch[];
  searches: McpAutowireDeterministicSearch[];
}): string {
  const fetchedReadme = input.fetches.find((fetch) => fetch.status === "fetched" && /readme\.mdx?$/i.test(fetch.url));
  if (fetchedReadme) return fetchedReadme.url;
  const searchedReadme = input.searches.flatMap((search) => search.results ?? []).find((result) => /readme\.mdx?$/i.test(result.path));
  return searchedReadme?.rawUrl ?? input.target.url.toString();
}

function displayNameForPackage(packageName: string): string {
  const [scope, rawLeaf] = packageName.startsWith("@") ? packageName.slice(1).split("/") : [undefined, packageName];
  const leaf = rawLeaf ?? packageName;
  const name =
    leaf
      .split(/[-_.]+/)
      .filter(Boolean)
      .map(displayNamePart)
      .join(" ") || packageName;
  if (scope && /^(mcp|server|mcp-server)$/i.test(leaf)) {
    const scopedName = scope
      .split(/[-_.]+/)
      .filter(Boolean)
      .map(displayNamePart)
      .join(" ");
    return scopedName ? `${scopedName} ${name}` : name;
  }
  return name;
}

function displayNamePart(part: string): string {
  if (/^mcp$/i.test(part)) return "MCP";
  if (/^api$/i.test(part)) return "API";
  return part.slice(0, 1).toUpperCase() + part.slice(1);
}

function safeCandidateId(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "standard-mcp"
  );
}

function packageRegistryMetadataUrl(target: { registryType: "npm" | "pypi"; identifier: string }): string | undefined {
  if (target.registryType === "npm") return npmRegistryMetadataUrl(target.identifier);
  if (target.registryType === "pypi") return `https://pypi.org/pypi/${encodeURIComponent(target.identifier)}/json`;
  return undefined;
}

function npmRegistryMetadataUrl(identifier: string): string {
  if (identifier.startsWith("@")) {
    const [scope, name] = identifier.split("/");
    if (scope && name) return `https://registry.npmjs.org/${encodeURIComponent(scope)}%2f${encodeURIComponent(name)}`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(identifier)}`;
}
