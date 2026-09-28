// Saving chats and settings in the browser (localStorage).
//
// There is no database for chats on purpose: they live in this browser until the learner
// deletes them or clears their browser data. Long-term memory is different: it lives in
// Hindsight on the server, so it survives a cleared browser.

import type { Conversation, PersistedState, Settings } from "./types";

export const STORAGE_KEY = "learnloop.state.v1";

/** Browsers allow roughly 5 MB per site. Used only to show "how full" in Settings. */
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;

/** Must match USER_ID_PATTERN in app/schemas.py. */
export const LEARNER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/;

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  learnerId: "demo-student",
  theme: "system",
  textSize: "default",
  enterToSend: true,
  useMemory: true,
  showMemories: true,
  historyLength: 12,
};

export function emptyState(): PersistedState {
  return { version: 1, conversations: [], activeId: null, settings: { ...DEFAULT_SETTINGS } };
}

/** Reads saved state. Anything missing, corrupt or from an unknown version falls back to defaults. */
export function loadState(storage: Storage | undefined = safeLocalStorage()): PersistedState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.conversations)) return emptyState();

    const conversations = parsed.conversations.filter(isConversation).map(settleInterrupted);
    const activeId = conversations.some((c) => c.id === parsed.activeId) ? (parsed.activeId ?? null) : null;
    return { version: 1, conversations, activeId, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
  } catch {
    return emptyState();
  }
}

/** Saves state. Returns an error message when the browser refuses (for example, storage is full). */
export function saveState(state: PersistedState, storage: Storage | undefined = safeLocalStorage()): string | null {
  if (!storage) return "This browser isn't letting LearnLoop save chats (private mode or blocked storage).";
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "Browser storage is full, so new messages aren't being saved. Export or delete some old chats.";
  }
}

/** Approximate bytes used: browsers store strings as UTF-16, so 2 bytes per character. */
export function storageBytes(state: PersistedState): number {
  return JSON.stringify(state).length * 2;
}

// ---- export / import ----

export interface ChatExport {
  app: "learnloop";
  version: 1;
  exportedAt: string;
  conversations: Conversation[];
}

export function exportChats(conversations: Conversation[], now = new Date()): ChatExport {
  return { app: "learnloop", version: 1, exportedAt: now.toISOString(), conversations };
}

/** Parses an exported file. Throws an Error with a readable message if the file isn't one. */
export function parseChatExport(text: string): Conversation[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const file = data as Partial<ChatExport>;
  if (file.app !== "learnloop" || !Array.isArray(file.conversations)) {
    throw new Error("That file isn't a LearnLoop chat export.");
  }
  return file.conversations.filter(isConversation).map(settleInterrupted);
}

/** Adds imported chats, skipping any already present (same id). Newest first. */
export function mergeConversations(current: Conversation[], incoming: Conversation[]): Conversation[] {
  const known = new Set(current.map((c) => c.id));
  const added = incoming.filter((c) => !known.has(c.id));
  return [...current, ...added].sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---- helpers ----

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // some privacy modes throw just for touching localStorage
  }
}

function isConversation(value: unknown): value is Conversation {
  const c = value as Conversation;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.updatedAt === "number" &&
    Array.isArray(c.messages)
  );
}

/** A reply still "pending" when the page closed will never arrive: mark it stopped. */
function settleInterrupted(conversation: Conversation): Conversation {
  if (!conversation.messages.some((m) => m.status === "pending")) return conversation;
  return {
    ...conversation,
    messages: conversation.messages.map((m) => (m.status === "pending" ? { ...m, status: "stopped" } : m)),
  };
}
