import { createHash, randomUUID } from "node:crypto";
import type { WorkflowDiscoveryAccessRequest, WorkflowDiscoveryContextEvidence } from "../../shared/types";
import type { PluginMcpToolRegistration } from "../plugins/pluginHost";
import type { WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ITEMS = 3;
const REDACTED = "[REDACTED]";

export interface WorkflowDiscoveryContextGatherInput {
  workflowThreadId: string;
  projectPath: string;
  requestText: string;
  accessRequest: WorkflowDiscoveryAccessRequest;
  connectorDescriptors?: WorkflowConnectorDescriptor[];
  pluginRegistrations?: PluginMcpToolRegistration[];
}

export interface WorkflowDiscoveryContextGatherer {
  gather(input: WorkflowDiscoveryContextGatherInput): Promise<WorkflowDiscoveryContextEvidence | undefined>;
}

export class DefaultWorkflowDiscoveryContextGatherer implements WorkflowDiscoveryContextGatherer {
  constructor(private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number; maxItems?: number } = {}) {}

  async gather(input: WorkflowDiscoveryContextGatherInput): Promise<WorkflowDiscoveryContextEvidence | undefined> {
    const startedAt = Date.now();
    if (input.accessRequest.capability === "browser_network") {
      return this.gatherBrowserNetwork(input, startedAt);
    }
    if (input.accessRequest.capability === "connector_account_data" || input.accessRequest.capability === "connector_content") {
      return connectorEvidence(input, startedAt);
    }
    if (input.accessRequest.capability === "plugin_tool_execute") {
      return pluginEvidence(input, startedAt);
    }
    if (input.accessRequest.capability === "shell_command") {
      return noExecutionEvidence(input, "shell", "Shell command access was approved, but discovery did not execute a shell command.", startedAt);
    }
    if (input.accessRequest.capability === "browser_control" || input.accessRequest.capability === "browser_profile") {
      return noExecutionEvidence(input, "browser", "Browser access was approved, but discovery did not control a browser session or inspect a profile.", startedAt);
    }
    return undefined;
  }

  private async gatherBrowserNetwork(input: WorkflowDiscoveryContextGatherInput, startedAt: number): Promise<WorkflowDiscoveryContextEvidence> {
    const maxItems = Math.max(1, Math.min(Math.floor(this.options.maxItems ?? DEFAULT_MAX_ITEMS), 5));
    const usesArxiv = /\barxiv\b/i.test(`${input.requestText} ${input.accessRequest.targetLabel}`);
    if (!usesArxiv) {
      return noExecutionEvidence(input, "browser_network", "Browser network access was approved, but no bounded web gatherer matched the requested source.", startedAt);
    }
    const query = arxivQueryTerms(input.requestText);
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxItems}&sortBy=relevance&sortOrder=descending`;
    try {
      const text = await fetchTextWithTimeout(url, {
        fetchImpl: this.options.fetchImpl,
        timeoutMs: this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      const entries = parseArxivEntries(text, maxItems);
      return {
        id: evidenceId(input.accessRequest, "arxiv"),
        capability: input.accessRequest.capability,
        targetLabel: input.accessRequest.targetLabel,
        gatheredAt: new Date().toISOString(),
        provider: "arxiv",
        summary: entries.length
          ? `Gathered ${entries.length} arXiv result${entries.length === 1 ? "" : "s"} for discovery context.`
          : "arXiv returned no bounded discovery results.",
        items: entries,
        truncated: entries.length >= maxItems,
        redacted: true,
        timingMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        id: evidenceId(input.accessRequest, "arxiv-error"),
        capability: input.accessRequest.capability,
        targetLabel: input.accessRequest.targetLabel,
        gatheredAt: new Date().toISOString(),
        provider: "arxiv",
        summary: "Approved web context could not be gathered from arXiv.",
        items: [],
        redacted: true,
        error: error instanceof Error ? error.message.slice(0, 240) : "Unknown arXiv gather failure.",
        timingMs: Date.now() - startedAt,
      };
    }
  }
}

function connectorEvidence(input: WorkflowDiscoveryContextGatherInput, startedAt: number): WorkflowDiscoveryContextEvidence {
  const descriptor = input.connectorDescriptors?.find((connector) => input.accessRequest.targetLabel.toLowerCase().includes(connector.label.toLowerCase()));
  const operationItems =
    descriptor?.operations
      .filter((operation) => operation.sideEffects !== "write_external")
      .slice(0, DEFAULT_MAX_ITEMS)
      .map((operation) => ({
        id: stableItemId(`${descriptor.id}:${operation.name}`),
        title: operation.label,
        snippet: redactText(operation.description),
        sourceLabel: descriptor.label,
      })) ?? [];
  return {
    id: evidenceId(input.accessRequest, "connector-receipt"),
    capability: input.accessRequest.capability,
    targetLabel: input.accessRequest.targetLabel,
    gatheredAt: new Date().toISOString(),
    provider: "connector_policy_receipt",
    summary: descriptor
      ? `Recorded approved ${descriptor.label} discovery scope; no connector content operation was executed during discovery.`
      : "Recorded approved connector discovery scope; no connector operation was executed during discovery.",
    items: operationItems,
    truncated: Boolean(descriptor && descriptor.operations.length > operationItems.length),
    redacted: true,
    timingMs: Date.now() - startedAt,
  };
}

function pluginEvidence(input: WorkflowDiscoveryContextGatherInput, startedAt: number): WorkflowDiscoveryContextEvidence {
  const registration = input.pluginRegistrations?.find((plugin) => input.accessRequest.targetLabel.toLowerCase().includes(plugin.label.toLowerCase()));
  return {
    id: evidenceId(input.accessRequest, "plugin-receipt"),
    capability: input.accessRequest.capability,
    targetLabel: input.accessRequest.targetLabel,
    gatheredAt: new Date().toISOString(),
    provider: "plugin_policy_receipt",
    summary: registration
      ? `Recorded approved ${registration.launchPlan.pluginName} tool scope; the plugin tool was not executed during discovery.`
      : "Recorded approved plugin tool scope; the plugin tool was not executed during discovery.",
    items: registration
      ? [
          {
            id: stableItemId(`${registration.launchPlan.pluginName}:${registration.registeredName}`),
            title: registration.label,
            snippet: redactText(registration.description),
            sourceLabel: registration.launchPlan.pluginName,
          },
        ]
      : [],
    redacted: true,
    timingMs: Date.now() - startedAt,
  };
}

function noExecutionEvidence(
  input: WorkflowDiscoveryContextGatherInput,
  provider: string,
  summary: string,
  startedAt: number,
): WorkflowDiscoveryContextEvidence {
  return {
    id: evidenceId(input.accessRequest, provider),
    capability: input.accessRequest.capability,
    targetLabel: input.accessRequest.targetLabel,
    gatheredAt: new Date().toISOString(),
    provider,
    summary,
    items: [],
    redacted: true,
    timingMs: Date.now() - startedAt,
  };
}

async function fetchTextWithTimeout(url: string, input: { fetchImpl?: typeof fetch; timeoutMs: number }): Promise<string> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), input.timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(url, {
      signal: abortController.signal,
      headers: { Accept: "application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8" },
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error(`Request timed out after ${input.timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function arxivQueryTerms(requestText: string): string {
  const preferred = ["kv", "cache", "transformer", "inference", "prefix", "optimization"].filter((term) => new RegExp(`\\b${term}\\b`, "i").test(requestText));
  if (preferred.length >= 2) return preferred.slice(0, 5).join(" AND ");
  const words = requestText
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["workflow", "agent", "agents", "search", "current", "research", "build", "draft"].includes(word));
  return (words.length ? words.slice(0, 5) : ["workflow", "agents"]).join(" AND ");
}

function parseArxivEntries(xml: string, maxItems: number): WorkflowDiscoveryContextEvidence["items"] {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, maxItems);
  return entries.map((entry, index) => {
    const body = entry[1] ?? "";
    const sourceUrl = xmlText(body, "id");
    const title = xmlText(body, "title") || `arXiv result ${index + 1}`;
    const summary = xmlText(body, "summary");
    return {
      id: stableItemId(sourceUrl || `${title}:${index}`),
      title: redactText(title),
      snippet: redactText(summary ?? "").slice(0, 700),
      sourceLabel: "arXiv",
      sourceUrl,
      publishedAt: xmlText(body, "published"),
    };
  });
}

function xmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ? decodeXml(match[1]).replace(/\s+/g, " ").trim() : undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:sk|zai|ambient|glm)-[A-Za-z0-9._-]{20,}\b/gi, REDACTED)
    .replace(/\b[A-Za-z0-9+/=_-]{64,}\b/g, REDACTED);
}

function evidenceId(accessRequest: WorkflowDiscoveryAccessRequest, provider: string): string {
  return `discovery-evidence-${stableItemId(`${accessRequest.id}:${provider}`) || randomUUID()}`;
}

function stableItemId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
