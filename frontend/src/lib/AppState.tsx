// The app's single source of truth. Components read state and call actions from here
// (via useAppState) instead of passing data through many layers of props.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch, ReactNode } from "react";
import { api } from "./api";
import { newId, reducer, shortTermHistory, titleFrom } from "./state";
import type { Action } from "./state";
import { loadState, saveState } from "./storage";
import type { Conversation, Message, PersistedState } from "./types";

interface AppStateValue {
  state: PersistedState;
  dispatch: Dispatch<Action>;
  activeConversation: Conversation | null;
  /** Set when the browser refused to save (storage full, private mode). */
  storageError: string | null;
  send: (text: string) => void;
  retry: (replyId: string) => void;
  stop: (replyId: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children, initialState }: { children: ReactNode; initialState?: PersistedState }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => init ?? loadState());
  const [storageError, setStorageError] = useState<string | null>(null);

  // Actions run in event handlers after render, so they read the latest state from this ref
  // instead of capturing an old copy.
  const stateRef = useRef(state);
  const controllers = useRef(new Map<string, AbortController>());

  // Save every change to the browser. The error (if any) comes back from localStorage itself.
  useEffect(() => {
    stateRef.current = state;
    // oxlint-disable-next-line react/set-state-in-effect -- records the result of writing to localStorage
    setStorageError(saveState(state));
  }, [state]);

  /** Sends one question to the server and fills in the pending reply with the answer. */
  const ask = useCallback(async (conversationId: string, replyId: string, question: string, before: Message[]) => {
    const { settings } = stateRef.current;
    const controller = new AbortController();
    controllers.current.set(replyId, controller);
    const started = Date.now();
    const update = (patch: Partial<Message>) =>
      dispatch({ type: "updateMessage", conversationId, messageId: replyId, patch });

    try {
      const response = await api.chat(
        {
          user_id: settings.learnerId,
          message: question,
          history: shortTermHistory(before, settings.historyLength),
          use_memory: settings.useMemory,
        },
        controller.signal,
      );
      update({
        status: "done",
        content: response.reply,
        memories: response.memories_used,
        memoryAvailable: response.memory_available,
        elapsedMs: Date.now() - started,
        error: undefined,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        update({ status: "stopped", elapsedMs: Date.now() - started });
      } else {
        update({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      controllers.current.delete(replyId);
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question) return;
      const { activeId, conversations } = stateRef.current;
      const conversation = conversations.find((c) => c.id === activeId);
      const conversationId = conversation?.id ?? newId();
      const now = Date.now();
      const userMessage: Message = { id: newId(), role: "user", content: question, createdAt: now };
      const pendingReply: Message = { id: newId(), role: "assistant", content: "", createdAt: now, status: "pending" };

      dispatch({ type: "sendMessage", conversationId, title: titleFrom(question), userMessage, pendingReply, now });
      void ask(conversationId, pendingReply.id, question, conversation?.messages ?? []);
    },
    [ask],
  );

  /** Asks again for a reply that failed, was stopped, or that the learner wants regenerated. */
  const retry = useCallback(
    (replyId: string) => {
      const conversation = stateRef.current.conversations.find((c) => c.messages.some((m) => m.id === replyId));
      if (!conversation) return;
      const index = conversation.messages.findIndex((m) => m.id === replyId);
      const question = conversation.messages[index - 1];
      if (!question || question.role !== "user") return;

      dispatch({
        type: "updateMessage",
        conversationId: conversation.id,
        messageId: replyId,
        patch: { status: "pending", content: "", error: undefined, memories: undefined, createdAt: Date.now() },
      });
      void ask(conversation.id, replyId, question.content, conversation.messages.slice(0, index - 1));
    },
    [ask],
  );

  const stop = useCallback((replyId: string) => controllers.current.get(replyId)?.abort(), []);

  const value = useMemo<AppStateValue>(
    () => ({
      state,
      dispatch,
      activeConversation: state.conversations.find((c) => c.id === state.activeId) ?? null,
      storageError,
      send,
      retry,
      stop,
    }),
    [state, storageError, send, retry, stop],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- the hook belongs with its provider
export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside <AppStateProvider>");
  return value;
}
