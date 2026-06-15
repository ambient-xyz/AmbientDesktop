import { describe, expect, it } from "vitest";
import {
  chatCompletionPromptText,
  detectDirectHelperOperation,
  sourceClassificationDecisionsFromBody,
  sourceClassificationInputsFromBody,
  sourceClassificationInputsFromPrompt,
} from "./e2e-project-board-direct-helper-retry-gmi-live-lib.mjs";

describe("direct-helper retry live harness helpers", () => {
  it("extracts source classification inputs from canonical prompt blocks", () => {
    const prompt = [
      "Classify these project-board sources for board synthesis.",
      "",
      "Sources:",
      "",
      "--- SOURCE 1 ---",
      "  sourceId: source-readme",
      "  sourceKey: file:README.md",
      "title: README",
      "",
      "--- SOURCE 2 ---",
      "sourceId: source-technical-notes",
      "sourceKey: file:TECHNICAL_NOTES.md",
      "title: Technical Notes",
    ].join("\n");

    expect(sourceClassificationInputsFromPrompt(prompt)).toEqual([
      { sourceId: "source-readme", sourceKey: "file:README.md" },
      { sourceId: "source-technical-notes", sourceKey: "file:TECHNICAL_NOTES.md" },
    ]);
  });

  it("handles structured chat message content when building deterministic setup classifications", () => {
    const body = requestBody([
      {
        type: "text",
        text: [
          "Ambient contract: source_classification",
          "",
          "--- SOURCE 1 ---",
          "sourceId: source-project-brief",
          "sourceKey: file:PROJECT_BRIEF.md",
          "title: Project Brief",
        ].join("\n"),
      },
      {
        type: "text",
        text: [
          "--- SOURCE 2 ---",
          "sourceId: source-technical-notes",
          "sourceKey: file:TECHNICAL_NOTES.md",
          "title: Technical Notes",
        ].join("\n"),
      },
    ]);

    expect(detectDirectHelperOperation(body)).toBe("source-classification");
    expect(chatCompletionPromptText(body)).toContain("sourceId: source-project-brief");
    expect(sourceClassificationDecisionsFromBody(body)).toEqual([
      expect.objectContaining({
        sourceId: "source-project-brief",
        sourceKey: "file:PROJECT_BRIEF.md",
        effectiveKind: "functional_spec",
        includeInSynthesis: true,
      }),
      expect.objectContaining({
        sourceId: "source-technical-notes",
        sourceKey: "file:TECHNICAL_NOTES.md",
        effectiveKind: "architecture_artifact",
        includeInSynthesis: true,
      }),
    ]);
  });

  it("fails clearly instead of returning an empty deterministic classification set", () => {
    expect(() => sourceClassificationDecisionsFromBody(requestBody("source_classification without source blocks"))).toThrow(
      "Deterministic source-classification setup could not find sourceId/sourceKey lines",
    );
  });

  it("lets the harness distinguish setup source-classification prompts from later source-classification calls", () => {
    const body = requestBody("source_classification without source blocks");

    expect(detectDirectHelperOperation(body)).toBe("source-classification");
    expect(sourceClassificationInputsFromBody(body)).toEqual([]);
  });
});

function requestBody(content) {
  return Buffer.from(
    JSON.stringify({
      messages: [
        { role: "system", content: "system contract" },
        { role: "user", content },
      ],
    }),
    "utf8",
  );
}
