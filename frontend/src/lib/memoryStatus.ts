import type { Health } from "./types";

export type MemoryTone = "on" | "off" | "warn" | "checking";

export interface MemoryStatus {
  tone: MemoryTone;
  label: string;
  detail: string;
}

/** One place that decides what "memory" status the learner sees, from their setting and the server's health. */
export function memoryStatus(useMemory: boolean, reachable: boolean | null, health: Health | null): MemoryStatus {
  if (reachable === false) {
    return {
      tone: "warn",
      label: "Server offline",
      detail: "Can't reach the LearnLoop server. Start it, and this updates on its own.",
    };
  }
  if (!useMemory) {
    return { tone: "off", label: "Memory off", detail: "Answers won't use or add to your notes." };
  }
  if (reachable === null) {
    return { tone: "checking", label: "Checking memory", detail: "Checking the memory service." };
  }
  if (health && !health.memory) {
    return {
      tone: "warn",
      label: "Memory offline",
      detail: "The memory service isn't reachable, so answers won't be personalised.",
    };
  }
  return { tone: "on", label: "Memory on", detail: "LearnLoop reads and updates its notes about you." };
}
