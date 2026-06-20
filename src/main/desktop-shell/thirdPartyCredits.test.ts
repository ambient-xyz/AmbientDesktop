import { describe, expect, it } from "vitest";
import {
  LAMBDA_RLM_SOURCE_COMMIT,
  LAMBDA_RLM_SOURCE_PAPER,
  LAMBDA_RLM_SOURCE_REPOSITORY,
} from "../tool-runtime/lambdaRlm";
import { thirdPartyCreditAboutText, thirdPartyCredits } from "./thirdPartyCredits";

const lambdaRlmSource = {
  commit: LAMBDA_RLM_SOURCE_COMMIT,
  paper: LAMBDA_RLM_SOURCE_PAPER,
  repository: LAMBDA_RLM_SOURCE_REPOSITORY,
};

describe("third-party credits", () => {
  it("lists the app About-panel third-party credits in stable order", () => {
    const credits = thirdPartyCredits(lambdaRlmSource);

    expect(credits.map((credit) => credit.name)).toEqual([
      "Pi Agent",
      "Lambda-RLM",
      "TencentDB Agent Memory",
      "ToolHive",
    ]);
    expect(credits.map((credit) => credit.license)).toEqual(["MIT", "MIT", "MIT", "Apache-2.0"]);
  });

  it("includes the Lambda-RLM source metadata in the Lambda-RLM credit", () => {
    const lambdaRlmCredit = thirdPartyCredits(lambdaRlmSource).find((credit) => credit.name === "Lambda-RLM");

    expect(lambdaRlmCredit).toMatchObject({
      repository: LAMBDA_RLM_SOURCE_REPOSITORY,
      paper: LAMBDA_RLM_SOURCE_PAPER,
      licenseUrl: `${LAMBDA_RLM_SOURCE_REPOSITORY}/blob/main/LICENSE`,
    });
    expect(lambdaRlmCredit?.notice).toContain(LAMBDA_RLM_SOURCE_COMMIT);
  });

  it("formats optional credit fields for the Electron About panel", () => {
    const piCredit = thirdPartyCredits(lambdaRlmSource)[0]!;
    const aboutText = thirdPartyCreditAboutText(piCredit);

    expect(aboutText).toContain("Pi Agent");
    expect(aboutText).toContain("Authors: Mario Zechner and Pi contributors");
    expect(aboutText).toContain("Repository: https://github.com/earendil-works/pi");
    expect(aboutText).toContain("License URL: https://github.com/earendil-works/pi/blob/main/LICENSE");
    expect(aboutText).toContain("MIT License");
    expect(aboutText).not.toContain("undefined");
  });

  it("formats Apache-2.0 license text for ToolHive", () => {
    const toolHiveCredit = thirdPartyCredits(lambdaRlmSource).find((credit) => credit.name === "ToolHive");
    const aboutText = thirdPartyCreditAboutText(toolHiveCredit!);

    expect(aboutText).toContain("ToolHive");
    expect(aboutText).toContain("License: Apache-2.0");
    expect(aboutText).toContain("Apache License");
    expect(aboutText).toContain("https://www.apache.org/licenses/");
  });
});
