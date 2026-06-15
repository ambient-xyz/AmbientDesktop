import type { AgentToolResult, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import { productContextToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";

export const AMBIENT_PRODUCT_IDENTITY_SYSTEM_PROMPT = [
  "[AMBIENT PRODUCT IDENTITY]",
  "You are Ambient/Pi running inside Ambient Desktop.",
  "Ambient Desktop is a local-first developer workstation for durable, inspectable agentic work on the user's machine. It combines chat, real workspace context, terminals, browser evidence, source control, artifact previews, Project Board, contained capabilities, provider routing, and workflow artifacts.",
  "Ambient is the decentralized verified-inference network described at https://ambient.xyz. The Ambient Network is an SVM-compatible Proof-of-Work AI blockchain direction for verified machine intelligence, useful inference work, and network-native agent infrastructure.",
  "Relationship: Ambient Desktop is the developer workstation for agentic work today and is growing into the official workstation/client for Ambient Network operations. Be candid about maturity: Desktop is Developer Preview; Network Client and Local Model Routing are In Development; Ambient Mini Mining is Roadmap.",
  "When asked what you are, answer from this identity. When asked for detailed product facts, official website references, or to resolve conflicting Ambient-branded search results, use ambient_product_context through the Ambient tool router before answering. Do not conflate Ambient with unrelated ambient-code.ai or other similarly named products.",
].join("\n");

const OFFICIAL_SOURCES = [
  {
    id: "desktop-overview",
    label: "Ambient Desktop documentation",
    url: "https://desktop.ambient.xyz/",
    localSource: "README.md and Documentation/site/src/site-data.mjs",
  },
  {
    id: "desktop-north-star",
    label: "Ambient Desktop Product North Star",
    url: "https://desktop.ambient.xyz/getting-started/product-north-star/",
    localSource: "Documentation/site/src/site-data.mjs slug getting-started/product-north-star",
  },
  {
    id: "ambient-what-is",
    label: "What is Ambient",
    url: "https://ambient.xyz/what-is-ambient",
    localSource: "Official Ambient public site",
  },
  {
    id: "ambient-network-client",
    label: "Ambient Network Client",
    url: "https://desktop.ambient.xyz/ambient-network/client/",
    localSource: "Documentation/site/src/site-data.mjs slug ambient-network/client",
  },
  {
    id: "ambient-mini-mining",
    label: "Ambient Mini Mining",
    url: "https://desktop.ambient.xyz/ambient-network/ambient-mini-mining/",
    localSource: "Documentation/site/src/site-data.mjs slug ambient-network/ambient-mini-mining",
  },
  {
    id: "local-model-routing",
    label: "Local Models And Routing",
    url: "https://desktop.ambient.xyz/ambient-network/local-model-routing/",
    localSource: "Documentation/site/src/site-data.mjs slug ambient-network/local-model-routing",
  },
];

const MATURITY_NOTES = [
  "Ambient Desktop is Developer Preview for macOS, Windows, and Linux.",
  "Ambient Network Client is In Development: embedded keys, balances, programs, transaction observation, Ambient L1 CLI integration, Tool Oracle, and x402 workflows are direction/building blocks, not a finished live transaction surface.",
  "Ambient Mini Mining is Roadmap: opt-in local model hosting and network rewards are planned, but fixed payouts, guaranteed income, and final token economics are not promised.",
  "Local Model Routing is In Development: local runtime lifecycle, local-first selection, and vision routing exist; broader routing across Ambient and Ambient Mini is still being built.",
];

interface ProductFact {
  id: string;
  topic: "identity" | "desktop" | "ambient" | "network" | "sources";
  title: string;
  summary: string;
  bullets: string[];
  sourceIds: string[];
}

const PRODUCT_FACTS: ProductFact[] = [
  {
    id: "identity",
    topic: "identity",
    title: "Runtime Identity",
    summary: "Ambient/Pi is the agent running inside Ambient Desktop.",
    bullets: [
      "Use Ambient/Pi for the agent identity and Ambient Desktop for the host application.",
      "Ambient Desktop owns deterministic boundaries: permissions, tool registration, provider routing, evidence, Project Board state, workflow artifacts, and local app surfaces.",
      "Pi is the coding-agent harness integrated into Desktop; do not answer as a generic web-search agent when the question is about this app.",
    ],
    sourceIds: ["desktop-overview", "desktop-north-star"],
  },
  {
    id: "desktop",
    topic: "desktop",
    title: "Ambient Desktop",
    summary: "Ambient Desktop is a local-first developer workstation where agents do durable, inspectable work on the user's machine.",
    bullets: [
      "It combines chat, workspace context, terminals, browser evidence, source control, artifact previews, and Project Board review loops.",
      "Large or ambiguous requests can become source-backed Project Board cards with evidence, dependencies, and review state.",
      "Risky capabilities such as MCP servers, scrapers, and Pi packages run behind policy and containment boundaries.",
      "Provider routing lets search, fetch, browser, vision, local, and cloud providers be prioritized with visible fallback evidence.",
    ],
    sourceIds: ["desktop-overview"],
  },
  {
    id: "ambient",
    topic: "ambient",
    title: "Ambient",
    summary: "Ambient is a decentralized verified-inference network for machine intelligence as a verifiable utility.",
    bullets: [
      "The public Ambient site describes Ambient as a Proof-of-Work AI blockchain and an SVM-compatible L1 direction.",
      "The network is designed around useful work: miners provide AI inference and, over time, model improvement.",
      "Proof of Logits is the verification direction for checking whether a specific model produced a specific output from a prompt at a time.",
      "When answering public-network questions, distinguish current Desktop product state from network roadmap or testnet direction.",
    ],
    sourceIds: ["ambient-what-is"],
  },
  {
    id: "network",
    topic: "network",
    title: "Ambient Network In Desktop",
    summary: "Ambient Desktop is growing into the workstation/client for Ambient Network operations.",
    bullets: [
      "The Network Client direction covers embedded key flow, balances, program work, transaction evidence, Ambient L1 CLI integration, Tool Oracle, and x402 workflows.",
      "Today this is direction and foundation: Ambient blockchain CLI package descriptors/skills and permissioned-capability machinery exist, while live wallet flows and on-network transactions are still being built.",
      "Ambient Mini Mining is planned as an opt-in way for eligible machines to host local models and earn network rewards when finalized.",
      "Local model routing is the bridge between private/local work, Ambient cloud, specialized providers, and future Ambient Mini routing.",
    ],
    sourceIds: ["desktop-north-star", "ambient-network-client", "ambient-mini-mining", "local-model-routing"],
  },
  {
    id: "sources",
    topic: "sources",
    title: "Official Sources",
    summary: "Use the official Ambient domains for product identity and public docs.",
    bullets: [
      "desktop.ambient.xyz is the Ambient Desktop documentation site.",
      "ambient.xyz is the Ambient public network/product site.",
      "Do not treat similarly named projects or ambient-code.ai results as canonical for this Desktop app unless the user explicitly asks about them.",
    ],
    sourceIds: OFFICIAL_SOURCES.map((source) => source.id),
  },
];

export function createAmbientProductContextExtension(): ExtensionFactory {
  return (pi) => {
    registerDesktopTool(pi, productContextToolDescriptor("ambient_product_context"), {
      executionMode: "sequential",
      execute: async (_toolCallId, params) => runAmbientProductContextTool(params),
    });

    pi.on("before_agent_start", async (event: any) => ({
      systemPrompt: `${event.systemPrompt}\n\n${AMBIENT_PRODUCT_IDENTITY_SYSTEM_PROMPT}`,
    }));
  };
}

export function runAmbientProductContextTool(params: unknown): AgentToolResult<Record<string, unknown>> {
  const input = objectRecord(params);
  const requestedTopic = normalizeTopic(input.topic);
  const queryTopic = topicFromQuery(typeof input.query === "string" ? input.query : undefined);
  const topic = requestedTopic ?? queryTopic ?? "identity";
  const facts = factsForTopic(topic);
  const sourceIds = new Set(facts.flatMap((fact) => fact.sourceIds));
  const sources = OFFICIAL_SOURCES.filter((source) => sourceIds.has(source.id) || topic === "sources" || topic === "all");
  const text = productContextText(topic, facts, sources);
  return {
    content: [{ type: "text", text }],
    details: {
      runtime: "ambient-product-context",
      toolName: "ambient_product_context",
      status: "complete",
      topic,
      facts,
      sources,
      maturityNotes: MATURITY_NOTES,
    },
  };
}

function productContextText(topic: ProductContextTopic, facts: ProductFact[], sources: typeof OFFICIAL_SOURCES): string {
  return [
    `Ambient product context: ${topic}`,
    "",
    ...facts.flatMap((fact) => [
      `${fact.title}: ${fact.summary}`,
      ...fact.bullets.map((bullet) => `- ${bullet}`),
      "",
    ]),
    "Maturity notes:",
    ...MATURITY_NOTES.map((note) => `- ${note}`),
    "",
    "Official sources:",
    ...sources.map((source) => `- ${source.label}: ${source.url}`),
  ].join("\n").trim();
}

type ProductContextTopic = "identity" | "desktop" | "ambient" | "network" | "sources" | "all";

function factsForTopic(topic: ProductContextTopic): ProductFact[] {
  if (topic === "all") return PRODUCT_FACTS;
  if (topic === "sources") return PRODUCT_FACTS.filter((fact) => fact.topic === "sources");
  if (topic === "identity") return PRODUCT_FACTS.filter((fact) => fact.topic === "identity" || fact.topic === "desktop" || fact.topic === "ambient");
  return PRODUCT_FACTS.filter((fact) => fact.topic === topic);
}

function normalizeTopic(value: unknown): ProductContextTopic | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "identity" || normalized === "desktop" || normalized === "ambient" || normalized === "network" || normalized === "sources" || normalized === "all") {
    return normalized;
  }
  return undefined;
}

function topicFromQuery(query: string | undefined): ProductContextTopic | undefined {
  const normalized = query?.toLowerCase() ?? "";
  if (!normalized) return undefined;
  if (/\b(source|website|url|docs?|official)\b/.test(normalized)) return "sources";
  if (/\b(network|l1|blockchain|mini|mining|mine|wallet|transaction|proof of work|proof-of-work|proof of logits)\b/.test(normalized)) return "network";
  if (/\b(desktop|workstation|project board|provider routing|pi|coding agent)\b/.test(normalized)) return "desktop";
  if (/\bambient\b/.test(normalized)) return "ambient";
  return undefined;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
