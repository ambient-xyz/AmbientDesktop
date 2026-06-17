import { describe, expect, it } from "vitest";
import { firstPartyDesktopToolDescriptors, type DesktopToolDescriptor } from "../desktopToolRegistry";
import { validateWorkflowProgramStatic } from "./workflowProgramTypecheck";
import type { WorkflowConnectorDescriptor } from "../workflow/workflowConnectors";
import type { WorkflowProgramIR, WorkflowProgramNode } from "../../shared/workflowProgramIr";

const CONTRACT_MUTATIONS_PER_FIXTURE = 20;

type WorkflowContractJitterFixture = {
  id: string;
  program: WorkflowProgramIR;
  toolDescriptors?: DesktopToolDescriptor[];
  connectorDescriptors?: WorkflowConnectorDescriptor[];
};

type WorkflowContractPathReference = {
  consumerNodeId: string;
  sourceNodeId: string;
  validPath: string;
  containerPath: Array<string | number>;
};

describe("workflowProgramOutputContractJitter", () => {
  it("keeps all output-contract fixtures valid before mutation", async () => {
    for (const fixture of workflowOutputContractJitterFixtures()) {
      const result = await validateContractFixture(fixture.program, fixture);
      expect(result.diagnostics, fixture.id).toEqual([]);
    }
  });

  it("turns output-contract path mutations into fail-closed diagnostics with alternatives", async () => {
    const fixtures = workflowOutputContractJitterFixtures();
    const failures: string[] = [];
    const results: Array<{ fixtureId: string; sourceNodeId: string; invalidPath: string }> = [];

    for (const fixture of fixtures) {
      const references = workflowProgramPathReferences(fixture.program);
      if (!references.length) failures.push(`${fixture.id}: fixture has no mutable {fromNode,path} references`);

      for (let index = 0; index < CONTRACT_MUTATIONS_PER_FIXTURE; index += 1) {
        const reference = references[index % references.length];
        const invalidPath = invalidOutputPath(fixture.id, index, reference.validPath);
        const mutated = mutateWorkflowProgramPath(fixture.program, reference, invalidPath);
        const result = await validateContractFixture(mutated, fixture);
        const diagnostic = result.diagnostics.find(
          (item) =>
            item.code === "ir.unknown_output_path" &&
            item.nodeId === reference.consumerNodeId &&
            item.message.includes(`path ${invalidPath} on ${reference.sourceNodeId}`),
        );
        if (!diagnostic) {
          failures.push(`${fixture.id} mutation ${index}: missing unknown-path diagnostic for ${reference.sourceNodeId}.${invalidPath}`);
          continue;
        }
        if (!diagnostic.message.includes("Known valid first-segment paths:")) {
          failures.push(`${fixture.id} mutation ${index}: missing valid alternatives for ${reference.sourceNodeId}.${invalidPath}`);
        }
        results.push({ fixtureId: fixture.id, sourceNodeId: reference.sourceNodeId, invalidPath });
      }
    }

    expect(failures).toEqual([]);
    expect(results).toHaveLength(fixtures.length * CONTRACT_MUTATIONS_PER_FIXTURE);
    expect(new Set(results.map((result) => result.fixtureId))).toEqual(new Set(fixtures.map((fixture) => fixture.id)));
  });

  it("does not invent connector operation-specific paths for unschematized connector calls", async () => {
    const fixture = connectorGenericFixture();
    const mutated = mutateWorkflowProgramPath(fixture.program, workflowProgramPathReferences(fixture.program)[0]!, "messages");
    const result = await validateContractFixture(mutated, fixture);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "ir.unknown_output_path",
        nodeId: "final-output",
        message: expect.stringContaining("Known valid first-segment paths: ok, value, items, metadata, truncated."),
      }),
    ]);
  });
});

function workflowOutputContractJitterFixtures(): WorkflowContractJitterFixture[] {
  return [
    toolCallKnownFixture(),
    toolCallDescriptorFixture(),
    toolCallGenericFixture(),
    contractFixture("tool-paginate", browserSearchPages("source-node"), ["items", "pages"]),
    contractFixture("model-call", { id: "source-node", kind: "model.call", task: "summarize", input: {}, output: { schema: { summary: "string", confidence: "number" } } }, ["summary", "confidence"]),
    contractFixture("browser-intervention", { id: "source-node", kind: "browser.intervention", tool: "browser_content", args: { url: "https://example.com" } }, ["text", "url"]),
    connectorSchemaFixture(),
    connectorGenericFixture(),
    contractFixture("connector-paginate", connectorPaginateNode("source-node"), ["items", "pages"], { connectorDescriptors: [fixtureConnectorDescriptor()] }),
    contractFixture("connector-map", connectorMapNode("source-node"), ["items", "count"], { connectorDescriptors: [fixtureConnectorDescriptor()] }),
    contractFixture("collection-map", collectionMapNode("source-node"), ["items", "count"]),
    contractFixture("collection-filter", { id: "source-node", kind: "collection.filter", items: [{ name: "image-01.png" }], maxItems: 1, includeExtensions: [".png"] }, ["items", "filter"]),
    contractFixture("collection-dedupe", { id: "source-node", kind: "collection.dedupe", items: [{ id: "a" }, { id: "a" }], keyPath: "id", maxItems: 2 }, ["items", "duplicateCount"]),
    contractFixture("collection-chunk", { id: "source-node", kind: "collection.chunk", items: [{ id: "a" }, { id: "b" }], chunkSize: 1, maxChunks: 2 }, ["chunks", "count"]),
    contractFixture("document-render", { id: "source-node", kind: "document.render", input: { content: "Hello" }, title: "Report", format: "html", path: "report.html" }, ["artifactPath", "content"]),
    contractFixture("checkpoint-write", { id: "source-node", kind: "checkpoint.write", key: "evidence", value: { report: "Ready", count: 1 } }, ["report", "value"]),
    contractFixture("mutation-stage", { id: "source-node", kind: "mutation.stage", tool: "file_write", args: { path: "report.md", content: "Hello" }, changeSet: { path: "report.md" } }, ["path", "bytes"]),
    contractFixture("review-input", { id: "source-node", kind: "review.input", prompt: "Choose?", choices: [{ id: "yes", label: "Yes" }] }, ["choiceId", "text"]),
    contractFixture("approval-required", { id: "source-node", kind: "approval.required", changeSet: { files: ["report.md"] } }, ["status", "changeSet"]),
    contractFixture("branch-if", { id: "source-node", kind: "branch.if", condition: true, then: "yes", else: "no" }, ["branch", "value"]),
    contractFixture("loop-map", { id: "source-node", kind: "loop.map", items: [{ name: "Ada" }], itemName: "person", map: { name: { fromItem: "person", path: "name" } }, maxItems: 1 }, ["items", "count"]),
    contractFixture("model-map", { id: "source-node", kind: "model.map", items: [{ id: "a" }], task: "classify", output: { schema: { label: "string" } }, maxItems: 1 }, ["results", "items"]),
    contractFixture("model-reduce", { id: "source-node", kind: "model.reduce", items: [{ id: "a" }], task: "merge", output: { schema: { summary: "string" } }, maxInputItems: 1 }, ["summary"]),
    contractFixture("transform-template", { id: "source-node", kind: "transform.template", template: "Hello {{name}}", vars: { name: "Ada" } }, ["value"]),
    contractFixture("error-handle", { id: "source-node", kind: "error.handle", try: { literal: "primary" }, fallback: { literal: "fallback" } }, ["ok", "value"]),
    contractFixture("output-final", { id: "source-node", kind: "output.final", value: "done" }, ["value"]),
  ];
}

function contractFixture(
  id: string,
  sourceNode: WorkflowProgramNode,
  validPaths: string[],
  options: Pick<WorkflowContractJitterFixture, "toolDescriptors" | "connectorDescriptors"> = {},
): WorkflowContractJitterFixture {
  return {
    id,
    ...options,
    program: {
      version: 1,
      title: `${id} output contract`,
      goal: `Validate ${id} output path contracts.`,
      nodes: [
        sourceNode,
        {
          id: "final-output",
          kind: "output.final",
          dependsOn: [sourceNode.id],
          value: Object.fromEntries(validPaths.map((path) => [path.replace(/[^a-z0-9]+/gi, "_"), { fromNode: sourceNode.id, path }])),
        },
      ],
    },
  };
}

function toolCallKnownFixture(): WorkflowContractJitterFixture {
  return contractFixture("tool-call-known", { id: "source-node", kind: "tool.call", tool: "file_read", args: { path: "notes.md" } }, ["content", "path"]);
}

function toolCallDescriptorFixture(): WorkflowContractJitterFixture {
  return contractFixture(
    "tool-call-descriptor",
    { id: "source-node", kind: "tool.call", tool: "fixture_catalog", args: {} },
    ["records", "nextCursor"],
    { toolDescriptors: [fixtureToolDescriptor("fixture_catalog", { records: "array", nextCursor: "string" })] },
  );
}

function toolCallGenericFixture(): WorkflowContractJitterFixture {
  return contractFixture("tool-call-generic", { id: "source-node", kind: "tool.call", tool: "fixture_generic", args: {} }, ["value", "metadata"], {
    toolDescriptors: [fixtureToolDescriptor("fixture_generic")],
  });
}

function connectorSchemaFixture(): WorkflowContractJitterFixture {
  return contractFixture(
    "connector-call-schema",
    { id: "source-node", kind: "connector.call", connectorId: "fixture.connector", operation: "listRecords", input: {} },
    ["records", "nextCursor"],
    { connectorDescriptors: [fixtureConnectorDescriptor()] },
  );
}

function connectorGenericFixture(): WorkflowContractJitterFixture {
  return contractFixture(
    "connector-call-generic",
    { id: "source-node", kind: "connector.call", connectorId: "fixture.connector", operation: "profile", input: {} },
    ["value", "metadata"],
    { connectorDescriptors: [fixtureConnectorDescriptor()] },
  );
}

function browserSearchPages(id: string): WorkflowProgramNode {
  return {
    id,
    kind: "tool.paginate",
    tool: "browser_search",
    input: { maxResults: 2 },
    pageQueries: ["workflow contracts"],
    queryInputPath: "query",
    pageSizeInputPath: "maxResults",
    maxItems: 2,
    maxPages: 1,
  };
}

function connectorPaginateNode(id: string): WorkflowProgramNode {
  return {
    id,
    kind: "connector.paginate",
    connectorId: "fixture.connector",
    operation: "listRecords",
    input: {},
    maxItems: 2,
    maxPages: 1,
  };
}

function connectorMapNode(id: string): WorkflowProgramNode {
  return {
    id,
    kind: "connector.map",
    connectorId: "fixture.connector",
    operation: "profile",
    items: [{ id: "a" }],
    itemName: "row",
    input: { id: { fromItem: "row", path: "id" } },
    maxItems: 1,
  };
}

function collectionMapNode(id: string): WorkflowProgramNode {
  return {
    id,
    kind: "collection.map",
    items: [{ name: "Ada" }],
    itemName: "person",
    map: { name: { fromItem: "person", path: "name" } },
    maxItems: 1,
  };
}

async function validateContractFixture(program: WorkflowProgramIR, fixture: WorkflowContractJitterFixture) {
  return validateWorkflowProgramStatic({
    program,
    toolDescriptors: [...firstPartyDesktopToolDescriptors(), ...(fixture.toolDescriptors ?? [])],
    connectorDescriptors: fixture.connectorDescriptors ?? [],
    ambientCliCapabilities: [],
    validateGoogleReadOnly: true,
  });
}

function fixtureToolDescriptor(name: string, outputSchema?: unknown): DesktopToolDescriptor {
  return {
    name,
    label: name,
    description: "Fixture tool",
    promptSnippet: "Use fixture tool.",
    promptGuidelines: [],
    inputSchema: { type: "object", properties: {} },
    outputSchema,
    source: "first-party",
    sideEffects: "none",
    permissionScope: "fixture",
    supportsDryRun: true,
    supportsUndo: false,
    idempotency: "not-supported",
    defaultTimeoutMs: 1000,
  };
}

function fixtureConnectorDescriptor(): WorkflowConnectorDescriptor {
  return {
    id: "fixture.connector",
    label: "Fixture Connector",
    description: "Fixture connector for output contract jitter.",
    auth: { type: "oauth2", status: "available" },
    accounts: [{ id: "default", label: "Default" }],
    scopes: [],
    operations: [
      {
        name: "listRecords",
        label: "List records",
        description: "List fixture records.",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { records: "array", nextCursor: "string" },
        requiredScopes: [],
        sideEffects: "read_personal_data",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        pagination: {
          itemsPath: "records",
          nextPageTokenPath: "nextCursor",
          pageTokenInputPath: "cursor",
          pageSizeInputPath: "limit",
          defaultPageSize: 10,
          maxPageSize: 50,
        },
        defaultTimeoutMs: 1000,
      },
      {
        name: "profile",
        label: "Profile",
        description: "Read fixture profile.",
        inputSchema: { type: "object", properties: {} },
        requiredScopes: [],
        sideEffects: "read_personal_data",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        defaultTimeoutMs: 1000,
      },
    ],
    rateLimit: { requestsPerMinute: 60, burst: 5 },
    sync: { cursorKind: "none", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: [],
  };
}

function workflowProgramPathReferences(program: WorkflowProgramIR): WorkflowContractPathReference[] {
  const nodeIds = new Set(program.nodes.map((node) => node.id));
  const references: WorkflowContractPathReference[] = [];
  for (let nodeIndex = 0; nodeIndex < program.nodes.length; nodeIndex += 1) {
    const node = program.nodes[nodeIndex];
    visitValue(node, ["nodes", nodeIndex], (value, containerPath) => {
      if (!isProgramReference(value) || !value.path || !nodeIds.has(value.fromNode)) return;
      references.push({
        consumerNodeId: node.id,
        sourceNodeId: value.fromNode,
        validPath: value.path,
        containerPath,
      });
    });
  }
  return references;
}

function mutateWorkflowProgramPath(program: WorkflowProgramIR, reference: WorkflowContractPathReference, invalidPath: string): WorkflowProgramIR {
  const cloned = structuredClone(program);
  const target = valueAtPath(cloned, reference.containerPath);
  if (!isProgramReference(target)) throw new Error(`Mutation target is not a program reference at ${reference.containerPath.join("/")}`);
  target.path = invalidPath;
  return cloned;
}

function invalidOutputPath(fixtureId: string, index: number, validPath: string): string {
  return `invalid_${fixtureId}_${index}_${validPath}`.replace(/[^a-z0-9_]+/gi, "_");
}

function visitValue(value: unknown, path: Array<string | number>, onValue: (value: unknown, path: Array<string | number>) => void): void {
  onValue(value, path);
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitValue(item, [...path, index], onValue));
    return;
  }
  for (const [key, item] of Object.entries(value)) visitValue(item, [...path, key], onValue);
}

function valueAtPath(root: unknown, path: Array<string | number>): unknown {
  let current = root;
  for (const part of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function isProgramReference(value: unknown): value is { fromNode: string; path?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as { fromNode?: unknown }).fromNode === "string");
}
