import { useEffect } from "react";
import type { TextSize, Theme } from "../lib/types";

/**
 * Puts the chosen theme and text size on <html> (data-theme, data-text-size), where the CSS
 * variables in global.css pick them up. "system" follows the operating system, live.
 */
export function useTheme(theme: Theme, textSize: TextSize) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = textSize;

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && Boolean(media?.matches));
      root.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (theme !== "system" || !media) return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, textSize]);
}
