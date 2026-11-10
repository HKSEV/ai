import { configureStore } from "@reduxjs/toolkit";
import auth from "./authSlice";
import chat from "./chatSlice";

export function makeStore() {
  return configureStore({ reducer: { auth, chat } });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
