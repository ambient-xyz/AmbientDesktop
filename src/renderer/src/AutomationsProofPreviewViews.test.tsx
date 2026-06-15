import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrchestrationRun } from "../../shared/types";
import {
  ProofEvidencePathLink,
  ProofOfWorkPreview,
  ProofPreviewImage,
  proofCspRenderableImageSrc,
  proofEvidenceFileHref,
  proofEvidenceLinkTarget,
  proofPreviewImageLocalPath,
} from "./AutomationsProofPreviewViews";

describe("Automations proof preview views", () => {
  it("resolves proof evidence targets without widening link handling", () => {
    expect(proofEvidenceLinkTarget("https://example.com/proof")).toEqual({
      href: "https://example.com/proof",
      url: "https://example.com/proof",
    });
    expect(proofEvidenceLinkTarget("/tmp/workspace/report.html:12")?.absolutePath).toBe("/tmp/workspace/report.html");
    expect(proofEvidenceLinkTarget("artifacts/proof.html:5", "/tmp/workspace")).toMatchObject({
      href: "file:///tmp/workspace/artifacts/proof.html",
      url: "file:///tmp/workspace/artifacts/proof.html",
      localPath: "/tmp/workspace/artifacts/proof.html",
      absolutePath: "/tmp/workspace/artifacts/proof.html",
    });
    expect(proofEvidenceLinkTarget("../escape.txt", "/tmp/workspace")).toBeUndefined();
    expect(proofEvidenceLinkTarget("mailto:test@example.com", "/tmp/workspace")).toBeUndefined();
  });

  it("formats file hrefs and preview image sources for CSP-safe rendering", () => {
    expect(proofEvidenceFileHref("/tmp/workspace/proof packet#1.png")).toBe("file:///tmp/workspace/proof%20packet%231.png");
    expect(proofCspRenderableImageSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(proofCspRenderableImageSrc("ambient-media://proof-1")).toBe("ambient-media://proof-1");
    expect(proofCspRenderableImageSrc("https://example.com/proof.png")).toBeUndefined();
    expect(proofPreviewImageLocalPath("artifacts/proof.png", "/tmp/workspace")).toBe("/tmp/workspace/artifacts/proof.png");
  });

  it("renders evidence links and direct preview images through the moved owner", () => {
    const linkMarkup = renderToStaticMarkup(
      <ProofEvidencePathLink path="artifacts/proof.html" workspacePath="/tmp/workspace">
        Open proof
      </ProofEvidencePathLink>,
    );
    const imageMarkup = renderToStaticMarkup(<ProofPreviewImage src="data:image/png;base64,abc" alt="Proof screenshot" />);

    expect(linkMarkup).toContain("proof-evidence-link");
    expect(linkMarkup).toContain("Open proof");
    expect(linkMarkup).toContain("file:///tmp/workspace/artifacts/proof.html");
    expect(imageMarkup).toContain("<img");
    expect(imageMarkup).toContain("Proof screenshot");
  });

  it("renders proof summaries, changed files, and command evidence through the moved preview", () => {
    const markup = renderToStaticMarkup(<ProofOfWorkPreview run={runWithProof()} defaultOpen />);

    expect(markup).toContain("Proof of work");
    expect(markup).toContain("Changed files");
    expect(markup).toContain("src/App.tsx");
    expect(markup).toContain("Unit / integration test evidence");
    expect(markup).toContain("pnpm run typecheck passed");
    expect(markup).toContain("Assistant summary");
    expect(markup).toContain("Implemented the proof preview.");
  });
});

function runWithProof(): OrchestrationRun {
  return {
    id: "run-1",
    taskId: "task-1",
    attemptNumber: 0,
    status: "completed",
    workspacePath: "/tmp/workspace",
    startedAt: "2026-06-14T10:00:00.000Z",
    finishedAt: "2026-06-14T10:00:05.000Z",
    proofOfWork: {
      kind: "agent-run",
      changedFiles: ["src/App.tsx"],
      commands: [
        {
          label: "Typecheck",
          path: "logs/typecheck.txt",
          detail: "pnpm run typecheck passed",
        },
      ],
      lastAssistantText: "Implemented the proof preview.",
    },
  };
}
