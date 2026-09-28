"""A fake learner's past tutoring sessions, used by the seed and eval scripts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hindsight_client import Hindsight

from app.memory import REFLECT_MISSION, RETAIN_MISSION

_NOW = datetime.now(UTC)

# (days ago, conversation)
PAST_SESSIONS: list[tuple[int, str]] = [
    (
        21,
        "Learner: Hi! I know basic Python (variables, if/else, for loops). My goal is to land a backend "
        "internship next summer. I'm building a command-line todo-list app to practise.\n"
        "Tutor: Great goal. A todo CLI is a good first project; let's add features step by step.",
    ),
    (
        14,
        "Learner: My factorial function crashes with RecursionError: maximum recursion depth exceeded.\n"
        "Tutor: You forgot the base case. factorial(n) must return 1 when n <= 1, otherwise it calls itself forever.\n"
        "Learner: I still don't really get how the calls unwind back up. Recursion is confusing me.",
    ),
    (
        10,
        "Learner: I rewrote my todo filter as [t for t in todos if not t.done] and it worked first try!\n"
        "Tutor: Nice, you've got list comprehensions down.",
    ),
    (
        5,
        "Learner: Weird bug: def add_task(task, tasks=[]) keeps tasks from previous calls.\n"
        "Tutor: That's the mutable default argument trap. The list is created once, when the function is "
        "defined. Use tasks=None and create a new list inside.",
    ),
    (
        2,
        "Learner: Your long answers overwhelm me. I learn best from one short example I can run, then a "
        "small exercise.\nTutor: Got it, short examples and one exercise at a time from now on.",
    ),
]


def seed(client: Hindsight, bank_id: str) -> None:
    """Write the demo sessions into a bank and wait until they're processed."""
    client.create_bank(bank_id, retain_mission=RETAIN_MISSION, reflect_mission=REFLECT_MISSION)
    client.retain_batch(
        bank_id=bank_id,
        items=[
            {"content": text, "context": "tutoring session", "timestamp": _NOW - timedelta(days=days_ago)}
            for days_ago, text in PAST_SESSIONS
        ],
        # Synchronous on purpose: we want the facts extracted before the script returns.
        retain_async=False,
    )
