// Grouping chats by date for the sidebar ("Today", "Yesterday", ...).

import type { Conversation } from "./types";

export interface ChatGroup {
  label: string;
  conversations: Conversation[];
}

const DAY = 24 * 60 * 60 * 1000;

export function groupByDate(conversations: Conversation[], now = Date.now()): ChatGroup[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();

  const buckets: [string, (t: number) => boolean][] = [
    ["Today", (t) => t >= today],
    ["Yesterday", (t) => t >= today - DAY],
    ["Previous 7 days", (t) => t >= today - 7 * DAY],
    ["Previous 30 days", (t) => t >= today - 30 * DAY],
    ["Older", () => true],
  ];

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const groups: ChatGroup[] = [];
  for (const conversation of sorted) {
    const label = buckets.find(([, fits]) => fits(conversation.updatedAt))![0];
    const group = groups.find((g) => g.label === label);
    if (group) group.conversations.push(conversation);
    else groups.push({ label, conversations: [conversation] });
  }
  return groups;
}

/** "8s", "1m 5s": how long a reply took. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** "1 chat", "3 chats" */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** "12 KB", "1.4 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
