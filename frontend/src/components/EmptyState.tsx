import styles from "./EmptyState.module.css";

interface Props {
  name: string;
  /** Questions to start with: personal ones from the learner's notes, or general ones. */
  starters: string[];
  personal: boolean;
  onPick: (prompt: string) => void;
}

export function EmptyState({ name, starters, personal, onPick }: Props) {
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

      {personal && <p className={styles.startersNote}>Ideas based on what you&apos;ve been learning</p>}
      <ul className={`${styles.starters} ${personal ? styles.afterNote : ""}`} aria-label="Ideas to start with">
        {starters.map((prompt) => (
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
