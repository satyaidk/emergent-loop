import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { api } from "../lib/api";
import { plural } from "../lib/time";
import type { MemoryNote, ProgressReport } from "../lib/types";
import { Segmented } from "./Controls";
import { Dialog } from "./Dialog";
import styles from "./MemoryDialog.module.css";

type View = "notes" | "report";

type Load<T> = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

interface Props {
  open: boolean;
  onClose: () => void;
  learnerId: string;
  memoryOn: boolean;
}

export function MemoryDialog({ open, onClose, learnerId, memoryOn }: Props) {
  const [view, setView] = useState<View>("notes");
  return (
    <Dialog open={open} onClose={onClose} title="What LearnLoop remembers">
      <div className={styles.body}>
        <div className={styles.toolbar}>
          <p className={styles.who}>
            Notes for <strong>{learnerId}</strong>
            {!memoryOn && " (memory is off, so new chats aren't adding notes)"}
          </p>
          <Segmented<View>
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "notes", label: "Notes" },
              { value: "report", label: "Progress report" },
            ]}
          />
        </div>
        {open && (view === "notes" ? <Notes learnerId={learnerId} /> : <Report learnerId={learnerId} />)}
      </div>
    </Dialog>
  );
}

function Notes({ learnerId }: { learnerId: string }) {
  const [load, setLoad] = useState<Load<MemoryNote[]>>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true; // ignore a slow answer that arrives after the learner switched or closed
    api
      .memories(learnerId)
      .then((data) => current && setLoad({ state: "ready", data }))
      .catch((error: Error) => current && setLoad({ state: "error", message: error.message }));
    return () => {
      current = false;
    };
  }, [learnerId, attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  };

  if (load.state === "loading" || load.state === "idle") return <p className={styles.muted}>Opening your notes…</p>;
  if (load.state === "error") return <Failure message={load.message} onRetry={retry} />;

  const q = query.trim().toLowerCase();
  const notes = q ? load.data.filter((n) => n.text.toLowerCase().includes(q)) : load.data;

  if (load.data.length === 0) {
    return (
      <p className={styles.muted}>
        No notes yet. Chat for a while and LearnLoop writes down what you practise and where you get stuck, in the
        background after each reply.
      </p>
    );
  }

  return (
    <>
      <label className={styles.search}>
        <Search size={16} aria-hidden="true" />
        <span className="visually-hidden">Search notes</span>
        <input type="search" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className={styles.count}>
        {notes.length === load.data.length
          ? plural(notes.length, "note")
          : `${notes.length} of ${plural(load.data.length, "note")}`}
      </p>
      <ul className={styles.notes}>
        {notes.map((note, index) => (
          <li key={index}>
            <mark>{note.text}</mark>
            {note.occurred_at && <span className={styles.date}>{formatDate(note.occurred_at)}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Report({ learnerId }: { learnerId: string }) {
  const [load, setLoad] = useState<Load<ProgressReport>>({ state: "idle" });

  const write = () => {
    setLoad({ state: "loading" });
    api
      .report(learnerId)
      .then((data) => setLoad({ state: "ready", data }))
      .catch((error: Error) => setLoad({ state: "error", message: error.message }));
  };

  if (load.state === "idle") {
    return (
      <div className={styles.reportStart}>
        <p className={styles.muted}>
          LearnLoop reads all of its notes about you and writes a short report: what you&apos;re good at, what trips
          you up, and what to study next.
        </p>
        <button type="button" className={styles.primary} onClick={write}>
          Write my progress report
        </button>
      </div>
    );
  }
  if (load.state === "loading") {
    return (
      <p className={styles.muted} role="status">
        Reading your notes and writing the report. On a small local model this can take a minute or two.
      </p>
    );
  }
  if (load.state === "error") return <Failure message={load.message} onRetry={write} />;

  const { summary, strengths, struggles, next_topics } = load.data;
  return (
    <div className={styles.report}>
      <p className={styles.summary}>{summary}</p>
      <ReportList title="Strengths" items={strengths} />
      <ReportList title="Struggles" items={struggles} />
      <ReportList title="Study next" items={next_topics} ordered />
      <button type="button" className={styles.secondary} onClick={write}>
        <RotateCcw size={15} /> Write it again
      </button>
    </div>
  );
}

function ReportList({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (!items.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <section className={styles.reportSection}>
      <h3>{title}</h3>
      <List>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </section>
  );
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.failure} role="alert">
      <p>{message}</p>
      <button type="button" className={styles.secondary} onClick={onRetry}>
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
