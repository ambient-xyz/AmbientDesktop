import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PermissionAuditEntry } from "../../shared/types";
import { permissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import { InfoTooltip, PermissionFullAccessReceiptList } from "./RightPanelStatusWidgets";

describe("RightPanelStatusWidgets", () => {
  it("renders InfoTooltip with the existing trigger, label, and bubble markup", () => {
    const markup = renderToStaticMarkup(
      <InfoTooltip className="heading-info-tooltip" label="Details" text="Explains why this setting is shown." />,
    );

    expect(markup).toContain("info-tooltip-wrap heading-info-tooltip");
    expect(markup).toContain("info-tooltip-trigger link");
    expect(markup).toContain('aria-label="Details: Explains why this setting is shown."');
    expect(markup).toContain('role="tooltip"');
    expect(markup).toContain(">Explains why this setting is shown.<");
  });

  it("omits an empty Full Access receipt list", () => {
    expect(renderToStaticMarkup(<PermissionFullAccessReceiptList receipts={[]} />)).toBe("");
  });

  it("renders visible Full Access receipts and a hidden receipt count", () => {
    const receipts = permissionGrantRegistryModel({
      grants: [],
      auditEntries: [
        auditEntry({ id: "receipt-oldest", createdAt: "2026-05-05T08:00:00.000Z", toolName: "old_tool" }),
        auditEntry({ id: "receipt-middle", createdAt: "2026-05-05T09:00:00.000Z", toolName: "middle_tool" }),
        auditEntry({
          id: "receipt-newest",
          createdAt: "2026-05-05T10:00:00.000Z",
          toolName: "bash",
          risk: "workspace-command",
          detail: "Command: pnpm run typecheck\nWorkspace: /tmp/project",
        }),
      ],
      now: "2026-05-05T00:00:00.000Z",
    }).fullAccessReceipts;

    const markup = renderToStaticMarkup(<PermissionFullAccessReceiptList receipts={receipts} limit={1} />);

    expect(markup).toContain("Full Access audit receipts");
    expect(markup).toContain("3 allowed bypasses recorded without creating persistent grants");
    expect(markup).toContain("bash");
    expect(markup).toContain("Workspace Command");
    expect(markup).toContain("Command: pnpm run typecheck");
    expect(markup).toContain("2 older Full Access receipts hidden.");
    expect(markup).not.toContain("middle_tool");
  });
});

function auditEntry(overrides: Partial<PermissionAuditEntry>): PermissionAuditEntry {
  return {
    id: "receipt",
    threadId: "thread-1",
    createdAt: "2026-05-05T08:00:00.000Z",
    permissionMode: "full-access",
    toolName: "google_workspace_call",
    risk: "plugin-tool",
    decision: "allowed",
    reason: "Allowed automatically by Full Access mode.",
    decisionSource: "allowed_by_full_access",
    ...overrides,
  };
}
