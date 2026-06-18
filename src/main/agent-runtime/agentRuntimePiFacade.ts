import {
  workspaceBoundedAgentContextFiles as workspaceBoundedAgentContextFilesFromPi,
} from "../pi/piContextFiles";
import {
  normalizePiEvent as normalizePiEventFromPi,
} from "../pi/piEventMapper";
import type {
  NormalizedPiEvent as NormalizedPiEventFromPi,
  ToolResultDetails as ToolResultDetailsFromPi,
} from "../pi/piEventMapper";
import {
  discoverPiExtensionHostTools as discoverPiExtensionHostToolsFromPi,
  runPiExtensionHostTool as runPiExtensionHostToolFromPi,
} from "../pi/piExtensionCompatibilityHost";
import type {
  PiExtensionHostRunResult as PiExtensionHostRunResultFromPi,
  PiExtensionHostTool as PiExtensionHostToolFromPi,
} from "../pi/piExtensionCompatibilityHost";
import {
  createAmbientEditOperations as createAmbientEditOperationsFromPi,
  createAmbientFindOperations as createAmbientFindOperationsFromPi,
  createAmbientGrepOperations as createAmbientGrepOperationsFromPi,
  createAmbientLsOperations as createAmbientLsOperationsFromPi,
  createAmbientReadOperations as createAmbientReadOperationsFromPi,
  createAmbientWriteOperations as createAmbientWriteOperationsFromPi,
} from "../pi/piReadOperations";
import type {
  AmbientFileAuthorityRequest as AmbientFileAuthorityRequestFromPi,
  AmbientFileAuthorityRequester as AmbientFileAuthorityRequesterFromPi,
} from "../pi/piReadOperations";
import {
  enableAtomicPiSessionPersistence as enableAtomicPiSessionPersistenceFromPi,
} from "../pi/piSessionAtomicPersistence";
import {
  createPiStreamWatchdog as createPiStreamWatchdogFromPi,
} from "../pi/piStreamWatchdog";
import type {
  PiStreamWatchdog as PiStreamWatchdogFromPi,
} from "../pi/piStreamWatchdog";
import type {
  SubagentChildRuntimeAdapter as SubagentChildRuntimeAdapterFromPi,
  SubagentChildRuntimeApprovalRequest as SubagentChildRuntimeApprovalRequestFromPi,
  SubagentChildRuntimeApprovalResponseInput as SubagentChildRuntimeApprovalResponseInputFromPi,
  SubagentChildRuntimeApprovalResponseResult as SubagentChildRuntimeApprovalResponseResultFromPi,
  SubagentChildRuntimeCancelInput as SubagentChildRuntimeCancelInputFromPi,
  SubagentChildRuntimeCancelResult as SubagentChildRuntimeCancelResultFromPi,
  SubagentChildRuntimeFollowupInput as SubagentChildRuntimeFollowupInputFromPi,
  SubagentChildRuntimeFollowupResult as SubagentChildRuntimeFollowupResultFromPi,
  SubagentChildRuntimeRetryInput as SubagentChildRuntimeRetryInputFromPi,
  SubagentChildRuntimeRetryResult as SubagentChildRuntimeRetryResultFromPi,
  SubagentChildRuntimeStartInput as SubagentChildRuntimeStartInputFromPi,
  SubagentChildRuntimeStartResult as SubagentChildRuntimeStartResultFromPi,
  SubagentChildRuntimeWaitInput as SubagentChildRuntimeWaitInputFromPi,
  SubagentChildRuntimeWaitResult as SubagentChildRuntimeWaitResultFromPi,
  SubagentRuntimeEventEmitter as SubagentRuntimeEventEmitterFromPi,
} from "../pi/piChildSessionAdapter";

export const createAmbientEditOperations = createAmbientEditOperationsFromPi;
export const createAmbientFindOperations = createAmbientFindOperationsFromPi;
export const createAmbientGrepOperations = createAmbientGrepOperationsFromPi;
export const createAmbientLsOperations = createAmbientLsOperationsFromPi;
export const createAmbientReadOperations = createAmbientReadOperationsFromPi;
export const createAmbientWriteOperations = createAmbientWriteOperationsFromPi;
export const createPiStreamWatchdog = createPiStreamWatchdogFromPi;
export const discoverPiExtensionHostTools = discoverPiExtensionHostToolsFromPi;
export const enableAtomicPiSessionPersistence =
  enableAtomicPiSessionPersistenceFromPi;
export const normalizePiEvent = normalizePiEventFromPi;
export const runPiExtensionHostTool = runPiExtensionHostToolFromPi;
export const workspaceBoundedAgentContextFiles = workspaceBoundedAgentContextFilesFromPi;

export type AmbientFileAuthorityRequest = AmbientFileAuthorityRequestFromPi;
export type AmbientFileAuthorityRequester = AmbientFileAuthorityRequesterFromPi;
export type NormalizedPiEvent = NormalizedPiEventFromPi;
export type PiExtensionHostRunResult = PiExtensionHostRunResultFromPi;
export type PiExtensionHostTool = PiExtensionHostToolFromPi;
export type PiStreamWatchdog = PiStreamWatchdogFromPi;
export type SubagentChildRuntimeAdapter = SubagentChildRuntimeAdapterFromPi;
export type SubagentChildRuntimeApprovalRequest =
  SubagentChildRuntimeApprovalRequestFromPi;
export type SubagentChildRuntimeApprovalResponseInput =
  SubagentChildRuntimeApprovalResponseInputFromPi;
export type SubagentChildRuntimeApprovalResponseResult =
  SubagentChildRuntimeApprovalResponseResultFromPi;
export type SubagentChildRuntimeCancelInput = SubagentChildRuntimeCancelInputFromPi;
export type SubagentChildRuntimeCancelResult =
  SubagentChildRuntimeCancelResultFromPi;
export type SubagentChildRuntimeFollowupInput =
  SubagentChildRuntimeFollowupInputFromPi;
export type SubagentChildRuntimeFollowupResult =
  SubagentChildRuntimeFollowupResultFromPi;
export type SubagentChildRuntimeRetryInput = SubagentChildRuntimeRetryInputFromPi;
export type SubagentChildRuntimeRetryResult = SubagentChildRuntimeRetryResultFromPi;
export type SubagentChildRuntimeStartInput = SubagentChildRuntimeStartInputFromPi;
export type SubagentChildRuntimeStartResult = SubagentChildRuntimeStartResultFromPi;
export type SubagentChildRuntimeWaitInput = SubagentChildRuntimeWaitInputFromPi;
export type SubagentChildRuntimeWaitResult = SubagentChildRuntimeWaitResultFromPi;
export type SubagentRuntimeEventEmitter = SubagentRuntimeEventEmitterFromPi;
export type ToolResultDetails = ToolResultDetailsFromPi;
