"""Suggested questions: follow-ups at the end of each answer, and starters for a new chat."""

import pytest
from fastapi.testclient import TestClient

from app.coach import CoachService
from app.llm import LLMUnavailableError
from app.main import create_app
from app.suggestions import split_followups
from tests.fakes import FakeLLM, FakeMemoryStore

ANSWER_WITH_FOLLOWUPS = """Use WHERE to keep only matching rows:

```sql
SELECT * FROM staff WHERE department = 'Sales';
```

<follow-ups>
- What if I want two departments?
- How do I sort the result?
- Can I use WHERE with numbers?
</follow-ups>"""


# ---- parsing what the model wrote ----


def test_splits_the_follow_ups_off_the_answer():
    answer, suggestions = split_followups(ANSWER_WITH_FOLLOWUPS)

    assert answer.endswith("```")
    assert "<follow-ups>" not in answer
    assert suggestions == [
        "What if I want two departments?",
        "How do I sort the result?",
        "Can I use WHERE with numbers?",
    ]


def test_an_answer_without_follow_ups_is_left_alone():
    assert split_followups("Just an answer.") == ("Just an answer.", [])


@pytest.mark.parametrize(
    "block",
    [
        "<follow-ups>\n1. First?\n2) Second?\n* Third?\n</follow-ups>",
        '<FOLLOW-UPS>\n- "First?"\n- First?\n- Second?\n\n- Third?\n</FOLLOW-UPS>',
        "<follow-ups>\n- First?\n- Second?\n- Third?",  # closing tag cut off
    ],
)
def test_tolerates_the_ways_a_small_model_gets_the_format_slightly_wrong(block):
    answer, suggestions = split_followups(f"Answer.\n{block}")

    assert answer == "Answer."
    assert suggestions == ["First?", "Second?", "Third?"]


def test_keeps_at_most_three_and_drops_rambling_lines():
    rambling = "x" * 200
    block = f"<follow-ups>\n- A?\n- {rambling}\n- B?\n- C?\n- D?\n</follow-ups>"

    assert split_followups(block)[1] == ["A?", "B?", "C?"]


# ---- the tutoring loop ----


async def test_chat_returns_follow_ups_and_keeps_them_out_of_the_answer_and_memory():
    memory, llm = FakeMemoryStore(), FakeLLM(reply=ANSWER_WITH_FOLLOWUPS)

    result = await CoachService(memory, llm).chat("alice", "How do I filter rows in SQL?")

    assert result.suggestions[0] == "What if I want two departments?"
    assert "<follow-ups>" not in result.reply
    assert "<follow-ups>" not in memory.banks["alice"][0]
    assert "THIS conversation only" in llm.calls[0]["system"]


async def test_follow_ups_can_be_turned_off():
    memory, llm = FakeMemoryStore(), FakeLLM(reply=ANSWER_WITH_FOLLOWUPS)

    result = await CoachService(memory, llm).chat("alice", "How do I filter rows?", suggest=False)

    assert result.suggestions == []
    assert "<follow-ups>" not in llm.calls[0]["system"]
    assert "<follow-ups>" not in result.reply  # stripped even if the model adds them anyway


async def test_starters_come_from_the_learners_notes():
    memory = FakeMemoryStore()
    memory.banks["alice"] = ["Learner struggles with SQL joins | When: 2026-09-28 | Involving: user"]
    llm = FakeLLM(reply="<follow-ups>\n- Can we practise joins again?\n- What is a LEFT JOIN?\n</follow-ups>")

    starters = await CoachService(memory, llm).starters("alice", count=2)

    assert starters == ["Can we practise joins again?", "What is a LEFT JOIN?"]
    assert "Learner struggles with SQL joins" in llm.calls[0]["system"]
    assert "When:" not in llm.calls[0]["system"]  # annotations are removed before the model sees them


async def test_a_learner_without_notes_gets_no_starters_and_no_model_call():
    llm = FakeLLM()

    assert await CoachService(FakeMemoryStore(), llm).starters("new-learner") == []
    assert llm.calls == []


# ---- the API ----


def make_client(memory, llm):
    return TestClient(create_app(coach=CoachService(memory, llm), memory=memory))


def test_chat_api_returns_suggestions():
    with make_client(FakeMemoryStore(), FakeLLM(reply=ANSWER_WITH_FOLLOWUPS)) as client:
        body = client.post("/api/chat", json={"user_id": "demo-student", "message": "Filter rows?"}).json()

    assert len(body["suggestions"]) == 3
    assert "<follow-ups>" not in body["reply"]


def test_starters_api():
    memory = FakeMemoryStore()
    memory.banks["demo-student"] = ["Learner is building a todo app"]
    llm = FakeLLM(reply="<follow-ups>\n- How do I save todos to a file?\n</follow-ups>")
    with make_client(memory, llm) as client:
        res = client.get("/api/users/demo-student/starters", params={"count": 3})

    assert res.json() == {"suggestions": ["How do I save todos to a file?"]}


def test_starters_api_reports_a_model_outage_and_a_memory_outage():
    memory = FakeMemoryStore()
    memory.banks["demo-student"] = ["Learner is building a todo app"]
    with make_client(memory, FakeLLM(error=LLMUnavailableError("down"))) as client:
        assert client.get("/api/users/demo-student/starters").status_code == 502

    with make_client(FakeMemoryStore(fail_recall=True), FakeLLM()) as client:
        assert client.get("/api/users/demo-student/starters").status_code == 503
