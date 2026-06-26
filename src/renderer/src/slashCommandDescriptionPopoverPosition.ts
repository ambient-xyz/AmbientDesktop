export type SlashCommandDescriptionPopoverRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SlashCommandDescriptionPopoverSize = {
  width: number;
  height: number;
};

export type SlashCommandDescriptionPopoverViewport = {
  width: number;
  height: number;
};

export type SlashCommandDescriptionPopoverPosition = {
  left: number;
  top: number;
  width: number;
  placement: "above" | "below";
};

export function slashCommandDescriptionPopoverPosition({
  anchor,
  popover,
  viewport,
  gap = 8,
  margin = 12,
  maxWidth = 360,
}: {
  anchor: SlashCommandDescriptionPopoverRect;
  popover: Pick<SlashCommandDescriptionPopoverSize, "height">;
  viewport: SlashCommandDescriptionPopoverViewport;
  gap?: number;
  margin?: number;
  maxWidth?: number;
}): SlashCommandDescriptionPopoverPosition {
  const width = Math.min(maxWidth, Math.max(0, viewport.width - margin * 2));
  const left = clamp(anchor.left, margin, Math.max(margin, viewport.width - margin - width));
  const aboveSpace = Math.max(0, anchor.top - margin - gap);
  const belowSpace = Math.max(0, viewport.height - margin - anchor.bottom - gap);
  const placement = aboveSpace >= popover.height || aboveSpace >= belowSpace ? "above" : "below";
  const preferredTop = placement === "above" ? anchor.top - gap - popover.height : anchor.bottom + gap;
  const top = clamp(preferredTop, margin, Math.max(margin, viewport.height - margin - popover.height));
  return { left, top, width, placement };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
