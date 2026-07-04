"""Shared Google Gemini client for reports and chatbot features."""

from __future__ import annotations

import logging
from typing import Optional

from app.config import settings

log = logging.getLogger(__name__)

GEMINI_API_KEY = settings.GEMINI_API_KEY
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_TIMEOUT_SECONDS = 30

_PLACEHOLDER_MARKERS = (
    "your-",
    "your_",
    "xxxx",
    "****",
    "here",
    "placeholder",
    "changeme",
    "change-me",
    "example",
)


def gemini_key_looks_valid(key: str | None) -> bool:
    """Return True when the key looks like a real Google AI Studio API key."""
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if len(k) < 20:
        return False
    if not k.startswith("AIza"):
        return False
    low = k.lower()
    return not any(marker in low for marker in _PLACEHOLDER_MARKERS)


def generate_text(
    *,
    prompt: str,
    system_instruction: Optional[str] = None,
    temperature: float = 0.7,
    max_output_tokens: int = 600,
    json_mode: bool = False,
) -> str:
    """
    Call Gemini and return plain text (or JSON string when ``json_mode=True``).

    Raises on missing key, API errors, or empty responses.
    """
    if not gemini_key_looks_valid(GEMINI_API_KEY):
        raise ValueError("Gemini API key is not configured")

    import google.generativeai as genai

    genai.configure(api_key=GEMINI_API_KEY)

    model_kwargs = {"model_name": GEMINI_MODEL}
    if system_instruction:
        model_kwargs["system_instruction"] = system_instruction
    model = genai.GenerativeModel(**model_kwargs)

    generation_config_kwargs = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    if json_mode:
        generation_config_kwargs["response_mime_type"] = "application/json"

    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(**generation_config_kwargs),
        request_options={"timeout": GEMINI_TIMEOUT_SECONDS},
    )

    text = getattr(response, "text", None)
    if text is None or not str(text).strip():
        raise ValueError("Gemini returned an empty response")

    return str(text).strip()
