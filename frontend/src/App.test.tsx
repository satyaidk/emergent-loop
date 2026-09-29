// Tests that drive the whole app the way a person would. fetch is replaced by a fake server.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AppStateProvider } from "./lib/AppState";
import { STORAGE_KEY } from "./lib/storage";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

let chatHandler: Handler;
let chatBodies: Record<string, unknown>[];
let starters: string[];

beforeEach(() => {
  chatBodies = [];
  starters = [];
  chatHandler = () =>
    json({
      reply: "A **base case** stops the recursion.",
      memories_used: [{ text: "Learner struggles with recursion", type: "world", occurred_at: null }],
      memory_available: true,
    });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "/healthz") return json({ status: "ok", memory: true });
    if (url === "/api/info") return json({ version: "0.1.0", model: "qwen3:4b-instruct", max_history_messages: 12 });
    if (url === "/api/chat") {
      chatBodies.push(JSON.parse(String(init?.body)));
      return chatHandler(url, init);
    }
    if (url.endsWith("/memories")) return json({ memories: [] });
    if (url.includes("/starters")) return json({ suggestions: starters });
    return json({ detail: "Not found" }, 404);
  });
});

function renderApp() {
  return render(
    <AppStateProvider>
      <App />
    </AppStateProvider>,
  );
}

/** A reply about `topic`, with follow-ups about that same topic. */
const replyAbout = (topic: string) => () =>
  json({
    reply: `Here is how ${topic} works.`,
    memories_used: [],
    memory_available: true,
    suggestions: [`Show me another ${topic} example`, `When should I avoid ${topic}?`],
  });

describe("suggested questions", () => {
  it("shows follow-ups under the newest reply, and clicking one asks it", async () => {
    chatHandler = replyAbout("SQL joins");
    renderApp();

    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "What is a join?{Enter}");
    const group = await screen.findByRole("group", { name: "Suggested questions" });
    await userEvent.click(within(group).getByRole("button", { name: "Show me another SQL joins example" }));

    await waitFor(() => expect(chatBodies).toHaveLength(2));
    expect(chatBodies[1]).toMatchObject({ message: "Show me another SQL joins example", suggest_followups: true });
  });

  it("keeps each chat's suggestions to itself", async () => {
    renderApp();
    const box = screen.getByRole("textbox", { name: "Message LearnLoop" });

    chatHandler = replyAbout("SQL joins");
    await userEvent.type(box, "What is a join?{Enter}");
    await screen.findByRole("button", { name: "Show me another SQL joins example" });

    await userEvent.keyboard("{Control>}{Shift>}o{/Shift}{/Control}"); // new chat, different topic
    chatHandler = replyAbout("Python lists");
    await userEvent.type(box, "What is a list?{Enter}");
    await screen.findByRole("button", { name: "Show me another Python lists example" });
    expect(screen.queryByRole("button", { name: "Show me another SQL joins example" })).not.toBeInTheDocument();

    // Back to the first chat: its own suggestions return.
    const chats = screen.getByRole("navigation", { name: "Chats" });
    await userEvent.click(within(chats).getByRole("button", { name: "What is a join?" }));
    expect(screen.getByRole("button", { name: "Show me another SQL joins example" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show me another Python lists example" })).not.toBeInTheDocument();
  });

  it("starts a new chat with ideas based on the learner's notes", async () => {
    starters = ["Can we practise SQL joins again?"];
    renderApp();

    expect(await screen.findByRole("button", { name: "Can we practise SQL joins again?" })).toBeInTheDocument();
    expect(screen.getByText("Ideas based on what you've been learning")).toBeInTheDocument();
  });

  it("shows general ideas to a learner without notes", async () => {
    renderApp();

    expect(await screen.findByRole("button", { name: /Explain recursion with one tiny example/ })).toBeInTheDocument();
    expect(screen.queryByText("Ideas based on what you've been learning")).not.toBeInTheDocument();
  });

  it("can be turned off in Settings", async () => {
    chatHandler = replyAbout("SQL joins");
    renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.click(screen.getByRole("tab", { name: "General" }));
    await userEvent.click(screen.getByRole("switch", { name: "Suggest questions" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "What is a join?{Enter}");

    await screen.findByText("Here is how SQL joins works.");
    expect(chatBodies[0]).toMatchObject({ suggest_followups: false });
    expect(screen.queryByRole("group", { name: "Suggested questions" })).not.toBeInTheDocument();
  });
});

describe("LearnLoop app", () => {
  it("sends a question, shows the reply and the notes it used, and saves the chat", async () => {
    renderApp();

    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "What is a base case?{Enter}");

    const log = await screen.findByRole("log", { name: "Conversation" });
    expect(await within(log).findByText("base case")).toBeInTheDocument();
    expect(within(log).getByText("What is a base case?")).toBeInTheDocument();
    expect(chatBodies[0]).toMatchObject({ user_id: "demo-student", message: "What is a base case?", use_memory: true });

    await userEvent.click(screen.getByRole("button", { name: /Used 1 note about you/ }));
    expect(screen.getByText("Learner struggles with recursion")).toBeInTheDocument();

    // The chat is listed in the sidebar and saved in the browser.
    expect(screen.getByRole("navigation", { name: "Chats" })).toHaveTextContent("What is a base case?");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.conversations[0].messages).toHaveLength(2);
  });

  it("sends earlier turns of the same chat as short-term history", async () => {
    renderApp();
    const box = screen.getByRole("textbox", { name: "Message LearnLoop" });

    await userEvent.type(box, "First question{Enter}");
    await screen.findByText("base case");
    await userEvent.type(box, "Second question{Enter}");
    await waitFor(() => expect(chatBodies).toHaveLength(2));

    expect(chatBodies[1].history).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "A **base case** stops the recursion." },
    ]);
  });

  it("shows the server's reason and a retry button when a reply fails", async () => {
    chatHandler = () => json({ detail: "Can't reach the AI model at http://localhost:11434/v1." }, 502);
    renderApp();

    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "Hello{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the AI model");
    chatHandler = () => json({ reply: "Hi again!", memories_used: [], memory_available: true });
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Hi again!")).toBeInTheDocument();
  });

  it("starts a new chat with Ctrl + Shift + O", async () => {
    renderApp();
    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "Hello{Enter}");
    await screen.findByText("base case");

    await userEvent.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");

    expect(screen.getByRole("heading", { level: 2, name: "What are we learning today?" })).toBeInTheDocument();
  });

  it("hides the sidebar, keeps New chat in the header, and shows the sidebar again", async () => {
    renderApp();

    await userEvent.click(screen.getByRole("button", { name: "Hide chats" }));
    expect(screen.queryByRole("navigation", { name: "Chats" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show chats" }));
    expect(screen.getByRole("navigation", { name: "Chats" })).toBeInTheDocument();
  });

  it("the memory button in the message box turns memory off for the next question", async () => {
    renderApp();

    // The toggle in the message box (the header shows the same words as a status, without aria-pressed).
    await userEvent.click(screen.getByRole("button", { name: "Memory on", pressed: true }));
    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "Hello{Enter}");

    await waitFor(() => expect(chatBodies[0]).toMatchObject({ use_memory: false }));
    expect(screen.getByRole("button", { name: "Memory off", pressed: false })).toBeInTheDocument();
  });
});
