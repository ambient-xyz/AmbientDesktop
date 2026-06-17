import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThreadContextMenu, type ThreadContextMenuState } from "./AppActionDialogs";

describe("ThreadContextMenu", () => {
  it("exposes PDF export from the thread right-click menu", () => {
    const markup = renderToStaticMarkup(
      <ThreadContextMenu
        menu={threadMenu()}
        onPin={() => undefined}
        onRename={() => undefined}
        onArchive={() => undefined}
        onMarkUnread={() => undefined}
        onReveal={() => undefined}
        onCopyWorkingDirectory={() => undefined}
        onCopySessionId={() => undefined}
        onCopyDeeplink={() => undefined}
        onExportPdf={() => undefined}
        onForkLocal={() => undefined}
        onForkWorktree={() => undefined}
        onOpenMiniWindow={() => undefined}
      />,
    );

    expect(markup).toContain("Export PDF");
    expect(markup).toContain('role="menuitem"');
  });
});

function threadMenu(): ThreadContextMenuState {
  return {
    x: 12,
    y: 24,
    workspacePath: "/tmp/workspace",
    thread: {
      id: "thread-1",
      title: "Debug chat",
      workspacePath: "/tmp/workspace",
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
      lastMessagePreview: "",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient-test-model",
      thinkingLevel: "medium",
    },
  };
}
