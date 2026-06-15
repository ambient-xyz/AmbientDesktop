import { describe, expect, it } from "vitest";
import {
  mergeProjectBoardScopeContracts,
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
} from "./projectBoardScopeContract";

describe("projectBoardScopeContractFromTexts", () => {
  it("treats a one-line inline exclusion as a single clause, not a section start", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["- Not included: payments", "- Add user login with auth", "- Add cloud sync"].join("\n"),
    ]);

    expect(contract.excluded).toEqual(["payments"]);
    // Word-based inclusion is deliberately disabled: only the LLM contract includes.
    expect(contract.included).toEqual([]);
  });

  it("collects bullets under a bare exclusion heading as exclusions", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["## Non-goals", "- payments and billing", "- analytics dashboards", "", "## Implementation plan", "- Add user login with auth"].join("\n"),
    ]);

    expect(contract.excluded).toEqual(expect.arrayContaining(["payments", "analytics"]));
    expect(contract.excluded).not.toContain("auth");
    expect(contract.included).toEqual([]);
  });

  it("ends an exclusion section at the next heading even when it is not in the boundary allowlist", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["## Out of scope", "- backend services", "", "## Core features", "- Add real-time sync between devices"].join("\n"),
    ]);

    expect(contract.excluded).toContain("backend");
    expect(contract.excluded).not.toContain("sync");
    expect(contract.included).toEqual([]);
  });

  it("keeps an exclusion heading with inline content as both a section and a clause", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["## Not included: payments", "- admin reporting", "", "## Features", "- Build the notifications system"].join("\n"),
    ]);

    expect(contract.excluded).toEqual(expect.arrayContaining(["payments", "admin_reporting"]));
    expect(contract.excluded).not.toContain("notifications");
    expect(contract.included).toEqual([]);
  });

  it("handles plain-text exclusion sections terminated by allowlisted labels", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["Not included:", "payments", "analytics", "Implementation plan", "Add user accounts"].join("\n"),
    ]);

    expect(contract.excluded).toEqual(expect.arrayContaining(["payments", "analytics"]));
    expect(contract.included).toEqual([]);
  });

  it("still detects sentence-level exclusions outside sections", () => {
    const contract = projectBoardScopeContractFromTexts([
      "Build a simple notes app. Do not add a backend; keep auth out of scope.",
    ]);

    expect(contract.excluded).toEqual(expect.arrayContaining(["backend", "auth"]));
    expect(contract.included).toEqual([]);
  });

  it("marks small local scopes as shallow planning depth", () => {
    const contract = projectBoardScopeContractFromTexts([
      "A simple single-page app with vanilla JavaScript, no backend, browser-only.",
    ]);

    expect(contract.planningDepth?.level).toBe("shallow");
    const depth = projectBoardPlanningDepthFromScopeContract(contract);
    expect(depth.level).toBe("shallow");
  });
});

describe("mergeProjectBoardScopeContracts", () => {
  it("excludes features the LLM included when the deterministic contract excludes them", () => {
    const deterministic = projectBoardScopeContractFromTexts(["No payments. Keep analytics out of scope."]);
    const llm = {
      included: ["payments", "auth"] as const,
      excluded: [] as const,
      planningDepthHints: [],
      openQuestions: [],
      evidence: [],
    };

    const merged = mergeProjectBoardScopeContracts(deterministic, {
      ...llm,
      included: [...llm.included],
      excluded: [...llm.excluded],
    });

    expect(merged.excluded).toEqual(expect.arrayContaining(["payments", "analytics"]));
    expect(merged.included).toEqual(["auth"]);
  });
});

describe("backend feature detection", () => {
  it("does not treat build-tool dev servers as an included backend", () => {
    const contract = projectBoardScopeContractFromTexts([
      ["A bare-minimum client-side app built with React + Vite.", "| vite | dev | Build tool and dev server |"].join("\n"),
    ]);
    expect(contract.included).not.toContain("backend");
  });

  it("never includes features from wording alone; inclusion is the LLM's job", () => {
    const contract = projectBoardScopeContractFromTexts(["Build a REST API server with a database for user accounts."]);
    expect(contract.included).toEqual([]);
  });
});
