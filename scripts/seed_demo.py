"""Give the `demo-student` learner three weeks of history so the UI has something to remember.

Usage (from the project root, with Hindsight running):
    python -m scripts.seed_demo
"""

from hindsight_client import Hindsight

from app.config import get_settings
from app.memory import bank_id_for
from scripts.demo_data import PAST_SESSIONS, seed

USER_ID = "demo-student"


def main() -> None:
    settings = get_settings()
    bank_id = bank_id_for(USER_ID, settings.bank_prefix)
    with Hindsight(base_url=settings.hindsight_url) as client:
        print(f"Seeding {len(PAST_SESSIONS)} past sessions into bank '{bank_id}' (this calls an LLM, ~1 min)...")
        seed(client, bank_id)
        found = client.recall(bank_id=bank_id, query="What does this learner struggle with?")
        print(f"Done. Sample recall for 'What does this learner struggle with?' ({len(found.results)} results):")
        for result in found.results[:5]:
            print(f"  - {result.text}")


if __name__ == "__main__":
    main()
