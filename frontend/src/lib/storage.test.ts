import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  LEARNER_ID_PATTERN,
  STORAGE_KEY,
  emptyState,
  exportChats,
  loadState,
  mergeConversations,
  parseChatExport,
  saveState,
} from "./storage";
import type { Conversation, PersistedState } from "./types";

const chat = (id: string, updatedAt: number, status?: "pending" | "done"): Conversation => ({
  id,
  title: `Chat ${id}`,
  createdAt: updatedAt,
  updatedAt,
  messages: [
    { id: `${id}-u`, role: "user", content: "hi", createdAt: updatedAt },
    { id: `${id}-r`, role: "assistant", content: "", createdAt: updatedAt, status },
  ],
});

describe("loadState", () => {
  it("starts empty when nothing is saved", () => {
    expect(loadState(localStorage)).toEqual(emptyState());
  });

  it("recovers from corrupt or unknown data instead of crashing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState(localStorage)).toEqual(emptyState());

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, conversations: [] }));
    expect(loadState(localStorage)).toEqual(emptyState());
  });

  it("round-trips through save", () => {
    const state: PersistedState = { ...emptyState(), conversations: [chat("a", 5, "done")], activeId: "a" };
    expect(saveState(state, localStorage)).toBeNull();

    expect(loadState(localStorage)).toEqual(state);
  });

  it("marks a reply that was still pending when the page closed as stopped", () => {
    saveState({ ...emptyState(), conversations: [chat("a", 5, "pending")] }, localStorage);

    expect(loadState(localStorage).conversations[0].messages[1].status).toBe("stopped");
  });

  it("fills in settings added by newer versions of the app", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, conversations: [], activeId: null, settings: { theme: "dark" } }),
    );

    expect(loadState(localStorage).settings).toEqual({ ...DEFAULT_SETTINGS, theme: "dark" });
  });
});

describe("saveState", () => {
  it("explains when the browser refuses to save", () => {
    const full = { setItem: () => { throw new DOMException("full", "QuotaExceededError"); } } as unknown as Storage;

    expect(saveState(emptyState(), full)).toMatch(/storage is full/i);
  });
});

describe("export and import", () => {
  it("imports its own export", () => {
    const file = JSON.stringify(exportChats([chat("a", 1, "done")]));

    expect(parseChatExport(file).map((c) => c.id)).toEqual(["a"]);
  });

  it("rejects files that aren't LearnLoop exports", () => {
    expect(() => parseChatExport("nope")).toThrow("isn't valid JSON");
    expect(() => parseChatExport('{"hello": 1}')).toThrow("isn't a LearnLoop chat export");
  });

  it("skips chats that already exist and sorts newest first", () => {
    const merged = mergeConversations([chat("a", 1)], [chat("a", 1), chat("b", 9)]);

    expect(merged.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("LEARNER_ID_PATTERN", () => {
  it("matches the server's rule", () => {
    for (const ok of ["demo-student", "sam", "a1b2c3"]) expect(LEARNER_ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ["ab", "Sam", "-sam", "../x", "a".repeat(41)]) expect(LEARNER_ID_PATTERN.test(bad)).toBe(false);
  });
});
