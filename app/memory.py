"""Long-term memory layer.

`MemoryStore` is an interface (a typing.Protocol). The rest of the app only talks to
this interface, never to Hindsight directly. That gives us two things:

1. Tests can swap in a fake in-memory store: fast, free, and no server needed.
2. If we ever change memory vendors, only this file changes.

Each learner gets their own Hindsight *bank*, so memories never leak between users.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from hindsight_client import Hindsight

logger = logging.getLogger(__name__)

# Steers what Hindsight extracts when we call retain(). Without this it would store
# every detail of every chat; with it, it focuses on what a tutor actually needs.
RETAIN_MISSION = (
    "You are the memory of a programming tutor. Extract durable facts about the learner: "
    "their goals, current skill level, topics they understood, topics they struggled with "
    "(and why), mistakes they repeat, projects they are building, and how they prefer to learn. "
    "Ignore small talk and the tutor's generic explanations."
)

REFLECT_MISSION = (
    "You are an experienced programming mentor reviewing a learner's history. "
    "Be specific, honest and encouraging, and ground every claim in the learner's memories."
)


def bank_id_for(user_id: str, prefix: str) -> str:
    """One Hindsight bank per learner: strict isolation, no cross-user leakage."""
    return f"{prefix}-{user_id}"


@dataclass
class Memory:
    text: str
    type: str | None = None  # "world" | "experience" | "observation"
    occurred_at: str | None = None


@dataclass
class Reflection:
    text: str
    structured: dict[str, Any] | None = None


class MemoryStore(Protocol):
    async def remember(self, user_id: str, content: str, context: str) -> None: ...

    async def recall(self, user_id: str, query: str) -> list[Memory]: ...

    async def reflect(self, user_id: str, question: str, schema: dict[str, Any] | None = None) -> Reflection: ...

    async def is_healthy(self) -> bool: ...

    async def close(self) -> None: ...


@dataclass
class HindsightMemoryStore:
    """MemoryStore backed by a Hindsight server."""

    client: Hindsight
    bank_prefix: str = "learnloop"
    recall_budget: str = "mid"
    recall_max_tokens: int = 2000
    _configured_banks: set[str] = field(default_factory=set)

    def bank_id(self, user_id: str) -> str:
        return bank_id_for(user_id, self.bank_prefix)

    async def _ensure_bank(self, user_id: str) -> str:
        """Configure the learner's bank once per process (banks auto-create, but we want our missions set)."""
        bank_id = self.bank_id(user_id)
        if bank_id not in self._configured_banks:
            await self.client.acreate_bank(bank_id, retain_mission=RETAIN_MISSION, reflect_mission=REFLECT_MISSION)
            self._configured_banks.add(bank_id)
        return bank_id

    async def remember(self, user_id: str, content: str, context: str) -> None:
        bank_id = await self._ensure_bank(user_id)
        # retain_async=True: Hindsight extracts facts in the background, so the learner
        # gets their reply without waiting on an extra LLM call.
        await self.client.aretain(
            bank_id=bank_id,
            content=content,
            context=context,
            timestamp=datetime.now(UTC),
            retain_async=True,
        )

    async def recall(self, user_id: str, query: str) -> list[Memory]:
        bank_id = await self._ensure_bank(user_id)
        response = await self.client.arecall(
            bank_id=bank_id,
            query=query,
            budget=self.recall_budget,
            max_tokens=self.recall_max_tokens,
        )
        return [Memory(text=r.text, type=r.type, occurred_at=r.occurred_start) for r in response.results]

    async def reflect(self, user_id: str, question: str, schema: dict[str, Any] | None = None) -> Reflection:
        bank_id = await self._ensure_bank(user_id)
        response = await self.client.areflect(bank_id=bank_id, query=question, budget="mid", response_schema=schema)
        return Reflection(text=response.text, structured=response.structured_output)

    async def is_healthy(self) -> bool:
        try:
            await self.client.aget_version()
            return True
        except Exception:  # health checks report failure; they never raise
            logger.warning("Hindsight health check failed", exc_info=True)
            return False

    async def close(self) -> None:
        await self.client.aclose()
