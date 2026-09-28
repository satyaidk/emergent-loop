import { Suspense, lazy, useState } from "react";
import { AlertCircle, Check, ChevronDown, Copy, RotateCcw } from "lucide-react";
import { useNow } from "../hooks/useNow";
import { formatDuration } from "../lib/time";
import type { MemoryNote, Message } from "../lib/types";
import { LoopMark } from "./LoopMark";
import styles from "./MessageItem.module.css";

// The Markdown renderer (with code highlighting) is most of the app's JavaScript. Loading it only
// when the first reply appears keeps the first page load small ("code splitting").
const Markdown = lazy(() => import("./Markdown").then((module) => ({ default: module.Markdown })));

interface Props {
  message: Message;
  /** Only the newest reply offers "Regenerate". */
  isLast: boolean;
  showMemories: boolean;
  onRetry: (replyId: string) => void;
}

export function MessageItem({ message, isLast, showMemories, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{message.content}</div>
        <div className={styles.userActions}>
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.replyRow}>
      <div className={styles.avatar}>
        <LoopMark size={22} />
      </div>
      <div className={styles.reply}>
        {message.status === "pending" && <Thinking since={message.createdAt} />}

        {message.status === "error" && (
          <div className={styles.error} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <div>
              <p>{message.error ?? "Something went wrong."}</p>
              <button type="button" className={styles.retry} onClick={() => onRetry(message.id)}>
                <RotateCcw size={15} /> Try again
              </button>
            </div>
          </div>
        )}

        {message.status === "stopped" && (
          <p className={styles.stopped}>
            You stopped this reply.{" "}
            <button type="button" className={styles.linkButton} onClick={() => onRetry(message.id)}>
              Ask again
            </button>
          </p>
        )}

        {message.status === "done" && (
          <>
            <Suspense fallback={<p className={styles.plain}>{message.content}</p>}>
              <Markdown text={message.content} />
            </Suspense>
            {message.memoryAvailable === false && (
              <p className={styles.notice}>Memory was offline, so this answer isn&apos;t personalised.</p>
            )}
            {showMemories && message.memories && message.memories.length > 0 && (
              <MemoriesUsed notes={message.memories} />
            )}
            <div className={styles.actions}>
              <CopyButton text={message.content} />
              {isLast && (
                <button type="button" className={styles.iconButton} onClick={() => onRetry(message.id)}>
                  <RotateCcw size={15} /> Regenerate
                </button>
              )}
              {message.elapsedMs !== undefined && (
                <span className={styles.meta}>Answered in {formatDuration(message.elapsedMs)}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Thinking({ since }: { since: number }) {
  const now = useNow(true);
  const seconds = Math.floor((now - since) / 1000);
  return (
    <div className={styles.thinking} role="status">
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        Checking your notes and thinking
        {seconds >= 3 && <span className={styles.meta}>({formatDuration(seconds * 1000)})</span>}
      </span>
    </div>
  );
}

/** The signature element: memories the tutor used, shown like highlighted lines in a notebook. */
const NOTES_SHOWN_FIRST = 3;

function MemoriesUsed({ notes }: { notes: MemoryNote[] }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? notes : notes.slice(0, NOTES_SHOWN_FIRST);
  const label = notes.length === 1 ? "Used 1 note about you" : `Used ${notes.length} notes about you`;
  return (
    <div className={styles.memories}>
      <button
        type="button"
        className={styles.memoriesToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.marker}>{label}</span>
        <ChevronDown size={16} className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <ul className={styles.notes}>
          {visible.map((note, index) => (
            <li key={index}>
              <mark className={styles.note}>{note.text}</mark>
            </li>
          ))}
          {!showAll && notes.length > NOTES_SHOWN_FIRST && (
            <li>
              <button type="button" className={styles.linkButton} onClick={() => setShowAll(true)}>
                Show {notes.length - NOTES_SHOWN_FIRST} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={async () => {
        await navigator.clipboard?.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}
