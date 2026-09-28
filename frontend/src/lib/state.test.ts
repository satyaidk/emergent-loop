import { describe, expect, it } from "vitest";
import { reducer, shortTermHistory, titleFrom } from "./state";
import { emptyState } from "./storage";
import type { Message, PersistedState } from "./types";

const user = (id: string, content: string): Message => ({ id, role: "user", content, createdAt: 1 });
const reply = (id: string, content: string, status: Message["status"] = "done"): Message => ({
  id,
  role: "assistant",
  content,
  createdAt: 1,
  status,
});

function withOneChat(): PersistedState {
  return reducer(emptyState(), {
    type: "sendMessage",
    conversationId: "c1",
    title: "Recursion",
    userMessage: user("u1", "What is recursion?"),
    pendingReply: reply("r1", "", "pending"),
    now: 100,
  });
}

describe("reducer", () => {
  it("creates a chat on the first message and makes it active", () => {
    const state = withOneChat();

    expect(state.activeId).toBe("c1");
    expect(state.conversations[0].title).toBe("Recursion");
    expect(state.conversations[0].messages.map((m) => m.id)).toEqual(["u1", "r1"]);
  });

  it("adds later messages to the same chat and moves it to the top", () => {
    let state = withOneChat();
    state = reducer(state, {
      type: "sendMessage",
      conversationId: "c2",
      title: "Lists",
      userMessage: user("u2", "Lists?"),
      pendingReply: reply("r2", "", "pending"),
      now: 200,
    });
    state = reducer(state, {
      type: "sendMessage",
      conversationId: "c1",
      title: "ignored for an existing chat",
      userMessage: user("u3", "And a base case?"),
      pendingReply: reply("r3", "", "pending"),
      now: 300,
    });

    expect(state.conversations.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(state.conversations[0].title).toBe("Recursion");
    expect(state.conversations[0].messages).toHaveLength(4);
  });

  it("fills in a pending reply", () => {
    const state = reducer(withOneChat(), {
      type: "updateMessage",
      conversationId: "c1",
      messageId: "r1",
      patch: { status: "done", content: "A function that calls itself." },
    });

    expect(state.conversations[0].messages[1]).toMatchObject({ status: "done", content: "A function that calls itself." });
  });

  it("deleting the active chat returns to a new chat", () => {
    const state = reducer(withOneChat(), { type: "deleteChat", id: "c1" });

    expect(state.conversations).toEqual([]);
    expect(state.activeId).toBeNull();
  });

  it("ignores a blank rename", () => {
    const state = reducer(withOneChat(), { type: "renameChat", id: "c1", title: "   " });

    expect(state.conversations[0].title).toBe("Recursion");
  });

  it("merges settings instead of replacing them", () => {
    const state = reducer(emptyState(), { type: "updateSettings", patch: { theme: "dark" } });

    expect(state.settings.theme).toBe("dark");
    expect(state.settings.useMemory).toBe(true);
  });
});

describe("titleFrom", () => {
  it("uses the first question, on one line, shortened", () => {
    expect(titleFrom("  How do\n loops   work? ")).toBe("How do loops work?");
    expect(titleFrom("a".repeat(60))).toHaveLength(48);
    expect(titleFrom("a".repeat(60)).endsWith("…")).toBe(true);
  });
});

describe("shortTermHistory", () => {
  const chat = [
    user("u1", "one"),
    reply("r1", "first answer"),
    user("u2", "two"),
    reply("r2", "", "error"),
    user("u3", "three"),
    reply("r3", "third answer"),
  ];

  it("keeps finished turns only and never starts with the tutor", () => {
    expect(shortTermHistory(chat, 12)).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "two" },
      { role: "user", content: "three" },
      { role: "assistant", content: "third answer" },
    ]);
    expect(shortTermHistory(chat, 4)[0].role).toBe("user");
  });

  it("sends nothing when the limit is 0", () => {
    expect(shortTermHistory(chat, 0)).toEqual([]);
  });
});
