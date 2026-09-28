import { useCallback, useEffect, useRef, useState } from "react";
import { ChatView } from "./components/ChatView";
import { MemoryDialog } from "./components/MemoryDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import type { SettingsTab } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { useServerStatus } from "./hooks/useServerStatus";
import { useTheme } from "./hooks/useTheme";
import { useAppState } from "./lib/AppState";
import { memoryStatus } from "./lib/memoryStatus";
import styles from "./App.module.css";

const isSmallScreen = () => window.matchMedia?.("(max-width: 900px)").matches ?? false;

export default function App() {
  const { state, dispatch, storageError } = useAppState();
  const { settings } = state;
  const server = useServerStatus();
  const memory = memoryStatus(settings.useMemory, server.reachable, server.health);
  useTheme(settings.theme, settings.textSize);

  const [drawerOpen, setDrawerOpen] = useState(false); // small screens: sidebar slides over the chat
  const [collapsed, setCollapsed] = useState(false); // large screens: sidebar hidden entirely
  const [dialog, setDialog] = useState<"settings" | "memory" | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const newChat = useCallback(() => {
    dispatch({ type: "newChat" });
    setDrawerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [dispatch]);

  // Ctrl/Cmd + Shift + O starts a new chat, as in other chat apps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setDialog("settings");
    setDrawerOpen(false);
  };

  return (
    <div className={styles.app} data-collapsed={collapsed}>
      {!collapsed && (
        <Sidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCollapse={() => (isSmallScreen() ? setDrawerOpen(false) : setCollapsed(true))}
          onNewChat={newChat}
          onOpenSettings={() => openSettings("learner")}
          onOpenMemory={() => {
            setDialog("memory");
            setDrawerOpen(false);
          }}
          memory={memory}
        />
      )}
      {drawerOpen && <div className={styles.scrim} onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <div className={styles.content}>
        {storageError && (
          <p className={styles.banner} role="alert">
            {storageError}
          </p>
        )}
        <ChatView
          memory={memory}
          model={server.info?.model ?? null}
          sidebarCollapsed={collapsed}
          onOpenSidebar={() => (collapsed ? setCollapsed(false) : setDrawerOpen(true))}
          onOpenMemory={() => setDialog("memory")}
          inputRef={inputRef}
        />
      </div>

      <SettingsDialog
        open={dialog === "settings"}
        onClose={() => setDialog(null)}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        server={server}
        memory={memory}
        onOpenMemory={() => setDialog("memory")}
      />
      <MemoryDialog
        open={dialog === "memory"}
        onClose={() => setDialog(null)}
        learnerId={settings.learnerId}
        memoryOn={settings.useMemory}
      />
    </div>
  );
}
