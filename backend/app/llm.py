"""LLM helpers: provider-agnostic model factory + robust JSON extraction.

All supported providers expose OpenAI-compatible APIs, so one client covers
them. If the request carries a user-supplied key we use that provider;
otherwise we fall back to the GROQ_API_KEY from backend/.env.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

PROVIDERS: dict[str, dict[str, Any]] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.3-70b-versatile",
    },
    "openai": {
        "base_url": None,  # ChatOpenAI default
        "default_model": "gpt-4o-mini",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "meta-llama/llama-3.3-70b-instruct",
    },
    "together": {
        "base_url": "https://api.together.xyz/v1",
        "default_model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
}


# Temperature 0 keeps repeat runs as consistent as the underlying model allows.
def get_llm(temperature: float = 0.0, llm_cfg: dict | None = None) -> ChatOpenAI:
    cfg = llm_cfg or {}
    provider = (cfg.get("provider") or "groq").lower()
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider '{provider}'. Choose from: {', '.join(PROVIDERS)}")
    spec = PROVIDERS[provider]

    api_key = cfg.get("api_key") or ""
    if not api_key:
        if provider != "groq":
            raise ValueError(f"An API key is required to use the '{provider}' provider.")
        api_key = os.getenv("GROQ_API_KEY", "")

    model = cfg.get("model") or (
        os.getenv("GROQ_MODEL", spec["default_model"]) if provider == "groq" else spec["default_model"]
    )

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=spec["base_url"],
        temperature=temperature,
        max_retries=2,
    )


async def validate_key(llm_cfg: dict) -> tuple[bool, str]:
    """Cheap one-token call to check a user-supplied key actually works."""
    try:
        llm = get_llm(0.0, llm_cfg).bind(max_tokens=1)
        await llm.ainvoke([HumanMessage(content="ping")])
        return True, ""
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "invalid_api_key" in msg.lower() or "authentication" in msg.lower():
            return False, "the provider rejected the key (401 unauthorized)"
        return False, msg[:160]


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM reply, tolerating code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            candidate = text[start : end + 1]
    if candidate is None:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(candidate)


async def ask_json(
    system: str,
    user: str,
    temperature: float = 0.0,
    llm_cfg: dict | None = None,
) -> dict:
    """One-shot structured call: returns the parsed JSON object from the model."""
    llm = get_llm(temperature, llm_cfg)
    response = await llm.ainvoke(
        [SystemMessage(content=system), HumanMessage(content=user)]
    )
    return extract_json(response.content)
