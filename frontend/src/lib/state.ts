// All changes to the app's data go through this reducer: one function that takes the current
// state and an action, and returns the next state. Keeping it pure (no fetch, no storage)
// makes every change easy to follow and to unit-test.

import { mergeConversations } from "./storage";
import type { Conversation, Message, PersistedState, Settings, StarterCache } from "./types";

export type Action =
  | { type: "newChat" }
  | { type: "selectChat"; id: string }
  | { type: "renameChat"; id: string; title: string }
  | { type: "deleteChat"; id: string }
  | { type: "deleteAllChats" }
  | { type: "importChats"; conversations: Conversation[] }
  | {
      type: "sendMessage";
      conversationId: string;
      title: string;
      userMessage: Message;
      pendingReply: Message;
      now: number;
    }
  | { type: "updateMessage"; conversationId: string; messageId: string; patch: Partial<Message> }
  | { type: "setSuggestions"; conversationId: string; suggestions: string[] }
  | { type: "setStarters"; starters: StarterCache }
  | { type: "updateSettings"; patch: Partial<Settings> };

export function reducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case "newChat":
      // A chat is only created when its first message is sent, like other chat apps.
      return { ...state, activeId: null };

    case "selectChat":
      return { ...state, activeId: action.id };

    case "renameChat": {
      const title = action.title.trim();
      if (!title) return state;
      return updateConversation(state, action.id, (c) => ({ ...c, title }));
    }

    case "deleteChat":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.id),
        activeId: state.activeId === action.id ? null : state.activeId,
      };

    case "deleteAllChats":
      return { ...state, conversations: [], activeId: null };

    case "importChats":
      return { ...state, conversations: mergeConversations(state.conversations, action.conversations) };

    case "sendMessage": {
      const { conversationId, userMessage, pendingReply, now } = action;
      const existing = state.conversations.find((c) => c.id === conversationId);
      const conversation: Conversation = existing
        ? // The old follow-ups were about the previous reply; new ones arrive with the next answer.
          { ...existing, messages: [...existing.messages, userMessage, pendingReply], updatedAt: now, suggestions: [] }
        : {
            id: conversationId,
            title: action.title,
            createdAt: now,
            updatedAt: now,
            messages: [userMessage, pendingReply],
            suggestions: [],
          };
      // The chat with the newest message moves to the top of the list.
      const others = state.conversations.filter((c) => c.id !== conversationId);
      return { ...state, conversations: [conversation, ...others], activeId: conversationId };
    }

    case "updateMessage":
      return updateConversation(state, action.conversationId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === action.messageId ? { ...m, ...action.patch } : m)),
      }));

    case "setSuggestions":
      return updateConversation(state, action.conversationId, (c) => ({ ...c, suggestions: action.suggestions }));

    case "setStarters":
      return { ...state, starters: action.starters };

    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}

function updateConversation(
  state: PersistedState,
  id: string,
  change: (conversation: Conversation) => Conversation,
): PersistedState {
  return { ...state, conversations: state.conversations.map((c) => (c.id === id ? change(c) : c)) };
}

/** A chat's title is its first question, shortened, until the learner renames it. */
export function titleFrom(text: string, maxLength = 48): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Unique id for chats and messages. randomUUID only exists on https and localhost, hence the fallback. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** How much a learner has learned so far, measured in answered questions across all chats. */
export function learningExperience(conversations: Conversation[]): number {
  return conversations.reduce(
    (total, c) => total + c.messages.filter((m) => m.role === "assistant" && m.status === "done").length,
    0,
  );
}

/** The server rejects longer history turns (schemas.py: Turn.content max_length). */
const MAX_TURN_CHARS = 8000;

/** The recent part of this chat that goes along with a question: finished turns only, newest last. */
export function shortTermHistory(messages: Message[], limit: number): { role: Message["role"]; content: string }[] {
  const turns = messages
    .filter((m) => m.role === "user" || m.status === "done")
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TURN_CHARS) }));
  const recent = limit > 0 ? turns.slice(-limit) : [];
  while (recent.length && recent[0].role !== "user") recent.shift(); // a history starts with the learner
  return recent;
}
