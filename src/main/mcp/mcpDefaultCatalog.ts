import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const MCP_DEFAULT_CATALOG_SCHEMA_VERSION = "ambient-mcp-default-catalog-v1";

export interface McpDefaultCatalogDescriptor {
  schemaVersion: typeof MCP_DEFAULT_CATALOG_SCHEMA_VERSION;
  serverId: string;
  title: string;
  description: string;
  source: McpDefaultCatalogSource;
  defaultCapability?: McpDefaultCapabilityDescriptor;
  promotion: {
    reviewStatus: "reviewed";
    promotionReason: string;
    smokeTest: {
      status: "passed" | "not-run";
      summary: string;
      evidenceRefs: string[];
    };
    riskNotes: string[];
  };
  registryInfo: Record<string, unknown>;
}

export type McpDefaultCatalogSource =
  | {
      type: "toolhive-registry";
      registryId: string;
      repositoryUrl?: string;
      upstreamServerJsonUrl?: string;
      upstreamServerName?: string;
      license?: string;
      reviewedAt: string;
      reviewedBy: string;
      evidenceRefs: string[];
    }
  | {
      type: "ambient-default-oci";
      repositoryUrl: string;
      upstreamServerJsonUrl?: string;
      upstreamServerName?: string;
      license?: string;
      reviewedAt: string;
      reviewedBy: string;
      evidenceRefs: string[];
    };

export interface McpDefaultCapabilityDescriptor {
  capabilityId: "scrapling";
  workloadName: string;
  autoInstall: boolean;
}

export interface LoadDefaultMcpCatalogOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  resourcesPath?: string;
  catalogDir?: string;
}

export function loadDefaultMcpCatalog(options: LoadDefaultMcpCatalogOptions = {}): McpDefaultCatalogDescriptor[] {
  const dir = findDefaultCatalogDir(options);
  if (!dir) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => parseDefaultCatalogDescriptor(JSON.parse(readFileSync(join(dir, entry), "utf8")), join(dir, entry)));
}

export function defaultMcpCatalogByServerId(descriptors: readonly McpDefaultCatalogDescriptor[]): Map<string, McpDefaultCatalogDescriptor> {
  return new Map(descriptors.map((descriptor) => [descriptor.serverId, descriptor]));
}

export function mcpDefaultCatalogDescriptorHash(descriptor: McpDefaultCatalogDescriptor): string {
  return createHash("sha256").update(JSON.stringify(sortJsonValue(descriptor))).digest("hex");
}

export function parseDefaultCatalogDescriptor(value: unknown, label = "MCP default catalog descriptor"): McpDefaultCatalogDescriptor {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.schemaVersion !== MCP_DEFAULT_CATALOG_SCHEMA_VERSION) {
    throw new Error(`${label} has unsupported schemaVersion ${String(value.schemaVersion)}.`);
  }
  const serverId = requiredString(value.serverId, `${label}.serverId`);
  const title = requiredString(value.title, `${label}.title`);
  const description = requiredString(value.description, `${label}.description`);
  const source = parseSource(value.source, label);
  if (source.type === "toolhive-registry" && source.registryId !== serverId) throw new Error(`${label}.source.registryId must match serverId.`);
  const defaultCapability = parseDefaultCapability(value.defaultCapability, label);
  const promotion = parsePromotion(value.promotion, label);
  const registryInfo = isRecord(value.registryInfo) ? value.registryInfo : undefined;
  if (!registryInfo) throw new Error(`${label}.registryInfo must be an object.`);
  const registryName = requiredString(registryInfo.name, `${label}.registryInfo.name`);
  if (registryName !== serverId) throw new Error(`${label}.registryInfo.name must match serverId.`);
  return {
    schemaVersion: MCP_DEFAULT_CATALOG_SCHEMA_VERSION,
    serverId,
    title,
    description,
    source,
    ...(defaultCapability ? { defaultCapability } : {}),
    promotion,
    registryInfo,
  };
}

function findDefaultCatalogDir(options: LoadDefaultMcpCatalogOptions): string | undefined {
  const env = options.env ?? process.env;
  const candidates = [
    options.catalogDir,
    env.AMBIENT_MCP_DEFAULT_CATALOG_DIR,
    options.resourcesPath ? join(options.resourcesPath, "mcp-catalog", "default") : undefined,
    typeof process.resourcesPath === "string" ? join(process.resourcesPath, "mcp-catalog", "default") : undefined,
    join(options.cwd ?? process.cwd(), "resources", "mcp-catalog", "default"),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  return candidates.find((candidate) => existsAsDirectory(candidate));
}

function parseSource(value: unknown, label: string): McpDefaultCatalogDescriptor["source"] {
  if (!isRecord(value)) throw new Error(`${label}.source must be an object.`);
  if (value.type !== "toolhive-registry" && value.type !== "ambient-default-oci") {
    throw new Error(`${label}.source.type must be toolhive-registry or ambient-default-oci.`);
  }
  const common = {
    ...(optionalString(value.upstreamServerJsonUrl) ? { upstreamServerJsonUrl: optionalString(value.upstreamServerJsonUrl) } : {}),
    ...(optionalString(value.upstreamServerName) ? { upstreamServerName: optionalString(value.upstreamServerName) } : {}),
    ...(optionalString(value.license) ? { license: optionalString(value.license) } : {}),
    reviewedAt: requiredString(value.reviewedAt, `${label}.source.reviewedAt`),
    reviewedBy: requiredString(value.reviewedBy, `${label}.source.reviewedBy`),
    evidenceRefs: stringArray(value.evidenceRefs, `${label}.source.evidenceRefs`, 1),
  };
  if (value.type === "ambient-default-oci") {
    return {
      type: "ambient-default-oci",
      repositoryUrl: requiredString(value.repositoryUrl, `${label}.source.repositoryUrl`),
      ...common,
    };
  }
  return {
    type: "toolhive-registry",
    registryId: requiredString(value.registryId, `${label}.source.registryId`),
    ...(optionalString(value.repositoryUrl) ? { repositoryUrl: optionalString(value.repositoryUrl) } : {}),
    ...common,
  };
}

function parseDefaultCapability(value: unknown, label: string): McpDefaultCapabilityDescriptor | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${label}.defaultCapability must be an object.`);
  if (value.capabilityId !== "scrapling") throw new Error(`${label}.defaultCapability.capabilityId must be scrapling.`);
  const workloadName = requiredString(value.workloadName, `${label}.defaultCapability.workloadName`);
  if (!/^ambient-[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(workloadName)) {
    throw new Error(`${label}.defaultCapability.workloadName must be an Ambient ToolHive workload name.`);
  }
  return {
    capabilityId: "scrapling",
    workloadName,
    autoInstall: value.autoInstall === true,
  };
}

function parsePromotion(value: unknown, label: string): McpDefaultCatalogDescriptor["promotion"] {
  if (!isRecord(value)) throw new Error(`${label}.promotion must be an object.`);
  if (value.reviewStatus !== "reviewed") throw new Error(`${label}.promotion.reviewStatus must be reviewed.`);
  const smokeTest = isRecord(value.smokeTest) ? value.smokeTest : undefined;
  if (!smokeTest) throw new Error(`${label}.promotion.smokeTest must be an object.`);
  if (smokeTest.status !== "passed" && smokeTest.status !== "not-run") throw new Error(`${label}.promotion.smokeTest.status is invalid.`);
  return {
    reviewStatus: "reviewed",
    promotionReason: requiredString(value.promotionReason, `${label}.promotion.promotionReason`),
    smokeTest: {
      status: smokeTest.status,
      summary: requiredString(smokeTest.summary, `${label}.promotion.smokeTest.summary`),
      evidenceRefs: stringArray(smokeTest.evidenceRefs, `${label}.promotion.smokeTest.evidenceRefs`, 1),
    },
    riskNotes: stringArray(value.riskNotes, `${label}.promotion.riskNotes`, 0),
  };
}

function existsAsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function requiredString(value: unknown, label: string): string {
  const found = optionalString(value);
  if (!found) throw new Error(`${label} is required.`);
  return found;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stringArray(value: unknown, label: string, minLength: number): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const result = value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim());
  if (result.length < minLength) throw new Error(`${label} must contain at least ${minLength} item(s).`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortJsonValue(entry)]));
}
