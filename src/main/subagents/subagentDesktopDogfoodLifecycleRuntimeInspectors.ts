import { evaluate, type CdpClient } from "./subagentDesktopDogfoodE2eSupport";

export async function inspectLifecycleEdgeVisibility(
  cdp: CdpClient,
  input: {
    parentText: string;
    parentMessageId: string;
    childRunIds: string[];
    childThreadIds: string[];
    waitBarrierIds: string[];
  },
) {
  return evaluate(
    cdp,
    async (expected) => {
      const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
      const parentTextElement = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.innerText?.includes(expected.parentText) && !element.querySelector(".subagent-parent-cluster"))
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.width * aRect.height - bRect.width * bRect.height;
        })[0];
      const cluster = parentTextElement
        ? clusterElements.find((candidate) =>
            Boolean(parentTextElement.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING),
          )
        : undefined;
      const summary = cluster?.querySelector<HTMLElement>("summary");
      const clusterDefaultCollapsedBeforeOpen = !(cluster?.hasAttribute("open") ?? false);
      summary?.scrollIntoView({ block: "center", inline: "nearest" });
      if (summary && !cluster?.hasAttribute("open")) summary.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const text = cluster?.innerText ?? "";
      const titleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const combinedText = `${text}\n${titleText}`;
      const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const barrierRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-barriers > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const timeoutRow = childRows.find((row) => row.text.includes("Timeout edge worker") || row.titleText.includes("Timeout edge worker"));
      const partialRow = childRows.find(
        (row) => row.text.includes("Partial recovery worker") || row.titleText.includes("Partial recovery worker"),
      );
      const retryRow = childRows.find((row) => row.text.includes("Retry edge worker") || row.titleText.includes("Retry edge worker"));
      const detachedRow = childRows.find(
        (row) => row.text.includes("Detached edge worker") || row.titleText.includes("Detached edge worker"),
      );
      const timeoutAttention = mailboxRows.find(
        (row) =>
          row.text.includes("Barrier attention") &&
          (row.text.includes("Timed Out") || row.titleText.includes("Timed Out") || row.text.includes("timed out")),
      );
      const partialDecision = mailboxRows.find((row) => row.text.includes("Barrier decision") && row.text.includes("Partial approved"));
      const retryDecision = mailboxRows.find((row) => row.text.includes("Barrier decision") && row.text.includes("Retry accepted"));
      const detachDecision = mailboxRows.find((row) => row.text.includes("Barrier decision") && row.text.includes("Child detached"));
      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            "summary",
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-barriers > div",
            ".subagent-parent-cluster-mailbox > div",
            ".subagent-parent-cluster-mailbox-action.is-button",
            ".subagent-parent-cluster-child-blocker-context",
          ].join(","),
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);
      const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      const messageScrollport = cluster?.closest<HTMLElement>(".messages");
      const conversation = cluster?.closest<HTMLElement>(".conversation");
      const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
      const messagesRect = messageScrollport?.getBoundingClientRect();
      const visibleBottom = Math.min(messagesRect?.bottom ?? window.innerHeight, composerRect?.top ?? window.innerHeight);
      const clusterRect = cluster?.getBoundingClientRect();
      const clusterFrameClearancePx = clusterRect ? visibleBottom - clusterRect.bottom : Number.NEGATIVE_INFINITY;
      let criticalOverlapCount = 0;
      const criticalOverlapPairs: string[] = [];
      for (let index = 0; index < criticalRects.length; index += 1) {
        for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
          const aElement = criticalElements[index];
          const bElement = criticalElements[compare];
          if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) {
            criticalOverlapCount += 1;
            criticalOverlapPairs.push([aElement.className || aElement.tagName, bElement.className || bElement.tagName].join(" overlaps "));
          }
        }
      }

      return {
        parentMessageVisible: document.body.innerText.includes(expected.parentText),
        parentMessageIdCaptured: Boolean(expected.parentMessageId),
        clusterVisible: Boolean(cluster),
        clusterDefaultCollapsedBeforeOpen,
        summaryVisible: Boolean(summary?.innerText.includes("Sub-agent threads") && summary.innerText.includes("4 children")),
        timeoutChildVisible: Boolean(timeoutRow?.text.includes("Timed Out") || timeoutRow?.titleText.includes("Timed Out")),
        partialChildVisible: Boolean(partialRow?.text.includes("Aborted Partial") || partialRow?.titleText.includes("Aborted Partial")),
        retryChildVisible: Boolean(
          retryRow &&
          (retryRow.text.includes("Blocking: child") ||
            retryRow.text.includes("Blocking: needs steering") ||
            retryRow.titleText.includes("Required all")) &&
          ["Running", "Needs attention", "Stopped", "Failed"].some(
            (status) => retryRow.text.includes(status) || retryRow.titleText.includes(status),
          ),
        ),
        detachedChildVisible: Boolean(detachedRow?.text.includes("Detached") || detachedRow?.titleText.includes("Detached")),
        timeoutAttentionVisible: Boolean(timeoutAttention),
        timeoutChoicesVisible: ["Continue with partial", "Retry child", "Detach child", "Cancel parent run"].every((choice) =>
          combinedText.includes(choice),
        ),
        partialDecisionVisible: Boolean(partialDecision),
        partialSummaryVisible:
          combinedText.includes("Use the partial recovery summary") && combinedText.includes("User approved a partial parent continuation"),
        retryDecisionVisible: Boolean(retryDecision) && combinedText.includes("Retry this failed child before parent synthesis"),
        retryEffectVisible:
          barrierRows.some((row) => row.text.includes("Retry requested") && row.text.includes("Retry requested 1 child")) ||
          combinedText.includes("Retry requested 1 child"),
        retryAcceptedEffectVisible:
          barrierRows.some((row) => row.text.includes("Retry accepted") && row.text.includes("Retry accepted 1 child")) ||
          combinedText.includes("Retry accepted 1 child"),
        retryMailboxVisible:
          barrierRows.some((row) => row.text.includes("1 retry mailbox event queued")) ||
          combinedText.includes("1 retry mailbox event queued"),
        detachDecisionVisible: Boolean(detachDecision),
        detachedEffectVisible:
          barrierRows.some((row) => row.text.includes("Child detached") && row.text.includes("Detached 1 child")) ||
          combinedText.includes("Detached 1 child"),
        edgeIdentityCaptured:
          expected.childRunIds.length === 4 &&
          expected.childThreadIds.length === 4 &&
          expected.waitBarrierIds.length === 4 &&
          expected.childRunIds.every((id) => combinedText.includes(id)) &&
          expected.childThreadIds.every((id) => typeof id === "string" && id.length > 0) &&
          expected.waitBarrierIds.every((id) => typeof id === "string" && id.length > 0),
        clusterFrameClearsComposer: clusterFrameClearancePx >= 8,
        clusterFrameClearancePx,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        criticalOverlapPairs,
        summaryText: summary?.innerText ?? "",
        childRows,
        mailboxRows,
        barrierRows,
      };
    },
    input,
  );
}

export async function inspectParentStopCascadeVisibility(
  cdp: CdpClient,
  input: {
    parentText: string;
    parentMessageId: string;
    parentMailboxEventId: string;
    childRunIds: string[];
    childThreadIds: string[];
    waitBarrierIds: string[];
    cancelledRunIds: string[];
    detachedRunIds: string[];
    unchangedRunIds: string[];
    cancelledWaitBarrierIds: string[];
    cancelledMailboxEventIds: string[];
  },
) {
  return evaluate(
    cdp,
    async (expected) => {
      const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
      const parentTextElement = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.innerText?.includes(expected.parentText) && !element.querySelector(".subagent-parent-cluster"))
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.width * aRect.height - bRect.width * bRect.height;
        })[0];
      const cluster = parentTextElement
        ? clusterElements.find((candidate) =>
            Boolean(parentTextElement.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING),
          )
        : undefined;
      const summary = cluster?.querySelector<HTMLElement>("summary");
      const clusterDefaultCollapsedBeforeOpen = !(cluster?.hasAttribute("open") ?? false);
      summary?.scrollIntoView({ block: "center", inline: "nearest" });
      if (summary && !cluster?.hasAttribute("open")) summary.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const text = cluster?.innerText ?? "";
      const titleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const combinedText = `${text}\n${titleText}`;
      const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const requiredRow = childRows.find(
        (row) => row.text.includes("Parent-stop required worker") || row.titleText.includes("Parent-stop required worker"),
      );
      const backgroundRow = childRows.find(
        (row) => row.text.includes("Parent-stop background worker") || row.titleText.includes("Parent-stop background worker"),
      );
      const completedRow = childRows.find(
        (row) => row.text.includes("Parent-stop completed worker") || row.titleText.includes("Parent-stop completed worker"),
      );
      const parentStoppedMailbox = mailboxRows.find(
        (row) =>
          row.text.includes("Parent stopped") &&
          row.text.includes("1 cancelled") &&
          row.text.includes("1 detached") &&
          row.text.includes("1 unchanged") &&
          row.text.includes("1 wait barrier cancelled"),
      );

      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            "summary",
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-mailbox > div",
            ".subagent-parent-cluster-lifecycle-effect",
          ].join(","),
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);
      const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      const messageScrollport = cluster?.closest<HTMLElement>(".messages");
      const conversation = cluster?.closest<HTMLElement>(".conversation");
      const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
      const messagesRect = messageScrollport?.getBoundingClientRect();
      const visibleBottom = Math.min(messagesRect?.bottom ?? window.innerHeight, composerRect?.top ?? window.innerHeight);
      const clusterRect = cluster?.getBoundingClientRect();
      const clusterFrameClearancePx = clusterRect ? visibleBottom - clusterRect.bottom : Number.NEGATIVE_INFINITY;
      let criticalOverlapCount = 0;
      const criticalOverlapPairs: string[] = [];
      for (let index = 0; index < criticalRects.length; index += 1) {
        for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
          const aElement = criticalElements[index];
          const bElement = criticalElements[compare];
          if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) {
            criticalOverlapCount += 1;
            criticalOverlapPairs.push([aElement.className || aElement.tagName, bElement.className || bElement.tagName].join(" overlaps "));
          }
        }
      }

      return {
        parentMessageVisible: document.body.innerText.includes(expected.parentText),
        parentMessageIdCaptured: Boolean(expected.parentMessageId),
        parentMailboxEventIdCaptured: Boolean(expected.parentMailboxEventId),
        clusterVisible: Boolean(cluster),
        clusterDefaultCollapsedBeforeOpen,
        summaryVisible: Boolean(summary?.innerText.includes("Sub-agent threads") && summary.innerText.includes("3 children")),
        requiredChildCancelledVisible: Boolean(requiredRow?.text.includes("Cancelled") || requiredRow?.titleText.includes("Cancelled")),
        optionalChildDetachedVisible: Boolean(backgroundRow?.text.includes("Detached") || backgroundRow?.titleText.includes("Detached")),
        completedChildUnchangedVisible:
          Boolean(completedRow?.text.includes("Completed") || completedRow?.titleText.includes("Completed")) &&
          combinedText.includes("Unchanged 1 child"),
        parentStoppedMailboxVisible: Boolean(parentStoppedMailbox),
        parentCancellationRequestedVisible: combinedText.includes("Parent cancellation requested"),
        cancelledWaitBarrierVisible: combinedText.includes("1 wait barrier cancelled"),
        cancelledMailboxEventsVisible: combinedText.includes("2 pending mailbox events cancelled"),
        cascadeReasonVisible: combinedText.includes("User stopped the parent turn while child work was still active."),
        cascadeIdentityCaptured:
          expected.childRunIds.length === 3 &&
          expected.childThreadIds.length === 3 &&
          expected.waitBarrierIds.length === 1 &&
          expected.cancelledRunIds.length === 1 &&
          expected.detachedRunIds.length === 1 &&
          expected.unchangedRunIds.length === 1 &&
          expected.cancelledWaitBarrierIds.length === 1 &&
          expected.cancelledMailboxEventIds.length === 2 &&
          [...expected.cancelledRunIds, ...expected.detachedRunIds, ...expected.unchangedRunIds].every((id) => combinedText.includes(id)) &&
          expected.cancelledWaitBarrierIds.every((id) => combinedText.includes(id)) &&
          expected.cancelledMailboxEventIds.every((id) => combinedText.includes(id)),
        clusterFrameClearsComposer: clusterFrameClearancePx >= 8,
        clusterFrameClearancePx,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        criticalOverlapPairs,
        summaryText: summary?.innerText ?? "",
        childRows,
        mailboxRows,
      };
    },
    input,
  );
}

export async function inspectLocalRuntimeOwnership(
  cdp: CdpClient,
  input: {
    leaseId: string;
    runtimeId: string;
    pid: number;
    endpoint: string;
    childRunId: string;
    childThreadId: string;
    untrackedRuntime: {
      id: string;
      pid: number;
      endpoint: string;
      model: string;
    };
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const settingsPanel = document.querySelector<HTMLElement>(".right-panel.settings-panel-host");
      const isVisibleInViewport = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight
        );
      };
      const text = settingsPanel?.innerText ?? "";
      const localModelsButton = [...document.querySelectorAll<HTMLButtonElement>(".settings-nav button")].find((button) =>
        button.innerText.includes("Local Models"),
      );
      const runtimeCardElements = settingsPanel
        ? [...settingsPanel.querySelectorAll<HTMLElement>(".model-runtime-catalog-profile")].filter((card) => card.offsetParent !== null)
        : [];
      const runtimeCardElement = runtimeCardElements.find(
        (card) =>
          card.innerText.includes("In use by sub-agent Review worker") ||
          [...card.querySelectorAll<HTMLElement>("[title]")].some((element) =>
            (element.getAttribute("title") ?? "").includes("In use by sub-agent Review worker"),
          ),
      );
      runtimeCardElement?.scrollIntoView({ block: "start", inline: "nearest" });
      const summarizeRuntimeCard = (card: HTMLElement) => ({
        text: card.innerText,
        titleText: [...card.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        buttonSummaries: [...card.querySelectorAll<HTMLButtonElement>("button")].map((button) => ({
          text: button.innerText,
          disabled: button.disabled,
          title: button.getAttribute("title") ?? "",
        })),
        rect: (() => {
          const rect = card.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        })(),
      });
      const allRuntimeCards = runtimeCardElements.map(summarizeRuntimeCard);
      const runtimeCards = runtimeCardElements
        .filter((card) => isVisibleInViewport(card) || card === runtimeCardElement)
        .map(summarizeRuntimeCard);
      const runtimeCard = allRuntimeCards.find(
        (card) => card.text.includes("In use by sub-agent Review worker") || card.titleText.includes("In use by sub-agent Review worker"),
      );
      const untrackedRuntimeCard = allRuntimeCards.find(
        (card) =>
          card.text.includes(expected.untrackedRuntime.id) ||
          card.titleText.includes(expected.untrackedRuntime.id) ||
          card.text.includes(expected.untrackedRuntime.model) ||
          card.titleText.includes(expected.untrackedRuntime.model),
      );
      const runtimeText = `${runtimeCard?.text ?? ""}\n${runtimeCard?.titleText ?? ""}`;
      const untrackedRuntimeText = `${untrackedRuntimeCard?.text ?? ""}\n${untrackedRuntimeCard?.titleText ?? ""}`;
      const stopButton = runtimeCard?.buttonSummaries.find((button) => button.text.includes("Stop"));
      const restartButton = runtimeCard?.buttonSummaries.find((button) => button.text.includes("Restart"));
      const untrackedStopButton = untrackedRuntimeCard?.buttonSummaries.find((button) => button.text.includes("Stop"));
      const untrackedRestartButton = untrackedRuntimeCard?.buttonSummaries.find((button) => button.text.includes("Restart"));
      const criticalElements = runtimeCardElement
        ? [...runtimeCardElement.querySelectorAll<HTMLElement>("button, small, .subagent-thread-badges > *")].filter(
            (element) => element.offsetParent !== null && isVisibleInViewport(element),
          )
        : [];
      const criticalRects = criticalElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
      let criticalOverlapCount = 0;
      for (let index = 0; index < criticalRects.length; index += 1) {
        for (let compare = index + 1; compare < criticalRects.length; compare += 1) {
          const aElement = criticalElements[index];
          const bElement = criticalElements[compare];
          if (aElement.contains(bElement) || bElement.contains(aElement)) continue;
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
        }
      }
      const untrackedCards = allRuntimeCards.filter((card) => card.text.includes("Untracked") || card.titleText.includes("untracked"));
      return {
        settingsPanelVisible: Boolean(settingsPanel),
        localModelsSectionVisible: Boolean(localModelsButton?.classList.contains("active") || text.includes("Local Models")),
        runtimeInventoryVisible: text.includes("Runtime inventory"),
        activeLeaseVisible: text.includes("1 active lease"),
        ownerLabelVisible: runtimeText.includes("In use by sub-agent Review worker"),
        managedRunningVisible: runtimeText.includes("Running") && runtimeText.includes("Managed"),
        localTextCapabilityVisible: runtimeText.includes("Local text") || runtimeText.includes("local/text-4b"),
        stopDisabledVisible: Boolean(stopButton?.disabled && stopButton.title.includes("In use by sub-agent Review worker")),
        restartDisabledVisible: Boolean(restartButton?.disabled && restartButton.title.includes("In use by sub-agent Review worker")),
        forceConsequenceVisible:
          runtimeText.includes("Forced Stop/Restart") && runtimeText.includes("cancel") && runtimeText.includes("affected sub-agent"),
        blockerLeaseVisible: runtimeText.includes(expected.leaseId) && runtimeText.includes("Blockers"),
        affectedSubagentVisible: runtimeText.includes("Affected sub-agents") && runtimeText.includes("Review worker"),
        childRunIdVisible: runtimeText.includes(expected.childRunId),
        childThreadIdVisible: runtimeText.includes(expected.childThreadId),
        runtimeIdVisible: runtimeText.includes(expected.runtimeId),
        pidVisible: runtimeText.includes(`pid ${expected.pid}`),
        endpointVisible: runtimeText.includes(expected.endpoint),
        ordinaryStopReasonVisible: runtimeText.includes("In use by sub-agent Review worker."),
        untrackedRuntimeVisible: Boolean(untrackedRuntimeCard),
        untrackedRuntimeIdVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.id),
        untrackedRuntimePidVisible: untrackedRuntimeText.includes(`pid ${expected.untrackedRuntime.pid}`),
        untrackedRuntimeEndpointVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.endpoint),
        untrackedRuntimeModelVisible: untrackedRuntimeText.includes(expected.untrackedRuntime.model),
        untrackedStopDisabledVisible: Boolean(
          untrackedStopButton?.disabled &&
          untrackedStopButton.title.includes("untracked") &&
          untrackedStopButton.title.includes("safe to stop"),
        ),
        untrackedRestartDisabledVisible: Boolean(
          untrackedRestartButton?.disabled &&
          untrackedRestartButton.title.includes("untracked") &&
          untrackedRestartButton.title.includes("safe to restart"),
        ),
        untrackedForceUnavailableVisible:
          untrackedRuntimeText.includes("Force termination unavailable") && untrackedRuntimeText.includes("untracked processes"),
        untrackedExternalStopGuidanceVisible:
          untrackedRuntimeText.includes("ask the owner to stop it outside Ambient") ||
          untrackedRuntimeText.includes("this local runtime is untracked"),
        untrackedGroupSafeVisible:
          untrackedCards.length > 0 &&
          untrackedCards.every((card) => {
            const cardText = `${card.text}\n${card.titleText}`;
            return (
              cardText.includes("Untracked") &&
              cardText.includes("Force termination unavailable") &&
              card.buttonSummaries
                .filter((button) => button.text.includes("Stop") || button.text.includes("Restart"))
                .every((button) => button.disabled)
            );
          }),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        runtimeCardText: runtimeCard?.text ?? "",
        runtimeCardTitles: runtimeCard?.titleText ?? "",
        untrackedRuntimeCardText: untrackedRuntimeCard?.text ?? "",
        untrackedRuntimeCardTitles: untrackedRuntimeCard?.titleText ?? "",
        runtimeCards,
      };
    },
    input,
  );
}
