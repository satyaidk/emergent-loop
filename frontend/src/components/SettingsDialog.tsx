import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { BookMarked, Download, Trash2, Upload } from "lucide-react";
import type { ServerStatus } from "../hooks/useServerStatus";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import type { MemoryStatus } from "../lib/memoryStatus";
import {
  LEARNER_ID_PATTERN,
  STORAGE_QUOTA_BYTES,
  exportChats,
  parseChatExport,
  storageBytes,
} from "../lib/storage";
import { formatBytes, plural } from "../lib/time";
import type { TextSize, Theme } from "../lib/types";
import { Section, Segmented, Switch } from "./Controls";
import { Dialog } from "./Dialog";
import styles from "./SettingsDialog.module.css";

export type SettingsTab = "general" | "learner" | "memory" | "data" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "learner", label: "Learner" },
  { id: "memory", label: "Memory" },
  { id: "data", label: "Chats & storage" },
  { id: "about", label: "About" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  server: ServerStatus;
  memory: MemoryStatus;
  onOpenMemory: () => void;
}

export function SettingsDialog({ open, onClose, tab, onTabChange, server, memory, onOpenMemory }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title="Settings" wide>
      <div className={styles.layout}>
        <div className={styles.tabs} role="tablist" aria-orientation="vertical" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={styles.tab}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.panel} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "general" && <GeneralTab />}
          {tab === "learner" && <LearnerTab />}
          {tab === "memory" && <MemoryTab server={server} memory={memory} onOpenMemory={onOpenMemory} />}
          {tab === "data" && <DataTab />}
          {tab === "about" && <AboutTab server={server} memory={memory} />}
        </div>
      </div>
    </Dialog>
  );
}

function GeneralTab() {
  const { state, dispatch } = useAppState();
  const { settings } = state;
  const set = (patch: Partial<typeof settings>) => dispatch({ type: "updateSettings", patch });
  return (
    <>
      <Section title="Appearance">
        <Segmented<Theme>
          label="Theme"
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <Segmented<TextSize>
          label="Text size"
          value={settings.textSize}
          onChange={(textSize) => set({ textSize })}
          options={[
            { value: "small", label: "Small" },
            { value: "default", label: "Default" },
            { value: "large", label: "Large" },
          ]}
        />
      </Section>
      <Section title="Typing">
        <Switch
          label="Press Enter to send"
          description={
            settings.enterToSend
              ? "Shift + Enter adds a new line."
              : "Enter adds a new line. Ctrl + Enter sends."
          }
          checked={settings.enterToSend}
          onChange={(enterToSend) => set({ enterToSend })}
        />
      </Section>
    </>
  );
}

function LearnerTab() {
  const { state, dispatch } = useAppState();
  const { settings } = state;
  const [draftId, setDraftId] = useState(settings.learnerId);
  const [saved, setSaved] = useState(false);
  const valid = LEARNER_ID_PATTERN.test(draftId);
  const changed = draftId !== settings.learnerId;

  return (
    <>
      <Section title="Your name">
        <p className={styles.help}>Used to greet you. It stays in this browser.</p>
        <input
          className={styles.input}
          value={settings.name}
          maxLength={40}
          placeholder="For example, Sam"
          aria-label="Your name"
          onChange={(e) => dispatch({ type: "updateSettings", patch: { name: e.target.value } })}
        />
      </Section>
      <Section title="Learner ID">
        <p className={styles.help}>
          LearnLoop keeps its notes about you under this ID. Switch to a different ID to start fresh as another
          learner; switch back and the old notes are still there.
        </p>
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            dispatch({ type: "updateSettings", patch: { learnerId: draftId } });
            setSaved(true);
          }}
        >
          <input
            className={styles.input}
            value={draftId}
            aria-label="Learner ID"
            aria-invalid={!valid}
            aria-describedby="learner-id-rule"
            onChange={(e) => {
              setDraftId(e.target.value.toLowerCase().trim());
              setSaved(false);
            }}
          />
          <button type="submit" className={styles.primary} disabled={!valid || !changed}>
            Switch learner
          </button>
        </form>
        <p id="learner-id-rule" className={valid ? styles.help : styles.errorText}>
          {valid
            ? saved
              ? "Switched. New replies use this learner's notes."
              : "3 to 40 characters: lowercase letters, numbers and dashes."
            : "Use 3 to 40 characters: lowercase letters, numbers and dashes, starting with a letter or number."}
        </p>
      </Section>
    </>
  );
}

function MemoryTab({
  server,
  memory,
  onOpenMemory,
}: {
  server: ServerStatus;
  memory: MemoryStatus;
  onOpenMemory: () => void;
}) {
  const { state, dispatch } = useAppState();
  const { settings } = state;
  const set = (patch: Partial<typeof settings>) => dispatch({ type: "updateSettings", patch });
  const maxHistory = server.info?.max_history_messages ?? 12;
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const forget = async () => {
    try {
      await api.forget(settings.learnerId);
      setResult({ ok: true, text: "Deleted. LearnLoop starts a fresh set of notes from your next message." });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <Section title="Long-term memory">
        <p className={styles.help}>
          After each chat, LearnLoop writes short notes about what you practised and where you got stuck. Those notes
          live on the LearnLoop server (in Hindsight), not in this browser, so clearing your browser doesn&apos;t erase
          them. Status: {memory.label.toLowerCase()}.
        </p>
        <Switch
          label="Use long-term memory"
          description="Read your notes before answering, and add new notes after."
          checked={settings.useMemory}
          onChange={(useMemory) => set({ useMemory })}
        />
        <Switch
          label="Show which notes were used"
          description="Adds a highlighted list under replies that used your notes."
          checked={settings.showMemories}
          onChange={(showMemories) => set({ showMemories })}
        />
        <div className={styles.sliderRow}>
          <label htmlFor="history-length" className={styles.sliderLabel}>
            Recent messages sent with each question
            <span className={styles.help}>
              Short-term memory for the current chat. Fewer is faster on a small local model.
            </span>
          </label>
          <div className={styles.slider}>
            <input
              id="history-length"
              type="range"
              min={0}
              max={maxHistory}
              step={2}
              value={Math.min(settings.historyLength, maxHistory)}
              onChange={(e) => set({ historyLength: Number(e.target.value) })}
            />
            <output htmlFor="history-length">{Math.min(settings.historyLength, maxHistory)}</output>
          </div>
        </div>
      </Section>

      <Section title="Your notes">
        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondary} onClick={onOpenMemory}>
            <BookMarked size={16} /> See what LearnLoop remembers
          </button>
        </div>
        <div className={styles.danger}>
          <div>
            <p className={styles.dangerTitle}>Delete all notes about {settings.learnerId}</p>
            <p className={styles.help}>This can&apos;t be undone. Your chats in this browser stay.</p>
          </div>
          {confirming ? (
            <div className={styles.buttonRow}>
              <button type="button" className={styles.dangerButton} onClick={forget}>
                Yes, delete notes
              </button>
              <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className={styles.dangerOutline} onClick={() => setConfirming(true)}>
              <Trash2 size={16} /> Delete notes
            </button>
          )}
        </div>
        {result && (
          <p className={result.ok ? styles.okText : styles.errorText} role="status">
            {result.text}
          </p>
        )}
      </Section>
    </>
  );
}

function DataTab() {
  const { state, dispatch } = useAppState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const used = storageBytes(state);
  const share = Math.min(1, used / STORAGE_QUOTA_BYTES);

  const download = () => {
    const blob = new Blob([JSON.stringify(exportChats(state.conversations), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `learnloop-chats-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: `Exported ${plural(state.conversations.length, "chat")}.` });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    try {
      const conversations = parseChatExport(await file.text());
      // Chats with an id we already have are skipped, so importing the same file twice is harmless.
      const known = new Set(state.conversations.map((c) => c.id));
      const newOnes = conversations.filter((c) => !known.has(c.id)).length;
      dispatch({ type: "importChats", conversations });
      const before = state.conversations.length;
      setMessage({ ok: true, text: `Imported ${plural(newOnes, "new chat")} (${before + newOnes} in total).` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <>
      <Section title="Where chats are saved">
        <p className={styles.help}>
          Your chats and settings are saved in this browser&apos;s local storage. They stay until you delete them here
          or clear this site&apos;s data in your browser. They aren&apos;t synced to other devices, so export them if
          you want a copy.
        </p>
        <div className={styles.meter} aria-label="Browser storage used">
          <div className={styles.meterBar}>
            <span style={{ width: `${Math.max(share * 100, 1)}%` }} />
          </div>
          <span className={styles.help}>
            {plural(state.conversations.length, "chat")} {state.conversations.length === 1 ? "uses" : "use"}{" "}
            {formatBytes(used)} of about {formatBytes(STORAGE_QUOTA_BYTES)}.
          </span>
        </div>
      </Section>

      <Section title="Back up and restore">
        <div className={styles.buttonRow}>
          <button type="button" className={styles.secondary} onClick={download} disabled={!state.conversations.length}>
            <Download size={16} /> Export chats
          </button>
          <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> Import chats
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={upload} />
        </div>
        {message && (
          <p className={message.ok ? styles.okText : styles.errorText} role="status">
            {message.text}
          </p>
        )}
      </Section>

      <Section title="Delete chats">
        <div className={styles.danger}>
          <div>
            <p className={styles.dangerTitle}>Delete all chats in this browser</p>
            <p className={styles.help}>LearnLoop&apos;s notes about you on the server are kept.</p>
          </div>
          {confirming ? (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => {
                  dispatch({ type: "deleteAllChats" });
                  setConfirming(false);
                  setMessage({ ok: true, text: "All chats deleted." });
                }}
              >
                Yes, delete chats
              </button>
              <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.dangerOutline}
              onClick={() => setConfirming(true)}
              disabled={!state.conversations.length}
            >
              <Trash2 size={16} /> Delete chats
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

function AboutTab({ server, memory }: { server: ServerStatus; memory: MemoryStatus }) {
  const rows: [string, string][] = [
    ["Version", server.info?.version ?? "unknown"],
    ["Model", server.info?.model ?? "unknown"],
    ["Server", server.reachable === null ? "checking" : server.reachable ? "online" : "offline"],
    ["Memory", memory.tone === "on" ? "on" : memory.tone === "off" ? "off" : memory.label.toLowerCase()],
  ];
  return (
    <>
      <Section title="LearnLoop">
        <dl className={styles.facts}>
          {rows.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.help}>
          The model is chosen on the server (in <code>.env</code>). The API is documented at{" "}
          <a href="/docs" target="_blank" rel="noreferrer">
            /docs
          </a>
          .
        </p>
      </Section>
      <Section title="Keyboard shortcuts">
        <dl className={styles.facts}>
          <div>
            <dt>New chat</dt>
            <dd>
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>
            </dd>
          </div>
          <div>
            <dt>New line</dt>
            <dd>
              <kbd>Shift</kbd> + <kbd>Enter</kbd>
            </dd>
          </div>
          <div>
            <dt>Close a window</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
