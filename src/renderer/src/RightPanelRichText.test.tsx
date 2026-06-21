import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RichText } from "./RightPanelRichText";

describe("RichText", () => {
  it("renders shell commands in fenced code as plain copyable code", () => {
    const markup = renderToStaticMarkup(
      <RichText
        content={[
          "```bash",
          "ssh-copy-id -i ~/.ssh/rtx6000_ed25519.pub <rtx_user>@100.99.88.49",
          "```",
        ].join("\n")}
        workspacePath="/workspace"
        onPreviewPath={vi.fn()}
      />,
    );

    expect(markup).toContain("ssh-copy-id -i ~/.ssh/rtx6000_ed25519.pub");
    expect(markup).toContain('class="rich-code-copy-button"');
    expect(markup).toContain('aria-label="Copy bash code"');
    expect(markup).not.toContain("inline-artifact-link");
  });

  it("keeps single-artifact code blocks selectable while exposing open and copy actions", () => {
    const markup = renderToStaticMarkup(
      <RichText content={["```html", "reports/summary.html", "```"].join("\n")} workspacePath="/workspace" onPreviewPath={vi.fn()} />,
    );

    expect(markup).toContain("reports/summary.html");
    expect(markup).toContain('class="rich-code-open-button"');
    expect(markup).toContain('class="rich-code-copy-button"');
    expect(markup).not.toContain("inline-artifact-link");
  });
});
