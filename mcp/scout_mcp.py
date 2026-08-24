"""
ScoutOne MCP server.

Exposes the ScoutOne interview-research API (https://multiagent-scout.duckdns.org)
as MCP tools so any MCP client (Claude Desktop, Claude Code, etc.) can call it.

Run:  python scout_mcp.py
Deps: pip install fastmcp httpx
"""

import os
import httpx
from fastmcp import FastMCP

BASE_URL = os.environ.get("SCOUT_BASE_URL", "https://multiagent-scout.duckdns.org")

# A full research run fans out across 7 agents and can take a couple of minutes.
TIMEOUT = httpx.Timeout(300.0, connect=15.0)

mcp = FastMCP("scoutone")


@mcp.tool()
async def research_company(company: str, role: str = "", website: str = "") -> dict:
    """Research a company for interview prep.

    Runs ScoutOne's multi-agent pipeline (values, benefits, business, leadership,
    news, red flags, then synthesis) and returns a structured briefing.

    Args:
        company: Company name to research (required).
        role: Job role you're interviewing for, e.g. "Software Engineer" (optional).
        website: Company website/domain to disambiguate same-named companies (optional).

    Returns:
        The full research report as a dict, or {"error": "..."} on failure.
    """
    payload = {"company": company}
    if role:
        payload["role"] = role
    if website:
        payload["website"] = website

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(f"{BASE_URL}/api/research", json=payload)

    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        return {"error": f"HTTP {resp.status_code}: {detail}"}

    return resp.json()


@mcp.tool()
async def check_health() -> dict:
    """Check that the ScoutOne backend is up and which agents are configured."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        resp = await client.get(f"{BASE_URL}/health")
    return resp.json()


if __name__ == "__main__":
    # Local desktop use: stdio (default).
    # Remote/web use: set SCOUT_HTTP=1 to serve over Streamable HTTP.
    if os.environ.get("SCOUT_HTTP"):
        mcp.run(
            transport="http",
            host="0.0.0.0",
            port=int(os.environ.get("SCOUT_PORT", "8765")),
            path="/mcp",
        )
    else:
        mcp.run()  # stdio
