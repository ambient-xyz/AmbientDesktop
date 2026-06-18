import { describe, expect, it } from "vitest";

import type { WorkspaceFileContent } from "../../shared/workspaceTypes";
import { fileContextReference } from "./RightPanelUtilityPaneControllers";

describe("RightPanelUtilityPaneControllers", () => {
  it("keeps workspace file context references relative", () => {
    expect(fileContextReference(workspaceFile({ path: "notes/plan.md", name: "plan.md", size: 42 }))).toEqual({
      path: "notes/plan.md",
      name: "plan.md",
      kind: "file",
      size: 42,
    });
  });

  it("marks local file context references as absolute", () => {
    expect(
      fileContextReference(
        workspaceFile({
          path: "plan.md",
          name: "plan.md",
          source: "local",
          absolutePath: "/tmp/plan.md",
          size: 64,
        }),
      ),
    ).toEqual({
      path: "/tmp/plan.md",
      name: "plan.md",
      kind: "file",
      size: 64,
      absolute: true,
    });
  });
});

function workspaceFile(overrides: Partial<WorkspaceFileContent>): WorkspaceFileContent {
  return {
    path: "file.txt",
    name: "file.txt",
    content: "",
    size: 0,
    truncated: false,
    binary: false,
    kind: "text",
    ...overrides,
  };
}
