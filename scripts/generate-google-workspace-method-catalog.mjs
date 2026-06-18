#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "src/main/google-workspace/googleWorkspaceMethodCatalog.generated.ts");
const gwsBinary = process.env.AMBIENT_GWS_CLI_PATH || process.env.GOOGLE_WORKSPACE_CLI_PATH || "gws";
const catalogVersion = "gws-v0.22.3-generated-help-schema-1";

function runGws(args) {
  const result = spawnSync(gwsBinary, args, {
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`gws ${args.join(" ")} failed with ${result.status ?? "unknown"}\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function serviceEntries() {
  const entries = [];
  let inServices = false;
  for (const line of runGws(["--help"]).split(/\r?\n/)) {
    if (/^SERVICES:/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^(ENVIRONMENT:|EXIT CODES:|COMMUNITY:|DISCLAIMER:)/.test(line)) break;
    if (!inServices) continue;
    const match = line.match(/^\s{4}([^\s]+)\s{2,}(.+)$/);
    if (match) entries.push({ name: match[1], description: cleanText(match[2]) });
  }
  return entries;
}

function commandEntries(helpText) {
  const entries = [];
  let inCommands = false;
  for (const line of helpText.split(/\r?\n/)) {
    if (/^Commands:/.test(line)) {
      inCommands = true;
      continue;
    }
    if (inCommands && /^(Options:|Flags:|ENVIRONMENT:|EXIT CODES:|COMMUNITY:|DISCLAIMER:|Usage:)/.test(line)) break;
    if (!inCommands) continue;
    const match = line.match(/^\s{2}([^\s]+)\s{2,}(.+)$/);
    if (!match || match[1] === "help" || match[1].startsWith("+")) continue;
    entries.push({ name: match[1], description: cleanText(match[2]) });
  }
  return entries;
}

function discoverMethods() {
  const methods = [];
  const services = serviceEntries();
  for (const service of services) walk(service, []);
  return methods;

  function walk(service, path) {
    const entries = commandEntries(runGws([service.name, ...path, "--help"]));
    for (const entry of entries) {
      if (/^Operations on /.test(entry.description)) {
        walk(service, [...path, entry.name]);
        continue;
      }
      const id = [service.name, ...path, entry.name].join(".");
      const schema = JSON.parse(runGws(["schema", id]));
      methods.push(methodSummaryFromSchema(id, schema, {
        serviceDescription: service.description,
        helpDescription: entry.description,
      }));
    }
  }
}

function methodSummaryFromSchema(id, schema, context) {
  const parts = id.split(".");
  const httpMethod = cleanText(schema.httpMethod || "GET").toUpperCase();
  const description = briefText(schema.description || context.helpDescription || `Google Workspace API method ${id}.`, 360);
  return compactObject({
    id,
    service: parts[0],
    resource: parts.slice(1, -1).join("."),
    method: parts.at(-1),
    label: labelFromMethodId(id),
    description,
    httpMethod,
    path: optionalClean(schema.path),
    scopes: Array.isArray(schema.scopes) ? schema.scopes.filter((scope) => typeof scope === "string").map(cleanText) : [],
    sideEffect: classifySideEffect({ id, httpMethod, path: schema.path, scopes: schema.scopes, description }),
    dryRunSupported: httpMethod !== "GET",
    parameters: parametersFromSchema(schema),
    requestBody: requestBodyFromSchema(schema.requestBody),
  });
}

function parametersFromSchema(schema) {
  const parameters = schema && typeof schema.parameters === "object" && !Array.isArray(schema.parameters) ? schema.parameters : {};
  const order = Array.isArray(schema.parameterOrder) ? schema.parameterOrder.filter((name) => typeof name === "string") : [];
  const names = [...order, ...Object.keys(parameters).filter((name) => !order.includes(name))];
  return names
    .map((name) => {
      const parameter = parameters[name];
      if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) return undefined;
      return compactObject({
        name,
        location: optionalClean(parameter.location),
        type: schemaType(parameter),
        required: parameter.required === true,
        description: optionalBrief(parameter.description, 180),
        enum: Array.isArray(parameter.enum) ? parameter.enum.filter((value) => typeof value === "string").map(cleanText).slice(0, 20) : undefined,
        deprecated: parameter.deprecated === true ? true : undefined,
        default: optionalClean(parameter.default),
      });
    })
    .filter(Boolean);
}

function requestBodyFromSchema(requestBody) {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) return undefined;
  const schema = requestBody.schema && typeof requestBody.schema === "object" && !Array.isArray(requestBody.schema) ? requestBody.schema : {};
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((name) => typeof name === "string") : [];
  const fields = Object.entries(properties)
    .slice(0, 24)
    .map(([name, value]) => {
      const field = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      return compactObject({
        name,
        type: schemaType(field),
        required: required.includes(name) ? true : undefined,
        description: optionalBrief(field.description, 160),
        deprecated: field.deprecated === true ? true : undefined,
      });
    });
  return compactObject({
    schemaRef: optionalClean(requestBody.schemaRef || schema.$ref),
    description: optionalBrief(schema.description, 220),
    required: requestBody.required === true ? true : undefined,
    fields,
  });
}

function schemaType(schema) {
  if (!schema || typeof schema !== "object") return undefined;
  if (typeof schema.$ref === "string") return schema.$ref;
  if (typeof schema.type !== "string") return undefined;
  if (schema.type === "array" && schema.items && typeof schema.items === "object") {
    const itemType = schemaType(schema.items);
    return itemType ? `${itemType}[]` : "array";
  }
  return typeof schema.format === "string" ? `${schema.type}:${schema.format}` : schema.type;
}

function classifySideEffect(input) {
  const text = `${input.id} ${input.httpMethod} ${input.path || ""} ${(input.scopes || []).join(" ")} ${input.description || ""}`.toLowerCase();
  if (/\b(send|messages\.send|drafts\.send|spaces\.messages\.create)\b/.test(text)) return "external_communication";
  if (/\b(permissions?|acl|sharing|share)\b/.test(text) && input.httpMethod !== "GET") return "sharing_mutation";
  if (/\bdrafts?\b/.test(text) && input.httpMethod !== "GET") return "draft_write";
  if (input.httpMethod !== "GET") return "data_mutation";
  if (/\b(labels\.list|users\.getprofile|about\.get|calendarlist\.list|colors\.(get|list))\b/.test(text)) return "metadata_read";
  return "personal_content_read";
}

function labelFromMethodId(methodId) {
  return methodId
    .split(".")
    .map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" ");
}

function optionalClean(value) {
  return typeof value === "string" && value.trim() ? cleanText(value) : undefined;
}

function optionalBrief(value, limit) {
  return typeof value === "string" && value.trim() ? briefText(value, limit) : undefined;
}

function cleanText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function briefText(value, limit) {
  const text = cleanText(value);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...` : text;
}

function compactObject(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

const methods = discoverMethods().sort((left, right) => left.id.localeCompare(right.id));
const content = [
  "/* eslint-disable */",
  "// Generated by scripts/generate-google-workspace-method-catalog.mjs.",
  "// Do not edit by hand.",
  'import type { GoogleWorkspaceMethodSummary } from "../../shared/pluginTypes";',
  "",
  `export const GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG_VERSION = ${JSON.stringify(catalogVersion)};`,
  "",
  "export const GOOGLE_WORKSPACE_GENERATED_METHOD_CATALOG: GoogleWorkspaceMethodSummary[] = ",
  `${JSON.stringify(methods, null, 2)};`,
  "",
].join("\n");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content);
console.log(`Wrote ${methods.length} Google Workspace methods to ${outputPath}`);
