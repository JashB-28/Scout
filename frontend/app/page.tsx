"use client";

import { useRef, useState } from "react";
import AgentProgress from "@/components/AgentProgress";
import ReportView from "@/components/Report";
import ScrollPath from "@/components/ScrollPath";
import { useTheme } from "@/components/ThemeProvider";
import { AGENTS, type AgentId, type CompanyProfile, type Report } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type Phase = "idle" | "running" | "done" | "error";

const FEATURES = [
  {
    accent: "text-brand-teal",
    title: "Shared values, surfaced",
    body: "43% of candidates pick jobs for meaningful work. We map the mission and core values so you can check they resonate with yours.",
  },
  {
    accent: "text-brand-yellow",
    title: "Benefits, decoded",
    body: "Health, pay philosophy, time off, growth budgets — the full package, with smart questions to ask about it.",
  },
  {
    accent: "text-brand-red",
    title: "Business, explained",
    body: "How they make money, who they compete with, and whether they're growing — so you sound like an insider.",
  },
  {
    accent: "text-brand-teal",
    title: "Leadership, profiled",
    body: "Who runs the company, their background, and the vision they've stated publicly — referenced naturally in your answers.",
  },
  {
    accent: "text-brand-yellow",
    title: "News, summarized",
    body: "Recent launches, funding, and events with sentiment analysis — instant conversation starters.",
  },
  {
    accent: "text-brand-red",
    title: "Red flags, scanned",
    body: "Layoffs, lawsuits, culture complaints — patterns vs. isolated incidents, judged fairly, before you sign anything.",
  },
];

const PROVIDERS = [
  { id: "groq", label: "Groq" },
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "together", label: "Together AI" },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle color theme"
      className="ml-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-borderline text-muted transition-colors hover:border-brand-yellow hover:text-brand-yellow"
    >
      {theme === "dark" ? (
        /* sun */
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* moon */
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export default function Home() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [website, setWebsite] = useState("");
  const [resolved, setResolved] = useState<CompanyProfile | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("groq");
  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState<Set<AgentId>>(new Set());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 8000);
  }

  function resetToLanding() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setReport(null);
    setResolved(null);
    setDone(new Set());
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Guess the provider from well-known key prefixes to catch mismatches. */
  function guessProvider(key: string): string | null {
    if (key.startsWith("gsk_")) return "groq";
    if (key.startsWith("sk-or-")) return "openrouter";
    if (key.startsWith("sk-")) return "openai";
    return null;
  }

  async function startResearch(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || phase === "running") return;
    abortRef.current?.abort();
    setPhase("running");
    setDone(new Set());
    setReport(null);
    setResolved(null);
    setError("");

    // Auto-correct an obvious key/provider mismatch (e.g. Groq key + OpenAI selected)
    const key = apiKey.trim();
    let effectiveProvider = provider;
    if (key) {
      const guessed = guessProvider(key);
      if (guessed && guessed !== provider) {
        effectiveProvider = guessed;
        setProvider(guessed);
        const label = (id: string) =>
          PROVIDERS.find((p) => p.id === id)?.label ?? id;
        showToast(
          `Your key looks like a ${label(guessed)} key, not ${label(provider)} — using ${label(guessed)} instead.`
        );
      }
    }

    // Pre-flight: check the backend is reachable and a key is available so we
    // can show precise messages before opening the stream.
    try {
      const health = await fetch(`${API_BASE}/health`).then((r) => r.json());
      if (!key && !health.groq_key_configured) {
        setError(
          "No API key available: paste your own key in the panel below, or add GROQ_API_KEY to backend/.env and restart the backend."
        );
        setPhase("error");
        return;
      }
      if (!key) {
        showToast("No API key provided — using the server's default Groq key.");
      }
    } catch {
      setError(
        "Cannot reach the research API. Start the backend (see the README) — it should be listening on :8000."
      );
      setPhase("error");
      return;
    }

    // POST the key in the request body (never the URL) and read the SSE stream
    // off the fetch response. Native EventSource only does GET with no headers,
    // which would leak the key into history/logs — so we parse SSE by hand.
    const body: Record<string, string> = {
      company: company.trim(),
      role: role.trim(),
      website: website.trim(),
    };
    if (key) {
      body.api_key = key;
      body.provider = effectiveProvider;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;

    const fail = (detail: string) => {
      if (finished) return;
      finished = true;
      setError(detail);
      setPhase("error");
    };

    const dispatch = (event: string, data: string) => {
      if (!data) return;
      if (event === "resolved") {
        const profile = JSON.parse(data) as CompanyProfile;
        setResolved(profile);
        // Heads-up when the name was ambiguous and no website pinned it down.
        if (
          !website.trim() &&
          profile.confidence !== "high" &&
          (profile.not_to_be_confused_with?.length ?? 0) > 0
        ) {
          showToast(
            `"${company.trim()}" is ambiguous — researching ${profile.canonical_name}` +
              (profile.domain ? ` (${profile.domain})` : "") +
              ". Add the company website above to be sure."
          );
        }
      } else if (event === "key_fallback") {
        showToast(JSON.parse(data).detail ?? "API key not valid — falling back to Groq.");
      } else if (event === "agent_done") {
        setDone((prev) => new Set(prev).add(JSON.parse(data).agent as AgentId));
      } else if (event === "report") {
        finished = true;
        setReport(JSON.parse(data));
        setPhase("done");
      } else if (event === "error") {
        fail(JSON.parse(data).detail ?? "The research run failed.");
      }
    };

    try {
      const res = await fetch(`${API_BASE}/api/research/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // A non-streaming error (bad input, no key) comes back as a JSON body.
      if (!res.ok || !res.body) {
        let detail = `The research API returned an error (${res.status}).`;
        try {
          const j = await res.json();
          if (typeof j?.detail === "string") detail = j.detail;
        } catch {
          /* keep the generic message */
        }
        fail(detail);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // sse-starlette frames are CRLF-delimited; tolerate LF too.
      const frameSep = /\r\n\r\n|\n\n/;
      let buffer = "";

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let match: RegExpExecArray | null;
        while (!finished && (match = frameSep.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);

          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split(/\r\n|\n|\r/)) {
            if (!line || line.startsWith(":")) continue; // blank or keepalive
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
          }
          dispatch(event, dataLines.join("\n"));
        }
      }

      if (!finished) {
        fail(
          "The connection to the research API dropped mid-run. Check the backend terminal for errors and try again."
        );
      }
    } catch {
      if (controller.signal.aborted) return; // user restarted or left the page
      fail(
        "The connection to the research API dropped mid-run. Check the backend terminal for errors and try again."
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <main className="min-h-screen w-full">
      {/* ===== Toast ===== */}
      {toast && (
        <div className="float-in fixed right-4 top-20 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-brand-yellow/50 bg-card p-4 shadow-2xl">
          <span className="text-brand-yellow">⚠</span>
          <p className="flex-1 text-sm text-soft">{toast}</p>
          <button
            onClick={() => setToast("")}
            className="cursor-pointer text-muted transition-colors hover:text-paper"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== Nav ===== */}
      <nav className="sticky top-0 z-20 w-full border-b border-borderline bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            onClick={resetToLanding}
            className="flex cursor-pointer items-center gap-2 transition-opacity hover:opacity-80"
            title="Back to home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red font-bold text-white">
              S1
            </span>
            <span className="text-lg font-bold tracking-tight text-paper">
              Scout<span className="text-brand-teal">One</span>
            </span>
          </button>
          <div className="hidden items-center gap-6 text-sm text-muted sm:flex">
            {phase === "idle" || phase === "error" ? (
              <>
                <a
                  href="#how"
                  className="cursor-pointer transition-colors hover:text-brand-teal"
                >
                  How it works
                </a>
                <a
                  href="#agents"
                  className="cursor-pointer transition-colors hover:text-brand-teal"
                >
                  The agents
                </a>
                <a
                  href="#research"
                  className="cursor-pointer rounded-lg bg-brand-teal px-4 py-2 font-semibold text-ink transition-opacity hover:opacity-90"
                >
                  Run research
                </a>
              </>
            ) : phase === "running" ? (
              <span className="flex items-center gap-2 text-brand-yellow">
                <span className="pulse-dot">●</span> Researching {company}…
              </span>
            ) : (
              <button
                onClick={resetToLanding}
                className="cursor-pointer rounded-lg bg-brand-teal px-4 py-2 font-semibold text-ink transition-opacity hover:opacity-90"
              >
                ← New search
              </button>
            )}
          </div>
          <ThemeToggle />
        </div>
      </nav>

      {/* ===== Hero + form ===== */}
      <header className="hero-grid relative overflow-hidden border-b border-borderline">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-brand-teal/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="mx-auto mb-4 inline-block rounded-full border border-brand-yellow/40 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-yellow">
            7 AI agents · 1 briefing
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-paper sm:text-6xl">
            Know the company <span className="text-brand-red">before</span>{" "}
            they know <span className="text-brand-teal">you</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-faint">
            ScoutOne sends a team of AI research agents to investigate any
            company — values, benefits, business model, leadership, news, and
            red flags — and hands you an interview-ready briefing in minutes.
          </p>

          <form
            id="research"
            onSubmit={startResearch}
            className="mx-auto mt-10 flex max-w-2xl flex-col gap-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name (e.g. Stripe)"
                className="flex-1 rounded-xl border border-borderline bg-card px-4 py-3.5 text-paper placeholder:text-muted focus:border-brand-teal focus:outline-none"
                required
              />
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role (optional)"
                className="flex-1 rounded-xl border border-borderline bg-card px-4 py-3.5 text-paper placeholder:text-muted focus:border-brand-teal focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Company website (recommended — e.g. alphaomega.com)"
                className="flex-1 rounded-xl border border-borderline bg-card px-4 py-3.5 text-paper placeholder:text-muted focus:border-brand-teal focus:outline-none"
              />
              <button
                type="submit"
                disabled={phase === "running"}
                className="rounded-xl bg-brand-red px-6 py-3.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === "running" ? "Researching…" : "Research →"}
              </button>
            </div>
            <p className="px-1 text-left text-xs text-muted">
              Pin the exact company with its website — essential when the name is
              shared (e.g. two different companies called &ldquo;Alpha Omega&rdquo;).
            </p>
          </form>

          <details className="group mx-auto mt-4 max-w-2xl rounded-xl border border-borderline bg-card/60 text-left">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm text-muted transition-colors hover:text-paper">
              <span className="text-[9px] transition-transform duration-200 group-open:rotate-90">
                ▶
              </span>
              Use your own API key
              <span className="ml-auto text-xs text-faint">
                optional — defaults to the server&apos;s Groq key
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-borderline px-4 py-4 sm:flex-row">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-lg border border-borderline bg-card px-3 py-2.5 text-sm text-paper focus:border-brand-teal focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key (never stored)"
                autoComplete="off"
                className="flex-1 rounded-lg border border-borderline bg-card px-3 py-2.5 text-sm text-paper placeholder:text-muted focus:border-brand-teal focus:outline-none"
              />
            </div>
            <p className="border-t border-borderline px-4 py-2.5 text-xs text-faint">
              Your key is sent only to your local backend for this one research
              run and is never saved. Leave empty to use the Groq key configured
              on the server.
            </p>
          </details>

          {phase === "error" && (
            <p className="mx-auto mt-4 max-w-2xl rounded-xl border border-brand-red/40 bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
              {error}
            </p>
          )}
        </div>
      </header>

      {/* ===== Live progress ===== */}
      {phase === "running" && (
        <div className="pt-12">
          <AgentProgress company={company} done={done} resolved={resolved} />
        </div>
      )}

      {/* ===== Report ===== */}
      {phase === "done" && report && (
        <div className="pt-12">
          <ReportView report={report} />
        </div>
      )}

      {/* ===== Marketing sections (landing state) ===== */}
      {(phase === "idle" || phase === "error") && (
        <div className="relative">
          <ScrollPath />
          <section id="how" className="relative mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-3xl font-bold text-paper">
              Everything recruiters wish you researched
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-faint">
              One search replaces hours of tab-hopping across review sites,
              news, and investor pages.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-borderline bg-card p-6 transition-colors hover:border-muted"
                >
                  <h3 className={`font-semibold ${f.accent}`}>{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-faint">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section id="agents" className="relative border-t border-borderline bg-card/40">
            <div className="mx-auto max-w-6xl px-6 py-20">
              <h2 className="text-center text-3xl font-bold text-paper">
                Meet your research team
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-center text-faint">
                A LangGraph pipeline fans out to six specialists in parallel,
                then a synthesis agent turns their findings into scores,
                charts, and a prep checklist.
              </p>
              <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {AGENTS.map((agent, i) => (
                  <div
                    key={agent.id}
                    className="rounded-2xl border border-borderline bg-card p-5"
                  >
                    <span
                      className={`font-mono text-xs ${
                        i % 3 === 0
                          ? "text-brand-red"
                          : i % 3 === 1
                            ? "text-brand-teal"
                            : "text-brand-yellow"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="mt-2 text-sm font-semibold text-paper">
                      {agent.label}
                    </p>
                    <p className="mt-1 text-xs text-muted">{agent.blurb}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="relative mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="text-3xl font-bold text-paper">
              Walk in <span className="text-brand-yellow">prepared</span>.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-faint">
              Type a company name above and get your briefing before your
              coffee goes cold.
            </p>
            <a
              href="#research"
              className="mt-8 inline-block rounded-xl bg-brand-teal px-8 py-4 font-semibold text-ink transition-opacity hover:opacity-90"
            >
              Start researching — it&apos;s free
            </a>
          </section>
        </div>
      )}

      <footer className="border-t border-borderline py-8 text-center text-xs text-muted">
        ScoutOne · FastAPI + LangGraph + Groq + Next.js · Built for interview
        preparation
      </footer>
    </main>
  );
}
