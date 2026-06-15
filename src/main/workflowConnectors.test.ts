import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowManifest } from "../shared/types";
import type { WorkflowRuntimeEvent } from "./workflowAgentRuntime";
import { isWorkflowPausedError } from "./workflowAgentRuntime";
import {
  createWorkflowConnectorBridge,
  fixtureWorkflowConnector,
  validateWorkflowConnectorDescriptor,
  validateWorkflowConnectorManifest,
  workspaceInventoryConnector,
  workspaceInventoryConnectorDescriptor,
  workflowConnectorCompilerSection,
  type WorkflowConnectorDescriptor,
} from "./workflowConnectors";

function manifest(overrides: Partial<WorkflowManifest> = {}): WorkflowManifest {
  return {
    tools: [],
    mutationPolicy: "read_only",
    connectors: [
      {
        connectorId: "fixture.readonly",
        accountId: "fixture",
        scopes: ["fixture.records.read"],
        operations: ["listRecords", "getRecord"],
        dataRetention: "redacted_audit",
      },
    ],
    ...overrides,
  };
}

describe("Workflow connector framework", () => {
  it("describes a harmless read-only fixture connector before Gmail exists", () => {
    const descriptor = fixtureWorkflowConnector().descriptor;

    expect(descriptor).toMatchObject({
      id: "fixture.readonly",
      auth: { type: "none", status: "available" },
      defaultDataRetention: "redacted_audit",
      sync: { cursorKind: "opaque", supportsIncremental: false },
    });
    expect(descriptor.scopes).toEqual([
      expect.objectContaining({
        id: "fixture.records.read",
        personalData: false,
      }),
    ]);
    expect(descriptor.operations.map((operation) => operation.name)).toEqual(["listRecords", "getRecord"]);
    expect(descriptor.operations.every((operation) => operation.sideEffects === "none")).toBe(true);
  });

  it("provides a first-party read-only workspace inventory connector", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-workspace-inventory-"));
    try {
      await writeFile(join(workspacePath, "package.json"), '{"name":"fixture"}\n', "utf8");
      await writeFile(join(workspacePath, "notes.md"), "# Fixture\n", "utf8");
      const registration = workspaceInventoryConnector(workspacePath);
      const bridge = createWorkflowConnectorBridge({
        manifest: {
          tools: [],
          mutationPolicy: "read_only",
          connectors: [
            {
              connectorId: "workspace.inventory",
              accountId: "workspace",
              scopes: ["workspace.files.read"],
              operations: ["listFiles"],
              dataRetention: "redacted_audit",
            },
          ],
        },
        registrations: [registration],
      });

      await expect(
        bridge.call({ connectorId: "workspace.inventory", operation: "listFiles", input: { maxEntries: 5 } }),
      ).resolves.toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({ path: "notes.md", type: "file" }),
          expect.objectContaining({ path: "package.json", type: "file" }),
        ]),
        truncated: false,
        totalKnownEntries: 2,
      });
      expect(workspaceInventoryConnectorDescriptor()).toMatchObject({
        id: "workspace.inventory",
        scopes: [expect.objectContaining({ id: "workspace.files.read", personalData: false })],
      });
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects unsafe connector descriptors before they can reach the compiler", () => {
    const descriptor = mutableDescriptor({
      id: "unsafe.external",
      operations: [
        {
          ...mutableOperation(),
          idempotencyKey: "not-supported",
        },
      ],
    });

    expect(() => validateWorkflowConnectorDescriptor(descriptor)).toThrow("writes externally without idempotency");
  });

  it("validates manifest grants against connector scopes, operations, and mutation policy", () => {
    const descriptor = fixtureWorkflowConnector().descriptor;

    expect(() => validateWorkflowConnectorManifest(manifest(), [descriptor])).not.toThrow();
    expect(() => validateWorkflowConnectorManifest(manifest({ connectors: [{ ...manifest().connectors![0], scopes: [] }] }), [
      descriptor,
    ])).toThrow("missing scope");
    expect(() =>
      validateWorkflowConnectorManifest(manifest({ connectors: [{ ...manifest().connectors![0], operations: ["missing"] }] }), [
        descriptor,
      ]),
    ).toThrow("does not expose operation");
  });

  it("calls fixture connector operations through audited runtime bridge", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const registration = fixtureWorkflowConnector([{ id: "one", title: "First" }, { id: "two", title: "Second" }]);
    const bridge = createWorkflowConnectorBridge({
      manifest: { ...manifest(), maxConnectorCalls: 2 },
      registrations: [registration],
      eventSink: { append: (event) => void events.push(event) },
    });

    await expect(
      bridge.call({ connectorId: "fixture.readonly", operation: "listRecords", input: { limit: 1 }, nodeId: "records-node" }),
    ).resolves.toEqual({
      records: [{ id: "one", title: "First" }],
      nextCursor: "1",
    });
    await expect(
      bridge.call({ connectorId: "fixture.readonly", operation: "getRecord", input: { id: "two" } }),
    ).resolves.toEqual({
      record: { id: "two", title: "Second" },
    });

    expect(events.map((event) => event.type)).toEqual(["connector.start", "connector.end", "connector.start", "connector.end"]);
    expect(events[0]).toMatchObject({
      message: "fixture.readonly.listRecords",
      graphNodeId: "records-node",
      data: { sideEffects: "none", graphNodeId: "records-node" },
    });
  });

  it("enforces connector grants and call budgets", async () => {
    const registration = fixtureWorkflowConnector([{ id: "one" }]);
    const bridge = createWorkflowConnectorBridge({
      manifest: { ...manifest({ maxConnectorCalls: 1 }), connectors: [{ ...manifest().connectors![0], operations: ["getRecord"] }] },
      registrations: [registration],
    });

    await expect(bridge.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {} })).rejects.toThrow(
      "does not allow connector operation",
    );
    await expect(bridge.call({ connectorId: "fixture.readonly", operation: "getRecord", input: { id: "one" } })).resolves.toEqual({
      record: { id: "one" },
    });
    await expect(bridge.call({ connectorId: "fixture.readonly", operation: "getRecord", input: { id: "one" } })).rejects.toThrow(
      "max connector calls",
    );
  });

  it("enforces a zero connector call budget", async () => {
    const registration = fixtureWorkflowConnector([{ id: "one" }]);
    const bridge = createWorkflowConnectorBridge({
      manifest: manifest({ maxConnectorCalls: 0 }),
      registrations: [registration],
    });

    await expect(bridge.call({ connectorId: "fixture.readonly", operation: "listRecords", input: {} })).rejects.toThrow(
      "max connector calls",
    );
  });

  it("summarizes connector availability and input schemas for compiler prompts", () => {
    const promptSection = workflowConnectorCompilerSection([fixtureWorkflowConnector().descriptor]);

    expect(promptSection).toContain("fixture.readonly");
    expect(promptSection).toContain("connectors.call");
    expect(promptSection).toContain("input=");
    expect(promptSection).toContain("listed account connectors should be used");
  });

  it("supports dry-run skipping for non-dry-run mutation operations", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const handler = vi.fn(async () => ({ applied: true }));
    const descriptor = validateWorkflowConnectorDescriptor(mutableDescriptor());
    const bridge = createWorkflowConnectorBridge({
      manifest: {
        tools: [],
        mutationPolicy: "staged_until_approved",
        connectors: [
          {
            connectorId: "mutable.external",
            scopes: ["external.write"],
            operations: ["writeRecord"],
            dataRetention: "redacted_audit",
          },
        ],
      },
      registrations: [{ descriptor, handlers: { writeRecord: handler } }],
      dryRun: true,
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: () => "approved",
    });

    await expect(
      bridge.call({ connectorId: "mutable.external", operation: "writeRecord", input: { id: "one" }, idempotencyKey: "idem-1" }),
    ).resolves.toMatchObject({
      dryRun: true,
      skipped: true,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "connector.review.approved" }),
        expect.objectContaining({ type: "connector.dry_run", message: "mutable.external.writeRecord" }),
      ]),
    );
  });

  it("redacts personal-data connector audit summaries by default", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector()],
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: () => "approved",
    });

    await expect(
      bridge.call({
        connectorId: "personal.mail",
        operation: "listMessages",
        input: { query: "from:ada@example.com", limit: 1 },
      }),
    ).resolves.toMatchObject({
      messages: [{ from: "ada@example.com", subject: "Launch plan" }],
    });

    const auditJson = JSON.stringify(events);
    expect(auditJson).toContain("connector.review.approved");
    expect(auditJson).toContain('"personalData":true');
    expect(auditJson).toContain('"dataRetention":"redacted_audit"');
    expect(auditJson).toContain("[redacted]");
    expect(auditJson).not.toContain("ada@example.com");
    expect(auditJson).not.toContain("Launch plan");
    expect(auditJson).not.toContain("from:ada");
  });

  it("omits personal-data connector audit values when retention is none", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowConnectorBridge({
      manifest: personalManifest("none"),
      registrations: [personalConnector()],
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: () => "approved",
    });

    await bridge.call({ connectorId: "personal.mail", operation: "listMessages", input: { query: "subject:confidential" } });

    const auditJson = JSON.stringify(events);
    expect(auditJson).toContain("retention=none");
    expect(auditJson).not.toContain("confidential");
    expect(auditJson).not.toContain("ada@example.com");
  });

  it("keeps personal-data connector audit values only with explicit run-artifact retention", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowConnectorBridge({
      manifest: personalManifest("run_artifact"),
      registrations: [personalConnector()],
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: () => "approved",
    });

    await bridge.call({ connectorId: "personal.mail", operation: "listMessages", input: { query: "from:ada@example.com" } });

    const auditJson = JSON.stringify(events);
    expect(auditJson).toContain("ada@example.com");
    expect(auditJson).toContain("Launch plan");
  });

  it("omits personal-data connector error details unless raw artifact retention is granted", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector(new Error("failed for ada@example.com"))],
      eventSink: { append: (event) => void events.push(event) },
      connectorApprovalDecision: () => "approved",
    });

    await expect(bridge.call({ connectorId: "personal.mail", operation: "listMessages", input: {} })).rejects.toThrow(
      "failed for ada@example.com",
    );

    const auditJson = JSON.stringify(events);
    expect(auditJson).toContain("details omitted");
    expect(auditJson).not.toContain("ada@example.com");
  });

  it("pauses personal-data connector calls until the exact connector grant is approved", async () => {
    const events: WorkflowRuntimeEvent[] = [];
    const bridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector()],
      eventSink: { append: (event) => void events.push(event) },
    });

    let caught: unknown;
    try {
      await bridge.call({
        connectorId: "personal.mail",
        operation: "listMessages",
        input: { query: "from:ada@example.com" },
      });
    } catch (error) {
      caught = error;
    }
    expect(isWorkflowPausedError(caught)).toBe(true);

    const required = events.find((event) => event.type === "connector.review.required");
    expect(required).toMatchObject({
      type: "connector.review.required",
      data: {
        id: expect.stringMatching(/^connector-review-/),
        changeSet: expect.objectContaining({
          kind: "connector-grant",
          connectorId: "personal.mail",
          operation: "listMessages",
          dataRetention: "redacted_audit",
          personalData: true,
        }),
      },
    });
    expect(JSON.stringify(events)).not.toContain("ada@example.com");
  });

  it("binds connector review approvals to the approval scope", async () => {
    const initialEvents: WorkflowRuntimeEvent[] = [];
    const initialBridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector()],
      approvalScope: { artifactId: "artifact-1", sourceHash: "source-a", manifestHash: "manifest-a" },
      eventSink: { append: (event) => void initialEvents.push(event) },
    });

    await initialBridge.call({ connectorId: "personal.mail", operation: "listMessages", input: {} }).catch(() => undefined);
    const approvedId = initialEvents.find((event) => event.type === "connector.review.required")?.data?.id;
    if (typeof approvedId !== "string") throw new Error("Expected connector review id.");

    const approvedBridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector()],
      approvalScope: { artifactId: "artifact-1", sourceHash: "source-a", manifestHash: "manifest-a" },
      connectorApprovalDecision: (approvalId) => (approvalId === approvedId ? "approved" : undefined),
    });
    await expect(approvedBridge.call({ connectorId: "personal.mail", operation: "listMessages", input: {} })).resolves.toMatchObject({
      messages: [expect.objectContaining({ id: "msg-1" })],
    });

    const changedEvents: WorkflowRuntimeEvent[] = [];
    const changedBridge = createWorkflowConnectorBridge({
      manifest: personalManifest("redacted_audit"),
      registrations: [personalConnector()],
      approvalScope: { artifactId: "artifact-1", sourceHash: "source-b", manifestHash: "manifest-a" },
      connectorApprovalDecision: (approvalId) => (approvalId === approvedId ? "approved" : undefined),
      eventSink: { append: (event) => void changedEvents.push(event) },
    });
    await changedBridge.call({ connectorId: "personal.mail", operation: "listMessages", input: {} }).catch(() => undefined);

    const changedId = changedEvents.find((event) => event.type === "connector.review.required")?.data?.id;
    expect(changedId).toEqual(expect.stringMatching(/^connector-review-/));
    expect(changedId).not.toBe(approvedId);
  });
});

function mutableOperation(): WorkflowConnectorDescriptor["operations"][number] {
  return {
    name: "writeRecord",
    label: "Write record",
    description: "Write a test record to a fake external system.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    requiredScopes: ["external.write"],
    sideEffects: "write_external",
    supportsDryRun: false,
    idempotencyKey: "required",
    mutationPolicy: "staged_until_approved",
    defaultTimeoutMs: 5_000,
  };
}

function mutableDescriptor(overrides: Partial<WorkflowConnectorDescriptor> = {}): WorkflowConnectorDescriptor {
  return {
    id: "mutable.external",
    label: "Mutable external connector",
    description: "Fake external connector used to test mutation policy validation.",
    auth: { type: "oauth2", status: "available" },
    accounts: [{ id: "acct", label: "Test account" }],
    scopes: [
      {
        id: "external.write",
        label: "Write external records",
        description: "Write fake records to the external test service.",
        personalData: false,
      },
    ],
    operations: [mutableOperation()],
    rateLimit: { requestsPerMinute: 60, burst: 5 },
    sync: { cursorKind: "none", supportsIncremental: false },
    defaultDataRetention: "redacted_audit",
    dataMinimization: ["Tests only."],
    ...overrides,
  };
}

function personalManifest(dataRetention: "none" | "redacted_audit" | "run_artifact"): WorkflowManifest {
  return {
    tools: [],
    mutationPolicy: "read_only",
    connectors: [
      {
        connectorId: "personal.mail",
        accountId: "primary",
        scopes: ["mail.messages.read"],
        operations: ["listMessages"],
        dataRetention,
      },
    ],
  };
}

function personalConnector(error?: Error) {
  return {
    descriptor: validateWorkflowConnectorDescriptor({
      id: "personal.mail",
      label: "Personal mail",
      description: "Fake personal-data mail connector used to test retention-aware audit events.",
      auth: { type: "oauth2", status: "available" },
      accounts: [{ id: "primary", label: "Primary mailbox" }],
      scopes: [
        {
          id: "mail.messages.read",
          label: "Read messages",
          description: "Read normalized message summaries.",
          personalData: true,
        },
      ],
      operations: [
        {
          name: "listMessages",
          label: "List messages",
          description: "Return normalized personal message summaries.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "number" },
            },
            additionalProperties: false,
          },
          requiredScopes: ["mail.messages.read"],
          sideEffects: "read_personal_data",
          supportsDryRun: true,
          idempotencyKey: "not-supported",
          mutationPolicy: "unsupported",
          defaultTimeoutMs: 5_000,
        },
      ],
      rateLimit: { requestsPerMinute: 60, burst: 5 },
      sync: { cursorKind: "opaque", supportsIncremental: true },
      defaultDataRetention: "redacted_audit",
      dataMinimization: ["Only normalized message summaries are returned."],
    }),
    handlers: {
      listMessages: () => {
        if (error) throw error;
        return {
          messages: [
            {
              id: "msg-1",
              from: "ada@example.com",
              subject: "Launch plan",
              snippet: "The confidential launch plan is attached.",
            },
          ],
        };
      },
    },
  };
}
