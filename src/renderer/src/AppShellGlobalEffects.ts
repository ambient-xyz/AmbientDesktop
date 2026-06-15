import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import { clampSidebarWidth } from "./sidebarLayout";

export function useAppShellGlobalEffects({
  chatFindInputRef,
  contextMenusOpen,
  onCloseContextMenus,
  setChatFindOpen,
  setCommandPaletteOpen,
  setCommandPaletteQuery,
  setSidebarAgeNow,
  setSidebarWidth,
}: {
  chatFindInputRef: RefObject<HTMLInputElement | null>;
  contextMenusOpen: boolean;
  onCloseContextMenus: () => void;
  setChatFindOpen: Dispatch<SetStateAction<boolean>>;
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setCommandPaletteQuery: Dispatch<SetStateAction<string>>;
  setSidebarAgeNow: Dispatch<SetStateAction<number>>;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
}) {
  useEffect(() => {
    const timer = window.setInterval(() => setSidebarAgeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [setSidebarAgeNow]);

  useEffect(() => {
    const onResize = () => setSidebarWidth((width) => clampSidebarWidth(width, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setSidebarWidth]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteQuery("");
        setCommandPaletteOpen(true);
      }
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setChatFindOpen(true);
        window.setTimeout(() => chatFindInputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        setChatFindOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chatFindInputRef, setChatFindOpen, setCommandPaletteOpen, setCommandPaletteQuery]);

  useEffect(() => {
    if (!contextMenusOpen) return;
    const close = () => onCloseContextMenus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenusOpen, onCloseContextMenus]);
}
