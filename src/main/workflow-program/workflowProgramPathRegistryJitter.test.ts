import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors } from "../desktopToolRegistry";
import { validateWorkflowConnectorDescriptor, type WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";
import { lowerWorkflowProgramHandleReferences } from "./workflowProgramPathRegistry";
import type { WorkflowProgramIR, WorkflowProgramNode, WorkflowProgramValue } from "../../shared/workflowProgramIr";

describe("workflow program path registry jitter", () => {
  it("lowers connector aliases and optional-node permutations across 500 seeded programs", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const rng = mulberry32(seed);
      const collectionField = ["records", "items", "threads", "messages"][Math.floor(rng() * 4)]!;
      const connector = connectorWithCollectionField(collectionField);
      const includeReview = rng() > 0.35;
      const producerId = `search-${seed % 11}`;
      const producerAlias = `search${seed % 11}`;
      const renderId = `render-${seed % 7}`;
      const renderAlias = `render${seed % 7}`;
      const reviewId = `review-${seed % 5}`;
      const reviewAlias = `review${seed % 5}`;
      const producer: WorkflowProgramNode = {
        id: producerId,
        kind: "connector.call",
        connectorId: "jitter.readonly",
        operation: "list",
        input: { limit: 5 },
      };
      const render: WorkflowProgramNode = {
        id: renderId,
        kind: "document.render",
        input: { content: { fromHandle: `${producerAlias}.${collectionField}` } },
        title: "Jitter report",
        format: "markdown",
      };
      const review: WorkflowProgramNode = {
        id: reviewId,
        kind: "review.input",
        prompt: "Approve?",
        choices: [{ id: "yes", label: "Yes" }],
      };
      const finalValue: Record<string, WorkflowProgramValue> = {
        collection: { fromHandle: `${producerAlias}.${collectionField}` },
        artifactPath: { fromHandle: `${renderAlias}.artifactPath` },
      };
      if (includeReview) finalValue.choiceId = { fromHandle: `${reviewAlias}.choiceId` };
      const final: WorkflowProgramNode = {
        id: "final-output",
        kind: "output.final",
        value: finalValue,
      };
      const nodes = seededShuffle([producer, render, ...(includeReview ? [review] : []), final], rng);
      const program: WorkflowProgramIR = {
        version: 1,
        title: `Registry jitter ${seed}`,
        goal: "Prove handles lower under node order and output alias variation.",
        nodes,
      };

      const lowered = lowerWorkflowProgramHandleReferences({
        program,
        toolDescriptors: firstPartyDesktopToolDescriptors(),
        connectorDescriptors: [connector],
      });

      expect(lowered.diagnostics, `seed ${seed}`).toEqual([]);
      expect(lowered.loweredHandleCount, `seed ${seed}`).toBe(includeReview ? 4 : 3);
      expect(JSON.stringify(lowered.program), `seed ${seed}`).not.toContain("fromHandle");
      const loweredFinal = lowered.program.nodes.find((node): node is Extract<WorkflowProgramNode, { kind: "output.final" }> => node.id === "final-output")!;
      expect(loweredFinal.value, `seed ${seed}`).toMatchObject({
        collection: { fromNode: producerId, path: collectionField },
        artifactPath: { fromNode: renderId, path: "artifactPath" },
      });
      if (includeReview) expect(loweredFinal.value).toMatchObject({ choiceId: { fromNode: reviewId, path: "choiceId" } });
    }
  });
});

function connectorWithCollectionField(field: string): WorkflowConnectorDescriptor {
  return validateWorkflowConnectorDescriptor({
    id: "jitter.readonly",
    label: "Jitter Connector",
    description: "Read-only descriptor with jittered collection output aliases.",
    auth: { type: "none", status: "available" },
    accounts: [{ id: "jitter", label: "Jitter" }],
    scopes: [{ id: "jitter.read", label: "Read", description: "Read jitter fixtures.", personalData: false }],
    operations: [
      {
        name: "list",
        label: "List",
        description: "List fixture rows.",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: {
            [field]: { type: "array" },
            nextCursor: { type: ["string", "null"] },
          },
          required: [field],
        },
        requiredScopes: ["jitter.read"],
        sideEffects: "none",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        defaultTimeoutMs: 1_000,
      },
    ],
    rateLimit: { requestsPerMinute: 120, burst: 10 },
    sync: { cursorKind: "none", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Fixture-only jitter connector."],
  });
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
