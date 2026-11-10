import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "@/app/types/Service";

interface AuthState {
  user: User | null;
  status: "loading" | "authenticated" | "anonymous" | "error";
  error: string | null;
}

const initialState: AuthState = { user: null, status: "loading", error: null };
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.status = "authenticated";
      state.error = null;
    },
    clearUser: (state) => {
      state.user = null;
      state.status = "anonymous";
      state.error = null;
    },
    authError: (state, action: PayloadAction<string>) => {
      state.user = null;
      state.status = "error";
      state.error = action.payload;
    },
  },
});

export const { setUser, clearUser, authError } = authSlice.actions;
export default authSlice.reducer;
