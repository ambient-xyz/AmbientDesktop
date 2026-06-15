#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyMcpDefaultCatalog(input = {}) {
  const resources = input.resources ?? join(process.cwd(), "resources");
  const catalogDir = join(resources, "mcp-catalog", "default");

  if (!existsAsDirectory(catalogDir)) {
    throw new Error(`MCP default catalog directory is missing: ${catalogDir}`);
  }

  const descriptors = readdirSync(catalogDir).filter((entry) => entry.endsWith(".json")).sort();
  if (!descriptors.length) throw new Error(`MCP default catalog has no JSON descriptors: ${catalogDir}`);

  for (const descriptor of descriptors) {
    const path = join(catalogDir, descriptor);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    verifyDescriptor(parsed, path);
  }

  return {
    catalogDir,
    descriptorCount: descriptors.length,
    descriptors,
  };
}

function verifyDescriptor(parsed, path) {
  if (!isRecord(parsed)) throw new Error(`${path}: descriptor must be an object`);
  if (parsed.schemaVersion !== "ambient-mcp-default-catalog-v1") throw new Error(`${path}: unsupported schemaVersion`);
  const serverId = requiredString(parsed.serverId, `${path}: serverId is required`);
  requiredString(parsed.title, `${path}: title is required`);
  requiredString(parsed.description, `${path}: description is required`);

  const source = requireRecord(parsed.source, `${path}: source must be an object`);
  if (source.type !== "toolhive-registry" && source.type !== "ambient-default-oci") {
    throw new Error(`${path}: source.type must be toolhive-registry or ambient-default-oci`);
  }
  if (source.type === "toolhive-registry" && source.registryId !== serverId) throw new Error(`${path}: source.registryId must match serverId`);
  requiredHttpsUrl(source.repositoryUrl, `${path}: source.repositoryUrl`);
  if (source.upstreamServerJsonUrl !== undefined) requiredHttpsUrl(source.upstreamServerJsonUrl, `${path}: source.upstreamServerJsonUrl`);
  requiredString(source.license, `${path}: source.license is required`);
  requiredIsoDate(source.reviewedAt, `${path}: source.reviewedAt`);
  requiredString(source.reviewedBy, `${path}: source.reviewedBy is required`);
  requiredStringArray(source.evidenceRefs, `${path}: source.evidenceRefs`, 1);
  if (parsed.defaultCapability !== undefined) verifyDefaultCapability(parsed.defaultCapability, path);

  const promotion = requireRecord(parsed.promotion, `${path}: promotion must be an object`);
  if (promotion.reviewStatus !== "reviewed") throw new Error(`${path}: promotion.reviewStatus must be reviewed`);
  requiredString(promotion.promotionReason, `${path}: promotion.promotionReason is required`);
  const smokeTest = requireRecord(promotion.smokeTest, `${path}: promotion.smokeTest must be an object`);
  if (smokeTest.status !== "passed" && smokeTest.status !== "not-run") throw new Error(`${path}: promotion.smokeTest.status must be passed or not-run`);
  if (source.type === "toolhive-registry" && smokeTest.status !== "passed") {
    throw new Error(`${path}: promotion.smokeTest.status must be passed for ToolHive registry packaged defaults`);
  }
  requiredString(smokeTest.summary, `${path}: promotion.smokeTest.summary is required`);
  requiredStringArray(smokeTest.evidenceRefs, `${path}: promotion.smokeTest.evidenceRefs`, 1);
  requiredStringArray(promotion.riskNotes, `${path}: promotion.riskNotes`, 0);

  const registryInfo = requireRecord(parsed.registryInfo, `${path}: registryInfo must be an object`);
  if (registryInfo.name !== serverId) throw new Error(`${path}: registryInfo.name must match serverId`);
  requiredString(registryInfo.title, `${path}: registryInfo.title is required`);
  requiredString(registryInfo.description, `${path}: registryInfo.description is required`);
  requiredString(registryInfo.transport, `${path}: registryInfo.transport is required`);
  requiredStringArray(registryInfo.tools, `${path}: registryInfo.tools`, 1);
  requirePinnedRegistryRuntime(registryInfo, path);
  if (source.type === "ambient-default-oci") {
    requiredStringArray(registryInfo.server_args, `${path}: registryInfo.server_args`, 1);
    if (!registryInfo.image.includes("@sha256:")) throw new Error(`${path}: ambient-default-oci registryInfo.image must be pinned by digest`);
    if (registryInfo.imageVerificationPolicy !== "ambient-reviewed") {
      throw new Error(`${path}: ambient-default-oci registryInfo.imageVerificationPolicy must be ambient-reviewed`);
    }
  }
}

function verifyDefaultCapability(value, path) {
  const capability = requireRecord(value, `${path}: defaultCapability must be an object`);
  if (capability.capabilityId !== "scrapling") throw new Error(`${path}: defaultCapability.capabilityId must be scrapling`);
  const workloadName = requiredString(capability.workloadName, `${path}: defaultCapability.workloadName is required`);
  if (!/^ambient-[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(workloadName)) {
    throw new Error(`${path}: defaultCapability.workloadName must be an Ambient ToolHive workload name`);
  }
  if (capability.autoInstall !== true) throw new Error(`${path}: defaultCapability.autoInstall must be true`);
}

function requirePinnedRegistryRuntime(registryInfo, path) {
  const image = optionalString(registryInfo.image);
  if (!image) throw new Error(`${path}: registryInfo.image is required for packaged ToolHive defaults`);
  if (image.endsWith(":latest")) throw new Error(`${path}: registryInfo.image must not use latest`);
  if (!image.includes("@sha256:") && !/:[^/:@]+$/.test(image)) {
    throw new Error(`${path}: registryInfo.image must include an exact tag or digest`);
  }
}

function requireRecord(value, message) {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function requiredString(value, message) {
  const found = optionalString(value);
  if (!found) throw new Error(message);
  return found;
}

function optionalString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredStringArray(value, label, minLength) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const strings = value.filter((entry) => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim());
  if (strings.length !== value.length) throw new Error(`${label} must contain only non-empty strings`);
  if (strings.length < minLength) throw new Error(`${label} must contain at least ${minLength} item(s)`);
  return strings;
}

function requiredHttpsUrl(value, label) {
  const text = requiredString(value, `${label} is required`);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use https`);
  return text;
}

function requiredIsoDate(value, label) {
  const text = requiredString(value, `${label} is required`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return text;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function existsAsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const resources = valueArg("--resources") ?? join(process.cwd(), "resources");
  const result = verifyMcpDefaultCatalog({ resources });
  console.log(`Verified ${result.descriptorCount} MCP default catalog descriptor(s) in ${result.catalogDir}`);
}
