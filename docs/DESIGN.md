# Design doc: LearnLoop

*Status: implemented (v0.1) · Author: you · Reviewers: (ask a friend or mentor to review this!)*

> Engineers at Google, Amazon and similar companies write a short design doc **before** building
> anything non-trivial. It forces you to state the problem, weigh alternatives and name the risks,
> and reviewers catch mistakes while they're still cheap to fix. This one is written after the
> fact as an example of the format. Write your own for the next feature (see LEARNING_PATH.md).

## 1. Context

Beginner programmers using AI tutors hit the same wall: every session starts from zero. The tutor
re-explains things they already know, forgets what confused them and can't track their progress.
Pasting the whole chat history back in doesn't scale. It grows without bound, costs more every
turn and still loses everything between sessions.

## 2. Goals and non-goals

**Goals**
- Personalise answers using what the tutor has learned about the learner across sessions.
- Produce an on-demand progress report grounded in the learner's actual history.
- Keep each learner's memories strictly isolated.
- Stay useful when a dependency is down (degrade, don't crash).
- Be testable without paid APIs or running servers.

**Non-goals (v0.1)**
- User accounts and authentication. `user_id` is trusted as given (see Risks).
- Horizontal scaling, multi-region, SLAs.
- Streaming responses.

## 3. Alternatives considered

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Send full chat history each turn | Trivial to build | Unbounded token cost; lost between sessions | Rejected for long-term memory; kept for **short-term** memory (last 12 messages) |
| Summarise history into one "profile" string | Cheap to read | Lossy; one bad summary corrupts everything; no timeline | Rejected |
| Vector RAG over past transcripts | Well-known pattern | Retrieves similar-looking text, not facts; weak on "when" and "what changed" questions | Rejected |
| **Hindsight memory** | Fact extraction, entity graph, temporal retrieval, reflect, per-bank isolation | Extra service to run; background LLM cost | **Chosen** |

## 4. Design

### 4.1 Request flow (`POST /api/chat`)
1. FastAPI validates the body. `user_id` must match `^[a-z0-9][a-z0-9-]{2,39}$`, because it becomes part of a bank ID.
2. `CoachService.chat` calls `MemoryStore.recall(user_id, message)`, which runs Hindsight `recall` on bank `learnloop-{user_id}` with `max_tokens=2000`, so memory can't flood the prompt.
3. The system prompt is built with the memories inside a `<memories>` block, HTML-escaped.
4. The OpenAI model generates the reply from the system prompt plus the trimmed recent history.
5. The exchange is retained with `retain_async=True`, so fact extraction happens off the request path.

### 4.2 Memory model
- **One bank per learner.** Isolation happens at the storage layer, not through filters that a bug could forget to apply.
- **`retain_mission`** tells Hindsight what matters to a tutor (goals, struggles, mistakes, preferences), so it doesn't store small talk.
- **Reflect with a JSON schema** (`ProgressReport`) returns structured data the UI can render, with a plain-text fallback.

### 4.3 Seams for testing
`MemoryStore` and `LLM` are `typing.Protocol` interfaces. Production wires in the Hindsight and
OpenAI classes. Tests wire in fakes through `create_app(coach=..., memory=...)`. The business
logic in `coach.py` never imports a vendor SDK.

### 4.4 Failure modes

| Failure | Behaviour |
|---|---|
| Hindsight unreachable during recall | Answer without memory, skip retain, set `memory_available=false`, UI shows a notice |
| Hindsight fails during retain | Reply is still returned; error logged |
| `OPENAI_API_KEY` missing | App refuses to start, with a message saying how to fix it |
| OpenAI unreachable, bad key or rate limited | SDK retries 429/5xx; then `502` with a clear message |
| Model refuses the request | A polite canned reply asking the learner to rephrase |
| Report or memories endpoint with Hindsight down | `503` |

## 5. Risks

- **No authentication.** Anyone who knows a `user_id` can read that learner's memories. That's acceptable for a local demo, but it is the first thing to fix before deploying publicly.
- **Prompt injection through memory.** A learner could say something that gets stored and later replayed as "instructions". Mitigations: memories are escaped, wrapped in a delimited block, and the prompt says they are data. This reduces the risk but does not remove it.
- **PII in memories.** Learners may paste secrets or personal data. Hindsight's *Memory Defense* can redact these at retain time. Not enabled yet.
- **Cost.** Each turn triggers background LLM extraction. Monitor usage and set spend limits.

## 6. Testing strategy
- Unit tests for the agent loop, including isolation, memory toggle, degradation, history trimming and escaping.
- API tests for validation, status codes and health reporting.
- An offline-capable CI pipeline, plus an online **evaluation** (`scripts/eval_memory.py`) that checks the core product claim: memory makes answers better.

## 7. Future work
See the exercises in [LEARNING_PATH.md](LEARNING_PATH.md).
