import { describe, expect, it } from "vitest";

import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import {
  projectBoardWorkspaceBuildBoardTitle,
  projectBoardWorkspaceResetBlockReason,
  projectBoardWorkspaceResetTitle,
  type ProjectBoardWorkspaceBusyState,
} from "./ProjectBoardWorkspaceChrome";

const idleBusyState: ProjectBoardWorkspaceBusyState = {
  sourceBusy: false,
  sourceImpactBusy: false,
  kickoffDefaultsBusy: false,
  refineBusy: false,
  finalizeBusy: false,
  synthesisRetryBusy: false,
  synthesisDeferBusy: false,
  synthesisPauseBusy: false,
  revisionBusy: false,
  proposalApplyBusy: false,
};

describe("ProjectBoardWorkspaceChrome", () => {
  it("keeps build board titles stable", () => {
    expect(projectBoardWorkspaceBuildBoardTitle(false)).toBe(
      "Create a project board, start the charter workflow, scan project sources, and ask Ambient/Pi to propose draft cards.",
    );
    expect(projectBoardWorkspaceBuildBoardTitle(true)).toBe(
      "Project board creation is already running. Watch the progress feed for source scan and card generation activity.",
    );
  });

  it("keeps reset block reason precedence stable", () => {
    expect(projectBoardWorkspaceResetBlockReason({ ...idleBusyState })).toBeUndefined();
    expect(projectBoardWorkspaceResetBlockReason({ ...idleBusyState, sourceBusy: true, proposalApplyBusy: true })).toBe(
      "Wait for source refresh to finish before resetting the board.",
    );
    expect(projectBoardWorkspaceResetBlockReason({ ...idleBusyState, synthesisPauseBusy: true, revisionBusy: true })).toBe(
      "Wait for the planning pause request to finish before resetting.",
    );
  });

  it("keeps reset titles stable", () => {
    const board = { id: "board-1" } as ProjectBoardSummary;

    expect(projectBoardWorkspaceResetTitle({ board: undefined, resetBoardDisabled: false })).toBe("No project board exists yet.");
    expect(projectBoardWorkspaceResetTitle({ board, resetBoardDisabled: false })).toBe(
      "Reset this project board after confirmation. Project files, threads, and Local Task history are preserved.",
    );
    expect(
      projectBoardWorkspaceResetTitle({
        board,
        resetBoardDisabled: true,
        resetBoardBlockReason: "Wait for proposal apply to finish before resetting.",
      }),
    ).toBe("Wait for proposal apply to finish before resetting.");
  });
});
