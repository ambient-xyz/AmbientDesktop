import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DesktopState } from "../../shared/desktopTypes";
import { AppConversationEmptyState } from "./AppConversationEmptyState";

describe("AppConversationEmptyState", () => {
  it("renders the default Ambient empty state with setup callout", () => {
    const markup = renderToStaticMarkup(
      <AppConversationEmptyState provider={provider()} onOpenAmbientKeys={vi.fn()} onOpenApiKeyDialog={vi.fn()} />,
    );

    expect(markup).toContain("<h1>Ambient</h1>");
    expect(markup).toContain("Build iteratively in threads.");
    expect(markup).toContain("Goal mode loops");
    expect(markup).toContain("Project Board");
    expect(markup).toContain("support@ambientcrypto.ai");
    expect(markup).toContain("Add a Ambient API key to start working.");
    expect(markup).toContain("Get key");
    expect(markup).toContain("Paste key");
  });

  it("renders workflow-recorder empty copy and hides setup when a key exists", () => {
    const markup = renderToStaticMarkup(
      <AppConversationEmptyState
        provider={provider({ hasApiKey: true })}
        workflowRecorderEmptyChatState={{
          title: "Workflow Recorder",
          paragraphs: ["Record the task once, then ask Ambient to draft a playbook."],
        }}
        onOpenAmbientKeys={vi.fn()}
        onOpenApiKeyDialog={vi.fn()}
      />,
    );

    expect(markup).toContain("<h1>Workflow Recorder</h1>");
    expect(markup).toContain("Record the task once, then ask Ambient to draft a playbook.");
    expect(markup).not.toContain("Add a Ambient API key to start working.");
  });
});

function provider(overrides: Partial<DesktopState["provider"]> = {}): DesktopState["provider"] {
  return {
    providerId: "ambient",
    providerLabel: "Ambient",
    hasApiKey: false,
    status: "ready",
    ...overrides,
  } as DesktopState["provider"];
}
