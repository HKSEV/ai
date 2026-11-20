"use client";

import { useEffect, useReducer, useState } from "react";
import { api, ApiError, errorMessage } from "./api";

export const LIVE_REFRESH_INTERVAL = 15_000;

export default function useApiQuery<T>(path: string | null, refreshInterval = 0) {
  const [version, reload] = useReducer((value: number) => value + 1, 0);
  const key = path + ":" + version;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({
    key: ""
  });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let pending = false;
    const load = async (background = false) => {
      if (pending) return;
      pending = true;
      try {
        const data = await api<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (controller.signal.aborted) return;
        const retryable = error instanceof ApiError &&
          (error.status === 0 || error.status === 429 || error.status >= 500);
        setResult((previous) =>
          background && retryable && previous.key === key && previous.data !== undefined
            ? previous
            : { key, error: errorMessage(error) }
        );
      } finally {
        pending = false;
      }
    };
    void load();
    if (!refreshInterval) return () => controller.abort();
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load(true);
    };
    const interval = window.setInterval(refresh, refreshInterval);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [path, key, refreshInterval]);
  return {
    data: result.key === key ? result.data : undefined,
    error: result.key === key ? result.error : undefined,
    loading: !!path && result.key !== key,
    reload
  };
}
