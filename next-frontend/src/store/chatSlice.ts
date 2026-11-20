import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Conversation } from "@/app/types/Service";

export interface OutgoingMessage {
  id: string;
  role: "user";
  content: string;
  afterId: number | null;
  error?: string;
}

type SendResult =
  | { id: string; conversation: Conversation }
  | { id: string; error: string }
  | { id: string; cancelled: true };

interface ChatState {
  active: Conversation | null;
  input: string;
  pending: string | null;
  outgoing: OutgoingMessage[];
  optimisticKeys: Record<number, string>;
  latestReplyId: number | null;
}

const initialState: ChatState = {
  active: null,
  input: "",
  pending: null,
  outgoing: [],
  optimisticKeys: {},
  latestReplyId: null
};
const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setConversation: (state, action: PayloadAction<Conversation>) => {
      if (state.pending && state.active?.id === action.payload.id) return;
      state.active = action.payload;
      state.pending = null;
      state.outgoing = [];
      state.optimisticKeys = {};
      state.latestReplyId = null;
    },
    setInput: (state, action: PayloadAction<string>) => {
      state.input = action.payload;
    },
    startSend: (state, action: PayloadAction<{ id: string; content: string }>) => {
      if (state.pending) return;
      const { id, content } = action.payload;
      const afterId = state.active?.messages.at(-1)?.id ?? null;
      const last = state.outgoing.at(-1);
      if (last?.afterId === afterId && last.content === content) last.id = id;
      else state.outgoing.push({ id, role: "user", content, afterId });
      state.pending = id;
      if (state.input.trim() === content) state.input = "";
    },
    finishSend: (state, action: PayloadAction<SendResult>) => {
      const result = action.payload;
      const message = state.outgoing.at(-1);
      if (state.pending !== result.id || message?.id !== result.id) return;
      state.pending = null;
      if ("conversation" in result) {
        const { conversation } = result;
        // Keep live estimates from earlier replies when the server returns saved history.
        const previousMessages = new Map(
          state.active?.id === conversation.id
            ? state.active.messages.map((item) => [item.id, item])
            : []
        );
        const sent = conversation.messages.at(-2);
        const reply = conversation.messages.at(-1);
        if (sent?.role === "user" && sent.content === message.content && !previousMessages.has(sent.id)) {
          state.optimisticKeys[sent.id] = message.id;
        }
        state.latestReplyId = reply?.role === "assistant" ? reply.id : null;
        state.active = {
          ...conversation,
          messages: conversation.messages.map((item) => previousMessages.get(item.id) || item)
        };
        state.outgoing.pop();
        return;
      }
      if ("error" in result) message.error = result.error;
      if (!message.error) state.outgoing.pop();
      if (!state.input) state.input = message.content;
    },
    conversationDeleted: (state, action: PayloadAction<number>) => {
      if (state.active?.id === action.payload) return initialState;
    },
    resetChat: () => initialState
  }
});

export const {
  setConversation,
  setInput,
  startSend,
  finishSend,
  conversationDeleted,
  resetChat
} = chatSlice.actions;
export default chatSlice.reducer;
