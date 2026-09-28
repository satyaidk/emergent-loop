import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { ArrowUp, BookMarked, Square } from "lucide-react";
import styles from "./Composer.module.css";

/** Same limit as the server (schemas.py: ChatRequest.message max_length). */
export const MAX_MESSAGE_CHARS = 4000;

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  /** True while the tutor is answering in this chat: the send button becomes Stop. */
  pending: boolean;
  enterToSend: boolean;
  memoryOn: boolean;
  onToggleMemory: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({ onSend, onStop, pending, enterToSend, memoryOn, onToggleMemory, inputRef }: Props) {
  const [text, setText] = useState("");
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = inputRef ?? ownRef;
  const canSend = text.trim().length > 0 && !pending;

  // Grow with the text, up to a limit, then scroll inside.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 220)}px`;
  }, [text, boxRef]);

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return; // isComposing: typing via an IME
    const shortcut = event.ctrlKey || event.metaKey;
    if ((enterToSend && !event.shiftKey) || shortcut) {
      event.preventDefault();
      submit();
    }
  };

  const nearLimit = text.length > MAX_MESSAGE_CHARS - 500;

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor="composer-input" className="visually-hidden">
        Message LearnLoop
      </label>
      <textarea
        id="composer-input"
        ref={boxRef}
        className={styles.input}
        rows={1}
        value={text}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder="Ask about a concept, paste some code, or ask for a quiz"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.memory}
          aria-pressed={memoryOn}
          onClick={onToggleMemory}
          title={memoryOn ? "Long-term memory is on" : "Long-term memory is off"}
        >
          <BookMarked size={16} aria-hidden="true" />
          {memoryOn ? "Memory on" : "Memory off"}
        </button>
        <div className={styles.right}>
          {nearLimit && (
            <span className={styles.count} aria-live="polite">
              {text.length} / {MAX_MESSAGE_CHARS}
            </span>
          )}
          {pending ? (
            <button type="button" className={styles.send} onClick={onStop} aria-label="Stop answering">
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className={styles.send} disabled={!canSend} aria-label="Send message">
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
