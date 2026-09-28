import { useMemo, useState } from "react";
import { BookMarked, Check, PanelLeftClose, Pencil, Search, Settings, SquarePen, Trash2, X } from "lucide-react";
import { useAppState } from "../lib/AppState";
import type { MemoryStatus } from "../lib/memoryStatus";
import { groupByDate } from "../lib/time";
import type { Conversation } from "../lib/types";
import { LoopMark } from "./LoopMark";
import styles from "./Sidebar.module.css";

interface Props {
  /** Mobile only: whether the drawer is open. */
  open: boolean;
  onClose: () => void;
  onCollapse: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  memory: MemoryStatus;
}

export function Sidebar({ open, onClose, onCollapse, onNewChat, onOpenSettings, onOpenMemory, memory }: Props) {
  const { state, dispatch } = useAppState();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? state.conversations.filter(
          (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
        )
      : state.conversations;
    return groupByDate(matches);
  }, [state.conversations, query]);

  const select = (id: string) => {
    dispatch({ type: "selectChat", id });
    onClose();
  };

  const { name, learnerId } = state.settings;

  return (
    <nav className={styles.sidebar} data-open={open} aria-label="Chats">
      <div className={styles.top}>
        <div className={styles.brand}>
          <LoopMark size={26} />
          <span>LearnLoop</span>
        </div>
        <button type="button" className={styles.iconButton} onClick={onCollapse} aria-label="Hide chats">
          <PanelLeftClose size={19} className={styles.desktopOnly} />
          <X size={20} className={styles.mobileOnly} />
        </button>
      </div>

      <button type="button" className={styles.newChat} onClick={onNewChat} title="New chat (Ctrl + Shift + O)">
        <SquarePen size={17} /> New chat
      </button>

      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <span className="visually-hidden">Search chats</span>
        <input type="search" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className={styles.list}>
        {groups.length === 0 && (
          <p className={styles.emptyList}>
            {query ? "No chats match that search." : "Your chats will appear here. They're saved in this browser."}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} className={styles.group}>
            <h2 className={styles.groupTitle}>{group.label}</h2>
            <ul>
              {group.conversations.map((conversation) => (
                <ChatItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === state.activeId}
                  onSelect={() => select(conversation.id)}
                  onRename={(title) => dispatch({ type: "renameChat", id: conversation.id, title })}
                  onDelete={() => dispatch({ type: "deleteChat", id: conversation.id })}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.learner} onClick={onOpenSettings} title="Learner settings">
          <span className={styles.avatar} aria-hidden="true">
            {(name.trim()[0] ?? learnerId[0] ?? "?").toUpperCase()}
          </span>
          <span className={styles.learnerText}>
            <span className={styles.learnerName}>{name.trim() || "Learner"}</span>
            <span className={styles.learnerId}>
              <span className={styles.memoryDot} data-tone={memory.tone} title={memory.label} />
              {learnerId}
            </span>
          </span>
        </button>
        <button type="button" className={styles.iconButton} onClick={onOpenMemory} aria-label="What LearnLoop remembers">
          <BookMarked size={19} />
        </button>
        <button type="button" className={styles.iconButton} onClick={onOpenSettings} aria-label="Settings">
          <Settings size={19} />
        </button>
      </div>
    </nav>
  );
}

function ChatItem({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "confirmDelete">("view");
  const [draft, setDraft] = useState(conversation.title);

  if (mode === "rename") {
    const save = () => {
      onRename(draft);
      setMode("view");
    };
    return (
      <li className={styles.item} data-active={active}>
        <input
          className={styles.renameInput}
          value={draft}
          autoFocus
          aria-label="Chat name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setMode("view");
          }}
        />
      </li>
    );
  }

  if (mode === "confirmDelete") {
    return (
      <li className={`${styles.item} ${styles.confirm}`}>
        <span>Delete this chat?</span>
        <button type="button" className={styles.confirmYes} onClick={onDelete} aria-label="Yes, delete">
          <Check size={16} /> Delete
        </button>
        <button type="button" className={styles.iconButton} onClick={() => setMode("view")} aria-label="Keep chat">
          <X size={16} />
        </button>
      </li>
    );
  }

  return (
    <li className={styles.item} data-active={active}>
      <button type="button" className={styles.itemButton} onClick={onSelect} aria-current={active ? "page" : undefined}>
        {conversation.title}
      </button>
      <span className={styles.itemActions}>
        <button
          type="button"
          className={styles.smallIcon}
          onClick={() => {
            setDraft(conversation.title);
            setMode("rename");
          }}
          aria-label={`Rename "${conversation.title}"`}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={styles.smallIcon}
          onClick={() => setMode("confirmDelete")}
          aria-label={`Delete "${conversation.title}"`}
        >
          <Trash2 size={14} />
        </button>
      </span>
    </li>
  );
}
