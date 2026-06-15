import { createHash } from "node:crypto";
import { validateToolArguments, type Tool, type ToolCall } from "@mariozechner/pi-ai";
import {
  callWorkflowPiJson,
  WorkflowPiJsonValidationError,
  type WorkflowPiTextCallInput,
} from "./workflowPiTransport";

export const JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS = 32_000;
export const JSON_REPAIR_TOOL_MAX_SCHEMA_CHARS = 24_000;
export const JSON_REPAIR_TOOL_MAX_VALIDATION_ERRORS = 20;
export const JSON_REPAIR_TOOL_MAX_REPAIR_INSTRUCTION_CHARS = 4_000;

export interface JsonRepairToolInput {
  schemaName: string;
  schema: Record<string, unknown>;
  invalidJsonText: string;
  validationErrors: string[];
  repairInstruction?: string;
  preserveSemantics: boolean;
}

export interface JsonRepairToolOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  signal?: AbortSignal;
  textCall?: (input: WorkflowPiTextCallInput) => Promise<string>;
  retryPolicy?: WorkflowPiTextCallInput["retryPolicy"];
  onProgress?: WorkflowPiTextCallInput["onProgress"];
  maxTokens?: number;
  maxValidationRetries?: number;
  idleTimeoutMs?: number;
  absoluteTimeoutMs?: number;
  enforceAbsoluteTimeout?: boolean;
}

export interface JsonRepairToolSuccess {
  repaired: true;
  schemaName: string;
  value: unknown;
  inputHash: string;
  schemaHash: string;
  repairedHash: string;
  validation: {
    valid: true;
  };
}

export interface JsonRepairToolFailure {
  repaired: false;
  schemaName: string;
  inputHash: string;
  schemaHash: string;
  validation: {
    valid: false;
    errors: string[];
  };
  missingInformation?: string[];
}

export type JsonRepairToolResult = JsonRepairToolSuccess | JsonRepairToolFailure;

interface JsonRepairPiResponse {
  repaired: boolean;
  value?: unknown;
  missingInformation?: string[];
  notes?: string;
}

const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "private key block", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { label: "secret assignment", pattern: /\b(?:api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i },
  { label: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { label: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/i },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/i },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

export function parseJsonRepairToolInput(raw: Record<string, unknown>): JsonRepairToolInput {
  const schemaName = requiredBoundedString(raw.schemaName, "schemaName", 128);
  const schema = objectSchema(raw.schema);
  const schemaText = stableJson(schema);
  if (schemaText.length > JSON_REPAIR_TOOL_MAX_SCHEMA_CHARS) {
    throw new Error(`schema is too large for ambient_json_repair (${schemaText.length} > ${JSON_REPAIR_TOOL_MAX_SCHEMA_CHARS} chars).`);
  }
  const invalidJsonText = requiredBoundedString(raw.invalidJsonText, "invalidJsonText", JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS);
  const validationErrors = requiredStringArray(raw.validationErrors, "validationErrors", JSON_REPAIR_TOOL_MAX_VALIDATION_ERRORS, 2_000);
  const repairInstruction = optionalBoundedString(raw.repairInstruction, "repairInstruction", JSON_REPAIR_TOOL_MAX_REPAIR_INSTRUCTION_CHARS);
  const preserveSemantics = typeof raw.preserveSemantics === "boolean" ? raw.preserveSemantics : true;
  return {
    schemaName,
    schema,
    invalidJsonText,
    validationErrors,
    ...(repairInstruction ? { repairInstruction } : {}),
    preserveSemantics,
  };
}

export async function repairJsonWithPi(input: JsonRepairToolInput, options: JsonRepairToolOptions): Promise<JsonRepairToolResult> {
  const inputHash = sha256Hex(input.invalidJsonText);
  const schemaHash = sha256Hex(stableJson(input.schema));
  const preflightErrors = jsonRepairPreflightErrors(input);
  if (preflightErrors.length) {
    return jsonRepairFailure(input, inputHash, schemaHash, preflightErrors);
  }

  try {
    const piResponse = await callWorkflowPiJson<JsonRepairPiResponse>({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      prompt: buildJsonRepairPrompt(input),
      schemaName: `${input.schemaName}_repair_result`,
      responseSchema: jsonRepairPiResponseSchema(input.schema),
      validate: (value) => validateJsonRepairPiResponse(value, input),
      reasoning: false,
      maxTokens: options.maxTokens ?? 4_096,
      maxValidationRetries: options.maxValidationRetries ?? 1,
      idleTimeoutMs: options.idleTimeoutMs,
      absoluteTimeoutMs: options.absoluteTimeoutMs,
      enforceAbsoluteTimeout: options.enforceAbsoluteTimeout,
      signal: options.signal,
      textCall: options.textCall,
      retryPolicy: options.retryPolicy,
      onProgress: options.onProgress,
    });

    if (!piResponse.repaired) {
      return {
        repaired: false,
        schemaName: input.schemaName,
        inputHash,
        schemaHash,
        validation: {
          valid: false,
          errors: ["Pi reported that the JSON cannot be repaired without inventing missing information."],
        },
        ...(piResponse.missingInformation?.length ? { missingInformation: piResponse.missingInformation } : {}),
      };
    }

    return {
      repaired: true,
      schemaName: input.schemaName,
      value: piResponse.value,
      inputHash,
      schemaHash,
      repairedHash: sha256Hex(stableJson(piResponse.value)),
      validation: { valid: true },
    };
  } catch (error) {
    const message = error instanceof WorkflowPiJsonValidationError
      ? sanitizeValidationError(error)
      : sanitizeValidationError(error);
    return jsonRepairFailure(input, inputHash, schemaHash, [message]);
  }
}

export function jsonRepairToolResultText(result: JsonRepairToolResult): string {
  if (!result.repaired) {
    const missing = result.missingInformation?.length
      ? `\nMissing information:\n${result.missingInformation.map((item) => `- ${item}`).join("\n")}`
      : "";
    return [
      `JSON repair failed for ${result.schemaName}.`,
      `Input sha256: ${result.inputHash}`,
      `Schema sha256: ${result.schemaHash}`,
      "Validation errors:",
      ...result.validation.errors.map((error) => `- ${error}`),
      missing,
    ].filter(Boolean).join("\n");
  }

  return [
    `JSON repair succeeded for ${result.schemaName}.`,
    `Input sha256: ${result.inputHash}`,
    `Schema sha256: ${result.schemaHash}`,
    `Repaired sha256: ${result.repairedHash}`,
    "Repaired value:",
    JSON.stringify(result.value, null, 2),
  ].join("\n");
}

export function validateJsonAgainstSchemaStrict(schema: Record<string, unknown>, value: unknown, label = "value"): unknown {
  const tool: Tool = {
    name: "ambient_json_repair_schema_validation",
    description: "Internal JSON schema validation for Ambient JSON repair.",
    parameters: schema,
  };
  const toolCall: ToolCall = {
    type: "toolCall",
    id: "ambient-json-repair-validation",
    name: tool.name,
    arguments: value as Record<string, unknown>,
  };
  let validated: unknown;
  try {
    validated = validateToolArguments(tool, toolCall);
  } catch (error) {
    throw new Error(`${label}: ${sanitizeValidationError(error)}`);
  }
  if (stableJson(validated) !== stableJson(value)) {
    throw new Error(`${label}: schema validation would require type coercion; return exact schema-valid JSON instead.`);
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function buildJsonRepairPrompt(input: JsonRepairToolInput): string {
  const semanticRule = input.preserveSemantics
    ? "Preserve the source semantics. Only fix syntax, quoting, escaping, type shape, missing punctuation, and schema violations that are directly inferable from the source text or validation errors."
    : "Prioritize producing schema-valid JSON. You may apply the repairInstruction when it intentionally changes values.";
  const instruction = input.repairInstruction ? `\nAdditional repair instruction:\n${input.repairInstruction}\n` : "";
  return [
    "You are repairing one invalid JSON payload after a deterministic schema validation failure.",
    semanticRule,
    "Do not invent facts or secrets. Do not include comments or markdown.",
    "Return repaired=false with missingInformation when a required value cannot be inferred without invention.",
    "When repaired=true, value must be exact JSON that validates against the supplied schema.",
    instruction,
    "Schema name:",
    input.schemaName,
    "JSON schema:",
    JSON.stringify(input.schema, null, 2),
    "Validation errors:",
    ...input.validationErrors.map((error) => `- ${error}`),
    "Invalid JSON text:",
    input.invalidJsonText,
  ].filter((part) => part !== "").join("\n");
}

function validateJsonRepairPiResponse(value: unknown, input: JsonRepairToolInput): JsonRepairPiResponse {
  const response = validateJsonAgainstSchemaStrict(jsonRepairPiResponseSchema(input.schema), value, "repair response") as JsonRepairPiResponse;
  if (response.repaired !== true) {
    return {
      repaired: false,
      missingInformation: boundedStrings(response.missingInformation, 10, 500),
      notes: optionalBoundedRuntimeString(response.notes, 1_000),
    };
  }
  if (!Object.prototype.hasOwnProperty.call(response, "value")) {
    throw new Error("repair response: value is required when repaired is true.");
  }
  validateJsonAgainstSchemaStrict(input.schema, response.value, "repaired value");
  const secretRisks = secretRiskReasons([{ label: "repaired value", text: stableJson(response.value) }]);
  if (secretRisks.length) {
    throw new Error("repaired value: output appears to contain secret-like material.");
  }
  return { repaired: true, value: response.value };
}

function jsonRepairPiResponseSchema(valueSchema: Record<string, unknown>): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["repaired"],
    properties: {
      repaired: {
        type: "boolean",
        description: "True when value contains repaired JSON that validates against the caller schema.",
      },
      value: valueSchema,
      missingInformation: {
        type: "array",
        maxItems: 10,
        items: { type: "string", maxLength: 500 },
        description: "Human-readable missing facts when repaired is false.",
      },
      notes: {
        type: "string",
        maxLength: 1000,
        description: "Optional concise explanation for repair failure.",
      },
    },
  };
  copyJsonSchemaDefinitions(valueSchema, schema);
  return schema;
}

function copyJsonSchemaDefinitions(from: Record<string, unknown>, to: Record<string, unknown>): void {
  for (const key of ["$defs", "definitions"]) {
    const value = from[key];
    if (value && typeof value === "object" && !Array.isArray(value)) to[key] = value;
  }
}

function jsonRepairPreflightErrors(input: JsonRepairToolInput): string[] {
  const errors: string[] = [];
  if (input.invalidJsonText.length > JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS) {
    errors.push(`invalidJsonText is too large (${input.invalidJsonText.length} > ${JSON_REPAIR_TOOL_MAX_INVALID_JSON_CHARS} chars).`);
  }
  const schemaText = stableJson(input.schema);
  if (schemaText.length > JSON_REPAIR_TOOL_MAX_SCHEMA_CHARS) {
    errors.push(`schema is too large (${schemaText.length} > ${JSON_REPAIR_TOOL_MAX_SCHEMA_CHARS} chars).`);
  }
  errors.push(
    ...secretRiskReasons([
      { label: "invalidJsonText", text: input.invalidJsonText },
      { label: "validationErrors", text: input.validationErrors.join("\n") },
      { label: "repairInstruction", text: input.repairInstruction ?? "" },
      { label: "schema", text: schemaText },
    ]).map((risk) => `Input rejected before model call because secret-like material was detected: ${risk}.`),
  );
  return errors;
}

function jsonRepairFailure(input: JsonRepairToolInput, inputHash: string, schemaHash: string, errors: string[]): JsonRepairToolFailure {
  return {
    repaired: false,
    schemaName: input.schemaName,
    inputHash,
    schemaHash,
    validation: {
      valid: false,
      errors: errors.map((error) => error.slice(0, 1_000)),
    },
  };
}

function secretRiskReasons(fields: Array<{ label: string; text: string }>): string[] {
  const risks: string[] = [];
  for (const field of fields) {
    if (!field.text) continue;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.pattern.test(field.text)) {
        risks.push(`${field.label} contains likely ${pattern.label}`);
        break;
      }
    }
  }
  return [...new Set(risks)];
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = sortJsonValue(record[key]);
  return sorted;
}

function sanitizeValidationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .split("\n\nReceived arguments:")[0]
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 1_000) || "Unknown JSON repair validation error.";
}

function objectSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("schema must be a JSON schema object.");
  return value as Record<string, unknown>;
}

function requiredBoundedString(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  if (value.length > maxChars) throw new Error(`${field} is too large (${value.length} > ${maxChars} chars).`);
  return value;
}

function optionalBoundedString(value: unknown, field: string, maxChars: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  if (value.length > maxChars) throw new Error(`${field} is too large (${value.length} > ${maxChars} chars).`);
  return value.trim() ? value : undefined;
}

function optionalBoundedRuntimeString(value: unknown, maxChars: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, maxChars) : undefined;
}

function requiredStringArray(value: unknown, field: string, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty string array.`);
  if (value.length > maxItems) throw new Error(`${field} has too many entries (${value.length} > ${maxItems}).`);
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) throw new Error(`${field}[${index}] must be a non-empty string.`);
    if (item.length > maxChars) throw new Error(`${field}[${index}] is too large (${item.length} > ${maxChars} chars).`);
    return item;
  });
}

function boundedStrings(value: unknown, maxItems: number, maxChars: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxChars));
  return items.length ? items : undefined;
}
