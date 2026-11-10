"use client";

import { useEffect, useReducer, useState } from "react";
import { api, errorMessage } from "./api";

export default function useApiQuery<T>(path: string | null) {
  const [version, reload] = useReducer((value: number) => value + 1, 0);
  const key = path + ":" + version;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch((error) => { if (!controller.signal.aborted) setResult({ key, error: errorMessage(error) }); });
    return () => controller.abort();
  }, [path, key]);
  return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined, loading: !!path && result.key !== key, reload };
}
