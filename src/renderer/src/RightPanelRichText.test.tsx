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

  it("caps interactive inline controls while keeping overflow link text visible", () => {
    const content = Array.from({ length: 12 }, (_value, index) => {
      return [
        `[source ${index}](https://example.test/${index})`,
        "`reports/heavy-" + index + ".html`",
      ].join(" ");
    }).join("\n");
    const markup = renderToStaticMarkup(
      <RichText
        content={content}
        workspacePath="/workspace"
        onPreviewPath={vi.fn()}
        onOpenUrl={vi.fn()}
        maxInteractiveInlineControls={5}
      />,
    );

    const interactiveControls = (markup.match(/inline-(?:url|artifact)-link/g) ?? []).length;
    expect(interactiveControls).toBe(5);
    expect(markup).toContain("inline-link-suppressed");
    expect(markup).toContain("reports/heavy-11.html");
    expect(markup).toContain("Show remaining links");
  });

  it("applies the inline control cap to markdown image artifact previews", () => {
    const content = Array.from({ length: 6 }, (_value, index) => `![image ${index}](artifacts/image-${index}.png)`).join("\n");
    const markup = renderToStaticMarkup(
      <RichText
        content={content}
        workspacePath="/workspace"
        onPreviewPath={vi.fn()}
        onOpenMediaModal={vi.fn()}
        maxInteractiveInlineControls={2}
      />,
    );

    const mediaPreviewCount = (markup.match(/inline-media-preview image/g) ?? []).length;
    expect(mediaPreviewCount).toBeLessThanOrEqual(2);
    expect(markup).toContain("inline-link-suppressed");
    expect(markup).toContain("Show remaining links");
  });

  it("shows the overflow action when strong code-only artifact links are capped", () => {
    const content = Array.from({ length: 5 }, (_value, index) => "**`reports/strong-" + index + ".html`**").join(" ");
    const markup = renderToStaticMarkup(
      <RichText
        content={content}
        workspacePath="/workspace"
        onPreviewPath={vi.fn()}
        maxInteractiveInlineControls={2}
      />,
    );

    const artifactControls = (markup.match(/inline-artifact-link/g) ?? []).length;
    expect(artifactControls).toBe(2);
    expect(markup).toContain("reports/strong-4.html");
    expect(markup).toContain("Show remaining links");
  });

  it("does not show the overflow action for ordinary non-link inline code", () => {
    const content = Array.from({ length: 40 }, (_value, index) => "`identifier_" + index + "`").join(" ");
    const markup = renderToStaticMarkup(
      <RichText
        content={content}
        workspacePath="/workspace"
        maxInteractiveInlineControls={2}
      />,
    );

    expect(markup).toContain("identifier_39");
    expect(markup).not.toContain("Show remaining links");
    expect(markup).not.toContain("inline-link-suppressed");
  });
});
