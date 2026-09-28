# LearnLoop: an AI tutor that remembers you

LearnLoop is a programming tutor for beginners that **learns about each student over time**.
It remembers what you struggled with last week, what project you're building and how you like
things explained, then uses that to personalise every answer and to write you a progress report.

Long-term memory is powered by [Hindsight](https://github.com/vectorize-io/hindsight), an agent
memory system, instead of plain chat history or a basic RAG vector store. The tutor's reasoning is
powered by any OpenAI-compatible model: OpenAI's `gpt-5-mini`, or a free model running on your own
computer with [Ollama](https://ollama.com).

```
You (3 weeks ago): "My factorial function crashes with RecursionError..."
You (today):       "Can you give me something to practise?"
LearnLoop:         "Last time recursion base cases tripped you up, so let's do one short
                    exercise on that. Here's a 4-line example you can run..."
```

## Why memory instead of chat history or RAG?

| Approach | What the agent knows next week | Problem |
|---|---|---|
| **Chat history** | Only the current conversation | Forgets everything when the tab closes; history grows until it no longer fits in the context window |
| **RAG (vector search over old chats)** | Chunks of text that *look similar* to the question | Retrieves raw transcripts, not facts. "What did I struggle with?" doesn't look like "RecursionError: maximum depth exceeded" |
| **Hindsight memory** | Extracted facts, entities, timelines and consolidated observations | Needs a memory server and uses extra LLM calls in the background |

Hindsight turns each conversation into structured facts (*"learner struggled with recursion base
cases, 14 days ago"*). It then retrieves them with four strategies in parallel (semantic, keyword,
entity graph, temporal) and can **reflect** across all of them to answer questions like *"what
should this learner study next?"*

## Architecture

```mermaid
flowchart LR
    UI[Browser UI<br/>static/index.html] -->|POST /api/chat| API[FastAPI<br/>main.py]
    API --> Coach[CoachService<br/>coach.py]
    Coach -->|1. recall| Mem[(Hindsight<br/>one bank per learner)]
    Coach -->|2. prompt with memories| LLM[OpenAI GPT<br/>llm.py]
    Coach -->|3. retain exchange, async| Mem
    API -->|GET /report → reflect| Mem
```

Each chat turn runs **recall → think → reply → retain**:

1. **Recall**: fetch memories relevant to the learner's message from *their* bank.
2. **Think**: the OpenAI model receives long-term memory (in the system prompt) plus short-term memory (recent turns).
3. **Reply**: the answer goes back to the browser, along with the memories that were used, for transparency.
4. **Retain**: the exchange is stored asynchronously, so the learner never waits on memory extraction.

Design decisions, alternatives and trade-offs are in [docs/DESIGN.md](docs/DESIGN.md).

## Quick start

You need **Docker Desktop**, plus one of these for the AI model:

- **Option A, OpenAI (paid):** an [OpenAI API key](https://platform.openai.com/api-keys) with credits.
- **Option B, Ollama (free, runs on your computer):** install [Ollama](https://ollama.com), then run
  `ollama pull qwen3:4b-instruct` (about 2.5 GB). No account or key needed.

```bash
cp .env.example .env          # then follow Option A or Option B inside it
docker compose up --build
```

With Ollama, answers depend on your hardware: expect a few seconds to a minute per reply on a laptop,
and a small model gives simpler answers than `gpt-5-mini`.

- App: http://localhost:8000
- API docs (auto-generated, interactive): http://localhost:8000/docs
- Hindsight memory explorer: http://localhost:9999

Give the demo learner some history, then chat as `demo-student` and click **Generate from memory**:

```bash
docker compose exec app python -m scripts.seed_demo
```

### Local development (hot reload)

Run Hindsight in Docker and the app on your machine (Windows PowerShell shown; use `source .venv/bin/activate` on macOS/Linux):

```powershell
docker compose up hindsight -d
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

## API

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/chat` | Chat turn. Body: `user_id`, `message`, optional `history`, `use_memory` |
| `GET` | `/api/users/{user_id}/memories?q=...` | Inspect what the tutor remembers about a learner |
| `GET` | `/api/users/{user_id}/report` | Structured progress report built with Hindsight `reflect` |
| `GET` | `/healthz` | Liveness, plus whether the memory service is reachable |

## Quality

```bash
pytest -q                     # 28 tests, run offline using fakes (no API key, no server)
ruff check . && ruff format --check .
python -m scripts.eval_memory # measures reply quality with memory ON vs OFF (needs the live stack)
```

CI (`.github/workflows/ci.yml`) runs lint, format check, tests and a Docker build on every push.

**Resilience:** if Hindsight is down, the tutor still answers without personalisation, and the UI
tells the user. If OpenAI is down, the API returns a clear `502` instead of crashing. If the API key
is missing, the app refuses to start and says so.

## Project layout

```
app/
  main.py      HTTP routes, app factory, dependency wiring
  coach.py     The agent loop: recall → think → reply → retain; progress reports
  memory.py    MemoryStore interface + Hindsight implementation (one bank per learner)
  llm.py       LLM interface + OpenAI implementation
  prompts.py   Prompt templates (memories are escaped to resist prompt injection)
  schemas.py   Validated request/response models
  config.py    Typed settings from environment variables
  static/      Single-page chat UI (no build step)
tests/         Unit + API tests with fake memory and LLM
scripts/       Demo seeding and the memory-vs-no-memory evaluation
docs/          Design doc and learning path
```

## Cost

With Ollama (Option B) everything runs on your computer and costs nothing.

With OpenAI (Option A), every chat turn is one OpenAI call for the reply plus background calls inside
Hindsight to extract facts (also on `gpt-5-mini` by default). The eval script makes about 10 OpenAI
calls. Set a monthly budget limit in your OpenAI account settings while you experiment.
`LEARNLOOP_EFFORT=minimal` gives cheaper, faster replies.

## License

MIT
