"""Does long-term memory actually make the tutor better? Measure it instead of guessing.

The script seeds a fresh, throwaway learner with the demo history, then asks questions that
can only be answered well by remembering past sessions. Each question is asked twice:
with memory on and with memory off. A reply passes if it mentions one of the expected keywords.

Keyword grading is deliberately simple. It's cheap and easy to understand, but it can be
fooled; see docs/LEARNING_PATH.md for how to upgrade it to an LLM judge.

Usage (from the project root, with Hindsight running and OPENAI_API_KEY set):
    python -m scripts.eval_memory
Cost: 10 OpenAI calls + one Hindsight seeding run.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from hindsight_client import Hindsight

from app.config import get_settings
from app.main import build_production_dependencies
from app.memory import bank_id_for
from scripts.demo_data import seed


@dataclass
class Case:
    question: str
    expected_any: list[str]


CASES = [
    Case("What topic was I struggling with a couple of weeks ago?", ["recursion", "base case"]),
    Case("What project am I building to practise?", ["todo"]),
    Case("What is my career goal?", ["internship", "backend"]),
    Case("What bug did I hit with default arguments, and how do I fix it?", ["mutable", "none"]),
    Case("How do I prefer you to explain things?", ["short", "one example", "exercise"]),
]


def passed(reply: str, case: Case) -> bool:
    reply = reply.lower()
    return any(keyword in reply for keyword in case.expected_any)


async def run(user_id: str) -> None:
    coach, memory = build_production_dependencies()
    try:
        results = []
        for case in CASES:
            with_memory = await coach.chat(user_id, case.question, use_memory=True)
            without_memory = await coach.chat(user_id, case.question, use_memory=False)
            results.append((case, passed(with_memory.reply, case), passed(without_memory.reply, case)))
    finally:
        await memory.close()

    print(f"\n{'question':<66} {'memory':>7} {'no memory':>10}")
    print("-" * 85)
    for case, on, off in results:
        print(f"{case.question:<66} {'PASS' if on else 'fail':>7} {'PASS' if off else 'fail':>10}")
    on_score = sum(on for _, on, _ in results)
    off_score = sum(off for _, _, off in results)
    print("-" * 85)
    total = len(CASES)
    print(f"{'score':<66} {f'{on_score}/{total}':>7} {f'{off_score}/{total}':>10}")


def main() -> None:
    settings = get_settings()
    user_id = f"eval-{int(time.time())}"  # fresh learner every run, so results are reproducible
    with Hindsight(base_url=settings.hindsight_url) as client:
        print(f"Seeding throwaway learner '{user_id}'...")
        seed(client, bank_id_for(user_id, settings.bank_prefix))
    asyncio.run(run(user_id))


if __name__ == "__main__":
    main()
