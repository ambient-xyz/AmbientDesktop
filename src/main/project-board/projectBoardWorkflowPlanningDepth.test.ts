import { describe, expect, it } from "vitest";
import { projectBoardShouldUseSectionedPlanningForWorkflow } from "./projectBoardWorkflowPlanningDepth";
import type { ProjectBoardSynthesisSource } from "./projectBoardSynthesis";

function durableGradientPlanSource(overrides: Partial<ProjectBoardSynthesisSource> = {}): ProjectBoardSynthesisSource {
  return {
    kind: "plan_artifact",
    title: "Scope Contract Durable Plan",
    summary: "A single-page CSS gradient generator.",
    excerpt: `
      Scope Contract
      Goal: A single-page web app where the user picks two colors, sees a live CSS gradient preview, and can copy the corresponding CSS code.
      Included:
      - Two color pickers
      - Live gradient preview box
      - Live-updating CSS code output
      - One-click copy to clipboard
      Excluded:
      - More than 2 color stops
      - Preset palettes or saved gradients
      - Export to image
      - Dark/light theme toggle
      - Backend, auth, analytics, deployment pipeline
      Implementation Plan
      Create a minimal static HTML/CSS/JS app. No build tools, no frameworks, no dependencies.
    `,
    path: ".ambient/board/plans/create-a-plan-for-an-app-where-the-user-can-2026-06-01-16-00-14-DurablePlan.html",
    relevance: 100,
    includeInSynthesis: true,
    authorityRole: "primary",
    ...overrides,
  };
}

describe("project board workflow planning depth", () => {
  it("does not section a shallow single durable plan even when the saved artifact is large", () => {
    const source = durableGradientPlanSource({
      excerpt: `${durableGradientPlanSource().excerpt}\n${"Validation detail.\n".repeat(1200)}`,
    });

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source])).toBe(false);
  });

  it("keeps shallow single-page utility plans compact even when they contain clarification questions", () => {
    const source = durableGradientPlanSource({
      title: "Time Zone Converter Durable Plan",
      summary: "A single-page time zone converter.",
      excerpt: `
        Scope Contract
        Goal: A single-page web app where the user enters a date and time, selects a source timezone, and sees that instant converted into UTC, London, and Tokyo.
        Included:
        - Date and time inputs
        - Source timezone selector
        - Three fixed output cards
        Excluded:
        - Auth or user accounts
        - Backend storage
        - External APIs
        Open questions:
        - Should output cards show IANA zone ids or city labels?
        - Should invalid local times display inline errors or fallback output?
        Implementation Plan
        Create one static HTML file with embedded CSS and vanilla JavaScript. No build tools, no dependencies, no behavior beyond the fixed converter.
      `,
      path: ".ambient/board/plans/Time-Zone-Converter-2026-06-03-16-39-22-DurablePlan.html",
    });

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source])).toBe(false);
  });

  it("does not section rendered durable HTML for a single-page converter", () => {
    const source = durableGradientPlanSource({
      kind: "implementation_plan",
      title: "Time Zone Converter — Durable Plan",
      summary: "Goal: A single-page web app where the user enters a time + source time zone and instantly sees that same moment in 3 target time zones.",
      excerpt: `
        <!doctype html>
        <html>
          <head><title>Time Zone Converter Durable Plan</title></head>
          <body>
            <main>
              <h1>Time Zone Converter</h1>
              <p>Use one source timezone selector, a time input, and three target timezone result cards.</p>
              <p>No backend, auth, external services, persistence, deployment, or accounts.</p>
            </main>
          </body>
        </html>
      `,
      path: ".ambient/board/plans/Time-Zone-Convertor-2-2026-06-04-09-29-53-DurablePlan.html",
    });

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source])).toBe(false);
  });

  it("does not section a shallow BMI durable plan with form-result location wording", () => {
    const source = durableGradientPlanSource({
      kind: "plan_artifact",
      title: "BMI Calculator App — Durable Plan",
      summary: "Single-page BMI calculator app with height and weight inputs.",
      excerpt: `
        Scope Contract
        User request: create a plan for an app where user can enter height and weight, app shows BMI and category.
        In scope:
        - Height input
        - Weight input
        - BMI calculation
        - Result display location below the calculate button
        Implementation Plan
        Create a single-page local form in one index.html file.
        Files to Create
        - index.html
        ${"Validation detail for BMI formula and category thresholds.\n".repeat(800)}
      `,
      path: ".ambient/board/plans/BMI-Calculator-4-2026-06-04-14-18-17-DurablePlan.html",
    });

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source])).toBe(false);
  });

  it("does not section shallow BMI plan text when source classification is generic markdown", () => {
    const source = durableGradientPlanSource({
      kind: "markdown",
      title: "BMI Calculator App — Final Plan",
      summary: "Single-page local BMI calculator in one index.html file.",
      path: ".ambient/board/plans/BMI-Calculator-4-2026-06-04-14-18-17-DurablePlan.html",
      excerpt: `
        Scope Contract
        In scope: A web app where the user enters height and weight, the app calculates BMI and displays the BMI category.
        Out of scope: backend/API and account system.
        Implementation Plan
        Create a single-page static HTML/CSS/JS app. Use one local form and one index.html file.
        Files to Create
        - index.html
        ${"Validation detail for BMI formula and category thresholds.\n".repeat(800)}
      `,
    });

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source])).toBe(false);
  });

  it("does not let ignored repository sources force sectioned planning for a shallow durable plan", () => {
    const source = durableGradientPlanSource({
      title: "Local Random Option Picker Durable Plan",
      summary: "A simple local app where the user pastes options, clicks Pick, and sees one random choice.",
      excerpt: `
        Scope Contract
        Requested: A simple local app where you paste options, click Pick, and see one random choice.
        Constraints: No backend, no auth, no deployment.
        Assumed: Single HTML file with inline CSS/JS, runs by opening in a browser.
        Out of scope: History of picks, weighted choices, animations, saving/sharing, deployment/build step.
        Implementation Plan
        Create one file: random-picker/index.html
      `,
      path: ".ambient/board/plans/Local-Random-Option-Picker-DurablePlan.html",
    });
    const ignoredNoise: ProjectBoardSynthesisSource[] = Array.from({ length: 10 }, (_, index) => ({
      kind: "implementation_plan",
      title: `Ignored spaceship game source ${index + 1}`,
      summary: "Build a playable browser-based Three.js/WebGL spaceship game with analytics and deployment.",
      excerpt: "Game loop, WebGL renderer, enemy waves, deployment, analytics, and rich UI cards.\n".repeat(400),
      relevance: 90,
      includeInSynthesis: false,
      authorityRole: "ignored",
    }));

    expect(projectBoardShouldUseSectionedPlanningForWorkflow([source, ...ignoredNoise])).toBe(false);
  });
});
