"""LLM helpers: provider-agnostic model factory + robust JSON extraction.

All supported providers expose OpenAI-compatible APIs, so one client covers
them. If the request carries a user-supplied key we use that provider;
otherwise we fall back to the GROQ_API_KEY from backend/.env — and if that
free Groq key is rate-limited or a query is too large for it, we retry once
on Claude Haiku 4.5 via AWS Bedrock (see get_bedrock_llm / _is_rate_limited).
"""

from __future__ import annotations

import contextvars
import json
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

PROVIDERS: dict[str, dict[str, Any]] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",  # Groq's OpenAI-compatible endpoint
        "default_model": "llama-3.3-70b-versatile",
    },
    "openai": {
        "base_url": None,  # ChatOpenAI default (official OpenAI endpoint)
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
    provider = (cfg.get("provider") or "groq").lower()  # default to groq if none specified
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider '{provider}'. Choose from: {', '.join(PROVIDERS)}")
    spec = PROVIDERS[provider]

    api_key = cfg.get("api_key") or ""  # prefer a user-supplied key
    if not api_key:
        if provider != "groq":
            raise ValueError(f"An API key is required to use the '{provider}' provider.")
        api_key = os.getenv("GROQ_API_KEY", "")  # fall back to the app's own Groq key

    model = cfg.get("model") or (
        os.getenv("GROQ_MODEL", spec["default_model"]) if provider == "groq" else spec["default_model"]
    )  # caller's model choice > env override (groq only) > provider default

    return ChatOpenAI(  # single client works for every provider (all OpenAI-compatible)
        model=model,
        api_key=api_key,
        base_url=spec["base_url"],
        temperature=temperature,
        max_retries=2,
    )


# ---------------------------------------------------------------------------
# Bedrock fallback — the server's free Groq key hits its daily/per-minute
# quota fast and rejects requests that are too large for its free tier. When
# that happens (and only when we're on the server's own Groq key, not a
# user-supplied one), retry the same call once on Claude Haiku 4.5 via AWS
# Bedrock. Credentials come from the normal boto3 chain (env vars, an EC2
# instance role, ~/.aws/credentials, ...) — nothing to configure if the
# backend already runs with AWS access.
# ---------------------------------------------------------------------------
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
BEDROCK_MODEL_LABEL = os.getenv("BEDROCK_MODEL_LABEL", "Claude Haiku 4.5")
BEDROCK_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"

# Set by the request handler (see main.py) for the lifetime of one research
# run. ask_json() calls made from parallel agent tasks append to this shared
# list so the SSE stream can surface a one-time "falling back" notice — the
# same pattern already used for a rejected user-supplied key.
fallback_events: contextvars.ContextVar[list[str] | None] = contextvars.ContextVar(
    "fallback_events", default=None
)


def _note_fallback(message: str) -> None:
    bucket = fallback_events.get()
    if bucket is not None:
        bucket.append(message)


def get_bedrock_llm(temperature: float = 0.0):
    """Build the Bedrock fallback model. Raises if AWS isn't reachable/configured
    (imported lazily so the app runs without langchain-aws/boto3 installed if
    the fallback is never exercised)."""
    from langchain_aws import ChatBedrockConverse

    return ChatBedrockConverse(
        model_id=BEDROCK_MODEL_ID,
        region_name=BEDROCK_REGION,
        temperature=temperature,
        max_tokens=8192,
    )


def _is_rate_limited(exc: Exception) -> bool:
    """True for Groq 429s (per-minute/daily quota) and 413s (a query too
    large for the free tier) — the two failure modes the shared key hits."""
    if getattr(exc, "status_code", None) in (429, 413):
        return True
    msg = str(exc).lower()
    return any(
        s in msg
        for s in ("429", "413", "rate limit", "rate_limit", "quota", "too large", "context_length_exceeded")
    )


async def validate_key(llm_cfg: dict) -> tuple[bool, str]:
    """Cheap one-token call to check a user-supplied key actually works."""
    try:
        llm = get_llm(0.0, llm_cfg).bind(max_tokens=1)  # cap output to keep the check cheap
        await llm.ainvoke([HumanMessage(content="ping")])
        return True, ""
    except Exception as exc:
        msg = str(exc)
        if "401" in msg or "invalid_api_key" in msg.lower() or "authentication" in msg.lower():
            return False, "the provider rejected the key (401 unauthorized)"  # bad key, not some other failure
        return False, msg[:160]  # unknown error, truncated for display


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM reply, tolerating code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)  # try ```json ... ``` block first
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")  # otherwise grab from the first { to the last }
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
    cfg = llm_cfg or {}
    on_server_groq_key = (cfg.get("provider") or "groq").lower() == "groq" and not cfg.get("api_key")
    llm = get_llm(temperature, llm_cfg)
    messages = [SystemMessage(content=system), HumanMessage(content=user)]  # system prompt + user prompt, no history
    try:
        response = await llm.ainvoke(messages)
    except Exception as exc:
        if not (on_server_groq_key and _is_rate_limited(exc)):
            raise
        try:
            response = await get_bedrock_llm(temperature).ainvoke(messages)
        except Exception:
            raise exc from None  # Bedrock unavailable too — surface the original Groq error
        _note_fallback(
            f"Groq limit reached, falling back to {BEDROCK_MODEL_LABEL}. "
            "Did you know you can add your own API key for better results!"
        )
    return extract_json(response.content)  # parse the model's reply into a dict
