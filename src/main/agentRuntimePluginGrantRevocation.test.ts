import { describe, expect, it, vi } from "vitest";

import type { AmbientPermissionGrant } from "../shared/types";
import {
  pluginPermissionGrantIdsForLabelPrefixes,
  pluginPermissionGrantMatchesLabelPrefixes,
  revokeMcpPermissionGrantsForDescriptorDrift,
  revokePluginPermissionGrantsForLabelPrefixes,
} from "./agentRuntimePluginGrantRevocation";

describe("agentRuntimePluginGrantRevocation", () => {
  it("matches first-party plugin grants by exact label or label prefix", () => {
    expect(pluginPermissionGrantIdsForLabelPrefixes({
      labelPrefixes: ["Run Pi extension pi-arxiv", "Install privileged Pi package helper"],
      grants: [
        grant("grant-exact", "plugin_tool_execute", "Install privileged Pi package helper"),
        grant("grant-prefix", "plugin_tool_execute", "Run Pi extension pi-arxiv:arxiv_paper"),
        grant("grant-other-plugin", "plugin_tool_execute", "Run Ambient CLI brave-search:search"),
        grant("grant-other-kind", "shell_command", "Run Pi extension pi-arxiv:arxiv_paper"),
      ],
    })).toEqual(["grant-exact", "grant-prefix"]);
  });

  it("keeps non-plugin grants and nonmatching labels out of revocation", () => {
    expect(pluginPermissionGrantMatchesLabelPrefixes(
      grant("grant-read", "file_content_read", "Run Pi extension pi-arxiv:arxiv_paper"),
      ["Run Pi extension pi-arxiv"],
    )).toBe(false);
    expect(pluginPermissionGrantMatchesLabelPrefixes(
      grant("grant-plugin", "plugin_tool_execute", "Run Pi extension pi-youtube:youtube_transcript"),
      ["Run Pi extension pi-arxiv"],
    )).toBe(false);
  });

  it("revokes first-party plugin grants matching label prefixes", () => {
    const store = grantStore([
      permissionGrant("grant-exact", {
        actionKind: "plugin_tool_execute",
        targetLabel: "Install privileged Pi package helper",
      }),
      permissionGrant("grant-prefix", {
        actionKind: "plugin_tool_execute",
        targetLabel: "Run Pi extension pi-arxiv:arxiv_paper",
      }),
      permissionGrant("grant-other", {
        actionKind: "plugin_tool_execute",
        targetLabel: "Run Ambient CLI brave-search:search",
      }),
    ]);

    expect(revokePluginPermissionGrantsForLabelPrefixes({
      labelPrefixes: ["Run Pi extension pi-arxiv", "Install privileged Pi package helper"],
    }, { store })).toBe(2);

    expect(store.revokePermissionGrant).toHaveBeenCalledTimes(2);
    expect(store.revokePermissionGrant).toHaveBeenNthCalledWith(1, "grant-exact");
    expect(store.revokePermissionGrant).toHaveBeenNthCalledWith(2, "grant-prefix");
  });

  it("revokes and emits MCP grants for the previous descriptor hash after drift", () => {
    const oldGrant = permissionGrant("grant-old", {
      conditions: mcpGrantConditions("server-1", "workload-1", "hash-old"),
    });
    const currentGrant = permissionGrant("grant-current", {
      conditions: mcpGrantConditions("server-1", "workload-1", "hash-current"),
    });
    const otherServerGrant = permissionGrant("grant-other-server", {
      conditions: mcpGrantConditions("server-2", "workload-1", "hash-old"),
    });
    const store = grantStore([oldGrant, currentGrant, otherServerGrant]);
    const emitPermissionGrantRevoked = vi.fn();

    expect(revokeMcpPermissionGrantsForDescriptorDrift({
      serverId: "server-1",
      workloadName: "workload-1",
      previousDescriptorHash: "hash-old",
      descriptorHash: "hash-current",
    }, { store, emitPermissionGrantRevoked })).toBe(1);

    expect(store.revokePermissionGrant).toHaveBeenCalledWith("grant-old");
    expect(emitPermissionGrantRevoked).toHaveBeenCalledWith({
      ...oldGrant,
      revokedAt: "2026-06-12T00:00:00.000Z",
    });
  });

  it("leaves MCP grants alone when the descriptor hash did not change", () => {
    const store = grantStore([
      permissionGrant("grant-old", {
        conditions: mcpGrantConditions("server-1", "workload-1", "hash-current"),
      }),
    ]);

    expect(revokeMcpPermissionGrantsForDescriptorDrift({
      serverId: "server-1",
      workloadName: "workload-1",
      previousDescriptorHash: "hash-current",
      descriptorHash: "hash-current",
    }, { store, emitPermissionGrantRevoked: vi.fn() })).toBe(0);

    expect(store.revokePermissionGrant).not.toHaveBeenCalled();
  });
});

function grant(id: string, actionKind: string, targetLabel: string) {
  return { id, actionKind: actionKind as any, targetLabel };
}

function permissionGrant(id: string, overrides: Partial<AmbientPermissionGrant> = {}): AmbientPermissionGrant {
  return {
    id,
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    createdBy: "user",
    permissionModeAtCreation: "workspace",
    scopeKind: "thread",
    threadId: "thread-1",
    actionKind: "plugin_tool_execute",
    targetKind: "tool",
    targetHash: `hash-${id}`,
    targetLabel: `Grant ${id}`,
    source: "permission_prompt",
    reason: "Fixture grant.",
    ...overrides,
  };
}

function mcpGrantConditions(serverId: string, workloadName: string, descriptorHash: string): Record<string, unknown> {
  return {
    kind: "ambient-mcp-tool-call",
    schemaVersion: "ambient-mcp-permission-policy-v1",
    descriptorHash,
    subject: {
      serverId,
      workloadName,
      toolName: "fetch",
      descriptorHash,
    },
  };
}

function grantStore(grants: AmbientPermissionGrant[]) {
  const grantsById = new Map(grants.map((candidate) => [candidate.id, candidate]));
  return {
    listPermissionGrants: vi.fn(() => grants),
    revokePermissionGrant: vi.fn((grantId: string) => {
      const grantToRevoke = grantsById.get(grantId);
      if (!grantToRevoke) throw new Error(`Missing grant ${grantId}`);
      return { ...grantToRevoke, revokedAt: "2026-06-12T00:00:00.000Z" };
    }),
  };
}
