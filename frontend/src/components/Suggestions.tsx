import { CornerDownRight } from "lucide-react";
import styles from "./Suggestions.module.css";

/** Follow-up questions under the newest reply. Clicking one asks it, as if typed. */
export function Suggestions({ items, onPick }: { items: string[]; onPick: (question: string) => void }) {
  return (
    <div className={styles.suggestions} role="group" aria-label="Suggested questions">
      {items.map((question) => (
        <button key={question} type="button" className={styles.chip} onClick={() => onPick(question)}>
          <CornerDownRight size={15} aria-hidden="true" className={styles.icon} />
          {question}
        </button>
      ))}
    </div>
  );
}
