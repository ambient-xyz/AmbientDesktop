import type { AsyncLocalStorage } from "node:async_hooks";

import type { WorkflowProgramDryRunCall } from "./workflowProgramDryRunTypes";

export interface WorkflowProgramDryRunWorkflowRuntimeInput {
  calls: WorkflowProgramDryRunCall[];
  nodeContext: AsyncLocalStorage<{ nodeId?: string }>;
  currentNodeId: () => string | undefined;
}

export function createWorkflowProgramDryRunWorkflowRuntime(input: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    ...createWorkflowProgramDryRunControlRuntime(input),
    ...createWorkflowProgramDryRunPaginationRuntime(input),
    ...createWorkflowProgramDryRunCollectionRuntime(input),
    ...createWorkflowProgramDryRunDocumentRuntime(input),
    ...createWorkflowProgramDryRunModelRuntime(input),
    ...createWorkflowProgramDryRunReviewRuntime(input),
  };
}

function createWorkflowProgramDryRunControlRuntime({ calls, nodeContext, currentNodeId }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    step: async (name: string, optionsOrFn: unknown, maybeFn?: () => unknown) => {
      const options = typeof optionsOrFn === "function" ? undefined : (optionsOrFn as { nodeId?: string } | undefined);
      const fn = typeof optionsOrFn === "function" ? (optionsOrFn as () => unknown) : maybeFn;
      calls.push({ kind: "step", name, nodeId: options?.nodeId, input: options });
      return await nodeContext.run({ nodeId: options?.nodeId ?? currentNodeId() }, async () => await fn?.());
    },
    resumePoint: async (name: string, fn: () => unknown) => {
      calls.push({ kind: "step", name });
      return await fn();
    },
    batch: async <T, R>(
      items: T[],
      options: { name?: string; maxConcurrency?: number; nodeId?: string },
      fn: (item: T, index: number) => Promise<R> | R,
    ): Promise<R[]> => {
      calls.push({
        kind: "step",
        name: options.name ?? "batch",
        nodeId: options.nodeId,
        input: { total: items.length, maxConcurrency: options.maxConcurrency },
      });
      return Promise.all(items.map((item, index) => fn(item, index)));
    },
  };
}

function createWorkflowProgramDryRunPaginationRuntime({ calls }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    paginateTool: async (
      options: {
        name?: string;
        nodeId?: string;
        input?: Record<string, unknown>;
        pageQueries?: unknown[];
        queryInputPath?: string;
        pageSize?: number;
        maxItems: number;
        maxPages: number;
        itemsPath?: string;
        nextPageTokenPath?: string;
        pageTokenInputPath?: string;
        pageSizeInputPath?: string;
        dedupeKeyPath?: string;
      },
      fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
    ) => {
      calls.push({
        kind: "step",
        name: options.name ?? "paginate tool",
        nodeId: options.nodeId,
        input: { maxItems: options.maxItems, maxPages: options.maxPages, pageSize: options.pageSize },
      });
      const items: unknown[] = [];
      const pages: unknown[] = [];
      const seen = new Set<string>();
      const pageQueries = (options.pageQueries ?? []).filter(
        (query): query is string => typeof query === "string" && query.trim().length > 0,
      );
      let nextPageToken: string | undefined;
      for (let pageIndex = 0; pageIndex < options.maxPages && items.length < options.maxItems; pageIndex += 1) {
        const pageQuery = pageQueries[pageIndex];
        if (pageIndex > 0 && !nextPageToken && pageQuery === undefined) break;
        const pageInput = JSON.parse(JSON.stringify(options.input ?? {})) as Record<string, unknown>;
        if (options.pageSize !== undefined && options.pageSizeInputPath) {
          setPath(pageInput, options.pageSizeInputPath, options.pageSize);
        }
        if (pageQuery !== undefined) setPath(pageInput, options.queryInputPath ?? "query", pageQuery);
        if (nextPageToken) setPath(pageInput, options.pageTokenInputPath ?? "pageToken", nextPageToken);
        const page = await fetchPage(pageInput, pageIndex);
        pages.push(page);
        const pageItems = readPath(page, options.itemsPath ?? "items");
        if (!Array.isArray(pageItems)) {
          throw new Error(`Paginated tool dry-run page ${pageIndex + 1} did not return array at ${options.itemsPath ?? "items"}.`);
        }
        for (const item of pageItems) {
          if (items.length >= options.maxItems) break;
          const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
          if (dedupeKey !== undefined && dedupeKey !== null) {
            const key = String(dedupeKey);
            if (seen.has(key)) continue;
            seen.add(key);
          }
          items.push(item);
        }
        const rawNextPageToken = options.nextPageTokenPath ? readPath(page, options.nextPageTokenPath) : undefined;
        nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      }
      return {
        items,
        pages,
        count: items.length,
        pageCount: pages.length,
        truncated: items.length >= options.maxItems || Boolean(nextPageToken && pages.length >= options.maxPages),
        ...(nextPageToken ? { nextPageToken } : {}),
        maxItems: options.maxItems,
        maxPages: options.maxPages,
        ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
      };
    },
    paginateConnector: async (
      options: {
        name?: string;
        nodeId?: string;
        input?: Record<string, unknown>;
        pageSize?: number;
        maxItems: number;
        maxPages: number;
        itemsPath?: string;
        nextPageTokenPath?: string;
        pageTokenInputPath?: string;
        pageSizeInputPath?: string;
        dedupeKeyPath?: string;
      },
      fetchPage: (pageInput: Record<string, unknown>, pageIndex: number) => Promise<unknown> | unknown,
    ) => {
      calls.push({
        kind: "step",
        name: options.name ?? "paginate",
        nodeId: options.nodeId,
        input: { maxItems: options.maxItems, maxPages: options.maxPages, pageSize: options.pageSize },
      });
      const items: unknown[] = [];
      const pages: unknown[] = [];
      const seen = new Set<string>();
      let nextPageToken: string | undefined;
      for (let pageIndex = 0; pageIndex < options.maxPages && items.length < options.maxItems; pageIndex += 1) {
        if (pageIndex > 0 && !nextPageToken) break;
        const pageInput = JSON.parse(JSON.stringify(options.input ?? {})) as Record<string, unknown>;
        if (options.pageSize !== undefined && options.pageSizeInputPath) {
          setPath(pageInput, options.pageSizeInputPath, options.pageSize);
        }
        if (nextPageToken) setPath(pageInput, options.pageTokenInputPath ?? "pageToken", nextPageToken);
        const page = await fetchPage(pageInput, pageIndex);
        pages.push(page);
        const pageItems = readPath(page, options.itemsPath ?? "items");
        if (!Array.isArray(pageItems)) {
          throw new Error(`Paginated connector dry-run page ${pageIndex + 1} did not return array at ${options.itemsPath ?? "items"}.`);
        }
        for (const item of pageItems) {
          if (items.length >= options.maxItems) break;
          const dedupeKey = options.dedupeKeyPath ? readPath(item, options.dedupeKeyPath) : undefined;
          if (dedupeKey !== undefined && dedupeKey !== null) {
            const key = String(dedupeKey);
            if (seen.has(key)) continue;
            seen.add(key);
          }
          items.push(item);
        }
        const rawNextPageToken = readPath(page, options.nextPageTokenPath ?? "nextPageToken");
        nextPageToken = typeof rawNextPageToken === "string" && rawNextPageToken ? rawNextPageToken : undefined;
      }
      return {
        items,
        pages,
        count: items.length,
        pageCount: pages.length,
        truncated: items.length >= options.maxItems || Boolean(nextPageToken && pages.length >= options.maxPages),
        ...(nextPageToken ? { nextPageToken } : {}),
        maxItems: options.maxItems,
        maxPages: options.maxPages,
        ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
      };
    },
  };
}

function createWorkflowProgramDryRunCollectionRuntime({ calls }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    mapCollection: async <T, R>(
      items: T[],
      options: { name?: string; nodeId?: string; maxItems: number },
      mapItem: (item: T, index: number) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.mapCollection dry-run items must be an array.");
      calls.push({
        kind: "step",
        name: options.name ?? "map collection",
        nodeId: options.nodeId,
        input: { maxItems: options.maxItems, sourceCount: items.length },
      });
      const selected = items.slice(0, options.maxItems);
      const mapped = await Promise.all(selected.map((item, index) => mapItem(item, index)));
      return {
        items: mapped,
        count: mapped.length,
        sourceCount: items.length,
        truncated: items.length > options.maxItems,
        maxItems: options.maxItems,
      };
    },
    dedupeCollection: async (
      items: unknown[],
      options: { name?: string; nodeId?: string; keyPath?: string; strategy?: "exact" | "url_canonical"; maxItems: number },
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.dedupeCollection dry-run items must be an array.");
      const strategy = options.strategy ?? "url_canonical";
      calls.push({
        kind: "step",
        name: options.name ?? "dedupe collection",
        nodeId: options.nodeId,
        input: { maxItems: options.maxItems, keyPath: options.keyPath, strategy, sourceCount: items.length },
      });
      const retained: unknown[] = [];
      const seen = new Set<string>();
      let duplicateCount = 0;
      let uniqueCount = 0;
      for (const [index, item] of items.entries()) {
        const key = dryRunCollectionDedupeKey(item, { keyPath: options.keyPath, strategy }, index);
        if (seen.has(key)) {
          duplicateCount += 1;
          continue;
        }
        seen.add(key);
        uniqueCount += 1;
        if (retained.length < options.maxItems) retained.push(item);
      }
      return {
        items: retained,
        count: retained.length,
        sourceCount: items.length,
        duplicateCount,
        truncated: uniqueCount > options.maxItems,
        maxItems: options.maxItems,
        ...(options.keyPath ? { keyPath: options.keyPath } : {}),
        strategy,
      };
    },
    chunkCollection: async (items: unknown[], options: { name?: string; nodeId?: string; chunkSize: number; maxChunks: number }) => {
      if (!Array.isArray(items)) throw new Error("workflow.chunkCollection dry-run items must be an array.");
      calls.push({
        kind: "step",
        name: options.name ?? "chunk collection",
        nodeId: options.nodeId,
        input: { chunkSize: options.chunkSize, maxChunks: options.maxChunks, sourceCount: items.length },
      });
      const maxItems = options.chunkSize * options.maxChunks;
      const selected = items.slice(0, maxItems);
      const chunks = [];
      for (let start = 0; start < selected.length && chunks.length < options.maxChunks; start += options.chunkSize) {
        const chunkItems = selected.slice(start, start + options.chunkSize);
        chunks.push({
          id: `${options.nodeId ?? "chunk"}-${chunks.length + 1}`,
          index: chunks.length,
          start,
          end: start + chunkItems.length,
          count: chunkItems.length,
          items: chunkItems,
        });
      }
      return {
        chunks,
        count: chunks.length,
        itemCount: selected.length,
        sourceCount: items.length,
        truncated: items.length > maxItems,
        chunkSize: options.chunkSize,
        maxChunks: options.maxChunks,
      };
    },
  };
}

function createWorkflowProgramDryRunDocumentRuntime({ calls }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    renderDocument: async (
      input: unknown,
      options: { name?: string; nodeId?: string; title?: unknown; format?: "markdown" | "html" | "pdf"; path?: string },
    ) => {
      const format = options.format ?? "markdown";
      const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : (options.name ?? "Workflow Report");
      const extension = format === "markdown" ? "md" : format;
      const path =
        options.path ??
        `reports/${
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "workflow-report"
        }.${extension}`;
      const body =
        typeof input === "string"
          ? input
          : input && typeof input === "object" && !Array.isArray(input) && typeof (input as Record<string, unknown>).content === "string"
            ? String((input as Record<string, unknown>).content)
            : JSON.stringify(input ?? {}, null, 2);
      const markdown = body.trim().startsWith("#") ? `${body.trim()}\n` : `# ${title}\n\n${body.trim()}\n`;
      const content =
        format === "markdown"
          ? markdown
          : format === "html"
            ? `<!doctype html>\n<title>${title}</title>\n<pre>${markdown}</pre>\n`
            : `%PDF-1.4\n% mock dry-run PDF for ${title}\n`;
      calls.push({ kind: "document", name: options.name ?? "render document", nodeId: options.nodeId, input: { format, path } });
      return {
        title,
        format,
        mimeType: format === "pdf" ? "application/pdf" : format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
        artifactPath: path,
        path,
        content,
        bytes: content.length,
        sourceChars: body.length,
        truncated: false,
      };
    },
  };
}

function createWorkflowProgramDryRunModelRuntime({ calls }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    mapModel: async <T, R>(
      items: T[],
      options: { name?: string; nodeId?: string; maxItems: number; maxConcurrency?: number },
      mapItem: (item: T, index: number) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.mapModel dry-run items must be an array.");
      calls.push({
        kind: "step",
        name: options.name ?? "map model",
        nodeId: options.nodeId,
        input: { maxItems: options.maxItems, maxConcurrency: options.maxConcurrency, sourceCount: items.length },
      });
      const selected = items.slice(0, options.maxItems);
      const mapped = await Promise.all(selected.map(async (item, index) => ({ item, result: await mapItem(item, index), index })));
      return {
        items: mapped,
        results: mapped.map((item) => item.result),
        count: mapped.length,
        sourceCount: items.length,
        truncated: items.length > options.maxItems,
        maxItems: options.maxItems,
        maxConcurrency: options.maxConcurrency ?? 1,
      };
    },
    reduceModel: async <R>(
      items: unknown[],
      options: {
        name?: string;
        nodeId?: string;
        maxInputItems: number;
        strategy?: "single_pass" | "tree";
        maxFanIn?: number;
        maxLevels?: number;
      },
      reduceItems: (
        items: unknown[],
        context: {
          sourceCount: number;
          selectedCount: number;
          truncated: boolean;
          strategy: "single_pass" | "tree";
          level?: number;
          groupIndex?: number;
          groupCount?: number;
          maxFanIn?: number;
          maxLevels?: number;
          final?: boolean;
          inputCount?: number;
          outputCount?: number;
          modelCallIndex?: number;
        },
      ) => Promise<R> | R,
    ) => {
      if (!Array.isArray(items)) throw new Error("workflow.reduceModel dry-run items must be an array.");
      calls.push({
        kind: "step",
        name: options.name ?? "reduce model",
        nodeId: options.nodeId,
        input: {
          maxInputItems: options.maxInputItems,
          strategy: options.strategy,
          maxFanIn: options.maxFanIn,
          maxLevels: options.maxLevels,
          sourceCount: items.length,
        },
      });
      const selected = items.slice(0, options.maxInputItems);
      const strategy = options.strategy ?? "single_pass";
      const baseContext = {
        sourceCount: items.length,
        selectedCount: selected.length,
        truncated: items.length > options.maxInputItems,
        strategy,
      };
      if (strategy !== "tree") return reduceItems(selected, baseContext);
      const maxFanIn = normalizeDryRunTreeFanIn(options.maxFanIn);
      const maxLevels = normalizeDryRunTreeLevels(options.maxLevels);
      let current: unknown[] = selected;
      let level = 0;
      let modelCallIndex = 0;
      while (current.length > maxFanIn) {
        if (level >= maxLevels) {
          throw new Error(
            `workflow.reduceModel dry-run tree strategy could not reduce ${current.length} items within maxLevels ${maxLevels} using maxFanIn ${maxFanIn}.`,
          );
        }
        const groups = chunkDryRunItems(current, maxFanIn);
        current = await Promise.all(
          groups.map((group, groupIndex) =>
            reduceItems(group, {
              ...baseContext,
              selectedCount: group.length,
              level,
              groupIndex,
              groupCount: groups.length,
              maxFanIn,
              maxLevels,
              final: false,
              inputCount: current.length,
              outputCount: groups.length,
              modelCallIndex: modelCallIndex++,
            }),
          ),
        );
        level += 1;
      }
      return reduceItems(current, {
        ...baseContext,
        selectedCount: current.length,
        level,
        groupIndex: 0,
        groupCount: 1,
        maxFanIn,
        maxLevels,
        final: true,
        inputCount: current.length,
        outputCount: 1,
        modelCallIndex,
      });
    },
  };
}

function createWorkflowProgramDryRunReviewRuntime({ calls, nodeContext, currentNodeId }: WorkflowProgramDryRunWorkflowRuntimeInput) {
  return {
    checkpoint: async (name: string, value: unknown) => {
      calls.push({ kind: "checkpoint", name, input: value });
      return value;
    },
    stageMutation: async (changeSet: unknown, apply: () => unknown, metadata?: { nodeId?: string }) => {
      calls.push({ kind: "mutation", name: metadata?.nodeId ?? "mutation", nodeId: metadata?.nodeId, input: changeSet });
      return await nodeContext.run({ nodeId: metadata?.nodeId ?? currentNodeId() }, async () => await apply());
    },
    askUser: async (prompt: string, options?: unknown, metadata?: { nodeId?: string }) => {
      if (!prompt.trim()) throw new Error("workflow.askUser prompt is required.");
      calls.push({ kind: "review", name: metadata?.nodeId ?? "review", nodeId: metadata?.nodeId, input: { prompt, options } });
      return { requestId: metadata?.nodeId ?? "review", choiceId: "approve", text: "Looks good, proceed" };
    },
    requireApproval: async (changeSet: unknown, metadata?: { nodeId?: string }) => {
      calls.push({ kind: "approval", name: metadata?.nodeId ?? "approval", nodeId: metadata?.nodeId, input: changeSet });
      return { id: metadata?.nodeId ?? "approval", changeSet, status: "approved" };
    },
    emit: async (event: { type?: string; componentOutputs?: unknown }) => {
      calls.push({ kind: "emit", name: event.type ?? "event", input: event });
      return event;
    },
  };
}

function readPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => (current == null ? undefined : (current as Record<string, unknown>)[key]), value);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const nested = current[part];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function dryRunCollectionDedupeKey(
  item: unknown,
  options: { keyPath?: string; strategy: "exact" | "url_canonical" },
  index: number,
): string {
  const rawKey = options.keyPath ? readPath(item, options.keyPath) : dryRunInferredCollectionDedupeKey(item);
  if (rawKey === undefined || rawKey === null) return `index:${index}`;
  const stringKey = typeof rawKey === "string" ? rawKey.trim() : JSON.stringify(rawKey);
  if (!stringKey) return `index:${index}`;
  if (options.strategy === "exact") return `exact:${stringKey}`;
  return `url:${dryRunCanonicalUrlKey(stringKey) ?? stringKey.toLowerCase()}`;
}

function dryRunInferredCollectionDedupeKey(item: unknown): unknown {
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const record = item as Record<string, unknown>;
  for (const key of ["canonicalUrl", "url", "link", "href", "id", "key"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return JSON.stringify(record);
}

function dryRunCanonicalUrlKey(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase();
      if (
        normalized.startsWith("utm_") ||
        ["fbclid", "gclid", "dclid", "gbraid", "wbraid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src", "spm"].includes(normalized)
      ) {
        url.searchParams.delete(key);
      }
    }
    const params = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    );
    url.search = "";
    for (const [key, paramValue] of params) url.searchParams.append(key, paramValue);
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeDryRunTreeFanIn(value: number | undefined): number {
  return Math.max(2, Math.min(64, Math.floor(value ?? 8)));
}

function normalizeDryRunTreeLevels(value: number | undefined): number {
  return Math.max(1, Math.min(12, Math.floor(value ?? 8)));
}

function chunkDryRunItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
