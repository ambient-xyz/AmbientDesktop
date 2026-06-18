import {
  projectBoardPlanningDepthFromScopeContract,
  projectBoardScopeContractFromTexts,
} from "../../shared/projectBoardScopeContract";
import type { ProjectBoardScopeFeature } from "../../shared/projectBoardTypes";
import { projectBoardSourceIncludedInSynthesis } from "./projectBoardSourceIdentity";
import { projectBoardShouldUseSectionedPlanning } from "./projectBoardSectionedPlanning";
import {
  projectBoardScopeContractTexts,
  type ProjectBoardSynthesisRefinementContext,
  type ProjectBoardSynthesisSource,
} from "./projectBoardSynthesis";

const HEAVY_INCLUDED_FEATURES = new Set<ProjectBoardScopeFeature>([
  "auth",
  "accounts",
  "analytics",
  "sync",
  "collaboration",
  "backend",
  "payments",
  "deployment",
  "admin_reporting",
]);

export function projectBoardShouldUseSectionedPlanningForWorkflow(
  sources: ProjectBoardSynthesisSource[],
  refinement?: ProjectBoardSynthesisRefinementContext,
): boolean {
  const scopeContract = projectBoardScopeContractFromTexts(projectBoardScopeContractTexts({ sources, refinement }));
  const planningDepth = projectBoardPlanningDepthFromScopeContract(scopeContract);
  const includedSources = sources.filter(projectBoardSourceIncludedInSynthesis);
  const heavyIncluded = scopeContract.included.some((feature) => HEAVY_INCLUDED_FEATURES.has(feature));
  const hasCompactShallowScope =
    planningDepth.level === "shallow" &&
    !heavyIncluded &&
    includedSources.length <= 2 &&
    scopeContract.planningDepthHints.some((hint) =>
      /\b(small|simple|single[-\s]?file|single[-\s]?page|local|client[-\s]?side|static|utility|compact|lightweight)\b/i.test(hint),
    );
  return hasCompactShallowScope ? false : projectBoardShouldUseSectionedPlanning(sources);
}
