"""LLM layer: the tutor's reasoning.

It speaks the OpenAI chat API, which many providers copy. The same code therefore works
with OpenAI itself or with a model running on your own computer through Ollama; only the
base URL and model name in .env change.

Like memory.py, the app depends on the small `LLM` interface, so tests use a fake and
never call a real model.
"""

from __future__ import annotations

from typing import Literal, Protocol, TypedDict

import openai

REFUSAL_REPLY = "I can't help with that one. Could you rephrase, or ask about a different topic?"


class ChatMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class LLMUnavailableError(Exception):
    """The model couldn't be reached (network, auth, rate limit, outage).

    The exception message is for logs. `user_message` is safe to show in the browser.
    """

    def __init__(self, detail: str, user_message: str = "The tutor model is unavailable right now"):
        super().__init__(detail)
        self.user_message = user_message


class LLM(Protocol):
    async def complete(self, system: str, messages: list[ChatMessage]) -> str: ...


class OpenAILLM:
    """Any OpenAI-compatible chat API: OpenAI by default, or Ollama when base_url points at it."""

    def __init__(self, api_key: str, model: str, effort: str | None, max_tokens: int, base_url: str | None = None):
        self._client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url or None)
        self._server = base_url or "https://api.openai.com/v1"
        self._model = model
        self._effort = effort
        self._max_tokens = max_tokens

    async def complete(self, system: str, messages: list[ChatMessage]) -> str:
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, *messages],
                # How long a reasoning model "thinks" first. Left out when unset, since
                # models without a thinking mode (like most small local ones) reject it.
                reasoning_effort=self._effort or openai.omit,
                max_completion_tokens=self._max_tokens,
            )
        except openai.APIConnectionError as exc:
            raise LLMUnavailableError(
                f"Can't reach {self._server}: {exc}",
                f"Can't reach the AI model at {self._server}. If you use Ollama, check that it is running.",
            ) from exc
        except openai.NotFoundError as exc:
            raise LLMUnavailableError(
                f"Model {self._model!r} not found: {exc}",
                f"The model '{self._model}' isn't available. With Ollama, download it with: ollama pull {self._model}",
            ) from exc
        except openai.AuthenticationError as exc:
            raise LLMUnavailableError(
                "The API key was rejected", "The API key was rejected. Check OPENAI_API_KEY in your .env file."
            ) from exc
        except openai.RateLimitError as exc:
            # OpenAI reports an empty balance with type "insufficient_quota" and one of several codes.
            if exc.type == "insufficient_quota" or exc.code in ("insufficient_quota", "credit_balance_exhausted"):
                raise LLMUnavailableError(
                    f"OpenAI account has no credits: {exc}",
                    "Your OpenAI account has no credits left. Add some at "
                    "https://platform.openai.com/settings/organization/billing and try again.",
                ) from exc
            raise LLMUnavailableError(
                f"Rate limit: {exc}", "Too many requests to the AI model. Wait a minute and try again."
            ) from exc
        except openai.APIError as exc:  # the SDK already retried rate limits and 5xx errors
            raise LLMUnavailableError(f"Model request failed: {exc}") from exc
        message = response.choices[0].message
        if message.refusal:
            return REFUSAL_REPLY
        return message.content or ""
