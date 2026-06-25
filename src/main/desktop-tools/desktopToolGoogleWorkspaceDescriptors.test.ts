import { describe, expect, it } from "vitest";

import { googleWorkspaceSetupToolDescriptor, googleWorkspaceSetupToolDescriptors } from "./desktopToolRegistry";
import { googleWorkspaceSetupToolDescriptors as focusedGoogleWorkspaceSetupToolDescriptors } from "./desktopToolGoogleWorkspaceDescriptors";

describe("desktopToolGoogleWorkspaceDescriptors", () => {
  it("keeps the public registry Google Workspace descriptor export wired to the focused module", () => {
    expect(googleWorkspaceSetupToolDescriptors).toBe(focusedGoogleWorkspaceSetupToolDescriptors);
    expect(googleWorkspaceSetupToolDescriptor("google_workspace_call")).toBe(
      focusedGoogleWorkspaceSetupToolDescriptors.find((tool) => tool.name === "google_workspace_call"),
    );
  });
});
