"""Request/response shapes for the HTTP API.

FastAPI validates every request against these models before our code runs, and uses
them to generate the interactive docs at /docs.
"""

from typing import Literal

from pydantic import BaseModel, Field

# user_id becomes part of a Hindsight bank id, so we only allow a safe character set.
USER_ID_PATTERN = r"^[a-z0-9][a-z0-9-]{2,39}$"


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    user_id: str = Field(pattern=USER_ID_PATTERN, examples=["demo-student"])
    message: str = Field(min_length=1, max_length=4000)
    history: list[Turn] = Field(default_factory=list, max_length=40)
    use_memory: bool = True


class MemoryOut(BaseModel):
    text: str
    type: str | None = None
    occurred_at: str | None = None


class ChatResponse(BaseModel):
    reply: str
    memories_used: list[MemoryOut]
    memory_available: bool


class MemoriesResponse(BaseModel):
    memories: list[MemoryOut]


class AppInfo(BaseModel):
    """Read-only server facts the web app shows in Settings."""

    version: str = "0.1.0"
    model: str
    max_history_messages: int


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    memory: bool
