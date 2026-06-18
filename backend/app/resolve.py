"""Company resolver — turn an ambiguous name (+ optional website) into ONE entity.

The whole reason this exists: "Alpha Omega" could be the federal-IT / cybersecurity
firm at alphaomega.com OR Alpha Omega Semiconductor (aosmd.com), a power-chip maker.
Searching by name alone, the agents happily blend both companies' news, leadership,
and red flags into a single (wrong) briefing.

This module locks onto exactly one organization — preferring the user-supplied
website as the anchor — and produces a disambiguation profile, including an explicit
"not to be confused with …" list, that every downstream agent uses to stay on target.
"""

from __future__ import annotations

import html
import re
from urllib.parse import urljoin, urlparse

import httpx

from .llm import ask_json
from .search import format_results, web_search


def normalize_domain(website: str | None) -> str:
    """'https://www.AlphaOmega.com/careers?x=1' -> 'alphaomega.com' (best effort)."""
    if not website:
        return ""
    raw = website.strip()
    if not raw:
        return ""
    if "//" not in raw:
        raw = "//" + raw  # let urlparse see a netloc even without a scheme
    parsed = urlparse(raw)
    host = (parsed.netloc or parsed.path).split("/")[0]
    host = host.split("@")[-1].split(":")[0].strip().lower()
    if host.startswith("www."):
        host = host[4:]
    if " " in host or "." not in host:  # not a plausible hostname
        return ""
    return host


_DROP_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _html_to_text(html: str, limit: int = 2000) -> str:
    text = _DROP_RE.sub(" ", html)
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()[:limit]


_LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
_REL_ATTR_RE = re.compile(r'rel\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_HREF_ATTR_RE = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)


def _extract_logo(markup: str, base_url: str) -> str:
    """Pull the site's OWN icon (apple-touch-icon / favicon) as an absolute URL.

    These are the company's publicly served brand assets, used here purely to
    identify the company — nominative use, no implied endorsement.
    """
    found: dict[str, str] = {}
    for tag in _LINK_TAG_RE.findall(markup[:200_000]):
        rel_m = _REL_ATTR_RE.search(tag)
        href_m = _HREF_ATTR_RE.search(tag)
        if not rel_m or not href_m:
            continue
        rel = rel_m.group(1).strip().lower()
        if "icon" in rel and "mask" not in rel:  # skip monochrome mask-icons
            found.setdefault(rel, html.unescape(href_m.group(1).strip()))
    # Prefer the bigger, square apple-touch-icon, then a declared favicon.
    for key in ("apple-touch-icon", "apple-touch-icon-precomposed", "icon", "shortcut icon"):
        if found.get(key):
            return urljoin(base_url, found[key])
    for href in found.values():
        if href:
            return urljoin(base_url, href)
    return ""


def _google_favicon(domain: str) -> str:
    """Reliable fallback: Google's favicon service for any domain."""
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=128" if domain else ""


async def _fetch_site(domain: str) -> tuple[str, str]:
    """Best-effort read of the company's homepage/about page. Never raises.

    Returns (page text for the resolver, logo URL parsed from the homepage).
    """
    if not domain:
        return "", ""
    chunks: list[str] = []
    logo = ""
    try:
        async with httpx.AsyncClient(
            timeout=6.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ScoutOne/1.0 research bot)"},
        ) as client:
            for url in (f"https://{domain}/", f"https://{domain}/about"):
                try:
                    resp = await client.get(url)
                    ctype = resp.headers.get("content-type", "")
                    if resp.status_code < 400 and "html" in ctype:
                        chunks.append(_html_to_text(resp.text))
                        if not logo:  # parse from the first good page (the homepage)
                            logo = _extract_logo(resp.text, str(resp.url))
                except Exception:
                    continue
    except Exception:
        return "\n".join(c for c in chunks if c)[:3500], logo
    return "\n".join(c for c in chunks if c)[:3500], logo


# The canonical shape every consumer can rely on.
_PROFILE_KEYS = (
    "canonical_name",
    "domain",
    "one_liner",
    "industry",
    "headquarters",
    "identifiers",
    "aliases",
    "not_to_be_confused_with",
    "confidence",
)
_LIST_KEYS = ("identifiers", "aliases", "not_to_be_confused_with")


def _base_profile(company: str, domain: str) -> dict:
    return {
        "canonical_name": company,
        "domain": domain,
        "logo_url": "",
        "one_liner": "",
        "industry": "",
        "headquarters": "",
        "identifiers": [],
        "aliases": [],
        "not_to_be_confused_with": [],
        "confidence": "low",
    }


async def resolve_company(company: str, website: str | None, llm_cfg: dict | None) -> dict:
    """Identify the single organization to research, anchored to `website` if given.

    Returns a profile dict with the keys in `_PROFILE_KEYS`. Falls back to a
    minimal, name-only profile if anything goes wrong, so research never blocks
    on resolution.
    """
    company = (company or "").strip()
    domain = normalize_domain(website)

    queries = [f"{company} company overview", f'"{company}" official website what they do']
    if domain:
        # Lead with domain-anchored queries so the company's own pages rank first.
        queries = [f"{company} {domain}", f"about {company} site:{domain}"] + queries

    results = await web_search(queries, max_results=6)
    site_text, logo_url = await _fetch_site(domain)

    anchor = (
        f"The candidate says the company's official website is: {domain}\n"
        "Resolve to the organization that OWNS that exact domain.\n"
        if domain
        else "No website was provided. Identify the most prominent company by this "
        "name, and if the name is ambiguous, list the others under "
        "'not_to_be_confused_with' and set confidence to 'low' or 'medium'.\n"
    )
    domain_hint = domain or "the official domain you are most confident about, else ''"

    try:
        raw = await ask_json(
            system=(
                "You are an entity-resolution analyst. Pin down which ONE real-world "
                "organization a job candidate means, so later research agents never "
                "mix it up with other companies that share the name. "
                "Respond with ONLY a valid JSON object, no prose."
            ),
            user=f"""Company name the candidate typed: "{company}"
{anchor}
The company's OWN website text (may be empty if it could not be fetched):
{site_text or "(none retrieved)"}

Web search results for the name:
{format_results(results)}

Return JSON with exactly these keys:
{{
  "canonical_name": "the company's proper/legal name",
  "domain": "{domain_hint}",
  "one_liner": "one sentence: what THIS specific company does",
  "industry": "primary industry/sector in 1-3 words",
  "headquarters": "city, country if known, else ''",
  "identifiers": ["2-4 distinctive keywords/products/tickers that uniquely pick out THIS company in a web search (e.g. a flagship product, a stock ticker, a niche)"],
  "aliases": ["other names or spellings for this same company"],
  "not_to_be_confused_with": ["short descriptions of OTHER, different organizations that share this name, e.g. 'Alpha Omega Semiconductor (aosmd.com), a power-semiconductor maker' — empty list if there are none"],
  "confidence": "high if you are sure which entity this is, else medium or low"
}}""",
            llm_cfg=llm_cfg,
        )
    except Exception:
        fallback = _base_profile(company, domain)
        fallback["logo_url"] = logo_url or _google_favicon(domain)
        return fallback

    profile = _base_profile(company, domain)
    if isinstance(raw, dict):
        for k in _PROFILE_KEYS:
            if raw.get(k) is not None:
                profile[k] = raw[k]

    # Guarantee a usable, well-typed shape.
    if domain:
        profile["domain"] = domain  # user-provided anchor always wins over the guess
    if not str(profile.get("canonical_name") or "").strip():
        profile["canonical_name"] = company
    for key in _LIST_KEYS:
        value = profile.get(key)
        if not isinstance(value, list):
            profile[key] = []
        else:
            profile[key] = [str(v).strip() for v in value if str(v).strip()]

    # Logo: prefer the company's own homepage icon, else Google's favicon service
    # for whichever domain we ended up with. Always identifying-use only.
    profile["logo_url"] = logo_url or _google_favicon(profile.get("domain") or domain)
    return profile
