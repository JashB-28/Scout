"use client";

import { AGENTS, type AgentId, type CompanyProfile } from "@/lib/types";

export default function AgentProgress({
  company,
  done,
  resolved,
}: {
  company: string;
  done: Set<AgentId>;
  resolved?: CompanyProfile | null;
}) {
  const finished = done.size;
  const total = AGENTS.length;
  const heading = resolved?.canonical_name || company;
  return (
    <div className="float-in mx-auto max-w-3xl px-6 pb-24">
      <div className="rounded-2xl border border-borderline bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-paper">
              Researching <span className="text-brand-teal">{heading}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {finished < 6
                ? "Six agents are scouring the web in parallel…"
                : "Synthesizing the final briefing…"}
            </p>
          </div>
          <span className="font-mono text-sm text-brand-yellow">
            {finished}/{total}
          </span>
        </div>

        {/* Which exact company we locked onto — the disambiguation result. */}
        {resolved && (resolved.domain || resolved.one_liner) && (
          <div className="mb-6 flex gap-3 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-4 text-sm">
            {resolved.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolved.logo_url}
                alt={`${resolved.canonical_name} logo`}
                className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-contain p-1 ring-1 ring-borderline"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div>
              <p className="font-medium text-paper">
                Locked onto{" "}
                <span className="text-brand-teal">{resolved.canonical_name}</span>
                {resolved.domain && (
                  <span className="text-muted"> · {resolved.domain}</span>
                )}
              </p>
              {resolved.one_liner && (
                <p className="mt-1 text-muted">{resolved.one_liner}</p>
              )}
              {(resolved.not_to_be_confused_with?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-faint">
                  Not to be confused with: {resolved.not_to_be_confused_with.join("; ")}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-brand-teal transition-all duration-700"
            style={{ width: `${(finished / total) * 100}%` }}
          />
        </div>

        <ul className="space-y-3">
          {AGENTS.map((agent) => {
            const isDone = done.has(agent.id);
            return (
              <li
                key={agent.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                  isDone
                    ? "border-brand-teal/40 bg-brand-teal/5"
                    : "border-borderline"
                }`}
              >
                {isDone ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-ink">
                    ✓
                  </span>
                ) : (
                  <span className="pulse-dot flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-yellow text-xs text-brand-yellow">
                    ●
                  </span>
                )}
                <div>
                  <p
                    className={`text-sm font-medium ${isDone ? "text-paper" : "text-faint"}`}
                  >
                    {agent.label}
                  </p>
                  <p className="text-xs text-muted">{agent.blurb}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
