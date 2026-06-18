"""Web search tooling shared by all research agents (DuckDuckGo, no API key needed)."""

from __future__ import annotations

import asyncio
from ddgs import DDGS


def _search_sync(query: str, max_results: int = 6) -> list[dict]:
    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            return [
                {
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "url": r.get("href", ""),
                }
                for r in results
            ]
    except Exception:
        return []


def _news_sync(query: str, max_results: int = 8) -> list[dict]:
    try:
        with DDGS() as ddgs:
            results = ddgs.news(query, max_results=max_results)
            return [
                {
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "url": r.get("url", ""),
                    "date": r.get("date", ""),
                    "source": r.get("source", ""),
                }
                for r in results
            ]
    except Exception:
        return []


async def web_search(queries: list[str], max_results: int = 6) -> list[dict]:
    """Run several text searches concurrently and merge/dedupe the results."""
    tasks = [asyncio.to_thread(_search_sync, q, max_results) for q in queries]
    grouped = await asyncio.gather(*tasks)
    seen: set[str] = set()
    merged: list[dict] = []
    for group in grouped:
        for r in group:
            if r["url"] and r["url"] not in seen:
                seen.add(r["url"])
                merged.append(r)
    return merged


async def news_search(queries: list[str], max_results: int = 8) -> list[dict]:
    tasks = [asyncio.to_thread(_news_sync, q, max_results) for q in queries]
    grouped = await asyncio.gather(*tasks)
    seen: set[str] = set()
    merged: list[dict] = []
    for group in grouped:
        for r in group:
            if r["url"] and r["url"] not in seen:
                seen.add(r["url"])
                merged.append(r)
    return merged


def format_results(results: list[dict], limit: int = 12) -> str:
    """Render search results as compact context for the LLM."""
    lines = []
    for r in results[:limit]:
        date = f" ({r['date']})" if r.get("date") else ""
        source = f" — {r['source']}" if r.get("source") else ""
        lines.append(f"- {r['title']}{date}{source}\n  {r['snippet']}\n  URL: {r['url']}")
    return "\n".join(lines) if lines else "No search results found."
