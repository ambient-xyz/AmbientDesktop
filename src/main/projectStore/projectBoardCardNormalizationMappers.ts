import type { ProjectBoardCardTestPlan } from "../../shared/projectBoardTypes";

export function normalizeProjectBoardCardTestPlan(testPlan: ProjectBoardCardTestPlan): ProjectBoardCardTestPlan {
  return {
    unit: normalizeCardTextList(testPlan.unit),
    integration: normalizeCardTextList(testPlan.integration),
    visual: normalizeCardTextList(testPlan.visual),
    manual: normalizeCardTextList(testPlan.manual),
  };
}

export function normalizeUnknownProjectBoardTestPlan(testPlan: Record<string, unknown>): ProjectBoardCardTestPlan {
  return normalizeProjectBoardCardTestPlan({
    unit: Array.isArray(testPlan.unit) ? testPlan.unit.map((entry) => String(entry)) : [],
    integration: Array.isArray(testPlan.integration) ? testPlan.integration.map((entry) => String(entry)) : [],
    visual: Array.isArray(testPlan.visual) ? testPlan.visual.map((entry) => String(entry)) : [],
    manual: Array.isArray(testPlan.manual) ? testPlan.manual.map((entry) => String(entry)) : [],
  });
}

export function normalizeCardTextList(items: string[], limit = 20): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}
