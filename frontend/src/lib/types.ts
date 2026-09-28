// Shapes shared across the app. The API types mirror app/schemas.py on the server.

export type Role = "user" | "assistant";

/** One fact Hindsight stored about the learner (server: MemoryOut). */
export interface MemoryNote {
  text: string;
  type: string | null;
  occurred_at: string | null;
}

/** pending: waiting for the tutor · done: answered · error: the request failed · stopped: the learner pressed Stop */
export type MessageStatus = "pending" | "done" | "error" | "stopped";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  // The fields below only apply to the tutor's replies.
  status?: MessageStatus;
  error?: string;
  memories?: MemoryNote[];
  memoryAvailable?: boolean;
  elapsedMs?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export type Theme = "system" | "light" | "dark";
export type TextSize = "small" | "default" | "large";

export interface Settings {
  name: string;
  learnerId: string;
  theme: Theme;
  textSize: TextSize;
  enterToSend: boolean;
  useMemory: boolean;
  showMemories: boolean;
  /** How many recent messages of the current chat go along with each question (short-term memory). */
  historyLength: number;
}

/** Everything saved in the browser. `version` lets a future release migrate old data. */
export interface PersistedState {
  version: 1;
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
}

// ---- API responses ----

export interface ChatResponse {
  reply: string;
  memories_used: MemoryNote[];
  memory_available: boolean;
}

export interface Health {
  status: "ok" | "degraded";
  memory: boolean;
}

export interface AppInfo {
  version: string;
  model: string;
  max_history_messages: number;
}

export interface ProgressReport {
  summary: string;
  strengths: string[];
  struggles: string[];
  next_topics: string[];
}
