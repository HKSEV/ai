import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Conversation } from "@/app/types/Service";

const initialState: { active: Conversation | null; input: string; pending: boolean } = { active: null, input: "", pending: false };
const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setConversation: (state, action: PayloadAction<Conversation>) => { state.active = action.payload; },
    setInput: (state, action: PayloadAction<string>) => { state.input = action.payload; },
    setPending: (state, action: PayloadAction<boolean>) => { state.pending = action.payload; },
    conversationDeleted: (state, action: PayloadAction<number>) => {
      if (state.active?.id === action.payload) return initialState;
    },
    resetChat: () => initialState,
  },
});

export const { setConversation, setInput, setPending, conversationDeleted, resetChat } = chatSlice.actions;
export default chatSlice.reducer;
