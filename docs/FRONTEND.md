# The web app (frontend/)

The chat screen you use at http://localhost:8000 is a **React** app written in **TypeScript** and
built with **Vite**. This guide explains it in plain words: what each file does, how a message
travels, and where your data is saved.

## The three tools, in one line each

| Tool | What it does here |
|---|---|
| **React** | Builds the screen out of small pieces called *components* (the sidebar, one message, the settings window...). When data changes, React redraws only what changed. |
| **TypeScript** | JavaScript plus *types*: it checks, before the app runs, that you pass the right kind of data around (for example, that a message always has a `role`). `npm run typecheck` runs the check. |
| **Vite** | Runs the app while you edit (`npm run dev`, instant reload) and packs it into a few small files for the server (`npm run build`). |

## Where your data lives

There are **two kinds of memory**, stored in two different places:

| What | Where | Survives clearing the browser? |
|---|---|---|
| Your chats and settings | Your browser's **local storage** (key `learnloop.state.v1`) | No. Clearing site data deletes them. Use **Settings → Chats & storage → Export chats** to keep a copy. |
| LearnLoop's notes about you (long-term memory) | **Hindsight**, on the server | Yes. Delete them in **Settings → Memory → Delete notes**. |

There is no chat database on purpose: this is a learning project, and browser storage keeps it
simple. The trade-offs are listed in [DESIGN.md](DESIGN.md).

## Folder structure

```text
frontend/
├── index.html                  The one HTML page; React fills in <div id="root">
├── vite.config.ts              Dev server (forwards /api to FastAPI) and build settings
├── package.json                Libraries the app uses, and the npm commands
├── public/favicon.svg          The loop icon in the browser tab
└── src/
    ├── main.tsx                Starting point: loads fonts and styles, shows <App />
    ├── App.tsx                 The layout: sidebar + chat + settings/memory windows, shortcuts
    ├── styles/global.css       Colours, fonts and dark mode (all as CSS variables)
    │
    ├── lib/                    Logic with no screen of its own
    │   ├── types.ts            The shapes of the data: Message, Conversation, Settings...
    │   ├── state.ts            The reducer: every change to the data, in one place
    │   ├── AppState.tsx        Holds the data, saves it, sends questions to the server
    │   ├── storage.ts          Reading and writing local storage; export and import
    │   ├── api.ts              Every call to the server, with readable error messages
    │   ├── memoryStatus.ts     Decides what "Memory on / off / offline" to show
    │   ├── time.ts             Grouping chats by date; "8s", "12 KB", "1 chat"
    │   └── highlight.ts        Which programming languages code blocks can be coloured for
    │
    ├── hooks/                  Reusable bits of behaviour
    │   ├── useServerStatus.ts  Checks the server and memory every 30 seconds
    │   ├── useTheme.ts         Applies light/dark mode and text size
    │   └── useNow.ts           A ticking clock for the "thinking" timer
    │
    ├── components/             The pieces you see
    │   ├── Sidebar.tsx         New chat, search, chats by date, rename/delete, your profile
    │   ├── ChatView.tsx        Chat header, the message list, the welcome screen
    │   ├── MessageItem.tsx     One message: your bubble, or the tutor's reply with its notes
    │   ├── Markdown.tsx        Turns the reply's Markdown into headings, lists and code blocks
    │   ├── Composer.tsx        The message box: Enter to send, Stop, the memory switch
    │   ├── EmptyState.tsx      The welcome screen with notes and starter questions
    │   ├── SettingsDialog.tsx  The five settings tabs
    │   ├── MemoryDialog.tsx    "What LearnLoop remembers" and the progress report
    │   ├── Dialog.tsx          A pop-up window (built on the browser's <dialog>)
    │   ├── Controls.tsx        Switch and option-picker used in settings
    │   └── LoopMark.tsx        The logo
    │
    └── test/setup.ts           Prepares the fake browser the tests run in
```

Each component has a matching `.module.css` file next to it. Those are **CSS Modules**: the class
names only apply to that one component, so two components can both have a `.title` without clashing.

## What happens when you press Enter

1. **`Composer.tsx`** sees Enter (without Shift) and calls `send("your text")`.
2. **`AppState.tsx`** creates your message and an empty "pending" reply, and passes them to the reducer.
3. **`state.ts`** (the reducer) adds both to the chat. React redraws: your bubble appears, and the
   reply shows "Checking your notes and thinking".
4. The **effect** in `AppState.tsx` notices the change and saves everything to local storage.
5. **`api.ts`** sends `POST /api/chat` with your message, the recent part of this chat
   (short-term memory), your learner ID and whether memory is on.
6. The server does recall → think → reply → retain (see the main README) and answers.
7. `AppState.tsx` puts the answer into the pending reply. React redraws it as Markdown, with
   "Used 3 notes about you" underneath. It's saved to local storage again.

If you press **Stop**, step 5 is cancelled with an `AbortController`. If the server fails, the reply
shows the reason and a **Try again** button.

## Ideas worth knowing for interviews

- **One reducer for all changes** (`state.ts`): every change is a named action like `sendMessage`
  or `deleteChat`, handled by one pure function. Easy to follow and easy to unit-test.
- **Context instead of prop drilling** (`AppState.tsx`): any component can call `useAppState()`
  instead of receiving data through five layers of props.
- **Code splitting** (`MessageItem.tsx`): the Markdown renderer is about half the app's code, so it
  loads only when the first reply appears. The first page load dropped from 593 KB to 271 KB.
- **Safe rendering**: react-markdown never runs HTML from a reply, so a reply can't inject scripts.
- **Accessible by default**: real buttons, labels on icon buttons, keyboard shortcuts, visible focus,
  and reduced motion respected.
- **Tested like a user**: `App.test.tsx` types into the message box and checks what appears on
  screen, with a fake server, so the tests need no Python, Hindsight or model.

## Commands

Run these inside `frontend/`:

| Command | What it does |
|---|---|
| `npm install` | Downloads the libraries into `node_modules/` (once, and after `package.json` changes) |
| `npm run dev` | Runs the app at http://localhost:5173 with instant reload. The API must be running on :8000. |
| `npm test` | Runs the 38 tests |
| `npm run lint` | Checks for common mistakes (oxlint) |
| `npm run typecheck` | Checks the types (TypeScript) |
| `npm run build` | Builds the production app into `../app/static/`, which FastAPI serves |

## Try these yourself

Small features, each teaching one React skill:

1. **Edit a sent message** and resend it (state updates, the reducer).
2. **Keep an unsent draft per chat**, so switching chats doesn't lose what you typed (more state).
3. **Sync two open tabs**: listen for the browser's `storage` event and reload the state (effects).
4. **Streaming replies**, so words appear as they're written: a bigger feature that touches the
   server too. See Stage 3 in [LEARNING_PATH.md](LEARNING_PATH.md).
