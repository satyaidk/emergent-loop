"""LLM layer: the tutor's reasoning, powered by an OpenAI model.

Like memory.py, the app depends on the small `LLM` interface, so tests use a fake and
never call a paid API.
"""

from __future__ import annotations

from typing import Literal, Protocol, TypedDict

import openai

REFUSAL_REPLY = "I can't help with that one. Could you rephrase, or ask about a different topic?"


class ChatMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class LLMUnavailableError(Exception):
    """The model couldn't be reached (network, auth, rate limit, outage)."""


class LLM(Protocol):
    async def complete(self, system: str, messages: list[ChatMessage]) -> str: ...


class OpenAILLM:
    def __init__(self, api_key: str, model: str, effort: str, max_tokens: int):
        self._client = openai.AsyncOpenAI(api_key=api_key)
        self._model = model
        self._effort = effort
        self._max_tokens = max_tokens

    async def complete(self, system: str, messages: list[ChatMessage]) -> str:
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, *messages],
                reasoning_effort=self._effort,  # how long the model "thinks" before answering
                max_completion_tokens=self._max_tokens,
            )
        except openai.AuthenticationError as exc:
            raise LLMUnavailableError("OpenAI rejected the API key; check OPENAI_API_KEY") from exc
        except openai.APIError as exc:  # the SDK already retried rate limits and 5xx errors
            raise LLMUnavailableError(f"OpenAI request failed: {exc}") from exc
        message = response.choices[0].message
        if message.refusal:
            return REFUSAL_REPLY
        return message.content or ""
