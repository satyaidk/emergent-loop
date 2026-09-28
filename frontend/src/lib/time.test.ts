import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, groupByDate, plural } from "./time";
import type { Conversation } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 8, 29, 15, 0).getTime(); // 29 Sep 2026, 3 pm local time

const chat = (id: string, updatedAt: number): Conversation => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  messages: [],
});

describe("groupByDate", () => {
  it("buckets chats the way chat apps do, newest first", () => {
    const groups = groupByDate(
      [chat("old", now - 90 * DAY), chat("today", now - 60_000), chat("yesterday", now - DAY), chat("week", now - 4 * DAY)],
      now,
    );

    expect(groups.map((g) => [g.label, g.conversations.map((c) => c.id)])).toEqual([
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Previous 7 days", ["week"]],
      ["Older", ["old"]],
    ]);
  });
});

describe("formatting", () => {
  it("pluralises counts", () => {
    expect(plural(1, "chat")).toBe("1 chat");
    expect(plural(3, "chat")).toBe("3 chats");
    expect(plural(0, "note")).toBe("0 notes");
  });

  it("formats durations and sizes", () => {
    expect(formatDuration(8_400)).toBe("8s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(12 * 1024)).toBe("12 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
