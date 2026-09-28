"""API tests: exercise the real FastAPI routes with fake dependencies."""

import pytest
from fastapi.testclient import TestClient

from app import main
from app.coach import CoachService
from app.config import Settings
from app.llm import LLMUnavailableError
from app.main import build_production_dependencies, create_app
from app.schemas import AppInfo
from tests.fakes import FakeLLM, FakeMemoryStore


@pytest.fixture
def memory():
    return FakeMemoryStore()


@pytest.fixture
def web_dir(tmp_path):
    """A stand-in for the built React app (frontend/ builds into app/static)."""
    (tmp_path / "index.html").write_text("<title>LearnLoop</title><div id=root></div>", encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('hi')", encoding="utf-8")
    return tmp_path


@pytest.fixture
def client(memory, web_dir):
    app = create_app(
        coach=CoachService(memory, FakeLLM(reply="Hi! Let's learn.")),
        memory=memory,
        info=AppInfo(model="qwen3:4b-instruct", max_history_messages=12),
        static_dir=web_dir,
    )
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


def test_web_app_and_its_assets_are_served(client):
    page = client.get("/")
    script = client.get("/assets/app.js")

    assert page.status_code == 200
    assert "<div id=root>" in page.text
    assert script.status_code == 200


def test_api_routes_still_win_over_the_web_app(client):
    res = client.get("/healthz")

    assert res.headers["content-type"].startswith("application/json")


def test_explains_how_to_build_when_the_web_app_is_missing(memory, tmp_path):
    app = create_app(coach=CoachService(memory, FakeLLM()), memory=memory, static_dir=tmp_path / "not-built")
    with TestClient(app) as c:
        res = c.get("/")

    assert res.status_code == 200
    assert "npm run build" in res.text


def test_info_reports_model_and_history_limit(client):
    res = client.get("/api/info")

    assert res.json() == {"version": "0.1.0", "model": "qwen3:4b-instruct", "max_history_messages": 12}


def test_memories_without_a_query_lists_everything(client, memory):
    memory.banks["demo-student"] = ["Learner is building a todo app", "Learner prefers short examples"]

    res = client.get("/api/users/demo-student/memories")

    assert [m["text"] for m in res.json()["memories"]] == [
        "Learner is building a todo app",
        "Learner prefers short examples",
    ]


def test_memories_are_shown_without_annotations_and_without_duplicates(client, memory):
    memory.banks["demo-student"] = [
        "Learner is learning Python | When: 2026-09-28 | Involving: user (learner)",
        "Learner is learning Python | When: 2026-09-29 | Involving: user (Python learner)",
        "Learner prefers short examples",
    ]

    res = client.get("/api/users/demo-student/memories")

    texts = [m["text"] for m in res.json()["memories"]]
    assert texts == ["Learner is learning Python", "Learner prefers short examples"]


def test_forget_deletes_every_memory_for_that_learner_only(client, memory):
    memory.banks["demo-student"] = ["Learner is building a todo app"]
    memory.banks["other-student"] = ["Other learner likes SQL"]

    res = client.delete("/api/users/demo-student/memories")

    assert res.status_code == 204
    assert "demo-student" not in memory.banks
    assert memory.banks["other-student"] == ["Other learner likes SQL"]


def test_forget_rejects_unsafe_user_ids(client, memory):
    memory.banks["demo-student"] = ["Learner is building a todo app"]

    res = client.delete("/api/users/Demo_Student/memories")

    assert res.status_code == 422
    assert memory.banks["demo-student"] == ["Learner is building a todo app"]


def test_startup_fails_fast_without_an_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("LEARNLOOP_OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(main, "get_settings", lambda: Settings(_env_file=None))

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is not set"):
        build_production_dependencies()
