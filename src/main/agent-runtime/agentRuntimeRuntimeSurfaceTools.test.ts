import { describe, expect, it } from "vitest";

import { registerRuntimeSurfaceTools } from "./agentRuntimeRuntimeSurfaceTools";
import { buildRuntimeSurfaceSnapshot } from "../../shared/runtimeSurfaceSnapshot";

describe("registerRuntimeSurfaceTools", () => {
  it("registers and executes the runtime surface snapshot tool", async () => {
    const registeredTools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
    let observedLimit: number | undefined;

    registerRuntimeSurfaceTools({
      registerTool: (tool: any) => registeredTools.push(tool),
    }, {
      runtimeSurfaceSnapshot: (limit) => {
        observedLimit = limit;
        return buildRuntimeSurfaceSnapshot({
          workspace: {
            name: "AmbientDesktop",
            path: "/workspace",
            statePath: "/tmp/ambient-state",
            sessionPath: "/tmp/ambient-state/sessions",
          },
          threads: [],
          workflowFolders: [],
          projects: [
            {
              name: "AmbientDesktop",
              path: "/workspace",
              updatedAt: "2026-05-17T00:00:00.000Z",
              pinned: true,
              threads: [],
            },
            {
              name: "sideProject",
              path: "/workspace-side",
              updatedAt: "2026-05-16T00:00:00.000Z",
              threads: [],
            },
          ],
          limit,
        } as any);
      },
    });

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "ambient_runtime_surface_snapshot",
    ]);

    const result = await registeredTools[0]!.execute("runtime-surface-snapshot", { limit: 1 });
    expect(observedLimit).toBe(1);
    expect(result.content[0].text).toContain("Ambient runtime surface snapshot");
    expect(result.content[0].text).toContain("Workspace: AmbientDesktop");
    expect(result.content[0].text).toContain("Projects: 1/2");
    expect(result.details).toMatchObject({
      runtime: "ambient-messaging-gateway",
      toolName: "ambient_runtime_surface_snapshot",
      status: "complete",
      snapshot: {
        workspace: {
          name: "AmbientDesktop",
          path: "/workspace",
        },
        limits: {
          projectCount: 2,
          returnedProjectCount: 1,
          chatCount: 0,
          workflowAgentCount: 0,
        },
        projects: [{
          name: "AmbientDesktop",
          path: "/workspace",
          active: true,
        }],
      },
    });
  });
});
