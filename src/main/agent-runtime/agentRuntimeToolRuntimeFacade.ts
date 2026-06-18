import {
  completeAmbientText as completeAmbientTextFromToolRuntime,
  createLambdaRlmToolDefinition as createLambdaRlmToolDefinitionFromToolRuntime,
} from "../tool-runtime/lambdaRlm";
import {
  ToolArgumentProgressTracker as ToolArgumentProgressTrackerFromToolRuntime,
} from "../tool-runtime/toolArgumentProgress";
import {
  ToolHiveRuntimeService as ToolHiveRuntimeServiceFromToolRuntime,
} from "../tool-runtime/toolHiveRuntimeService";
import {
  buildToolLongformInputPreview as buildToolLongformInputPreviewFromToolRuntime,
} from "../tool-runtime/toolLongformInputPreview";
import {
  materializeTextOutput as materializeTextOutputFromToolRuntime,
  materializedTextNotice as materializedTextNoticeFromToolRuntime,
} from "../tool-runtime/toolOutputArtifacts";
import type {
  MaterializedTextOutput as MaterializedTextOutputFromToolRuntime,
} from "../tool-runtime/toolOutputArtifacts";
import {
  createToolRunnerBashOperations as createToolRunnerBashOperationsFromToolRuntime,
} from "../tool-runtime/toolRunner";
import type {
  ToolRunnerPolicy as ToolRunnerPolicyFromToolRuntime,
} from "../tool-runtime/toolRunner";

export const buildToolLongformInputPreview =
  buildToolLongformInputPreviewFromToolRuntime;
export const completeAmbientText = completeAmbientTextFromToolRuntime;
export const createLambdaRlmToolDefinition =
  createLambdaRlmToolDefinitionFromToolRuntime;
export const createToolRunnerBashOperations =
  createToolRunnerBashOperationsFromToolRuntime;
export const materializeTextOutput = materializeTextOutputFromToolRuntime;
export const materializedTextNotice = materializedTextNoticeFromToolRuntime;
export const ToolArgumentProgressTracker = ToolArgumentProgressTrackerFromToolRuntime;
export const ToolHiveRuntimeService = ToolHiveRuntimeServiceFromToolRuntime;

export type MaterializedTextOutput = MaterializedTextOutputFromToolRuntime;
export type ToolArgumentProgressTracker = InstanceType<
  typeof ToolArgumentProgressTrackerFromToolRuntime
>;
export type ToolHiveRuntimeService = InstanceType<
  typeof ToolHiveRuntimeServiceFromToolRuntime
>;
export type ToolRunnerPolicy = ToolRunnerPolicyFromToolRuntime;
