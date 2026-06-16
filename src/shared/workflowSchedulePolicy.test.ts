import { describe, expect, it } from "vitest";

import { googleWorkspaceConnectorGrantTarget, googleWorkspaceGrantConditions } from "./googleWorkspaceGrantTargets";
import type { AmbientPermissionGrant, WorkflowArtifactSummary } from "./types";
import {
  workflowArtifactScheduleBlockReason,
  workflowArtifactScheduleConnectorGrantUses,
  workflowScheduleConnectorGrantRequirements,
} from "./workflowSchedulePolicy";

describe("workflowSchedulePolicy", () => {
  it("groups Google Calendar read operations into one scheduled connector authority", () => {
    const artifact = artifactWithConnectors([
      {
        connectorId: "google.calendar",
        accountId: "travis@example.test",
        scopes: ["calendar.readonly"],
        operations: ["listEvents", "readEvent", "freeBusy"],
        dataRetention: "redacted_audit",
      },
    ]);
    const requirements = workflowScheduleConnectorGrantRequirements(artifact);

    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      connectorId: "google.calendar",
      accountId: "travis@example.test",
      targetLabel: "Google Calendar read access (travis@example.test)",
    });
    expect(workflowArtifactScheduleBlockReason(artifact, {
      workflowThreadId: "workflow-1",
      permissionGrants: [],
    })).toBe("Workflow schedule requires persistent connector grant for Google Calendar read access (travis@example.test).");

    const grant = grantForTarget(requirements[0].googleTarget!);
    expect(workflowArtifactScheduleBlockReason(artifact, {
      workflowThreadId: "workflow-1",
      permissionGrants: [grant],
    })).toBeUndefined();
    expect(workflowArtifactScheduleConnectorGrantUses(artifact, {
      workflowThreadId: "workflow-1",
      permissionGrants: [grant],
    })).toEqual([expect.objectContaining({ grant, targetLabel: grant.targetLabel })]);
  });

  it("keeps Gmail metadata, thread, and attachment scheduled authorities separate", () => {
    const artifact = artifactWithConnectors([
      {
        connectorId: "google.gmail",
        accountId: "travis@example.test",
        scopes: ["gmail.readonly"],
        operations: ["search", "readThread", "readAttachment"],
        dataRetention: "redacted_audit",
      },
    ]);
    const requirements = workflowScheduleConnectorGrantRequirements(artifact);

    expect(requirements.map((requirement) => requirement.targetLabel)).toEqual([
      "Gmail metadata search (travis@example.test)",
      "Gmail thread read (travis@example.test)",
      "Gmail attachment read (travis@example.test)",
    ]);

    const searchGrant = grantForTarget(requirements[0].googleTarget!);
    expect(workflowArtifactScheduleBlockReason(artifact, {
      workflowThreadId: "workflow-1",
      permissionGrants: [searchGrant],
    })).toBe(
      "Workflow schedule requires persistent connector grants for Gmail thread read (travis@example.test), Gmail attachment read (travis@example.test).",
    );
  });
});

function artifactWithConnectors(connectors: WorkflowArtifactSummary["manifest"]["connectors"]): Pick<WorkflowArtifactSummary, "id" | "status" | "workflowThreadId" | "manifest"> {
  return {
    id: "artifact-1",
    status: "approved",
    workflowThreadId: "workflow-1",
    manifest: {
      tools: [],
      mutationPolicy: "read_only",
      connectors,
    },
  };
}

function grantForTarget(target: NonNullable<ReturnType<typeof googleWorkspaceConnectorGrantTarget>>): AmbientPermissionGrant {
  return {
    id: `grant-${target.access}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "workflow_thread",
    workflowThreadId: "workflow-1",
    actionKind: target.actionKind,
    targetKind: target.targetKind,
    targetHash: `hash-${target.access}`,
    targetLabel: target.label,
    conditions: googleWorkspaceGrantConditions(target, { scheduledWorkflow: true }),
    source: "workflow_review",
    reason: "Allow scheduled Google Workspace reads.",
  };
}
