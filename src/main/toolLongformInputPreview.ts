import type { ToolLongformInputPreview, ToolLongformInputPreviewItem } from "../shared/types";

const DEFAULT_PREVIEW_CHARS = 1000;
const DEFAULT_LONGFORM_MIN_CHARS = 500;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|api[-_]?key|credential|authorization|cookie|private[-_]?key|passphrase)/i;
const GENERIC_LONGFORM_KEYS = new Set(["body", "code", "content", "html", "markdown", "source", "template", "text"]);
const GENERIC_LONGFORM_MAX_DEPTH = 5;
const GENERIC_LONGFORM_MAX_ITEMS = 4;

export function buildToolLongformInputPreview(
  toolName: string,
  args: unknown,
  options: { maxPreviewChars?: number; minPreviewChars?: number } = {},
): ToolLongformInputPreview | undefined {
  const record = recordValue(args);
  if (!record) return undefined;
  const normalized = toolName.toLowerCase();
  const maxPreviewChars = Math.max(0, Math.floor(options.maxPreviewChars ?? DEFAULT_PREVIEW_CHARS));
  const minPreviewChars = Math.max(0, Math.floor(options.minPreviewChars ?? DEFAULT_LONGFORM_MIN_CHARS));

  if (normalized === "write" || normalized === "file_write") {
    const path = pathField(record, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]);
    const content = textField(record, ["content", "newContent", "new_content", "replacement", "text"]);
    if (content === undefined) return undefined;
    const item = longformItem({
      label: "File",
      fieldPath: "content",
      path,
      content,
      maxPreviewChars,
    });
    return {
      kind: "longform-input",
      title: "Input",
      runningTitle: normalized === "file_write" ? "Writing file" : "Writing",
      summary: path ?? "content",
      items: [item],
    };
  }

  if (normalized === "ambient_capability_builder_apply_repair") {
    const rawFiles = Array.isArray(record.files) ? record.files : [];
    const items = rawFiles.flatMap((file, index): ToolLongformInputPreviewItem[] => {
      const fileRecord = recordValue(file);
      const path = pathField(fileRecord, ["path", "filePath", "file_path", "file", "targetPath", "target_path"]);
      const content = textField(fileRecord, ["content", "newContent", "new_content", "replacement", "text"]);
      if (!path || content === undefined) return [];
      const note = textField(fileRecord, ["rationale", "reason"]);
      return [
        longformItem({
          label: rawFiles.length === 1 ? "File" : `File ${index + 1}`,
          fieldPath: `files[${index}].content`,
          path,
          content,
          note,
          maxPreviewChars,
        }),
      ];
    });
    if (!items.length) return undefined;
    const packageName = textField(record, ["packageName", "package_name"]);
    const fileLabel = `${items.length.toLocaleString()} ${items.length === 1 ? "file" : "files"}`;
    const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
    return {
      kind: "longform-input",
      title: "Repair files",
      runningTitle: "Applying repair",
      summary: [packageName, fileLabel, `${totalChars.toLocaleString()} chars`].filter(Boolean).join(" · "),
      items,
    };
  }

  if (normalized === "browser_eval") {
    const code = textField(record, ["code"]);
    if (code === undefined || code.length < minPreviewChars) return undefined;
    const item = longformItem({
      label: "Code",
      fieldPath: "code",
      content: code,
      language: "javascript",
      maxPreviewChars,
    });
    return {
      kind: "longform-input",
      title: "Code",
      runningTitle: "Evaluating code",
      summary: `JavaScript · ${item.chars.toLocaleString()} chars`,
      items: [item],
    };
  }

  if (normalized === "google_workspace_call") {
    const methodId = textField(record, ["methodId", "method_id"]);
    const items: ToolLongformInputPreviewItem[] = [];
    const gmailDraft = recordValue(record.gmailDraft);
    const gmailBodyFields: Array<{ key: string; label: string; language: string }> = [
      { key: "textBody", label: "Gmail text body", language: "text" },
      { key: "htmlBody", label: "Gmail HTML body", language: "html" },
      { key: "body", label: "Gmail body", language: "text" },
    ];
    for (const field of gmailBodyFields) {
      const content = textField(gmailDraft, [field.key]);
      if (content === undefined || content.length < minPreviewChars) continue;
      items.push(
        longformItem({
          label: field.label,
          fieldPath: `gmailDraft.${field.key}`,
          content,
          language: field.language,
          maxPreviewChars,
        }),
      );
    }

    if (items.length === 0 && record.body !== undefined && !hasSensitiveKey(record.body)) {
      const body = textContentFromValue(record.body);
      if (body !== undefined && body.length >= minPreviewChars) {
        items.push(
          longformItem({
            label: "Request body",
            fieldPath: "body",
            content: body,
            language: typeof record.body === "string" ? "text" : "json",
            maxPreviewChars,
          }),
        );
      }
    }

    if (!items.length) return undefined;
    const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
    const bodyLabel = `${items.length.toLocaleString()} ${items.length === 1 ? "body" : "bodies"}`;
    return {
      kind: "longform-input",
      title: "Request body",
      runningTitle: "Calling Google Workspace",
      summary: [methodId, bodyLabel, `${totalChars.toLocaleString()} chars`].filter(Boolean).join(" · "),
      items,
    };
  }

  if (normalized === "ambient_cli") {
    const rawArgs = Array.isArray(record.args) ? record.args : [];
    const items = rawArgs.flatMap((arg, index): ToolLongformInputPreviewItem[] => {
      if (typeof arg !== "string" || arg.length < minPreviewChars || isSensitiveCliArg(rawArgs, index)) return [];
      const previousArg = typeof rawArgs[index - 1] === "string" ? rawArgs[index - 1] : undefined;
      return [
        longformItem({
          label: `args[${index}]`,
          fieldPath: `args[${index}]`,
          content: arg,
          language: cliArgLanguage(arg, previousArg),
          note: previousArg && previousArg.startsWith("-") ? `Flag: ${previousArg}` : undefined,
          maxPreviewChars,
        }),
      ];
    });
    if (!items.length) return undefined;
    const packageLabel = textField(record, ["packageName", "package_name", "packageId", "package_id"]);
    const command = textField(record, ["command", "commandName", "command_name"]);
    const argLabel = `${items.length.toLocaleString()} ${items.length === 1 ? "arg" : "args"}`;
    const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
    return {
      kind: "longform-input",
      title: "Arguments",
      runningTitle: "Running Ambient CLI",
      summary: [packageLabel, command, argLabel, `${totalChars.toLocaleString()} chars`].filter(Boolean).join(" · "),
      items,
    };
  }

  if (normalized === "ambient_workflows_update") {
    return ambientWorkflowsUpdateLongformInputPreview(record, { maxPreviewChars });
  }

  return genericLongformInputPreview(normalized, record, { maxPreviewChars, minPreviewChars });
}

function ambientWorkflowsUpdateLongformInputPreview(
  record: Record<string, unknown>,
  options: { maxPreviewChars: number },
): ToolLongformInputPreview | undefined {
  const draft = recordValue(record.draft);
  if (!draft || hasSensitiveKey(draft)) return undefined;

  const items: ToolLongformInputPreviewItem[] = [];
  const intent = textField(draft, ["intent"]);
  if (intent !== undefined) {
    items.push(
      longformItem({
        label: "Intent",
        fieldPath: "draft.intent",
        content: intent,
        language: "text",
        maxPreviewChars: options.maxPreviewChars,
      }),
    );
  }

  addWorkflowListItem(items, draft, "inputs", "Inputs", options.maxPreviewChars);
  addWorkflowExamplesItem(items, draft, options.maxPreviewChars);
  addWorkflowDoNotItem(items, draft, options.maxPreviewChars);
  addWorkflowListItem(items, draft, "validation", "Validation", options.maxPreviewChars);
  addWorkflowListItem(items, draft, "outputShape", "Output shape", options.maxPreviewChars);

  if (!items.length) return undefined;
  const title = textField(record, ["title"]) ?? intent;
  const id = textField(record, ["id"]);
  const baseVersion = numberField(record, ["baseVersion", "base_version"]);
  const exampleCount = arrayLength(draft.successfulExamples);
  const doNotCount = arrayLength(draft.doNot);
  const summary = [
    title ?? id ?? "Workflow playbook",
    baseVersion !== undefined ? `base v${baseVersion}` : undefined,
    exampleCount !== undefined ? countLabel(exampleCount, "example") : undefined,
    doNotCount !== undefined ? countLabel(doNotCount, "do-not pattern") : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    kind: "longform-input",
    title: "Workflow update",
    runningTitle: "Updating workflow playbook",
    summary,
    items,
  };
}

function addWorkflowListItem(
  items: ToolLongformInputPreviewItem[],
  draft: Record<string, unknown>,
  key: string,
  label: string,
  maxPreviewChars: number,
): void {
  const values = stringArray(draft[key]);
  if (!values.length) return;
  items.push(
    longformItem({
      label,
      fieldPath: `draft.${key}`,
      content: values.map((item) => `- ${item}`).join("\n"),
      language: "markdown",
      maxPreviewChars,
    }),
  );
}

function addWorkflowExamplesItem(
  items: ToolLongformInputPreviewItem[],
  draft: Record<string, unknown>,
  maxPreviewChars: number,
): void {
  const examples = Array.isArray(draft.successfulExamples) ? draft.successfulExamples : [];
  const lines = examples.flatMap((example): string[] => {
    const record = recordValue(example);
    const toolName = textField(record, ["toolName", "tool_name"]);
    if (!toolName) return [];
    const input = textField(record, ["inputPreview", "input_preview"]);
    const result = textField(record, ["resultPreview", "result_preview"]);
    const artifactPath = pathField(record, ["artifactPath", "artifact_path"]);
    return [
      [
        `- ${toolName}`,
        input ? `input: ${input}` : undefined,
        result ? `result: ${result}` : undefined,
        artifactPath ? `artifact: ${artifactPath}` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
    ];
  });
  if (!lines.length) return;
  items.push(
    longformItem({
      label: "Successful examples",
      fieldPath: "draft.successfulExamples",
      content: lines.join("\n"),
      language: "markdown",
      maxPreviewChars,
    }),
  );
}

function addWorkflowDoNotItem(
  items: ToolLongformInputPreviewItem[],
  draft: Record<string, unknown>,
  maxPreviewChars: number,
): void {
  const patterns = Array.isArray(draft.doNot) ? draft.doNot : [];
  const lines = patterns.flatMap((pattern): string[] => {
    const record = recordValue(pattern);
    const status = textField(record, ["status"]);
    const reason = textField(record, ["reason"]);
    if (!status && !reason) return [];
    const toolName = textField(record, ["toolName", "tool_name"]);
    return [`- ${[status, toolName].filter(Boolean).join(" ")}${reason ? `: ${reason}` : ""}`];
  });
  if (!lines.length) return;
  items.push(
    longformItem({
      label: "Do not",
      fieldPath: "draft.doNot",
      content: lines.join("\n"),
      language: "markdown",
      maxPreviewChars,
    }),
  );
}

function longformItem(input: {
  label: string;
  fieldPath: string;
  path?: string;
  content: string;
  language?: string;
  note?: string;
  maxPreviewChars: number;
}): ToolLongformInputPreviewItem {
  const preview = previewText(input.content, input.maxPreviewChars);
  return {
    label: input.label,
    fieldPath: input.fieldPath,
    ...(input.path
      ? { path: input.path, language: languageFromPath(input.path) ?? input.language }
      : input.language
        ? { language: input.language }
        : {}),
    preview,
    chars: input.content.length,
    truncated: input.content.length > input.maxPreviewChars,
    ...(input.note ? { note: input.note } : {}),
  };
}

function previewText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 0) return "";
  return `${value.slice(0, maxChars)}\n...`;
}

function textContentFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  try {
    return JSON.stringify(value, undefined, 2);
  } catch {
    return undefined;
  }
}

function genericLongformInputPreview(
  toolName: string,
  record: Record<string, unknown>,
  options: { maxPreviewChars: number; minPreviewChars: number },
): ToolLongformInputPreview | undefined {
  const items = collectGenericLongformItems(record, [], options);
  if (!items.length) return undefined;
  const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
  const fieldLabel = `${items.length.toLocaleString()} ${items.length === 1 ? "field" : "fields"}`;
  return {
    kind: "longform-input",
    title: "Long input",
    runningTitle: "Calling tool",
    summary: [toolName, fieldLabel, `${totalChars.toLocaleString()} chars`].filter(Boolean).join(" · "),
    items,
  };
}

function collectGenericLongformItems(
  value: unknown,
  path: string[],
  options: { maxPreviewChars: number; minPreviewChars: number },
  depth = 0,
  items: ToolLongformInputPreviewItem[] = [],
): ToolLongformInputPreviewItem[] {
  if (items.length >= GENERIC_LONGFORM_MAX_ITEMS || depth > GENERIC_LONGFORM_MAX_DEPTH) return items;
  if (!value || typeof value !== "object") return items;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length && items.length < GENERIC_LONGFORM_MAX_ITEMS; index += 1) {
      collectGenericLongformItems(value[index], [...path, `[${index}]`], options, depth + 1, items);
    }
    return items;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (items.length >= GENERIC_LONGFORM_MAX_ITEMS) break;
    const nextPath = [...path, key];
    if (isSensitivePath(nextPath)) continue;

    if (GENERIC_LONGFORM_KEYS.has(normalizeFieldKey(key)) && !hasSensitiveKey(nested)) {
      const content = genericFieldContent(nested);
      if (content !== undefined && content.length >= options.minPreviewChars) {
        items.push(
          longformItem({
            label: genericFieldLabel(key),
            fieldPath: formatFieldPath(nextPath),
            content,
            language: genericFieldLanguage(key, content, nested),
            maxPreviewChars: options.maxPreviewChars,
          }),
        );
        continue;
      }
    }

    collectGenericLongformItems(nested, nextPath, options, depth + 1, items);
  }

  return items;
}

function genericFieldContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return textContentFromValue(value);
}

function genericFieldLanguage(key: string, content: string, value: unknown): string {
  const normalized = normalizeFieldKey(key);
  const parsed = parseJsonObjectOrArray(content);
  if (normalized === "markdown") return "markdown";
  if (normalized === "html" || /^<!doctype\b|^<html[\s>]/i.test(content.trimStart())) return "html";
  if (normalized === "code") return "javascript";
  if (parsed !== undefined || (value && typeof value === "object")) return "json";
  return "text";
}

function genericFieldLabel(key: string): string {
  const normalized = normalizeFieldKey(key);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeFieldKey(key: string): string {
  return key.replace(/[-_]/g, "").toLowerCase();
}

function formatFieldPath(path: string[]): string {
  return path.reduce((acc, part) => {
    if (part.startsWith("[")) return `${acc}${part}`;
    return acc ? `${acc}.${part}` : part;
  }, "");
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isSensitivePath(path: string[]): boolean {
  return path.some((part) => SENSITIVE_KEY_PATTERN.test(part));
}

function hasSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasSensitiveKey(item));
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) return true;
    if (hasSensitiveKey(nested)) return true;
  }
  return false;
}

function isSensitiveCliArg(args: unknown[], index: number): boolean {
  const arg = args[index];
  if (typeof arg !== "string") return false;
  if (sensitiveCliKey(arg)) return true;
  const parsed = parseJsonObjectOrArray(arg);
  if (parsed !== undefined && hasSensitiveKey(parsed)) return true;
  const previous = args[index - 1];
  return typeof previous === "string" && Boolean(sensitiveCliValueFlag(previous));
}

function sensitiveCliKey(value: string): string | undefined {
  const trimmed = value.trim();
  const envAssignment = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  if (envAssignment && SENSITIVE_KEY_PATTERN.test(envAssignment[1])) return envAssignment[1];
  const flag = trimmed.match(/^--?([^=\s]+)(?:=.*)?$/);
  if (flag && SENSITIVE_KEY_PATTERN.test(flag[1])) return flag[1];
  return undefined;
}

function sensitiveCliValueFlag(value: string): string | undefined {
  const flag = value.trim().match(/^--?([^=\s]+)$/);
  if (flag && SENSITIVE_KEY_PATTERN.test(flag[1])) return flag[1];
  return undefined;
}

function parseJsonObjectOrArray(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function cliArgLanguage(value: string, previousArg: string | undefined): string {
  const flag = previousArg?.replace(/^-+/, "").toLowerCase() ?? "";
  const trimmed = value.trimStart();
  if (flag.includes("html") || /^<!doctype\b|^<html[\s>]/i.test(trimmed)) return "html";
  if (flag.includes("markdown") || flag === "md") return "markdown";
  if (flag.includes("json") || parseJsonObjectOrArray(value) !== undefined) return "json";
  if (flag.includes("javascript") || flag === "js" || flag === "code") return "javascript";
  return "text";
}

function pathField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function textField(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function numberField(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function arrayLength(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function countLabel(count: number, singular: string): string {
  return `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;
}

function languageFromPath(path: string): string | undefined {
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension) return undefined;
  const languages: Record<string, string> = {
    css: "css",
    html: "html",
    htm: "html",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    sh: "shell",
    ts: "typescript",
    tsx: "tsx",
    txt: "text",
    yml: "yaml",
    yaml: "yaml",
  };
  return languages[extension];
}
