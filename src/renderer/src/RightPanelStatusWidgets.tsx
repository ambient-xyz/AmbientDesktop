import { Info } from "lucide-react";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";

import type { PermissionGrantRegistryModel } from "./permissionGrantRegistryUiModel";
import { clampNumber } from "./RightPanelRichText";

export function InfoTooltip({
  label,
  text,
  className = "",
}: {
  label?: string;
  text: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const placeBubble = () => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const triggerRect = trigger.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const margin = 16;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bubbleWidth = Math.min(bubbleRect.width || 330, Math.max(120, viewportWidth - margin * 2));
    const bubbleHeight = bubbleRect.height || 48;
    const preferRightAligned = className.includes("heading-info-tooltip");
    const desiredLeft = preferRightAligned ? triggerRect.right - bubbleWidth : triggerRect.left;
    const left = clampNumber(desiredLeft, margin, Math.max(margin, viewportWidth - bubbleWidth - margin));
    const belowTop = triggerRect.bottom + gap;
    const aboveTop = triggerRect.top - bubbleHeight - gap;
    const top =
      belowTop + bubbleHeight <= viewportHeight - margin
        ? belowTop
        : aboveTop >= margin
          ? aboveTop
          : clampNumber(belowTop, margin, Math.max(margin, viewportHeight - bubbleHeight - margin));
    setBubbleStyle({ left, top, maxWidth: `calc(100vw - ${margin * 2}px)` });
  };
  return (
    <span className={`info-tooltip-wrap ${className}`} onMouseEnter={placeBubble} onFocus={placeBubble}>
      <button
        ref={triggerRef}
        type="button"
        className={`info-tooltip-trigger ${label ? "link" : "icon-only"}`}
        title={text}
        aria-label={label ? `${label}: ${text}` : text}
        onFocus={placeBubble}
        onMouseEnter={placeBubble}
      >
        <Info size={13} />
        {label && <span>{label}</span>}
      </button>
      <span ref={bubbleRef} className="info-tooltip-bubble" role="tooltip" style={bubbleStyle}>
        {text}
      </span>
    </span>
  );
}

export function PermissionFullAccessReceiptList({
  receipts,
  limit = 6,
}: {
  receipts: PermissionGrantRegistryModel["fullAccessReceipts"];
  limit?: number;
}) {
  if (!receipts.length) return null;
  const visibleReceipts = receipts.slice(0, limit);
  const hiddenCount = Math.max(0, receipts.length - visibleReceipts.length);
  return (
    <div className="permission-grant-scope review full-access-receipts">
      <div className="permission-grant-scope-header">
        <div>
          <strong>Full Access audit receipts</strong>
          <span>
            {receipts.length} allowed bypass{receipts.length === 1 ? "" : "es"} recorded without creating persistent grants
          </span>
        </div>
      </div>
      {visibleReceipts.map((receipt) => (
        <div className="permission-log-row allowed permission-grant-registry-row" key={receipt.id}>
          <div>
            <strong>{receipt.toolLabel}</strong>
            <span>{receipt.riskLabel}</span>
          </div>
          <small>
            Full Access · {receipt.createdLabel} · {receipt.reasonLabel}
          </small>
          {receipt.detailLabel && <code title={receipt.detailLabel}>{receipt.detailLabel}</code>}
        </div>
      ))}
      {hiddenCount > 0 && <p className="panel-note">{hiddenCount} older Full Access receipt{hiddenCount === 1 ? "" : "s"} hidden.</p>}
    </div>
  );
}
