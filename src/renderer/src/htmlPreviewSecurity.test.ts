import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(rendererRoot, "../..");

describe("HTML preview security", () => {
  it("keeps renderer CSP from allowing inline scripts or direct data-frame HTML", async () => {
    const html = await readFile(resolve(repoRoot, "src/renderer/index.html"), "utf8");

    expect(html).toContain("script-src 'self'");
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).not.toMatch(/img-src[^;]*\bfile:/);
    expect(html).not.toMatch(/frame-src[^;]*\bdata:/);
    expect(html).not.toContain("[::1]");
  });

  it("keeps generated/file HTML previews off srcDoc and script-capable sandboxes", async () => {
    const filePreview = await readFile(resolve(repoRoot, "src/renderer/src/RightPanelFilePreview.tsx"), "utf8");

    expect(filePreview).not.toContain("srcDoc=");
    expect(filePreview).not.toMatch(/sandbox=["']allow-scripts["']/);
    expect(filePreview).toContain("BlobHtmlFrame");
    expect(filePreview).toContain('sandbox=""');
  });

  it("auto-opens user-selected file HTML previews without changing inert sandboxing", async () => {
    const filePreview = await readFile(resolve(repoRoot, "src/renderer/src/RightPanelFilePreview.tsx"), "utf8");

    expect(filePreview).toContain("initiallyOpen?: boolean");
    expect(filePreview).toContain("const [open, setOpen] = useState(initiallyOpen);");
    expect(filePreview).toContain("if (initiallyOpen) setOpen(true);");
    expect(filePreview).toMatch(/<LazyHtmlPreview[\s\S]*className="file-html-preview"[\s\S]*sandbox=""[\s\S]*initiallyOpen/);
  });
});
