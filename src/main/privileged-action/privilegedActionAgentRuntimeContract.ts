export {
  buildPrivilegedActionNativeRequest,
  dryRunPrivilegedActionNativeRequest,
  planPrivilegedAction,
  privilegedActionAdapterStatus,
  privilegedActionAdapterStatusText,
  privilegedActionResultFromNativeResult,
  privilegedActionResultText,
  successfulPrivilegedActionNativeRequest,
  withPrivilegedActionLogPath,
} from "./privilegedAction";

export {
  createPrivilegedActionAdapter,
  MacosAuthorizedHelperUnavailableAdapter,
  privilegedActionAdapterSelectionFromEnv,
} from "./privilegedActionAdapter";
export type {
  PrivilegedActionAdapter,
  PrivilegedActionAdapterExecuteInput,
} from "./privilegedActionAdapter";

export { writePrivilegedActionRedactedLog } from "./privilegedActionLogs";
