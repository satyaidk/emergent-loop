"""Suggested questions the learner can click instead of typing.

Two kinds, one format:

- Follow-ups: the tutor writes three at the end of every answer, about that chat's topic only.
  Asking for them in the same model call as the answer costs no extra wait, which matters on a
  small local model that is also busy writing memory notes after every reply.
- Starters: for a new chat, drawn from the learner's long-term notes, so a returning learner can
  pick up where they left off.

The model writes them as a bullet list inside <follow-ups> tags; this module cuts that block off
the answer and turns it into a clean list.
"""

from __future__ import annotations

import re

MAX_SUGGESTIONS = 3
MAX_CHARS = 120  # longer than this is not a quick question; the model has gone off-format

_BLOCK = re.compile(r"<follow-ups>(.*?)(?:</follow-ups>|\Z)", re.IGNORECASE | re.DOTALL)
_BULLET = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s*")


def split_followups(text: str, limit: int = MAX_SUGGESTIONS) -> tuple[str, list[str]]:
    """Separate the answer from the follow-up block at its end.

    Returns (answer without the block, up to `limit` suggestions). Text without a block comes back
    unchanged with no suggestions, so a model that ignores the format still gives a normal answer.
    """
    blocks = list(_BLOCK.finditer(text))
    if not blocks:
        return text.strip(), []
    block = blocks[-1]  # the instructions ask for it at the very end
    answer = (text[: block.start()] + text[block.end() :]).strip()
    return answer, parse_list(block.group(1), limit)


def parse_list(text: str, limit: int = MAX_SUGGESTIONS) -> list[str]:
    """One suggestion per line: bullets, numbers and quotes removed, duplicates dropped."""
    items: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        item = _BULLET.sub("", line).strip().strip("\"'“”").strip()
        if not item or len(item) > MAX_CHARS or item.lower() in seen:
            continue
        seen.add(item.lower())
        items.append(item)
        if len(items) == limit:
            break
    return items
