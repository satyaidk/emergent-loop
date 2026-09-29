"""Application settings, loaded from environment variables (or a local .env file).

Keeping every tunable in one typed class means there are no magic strings scattered
through the code, and the same image can run in dev, CI and prod with different env vars.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="LEARNLOOP_", extra="ignore")

    # --- Hindsight (long-term memory) ---
    hindsight_url: str = "http://localhost:8888"
    hindsight_api_key: SecretStr | None = None
    bank_prefix: str = "learnloop"
    recall_budget: str = "mid"  # "low" | "mid" | "high": how hard recall searches
    recall_max_tokens: int = 2000  # cap on how much memory text we put in the prompt
    # Recall returns notes best-first; beyond the top few they're mostly unrelated, and a small model
    # follows whatever fills its prompt, so keep only these.
    recall_max_notes: int = 6

    # --- The tutor's brain: any OpenAI-compatible API (OpenAI itself, or Ollama on your computer) ---
    # Read from the standard OPENAI_API_KEY variable, not LEARNLOOP_*, so the same
    # key is shared with the Hindsight container in docker-compose. Ollama ignores it,
    # but the client library still needs some value, so use "ollama" there.
    openai_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("OPENAI_API_KEY", "LEARNLOOP_OPENAI_API_KEY")
    )
    openai_base_url: str | None = None  # unset = OpenAI; e.g. http://localhost:11434/v1 for Ollama
    openai_model: str = "gpt-5-mini"
    # "minimal" | "low" | "medium" | "high" for reasoning models; leave empty for models without a
    # thinking mode (most small local models), and it won't be sent.
    effort: str | None = "low"
    max_tokens: int = 16000

    # --- Conversation ---
    max_history_messages: int = 12  # short-term memory: recent turns sent by the browser


@lru_cache
def get_settings() -> Settings:
    return Settings()
