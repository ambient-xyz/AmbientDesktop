import {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { clampNumber } from "./RightPanelRichText";

export type ProjectBoardTitleTooltip = {
  text: string;
  anchor: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
  left: number;
  top: number;
  arrowLeft: number;
  placement: "above" | "below";
  ready: boolean;
};

export function projectBoardTitleTooltipTrigger(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const trigger = target.closest<HTMLElement>("[data-project-board-tooltip], button[title]");
  if (!trigger) return undefined;
  return (trigger.dataset.projectBoardTooltip ?? trigger.getAttribute("title"))?.trim() ? trigger : undefined;
}

export function projectBoardTitleTooltipAnchor(trigger: HTMLElement): ProjectBoardTitleTooltip["anchor"] {
  const rect = trigger.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function sameProjectBoardTitleTooltipAnchor(
  left: ProjectBoardTitleTooltip["anchor"],
  right: ProjectBoardTitleTooltip["anchor"],
): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
}

export function useProjectBoardWorkspaceTitleTooltip() {
  const [titleTooltip, setTitleTooltip] = useState<ProjectBoardTitleTooltip | undefined>();
  const projectBoardWorkspaceRef = useRef<HTMLElement>(null);
  const titleTooltipRef = useRef<HTMLDivElement>(null);

  const showProjectBoardTitleTooltip = useCallback((target: EventTarget | null) => {
    const button = projectBoardTitleTooltipTrigger(target);
    if (!button) return;
    const text = (button.dataset.projectBoardTooltip ?? button.getAttribute("title"))?.trim();
    if (!text) return;
    const anchor = projectBoardTitleTooltipAnchor(button);
    setTitleTooltip((current) =>
      current?.text === text && sameProjectBoardTitleTooltipAnchor(current.anchor, anchor)
        ? current
        : {
            text,
            anchor,
            left: anchor.left,
            top: anchor.bottom + 10,
            arrowLeft: Math.max(12, Math.min(anchor.width / 2, 320)),
            placement: "below",
            ready: false,
          },
    );
  }, []);

  const hideProjectBoardTitleTooltip = useCallback(() => setTitleTooltip(undefined), []);

  const handleProjectBoardTooltipMouseOver = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    showProjectBoardTitleTooltip(event.target);
  }, [showProjectBoardTitleTooltip]);

  const handleProjectBoardTooltipMouseOut = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const nextButton = projectBoardTitleTooltipTrigger(event.relatedTarget);
    const currentButton = projectBoardTitleTooltipTrigger(event.target);
    if (nextButton && nextButton === currentButton) return;
    if (nextButton) {
      showProjectBoardTitleTooltip(nextButton);
      return;
    }
    hideProjectBoardTitleTooltip();
  }, [hideProjectBoardTitleTooltip, showProjectBoardTitleTooltip]);

  const handleProjectBoardTooltipFocus = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    showProjectBoardTitleTooltip(event.target);
  }, [showProjectBoardTitleTooltip]);

  const handleProjectBoardTooltipBlur = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    const nextButton = projectBoardTitleTooltipTrigger(event.relatedTarget);
    if (nextButton) showProjectBoardTitleTooltip(nextButton);
    else hideProjectBoardTitleTooltip();
  }, [hideProjectBoardTitleTooltip, showProjectBoardTitleTooltip]);

  useLayoutEffect(() => {
    if (!titleTooltip) return;
    const bubble = titleTooltipRef.current;
    if (!bubble) return;
    const margin = 12;
    const gap = 10;
    const bubbleRect = bubble.getBoundingClientRect();
    const bubbleWidth = Math.min(bubbleRect.width || 320, Math.max(120, window.innerWidth - margin * 2));
    const bubbleHeight = bubbleRect.height || 42;
    const triggerCenterX = titleTooltip.anchor.left + titleTooltip.anchor.width / 2;
    const left = clampNumber(triggerCenterX - bubbleWidth / 2, margin, Math.max(margin, window.innerWidth - bubbleWidth - margin));
    const belowTop = titleTooltip.anchor.bottom + gap;
    const aboveTop = titleTooltip.anchor.top - bubbleHeight - gap;
    const placement = belowTop + bubbleHeight <= window.innerHeight - margin || aboveTop < margin ? "below" : "above";
    const top =
      placement === "below"
        ? clampNumber(belowTop, margin, Math.max(margin, window.innerHeight - bubbleHeight - margin))
        : clampNumber(aboveTop, margin, Math.max(margin, window.innerHeight - bubbleHeight - margin));
    const arrowLeft = clampNumber(triggerCenterX - left, 14, Math.max(14, bubbleWidth - 14));
    setTitleTooltip((current) =>
      current && current.text === titleTooltip.text && sameProjectBoardTitleTooltipAnchor(current.anchor, titleTooltip.anchor)
        ? { ...current, left, top, arrowLeft, placement, ready: true }
        : current,
    );
  }, [titleTooltip?.anchor.bottom, titleTooltip?.anchor.height, titleTooltip?.anchor.left, titleTooltip?.anchor.top, titleTooltip?.anchor.width, titleTooltip?.text]);

  useEffect(() => {
    const handleDocumentMouseMove = (event: MouseEvent) => {
      const workspace = projectBoardWorkspaceRef.current;
      if (!workspace) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || !workspace.contains(target)) {
        setTitleTooltip(undefined);
        return;
      }
      const button = projectBoardTitleTooltipTrigger(target);
      if (button && workspace.contains(button)) showProjectBoardTitleTooltip(button);
      else setTitleTooltip(undefined);
    };
    document.addEventListener("mousemove", handleDocumentMouseMove);
    return () => document.removeEventListener("mousemove", handleDocumentMouseMove);
  }, [showProjectBoardTitleTooltip]);

  const titleTooltipNode = titleTooltip ? (
    <div
      ref={titleTooltipRef}
      className={`project-board-title-tooltip ${titleTooltip.ready ? "visible" : ""} placement-${titleTooltip.placement}`}
      role="tooltip"
      style={{
        left: titleTooltip.left,
        top: titleTooltip.top,
        "--project-board-title-tooltip-arrow-left": `${titleTooltip.arrowLeft}px`,
      } as CSSProperties}
    >
      {titleTooltip.text}
    </div>
  ) : undefined;

  return {
    projectBoardWorkspaceRef,
    handleProjectBoardTooltipMouseOver,
    handleProjectBoardTooltipMouseOut,
    handleProjectBoardTooltipFocus,
    handleProjectBoardTooltipBlur,
    hideProjectBoardTitleTooltip,
    titleTooltipNode,
  };
}
