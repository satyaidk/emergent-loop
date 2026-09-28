"""Tests for how OpenAI errors are turned into messages a learner can act on."""

import httpx2
import openai
import pytest

from app.llm import LLMUnavailableError, OpenAILLM


def _llm_raising(error: Exception) -> OpenAILLM:
    llm = OpenAILLM(api_key="test-key", model="gpt-5-mini", effort="low", max_tokens=100)

    async def fail(**_kwargs):
        raise error

    llm._client.chat.completions.create = fail  # no network: the call fails immediately
    return llm


async def test_unreachable_server_says_where_it_looked():
    request = httpx2.Request("POST", "http://localhost:11434/v1/chat/completions")
    llm = OpenAILLM(
        api_key="ollama", model="qwen3:4b-instruct", effort=None, max_tokens=100, base_url="http://localhost:11434/v1"
    )

    async def fail(**_kwargs):
        raise openai.APIConnectionError(request=request)

    llm._client.chat.completions.create = fail

    with pytest.raises(LLMUnavailableError) as caught:
        await llm.complete("system", [{"role": "user", "content": "hi"}])

    assert "http://localhost:11434/v1" in caught.value.user_message
    assert "Ollama" in caught.value.user_message


async def test_effort_is_left_out_when_unset():
    llm = OpenAILLM(api_key="ollama", model="qwen3:4b-instruct", effort=None, max_tokens=100)
    sent = {}

    async def capture(**kwargs):
        sent.update(kwargs)
        raise openai.APIConnectionError(request=httpx2.Request("POST", "http://x"))

    llm._client.chat.completions.create = capture

    with pytest.raises(LLMUnavailableError):
        await llm.complete("system", [{"role": "user", "content": "hi"}])

    assert sent["reasoning_effort"] is openai.omit


def _rate_limit_error(code: str, type: str = "requests") -> openai.RateLimitError:
    response = httpx2.Response(429, request=httpx2.Request("POST", "https://api.openai.com/v1/chat/completions"))
    return openai.RateLimitError("rate limited", response=response, body={"code": code, "type": type})


# Shapes OpenAI has used for "your balance is empty"; the second one came from a real account.
@pytest.mark.parametrize(
    "error",
    [
        _rate_limit_error("insufficient_quota", type="insufficient_quota"),
        _rate_limit_error("credit_balance_exhausted", type="insufficient_quota"),
    ],
)
async def test_no_credits_gives_a_billing_message(error):
    llm = _llm_raising(error)

    with pytest.raises(LLMUnavailableError) as caught:
        await llm.complete("system", [{"role": "user", "content": "hi"}])

    assert "no credits" in caught.value.user_message
    assert "platform.openai.com/settings/organization/billing" in caught.value.user_message


async def test_ordinary_rate_limit_asks_the_user_to_wait():
    llm = _llm_raising(_rate_limit_error("rate_limit_exceeded"))

    with pytest.raises(LLMUnavailableError) as caught:
        await llm.complete("system", [{"role": "user", "content": "hi"}])

    assert "Wait a minute" in caught.value.user_message
