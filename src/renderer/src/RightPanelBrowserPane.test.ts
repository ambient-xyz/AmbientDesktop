import { describe, expect, it } from "vitest";

import type { BrowserPickResult } from "../../shared/types";
import { browserPickReferenceText } from "./RightPanelBrowserPane";

describe("browserPickReferenceText", () => {
  it("formats selected browser elements with best selectors, full paths, and bounds", () => {
    const result: BrowserPickResult = {
      canceled: false,
      prompt: "Pick the login button",
      title: "Example Form",
      url: "https://example.test/login",
      selections: [
        {
          selector: "button.submit",
          candidates: [
            "button.submit",
            "form#login > button.submit",
          ],
          tagName: "BUTTON",
          text: "Log in",
          boundingBox: {
            x: 10,
            y: 20,
            width: 120,
            height: 36,
          },
        },
        {
          candidates: [
            "text=Need help?",
            "main > footer > a.help",
          ],
          tagName: "A",
        },
      ],
    };

    expect(browserPickReferenceText(result)).toBe(
      [
        "Browser element reference",
        "URL: https://example.test/login",
        "Title: Example Form",
        "Prompt: Pick the login button",
        "Selected element 1:",
        "Best selector: button.submit",
        "Full path: form#login > button.submit",
        "Tag: BUTTON",
        "Text: Log in",
        "Bounds: 10,20 120x36",
        "Candidate selectors:",
        "- button.submit",
        "- form#login > button.submit",
        "",
        "Selected element 2:",
        "Best selector: main > footer > a.help",
        "Full path: main > footer > a.help",
        "Tag: A",
        "Candidate selectors:",
        "- text=Need help?",
        "- main > footer > a.help",
      ].join("\n"),
    );
  });
});
