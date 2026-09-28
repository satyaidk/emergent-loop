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

beforeEach(() => {
  chatBodies = [];
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

  it("the memory button in the message box turns memory off for the next question", async () => {
    renderApp();

    // The toggle in the message box (the header shows the same words as a status, without aria-pressed).
    await userEvent.click(screen.getByRole("button", { name: "Memory on", pressed: true }));
    await userEvent.type(screen.getByRole("textbox", { name: "Message LearnLoop" }), "Hello{Enter}");

    await waitFor(() => expect(chatBodies[0]).toMatchObject({ use_memory: false }));
    expect(screen.getByRole("button", { name: "Memory off", pressed: false })).toBeInTheDocument();
  });
});
