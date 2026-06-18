# ScoutOne — Multi-Agent Company Research

Know everything about a company **before** you walk into the interview. ScoutOne
orchestrates six specialist AI agents (LangGraph + Groq) that research a company
in parallel and merge their findings into a scored, chart-backed briefing.

A resolver step runs first: it locks onto the exact company you mean — anchored to
the official website you provide — and hands every agent a disambiguation brief, so
two unrelated companies that happen to share a name never get blended into one
briefing. Pass the company website for common names.

## The agent team

| Agent | What it researches |
|---|---|
| Values & Mission Agent | Core mission, values, culture — do they share *your* values? |
| Benefits Agent | Employee benefits, perks, compensation, work-life balance |
| Business Operations Agent | Business model, products, market position, scale |
| Leadership Agent | Executives, their backgrounds, vision, recent changes |
| News & Events Agent | Recent headlines with sentiment classification |
| Red Flag Scanner | Layoffs, lawsuits, controversies — patterns vs. isolated incidents |
| Synthesis Agent | Merges everything: fit scores, elevator pitch, prep checklist |

```
        START
          ▼
   resolve company   (lock onto ONE entity via the official website)
          ▼
   ┌──────┼──────┬─────────┬──────────┬─────────┐
   ▼      ▼      ▼         ▼          ▼         ▼
 values benefits ops   leadership   news    red flags   (parallel)
   └──────┴──────┴─────────┴──────────┴─────────┘
                        ▼
                   synthesizer
                        ▼
                     report
```

## Stack

- **Backend** — FastAPI, LangGraph, Groq API (`llama-3.3-70b-versatile`), DuckDuckGo search, SSE streaming
- **Frontend** — Next.js (App Router), Tailwind CSS, Recharts

## Setup

### 1. Backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# configure your Groq key (free at https://console.groq.com/keys)
copy backend\.env.example backend\.env
# then edit backend\.env and paste your key

cd backend
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev    # http://localhost:3000
```

## API

Both research endpoints take a JSON body (only `company` is required; `website` is
optional but recommended to disambiguate same-named companies):

```json
{ "company": "Acme", "role": "Backend Engineer", "website": "acme.com" }
```

- `GET /health` — liveness + whether the Groq key is configured
- `POST /api/research/stream` — SSE: a `resolved` event with the locked-in company
  identity, then live per-agent progress events, then the final report
- `POST /api/research` — same body → full report (includes the resolved `profile`)

## What the report covers

1. **Values alignment** — mission, core values, culture, and self-check questions
2. **Employee benefits** — categorized benefits, standout perks, pay notes
3. **Business operations** — model, products, competitors, scale, growth
4. **Leadership** — who runs the company and what they say publicly
5. **News & recent events** — sentiment-classified headlines
6. **Red flag scan** — risk level, severity-rated flags, green flags, verdict
7. **Synthesis** — overall fit score, radar chart, elevator pitch, top questions
   to ask, and a pre-interview prep checklist
