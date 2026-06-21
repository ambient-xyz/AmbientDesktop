import { useRef, useState } from "react";

import type { RuntimeActivity, RunStatus } from "../../shared/threadTypes";
import type {
  RunActivityLine,
  RunRetryStats,
  RuntimeActivityRenderState,
} from "./AppRunActivity";

export function useAppRunActivityState() {
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [threadRunStatuses, setThreadRunStatuses] = useState<Record<string, RunStatus>>({});
  const [activity, setActivity] = useState<RuntimeActivity | undefined>();
  const [abortArmed, setAbortArmed] = useState(false);
  const [retryStatsByThread, setRetryStatsByThread] = useState<Record<string, RunRetryStats>>({});
  const [runActivityLinesByThread, setRunActivityLinesByThread] =
    useState<Record<string, RunActivityLine[]>>({});
  const runActivityCounterRef = useRef(0);
  const runActivityLastEventAtRef = useRef(0);
  const runActivityHeartbeatIndexRef = useRef(0);
  const runActivityLinesByThreadRef = useRef<Record<string, RunActivityLine[]>>({});
  const runtimeActivityRenderStateRef = useRef<Record<string, RuntimeActivityRenderState>>({});
  const thinkingDeltaBuffersRef = useRef<Record<string, string>>({});
  const previousRunningRef = useRef(false);

  return {
    runStatus,
    setRunStatus,
    threadRunStatuses,
    setThreadRunStatuses,
    activity,
    setActivity,
    abortArmed,
    setAbortArmed,
    retryStatsByThread,
    setRetryStatsByThread,
    runActivityLinesByThread,
    setRunActivityLinesByThread,
    runActivityCounterRef,
    runActivityLastEventAtRef,
    runActivityHeartbeatIndexRef,
    runActivityLinesByThreadRef,
    runtimeActivityRenderStateRef,
    thinkingDeltaBuffersRef,
    previousRunningRef,
  };
}
