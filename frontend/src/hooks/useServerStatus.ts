import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AppInfo, Health } from "../lib/types";

export interface ServerStatus {
  /** null until the first check finishes */
  reachable: boolean | null;
  health: Health | null;
  info: AppInfo | null;
  refresh: () => void;
}

const CHECK_EVERY_MS = 30_000;

/** Checks the server and its memory service now, every 30 seconds, and when the tab regains focus. */
export function useServerStatus(): ServerStatus {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);

  const refresh = useCallback(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setReachable(true);
      })
      .catch(() => {
        setHealth(null);
        setReachable(false);
      });
    api
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { reachable, health, info, refresh };
}
