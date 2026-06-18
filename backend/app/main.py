"""FastAPI backend for the multi-agent company research platform.

Endpoints:
  GET  /health                       — liveness + config check
  POST /api/research/stream          — SSE: live agent progress + final report
  POST /api/research                 — one-shot: full report as JSON
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

import time

from .graph import AGENT_LABELS, AGENT_NODES, research_graph
from .llm import validate_key
from .resolve import normalize_domain, resolve_company

# Same company + role + provider within the TTL returns the identical cached
# report, so repeat runs can't show different scores.
CACHE_TTL_SECONDS = 6 * 3600
_report_cache: dict[tuple, tuple[float, dict]] = {}


def _cache_key(state: dict) -> tuple:
    cfg = state.get("llm_cfg") or {}
    return (
        state["company"].lower(),
        state.get("role", "").lower(),
        # The website disambiguates two different companies with the same name,
        # so they never collide on the same cache entry.
        normalize_domain(state.get("website")),
        cfg.get("provider") or "groq",
        cfg.get("model") or "",
    )


def _cache_get(state: dict) -> dict | None:
    entry = _report_cache.get(_cache_key(state))
    if entry and time.time() - entry[0] < CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _cache_put(state: dict, report: dict) -> None:
    if len(_report_cache) > 100:
        _report_cache.clear()
    _report_cache[_cache_key(state)] = (time.time(), report)


def _env_groq_ok() -> bool:
    key = os.getenv("GROQ_API_KEY", "")
    return bool(key) and key != "your_groq_api_key_here"


def _allowed_origins() -> list[str]:
    """Browser origins permitted to call the API.

    Set ALLOWED_ORIGINS to a comma-separated list in production (e.g. the
    deployed frontend URL); falls back to the local dev origins.
    """
    raw = os.getenv("ALLOWED_ORIGINS", "")
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return origins or ["http://localhost:3000", "http://127.0.0.1:3000"]


app = FastAPI(
    title="ScoutOne — Multi-Agent Company Research",
    description="LangGraph + Groq multi-agent research for interview preparation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=120)
    role: str | None = Field(None, max_length=120)
    website: str | None = Field(None, max_length=200)  # anchors same-named companies
    api_key: str | None = Field(None, max_length=300)
    provider: str | None = Field(None, max_length=30)
    model: str | None = Field(None, max_length=120)


def _llm_cfg(api_key: str | None, provider: str | None, model: str | None) -> dict:
    """Build the per-request LLM config; without a user key, require the .env Groq key."""
    api_key = (api_key or "").strip()
    provider = (provider or "groq").strip().lower()
    if not api_key:
        provider = "groq"
        env_key = os.getenv("GROQ_API_KEY", "")
        if not env_key or env_key == "your_groq_api_key_here":
            raise HTTPException(
                status_code=503,
                detail=(
                    "No API key available. Either paste your own key in the form, or "
                    "configure GROQ_API_KEY in backend/.env (copy .env.example)."
                ),
            )
    return {"api_key": api_key, "provider": provider, "model": (model or "").strip() or None}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "groq_key_configured": bool(
            os.getenv("GROQ_API_KEY")
            and os.getenv("GROQ_API_KEY") != "your_groq_api_key_here"
        ),
        "agents": list(AGENT_LABELS.values()),
    }


@app.post("/api/research")
async def research(req: ResearchRequest):
    state = {
        "company": req.company.strip(),
        "role": (req.role or "").strip(),
        "website": (req.website or "").strip(),
        "llm_cfg": _llm_cfg(req.api_key, req.provider, req.model),
    }
    notice = ""
    if state["llm_cfg"]["api_key"]:
        ok, why = await validate_key(state["llm_cfg"])
        if not ok:
            if not _env_groq_ok():
                raise HTTPException(
                    status_code=401,
                    detail=f"Your API key was rejected ({why}) and no server Groq key is configured.",
                )
            notice = f"Your API key was rejected ({why}); fell back to the server's Groq key."
            state["llm_cfg"] = {"api_key": "", "provider": "groq", "model": None}

    cached = _cache_get(state)
    if cached:
        return {**cached, "notice": notice}

    # Lock onto exactly one company (anchored to the website) before the agents run.
    state["profile"] = await resolve_company(
        state["company"], state["website"], state["llm_cfg"]
    )
    try:
        result = await research_graph.ainvoke(state)
    except Exception as exc:  # surface agent failures as a clean API error
        raise HTTPException(status_code=502, detail=f"Research pipeline failed: {exc}")
    report = _report(result)
    _cache_put(state, report)
    return {**report, "notice": notice}


@app.post("/api/research/stream")
async def research_stream(req: ResearchRequest):
    """Server-sent events: one `agent_done` event per finished agent, then `report`.

    POST (not GET) so the API key travels in the JSON request body, never in the
    URL — query strings leak into browser history, server logs, and proxies.
    """
    state = {
        "company": req.company.strip(),
        "role": (req.role or "").strip(),
        "website": (req.website or "").strip(),
        "llm_cfg": _llm_cfg(req.api_key, req.provider, req.model),
    }

    async def event_source():
        yield {
            "event": "started",
            "data": json.dumps({"company": state["company"], "agents": AGENT_LABELS}),
        }

        # Validate a user-supplied key up front; fall back to the server key if bad.
        if state["llm_cfg"]["api_key"]:
            ok, why = await validate_key(state["llm_cfg"])
            if not ok:
                if not _env_groq_ok():
                    yield {
                        "event": "error",
                        "data": json.dumps(
                            {
                                "detail": f"Your API key was rejected ({why}) and no "
                                "server Groq key is configured as a fallback."
                            }
                        ),
                    }
                    return
                state["llm_cfg"] = {"api_key": "", "provider": "groq", "model": None}
                yield {
                    "event": "key_fallback",
                    "data": json.dumps(
                        {"detail": f"API key rejected ({why}) — falling back to the server's Groq key."}
                    ),
                }

        cached = _cache_get(state)
        if cached:
            if cached.get("profile"):
                yield {"event": "resolved", "data": json.dumps(cached["profile"])}
            for node in list(AGENT_NODES) + ["synthesizer"]:
                yield {
                    "event": "agent_done",
                    "data": json.dumps(
                        {"agent": node, "label": AGENT_LABELS.get(node, node)}
                    ),
                }
            yield {"event": "report", "data": json.dumps(cached)}
            return

        # Resolve the company to one entity (anchored to the website) and tell the
        # client which organization we locked onto before the agents fan out.
        state["profile"] = await resolve_company(
            state["company"], state["website"], state["llm_cfg"]
        )
        yield {"event": "resolved", "data": json.dumps(state["profile"])}

        final: dict = dict(state)
        try:
            async for update in research_graph.astream(state, stream_mode="updates"):
                for node, payload in update.items():
                    final.update(payload or {})
                    yield {
                        "event": "agent_done",
                        "data": json.dumps(
                            {"agent": node, "label": AGENT_LABELS.get(node, node)}
                        ),
                    }
            report = _report(final)
            _cache_put(state, report)
            yield {"event": "report", "data": json.dumps(report)}
        except Exception as exc:
            yield {"event": "error", "data": json.dumps({"detail": str(exc)})}

    return EventSourceResponse(event_source())


def _report(result: dict) -> dict:
    return {
        "company": result.get("company"),
        "role": result.get("role"),
        "profile": result.get("profile"),
        "synthesis": result.get("synthesis"),
        "charts": result.get("charts"),
        "sections": {
            "mission_values": result.get("mission_values"),
            "benefits": result.get("benefits"),
            "business_ops": result.get("business_ops"),
            "leadership": result.get("leadership"),
            "news": result.get("news"),
            "red_flags": result.get("red_flags"),
        },
    }
