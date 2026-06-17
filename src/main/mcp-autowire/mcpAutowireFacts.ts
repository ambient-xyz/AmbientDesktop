import { z } from "zod";

export const MCP_AUTOWIRE_TARGET_FACTS_SCHEMA_VERSION = "ambient-mcp-target-facts-v1";
export const MCP_AUTOWIRE_MANIFEST_FACTS_SCHEMA_VERSION = "ambient-mcp-manifest-facts-v1";
export const MCP_AUTOWIRE_SECRET_FACTS_SCHEMA_VERSION = "ambient-mcp-secret-facts-v1";

export const mcpAutowireTargetFactsSchema = z.object({
  schemaVersion: z.literal(MCP_AUTOWIRE_TARGET_FACTS_SCHEMA_VERSION),
  original: z.string().min(1),
  canonicalUrl: z.string().url(),
  sourceKind: z.enum(["github", "package", "remote-url", "https-url"]),
  package: z.object({
    registryType: z.enum(["npm", "pypi"]),
    identifier: z.string().min(1),
  }).strict().optional(),
  github: z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    branch: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    pathKind: z.enum(["tree", "blob"]).optional(),
  }).strict().optional(),
}).strict();

export const mcpAutowirePackageManifestFactSchema = z.object({
  kind: z.enum(["package-json", "pyproject-toml"]),
  locator: z.string().min(1),
  packageName: z.string().min(1).optional(),
  registryType: z.enum(["npm", "pypi"]).optional(),
  scriptNames: z.array(z.string().min(1)).default([]),
  scriptTargets: z.array(z.object({
    name: z.string().min(1),
    target: z.string().min(1).optional(),
  }).strict()).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  looksLikeMcp: z.boolean(),
}).strict();

export const mcpAutowireManifestFactsSchema = z.object({
  schemaVersion: z.literal(MCP_AUTOWIRE_MANIFEST_FACTS_SCHEMA_VERSION),
  manifests: z.array(mcpAutowirePackageManifestFactSchema).default([]),
}).strict();

export const mcpAutowireSecretFactSchema = z.object({
  name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  requiredness: z.enum(["required", "optional", "unknown"]),
  evidence: z.string().min(1),
}).strict();

export const mcpAutowireSecretFactsSchema = z.object({
  schemaVersion: z.literal(MCP_AUTOWIRE_SECRET_FACTS_SCHEMA_VERSION),
  secrets: z.array(mcpAutowireSecretFactSchema).default([]),
}).strict();

export type McpAutowireTargetFacts = z.infer<typeof mcpAutowireTargetFactsSchema>;
export type McpAutowirePackageManifestFact = z.infer<typeof mcpAutowirePackageManifestFactSchema>;
export type McpAutowireManifestFacts = z.infer<typeof mcpAutowireManifestFactsSchema>;
export type McpAutowireSecretFact = z.infer<typeof mcpAutowireSecretFactSchema>;
export type McpAutowireSecretFacts = z.infer<typeof mcpAutowireSecretFactsSchema>;

export function normalizeMcpAutowireTarget(value: string): McpAutowireTargetFacts {
  const original = value.trim();
  if (!original) throw new Error("MCP autowire targetUrl is required.");
  const packageTarget = parsePackageTarget(original);
  if (packageTarget) {
    return mcpAutowireTargetFactsSchema.parse({
      schemaVersion: MCP_AUTOWIRE_TARGET_FACTS_SCHEMA_VERSION,
      original,
      canonicalUrl: packageTargetUrl(packageTarget).toString(),
      sourceKind: "package",
      package: packageTarget,
    });
  }

  const normalized = normalizeSourceUrlString(original);
  const url = new URL(normalized);
  if (url.protocol !== "https:") throw new Error(`MCP autowire targetUrl must use HTTPS or a supported package/source shorthand, got ${url.protocol.replace(/:$/, "")}.`);
  if (url.username || url.password) throw new Error("MCP autowire targetUrl must not contain credentials.");
  const github = githubRepoFromUrl(url);
  const packageFromUrl = packageTargetFromUrl(url);
  return mcpAutowireTargetFactsSchema.parse({
    schemaVersion: MCP_AUTOWIRE_TARGET_FACTS_SCHEMA_VERSION,
    original,
    canonicalUrl: url.toString(),
    sourceKind: packageFromUrl ? "package" : github ? "github" : url.pathname.includes("/mcp") ? "remote-url" : "https-url",
    ...(packageFromUrl ? { package: packageFromUrl } : {}),
    ...(github ? { github } : {}),
  });
}

export function extractMcpAutowireManifestFacts(input: Array<{ locator: string; text: string }>): McpAutowireManifestFacts {
  const manifests = input.flatMap((entry) => {
    const lower = entry.locator.toLowerCase();
    if (lower.endsWith("package.json") || lower.includes("registry.npmjs.org")) {
      const fact = packageJsonManifestFact(entry.text, entry.locator);
      return fact ? [fact] : [];
    }
    if (lower.endsWith("pyproject.toml")) {
      const fact = pyprojectTomlManifestFact(entry.text, entry.locator);
      return fact ? [fact] : [];
    }
    return [];
  });
  return mcpAutowireManifestFactsSchema.parse({
    schemaVersion: MCP_AUTOWIRE_MANIFEST_FACTS_SCHEMA_VERSION,
    manifests,
  });
}

export function extractMcpAutowireSecretFacts(text: string): McpAutowireSecretFacts {
  const seen = new Map<string, McpAutowireSecretFact>();
  const matches = [...text.matchAll(/\b([A-Z_][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\b/g)];
  for (const match of matches) {
    const name = match[1];
    if (!name) continue;
    const index = match.index ?? 0;
    const evidence = compactWhitespace(text.slice(Math.max(0, index - 140), Math.min(text.length, index + name.length + 180)));
    if (secretEvidenceLooksDevelopmentOnly(evidence)) continue;
    const fact = {
      name,
      requiredness: secretRequiredness(evidence, name),
      evidence,
    };
    const current = seen.get(name);
    if (!current || secretRequirednessPriority(fact.requiredness) > secretRequirednessPriority(current.requiredness)) {
      seen.set(name, fact);
    }
  }
  return mcpAutowireSecretFactsSchema.parse({
    schemaVersion: MCP_AUTOWIRE_SECRET_FACTS_SCHEMA_VERSION,
    secrets: [...seen.values()],
  });
}

export function parsePackageTarget(value: string): McpAutowireTargetFacts["package"] | undefined {
  const trimmed = value.trim();
  const npmPrefixed = /^(?:npm|npx):(?:\/\/)?(.+)$/i.exec(trimmed)?.[1]?.trim();
  if (npmPrefixed && isSafePackageIdentifier(npmPrefixed, "npm")) {
    return { registryType: "npm", identifier: npmPrefixed };
  }
  const pypiPrefixed = /^(?:pypi|uvx):(?:\/\/)?(.+)$/i.exec(trimmed)?.[1]?.trim();
  if (pypiPrefixed && isSafePackageIdentifier(pypiPrefixed, "pypi")) {
    return { registryType: "pypi", identifier: pypiPrefixed };
  }
  if (trimmed.startsWith("@") && isSafePackageIdentifier(trimmed, "npm")) {
    return { registryType: "npm", identifier: trimmed };
  }
  return undefined;
}

export function packageTargetUrl(target: NonNullable<McpAutowireTargetFacts["package"]>): URL {
  if (target.registryType === "npm") return new URL(`https://www.npmjs.com/package/${target.identifier}`);
  return new URL(`https://pypi.org/project/${target.identifier}/`);
}

export function packageTargetFromUrl(url: URL): McpAutowireTargetFacts["package"] | undefined {
  const host = url.hostname.toLowerCase();
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (host === "www.npmjs.com" && parts[0] === "package" && parts[1]) {
    const identifier = parts[1].startsWith("@") && parts[2] ? `${parts[1]}/${parts[2]}` : parts[1];
    if (isSafePackageIdentifier(identifier, "npm")) return { registryType: "npm", identifier };
  }
  if (host === "pypi.org" && parts[0] === "project" && parts[1] && isSafePackageIdentifier(parts[1], "pypi")) {
    return { registryType: "pypi", identifier: parts[1] };
  }
  return undefined;
}

export function githubRepoFromUrl(url: URL): McpAutowireTargetFacts["github"] | undefined {
  if (url.hostname.toLowerCase() !== "github.com") return undefined;
  const [owner, repoRaw, pathKind, branch, ...pathParts] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (!owner || !repoRaw) return undefined;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return undefined;
  const subpath = githubTargetSubpath(pathKind, branch, pathParts);
  return { owner, repo, ...subpath };
}

function githubTargetSubpath(
  pathKind: string | undefined,
  branch: string | undefined,
  pathParts: string[],
): Pick<NonNullable<McpAutowireTargetFacts["github"]>, "branch" | "path" | "pathKind"> {
  if ((pathKind !== "tree" && pathKind !== "blob") || !branch || pathParts.length === 0) return {};
  if (!/^[A-Za-z0-9_.@/-]+$/.test(branch)) return {};
  if (!pathParts.every((part) => part && part !== "." && part !== ".." && !part.includes("\0"))) return {};
  return {
    branch,
    path: pathParts.join("/"),
    pathKind,
  };
}

export function isSafePackageIdentifier(value: string, registryType: "npm" | "pypi"): boolean {
  if (registryType === "npm") return /^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(value);
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function normalizeSourceUrlString(value: string): string {
  if (/^git\+https:\/\//i.test(value)) return value.replace(/^git\+/i, "");
  const githubShorthand = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git)?$/i.exec(value);
  if (githubShorthand?.[1] && githubShorthand[2]) {
    return `https://github.com/${githubShorthand[1]}/${githubShorthand[2].replace(/\.git$/i, "")}`;
  }
  return value;
}

function packageJsonManifestFact(text: string, locator: string): McpAutowirePackageManifestFact | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const packageName = typeof record.name === "string" ? record.name.trim() : undefined;
    const dependencies = dependencyNames(record);
    const scriptNames = record.scripts && typeof record.scripts === "object" && !Array.isArray(record.scripts)
      ? Object.keys(record.scripts)
      : [];
    const binTargets = packageJsonBinTargets(record.bin, packageName);
    const binNames = binTargets.map((target) => target.name);
    const looksLikeMcp = Boolean(packageName && /mcp|modelcontextprotocol/i.test(packageName)) ||
      dependencies.some((dependency) => /@modelcontextprotocol|^mcp$/i.test(dependency)) ||
      [...scriptNames, ...binNames].some((script) => /mcp|modelcontextprotocol/i.test(script));
    if (!packageName && !looksLikeMcp) return undefined;
    return mcpAutowirePackageManifestFactSchema.parse({
      kind: "package-json",
      locator,
      ...(packageName ? { packageName, registryType: "npm" } : {}),
      scriptNames: [...new Set([...scriptNames, ...binNames])],
      scriptTargets: binTargets,
      dependencies,
      looksLikeMcp,
    });
  } catch {
    return undefined;
  }
}

function pyprojectTomlManifestFact(text: string, locator: string): McpAutowirePackageManifestFact | undefined {
  const projectBlock = tomlSection(text, "project");
  const scriptsBlock = tomlSection(text, "project.scripts");
  const packageName = projectBlock ? tomlStringValue(projectBlock, "name") : undefined;
  const dependencies = projectBlock ? tomlStringArray(projectBlock, "dependencies") : [];
  const scriptNames = scriptsBlock
    ? [...scriptsBlock.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1]).filter((value): value is string => Boolean(value))
    : [];
  const scriptTargets = scriptsBlock
    ? [...scriptsBlock.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"/gm)]
      .map((match) => ({ name: match[1], target: match[2] }))
      .filter((entry): entry is { name: string; target: string } => Boolean(entry.name && entry.target))
    : [];
  const searchable = [packageName ?? "", ...dependencies, ...scriptNames].join("\n");
  const looksLikeMcp = /mcp|modelcontextprotocol/i.test(searchable);
  if (!packageName && !looksLikeMcp) return undefined;
  return mcpAutowirePackageManifestFactSchema.parse({
    kind: "pyproject-toml",
    locator,
    ...(packageName ? { packageName, registryType: "pypi" } : {}),
    scriptNames,
    scriptTargets,
    dependencies,
    looksLikeMcp,
  });
}

function packageJsonBinTargets(bin: unknown, packageName: string | undefined): Array<{ name: string; target?: string }> {
  if (bin && typeof bin === "object" && !Array.isArray(bin)) {
    return Object.entries(bin)
      .filter(([name, target]) => name && typeof target === "string")
      .map(([name, target]) => ({ name, target: target as string }));
  }
  if (typeof bin === "string" && packageName) return [{ name: packageName, target: bin }];
  return [];
}

function dependencyNames(record: Record<string, unknown>): string[] {
  const deps = [
    record.dependencies,
    record.devDependencies,
    record.peerDependencies,
    record.optionalDependencies,
  ];
  return [...new Set(deps.flatMap((entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.keys(entry) : []))];
}

function tomlSection(text: string, sectionName: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const sectionHeader = `[${sectionName}]`;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() === sectionHeader) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return undefined;
  const body: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

function tomlStringValue(section: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']`, "m").exec(section);
  return match?.[1]?.trim();
}

function tomlStringArray(section: string, key: string): string[] {
  const singleLine = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(section);
  const body = singleLine?.[1] ?? (() => {
    const start = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[`, "m").exec(section);
    if (!start || start.index === undefined) return undefined;
    const afterStart = section.slice(start.index + start[0].length);
    const end = afterStart.indexOf("]");
    return end >= 0 ? afterStart.slice(0, end) : undefined;
  })();
  if (!body) return [];
  return [...body.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));
}

function secretRequiredness(evidence: string, name: string): McpAutowireSecretFact["requiredness"] {
  const escapedName = escapeRegExp(name);
  const optionalPatterns = [
    /\b(optional|optionally|not\s+(?:be\s+)?required|without (?:a |an )?(?:token|key)|anonymous|higher rate limit|rate limit|no auth(?:entication)? needed|no api key)\b/i,
    /\bdefault(?:\s+value)?\s*(?:[:=|]|\s+is)?\s*(?:`?none`?|null|undefined|empty|false)\b/i,
    /\b(?:none|null|undefined)\s*(?:default|by default)\b/i,
    /\bmust\s+be\s+(?:`?none`?|null|undefined)\b/i,
    /\b(?:alternative|instead)\s+to\b/i,
    new RegExp(`\\b${escapedName}\\b[^\\n\\r]{0,140}\\b(?:optional|not\\s+(?:be\\s+)?required|default(?:\\s+value)?\\s*(?:[:=|]|\\s+is)?\\s*(?:none|null|undefined|empty|false))\\b`, "i"),
    new RegExp(`\\|\\s*(?:None|undefined|null)\\b[^\\n\\r]{0,140}\\b${escapedName}\\b`, "i"),
    new RegExp(`\\b${escapedName}\\b[^\\n\\r]{0,140}\\|\\s*(?:None|undefined|null)\\b`, "i"),
    new RegExp(`(?:default\\s*=\\s*(?:None|null|undefined)|=\\s*Field\\(\\s*default\\s*=\\s*None)[^\\n\\r]{0,180}\\b${escapedName}\\b`, "i"),
  ];
  if (optionalPatterns.some((pattern) => pattern.test(evidence))) return "optional";

  const requiredPatterns = [
    new RegExp(`\\b(?:required|requires?|needs?|must)\\b[^\\n\\r]{0,100}\\b${escapedName}\\b`, "i"),
    new RegExp(`\\b${escapedName}\\b[^\\n\\r]{0,100}\\b(?:is\\s+)?(?:required|requires?|needed)\\b`, "i"),
    new RegExp(`\\b(?:set|configure|provide|supply|pass)\\b[^\\n\\r]{0,80}\\b${escapedName}\\b`, "i"),
    /\b(required|requires?|needs?|must)\b[^.\n\r]{0,100}\b(?:api key|token|secret|password)\b/i,
  ];
  if (requiredPatterns.some((pattern) => pattern.test(evidence))) return "required";
  return "unknown";
}

function secretRequirednessPriority(requiredness: McpAutowireSecretFact["requiredness"]): number {
  if (requiredness === "optional") return 3;
  if (requiredness === "required") return 2;
  return 1;
}

function secretEvidenceLooksDevelopmentOnly(evidence: string): boolean {
  return /\b(?:evals?|mcp-eval|src\/evals|tests?|testing|coverage|jest|pytest|run-tests)\b/i.test(evidence) &&
    !/\b(?:runtime|server configuration|installation|install config|claude desktop|cursor|windsurf|mcpservers)\b/i.test(evidence);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
