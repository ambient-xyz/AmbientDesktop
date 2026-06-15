import { describe, expect, it } from "vitest";
import {
  projectBoardKickoffGoalIsBoilerplate,
  projectBoardPlanDisplayTitle,
  projectBoardPlanGoalFromText,
} from "./projectBoardPlanIdentity";

describe("project board plan identity", () => {
  it("derives the product title from a generic Scope Contract durable plan", () => {
    const content = `
      <h2>Scope Contract</h2>
      <p><strong>Goal:</strong> A single-page web app where the user picks two colors, sees a live CSS gradient preview, and can copy the corresponding CSS code.</p>
      <h2>Implementation Plan</h2>
    `;

    expect(
      projectBoardPlanDisplayTitle({
        artifactTitle: "Scope Contract",
        threadTitle: "create a plan for an app where the user can...",
        content,
      }),
    ).toBe("CSS Gradient Generator");
    expect(projectBoardPlanGoalFromText(content)).toContain("picks two colors");
  });

  it("recognizes generic kickoff goal boilerplate", () => {
    expect(
      projectBoardKickoffGoalIsBoilerplate(
        "Ship the next coherent, testable increment for Scope Contract board, using the included project sources as the scope boundary.",
      ),
    ).toBe(true);
  });

  it("strips Plan prefixes and extracts Yes No Maybe evidence from durable plan tables", () => {
    const content = `
      Plan: Yes / No / Maybe Decision App
      Scope Contract
      Single button that produces a random answer | In scope | "User taps a button, gets a random Yes / No / Maybe answer"
      Shake-button -> scale-up answer animation | In scope | Planner decision
    `;

    expect(projectBoardPlanDisplayTitle({ artifactTitle: "Plan: Yes / No / Maybe Decision App", content })).toBe(
      "Yes / No / Maybe Decision App",
    );
    expect(projectBoardPlanGoalFromText(content)).toBe("User taps a button, gets a random Yes / No / Maybe answer");
  });

  it("strips trailing plan labels from product titles", () => {
    expect(projectBoardPlanDisplayTitle({ artifactTitle: "BMI Calculator App - Implementation Plan" })).toBe("BMI Calculator App");
    expect(projectBoardPlanDisplayTitle({ artifactTitle: "BMI Calculator App — Durable Plan" })).toBe("BMI Calculator App");
  });

  it("ignores plan section headings when choosing board titles", () => {
    expect(
      projectBoardPlanDisplayTitle({
        artifactTitle: "Stage 1 — Build the app",
        threadTitle: "Find & Replace Tool",
        content: "User request: An app where the user can paste text, enter find and replace terms, and get the result.",
      }),
    ).toBe("Find & Replace Tool");

    expect(
      projectBoardPlanDisplayTitle({
        artifactTitle: "Tech: Single self-contained HTML file",
        content: "Requested: An app that takes a bill amount and number of people, then calculates the per-person split with an optional tip.",
      }),
    ).toBe("Currency Tip Splitter");
  });

  it("infers concise titles for simple app goals", () => {
    expect(
      projectBoardPlanDisplayTitle({
        artifactTitle: "Scope Contract",
        content: "What the user asked for: An app that generates N paragraphs, sentences, or words of placeholder text.",
      }),
    ).toBe("Placeholder Text Generator");

    expect(
      projectBoardPlanDisplayTitle({
        artifactTitle: "Implementation Plan",
        content: 'User request: An app where the user can paste text, enter "find" and "replace" terms, and get the result.',
      }),
    ).toBe("Find & Replace Tool");
  });

  it("derives a title from markdown-bold scope contract request labels", () => {
    const content = `
      ## Scope Contract

      **User request:** A simple local random option picker — paste options, click Pick, show one random choice.

      **Excluded (not requested, not required):**
      - Backend, API, database, persistence
      - Auth, accounts, deployment
    `;

    expect(projectBoardPlanDisplayTitle({ artifactTitle: "Scope Contract", content })).toBe("Random Option Picker");
    expect(projectBoardPlanGoalFromText(content)).toContain("random option picker");
  });
});
