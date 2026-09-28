"""API tests: exercise the real FastAPI routes with fake dependencies."""

import pytest
from fastapi.testclient import TestClient

from app import main
from app.coach import CoachService
from app.config import Settings
from app.llm import LLMUnavailableError
from app.main import build_production_dependencies, create_app
from tests.fakes import FakeLLM, FakeMemoryStore


@pytest.fixture
def memory():
    return FakeMemoryStore()


@pytest.fixture
def client(memory):
    app = create_app(coach=CoachService(memory, FakeLLM(reply="Hi! Let's learn.")), memory=memory)
    with TestClient(app) as c:  # the context manager runs the app's startup/shutdown
        yield c


def test_chat_returns_reply_and_memories(client, memory):
    memory.banks["demo-student"] = ["Learner prefers short examples about python"]

    res = client.post("/api/chat", json={"user_id": "demo-student", "message": "Teach me python dicts"})

    assert res.status_code == 200
    body = res.json()
    assert body["reply"] == "Hi! Let's learn."
    assert body["memories_used"][0]["text"] == "Learner prefers short examples about python"
    assert body["memory_available"] is True


@pytest.mark.parametrize("bad_id", ["", "ab", "Alice", "../other-bank", "a" * 41])
def test_chat_rejects_unsafe_user_ids(client, bad_id):
    res = client.post("/api/chat", json={"user_id": bad_id, "message": "hi"})

    assert res.status_code == 422


def test_chat_returns_502_when_the_model_is_down(memory):
    llm = FakeLLM(error=LLMUnavailableError("outage"))
    with TestClient(create_app(coach=CoachService(memory, llm), memory=memory)) as client:
        res = client.post("/api/chat", json={"user_id": "demo-student", "message": "hi"})

    assert res.status_code == 502
    assert res.json()["detail"] == "The tutor model is unavailable right now"


def test_chat_shows_the_specific_reason_when_the_model_fails(memory):
    llm = FakeLLM(error=LLMUnavailableError("429 insufficient_quota", "Your OpenAI account has no credits left."))
    with TestClient(create_app(coach=CoachService(memory, llm), memory=memory)) as client:
        res = client.post("/api/chat", json={"user_id": "demo-student", "message": "hi"})

    assert res.status_code == 502
    assert res.json()["detail"] == "Your OpenAI account has no credits left."


def test_chat_rejects_empty_message(client):
    res = client.post("/api/chat", json={"user_id": "demo-student", "message": ""})

    assert res.status_code == 422


def test_memories_endpoint(client, memory):
    memory.banks["demo-student"] = ["Learner is building a todo app"]

    res = client.get("/api/users/demo-student/memories", params={"q": "what app is the learner building"})

    assert res.status_code == 200
    assert res.json()["memories"][0]["text"] == "Learner is building a todo app"


def test_memories_endpoint_returns_503_when_memory_is_down(client, memory):
    memory.fail_recall = True

    res = client.get("/api/users/demo-student/memories")

    assert res.status_code == 503


def test_healthz_reports_degraded_when_memory_is_down(client, memory):
    memory.healthy = False

    res = client.get("/healthz")

    assert res.json() == {"status": "degraded", "memory": False}


def test_index_page_is_served(client):
    res = client.get("/")

    assert res.status_code == 200
    assert "LearnLoop" in res.text


def test_startup_fails_fast_without_an_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("LEARNLOOP_OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(main, "get_settings", lambda: Settings(_env_file=None))

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is not set"):
        build_production_dependencies()
