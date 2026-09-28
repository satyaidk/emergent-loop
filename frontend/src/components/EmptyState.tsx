import type { MemoryNote } from "../lib/types";
import styles from "./EmptyState.module.css";

const STARTERS = [
  "Explain recursion with one tiny example I can run",
  "Why does my for loop skip the last item?",
  "Quiz me with three quick questions on Python lists",
  "From what you know about me, what should I learn next?",
];

interface Props {
  name: string;
  /** A few things LearnLoop already remembers, shown so a new chat doesn't start from zero. */
  notes: MemoryNote[];
  onPick: (prompt: string) => void;
}

export function EmptyState({ name, notes, onPick }: Props) {
  const firstName = name.trim().split(/\s+/)[0];
  return (
    <div className={styles.empty}>
      <h2 className={styles.greeting}>
        {firstName ? `What are we learning today, ${firstName}?` : "What are we learning today?"}
      </h2>
      <p className={styles.lede}>
        Ask anything about code. LearnLoop keeps notes on what you&apos;ve practised, so every chat picks up where you
        left off.
      </p>

      {notes.length > 0 && (
        <section className={styles.notes} aria-labelledby="recent-notes">
          <h3 id="recent-notes" className={styles.notesTitle}>
            From your notes
          </h3>
          <ul>
            {notes.map((note, index) => (
              <li key={index}>
                <mark>{note.text}</mark>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className={styles.starters} aria-label="Ideas to start with">
        {STARTERS.map((prompt) => (
          <li key={prompt}>
            <button type="button" onClick={() => onPick(prompt)}>
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
