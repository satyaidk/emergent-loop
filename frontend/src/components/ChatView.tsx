import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { Menu, PanelLeftOpen, SquarePen } from "lucide-react";
import { useStarters } from "../hooks/useStarters";
import { useAppState } from "../lib/AppState";
import type { MemoryStatus } from "../lib/memoryStatus";
import type { Message } from "../lib/types";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { MessageItem } from "./MessageItem";
import { Suggestions } from "./Suggestions";
import styles from "./ChatView.module.css";

interface Props {
  memory: MemoryStatus;
  model: string | null;
  sidebarCollapsed: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onOpenMemory: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatView({
  memory,
  model,
  sidebarCollapsed,
  onOpenSidebar,
  onNewChat,
  onOpenMemory,
  inputRef,
}: Props) {
  const { state, dispatch, activeConversation, send, retry, stop } = useAppState();
  const { settings } = state;
  const messages = activeConversation?.messages ?? [];
  const pendingReply = messages.find((m) => m.status === "pending");
  const starters = useStarters(memory.tone === "on");
  // This chat's own follow-ups: other chats keep theirs, so switching chats switches suggestions.
  const followUps = settings.showSuggestions ? (activeConversation?.suggestions ?? []) : [];

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <button
          type="button"
          className={`${styles.iconButton} ${sidebarCollapsed ? "" : styles.mobileOnly}`}
          onClick={onOpenSidebar}
          aria-label="Show chats"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <Menu size={20} />}
        </button>
        {sidebarCollapsed && (
          <button type="button" className={styles.iconButton} onClick={onNewChat} aria-label="New chat">
            <SquarePen size={19} />
          </button>
        )}
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{activeConversation?.title ?? "New chat"}</h1>
          {model && <span className={styles.model}>{model}</span>}
        </div>
        <button type="button" className={styles.status} data-tone={memory.tone} onClick={onOpenMemory} title={memory.detail}>
          <span className={styles.dot} aria-hidden="true" />
          {memory.label}
        </button>
      </header>

      {messages.length === 0 ? (
        <div className={styles.scroll}>
          <div className={styles.column}>
            <EmptyState name={settings.name} starters={starters.items} personal={starters.personal} onPick={send} />
          </div>
        </div>
      ) : (
        <MessageList
          messages={messages}
          showMemories={settings.showMemories}
          followUps={followUps}
          onPick={send}
          onRetry={retry}
        />
      )}

      <div className={styles.dock}>
        <div className={styles.column}>
          <Composer
            inputRef={inputRef}
            onSend={send}
            onStop={() => pendingReply && stop(pendingReply.id)}
            pending={Boolean(pendingReply)}
            enterToSend={settings.enterToSend}
            memoryOn={settings.useMemory}
            onToggleMemory={() => dispatch({ type: "updateSettings", patch: { useMemory: !settings.useMemory } })}
          />
          <p className={styles.footnote}>
            Chats are saved in this browser only. LearnLoop can make mistakes, so run the code yourself.
          </p>
        </div>
      </div>
    </main>
  );
}

function MessageList({
  messages,
  showMemories,
  followUps,
  onPick,
  onRetry,
}: {
  messages: Message[];
  showMemories: boolean;
  followUps: string[];
  onPick: (question: string) => void;
  onRetry: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  const lastStatus = messages.at(-1)?.status;
  // Only under a finished answer: while the tutor is thinking, or after an error, there's nothing to follow up.
  const showFollowUps = lastStatus === "done" && followUps.length > 0;

  // Follow new messages, unless the learner has scrolled up to read something older.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    const justSent = lastStatus === "pending";
    if (nearBottom || justSent) box.scrollTo?.({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages.length, lastStatus, showFollowUps]);

  return (
    <div className={styles.scroll} ref={scrollRef}>
      <div className={`${styles.column} ${styles.log}`} role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isLast={message.id === lastReply?.id}
            showMemories={showMemories}
            onRetry={onRetry}
          />
        ))}
        {showFollowUps && <Suggestions items={followUps} onPick={onPick} />}
      </div>
    </div>
  );
}
