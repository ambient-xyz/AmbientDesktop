import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFileContent, WorkspaceOpenTarget } from "../../shared/workspaceTypes";
import { FilePreview } from "./RightPanelFilePreview";

describe("FilePreview", () => {
  it("renders a visible status banner for absolute local file previews", () => {
    const markup = renderFilePreview({
      source: "local",
      path: "/tmp/ambient-run/workspace/calculator.html",
      absolutePath: "/tmp/ambient-run/workspace/calculator.html",
      name: "calculator.html",
      kind: "html",
      language: "html",
      content: "<!doctype html><button>1</button>",
    });

    expect(markup).toContain("Local preview opened");
    expect(markup).toContain("/tmp/ambient-run/workspace/calculator.html");
  });

  it("keeps workspace file previews free of the local preview banner", () => {
    const markup = renderFilePreview({
      path: "calculator.html",
      name: "calculator.html",
      kind: "html",
      language: "html",
      content: "<!doctype html><button>1</button>",
    });

    expect(markup).not.toContain("Local preview opened");
  });
});

function renderFilePreview(file: Partial<WorkspaceFileContent>): string {
  return renderToStaticMarkup(
    <FilePreview
      file={{
        path: "notes.txt",
        name: "notes.txt",
        content: "hello",
        size: 5,
        truncated: false,
        binary: false,
        kind: "text",
        ...file,
      }}
      openTargets={[] satisfies WorkspaceOpenTarget[]}
      onOpen={vi.fn()}
      onAddContext={vi.fn()}
      renderRichText={(content) => content}
    />,
  );
}
