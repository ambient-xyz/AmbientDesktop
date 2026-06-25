import {
  SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT,
  SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
} from "./subagentDesktopDogfoodScenario";
import { evaluate, type CdpClient } from "./subagentDesktopDogfoodE2eSupport";

export async function inspectMultiClusterStress(
  cdp: CdpClient,
  input: {
    expectedClusterCount: number;
    stressParentTextPrefix: string;
    stressParentMessageIds: string[];
    stressChildRunIds: string[];
    stressChildThreadIds: string[];
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      document.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]").forEach((details) => {
        details.open = false;
      });
      const clusterElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")];
      const summaryElements = clusterElements
        .map((cluster) => cluster.querySelector<HTMLElement>("summary"))
        .filter((summary): summary is HTMLElement => Boolean(summary));
      const parentTextElements = expected.stressParentMessageIds.map((_, index) => {
        const needle = `${expected.stressParentTextPrefix} ${index + 1}`;
        return [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((element) => element.innerText?.includes(needle) && !element.querySelector(".subagent-parent-cluster"))
          .sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.width * aRect.height - bRect.width * bRect.height;
          })[0];
      });
      const parentTextRects = expected.stressParentMessageIds.map((_, index) =>
        textRangeRectFor(`${expected.stressParentTextPrefix} ${index + 1}`),
      );
      const stressClusters = parentTextRects.map((parentRect) => {
        if (!parentRect) return undefined;
        return clusterElements
          .map((cluster) => ({ cluster, rect: cluster.getBoundingClientRect() }))
          .filter(({ rect }) => rect.top >= parentRect.bottom - 2)
          .sort((a, b) => a.rect.top - parentRect.bottom - (b.rect.top - parentRect.bottom))[0]?.cluster;
      });
      const stressSummaries = stressClusters
        .map((cluster) => cluster?.querySelector<HTMLElement>("summary"))
        .filter((summary): summary is HTMLElement => Boolean(summary));
      const criticalRects = summaryElements
        .filter((summary) => summary.offsetParent !== null)
        .map((summary) => {
          const rect = summary.getBoundingClientRect();
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
          const a = criticalRects[index];
          const b = criticalRects[compare];
          const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const overlapArea = overlapX * overlapY;
          const smaller = Math.min(a.width * a.height, b.width * b.height);
          if (smaller > 0 && overlapArea / smaller > 0.15) criticalOverlapCount += 1;
        }
      }
      return {
        clusterCount: clusterElements.length,
        expectedClusterCountVisible: clusterElements.length === expected.expectedClusterCount,
        allClustersDefaultCollapsed: clusterElements.every((cluster) => !cluster.hasAttribute("open")),
        stressParentMessagesVisible: parentTextElements.every(Boolean),
        stressSummariesVisible:
          stressSummaries.length === expected.stressParentMessageIds.length &&
          stressSummaries.every((summary) => summary.innerText.includes("Sub-agent threads") && summary.innerText.includes("3 children")),
        stressChildIdsCaptured:
          expected.stressChildRunIds.length === 6 &&
          expected.stressChildThreadIds.length === 6 &&
          expected.stressChildRunIds.every((id) => typeof id === "string" && id.length > 0) &&
          expected.stressChildThreadIds.every((id) => typeof id === "string" && id.length > 0),
        stressClustersAfterParentMessages: stressClusters.every((cluster, index) => {
          const parentRect = parentTextRects[index] ?? parentTextElements[index]?.getBoundingClientRect();
          const clusterRect = cluster?.getBoundingClientRect();
          return Boolean(parentRect && clusterRect && clusterRect.top >= parentRect.bottom - 2);
        }),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        summaryTexts: summaryElements.map((summary) => summary.innerText),
      };

      function textRangeRectFor(needle: string): DOMRect | undefined {
        const candidates: DOMRect[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.textContent ?? "";
          const index = value.indexOf(needle);
          if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + needle.length);
            const rect = range.getBoundingClientRect();
            range.detach();
            if (rect.width > 0 && rect.height > 0) candidates.push(rect);
          }
          node = walker.nextNode();
        }
        return candidates.sort((a, b) => a.top - b.top || a.left - b.left)[0];
      }
    },
    input,
  );
}

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

export async function inspectWorkflowExecution(
  cdp: CdpClient,
  input: {
    taskId: string;
    artifactId: string;
    runId: string;
    threadId: string;
    mailboxEventId: string;
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const renderedOpenClusterContent = (element: HTMLElement) => {
        const cluster = element.closest<HTMLDetailsElement>("details.subagent-parent-cluster");
        return !cluster || cluster.open || element.tagName.toLowerCase() === "summary";
      };
      const elementTitleText = (element: HTMLElement) =>
        [...element.querySelectorAll<HTMLElement>("[title]")].map((item) => item.getAttribute("title") ?? "").join("\n");
      const workflowRowElements = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")].filter(
        (row) => row.offsetParent !== null && renderedOpenClusterContent(row),
      );
      const workflowRows = workflowRowElements.map((row) => ({
        text: row.innerText,
        titleText: elementTitleText(row),
        buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")].map((button) => ({
          ariaLabel: button.getAttribute("aria-label") ?? "",
          title: button.getAttribute("title") ?? "",
          hasIcon: Boolean(button.querySelector("svg")),
          disabled: button.disabled,
        })),
      }));
      const mailboxRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")]
        .filter((row) => row.offsetParent !== null && renderedOpenClusterContent(row))
        .map((row) => ({
          text: row.innerText,
          titleText: elementTitleText(row),
        }));
      const workflowRowElement = workflowRowElements.find(
        (row) => row.innerText.includes("Symphony Map-Reduce") || elementTitleText(row).includes("Symphony Map-Reduce"),
      );
      const workflowRow = workflowRows.find(
        (row) => row.text.includes("Symphony Map-Reduce") || row.titleText.includes("Symphony Map-Reduce"),
      );
      const inspectedCluster = workflowRowElement?.closest<HTMLElement>(".subagent-parent-cluster");
      const workflowText = `${workflowRow?.text ?? ""}\n${workflowRow?.titleText ?? ""}`;
      const mailboxRow = mailboxRows.find(
        (row) =>
          row.text.includes("Workflow blocked") ||
          row.titleText.includes("Workflow blocked") ||
          row.text.includes(expected.taskId) ||
          row.titleText.includes(expected.taskId),
      );
      const mailboxText = `${mailboxRow?.text ?? ""}\n${mailboxRow?.titleText ?? ""}`;
      const allText = `${text}\n${titledText}`;
      const criticalElements = inspectedCluster
        ? [
            ...inspectedCluster.querySelectorAll<HTMLElement>(
              [
                "summary",
                ".subagent-parent-cluster-workflows > div",
                ".subagent-parent-cluster-workflow-action",
                ".subagent-parent-cluster-mailbox > div",
              ].join(","),
            ),
          ].filter((element) => element.offsetParent !== null && renderedOpenClusterContent(element))
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
      const pauseControl = workflowRow?.buttonSummaries.find((button) => button.ariaLabel === "Pause workflow task Symphony Map-Reduce");
      const cancelControl = workflowRow?.buttonSummaries.find((button) => button.ariaLabel === "Cancel workflow task Symphony Map-Reduce");
      const openControl = workflowRow?.buttonSummaries.find(
        (button) => button.ariaLabel === "Open workflow thread for Symphony Map-Reduce",
      );
      return {
        workflowSectionVisible: workflowRows.length >= 2,
        taskVisible: Boolean(workflowRow),
        statusRunningVisible: workflowText.includes("Running"),
        modeBlockingVisible: workflowText.includes("Blocking"),
        sourceSymphonyVisible: workflowText.includes("Symphony recipe"),
        progressVisible: workflowText.includes("Reducer waiting on workflow evidence"),
        telemetryVisible:
          workflowText.includes("3 events") &&
          workflowText.includes("1 step done") &&
          workflowText.includes("1 model call") &&
          workflowText.includes("~96 tokens"),
        launchCardVisible:
          workflowText.includes("Risk: High") &&
          workflowText.includes("Up to 12 agents") &&
          workflowText.includes("Budget: 180,000 tokens") &&
          workflowText.includes("Confirmation required") &&
          workflowText.includes("Small slice recommended"),
        parentThreadProvenanceVisible: workflowText.includes("Caller: parent thread") && workflowText.includes("Approval: Launch Card"),
        parentBlockerVisible: workflowText.includes("Blocking: workflow work"),
        mailboxBlockVisible:
          mailboxText.includes("Workflow blocked") &&
          mailboxText.includes("1 blocking workflow") &&
          mailboxText.includes("1 waiting") &&
          mailboxText.includes("Symphony Map-Reduce"),
        taskIdVisible: allText.includes(expected.taskId),
        artifactIdVisible: allText.includes(expected.artifactId),
        runIdVisible: allText.includes(expected.runId),
        threadIdVisible: allText.includes(expected.threadId),
        mailboxEventIdVisible: expected.mailboxEventId.length > 0,
        pauseControlVisible: Boolean(
          pauseControl?.hasIcon && !pauseControl.disabled && pauseControl.title.includes("Pause blocking workflow task"),
        ),
        cancelControlVisible: Boolean(
          cancelControl?.hasIcon && !cancelControl.disabled && cancelControl.title.includes("Cancel blocking workflow task"),
        ),
        openWorkflowThreadVisible: Boolean(openControl?.hasIcon && !openControl.disabled && openControl.title.includes(expected.threadId)),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        workflowRows,
        mailboxRows,
      };
    },
    input,
  );
}

export async function inspectMutatingWorkerDogfood(
  cdp: CdpClient,
  input: {
    taskId: string;
    artifactId: string;
    runId: string;
    threadId: string;
    childRunId: string;
    childThreadId: string;
    stagedRelativePath: string;
    reportRelativePath: string;
    progressMessage: string;
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const workflowRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
          buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")].map((button) => ({
            ariaLabel: button.getAttribute("aria-label") ?? "",
            title: button.getAttribute("title") ?? "",
            disabled: button.disabled,
          })),
        }));
      const row = workflowRows.find(
        (candidate) =>
          candidate.text.includes("Symphony Self-Healing Loop") ||
          candidate.titleText.includes(expected.artifactId) ||
          candidate.titleText.includes(expected.taskId),
      );
      const rowText = `${row?.text ?? ""}\n${row?.titleText ?? ""}`;
      const allText = `${text}\n${titledText}`;
      const criticalElements = [
        ...document.querySelectorAll<HTMLElement>(
          [
            ".subagent-parent-cluster-workflows > div",
            ".subagent-parent-cluster-workflow-action",
            ".subagent-parent-cluster-workflow-mutation-evidence",
            ".subagent-parent-cluster-workflow-provenance",
          ].join(","),
        ),
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
      return {
        taskVisible: Boolean(row),
        statusSucceededVisible: rowText.includes("Succeeded"),
        modeBackgroundVisible: rowText.includes("Background"),
        sourceSymphonyVisible: rowText.includes("Symphony recipe"),
        childCallerVisible: rowText.includes("Caller: sub-agent child") || rowText.includes("sub-agent child"),
        childRunVisible: rowText.includes(expected.childRunId) || allText.includes(expected.childRunId),
        childThreadVisible: rowText.includes(expected.childThreadId) || allText.includes(expected.childThreadId),
        approvalBridgeVisible:
          rowText.includes("Approval: Child Bridge Policy") ||
          rowText.includes("Approval: child bridge policy") ||
          rowText.includes("approval child bridge policy"),
        isolatedWorktreeVisible:
          rowText.includes("Worktree: isolated") ||
          rowText.includes("Isolated worktree active") ||
          rowText.includes("worktree isolated active"),
        nestedFanoutVisible: rowText.includes("Nested fanout: Child Bridge Policy") || rowText.includes("Nested fanout granted"),
        mutatingWorkerLabelVisible: rowText.includes("Mutating child worker"),
        stagedMutationVisible:
          rowText.includes(`Staged mutation: ${expected.stagedRelativePath}`) || rowText.includes(expected.progressMessage),
        parentWorkspaceUnchangedVisible: rowText.includes("Parent workspace unchanged") || rowText.includes("parent workspace unchanged"),
        outputPreviewRetainedVisible: rowText.includes("Output preview retained") || rowText.includes("output preview retained"),
        reportRelativePathCaptured: expected.reportRelativePath.length > 0,
        taskIdVisible: allText.includes(expected.taskId),
        artifactIdVisible: allText.includes(expected.artifactId),
        runIdVisible: allText.includes(expected.runId),
        threadIdVisible: allText.includes(expected.threadId),
        noPauseControlVisible: !row?.buttonSummaries.some(
          (button) => button.ariaLabel === "Pause workflow task Symphony Self-Healing Loop",
        ),
        noCancelControlVisible: !row?.buttonSummaries.some(
          (button) => button.ariaLabel === "Cancel workflow task Symphony Self-Healing Loop",
        ),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        workflowRows,
      };
    },
    input,
  );
}

export async function inspectWorkflowHighLoad(
  cdp: CdpClient,
  input: {
    taskIds: string[];
    artifactIds: string[];
    runIds: string[];
    threadIds: string[];
    patternLabels: string[];
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const workflowRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div")]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
          buttonSummaries: [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-workflow-action")].map((button) => ({
            ariaLabel: button.getAttribute("aria-label") ?? "",
            title: button.getAttribute("title") ?? "",
            disabled: button.disabled,
          })),
        }));
      const allText = `${text}\n${titledText}`;
      const rowText = workflowRows.map((row) => `${row.text}\n${row.titleText}`).join("\n--- workflow row ---\n");
      const highLoadRows = workflowRows.filter(
        (row) =>
          expected.artifactIds.some((artifactId) => row.text.includes(artifactId) || row.titleText.includes(artifactId)) ||
          expected.taskIds.some((taskId) => row.text.includes(taskId) || row.titleText.includes(taskId)),
      );
      const criticalElements = [
        ...document.querySelectorAll<HTMLElement>(
          [
            ".subagent-parent-cluster-workflows > div",
            ".subagent-parent-cluster-workflow-action",
            ".subagent-parent-cluster-workflow-id",
            ".subagent-parent-cluster-workflow-launch-card",
            ".subagent-parent-cluster-workflow-provenance",
            ".subagent-parent-cluster-workflow-mutation-evidence",
          ].join(","),
        ),
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
      return {
        workflowSectionVisible: workflowRows.length >= 6,
        workflowRowCount: workflowRows.length,
        expectedWorkflowRowCountVisible: workflowRows.length >= 6,
        allPresetLabelsVisible: expected.patternLabels.every((label) => rowText.includes(label)),
        highLoadTaskIdsVisible: expected.taskIds.every((id) => allText.includes(id)),
        highLoadArtifactIdsVisible: expected.artifactIds.every((id) => allText.includes(id)),
        highLoadRunIdsVisible: expected.runIds.every((id) => allText.includes(id)),
        highLoadThreadIdsVisible: expected.threadIds.every((id) => allText.includes(id)),
        backgroundRowsVisible:
          highLoadRows.length === expected.taskIds.length &&
          highLoadRows.every((row) => row.text.includes("Background") || row.titleText.includes("Background")),
        completedRowsVisible:
          highLoadRows.length === expected.taskIds.length &&
          highLoadRows.every((row) => row.text.includes("Succeeded") || row.titleText.includes("Succeeded")),
        highLoadRowsHaveNoPauseCancel: highLoadRows.every(
          (row) =>
            !row.buttonSummaries.some(
              (button) => button.ariaLabel.startsWith("Pause workflow task ") || button.ariaLabel.startsWith("Cancel workflow task "),
            ),
        ),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        workflowRows,
        highLoadRows,
      };
    },
    input,
  );
}

export async function inspectPatternGraphRuntime(
  cdp: CdpClient,
  input: {
    childRunId: string;
    childThreadId: string;
    completedChildRunId: string;
    completedChildThreadId: string;
    overflowChildRunId: string;
    overflowChildThreadId: string;
    overflowChildLabel: string;
    workflowTaskIds: string[];
    workflowRunIds: string[];
    patternLabels: string[];
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
      const graphSection = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
      const graphPanels = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph") ?? [])]
        .filter((panel) => panel.offsetParent !== null)
        .map((panel) => ({
          ariaLabel: panel.getAttribute("aria-label") ?? "",
          text: panel.textContent ?? "",
          nodeCount: panel.querySelectorAll(".subagent-pattern-graph-node").length,
        }));
      const graphNodes = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node") ?? [])]
        .filter((node) => (node as unknown as HTMLElement).offsetParent !== null)
        .map((node) => ({
          ariaLabel: node.getAttribute("aria-label") ?? "",
          className: node.getAttribute("class") ?? "",
          title: node.querySelector("title")?.textContent ?? "",
          role: node.getAttribute("role") ?? "",
          tabIndex: (node as unknown as HTMLElement).tabIndex,
          focusable: node.getAttribute("focusable") ?? "",
          ariaKeyshortcuts: node.getAttribute("aria-keyshortcuts") ?? "",
          keyboardOpenable: node.dataset.keyboardOpenable ?? "",
          childRunId: node.dataset.childRunId ?? "",
          childThreadId: node.dataset.childThreadId ?? "",
          workflowTaskId: node.dataset.workflowTaskId ?? "",
          workflowRunId: node.dataset.workflowRunId ?? "",
          graphNodeId: node.dataset.graphNodeId ?? "",
          badges: node.dataset.nodeBadges ?? "",
          overflowExpandable: node.dataset.overflowExpandable ?? "",
          overflowExpanded: node.dataset.overflowExpanded ?? "",
          overflowCount: node.dataset.overflowCount ?? "",
          badgeText: [...node.querySelectorAll(".node-badge")].map((badge) => badge.textContent ?? "").join(" "),
          approvalBadges: [...node.querySelectorAll<SVGGElement>(".node-badge[data-badge-key='approval']")].map((badge) => ({
            ariaLabel: badge.getAttribute("aria-label") ?? "",
            role: badge.getAttribute("role") ?? "",
            tabIndex: (badge as unknown as HTMLElement).tabIndex,
            focusable: badge.getAttribute("focusable") ?? "",
            ariaKeyshortcuts: badge.getAttribute("aria-keyshortcuts") ?? "",
            approvalId: badge.dataset.approvalId ?? "",
            childRunId: badge.dataset.approvalChildRunId ?? "",
            childThreadId: badge.dataset.approvalChildThreadId ?? "",
            openable: badge.dataset.approvalOpenable ?? "",
            busy: badge.dataset.approvalBusy ?? "",
          })),
        }));
      const graphEdges = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-edge") ?? [])]
        .filter((edge) => (edge as unknown as HTMLElement).offsetParent !== null)
        .map((edge) => ({
          className: edge.getAttribute("class") ?? "",
          title: edge.querySelector("title")?.textContent ?? "",
          status: edge.dataset.edgeStatus ?? "",
          blockingParent: edge.dataset.blockingParent ?? "",
        }));
      const legendText = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph-legend span") ?? [])]
        .filter((item) => item.offsetParent !== null)
        .map((item) => item.textContent ?? "")
        .join("\n");
      const allGraphText = [
        graphSection?.textContent ?? "",
        ...graphPanels.map((panel) => panel.ariaLabel),
        ...graphNodes.map((node) => `${node.ariaLabel}\n${node.title}\n${node.graphNodeId}`),
        legendText,
      ].join("\n");
      const runtimeTaskIds = new Set(graphNodes.map((node) => node.workflowTaskId).filter(Boolean));
      const runtimeRunIds = new Set(graphNodes.map((node) => node.workflowRunId).filter(Boolean));
      const criticalElements = [
        ...(graphSection?.querySelectorAll<HTMLElement>([".subagent-pattern-graph", ".subagent-pattern-graph-legend span"].join(",")) ??
          []),
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
      return {
        graphSectionVisible: Boolean(graphSection),
        graphCount: graphPanels.length,
        graphCountVisible: graphPanels.length >= 6,
        allPatternGraphsVisible: expected.patternLabels.every((label) => allGraphText.includes(label.replace("Symphony ", ""))),
        runtimeTaskBindingsVisible: expected.workflowTaskIds.every((id) => runtimeTaskIds.has(id)),
        runtimeRunBindingsVisible: expected.workflowRunIds.every((id) => runtimeRunIds.has(id)),
        childBindingVisible: graphNodes.some(
          (node) => node.childRunId === expected.childRunId && node.childThreadId === expected.childThreadId,
        ),
        childClickThroughAdvertised: graphNodes.some(
          (node) => node.childThreadId === expected.childThreadId && node.ariaLabel.includes("Open Review worker thread from Map-Reduce"),
        ),
        childKeyboardOpenAdvertised: graphNodes.some(
          (node) =>
            node.childThreadId === expected.childThreadId &&
            node.ariaLabel.includes("Open Review worker thread from Map-Reduce") &&
            node.role === "button" &&
            node.tabIndex >= 0 &&
            node.focusable === "true" &&
            node.ariaKeyshortcuts.includes("Enter") &&
            node.ariaKeyshortcuts.includes("Space") &&
            node.keyboardOpenable === "true",
        ),
        completedChildBindingVisible: graphNodes.some(
          (node) => node.childRunId === expected.completedChildRunId && node.childThreadId === expected.completedChildThreadId,
        ),
        completedChildClickThroughAdvertised: graphNodes.some(
          (node) =>
            node.childThreadId === expected.completedChildThreadId &&
            node.ariaLabel.includes("Open Context summarizer thread from Map-Reduce"),
        ),
        completedChildKeyboardOpenAdvertised: graphNodes.some(
          (node) =>
            node.childThreadId === expected.completedChildThreadId &&
            node.ariaLabel.includes("Open Context summarizer thread from Map-Reduce") &&
            node.role === "button" &&
            node.tabIndex >= 0 &&
            node.focusable === "true" &&
            node.ariaKeyshortcuts.includes("Enter") &&
            node.ariaKeyshortcuts.includes("Space") &&
            node.keyboardOpenable === "true",
        ),
        blockingBadgeVisible: legendText.includes("Review worker") && legendText.includes("blocks parent"),
        approvalBadgeVisible: legendText.includes("Approval needed"),
        nodeBlockingBadgeVisible: graphNodes.some(
          (node) => node.badges.split(",").includes("blocking") && node.badgeText.includes("Blocks"),
        ),
        nodeApprovalBadgeVisible: graphNodes.some(
          (node) => node.badges.split(",").includes("approval") && node.badgeText.includes("Approval"),
        ),
        overflowNodeVisible: graphNodes.some(
          (node) => node.graphNodeId === "mapper:overflow" && node.badges.split(",").includes("overflow") && node.badgeText.includes("1"),
        ),
        overflowNodeExpandableAdvertised: graphNodes.some(
          (node) =>
            node.graphNodeId === "mapper:overflow" &&
            node.ariaLabel.includes("Expand 1 grouped from Map-Reduce") &&
            node.role === "button" &&
            node.tabIndex >= 0 &&
            node.focusable === "true" &&
            node.ariaKeyshortcuts.includes("Enter") &&
            node.ariaKeyshortcuts.includes("Space") &&
            node.keyboardOpenable === "true" &&
            node.overflowExpandable === "true" &&
            node.overflowExpanded === "false" &&
            node.overflowCount === "1",
        ),
        overflowPanelInitiallyCollapsed: !graphSection?.querySelector(".subagent-pattern-graph-overflow-panel"),
        approvalBadgeOpenAdvertised: graphNodes.some(
          (node) =>
            node.childThreadId === expected.childThreadId &&
            node.approvalBadges.some(
              (badge) =>
                badge.ariaLabel.includes("Open approval request") &&
                badge.role === "button" &&
                badge.tabIndex >= 0 &&
                badge.focusable === "true" &&
                badge.ariaKeyshortcuts.includes("Enter") &&
                badge.ariaKeyshortcuts.includes("Space") &&
                badge.childRunId === expected.childRunId &&
                badge.childThreadId === expected.childThreadId &&
                badge.openable === "true" &&
                badge.busy === "false",
            ),
        ),
        blockingEdgeVisible: graphEdges.some(
          (edge) =>
            edge.blockingParent === "true" &&
            edge.className.includes("blocking-parent") &&
            (edge.status.includes("Approval") ||
              edge.status.includes("Blocked") ||
              edge.status.includes("Running") ||
              edge.title.includes("blocks parent")),
        ),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        graphPanels,
        graphNodes,
        graphEdges,
        legendText,
      };
    },
    input,
  );
}

export async function inspectDeniedScopeExplanation(
  cdp: CdpClient,
  input: {
    parentMailboxEventId: string;
    childRunId: string;
    childThreadId: string;
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const renderedOpenClusterContent = (element: HTMLElement) => {
        const cluster = element.closest<HTMLDetailsElement>("details.subagent-parent-cluster");
        return !cluster || cluster.open || element.tagName.toLowerCase() === "summary";
      };
      const mailboxRows = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div")]
        .filter((row) => row.offsetParent !== null && renderedOpenClusterContent(row))
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
          actionCount: row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button").length,
          element: row,
        }));
      const deniedScopeRow = mailboxRows.find((row) => {
        const rowText = `${row.text}\n${row.titleText}`;
        return rowText.includes("Spawn failed") && rowText.includes("Approval unavailable") && rowText.includes("gmail.search");
      });
      const deniedScopeText = `${deniedScopeRow?.text ?? ""}\n${deniedScopeRow?.titleText ?? ""}`;
      const inspectedCluster = deniedScopeRow?.element.closest<HTMLElement>(".subagent-parent-cluster");
      const criticalElements = inspectedCluster
        ? [
            ...inspectedCluster.querySelectorAll<HTMLElement>(
              [":scope > summary", ".subagent-parent-cluster-mailbox > div", ".subagent-parent-cluster-mailbox-action"].join(","),
            ),
          ].filter((element) => element.offsetParent !== null && renderedOpenClusterContent(element))
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
      return {
        parentMailboxEventIdCaptured: expected.parentMailboxEventId.length > 0,
        spawnFailureVisible: deniedScopeText.includes("Spawn failed"),
        approvalUnavailableVisible:
          deniedScopeText.includes("Approval unavailable") &&
          deniedScopeText.includes("non-interactive launch cannot surface required approval"),
        deniedCategoryVisible: deniedScopeText.includes("Denied categories: Connector Read (connector.read)"),
        deniedToolVisible: deniedScopeText.includes("Denied tools: Connector App gmail.search / Connector Read (connector.read)"),
        sourceChildVisible:
          deniedScopeText.includes(expected.childRunId) &&
          deniedScopeText.includes(expected.childThreadId) &&
          deniedScopeText.includes("root/2:connector-denied"),
        noInteractiveApprovalActions: deniedScopeRow?.actionCount === 0,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        mailboxRows: mailboxRows.map((row) => ({
          text: row.text,
          titleText: row.titleText,
          actionCount: row.actionCount,
        })),
      };
    },
    input,
  );
}

export async function inspectApprovalDialog(cdp: CdpClient, input: { approvalId: string; childRunId: string; childThreadId: string }) {
  return evaluate(
    cdp,
    (expected) => {
      const dialog = document.querySelector<HTMLElement>(".subagent-approval-dialog");
      const text = dialog?.innerText ?? "";
      const selectedScope = dialog?.querySelector<HTMLInputElement>("input[name='subagent-approval-scope']:checked")?.value;
      const scopeLabels = dialog
        ? [...dialog.querySelectorAll<HTMLElement>(".subagent-approval-scope-option")].map((option) => option.innerText)
        : [];
      return {
        dialogOpened: Boolean(dialog),
        dialogNamesApproval: text.includes(expected.approvalId),
        dialogNamesChildRun: text.includes(expected.childRunId),
        dialogNamesChildThread: text.includes(expected.childThreadId),
        dialogNamesBlockingChild: text.includes("root/0:reviewer") && text.includes("Review worker"),
        dialogShowsParentWaitState:
          text.includes("Approval is sent to this child") &&
          text.includes("parent stays blocked until the child reaches a synthesis-safe result"),
        dialogShowsPrompt: text.includes("Review worker needs permission to edit files in its isolated worktree."),
        dialogShowsStandardScopes: ["This action", "For this child", "Parent thread tree", "Project/workspace", "Global"].every((label) =>
          scopeLabels.some((scopeLabel) => scopeLabel.includes(label)),
        ),
        initialScopeThisAction: selectedScope === "this_action",
        selectedScope,
        text,
      };
    },
    input,
  );
}

export async function inspectSubagentUi(cdp: CdpClient) {
  return evaluate(
    cdp,
    (parentText) => {
      const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
      const summary = cluster?.querySelector("summary") as HTMLElement | null;
      const parentTextNode = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((element) => element.innerText?.includes(parentText) && !element.querySelector(".subagent-parent-cluster"))
        .sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.width * aRect.height - bRect.width * bRect.height;
        })[0];
      const clusterRect = cluster?.getBoundingClientRect();
      const parentRect = textRangeRectFor(parentText, clusterRect) ?? parentTextNode?.getBoundingClientRect();
      const text = document.body.innerText;
      const labels = Object.fromEntries(
        [
          "Sub-agent threads",
          "2 children",
          "6 workflow tasks",
          "1 blocking",
          "1 active",
          "1 workflow blocked",
          "1 attention",
          "1 failed spawn",
          "Approval needed",
          "Needs attention",
          "Review worker",
          "Context summarizer",
          "Blocking: approval",
          "Approval requested",
          "Allow workspace write",
          "workspace.write",
          "This child thread",
          "Approve child",
          "Deny child",
          "Waiting on child",
          "Required all",
          "Ask user on failure",
          "Symphony Map-Reduce",
          "Symphony Self-Healing Loop",
          "Symphony Adversarial Debate",
          "Symphony Imitate and Verify",
          "Symphony Pipeline",
          "Symphony Ensemble",
          "Blocking: workflow work",
          "Workflow blocked",
          "Mutating child worker",
          "Staged mutation: src/feature.txt",
          "Parent workspace unchanged",
        ].map((label) => [label, text.includes(label)]),
      );
      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            ".subagent-parent-cluster summary",
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-barriers > div",
            ".subagent-parent-cluster-workflows > div",
            ".subagent-parent-cluster-workflow-action",
            ".subagent-parent-cluster-child-blocker-context",
            ".subagent-parent-cluster-mailbox-action.is-button",
            ".subagent-parent-cluster-child-action",
          ].join(","),
        ) ?? []),
      ].filter((element) => element.offsetParent !== null);
      const approveButtons = [
        ...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-approve") ?? []),
      ].filter((button) => button.innerText.trim() === "Approve child");
      const denyButtons = [
        ...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-danger") ?? []),
      ].filter((button) => button.innerText.trim() === "Deny child");
      const approvalButtons = [...approveButtons, ...denyButtons];
      const approvalButtonTitles = approvalButtons.map((button) => button.getAttribute("title") ?? "");
      const approvalButtonAriaLabels = approvalButtons.map((button) => button.getAttribute("aria-label") ?? "");
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const defaultExpandedBlockingChildren = [
        ...(cluster?.querySelectorAll<HTMLDetailsElement>(".subagent-parent-cluster-child-thread[open]") ?? []),
      ].filter(
        (details) =>
          details.dataset.childDefaultExpanded === "true" ||
          (details.innerText.includes("Child transcript") &&
            (details.innerText.includes("Blocking:") || details.innerText.includes("Needs attention"))),
      ).length;
      const firstInlineTranscript = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live");
      const firstPatternGraph = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
      const approvalFlow = {
        approvalRequested: text.includes("Approval requested"),
        approvalBlockedChild: text.includes("Blocking: approval"),
        parentStillBlocked: text.includes("Waiting on child") && text.includes("Required all"),
        childIdentifierVisible:
          text.includes("Review worker") && (text.includes("root/0:reviewer") || titledText.includes("root/0:reviewer")),
        toolScopeVisible: text.includes("workspace.write"),
        approvalScopeVisible: text.includes("This action") || text.includes("This child thread"),
        approvalPromptVisible: text.includes("Review worker needs permission to edit files in its isolated worktree."),
        approveButtonVisible: approveButtons.length >= 1,
        denyButtonVisible: denyButtons.length >= 1,
        approvalButtons: approvalButtons.length,
        approvalButtonsNameChild:
          approvalButtons.length >= 2 &&
          approvalButtonTitles.every(
            (title) =>
              title.includes("desktop-dogfood-approval-write") &&
              title.includes("Allow workspace write") &&
              title.includes("root/0:reviewer") &&
              title.includes("run ") &&
              title.includes("thread "),
          ) &&
          approvalButtonAriaLabels.every((label) => label.includes("desktop-dogfood-approval-write") && label.includes("root/0:reviewer")),
      };
      const childActionButtons = [...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action") ?? [])];
      const childActionSummaries = childActionButtons.map((button) => {
        const row = button.closest(".subagent-parent-cluster-child-row") as HTMLElement | null;
        return {
          ariaLabel: button.getAttribute("aria-label") ?? "",
          title: button.getAttribute("title") ?? "",
          text: button.innerText.trim(),
          hasIcon: Boolean(button.querySelector("svg")),
          disabled: button.disabled,
          rowText: row?.innerText ?? "",
          isClose: button.classList.contains("is-close"),
        };
      });
      const cancelButtons = childActionSummaries.filter((button) => button.ariaLabel.startsWith("Cancel sub-agent "));
      const closeButtons = childActionSummaries.filter((button) => button.ariaLabel.startsWith("Close sub-agent "));
      const reviewCancel = cancelButtons.filter(
        (button) =>
          button.ariaLabel === "Cancel sub-agent Review worker" &&
          button.title.includes("root/0:reviewer") &&
          button.rowText.includes("Review worker"),
      );
      const reviewClose = closeButtons.filter(
        (button) =>
          button.ariaLabel === "Close sub-agent Review worker" &&
          button.title.includes("root/0:reviewer") &&
          button.rowText.includes("Review worker"),
      );
      const summarizerClose = closeButtons.filter(
        (button) =>
          button.ariaLabel === "Close sub-agent Context summarizer" &&
          button.title.includes("root/1:summarizer") &&
          button.rowText.includes("Context summarizer"),
      );
      const operatorControls = {
        cancelActionVisible: reviewCancel.length === 1,
        closeAttentionChildVisible: reviewClose.length === 1,
        closeCompletedChildVisible: summarizerClose.length === 1,
        cancelScopedToAttentionChild: cancelButtons.length === 1 && reviewCancel.length === 1,
        noCancelForCompletedChild: !cancelButtons.some((button) => button.ariaLabel === "Cancel sub-agent Context summarizer"),
        closeTitlesPreserveTranscripts:
          closeButtons.length === 2 && closeButtons.every((button) => button.title.includes("transcript and artifacts are retained")),
        controlsUseIconButtons:
          childActionSummaries.length >= 3 && childActionSummaries.every((button) => button.hasIcon && button.text === ""),
        controlsNameChild:
          childActionSummaries.length >= 3 &&
          childActionSummaries.every(
            (button) => button.ariaLabel.includes("Review worker") || button.ariaLabel.includes("Context summarizer"),
          ),
        controlsNotDisabled: childActionSummaries.length >= 3 && childActionSummaries.every((button) => !button.disabled),
        cancelButtons: cancelButtons.length,
        closeButtons: closeButtons.length,
      };
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
      return {
        clusterCount: document.querySelectorAll(".subagent-parent-cluster").length,
        defaultCollapsed: !(cluster?.hasAttribute("open") ?? false),
        clusterAfterParentMessage: Boolean(
          parentTextNode && cluster && parentTextNode.compareDocumentPosition(cluster) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        clusterBelowParentMessage: Boolean(clusterRect && parentRect && clusterRect.top >= parentRect.bottom - 2),
        clusterWithinViewport: Boolean(clusterRect && clusterRect.left >= -1 && clusterRect.right <= window.innerWidth + 1),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        childRows: cluster?.querySelectorAll(".subagent-parent-cluster-child-row").length ?? 0,
        defaultExpandedBlockingChildren,
        inlineTranscriptBeforePatternGraphs: Boolean(
          firstInlineTranscript &&
          firstPatternGraph &&
          firstInlineTranscript.compareDocumentPosition(firstPatternGraph) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        warningToneCount: cluster?.querySelectorAll(".tone-warning").length ?? 0,
        activeToneCount: cluster?.querySelectorAll(".tone-active").length ?? 0,
        criticalOverlapCount,
        labels,
        approvalFlow,
        operatorControls,
        summaryText: summary?.innerText ?? "",
      };

      function textRangeRectFor(needle: string, referenceRect: DOMRect | undefined): DOMRect | undefined {
        const candidates: DOMRect[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const value = node.textContent ?? "";
          const index = value.indexOf(needle);
          if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + needle.length);
            const rect = range.getBoundingClientRect();
            range.detach();
            if (rect.width > 0 && rect.height > 0) candidates.push(rect);
          }
          node = walker.nextNode();
        }
        const mainColumnCandidates = referenceRect ? candidates.filter((rect) => rect.left >= referenceRect.left - 160) : candidates;
        return (mainColumnCandidates.length ? mainColumnCandidates : candidates).sort((a, b) => {
          if (!referenceRect) return a.top - b.top;
          return Math.abs(referenceRect.top - a.bottom) - Math.abs(referenceRect.top - b.bottom);
        })[0];
      }
    },
    SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT,
  );
}

export async function inspectInlineChildTranscript(
  cdp: CdpClient,
  input: {
    childTitle: string;
    childThreadId: string;
    childRunId: string;
    expectedUserText?: string;
    expectedAssistantText?: string;
    expectedToolText?: string;
    forbiddenText?: string;
  },
) {
  return evaluate(
    cdp,
    async (expected) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const details = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-thread")].find((candidate) =>
        candidate.innerText.includes(expected.childTitle),
      );
      const summary = details?.querySelector<HTMLElement>("summary");
      const transcript = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript");
      const liveShell = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live");
      const miniThreadHeader = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-mini-thread-header");
      const openFullThreadAction = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-open-full-thread");
      const liveHeader = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-header");
      const liveStatus = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-status");
      const liveActivity = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-run-activity");
      const liveActivityCard = liveActivity?.querySelector<HTMLElement>(".run-activity-card");
      const liveActivityLines = [...(liveActivity?.querySelectorAll<HTMLElement>(".run-activity-line") ?? [])].filter(
        (element) => element.offsetParent !== null,
      );
      const stream = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-stream");
      const runtimeRail = details?.querySelector<HTMLElement>(
        ".subagent-parent-cluster-child-runtime-events:not(.subagent-parent-cluster-child-mailbox-events)",
      );
      const runtimeTimelineTitle = runtimeRail?.querySelector<HTMLElement>(".subagent-parent-cluster-child-runtime-events-title");
      const runtimeRows = [...(runtimeRail?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-runtime-event") ?? [])].filter(
        (element) => element.offsetParent !== null,
      );
      const mailboxRail = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-mailbox-events");
      const mailboxTimelineTitle = mailboxRail?.querySelector<HTMLElement>(".subagent-parent-cluster-child-runtime-events-title");
      const mailboxRows = [...(mailboxRail?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-runtime-event") ?? [])].filter(
        (element) => element.offsetParent !== null,
      );
      const liveMarker = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-live-marker");
      const endCap = details?.querySelector<HTMLElement>(".subagent-parent-cluster-child-transcript-end");
      const terminalSummary = details?.querySelector<HTMLElement>("[data-child-terminal-summary='true']");
      const summaryRect = summary?.getBoundingClientRect();
      const transcriptRect = transcript?.getBoundingClientRect();
      const messageElements = [...(transcript?.querySelectorAll<HTMLElement>(".message") ?? [])].filter(
        (element) => element.offsetParent !== null && !element.classList.contains("run-activity"),
      );
      const toolCardElements = [...(transcript?.querySelectorAll<HTMLElement>(".message.tool .tool-card") ?? [])].filter(
        (element) => element.offsetParent !== null,
      );
      const lastMessage = messageElements.at(-1);
      const lastMessageRect = lastMessage?.getBoundingClientRect();
      const liveMarkerRect = liveMarker?.getBoundingClientRect();
      const endCapRect = endCap?.getBoundingClientRect();
      const messageScrollport = details?.closest<HTMLElement>(".messages");
      const conversation = details?.closest<HTMLElement>(".conversation");
      const composerRect = conversation?.querySelector<HTMLElement>(".composer")?.getBoundingClientRect();
      const messagesRect = messageScrollport?.getBoundingClientRect();
      const visibleBottom = Math.min(messagesRect?.bottom ?? window.innerHeight, composerRect?.top ?? window.innerHeight);
      const visibleTranscriptText = transcript?.innerText ?? "";
      const titledText = [...(details?.querySelectorAll<HTMLElement>("[title]") ?? [])]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const messageCountFromShell = Number(liveShell?.dataset.childMessageCount ?? NaN);
      const toolMessageCountFromShell = Number(liveShell?.dataset.childToolMessageCount ?? NaN);
      const runtimeEventCountFromShell = Number(liveShell?.dataset.childRuntimeEventCount ?? NaN);
      const runtimeEventRenderedCountFromShell = Number(liveShell?.dataset.childRuntimeEventRenderedCount ?? NaN);
      const runtimeEventRenderedCountFromRail = Number(runtimeRail?.dataset.childRuntimeEventRenderedCount ?? NaN);
      const runtimeEventOmittedCountFromShell = Number(liveShell?.dataset.childRuntimeEventOmittedCount ?? NaN);
      const runtimeEventOmittedCountFromRail = Number(runtimeRail?.dataset.childRuntimeEventOmittedCount ?? NaN);
      const mailboxEventCountFromShell = Number(liveShell?.dataset.childMailboxEventCount ?? NaN);
      const mailboxEventRenderedCountFromShell = Number(liveShell?.dataset.childMailboxEventRenderedCount ?? NaN);
      const mailboxEventRenderedCountFromRail = Number(mailboxRail?.dataset.childMailboxEventRenderedCount ?? NaN);
      const mailboxEventOmittedCountFromShell = Number(liveShell?.dataset.childMailboxEventOmittedCount ?? NaN);
      const mailboxEventOmittedCountFromRail = Number(mailboxRail?.dataset.childMailboxEventOmittedCount ?? NaN);
      const runActivityCountFromShell = Number(liveShell?.dataset.childRunActivityCount ?? NaN);
      const runActivityCountFromRail = Number(liveActivity?.dataset.childRunActivityCount ?? NaN);
      const runActivityVisibleFromShell = liveShell?.dataset.childRunActivityVisible === "true";
      const childTranscriptTerminal = liveShell?.dataset.childTerminal === "true";
      const childTranscriptSynthesisSafe = liveShell?.dataset.childSynthesisSafe === "true";
      const childStreaming = liveShell?.dataset.childStreaming === "true";
      const childRenderer = liveShell?.dataset.childRenderer ?? "";
      const transcriptPrimary = liveShell?.dataset.childTranscriptPrimary === "true";
      const transcriptStreamLive = stream?.dataset.childTranscriptStreamLive === "true";
      const runtimeEventsOpen = liveShell?.dataset.childRuntimeEventsOpen === "true";
      const mailboxEventsOpen = liveShell?.dataset.childMailboxEventsOpen === "true";
      const transcriptEndRect = childTranscriptTerminal ? endCapRect : liveMarkerRect;
      const transcriptEndClearancePx = transcriptEndRect ? visibleBottom - transcriptEndRect.bottom : Number.NEGATIVE_INFINITY;
      const liveHeaderText = liveHeader?.innerText ?? "";
      const miniThreadHeaderText = miniThreadHeader?.innerText ?? "";
      const openFullThreadActionText = openFullThreadAction?.innerText ?? "";
      const runtimeTimelineTitleText = runtimeTimelineTitle?.innerText ?? "";
      const mailboxTimelineTitleText = mailboxTimelineTitle?.innerText ?? "";
      const mailboxText = `${mailboxRail?.innerText ?? ""}\n${[...(mailboxRail?.querySelectorAll<HTMLElement>("[title]") ?? [])]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n")}`;
      const criticalElements = [
        ...(summary ? [summary] : []),
        ...(transcript ? [transcript] : []),
        ...(liveActivity ? [liveActivity] : []),
        ...messageElements,
        ...(mailboxRail ? [mailboxRail] : []),
        ...(liveMarker ? [liveMarker] : []),
        ...(endCap ? [endCap] : []),
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
      return {
        childExpanded: details instanceof HTMLDetailsElement && details.open,
        transcriptPanelVisible: Boolean(transcript && transcript.offsetParent !== null),
        liveTranscriptShellVisible: Boolean(liveShell && liveShell.offsetParent !== null),
        liveTranscriptStreamVisible: Boolean(stream && stream.offsetParent !== null),
        liveTranscriptStatusVisible: Boolean(liveStatus && liveStatus.offsetParent !== null && liveStatus.innerText.trim().length > 0),
        miniThreadHeaderVisible: Boolean(miniThreadHeader && miniThreadHeader.offsetParent !== null),
        miniThreadHeaderNamesChild: miniThreadHeaderText.includes("Child thread") && miniThreadHeaderText.includes(expected.childTitle),
        openFullThreadActionVisible: Boolean(openFullThreadAction && openFullThreadAction.offsetParent !== null),
        openFullThreadActionNamesChild:
          (openFullThreadAction?.getAttribute("aria-label") ?? "").includes(expected.childTitle) ||
          openFullThreadActionText.includes("Open full thread"),
        liveTranscriptMessageCountVisible: /\b\d+ messages?\b/.test(liveHeaderText),
        liveTranscriptToolCardCountVisible: toolMessageCountFromShell > 0 ? /\b\d+ tool cards?\b/.test(liveHeaderText) : true,
        liveTranscriptRuntimeEventCountVisible: /\b\d+ runtime events?\b/.test(liveHeaderText),
        liveTranscriptMailboxEventCountVisible: mailboxEventCountFromShell > 0 ? /\b\d+ mailbox events?\b/.test(liveHeaderText) : true,
        liveTranscriptActivityCountVisible: runActivityVisibleFromShell ? /\b\d+ activity lines?\b/.test(liveHeaderText) : true,
        liveTranscriptMessageCountMatchesBubbles:
          Number.isFinite(messageCountFromShell) && messageCountFromShell === messageElements.length,
        liveChildActivityVisible: Boolean(liveActivity && liveActivity.offsetParent !== null),
        liveChildActivityUsesParentChrome: Boolean(liveActivityCard && liveActivityCard.offsetParent !== null),
        liveChildActivityCountMatchesShell: runActivityVisibleFromShell
          ? Number.isFinite(runActivityCountFromShell) &&
            Number.isFinite(runActivityCountFromRail) &&
            runActivityCountFromShell === runActivityCountFromRail &&
            liveActivityLines.length === runActivityCountFromShell
          : true,
        liveChildActivityHasLines: runActivityVisibleFromShell ? liveActivityLines.length > 0 : true,
        toolCardVisible: toolCardElements.length > 0,
        toolCardCountMatchesData: Number.isFinite(toolMessageCountFromShell) && toolMessageCountFromShell === toolCardElements.length,
        toolCardUsesParentChrome: toolCardElements.some(
          (element) =>
            element.querySelector(".tool-status") && element.querySelector(".tool-summary-body") && element.querySelector(".tool-output"),
        ),
        toolCardResultVisible: expected.expectedToolText
          ? toolCardElements.some((element) => element.innerText.includes(expected.expectedToolText!))
          : true,
        toolCardInputVisible: toolCardElements.some((element) => element.innerText.includes("README.md")),
        childRendererUsesToolCards: toolMessageCountFromShell > 0 ? childRenderer.includes("tool-card") : true,
        transcriptPrimary,
        transcriptStreamLive,
        runtimeEventsOpen,
        mailboxEventsOpen,
        liveTranscriptRuntimeEventCountPositive: Number.isFinite(runtimeEventCountFromShell) && runtimeEventCountFromShell > 0,
        liveTranscriptModeLabelVisible: childTranscriptTerminal
          ? liveHeaderText.includes("terminal end cap below")
          : liveHeaderText.includes("live child run"),
        childStreaming,
        runtimeEventRailVisible: Boolean(runtimeRail && runtimeRail.offsetParent !== null),
        runtimeEventRailHasRecentEvents: runtimeRows.length > 0,
        runtimeTimelineVisible: Boolean(
          runtimeTimelineTitle && runtimeTimelineTitle.offsetParent !== null && runtimeTimelineTitleText.includes("Runtime timeline"),
        ),
        runtimeTimelineCountVisible:
          /\b\d+ events?\b/.test(runtimeTimelineTitleText) || /Latest \d+ of \d+ events/.test(runtimeTimelineTitleText),
        runtimeTimelineRenderedCountMatchesRows:
          Number.isFinite(runtimeEventRenderedCountFromShell) &&
          Number.isFinite(runtimeEventRenderedCountFromRail) &&
          runtimeEventRenderedCountFromShell === runtimeRows.length &&
          runtimeEventRenderedCountFromRail === runtimeRows.length,
        runtimeTimelineOmittedCountConsistent:
          Number.isFinite(runtimeEventOmittedCountFromShell) &&
          Number.isFinite(runtimeEventOmittedCountFromRail) &&
          runtimeEventOmittedCountFromShell === runtimeEventOmittedCountFromRail,
        runtimeEventRows: runtimeRows.length,
        childMailboxEventCountPositive: Number.isFinite(mailboxEventCountFromShell) && mailboxEventCountFromShell > 0,
        childMailboxTimelineVisible: Boolean(mailboxRail && mailboxRail.offsetParent !== null),
        childMailboxTimelineCountVisible:
          /\b\d+ events?\b/.test(mailboxTimelineTitleText) || /Latest \d+ of \d+ events/.test(mailboxTimelineTitleText),
        childMailboxTimelineRenderedCountMatchesRows:
          Number.isFinite(mailboxEventRenderedCountFromShell) &&
          Number.isFinite(mailboxEventRenderedCountFromRail) &&
          mailboxEventRenderedCountFromShell === mailboxRows.length &&
          mailboxEventRenderedCountFromRail === mailboxRows.length,
        childMailboxTimelineOmittedCountConsistent:
          Number.isFinite(mailboxEventOmittedCountFromShell) &&
          Number.isFinite(mailboxEventOmittedCountFromRail) &&
          mailboxEventOmittedCountFromShell === mailboxEventOmittedCountFromRail,
        childMailboxTimelineHasParentFollowup:
          mailboxText.includes("Parent follow-up queued") &&
          mailboxText.includes("Parent follow-up delivered while the review worker remains live and inspectable."),
        childMailboxRows: mailboxRows.length,
        userMessageVisible: expected.expectedUserText ? visibleTranscriptText.includes(expected.expectedUserText) : true,
        assistantMessageVisible: expected.expectedAssistantText ? visibleTranscriptText.includes(expected.expectedAssistantText) : true,
        siblingSummaryNotLeakedIntoTranscript: expected.forbiddenText ? !visibleTranscriptText.includes(expected.forbiddenText) : true,
        childRunIdVisible:
          (details?.innerText ?? "").includes(expected.childRunId) ||
          titledText.includes(expected.childRunId) ||
          details?.dataset.childRunId === expected.childRunId,
        childThreadIdVisible:
          (details?.innerText ?? "").includes(expected.childThreadId) ||
          titledText.includes(expected.childThreadId) ||
          details?.dataset.childThreadId === expected.childThreadId,
        messageBubbleCount: messageElements.length,
        childTranscriptTerminal,
        childTranscriptSynthesisSafe,
        liveContinuationMarkerVisible: Boolean(liveMarker && liveMarker.offsetParent !== null),
        liveContinuationMarkerAfterMessages: Boolean(
          liveMarker &&
          liveMarker.offsetParent !== null &&
          (!lastMessageRect || (liveMarkerRect && liveMarkerRect.top >= lastMessageRect.bottom - 2)),
        ),
        completionEndCapVisible: Boolean(terminalSummary && terminalSummary.offsetParent !== null),
        completionEndCapText: terminalSummary?.innerText ?? "",
        completionEndCapLabelVisible: Boolean(terminalSummary && terminalSummary.innerText.includes("Completion summary")),
        finalStatusEndCapLabelVisible: Boolean(terminalSummary && terminalSummary.innerText.includes("Final child status")),
        terminalEndCapLabelVisible: Boolean(
          terminalSummary &&
          (terminalSummary.innerText.includes("Completion summary") || terminalSummary.innerText.includes("Final child status")),
        ),
        completionEndCapAfterMessages: Boolean(
          terminalSummary &&
          terminalSummary.offsetParent !== null &&
          (!lastMessageRect || (endCapRect && endCapRect.top >= lastMessageRect.bottom - 2)),
        ),
        completionSummaryDeferredWhileLive: childTranscriptTerminal
          ? true
          : Boolean(liveMarker && liveMarker.offsetParent !== null && !(terminalSummary && terminalSummary.offsetParent !== null)),
        transcriptEndStateCorrect: childTranscriptTerminal
          ? Boolean(
              terminalSummary &&
              terminalSummary.offsetParent !== null &&
              (!lastMessageRect || (endCapRect && endCapRect.top >= lastMessageRect.bottom - 2)),
            )
          : Boolean(liveMarker && liveMarker.offsetParent !== null && !(terminalSummary && terminalSummary.offsetParent !== null)),
        transcriptEndClearsComposer: transcriptEndClearancePx >= 8,
        transcriptEndClearancePx,
        summaryNotObscuringTranscript: Boolean(
          summaryRect && transcriptRect && transcriptRect.top >= summaryRect.bottom - 2 && transcriptRect.height > 40,
        ),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        transcriptText: visibleTranscriptText,
      };
    },
    {
      expectedUserText: input.expectedUserText,
      expectedAssistantText: input.expectedAssistantText,
      expectedToolText: input.expectedToolText,
      forbiddenText: input.forbiddenText,
      ...input,
    },
  );
}

export async function inspectEffectiveRoleSnapshot(cdp: CdpClient) {
  return evaluate(cdp, () => {
    const inspector = document.querySelector<HTMLElement>(".subagent-thread-inspector");
    const text = inspector?.innerText ?? "";
    return {
      inspectorVisible: Boolean(inspector && inspector.offsetParent !== null),
      effectiveRoleVisible: text.includes("Effective role") && text.includes("Reviewer + Mapper"),
      patternRoleVisible: text.includes("Pattern role") && text.includes("Mapper"),
      overlaysVisible:
        text.includes("Role overlays") &&
        text.includes("slice assignment") &&
        text.includes("evidence burden") &&
        text.includes("approval checkpoint"),
      outputContractVisible: text.includes("Output contract") && text.includes("schema-valid mapped review evidence"),
      titleVisible: text.includes("Reviewer + Mapper sub-agent"),
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      inspectorText: text,
    };
  });
}

export async function inspectApprovalForwarding(
  cdp: CdpClient,
  input: { approvalId: string; childRunId: string; childThreadId: string; canonicalTaskPath: string },
) {
  return evaluate(
    cdp,
    (expected) => {
      const cluster = document.querySelector<HTMLElement>(".subagent-parent-cluster");
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          childRunId: row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childRunId ?? row.dataset.childRunId ?? "",
          childThreadId:
            row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childThreadId ?? row.dataset.childThreadId ?? "",
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const forwarded = mailboxRows.find((row) => row.text.includes("Approval forwarded"));
      const approvalRequest = mailboxRows.find((row) => row.text.includes("Approval requested"));
      const review = childRows.find((row) => row.text.includes("Review worker"));
      const rowText = (row: { text: string; titleText: string } | undefined) => `${row?.text ?? ""}\n${row?.titleText ?? ""}`;
      const rowNamesExpectedChild = (row: { text: string; titleText: string } | undefined) => {
        const haystack = rowText(row);
        return (
          haystack.includes(expected.childRunId) &&
          haystack.includes(expected.childThreadId) &&
          haystack.includes(expected.canonicalTaskPath)
        );
      };
      const approvalActionButtons = [
        ...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button") ?? []),
      ].filter((button) => ["Approve child", "Deny child"].includes(button.innerText.trim()));
      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-barriers > div",
            ".subagent-parent-cluster-mailbox > div",
            ".subagent-parent-cluster-mailbox-action.is-button",
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
      return {
        forwardedVisible: Boolean(forwarded),
        approvedDecisionVisible: Boolean(forwarded?.text.includes("Approved")),
        childThreadScopeVisible: Boolean(forwarded?.text.includes("This child thread")),
        childScopedPersistenceVisible: Boolean(
          forwarded?.text.includes("Approval grant applies to this child thread") ||
          forwarded?.text.includes("Always defaulted to this child thread"),
        ),
        parentResumeAfterApprovalVisible: Boolean(forwarded?.text.includes("Parent returned to waiting on this child")),
        forwardedNamesChild: Boolean(
          forwarded &&
          (forwarded.text.includes("Review worker") ||
            forwarded.titleText.includes("Review worker") ||
            titledText.includes("Review worker")) &&
          (forwarded.text.includes("root/0:reviewer") ||
            forwarded.titleText.includes("root/0:reviewer") ||
            titledText.includes("root/0:reviewer")) &&
          (forwarded.text.includes(expected.childRunId) ||
            forwarded.titleText.includes(expected.childRunId) ||
            titledText.includes(expected.childRunId)),
        ),
        forwardedNamesApproval: Boolean(forwarded?.text.includes(expected.approvalId)),
        forwardedMatchesApprovalChild: rowNamesExpectedChild(forwarded),
        approvalRequestMatchesApprovalChild: rowNamesExpectedChild(approvalRequest),
        forwardedAndRequestSameChild: rowNamesExpectedChild(forwarded) && rowNamesExpectedChild(approvalRequest),
        approvalRequestStillVisible: Boolean(approvalRequest),
        approvalRequestActionsRemoved: approvalActionButtons.length === 0,
        parentStillBlockedAfterForward: text.includes("Waiting on child") && text.includes("Required all"),
        childRowDataMatchesApprovalChild: Boolean(
          review?.childRunId === expected.childRunId &&
          review?.childThreadId === expected.childThreadId &&
          (review.text.includes(expected.canonicalTaskPath) || review.titleText.includes(expected.canonicalTaskPath)),
        ),
        childRowStillBlocksApprovalChild: Boolean(
          review?.childRunId === expected.childRunId &&
          review?.childThreadId === expected.childThreadId &&
          (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering")),
        ),
        childReturnedToNeedsSteering: Boolean(
          review && (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering")),
        ),
        waitBarrierStillVisible: text.includes("Waiting on child") && text.includes("Ask user on failure"),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        mailboxRows,
        childRows,
      };
    },
    input,
  );
}

export async function inspectApprovalDenial(
  cdp: CdpClient,
  input: { approvalId: string; childRunId: string; childThreadId: string; canonicalTaskPath: string },
) {
  return evaluate(
    cdp,
    (expected) => {
      const cluster = document.querySelector<HTMLElement>(".subagent-parent-cluster");
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          childRunId: row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childRunId ?? row.dataset.childRunId ?? "",
          childThreadId:
            row.closest<HTMLElement>(".subagent-parent-cluster-child-thread")?.dataset.childThreadId ?? row.dataset.childThreadId ?? "",
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const forwarded = mailboxRows.find((row) => row.text.includes("Approval forwarded"));
      const approvalRequest = mailboxRows.find((row) => row.text.includes("Approval requested"));
      const review = childRows.find((row) => row.text.includes("Review worker"));
      const summarizer = childRows.find((row) => row.text.includes("Context summarizer"));
      const rowText = (row: { text: string; titleText: string } | undefined) => `${row?.text ?? ""}\n${row?.titleText ?? ""}`;
      const rowNamesExpectedChild = (row: { text: string; titleText: string } | undefined) => {
        const haystack = rowText(row);
        return (
          haystack.includes(expected.childRunId) &&
          haystack.includes(expected.childThreadId) &&
          haystack.includes(expected.canonicalTaskPath)
        );
      };
      const forwardedText = rowText(forwarded);
      const approvalActionButtons = [
        ...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button") ?? []),
      ].filter((button) => ["Approve child", "Deny child"].includes(button.innerText.trim()));
      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-barriers > div",
            ".subagent-parent-cluster-mailbox > div",
            ".subagent-parent-cluster-mailbox-action.is-button",
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
      return {
        forwardedVisible: Boolean(forwarded),
        deniedDecisionVisible: forwardedText.includes("Denied"),
        denialScopeVisible: forwardedText.includes("This action"),
        denialReasonVisible: forwardedText.includes("Denied approval grants apply only to the original child approval request."),
        parentResumeAfterDenialVisible: forwardedText.includes("Parent returned to waiting on this child"),
        forwardedNamesChild: Boolean(
          forwarded &&
          (forwarded.text.includes("Review worker") ||
            forwarded.titleText.includes("Review worker") ||
            titledText.includes("Review worker")) &&
          (forwarded.text.includes("root/0:reviewer") ||
            forwarded.titleText.includes("root/0:reviewer") ||
            titledText.includes("root/0:reviewer")) &&
          (forwarded.text.includes(expected.childRunId) ||
            forwarded.titleText.includes(expected.childRunId) ||
            titledText.includes(expected.childRunId)),
        ),
        forwardedNamesApproval: Boolean(forwarded?.text.includes(expected.approvalId)),
        forwardedMatchesApprovalChild: rowNamesExpectedChild(forwarded),
        approvalRequestMatchesApprovalChild: rowNamesExpectedChild(approvalRequest),
        forwardedAndRequestSameChild: rowNamesExpectedChild(forwarded) && rowNamesExpectedChild(approvalRequest),
        approvalRequestStillVisible: Boolean(approvalRequest),
        approvalRequestActionsRemoved: approvalActionButtons.length === 0,
        parentStillBlockedAfterForward: text.includes("Waiting on child") && text.includes("Required all"),
        childRowDataMatchesApprovalChild: Boolean(
          review?.childRunId === expected.childRunId &&
          review?.childThreadId === expected.childThreadId &&
          (review.text.includes(expected.canonicalTaskPath) || review.titleText.includes(expected.canonicalTaskPath)),
        ),
        childRowStillBlocksApprovalChild: Boolean(
          review?.childRunId === expected.childRunId &&
          review?.childThreadId === expected.childThreadId &&
          (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering")),
        ),
        siblingStillVisible: Boolean(summarizer?.text.includes("Context summarizer") && summarizer.text.includes("Completed")),
        waitBarrierStillVisible: text.includes("Waiting on child") && text.includes("Ask user on failure"),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        mailboxRows,
        childRows,
      };
    },
    input,
  );
}

export async function inspectRestartRehydration(
  cdp: CdpClient,
  input: {
    approvalId: string;
    childRunId: string;
    childThreadId: string;
    workflowTaskId: string;
    workflowArtifactId: string;
    workflowRunId: string;
    workflowThreadId: string;
    mutatingWorkflowTaskId: string;
    mutatingWorkflowArtifactId: string;
    mutatingWorkflowRunId: string;
    workflowHighLoadTaskIds: string[];
    workflowHighLoadArtifactIds: string[];
    workflowHighLoadRunIds: string[];
    workflowHighLoadPatternLabels: string[];
    defaultCollapsedAfterRelaunch: boolean;
    approvalDecisionLabel?: "Approved" | "Denied";
    summarizerAssistantText?: string;
  },
) {
  return evaluate(
    cdp,
    (expected) => {
      const cluster = document.querySelector(".subagent-parent-cluster") as HTMLElement | null;
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const mailboxRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-mailbox > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const childRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const workflowRows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-workflows > div") ?? [])]
        .filter((row) => row.offsetParent !== null)
        .map((row) => ({
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
        }));
      const graphSection = cluster?.querySelector<HTMLElement>(".subagent-parent-cluster-pattern-graphs");
      const graphPanels = [...(graphSection?.querySelectorAll<HTMLElement>(".subagent-pattern-graph") ?? [])]
        .filter((panel) => panel.offsetParent !== null)
        .map((panel) => ({
          ariaLabel: panel.getAttribute("aria-label") ?? "",
          text: panel.textContent ?? "",
        }));
      const graphNodes = [...(graphSection?.querySelectorAll<SVGGElement>(".subagent-pattern-graph-node") ?? [])].map((node) => ({
        ariaLabel: node.getAttribute("aria-label") ?? "",
        childRunId: node.dataset.childRunId ?? "",
        childThreadId: node.dataset.childThreadId ?? "",
        workflowTaskId: node.dataset.workflowTaskId ?? "",
        workflowRunId: node.dataset.workflowRunId ?? "",
      }));
      const forwarded = mailboxRows.find((row) => row.text.includes("Approval forwarded"));
      const approvalRequest = mailboxRows.find((row) => row.text.includes("Approval requested"));
      const workflowBlock = mailboxRows.find(
        (row) => row.text.includes("Workflow blocked") || row.titleText.includes(expected.workflowTaskId),
      );
      const review = childRows.find((row) => row.text.includes("Review worker"));
      const summarizer = childRows.find((row) => row.text.includes("Context summarizer"));
      const workflow = workflowRows.find(
        (row) => row.text.includes("Symphony Map-Reduce") || row.titleText.includes("Symphony Map-Reduce"),
      );
      const mutatingWorkflow = workflowRows.find(
        (row) =>
          row.text.includes("Symphony Self-Healing Loop") ||
          row.titleText.includes(expected.mutatingWorkflowArtifactId) ||
          row.titleText.includes(expected.mutatingWorkflowTaskId),
      );
      const workflowText = `${workflow?.text ?? ""}\n${workflow?.titleText ?? ""}`;
      const mutatingWorkflowText = `${mutatingWorkflow?.text ?? ""}\n${mutatingWorkflow?.titleText ?? ""}`;
      const workflowBlockText = `${workflowBlock?.text ?? ""}\n${workflowBlock?.titleText ?? ""}`;
      const approvalActionButtons = [
        ...(cluster?.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-mailbox-action.is-button") ?? []),
      ].filter((button) => ["Approve child", "Deny child"].includes(button.innerText.trim()));
      const criticalElements = [
        ...(cluster?.querySelectorAll<HTMLElement>(
          [
            "summary",
            ".subagent-parent-cluster-child-row",
            ".subagent-parent-cluster-barriers > div",
            ".subagent-parent-cluster-workflows > div",
            ".subagent-parent-cluster-workflow-action",
            ".subagent-parent-cluster-mailbox > div",
            ".subagent-parent-cluster-mailbox-action.is-button",
            ".subagent-parent-cluster-child-action",
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
      return {
        defaultCollapsedAfterRelaunch: expected.defaultCollapsedAfterRelaunch,
        expandedAfterRelaunch: Boolean(cluster?.hasAttribute("open")),
        parentMessageVisible: text.includes("Ambient is coordinating a parent task while required child work stays visible."),
        approvalForwardedRehydrated: Boolean(
          forwarded?.text.includes("Approval forwarded") &&
          forwarded.text.includes(expected.approvalDecisionLabel) &&
          forwarded.text.includes(expected.approvalId),
        ),
        approvalRequestRehydrated: Boolean(
          approvalRequest?.text.includes("Approval requested") &&
          approvalRequest.text.includes("Allow workspace write") &&
          approvalRequest.text.includes("workspace.write"),
        ),
        approvalActionsStillRemoved: approvalActionButtons.length === 0,
        parentStillBlockedAfterRelaunch: text.includes("Waiting on child") && text.includes("Required all"),
        childBlockerRehydrated: Boolean(
          review && (review.text.includes("Blocking: needs steering") || review.titleText.includes("Blocking: needs steering")),
        ),
        childRunIdRehydrated: text.includes(expected.childRunId) || titledText.includes(expected.childRunId),
        childThreadIdRehydrated: text.includes(expected.childThreadId) || titledText.includes(expected.childThreadId),
        completedChildResultSummaryRehydrated: Boolean(
          summarizer?.text.includes("Context summarizer") &&
          (summarizer.text.includes("Background context summary is available.") ||
            summarizer.text.includes(expected.summarizerAssistantText)) &&
          summarizer.text.includes("Completed"),
        ),
        workflowTaskRehydrated: workflowText.includes("Symphony Map-Reduce") && workflowText.includes("Running"),
        workflowBlockerRehydrated: workflowText.includes("Blocking: workflow work"),
        workflowMailboxBlockRehydrated: workflowBlockText.includes("Workflow blocked") && workflowBlockText.includes("1 blocking workflow"),
        workflowArtifactRehydrated: text.includes(expected.workflowArtifactId) || titledText.includes(expected.workflowArtifactId),
        workflowRunRehydrated: text.includes(expected.workflowRunId) || titledText.includes(expected.workflowRunId),
        workflowThreadRehydrated: text.includes(expected.workflowThreadId) || titledText.includes(expected.workflowThreadId),
        mutatingWorkflowTaskRehydrated:
          mutatingWorkflowText.includes("Symphony Self-Healing Loop") &&
          mutatingWorkflowText.includes("Succeeded") &&
          mutatingWorkflowText.includes("Mutating child worker"),
        mutatingWorkflowArtifactRehydrated:
          text.includes(expected.mutatingWorkflowArtifactId) || titledText.includes(expected.mutatingWorkflowArtifactId),
        mutatingWorkflowRunRehydrated: text.includes(expected.mutatingWorkflowRunId) || titledText.includes(expected.mutatingWorkflowRunId),
        workflowHighLoadTasksRehydrated:
          expected.workflowHighLoadTaskIds.every((id) => text.includes(id) || titledText.includes(id)) &&
          expected.workflowHighLoadPatternLabels.every((label) => text.includes(label) || titledText.includes(label)),
        workflowHighLoadArtifactsRehydrated: expected.workflowHighLoadArtifactIds.every(
          (id) => text.includes(id) || titledText.includes(id),
        ),
        workflowHighLoadRunsRehydrated: expected.workflowHighLoadRunIds.every((id) => text.includes(id) || titledText.includes(id)),
        patternGraphsRehydrated:
          graphPanels.length >= 6 &&
          expected.workflowHighLoadPatternLabels.every((label) =>
            graphPanels.some((panel) => `${panel.ariaLabel}\n${panel.text}`.includes(label.replace("Symphony ", ""))),
          ),
        patternGraphChildBindingRehydrated: graphNodes.some(
          (node) =>
            node.childRunId === expected.childRunId &&
            node.childThreadId === expected.childThreadId &&
            node.ariaLabel.includes("Open Review worker thread from Map-Reduce"),
        ),
        patternGraphRuntimeBindingsRehydrated:
          [expected.workflowTaskId, expected.mutatingWorkflowTaskId, ...expected.workflowHighLoadTaskIds].every((id) =>
            graphNodes.some((node) => node.workflowTaskId === id),
          ) &&
          [expected.workflowRunId, expected.mutatingWorkflowRunId, ...expected.workflowHighLoadRunIds].every((id) =>
            graphNodes.some((node) => node.workflowRunId === id),
          ),
        childRowsRehydrated: childRows.length === 2,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        mailboxRows,
        childRows,
        workflowRows,
      };
    },
    {
      ...input,
      approvalDecisionLabel: input.approvalDecisionLabel ?? "Approved",
      summarizerAssistantText: input.summarizerAssistantText ?? SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT,
    },
  );
}

export async function inspectWorkflowRehydratedNavigation(
  cdp: CdpClient,
  input: {
    workflowTitle: string;
    workflowThreadId: string;
  },
) {
  return evaluate(
    cdp,
    async (expected) => {
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const workspace = document.querySelector<HTMLElement>(".automation-workspace");
      const heading = workspace?.querySelector<HTMLElement>(".automation-workspace-header h1");
      const activeThreadRows = [...document.querySelectorAll<HTMLElement>(".automation-thread-row.active")].map((row) => ({
        text: row.innerText,
        title: row.getAttribute("title") ?? "",
      }));
      const activeThreadRow = activeThreadRows.find(
        (row) => row.text.includes(expected.workflowTitle) || row.title.includes(expected.workflowTitle),
      );
      const legacyPane = document.querySelector<HTMLElement>(".workflow-exploration-live-card.blocked");
      const threadPane = document.querySelector<HTMLElement>(
        ".workflow-build-workspace, .workflow-discovery-layout, .workflow-runs-workspace",
      );
      const navigationErrors = [...document.querySelectorAll<HTMLElement>(".sidebar-error, .panel-status.error")]
        .map((element) => element.innerText)
        .filter(Boolean);
      const desktopApi = (
        window as unknown as {
          ambientDesktop?: {
            listWorkflowAgentFolders?: () => Promise<Array<{ threads?: Array<{ id?: string; title?: string }> }>>;
          };
        }
      ).ambientDesktop;
      const folders = desktopApi?.listWorkflowAgentFolders ? await desktopApi.listWorkflowAgentFolders() : [];
      const linkedThread = folders.flatMap((folder) => folder.threads ?? []).find((thread) => thread.id === expected.workflowThreadId);
      const linkedThreadSummary = linkedThread
        ? {
            id: linkedThread.id,
            title: linkedThread.title,
            phase: "phase" in linkedThread ? (linkedThread as { phase?: string }).phase : undefined,
            status: "status" in linkedThread ? (linkedThread as { status?: string }).status : undefined,
            activeArtifactId:
              "activeArtifactId" in linkedThread ? (linkedThread as { activeArtifactId?: string }).activeArtifactId : undefined,
            chatThreadId: "chatThreadId" in linkedThread ? (linkedThread as { chatThreadId?: string }).chatThreadId : undefined,
          }
        : undefined;
      const criticalElements = [
        ...document.querySelectorAll<HTMLElement>(
          [
            ".automation-workspace-header",
            ".automation-thread-row.active",
            ".workflow-exploration-live-card.blocked",
            ".workflow-build-workspace",
            ".workflow-discovery-layout",
            ".workflow-runs-workspace",
          ].join(","),
        ),
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
      return {
        workflowAutomationPaneVisible: Boolean(workspace),
        workflowThreadHeaderVisible: Boolean(
          heading?.innerText.includes(expected.workflowTitle) || (heading?.getAttribute("title") ?? "").includes(expected.workflowTitle),
        ),
        workflowThreadSidebarSelected: Boolean(activeThreadRow),
        workflowThreadTitleVisible: text.includes(expected.workflowTitle) || titledText.includes(expected.workflowTitle),
        workflowThreadFolderLinkPresent: Boolean(linkedThreadSummary),
        workflowThreadMatchesExpectedId:
          linkedThreadSummary?.id === expected.workflowThreadId && linkedThreadSummary?.title === expected.workflowTitle,
        legacyOrThreadPaneVisible: Boolean((legacyPane && legacyPane.innerText.includes(expected.workflowTitle)) || threadPane),
        navigationErrorAbsent: navigationErrors.length === 0,
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        activeThreadRows,
        linkedThread: linkedThreadSummary,
        navigationErrors,
      };
    },
    input,
  );
}

export async function inspectWorkflowArtifactRehydration(
  cdp: CdpClient,
  input: {
    workflowTitle: string;
    workflowArtifactId: string;
    workflowRunId: string;
    workflowThreadId: string;
    sourceRelativePath: string;
    stateRelativePath: string;
    sourceContent: string;
  },
) {
  return evaluate(
    cdp,
    async (expected) => {
      const text = document.body.innerText;
      const titledText = [...document.querySelectorAll<HTMLElement>("[title]")]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n");
      const workspace = document.querySelector<HTMLElement>(".automation-workspace");
      const buildPanel = document.querySelector<HTMLElement>(".workflow-build-panel-body");
      const sourcePanel = document.querySelector<HTMLElement>(".workflow-artifact-source-panel");
      const sourcePanelText = `${sourcePanel?.innerText ?? ""}\n${[...(sourcePanel?.querySelectorAll<HTMLElement>("[title]") ?? [])]
        .map((element) => element.getAttribute("title") ?? "")
        .join("\n")}`;
      const activeThreadRow = [...document.querySelectorAll<HTMLElement>(".automation-thread-row.active")].find(
        (row) => row.innerText.includes(expected.workflowTitle) || (row.getAttribute("title") ?? "").includes(expected.workflowTitle),
      );
      const desktopApi = (
        window as unknown as {
          ambientDesktop?: {
            listWorkflowAgentFolders?: () => Promise<
              Array<{ threads?: Array<{ id?: string; title?: string; activeArtifactId?: string }> }>
            >;
            getWorkflowRunDetail?: (input: { runId: string }) => Promise<{
              artifact?: { id?: string; title?: string; sourcePath?: string; statePath?: string };
              run?: { id?: string };
              sourceContent?: string;
              sourceReadError?: string;
            }>;
          };
        }
      ).ambientDesktop;
      const folders = desktopApi?.listWorkflowAgentFolders ? await desktopApi.listWorkflowAgentFolders() : [];
      const linkedThread = folders.flatMap((folder) => folder.threads ?? []).find((thread) => thread.id === expected.workflowThreadId);
      const detail:
        | {
            artifact?: { id?: string; title?: string; sourcePath?: string; statePath?: string };
            run?: { id?: string };
            sourceContent?: string;
            sourceReadError?: string;
          }
        | undefined = desktopApi?.getWorkflowRunDetail
        ? await desktopApi.getWorkflowRunDetail({ runId: expected.workflowRunId }).catch((error: unknown) => ({
            sourceReadError: error instanceof Error ? error.message : String(error),
          }))
        : undefined;
      const allText = `${text}\n${titledText}\n${sourcePanelText}`;
      const criticalElements = [
        ...document.querySelectorAll<HTMLElement>(
          [
            ".automation-workspace-header",
            ".automation-thread-row.active",
            ".workflow-build-rail",
            ".workflow-build-panel-body",
            ".workflow-artifact-source-panel",
            ".workflow-artifact-paths",
            ".workflow-artifact-source-panel pre",
          ].join(","),
        ),
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
      return {
        workflowBuildWorkspaceVisible: Boolean(
          workspace?.querySelector(".workflow-build-workspace") || document.querySelector(".workflow-build-workspace"),
        ),
        sourcePanelSelected:
          buildPanel?.getAttribute("data-workflow-build-panel") === "build-source" &&
          buildPanel.getAttribute("data-workflow-artifact-panel") === "source",
        artifactTitleVisible: allText.includes(expected.workflowTitle),
        activeWorkflowThreadVisible: Boolean(activeThreadRow),
        artifactIdMatchesLinkedThread: linkedThread?.activeArtifactId === expected.workflowArtifactId,
        runDetailLoaded: detail?.run?.id === expected.workflowRunId && detail?.artifact?.id === expected.workflowArtifactId,
        sourcePathVisible: allText.includes(expected.sourceRelativePath),
        statePathVisible: allText.includes(expected.stateRelativePath),
        sourceContentVisible: sourcePanelText.includes(expected.sourceContent.trim()),
        sourceContentMatchesExpected: detail?.sourceContent === expected.sourceContent,
        noSourceReadError: !sourcePanelText.includes("Read error") && !detail?.sourceReadError,
        detailSourcePathMatches: Boolean(detail?.artifact?.sourcePath?.includes(expected.sourceRelativePath)),
        detailStatePathMatches: Boolean(detail?.artifact?.statePath?.includes(expected.stateRelativePath)),
        horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
        criticalOverlapCount,
        linkedThread,
        detail: detail
          ? {
              artifactId: detail.artifact?.id,
              runId: detail.run?.id,
              sourcePath: detail.artifact?.sourcePath,
              statePath: detail.artifact?.statePath,
              sourceReadError: detail.sourceReadError,
            }
          : undefined,
        sourcePanelText: sourcePanelText.slice(0, 2000),
      };
    },
    input,
  );
}

export async function inspectOperatorBehavior(cdp: CdpClient) {
  return evaluate(cdp, () => {
    const clusters = [...document.querySelectorAll<HTMLElement>(".subagent-parent-cluster")].filter(
      (candidate) => candidate.offsetParent !== null,
    );
    const cluster =
      clusters.find((candidate) => candidate.innerText.includes("Review worker") && candidate.innerText.includes("Context summarizer")) ??
      clusters[0];
    const rows = [...(cluster?.querySelectorAll<HTMLElement>(".subagent-parent-cluster-child-row") ?? [])]
      .filter((row) => row.offsetParent !== null)
      .map((row) => {
        const actions = [...row.querySelectorAll<HTMLButtonElement>(".subagent-parent-cluster-child-action")];
        return {
          text: row.innerText,
          titleText: [...row.querySelectorAll<HTMLElement>("[title]")].map((element) => element.getAttribute("title") ?? "").join("\n"),
          cancelActions: actions.filter((button) => button.getAttribute("aria-label")?.startsWith("Cancel sub-agent ")).length,
          closeActions: actions.filter((button) => button.getAttribute("aria-label")?.startsWith("Close sub-agent ")).length,
        };
      });
    const review = rows.find((row) => row.text.includes("Review worker"));
    const summarizer = rows.find((row) => row.text.includes("Context summarizer"));
    const clusterTitleText = [...(cluster?.querySelectorAll<HTMLElement>("[title]") ?? [])]
      .map((element) => element.getAttribute("title") ?? "")
      .join("\n");
    const text = [
      cluster?.innerText ?? "",
      clusterTitleText,
      rows.map((row) => `${row.text}\n${row.titleText}`).join("\n"),
      document.body.innerText,
    ].join("\n");
    const criticalElements = [
      ...(cluster?.querySelectorAll<HTMLElement>(
        [
          ".subagent-parent-cluster-child-row",
          ".subagent-parent-cluster-barriers > div",
          ".subagent-parent-cluster-mailbox > div",
          ".subagent-parent-cluster-child-action",
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
    return {
      completedChildClosed: Boolean(summarizer?.text.includes("Closed")),
      completedChildStillVisible: Boolean(summarizer?.text.includes("Context summarizer")),
      completedChildControlsReleased: summarizer ? summarizer.cancelActions === 0 && summarizer.closeActions === 0 : false,
      attentionChildCancelled: Boolean(review?.text.includes("Cancelled")),
      attentionChildStillVisible: Boolean(review?.text.includes("Review worker")),
      attentionCancelControlRemoved: review ? review.cancelActions === 0 : false,
      siblingStatePreserved: Boolean(review?.text.includes("Cancelled") && summarizer?.text.includes("Closed")),
      lifecycleInterruptionVisible:
        text.includes("Child interrupted") &&
        text.includes("Cancelled") &&
        (text.includes("root/0:reviewer") || rows.some((row) => row.titleText.includes("root/0:reviewer"))),
      typedBarrierConsequenceVisible:
        text.includes("1 wait barrier cancelled") && (text.includes("Child interrupted") || text.includes("Cancelled")),
      rowsStillInspectable: rows.length === 2,
      horizontalOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 2,
      criticalOverlapCount,
      rowSummaries: rows,
    };
  });
}
