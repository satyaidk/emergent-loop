"""Test doubles that stand in for Hindsight and OpenAI.

They implement the same interfaces as the real classes, so CoachService can't tell the
difference, but they run instantly, cost nothing and need no network.
"""

from __future__ import annotations

from typing import Any

from app.memory import Memory, Reflection


class FakeMemoryStore:
    def __init__(self, healthy: bool = True, fail_recall: bool = False):
        self.banks: dict[str, list[str]] = {}
        self.healthy = healthy
        self.fail_recall = fail_recall
        self.reflect_result = Reflection(text="", structured=None)

    async def remember(self, user_id: str, content: str, context: str) -> None:
        self.banks.setdefault(user_id, []).append(content)

    async def recall(self, user_id: str, query: str) -> list[Memory]:
        if self.fail_recall:
            raise ConnectionError("hindsight is down")
        # Crude keyword overlap is enough to exercise the flow; real Hindsight does much more.
        words = {w.lower().strip("?.,!") for w in query.split() if len(w) > 3}
        return [Memory(text=m) for m in self.banks.get(user_id, []) if words & set(m.lower().split())]

    async def reflect(self, user_id: str, question: str, schema: dict[str, Any] | None = None) -> Reflection:
        return self.reflect_result

    async def is_healthy(self) -> bool:
        return self.healthy

    async def close(self) -> None:
        pass


class FakeLLM:
    """Records what it was sent and returns a canned reply."""

    def __init__(self, reply: str = "Here's how list slicing works...", error: Exception | None = None):
        self.reply = reply
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def complete(self, system: str, messages: list[dict[str, Any]]) -> str:
        self.calls.append({"system": system, "messages": messages})
        if self.error:
            raise self.error
        return self.reply
