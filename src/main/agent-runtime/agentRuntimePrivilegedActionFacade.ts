export {
  buildPrivilegedActionNativeRequest,
  createPrivilegedActionAdapter,
  dryRunPrivilegedActionNativeRequest,
  MacosAuthorizedHelperUnavailableAdapter,
  planPrivilegedAction,
  privilegedActionAdapterSelectionFromEnv,
  privilegedActionAdapterStatus,
  privilegedActionAdapterStatusText,
  privilegedActionResultFromNativeResult,
  privilegedActionResultText,
  successfulPrivilegedActionNativeRequest,
  withPrivilegedActionLogPath,
  writePrivilegedActionRedactedLog,
} from "../privileged-action/privilegedActionAgentRuntimeContract";
export type {
  PrivilegedActionAdapter,
  PrivilegedActionAdapterExecuteInput,
} from "../privileged-action/privilegedActionAgentRuntimeContract";
