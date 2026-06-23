import { useEffect, useRef, useState } from "react";

import type { RuntimeActivity, RunStatus } from "../../shared/threadTypes";
import type {
  RunActivityLine,
  RunRetryStats,
  RuntimeActivityRenderState,
} from "./AppRunActivity";
import {
  nextRuntimeStatusIndicatorExpiry,
  pruneExpiredRuntimeStatusIndicators,
  type RuntimeStatusIndicatorsByThread,
} from "./runtimeStatusIndicatorUiModel";

export function useAppRunActivityState() {
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [threadRunStatuses, setThreadRunStatuses] = useState<Record<string, RunStatus>>({});
  const [activity, setActivity] = useState<RuntimeActivity | undefined>();
  const [abortArmed, setAbortArmed] = useState(false);
  const [retryStatsByThread, setRetryStatsByThread] = useState<Record<string, RunRetryStats>>({});
  const [runActivityLinesByThread, setRunActivityLinesByThread] =
    useState<Record<string, RunActivityLine[]>>({});
  const [runtimeStatusIndicatorsByThread, setRuntimeStatusIndicatorsByThread] =
    useState<RuntimeStatusIndicatorsByThread>({});
  const runActivityCounterRef = useRef(0);
  const runActivityLastEventAtRef = useRef(0);
  const runActivityHeartbeatIndexRef = useRef(0);
  const runActivityLinesByThreadRef = useRef<Record<string, RunActivityLine[]>>({});
  const runtimeActivityRenderStateRef = useRef<Record<string, RuntimeActivityRenderState>>({});
  const thinkingDeltaBuffersRef = useRef<Record<string, string>>({});
  const previousRunningRef = useRef(false);

  useEffect(() => {
    const now = Date.now();
    const nextExpiry = nextRuntimeStatusIndicatorExpiry(runtimeStatusIndicatorsByThread, now);
    if (nextExpiry === undefined) return undefined;
    const timeout = window.setTimeout(() => {
      setRuntimeStatusIndicatorsByThread((current) => pruneExpiredRuntimeStatusIndicators(current, Date.now()));
    }, Math.max(0, nextExpiry - now));
    return () => window.clearTimeout(timeout);
  }, [runtimeStatusIndicatorsByThread]);

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
    runtimeStatusIndicatorsByThread,
    setRuntimeStatusIndicatorsByThread,
    runActivityCounterRef,
    runActivityLastEventAtRef,
    runActivityHeartbeatIndexRef,
    runActivityLinesByThreadRef,
    runtimeActivityRenderStateRef,
    thinkingDeltaBuffersRef,
    previousRunningRef,
  };
}
