"""HTTP layer: routes, dependency wiring and the app lifecycle.

Run locally with:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi import Path as PathParam
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from hindsight_client import Hindsight

from app.coach import CoachService, ProgressReport
from app.config import get_settings
from app.llm import LLMUnavailableError, OpenAILLM
from app.memory import HindsightMemoryStore, Memory, MemoryStore, display_text
from app.schemas import (
    USER_ID_PATTERN,
    AppInfo,
    ChatRequest,
    ChatResponse,
    HealthResponse,
    MemoriesResponse,
    MemoryOut,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("learnloop")

# The React app (frontend/) builds into this folder; `npm run build` fills it.
STATIC_DIR = Path(__file__).parent / "static"


def present(memories: list[Memory]) -> list[MemoryOut]:
    """Memories as the web app shows them: readable text, each fact once, in the original order."""
    seen: set[str] = set()
    out: list[MemoryOut] = []
    for memory in memories:
        text = display_text(memory.text)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(MemoryOut(text=text, type=memory.type, occurred_at=memory.occurred_at))
    return out


NOT_BUILT_PAGE = """<!doctype html><meta charset="utf-8"><title>LearnLoop</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>LearnLoop API is running</h1>
<p>The web app hasn't been built yet. From the <code>frontend</code> folder run
<code>npm install</code> and <code>npm run build</code>, then reload this page.
For live editing, run <code>npm run dev</code> and open <a href="http://localhost:5173">localhost:5173</a>.</p>
<p>The API docs are at <a href="/docs">/docs</a>.</p></body>"""


def build_production_dependencies() -> tuple[CoachService, MemoryStore]:
    settings = get_settings()
    if settings.openai_api_key is None:
        # Fail fast: a clear message at startup beats a confusing error on the first chat.
        raise RuntimeError("OPENAI_API_KEY is not set. Copy .env.example to .env and paste your key into it.")
    hindsight = Hindsight(
        base_url=settings.hindsight_url,
        api_key=settings.hindsight_api_key.get_secret_value() if settings.hindsight_api_key else None,
    )
    memory = HindsightMemoryStore(
        client=hindsight,
        bank_prefix=settings.bank_prefix,
        recall_budget=settings.recall_budget,
        recall_max_tokens=settings.recall_max_tokens,
    )
    llm = OpenAILLM(
        api_key=settings.openai_api_key.get_secret_value(),
        model=settings.openai_model,
        effort=settings.effort,
        max_tokens=settings.max_tokens,
        base_url=settings.openai_base_url,
    )
    return CoachService(memory, llm, settings.max_history_messages), memory


def create_app(
    coach: CoachService | None = None,
    memory: MemoryStore | None = None,
    info: AppInfo | None = None,
    static_dir: Path = STATIC_DIR,
) -> FastAPI:
    """App factory. Tests pass in fakes; production builds the real Hindsight + OpenAI stack."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if coach is None or memory is None:
            app.state.coach, app.state.memory = build_production_dependencies()
            settings = get_settings()
            app.state.info = AppInfo(model=settings.openai_model, max_history_messages=settings.max_history_messages)
        else:
            app.state.coach, app.state.memory = coach, memory
            app.state.info = info or AppInfo(model="test-model", max_history_messages=12)
        yield
        await app.state.memory.close()

    app = FastAPI(
        title="LearnLoop",
        description="An AI programming tutor with long-term memory, built on Hindsight.",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info("%s %s -> %s in %.0fms", request.method, request.url.path, response.status_code, elapsed_ms)
        return response

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz(request: Request) -> HealthResponse:
        memory_ok = await request.app.state.memory.is_healthy()
        return HealthResponse(status="ok" if memory_ok else "degraded", memory=memory_ok)

    @app.get("/api/info", response_model=AppInfo)
    async def app_info(request: Request) -> AppInfo:
        return request.app.state.info

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(body: ChatRequest, request: Request) -> ChatResponse:
        try:
            result = await request.app.state.coach.chat(
                user_id=body.user_id,
                message=body.message,
                history=[turn.model_dump() for turn in body.history],
                use_memory=body.use_memory,
            )
        except LLMUnavailableError as exc:
            logger.error("chat failed: %s", exc)
            raise HTTPException(status_code=502, detail=exc.user_message) from exc
        return ChatResponse(
            reply=result.reply,
            memories_used=present(result.memories_used),
            memory_available=result.memory_available,
        )

    @app.get("/api/users/{user_id}/memories", response_model=MemoriesResponse)
    async def memories(
        request: Request,
        user_id: str = PathParam(pattern=USER_ID_PATTERN),
        q: str | None = Query(default=None, max_length=500, description="Search by relevance; omit to list everything"),
    ) -> MemoriesResponse:
        coach: CoachService = request.app.state.coach
        try:
            found = await coach.recall(user_id, q) if q else await coach.all_memories(user_id)
        except Exception as exc:
            logger.exception("memory lookup failed")
            raise HTTPException(status_code=503, detail="Memory service unavailable") from exc
        return MemoriesResponse(memories=present(found))

    @app.delete("/api/users/{user_id}/memories", status_code=204)
    async def forget(request: Request, user_id: str = PathParam(pattern=USER_ID_PATTERN)) -> Response:
        try:
            await request.app.state.coach.forget(user_id)
        except Exception as exc:
            logger.exception("forget failed")
            raise HTTPException(status_code=503, detail="Memory service unavailable") from exc
        logger.info("deleted all long-term memories for a learner")
        return Response(status_code=204)

    @app.get("/api/users/{user_id}/report", response_model=ProgressReport)
    async def report(request: Request, user_id: str = PathParam(pattern=USER_ID_PATTERN)) -> ProgressReport:
        try:
            return await request.app.state.coach.progress_report(user_id)
        except Exception as exc:
            logger.exception("progress report failed")
            raise HTTPException(status_code=503, detail="Memory service unavailable") from exc

    # The web app. "/" is checked on every request, so a fresh `npm run build` shows up without a restart.
    @app.get("/", include_in_schema=False)
    async def web_app() -> Response:
        index = static_dir / "index.html"
        return FileResponse(index) if index.is_file() else HTMLResponse(NOT_BUILT_PAGE)

    # Its scripts, styles and icons. Mounted last, because a mount at "/" matches every path.
    static_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/", StaticFiles(directory=static_dir), name="web")

    return app


app = create_app()
