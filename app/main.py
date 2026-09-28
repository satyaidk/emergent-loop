"""HTTP layer: routes, dependency wiring and the app lifecycle.

Run locally with:  uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as PathParam
from fastapi.responses import FileResponse
from hindsight_client import Hindsight

from app.coach import CoachService, ProgressReport
from app.config import get_settings
from app.llm import LLMUnavailableError, OpenAILLM
from app.memory import HindsightMemoryStore, MemoryStore
from app.schemas import USER_ID_PATTERN, ChatRequest, ChatResponse, HealthResponse, MemoriesResponse, MemoryOut

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("learnloop")

STATIC_DIR = Path(__file__).parent / "static"


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


def create_app(coach: CoachService | None = None, memory: MemoryStore | None = None) -> FastAPI:
    """App factory. Tests pass in fakes; production builds the real Hindsight + OpenAI stack."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if coach is None or memory is None:
            app.state.coach, app.state.memory = build_production_dependencies()
        else:
            app.state.coach, app.state.memory = coach, memory
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

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz(request: Request) -> HealthResponse:
        memory_ok = await request.app.state.memory.is_healthy()
        return HealthResponse(status="ok" if memory_ok else "degraded", memory=memory_ok)

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
            memories_used=[MemoryOut(**asdict(m)) for m in result.memories_used],
            memory_available=result.memory_available,
        )

    @app.get("/api/users/{user_id}/memories", response_model=MemoriesResponse)
    async def memories(
        request: Request,
        user_id: str = PathParam(pattern=USER_ID_PATTERN),
        q: str = Query(default="What do I know about this learner?", max_length=500),
    ) -> MemoriesResponse:
        try:
            found = await request.app.state.coach.recall(user_id, q)
        except Exception as exc:
            logger.exception("memory lookup failed")
            raise HTTPException(status_code=503, detail="Memory service unavailable") from exc
        return MemoriesResponse(memories=[MemoryOut(**asdict(m)) for m in found])

    @app.get("/api/users/{user_id}/report", response_model=ProgressReport)
    async def report(request: Request, user_id: str = PathParam(pattern=USER_ID_PATTERN)) -> ProgressReport:
        try:
            return await request.app.state.coach.progress_report(user_id)
        except Exception as exc:
            logger.exception("progress report failed")
            raise HTTPException(status_code=503, detail="Memory service unavailable") from exc

    return app


app = create_app()
