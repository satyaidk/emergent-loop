"""The core agent loop: recall -> think -> reply -> retain.

This is the business logic. It knows nothing about HTTP (that's main.py) or about which
memory/LLM vendor is used (that's memory.py / llm.py), which is what makes it easy to test.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from pydantic import BaseModel, Field

from app.llm import LLM, ChatMessage
from app.memory import Memory, MemoryStore
from app.prompts import REPORT_QUESTION, build_system_prompt, format_turn

logger = logging.getLogger(__name__)


class ProgressReport(BaseModel):
    """Structured output we ask Hindsight's reflect() to fill in."""

    summary: str = Field(description="Two or three sentences on where the learner is right now.")
    strengths: list[str] = Field(description="Topics or skills the learner has shown they understand.")
    struggles: list[str] = Field(description="Topics the learner found hard or keeps making mistakes on.")
    next_topics: list[str] = Field(description="The three topics to study next, most important first.")


@dataclass
class CoachReply:
    reply: str
    memories_used: list[Memory] = field(default_factory=list)
    memory_available: bool = True


class CoachService:
    def __init__(self, memory: MemoryStore, llm: LLM, max_history_messages: int = 12):
        self._memory = memory
        self._llm = llm
        self._max_history = max_history_messages

    async def chat(
        self,
        user_id: str,
        message: str,
        history: list[ChatMessage] | None = None,
        use_memory: bool = True,
    ) -> CoachReply:
        memories: list[Memory] = []
        memory_available = True

        # 1. RECALL: pull what we know about this learner that is relevant to their message.
        if use_memory:
            try:
                memories = await self._memory.recall(user_id, message)
            except Exception:
                # Graceful degradation: if the memory service is down, the tutor still
                # answers (just without personalisation) instead of the whole app failing.
                logger.exception("recall failed; answering without memory", extra={"user_id": user_id})
                memory_available = False

        # 2. THINK: the LLM sees long-term memory (system prompt) + short-term history (messages).
        messages = [*_trim_history(history or [], self._max_history), {"role": "user", "content": message}]
        reply = await self._llm.complete(build_system_prompt(memories), messages)

        # 3. RETAIN: store this exchange so future sessions can learn from it.
        if use_memory and memory_available:
            try:
                await self._memory.remember(user_id, format_turn(message, reply), context="tutoring session")
            except Exception:
                logger.exception("retain failed; this turn won't be remembered", extra={"user_id": user_id})

        return CoachReply(reply=reply, memories_used=memories, memory_available=memory_available)

    async def recall(self, user_id: str, query: str) -> list[Memory]:
        return await self._memory.recall(user_id, query)

    async def progress_report(self, user_id: str) -> ProgressReport:
        reflection = await self._memory.reflect(user_id, REPORT_QUESTION, schema=ProgressReport.model_json_schema())
        if reflection.structured:
            return ProgressReport.model_validate(reflection.structured)
        # The model didn't return valid structured output; still give the learner something useful.
        return ProgressReport(summary=reflection.text, strengths=[], struggles=[], next_topics=[])


def _trim_history(history: list[ChatMessage], limit: int) -> list[ChatMessage]:
    """Keep the most recent turns, starting on a learner turn so the model never sees half an exchange."""
    trimmed = history[-limit:] if limit > 0 else []
    while trimmed and trimmed[0]["role"] != "user":
        trimmed = trimmed[1:]
    return trimmed
