"use client";

import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { api, ApiError, errorMessage } from "@/app/lib/api";
import type { User } from "@/app/types/Service";
import { makeStore } from "./store";
import { setUser, clearUser, authError } from "./authSlice";
import { resetChat } from "./chatSlice";

export default function ReduxProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);
  useEffect(() => {
    const controller = new AbortController();
    const expired = () => { store.dispatch(clearUser()); store.dispatch(resetChat()); };
    window.addEventListener("auth:expired", expired);
    api<User>("/api/auth/me", { signal: controller.signal })
      .then((user) => { if (!controller.signal.aborted) store.dispatch(setUser(user)); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) expired();
        else store.dispatch(authError(errorMessage(error)));
      });
    return () => { controller.abort(); window.removeEventListener("auth:expired", expired); };
  }, [store]);
  return <Provider store={store}>{children}</Provider>;
}
