import { describe, expect, it } from "vitest";
import {
  dedupeProjectBoardQuestions,
  projectBoardQuestionDedupeKey,
  projectBoardQuestionsAreNearDuplicates,
} from "./projectBoardQuestionDedupe";

describe("projectBoardQuestionDedupe", () => {
  it("dedupes clarification questions with parenthetical example differences", () => {
    const first =
      "Does 'classic rotation' strictly prohibit any modern control additions (e.g., strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?";
    const second =
      "Does 'classic rotation' strictly prohibit modern control additions (strafe, boost, brake), or is it the baseline with room for layered mechanics in later phases?";

    expect(projectBoardQuestionsAreNearDuplicates(first, second)).toBe(true);
    expect(dedupeProjectBoardQuestions([first, second])).toEqual([first]);
  });

  it("dedupes rendering-substrate questions with small wording differences", () => {
    const first =
      "The plan locks 'Canvas 2D' but the project charter specifies 'Three.js/WebGL.' Which rendering substrate should the game use? This determines the entire renderer architecture, asset pipeline, and downstream card dependencies.";
    const second =
      "The implementation plan locks 'Canvas 2D' as the rendering substrate, but the project charter specifies a 'Three.js/WebGL spaceship game.' Which substrate should the game use? This is a foundational architecture decision that blocks the rendering card and all downstream visual cards.";

    expect(projectBoardQuestionsAreNearDuplicates(first, second)).toBe(true);
    expect(dedupeProjectBoardQuestions([first, second])).toEqual([first]);
  });

  it("keeps distinct implementation decisions separate", () => {
    expect(projectBoardQuestionsAreNearDuplicates("Which renderer should ship?", "Which input model should ship?")).toBe(false);
    expect(projectBoardQuestionDedupeKey("Which renderer should ship?")).not.toBe(projectBoardQuestionDedupeKey("Which input model should ship?"));
  });
});
