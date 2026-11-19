"""DeepSeek via the OpenAI-compatible API (one model, several system prompts)."""
from __future__ import annotations

import json
import re

from openai import OpenAI

from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=90, max_retries=1)
MODEL = DEEPSEEK_MODEL


def complete_json(system: str, user: str, max_tokens: int = 1500, think: bool = False) -> dict:
    """Structured JSON output. Thinking is disabled by default (fast, and reasoning tokens can exhaust max_tokens)."""
    extra = {"reasoning_effort": "low", "max_tokens": max_tokens + 6000} if think else {
        "extra_body": {"thinking": {"type": "disabled"}}, "max_tokens": max_tokens}
    r = client.chat.completions.create(
        model=MODEL, messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"}, **extra,
    )
    txt = r.choices[0].message.content or "{}"
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", txt, re.S)
        return json.loads(m.group(0)) if m else {}
