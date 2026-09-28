# Learning path: from "it runs" to "I can explain every line in an interview"

This project was scaffolded for you. **A resume project only counts if you can defend it.** An
interviewer will ask "why did you do X?" and "what would you change?" Work through these stages
in order. Each one adds a skill that big-tech teams expect.

---

## Stage 0: Get it running (day 1)

- [ ] Install Docker Desktop and get an OpenAI API key. Set a monthly budget limit in your OpenAI account.
- [ ] `cp .env.example .env`, add your key, then `docker compose up --build`.
- [ ] Seed the demo learner (`docker compose exec app python -m scripts.seed_demo`), chat as `demo-student`, and generate a report.
- [ ] Open the Hindsight UI at http://localhost:9999 and find the facts and entities it extracted. **Compare them with the raw conversations in `scripts/demo_data.py`.** This is the "memory vs RAG" difference in action.
- [ ] Chat as a brand-new learner id and compare. Toggle memory off and compare again.

**Learn:** virtual environments, environment variables and secrets, what a container is, ports.

## Stage 1: Put it on GitHub properly (day 1)

- [ ] `git init`, first commit, push to a **public** GitHub repo. Check that `.env` did **not** get committed.
- [ ] From now on: one branch per feature → pull request → CI passes → merge. Review your own PR's diff before merging.
- [ ] Write commit messages that say *why*, e.g. `Degrade gracefully when Hindsight is down`, not `fix stuff`.

**Learn:** git branching, pull requests, reading CI results. Big-tech engineers spend a lot of their time in code review.

## Stage 2: Read the code in request order (days 2–3)

Read in this order, and for each file write one sentence in your own words on what it does:
`main.py` → `schemas.py` → `coach.py` → `memory.py` → `prompts.py` → `llm.py` → `config.py`.

Then answer these without looking:
1. Why do `MemoryStore` and `LLM` exist as interfaces instead of calling Hindsight or OpenAI directly? (Hint: open `tests/fakes.py`.)
2. Why is retain called with `retain_async=True` but the seed script uses `retain_async=False`?
3. What happens, step by step, if Hindsight is down when a user chats? Find the test that proves it.
4. Why is `user_id` restricted by a regex? What could go wrong without it?
5. Why are memories HTML-escaped before going into the prompt?
6. What's the difference between short-term memory (`history`) and long-term memory (Hindsight) here?

**Learn:** layered architecture, dependency injection, async I/O, input validation, prompt injection.

## Stage 3: Build features yourself (weeks 1–4)

Pick them in order. **Write a short design doc first** (copy the format of `DESIGN.md`: problem, options, decision, risks). Add tests for every feature.

| # | Feature | Skill it proves | Hints |
|---|---|---|---|
| 1 | **Run the eval and record the numbers** | Measuring impact | `python -m scripts.eval_memory`. Put the before/after score in the README. Numbers make resume bullets credible. |
| 2 | **Learner profile card** in the sidebar | Using an API from its docs | Hindsight *mental models*: `acreate_mental_model(bank_id, name="Learner profile", source_query="Summarise this learner's goals, level and preferences", trigger={"refresh_after_consolidation": True})`, then read it with `aget_mental_model(..., detail="content")`. It's a stored answer that Hindsight keeps up to date, so reading it costs no LLM call. |
| 3 | **Courses / topics** (Python vs SQL) | Data modelling, filtering | Pass `tags=["course:python"]` to `aretain`, and `tags=[...]`, `tags_match="any_strict"` to `arecall`. |
| 4 | **Streaming replies** (text appears word by word) | Async streaming, better UX | OpenAI SDK `client.chat.completions.create(..., stream=True)` + FastAPI `StreamingResponse` (server-sent events) + `fetch` stream reader in JS. |
| 5 | **Authentication** | Security | Start with a simple API key header check, then real login (e.g. OAuth with GitHub). `user_id` should come from the logged-in user, never from the request body. Fixes Risk #1 in the design doc. |
| 6 | **LLM-as-judge eval** | Evaluation rigour | Replace keyword matching in `eval_memory.py` with a second OpenAI call that grades each reply against a rubric. Add 20+ cases. |
| 7 | **Rate limiting + metrics** | Production readiness | Limit requests per user; expose latency and error counts (Prometheus `/metrics` or OpenTelemetry). |
| 8 | **PII redaction** | Privacy | Turn on Hindsight *Memory Defense* for learner banks: https://hindsight.vectorize.io/developer/memory-defense |
| 9 | **Deploy it** | Cloud | Put the app on a cloud host (Render, Fly.io, Google Cloud Run) and use Hindsight Cloud or a hosted Postgres. A live link on your resume is worth a lot. |

## Stage 4: Explain it (ongoing)

Practise answering these out loud in 2 minutes each:

- *"Walk me through what happens when a user sends a message."* (Use the architecture diagram.)
- *"Why not just use RAG?"* (Facts vs chunks, temporal questions, reflect. See the README table.)
- *"How do you know memory actually helps?"* (Your eval numbers from Stage 3 #1.)
- *"What happens when a dependency fails?"* (Failure-modes table in DESIGN.md.)
- *"What would you change to support 1 million learners?"* Think about: stateless app servers behind a load balancer; the `_configured_banks` cache is per-process (fine, since the call is idempotent); Hindsight on managed Postgres; queue-based retain; per-user rate limits; caching the learner profile.
- *"What was the hardest bug?"* Keep notes as you build. You'll forget otherwise.

## Concepts glossary

- **Retain / Recall / Reflect**: Hindsight's three operations: store, search, reason.
- **Bank**: an isolated memory store; here, one per learner.
- **Observation**: a belief Hindsight consolidates from many facts, with evidence.
- **Mental model**: a question you define once; Hindsight keeps its answer current.
- **Graceful degradation**: losing a feature, not the whole product, when a dependency fails.
- **Dependency injection**: passing collaborators in (like `create_app(coach=...)`) instead of constructing them inside, which makes code testable.
- **Test double / fake**: a stand-in implementation used in tests.
