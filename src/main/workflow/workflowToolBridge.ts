import type { WorkflowManifest } from "../../shared/workflowTypes";
import type { DesktopToolDescriptor } from "./workflowDesktopToolFacade";
import type { WorkflowEventSink, WorkflowToolHandler, WorkflowToolHandlers } from "./workflowAgentRuntime";

export interface WorkflowToolBridgeOptions {
  manifest: WorkflowManifest;
  descriptors: DesktopToolDescriptor[];
  handlers: WorkflowToolHandlers;
  dryRun?: boolean;
  dryRunHandlers?: WorkflowToolHandlers;
  eventSink?: WorkflowEventSink;
}

export function createWorkflowToolBridge(options: WorkflowToolBridgeOptions): WorkflowToolHandlers {
  const allowed = new Set(options.manifest.tools);
  const descriptors = new Map(options.descriptors.map((descriptor) => [descriptor.name, descriptor]));
  let calls = 0;

  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== "string") return undefined;
        if (!allowed.has(property)) {
          throw new Error(`Workflow manifest does not allow tool: ${property}`);
        }
        const descriptor = descriptors.get(property);
        if (!descriptor) throw new Error(`No Desktop tool descriptor registered for: ${property}`);
        const handler = options.handlers[property];
        if (!handler) throw new Error(`No Desktop tool handler registered for: ${property}`);
        return async (input: unknown) => {
          calls += 1;
          if (options.manifest.maxToolCalls !== undefined && calls > options.manifest.maxToolCalls) {
            throw new Error(`Workflow exceeded max tool calls (${options.manifest.maxToolCalls}).`);
          }
          return callTool({
            descriptor,
            handler,
            input,
            dryRun: options.dryRun,
            dryRunHandler: options.dryRunHandlers?.[property],
            eventSink: options.eventSink,
          });
        };
      },
    },
  ) as WorkflowToolHandlers;
}

async function callTool(input: {
  descriptor: DesktopToolDescriptor;
  handler: WorkflowToolHandler;
  input: unknown;
  dryRun?: boolean;
  dryRunHandler?: WorkflowToolHandler;
  eventSink?: WorkflowEventSink;
}): Promise<unknown> {
  const startedAt = Date.now();
  validateJsonObjectInput(input.descriptor, input.input);
  if (input.dryRun && input.dryRunHandler) {
    const result = await Promise.resolve(input.dryRunHandler(input.input));
    await input.eventSink?.append({
      type: "desktop-tool.dry_run",
      message: input.descriptor.name,
      data: {
        source: input.descriptor.source,
        sideEffects: input.descriptor.sideEffects,
        inputSummary: summarizeValue(input.input),
        outputSummary: summarizeValue(result),
        ...ambientCliEventMetadata(input.descriptor.name, input.input, result),
      },
    });
    return result;
  }
  if (input.dryRun && !input.descriptor.supportsDryRun) {
    const result = input.dryRunHandler
      ? await Promise.resolve(input.dryRunHandler(input.input))
      : { dryRun: true, skipped: true, toolName: input.descriptor.name, input: input.input };
    await input.eventSink?.append({
      type: "desktop-tool.dry_run",
      message: input.descriptor.name,
      data: {
        source: input.descriptor.source,
        sideEffects: input.descriptor.sideEffects,
        inputSummary: summarizeValue(input.input),
        outputSummary: summarizeValue(result),
        ...ambientCliEventMetadata(input.descriptor.name, input.input, result),
      },
    });
    return result;
  }
  await input.eventSink?.append({
    type: "desktop-tool.start",
    message: input.descriptor.name,
    data: {
      source: input.descriptor.source,
      sideEffects: input.descriptor.sideEffects,
      inputSummary: summarizeValue(input.input),
      ...ambientCliEventMetadata(input.descriptor.name, input.input),
    },
  });

  try {
    const result = await withTimeout(Promise.resolve(input.handler(input.input)), input.descriptor.defaultTimeoutMs, input.descriptor.name);
    await input.eventSink?.append({
      type: "desktop-tool.end",
      message: input.descriptor.name,
      data: {
        durationMs: Date.now() - startedAt,
        outputSummary: summarizeValue(result),
        ...ambientCliEventMetadata(input.descriptor.name, input.input, result),
      },
    });
    return result;
  } catch (error) {
    await input.eventSink?.append({
      type: "desktop-tool.error",
      message: input.descriptor.name,
      data: {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        ...ambientCliEventMetadata(input.descriptor.name, input.input),
      },
    });
    throw error;
  }
}

function summarizeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value.replace(/\s+/g, " ").trim(), 220);
  try {
    return truncate(JSON.stringify(value), 220);
  } catch {
    return truncate(String(value), 220);
  }
}

function ambientCliEventMetadata(toolName: string, input: unknown, output?: unknown): Record<string, unknown> {
  if (toolName !== "ambient_cli") return {};
  const ambientCliInput = summarizeAmbientCliInput(input);
  const ambientCliOutput = output === undefined ? undefined : summarizeAmbientCliOutput(output);
  return {
    ...(ambientCliInput ? { ambientCliInput } : {}),
    ...(ambientCliOutput ? { ambientCliOutput } : {}),
  };
}

function summarizeAmbientCliInput(input: unknown): Record<string, unknown> | undefined {
  const record = recordValue(input);
  if (!record) return undefined;
  const args = arrayOfStrings(record.args);
  return {
    ...(stringValue(record.packageId) ? { packageId: stringValue(record.packageId) } : {}),
    ...(stringValue(record.packageName) ? { packageName: stringValue(record.packageName) } : {}),
    ...(stringValue(record.command) ? { command: stringValue(record.command) } : {}),
    ...(args.length ? { args } : {}),
    ...(stringValue(record.cwd) ? { cwd: stringValue(record.cwd) } : {}),
  };
}

function summarizeAmbientCliOutput(output: unknown): Record<string, unknown> | undefined {
  const record = recordValue(output);
  if (!record) return undefined;
  const command = arrayOfStrings(record.command);
  return {
    ...(stringValue(record.packageId) ? { packageId: stringValue(record.packageId) } : {}),
    ...(stringValue(record.packageName) ? { packageName: stringValue(record.packageName) } : {}),
    ...(stringValue(record.commandName) ? { commandName: stringValue(record.commandName) } : {}),
    ...(command.length ? { command } : {}),
    ...(stringValue(record.cwd) ? { cwd: stringValue(record.cwd) } : {}),
    ...(numberValue(record.durationMs) !== undefined ? { durationMs: numberValue(record.durationMs) } : {}),
    ...(summarizeMaterializedTextOutput(record.stdoutOutput, stringValue(record.stdout)) ? { stdout: summarizeMaterializedTextOutput(record.stdoutOutput, stringValue(record.stdout)) } : {}),
    ...(summarizeMaterializedTextOutput(record.stderrOutput, stringValue(record.stderr)) ? { stderr: summarizeMaterializedTextOutput(record.stderrOutput, stringValue(record.stderr)) } : {}),
  };
}

function summarizeMaterializedTextOutput(output: unknown, fallbackText: string | undefined): Record<string, unknown> | undefined {
  const record = recordValue(output);
  const text = stringValue(record?.text) ?? fallbackText;
  if (!record && !text) return undefined;
  return {
    ...(text ? { preview: truncate(text.replace(/\s+/g, " ").trim(), 600) } : {}),
    ...(typeof record?.truncated === "boolean" ? { truncated: record.truncated } : {}),
    ...(numberValue(record?.totalChars) !== undefined ? { totalChars: numberValue(record?.totalChars) } : {}),
    ...(numberValue(record?.previewChars) !== undefined ? { previewChars: numberValue(record?.previewChars) } : {}),
    ...(stringValue(record?.artifactPath) ? { artifactPath: stringValue(record?.artifactPath) } : {}),
    ...(numberValue(record?.artifactBytes) !== undefined ? { artifactBytes: numberValue(record?.artifactBytes) } : {}),
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Desktop tool timed out after ${timeoutMs}ms: ${toolName}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateJsonObjectInput(descriptor: DesktopToolDescriptor, input: unknown): void {
  const schema = descriptor.inputSchema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const objectSchema = schema as {
    type?: unknown;
    properties?: Record<string, { type?: unknown }>;
    required?: unknown;
    additionalProperties?: unknown;
  };
  if (objectSchema.type !== "object") return;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${descriptor.name} input must be an object.`);
  }

  const record = input as Record<string, unknown>;
  const required = Array.isArray(objectSchema.required)
    ? objectSchema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const key of required) {
    if (!(key in record)) throw new Error(`${descriptor.name} input is missing required field: ${key}`);
  }

  const properties = objectSchema.properties ?? {};
  if (objectSchema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in properties)) throw new Error(`${descriptor.name} input has unexpected field: ${key}`);
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in record)) continue;
    const expectedType = propertySchema.type;
    if (typeof expectedType !== "string") continue;
    if (expectedType === "array" && !Array.isArray(record[key])) {
      throw new Error(`${descriptor.name} input field ${key} must be an array.`);
    }
    if (expectedType === "number" && (typeof record[key] !== "number" || !Number.isFinite(record[key]))) {
      throw new Error(`${descriptor.name} input field ${key} must be a number.`);
    }
    if (expectedType !== "array" && expectedType !== "number" && typeof record[key] !== expectedType) {
      throw new Error(`${descriptor.name} input field ${key} must be a ${expectedType}.`);
    }
  }
}
