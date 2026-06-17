import { describe, expect, it } from "vitest";
import type { DesktopToolDescriptor } from "../desktopToolRegistry";
import {
  WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS,
  workflowProgramKnownOutputFields,
  workflowProgramOutputContractCompleteness,
  workflowProgramRefPathExists,
} from "./workflowProgramOutputContracts";
import type { WorkflowConnectorDescriptor } from "../workflowConnectors";
import type { WorkflowProgramConnectorCallNode, WorkflowProgramNode, WorkflowProgramToolCallNode } from "../../shared/workflowProgramIr";

describe("workflowProgramOutputContracts", () => {
  it("declares an output contract for every WorkflowProgramNode kind", () => {
    expect(workflowProgramOutputContractCompleteness()).toMatchObject({
      missingKinds: [],
      extraKinds: [],
    });
    expect(WORKFLOW_PROGRAM_OUTPUT_CONTRACT_NODE_KINDS).toEqual([
      "tool.call",
      "tool.paginate",
      "model.call",
      "browser.intervention",
      "connector.call",
      "connector.paginate",
      "connector.map",
      "collection.map",
      "collection.filter",
      "collection.dedupe",
      "collection.chunk",
      "document.render",
      "checkpoint.write",
      "mutation.stage",
      "review.input",
      "approval.required",
      "branch.if",
      "loop.map",
      "model.map",
      "model.reduce",
      "transform.template",
      "error.handle",
      "output.final",
    ]);
  });

  it("merges descriptor output schemas with explicit tool-call aliases", () => {
    const node: WorkflowProgramToolCallNode = {
      id: "search-catalog",
      kind: "tool.call",
      tool: "fixture_tool",
      args: {},
      output: { schema: { customSummary: "string" } },
    };
    const toolsByName = new Map([fixtureToolDescriptor("fixture_tool", { records: "array", nextCursor: "string" })].map((tool) => [tool.name, tool]));

    expect(workflowProgramKnownOutputFields(node, { toolsByName })).toEqual(["records", "nextCursor", "customSummary"]);
    expect(workflowProgramRefPathExists(node, "records", { toolsByName })).toBe(true);
    expect(workflowProgramRefPathExists(node, "madeUp", { toolsByName })).toBe(false);
  });

  it("uses connector output schemas when available and generic envelopes when they are not", () => {
    const connectorsById = new Map([fixtureConnectorDescriptor()].map((connector) => [connector.id, connector]));
    const schemaBackedCall: WorkflowProgramConnectorCallNode = {
      id: "list-mail",
      kind: "connector.call",
      connectorId: "gmail",
      operation: "list_messages",
    };
    const genericCall: WorkflowProgramConnectorCallNode = {
      id: "profile",
      kind: "connector.call",
      connectorId: "gmail",
      operation: "profile",
    };

    expect(workflowProgramKnownOutputFields(schemaBackedCall, { connectorsById })).toEqual(["messages", "nextPageToken"]);
    expect(workflowProgramRefPathExists(schemaBackedCall, "messages", { connectorsById })).toBe(true);
    expect(workflowProgramRefPathExists(genericCall, "value", { connectorsById })).toBe(true);
    expect(workflowProgramRefPathExists(genericCall, "messages", { connectorsById })).toBe(false);
  });

  it("models checkpoint and final outputs as value envelopes", () => {
    const nodes: WorkflowProgramNode[] = [
      { id: "checkpoint", kind: "checkpoint.write", key: "summary", value: "done" },
      { id: "final", kind: "output.final", value: { fromNode: "checkpoint", path: "value" } },
    ];

    expect(workflowProgramKnownOutputFields(nodes[0]!)).toEqual(["key", "value"]);
    expect(workflowProgramKnownOutputFields(nodes[1]!)).toEqual(["value"]);
  });

  it("models error handlers as result envelopes with transparent object passthrough fields", () => {
    const nodes: WorkflowProgramNode[] = [
      {
        id: "search-mail",
        kind: "connector.paginate",
        connectorId: "gmail",
        operation: "list_messages",
        input: {},
        maxItems: 20,
        maxPages: 1,
        pageSize: 20,
      },
      {
        id: "safe-mail",
        kind: "error.handle",
        try: { fromNode: "search-mail" },
        fallback: { items: [], count: 0, truncated: false },
      },
    ];
    const context = { nodesById: new Map(nodes.map((node) => [node.id, node])) };

    expect(workflowProgramKnownOutputFields(nodes[1]!, context)).toEqual([
      "error",
      "fallback",
      "ok",
      "value",
      "count",
      "items",
      "maxItems",
      "maxPages",
      "nextPageToken",
      "pageCount",
      "pageSize",
      "pages",
      "truncated",
    ]);
    expect(workflowProgramRefPathExists(nodes[1]!, "items", context)).toBe(true);
    expect(workflowProgramRefPathExists(nodes[1]!, "messages", context)).toBe(false);
  });
});

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
    id: "gmail",
    label: "Gmail",
    description: "Fixture Gmail connector",
    auth: { type: "oauth2", status: "available" },
    accounts: [{ id: "primary", label: "Primary" }],
    scopes: [],
    operations: [
      {
        name: "list_messages",
        label: "List messages",
        description: "List message metadata",
        inputSchema: { type: "object", properties: {} },
        outputSchema: { messages: "array", nextPageToken: "string" },
        requiredScopes: [],
        sideEffects: "read_personal_data",
        supportsDryRun: true,
        idempotencyKey: "not-supported",
        mutationPolicy: "unsupported",
        defaultTimeoutMs: 1000,
      },
      {
        name: "profile",
        label: "Profile",
        description: "Read account profile",
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
