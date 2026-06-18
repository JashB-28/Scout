"""The specialist research agents that LangGraph orchestrates in parallel.

Each agent: builds targeted search queries -> live web search -> Groq LLM
analysis -> structured JSON section written to its own slice of the state.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from .llm import ask_json
from .search import format_results, news_search, web_search

JSON_RULES = (
    "Respond with ONLY a valid JSON object, no prose before or after. "
    "Every string must be plain text (no markdown). Be specific and factual; "
    "if the sources don't cover something, say so honestly rather than inventing facts."
)


def _ctx(state: dict) -> tuple[str, str]:
    return state["company"], state.get("role") or "a role at the company"


def _profile(state: dict) -> dict:
    return state.get("profile") or {}


def entity_brief(state: dict) -> str:
    """Disambiguation header injected into every agent prompt so the model sticks
    to the one company the user means and discards same-name impostors. Returns ""
    when no profile was resolved (graceful no-op)."""
    p = _profile(state)
    if not p:
        return ""
    name = p.get("canonical_name") or state.get("company", "")
    lines = [f"- Name: {name}"]
    if p.get("domain"):
        lines.append(f"- Official website: {p['domain']}")
    if p.get("one_liner"):
        lines.append(f"- What it is: {p['one_liner']}")
    if p.get("industry"):
        lines.append(f"- Industry: {p['industry']}")
    if p.get("headquarters"):
        lines.append(f"- Headquarters: {p['headquarters']}")
    confuse = [c for c in (p.get("not_to_be_confused_with") or []) if c]
    if confuse:
        lines.append("- NOT to be confused with: " + "; ".join(confuse))
    return (
        "=== ENTITY LOCK — research ONLY this organization ===\n"
        + "\n".join(lines)
        + "\nExclude any search result that is about a different company sharing this "
        "name. If a result does not clearly match the company above, leave it out "
        "rather than guess, and never blend facts from a different company.\n"
        "=====================================================\n\n"
    )


def _qualifier(state: dict) -> str:
    """A short, distinctive term that keeps web searches anchored to the right
    entity. Prefer the industry (disambiguates with good recall) over a niche
    identifier, which can over-narrow searches like news. "" when unknown."""
    p = _profile(state)
    industry = str(p.get("industry") or "").strip()
    if industry:
        return industry
    for ident in p.get("identifiers") or []:
        if ident:
            return str(ident).strip()
    return ""


def scoped(state: dict, queries: list[str], site: bool = False) -> list[str]:
    """Anchor each query to the resolved entity: append a distinctive qualifier and,
    optionally, a first-party `site:` query. No profile -> queries are unchanged."""
    qual = _qualifier(state)
    out = [f"{q} {qual}".strip() if qual else q for q in queries]
    domain = _profile(state).get("domain")
    if site and domain:
        out.append(f"{state.get('company', '')} site:{domain}".strip())
    return out


# ---------------------------------------------------------------------------
# 1. Mission & values agent
# ---------------------------------------------------------------------------
async def mission_values_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    results = await web_search(
        scoped(
            state,
            [
                f"{company} mission statement core values",
                f"{company} company culture what it's like to work there",
                f"{company} social impact sustainability commitments",
            ],
            site=True,
        )
    )
    section = await ask_json(
        system=(
            "You are a career-research analyst. 43% of candidates choose jobs for "
            "meaningful work, so your job is to surface the company's mission, core "
            "values, and culture so a candidate can check value alignment. "
            + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Web search results:
{format_results(results)}

Return JSON with exactly these keys:
{{
  "mission": "the company's mission in 1-2 sentences",
  "core_values": [{{"value": "name", "meaning": "what it means in practice at this company"}}],
  "culture_summary": "3-4 sentence honest picture of the working culture",
  "values_alignment_questions": ["3 questions the candidate should ask THEMSELVES to test fit"],
  "talking_points": ["3 ways to authentically reference the mission/values in an interview"],
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"mission_values": section}


# ---------------------------------------------------------------------------
# 2. Employee benefits agent
# ---------------------------------------------------------------------------
async def benefits_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    results = await web_search(
        scoped(
            state,
            [
                f"{company} employee benefits perks",
                f"{company} salary compensation glassdoor reviews",
                f"{company} work life balance remote work policy parental leave",
            ],
        )
    )
    section = await ask_json(
        system=(
            "You are a compensation-and-benefits researcher helping a job candidate "
            "understand the full package a company offers before they interview. "
            + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Web search results:
{format_results(results)}

Return JSON with exactly these keys:
{{
  "benefits": [{{"category": "e.g. Health / Financial / Time off / Growth / Lifestyle", "items": ["specific benefits"]}}],
  "compensation_notes": "what is publicly known about pay philosophy/ranges, with caveats",
  "work_life_balance": "honest 2-3 sentence read on hours, flexibility, remote policy",
  "standout_perks": ["the 3-5 most distinctive perks"],
  "questions_to_ask": ["3 smart benefit/compensation questions for the interviewer"],
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"benefits": section}


# ---------------------------------------------------------------------------
# 3. Business operations agent
# ---------------------------------------------------------------------------
async def business_ops_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    results = await web_search(
        scoped(
            state,
            [
                f"{company} business model how it makes money products services",
                f"{company} revenue market share competitors industry",
                f"{company} headquarters offices number of employees company size",
            ],
            site=True,
        )
    )
    section = await ask_json(
        system=(
            "You are a business analyst briefing a job candidate on how a company "
            "actually operates: products, revenue model, market position, scale. "
            "A candidate who understands the business impresses interviewers. "
            + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Web search results:
{format_results(results)}

Return JSON with exactly these keys:
{{
  "what_they_do": "2-3 sentence plain-English explanation of the business",
  "business_model": "how the company makes money",
  "key_products": [{{"name": "product/service", "description": "one line"}}],
  "market_position": "competitive standing, key competitors, rough market share if known",
  "scale": {{"employees": "best estimate or 'unknown'", "headquarters": "city, country", "founded": "year or 'unknown'", "revenue": "latest known figure or 'unknown'"}},
  "competitors": ["main competitors"],
  "growth_trajectory": "is the company growing, stable, or contracting, and why",
  "smart_questions": ["3 business-savvy questions to ask in the interview"],
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"business_ops": section}


# ---------------------------------------------------------------------------
# 4. Leadership agent
# ---------------------------------------------------------------------------
async def leadership_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    results = await web_search(
        scoped(
            state,
            [
                f"{company} CEO founder executive team leadership",
                f"{company} CEO interview vision strategy statements",
                f"{company} leadership changes new executives appointed",
            ],
            site=True,
        )
    )
    section = await ask_json(
        system=(
            "You are an executive-research analyst. Brief a candidate on who runs "
            "the company, their background, leadership style, and public vision. "
            + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Web search results:
{format_results(results)}

Return JSON with exactly these keys:
{{
  "leaders": [{{"name": "full name", "title": "role", "background": "1-2 line bio", "notable": "something memorable a candidate could reference"}}],
  "leadership_style": "what is publicly known about how leadership operates",
  "vision_statements": ["notable public quotes or strategic priorities from leadership"],
  "recent_changes": "any recent leadership transitions and what they signal",
  "interview_angle": "how to use leadership knowledge in the interview",
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"leadership": section}


# ---------------------------------------------------------------------------
# 5. News & recent events agent
# ---------------------------------------------------------------------------
async def news_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    results = await news_search(
        scoped(
            state,
            [
                f"{company} announcement launch",
                f"{company} news",
                f"{company} funding acquisition partnership",
            ],
        )
    )
    section = await ask_json(
        system=(
            "You are a news analyst. Summarize the most relevant recent events about "
            "a company so a candidate sounds current in their interview. Classify the "
            "sentiment of each item as positive, neutral, or negative. " + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Recent news results:
{format_results(results, limit=16)}

Return JSON with exactly these keys:
{{
  "headlines": [{{"title": "headline", "date": "date if known", "summary": "1-2 lines", "sentiment": "positive|neutral|negative", "url": "source url"}}],
  "big_picture": "2-3 sentences on the overall news narrative around the company right now",
  "conversation_starters": ["2-3 recent events worth mentioning in the interview"],
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"news": section}


# ---------------------------------------------------------------------------
# 6. Red-flag scanner agent
# ---------------------------------------------------------------------------
async def red_flags_agent(state: dict) -> dict:
    company, _ = _ctx(state)
    text_results = await web_search(
        scoped(
            state,
            [
                f"{company} lawsuit controversy scandal",
                f"{company} layoffs restructuring employee complaints",
                f"{company} toxic culture negative reviews problems",
            ],
        )
    )
    news_results = await news_search(
        scoped(state, [f"{company} layoffs lawsuit investigation"])
    )
    section = await ask_json(
        system=(
            "You are a due-diligence analyst scanning headlines for red flags before "
            "a candidate joins a company: layoffs, lawsuits, leadership scandals, "
            "financial trouble, toxic-culture reports, regulatory issues. Be fair — "
            "distinguish isolated incidents from patterns, and say clearly when the "
            "record is clean. " + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Web results:
{format_results(text_results)}

News results:
{format_results(news_results)}

Return JSON with exactly these keys:
{{
  "risk_level": "low|moderate|elevated|high",
  "red_flags": [{{"flag": "short title", "severity": "low|medium|high", "detail": "what happened and when", "pattern_or_isolated": "pattern|isolated"}}],
  "green_flags": ["positive signals found while scanning (stability, awards, growth)"],
  "verdict": "balanced 2-3 sentence judgement on whether concerns should affect the candidate's decision",
  "questions_to_probe": ["2-3 diplomatic interview questions to probe the concerns"],
  "sources": ["urls used"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )
    return {"red_flags": section}


# ---------------------------------------------------------------------------
# 7. Synthesizer agent — merges everything into the final scored report
# ---------------------------------------------------------------------------
# Interview-prep / role-flavored fields are stripped from the COMPANY scoring
# input, so the assessment (and every score) is identical whether or not a role
# is given — a role tailors the prep, never the company's score.
_PREP_FIELDS = {
    "mission_values": ("values_alignment_questions", "talking_points"),
    "benefits": ("questions_to_ask",),
    "business_ops": ("smart_questions",),
    "leadership": ("interview_angle",),
    "news": ("conversation_starters",),
    "red_flags": ("questions_to_probe",),
}


def _facts_only(sections: dict) -> dict:
    """Drop interview-prep fields so the company score depends on facts alone."""
    out: dict = {}
    for key, sec in sections.items():
        if isinstance(sec, dict):
            drop = _PREP_FIELDS.get(key, ())
            out[key] = {k: v for k, v in sec.items() if k not in drop}
        else:
            out[key] = sec
    return out


async def _assess_company(state: dict, facts: dict) -> dict:
    """Role-independent assessment: scores, exec summary, recommendation.

    Deliberately receives NO role, so the company's scores can never move with it.
    """
    company = state["company"]
    return await ask_json(
        system=(
            "You are the lead company-assessment analyst. Six analyst reports are "
            "attached. Rate the COMPANY AS AN EMPLOYER from public signals only — "
            "business health, benefits, reputation, momentum, risk. You know nothing "
            "about any candidate or role, and your assessment must NOT depend on one; "
            "it describes the company itself. Scores are 0-100 and must be justified "
            "by the reports, not generosity. " + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.

Analyst reports (facts only):
{json.dumps(facts, ensure_ascii=False)[:22000]}

Return JSON with exactly these keys:
{{
  "executive_summary": "4-5 sentence overview of the company as an employer, readable 10 minutes before an interview",
  "overall_score": "0-100 rating of how strong this company looks AS AN EMPLOYER from public signals (business health, benefits, reputation, momentum, risk). NOT a personal-fit score.",
  "recommendation": "one-line neutral analyst read of the company itself, e.g. 'Financially healthy with strong benefits; recent layoffs worth probing'. Never personal advice like 'go for it'.",
  "scores": [
    {{"dimension": "Values & Mission", "score": 0-100, "reason": "one line"}},
    {{"dimension": "Benefits & Pay", "score": 0-100, "reason": "one line"}},
    {{"dimension": "Business Health", "score": 0-100, "reason": "one line"}},
    {{"dimension": "Leadership", "score": 0-100, "reason": "one line"}},
    {{"dimension": "Momentum & News", "score": 0-100, "reason": "one line"}},
    {{"dimension": "Risk Profile", "score": 0-100, "reason": "one line (high score = LOW risk)"}}
  ]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )


async def _interview_prep(state: dict, sections: dict) -> dict:
    """Role-tailored, specific interview prep — the one place the role really bites."""
    company = state["company"]
    role_raw = (state.get("role") or "").strip()
    if role_raw:
        role_line = (
            f'The candidate is interviewing for this specific role: "{role_raw}". '
            "Tailor everything to it — connect the pitch to what this role does at the "
            "company, and make the questions reflect what someone in this role would care about."
        )
        pitch_extra = (
            f", and tie it to how someone in the {role_raw} role would contribute"
        )
        q_extra = f" and specifically relevant to the {role_raw} role"
    else:
        role_line = (
            "No specific role was given. Write prep for joining this company in "
            "general; keep every line concrete to THIS company and frame the pitch "
            "around its mission and work rather than a job title."
        )
        pitch_extra = ", and what specifically draws someone to this company"
        q_extra = ""
    return await ask_json(
        system=(
            "You are a sharp interview coach. Using the attached company research, "
            "write CONCRETE, specific interview prep. Ground every line in real "
            "details from the reports — name actual products, the real mission "
            "wording, named leaders, a specific recent headline, real benefits or "
            "risks. Ban generic filler ('passionate about innovation', 'great "
            "culture', 'cutting-edge technology'): if a sentence could be said about "
            "any company, rewrite it with a specific fact from the reports. "
            + JSON_RULES
        ),
        user=f"""{entity_brief(state)}Company: {company}.
{role_line}

Company research:
{json.dumps(sections, ensure_ascii=False)[:22000]}

Return JSON with exactly these keys:
{{
  "elevator_pitch": "a specific 60-90 word 'why I want to work here' answer. It MUST name at least two concrete specifics from the reports (a named product, the actual mission, a recent event){pitch_extra}. No platitudes — every sentence should be unmistakably about this company.",
  "top_questions_to_ask": ["5 sharp questions drawn from the reports{q_extra}; each must reference something real (a product, a recent change, a stated value, a risk) — not generic questions that fit any company"],
  "prep_checklist": ["5-7 concrete prep actions, each naming a specific thing to review or practice (e.g. 'Read up on <real product>'), not vague advice like 'research the company'"]
}}""",
        llm_cfg=state.get("llm_cfg"),
    )


async def synthesizer_agent(state: dict) -> dict:
    sections = {
        k: state.get(k)
        for k in ("mission_values", "benefits", "business_ops", "leadership", "news", "red_flags")
    }
    # Score the company from facts only (role-independent) while tailoring the
    # interview prep to the role — the two run concurrently.
    assessment, prep = await asyncio.gather(
        _assess_company(state, _facts_only(sections)),
        _interview_prep(state, sections),
    )
    synthesis = {**assessment, **prep}

    def _to_int(value: Any) -> int:
        try:
            return max(0, min(100, int(float(value))))
        except (TypeError, ValueError):
            return 0

    synthesis["overall_score"] = _to_int(synthesis.get("overall_score"))
    for s in synthesis.get("scores", []):
        s["score"] = _to_int(s.get("score"))

    # Chart payloads computed from real agent output (not LLM guesses)
    headlines = (state.get("news") or {}).get("headlines", [])
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for h in headlines:
        s = str(h.get("sentiment", "neutral")).lower()
        sentiment_counts[s if s in sentiment_counts else "neutral"] += 1

    flags = (state.get("red_flags") or {}).get("red_flags", [])
    severity_counts = {"low": 0, "medium": 0, "high": 0}
    for f in flags:
        s = str(f.get("severity", "low")).lower()
        severity_counts[s if s in severity_counts else "low"] += 1

    charts = {
        "fit_radar": [
            {"dimension": s.get("dimension", "?"), "score": s.get("score", 0)}
            for s in synthesis.get("scores", [])
        ],
        "news_sentiment": [
            {"name": k.capitalize(), "value": v} for k, v in sentiment_counts.items()
        ],
        "risk_severity": [
            {"name": k.capitalize(), "value": v} for k, v in severity_counts.items()
        ],
    }
    return {"synthesis": synthesis, "charts": charts}
