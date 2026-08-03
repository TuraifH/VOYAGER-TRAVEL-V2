"""LLM review summarizer (PROMPT_4 §2.3).

Golden rule: the LLM summarizes ONLY the real review texts it is handed. It
never fabricates reviews, ratings, or scores. If no API key or the call fails,
it returns None and the caller falls back to a deterministic headline.

Uses OpenRouter (OpenAI-compatible) or Google Gemini via the `openai` SDK
base-url switch. Pure explainer — no business logic here.
"""
import json
import logging
from dataclasses import dataclass

from .. import config

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    summary: str
    concerns: list[str]


def summarize(review_texts: list[str], score_pct: int) -> SummaryResult | None:
    if not review_texts:
        return None
    api_key = config.env_str("OPENROUTER_API_KEY") or config.env_str("GEMINI_API_KEY")
    if not api_key:
        logger.info("[llm] no API key — skipping review summary")
        return None
    try:
        return _call_openai_compat(review_texts, score_pct, api_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[llm] summary failed: %s", exc)
        return None


def _call_openai_compat(review_texts, score_pct, api_key) -> SummaryResult:
    """OpenRouter (primary) -> Gemini (fallback). Never fails loudly: returns
    the deterministic headline when neither provider is available."""
    try:
        if config.env_str("OPENROUTER_API_KEY"):
            return _summarize_with(
                api_key=config.env_str("OPENROUTER_API_KEY"),
                base_url=config.env_str("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                model=config.env_str("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
                review_texts=review_texts, score_pct=score_pct,
            )
    except Exception as exc:  # noqa: BLE001 — OpenRouter out of credits / down
        logger.warning("[llm] OpenRouter summary failed: %s", exc)
    if config.env_str("GEMINI_API_KEY"):
        return _summarize_with(
            api_key=config.env_str("GEMINI_API_KEY"),
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            model=config.env_str("GEMINI_MODEL", "gemini-2.0-flash"),
            review_texts=review_texts, score_pct=score_pct,
        )
    raise RuntimeError("no LLM provider available")


def _summarize_with(api_key: str, base_url: str, model: str,
                    review_texts: list[str], score_pct: int) -> SummaryResult:
    import openai

    client = openai.OpenAI(api_key=api_key, base_url=base_url, timeout=20)
    blob = json.dumps([{"text": t} for t in review_texts], ensure_ascii=False)[:14000]

    system = (
        "You summarize Google Maps reviews. Rules:\n"
        "1. Use ONLY the reviews given. Never invent a review, rating, or fact.\n"
        "2. Output JSON: {\"summary\": \"2-3 sentences, specific themes\", "
        "\"concerns\": [\"recurring complaints\"]}.\n"
        "3. Keep it factual and concise."
    )
    user = f"Reviews (reliability {score_pct}%):\n{blob}"
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        max_tokens=256,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        timeout=20,
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    return SummaryResult(
        summary=str(data.get("summary", "")).strip(),
        concerns=[str(c).strip() for c in data.get("concerns", []) if str(c).strip()],
    )
