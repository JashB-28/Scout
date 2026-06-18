"use client";

import { downloadFile, reportToMarkdown } from "@/lib/markdown";
import { reportToPdf } from "@/lib/pdf";
import type { Report } from "@/lib/types";
import { dimensionColor } from "@/lib/theme";
import { FitRadar, InfoTip, RiskBars, ScoreRing, SentimentDonut } from "./Charts";

/** Company logo as an identifier; quietly disappears if the image fails to load. */
function CompanyLogo({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${alt} logo`}
      className={className}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function Card({
  accent,
  eyebrow,
  title,
  info,
  children,
  className = "",
}: {
  accent: "red" | "teal" | "yellow";
  eyebrow: string;
  title: string;
  info?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const accentColor = {
    red: "text-brand-red border-brand-red/50",
    teal: "text-brand-teal border-brand-teal/50",
    yellow: "text-brand-yellow border-brand-yellow/50",
  }[accent];
  return (
    <section
      className={`float-in rounded-2xl border border-borderline bg-card p-6 ${className}`}
    >
      <p
        className={`mb-1 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${accentColor}`}
      >
        {eyebrow}
      </p>
      <h3 className="mb-4 flex items-center gap-2 text-xl font-semibold text-paper">
        {title}
        {info ? <InfoTip text={info} /> : null}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items, marker = "›" }: { items?: string[]; marker?: string }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1.5 text-sm text-soft">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-brand-yellow">{marker}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Sources({ urls }: { urls?: string[] }) {
  const valid = (urls ?? []).filter((u) => /^https?:\/\//i.test(u));
  if (!valid.length) return null;
  return (
    <details className="group mt-5 rounded-xl border border-borderline">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted transition-colors hover:text-paper">
        <span className="text-[9px] transition-transform duration-200 group-open:rotate-90">
          ▶
        </span>
        Sources ({valid.length})
        <span className="ml-auto font-normal normal-case tracking-normal text-[10px] text-faint">
          verify every claim
        </span>
      </summary>
      <ul className="space-y-1.5 border-t border-borderline px-4 py-3">
        {valid.map((url, i) => (
          <li key={i} className="truncate text-xs">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-teal underline-offset-2 hover:underline"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-muted first:mt-0">
      {children}
    </h4>
  );
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-brand-teal/15 text-brand-teal",
  neutral: "bg-brand-yellow/15 text-brand-yellow",
  negative: "bg-brand-red/15 text-brand-red",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "bg-brand-yellow/15 text-brand-yellow",
  medium: "bg-orange-500/15 text-orange-400",
  high: "bg-brand-red/15 text-brand-red",
};

const RISK_LEVEL_COLOR: Record<string, string> = {
  low: "text-brand-teal",
  moderate: "text-brand-yellow",
  elevated: "text-orange-400",
  high: "text-brand-red",
};

export default function ReportView({ report }: { report: Report }) {
  const { synthesis, charts, sections } = report;
  const { mission_values, benefits, business_ops, leadership, news, red_flags } =
    sections;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 pb-24">
      {/* ===== Executive summary ===== */}
      <section className="float-in rounded-2xl border border-borderline bg-gradient-to-br from-card to-background p-8">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-center">
          <ScoreRing score={synthesis?.overall_score ?? 0} />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-red">
              Briefing complete
            </p>
            <div className="mt-1 flex items-center gap-3">
              <CompanyLogo
                src={report.profile?.logo_url}
                alt={report.profile?.canonical_name || report.company}
                className="h-10 w-10 shrink-0 rounded-lg bg-white/5 object-contain p-1 ring-1 ring-borderline"
              />
              <h2 className="text-3xl font-bold text-paper">
                {report.profile?.canonical_name || report.company}
                {report.role ? (
                  <span className="text-muted"> · {report.role}</span>
                ) : null}
              </h2>
            </div>
            {report.profile?.domain ? (
              <a
                href={`https://${report.profile.domain}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-brand-teal hover:underline"
              >
                {report.profile.domain} ↗
              </a>
            ) : null}
            <p className="mt-3 leading-relaxed text-soft">
              {synthesis?.executive_summary}
            </p>
            <p className="mt-3 inline-block rounded-lg border border-borderline bg-track px-3 py-1.5 text-sm text-soft">
              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-yellow">
                Analyst read
              </span>
              {synthesis?.recommendation}
            </p>
            <p className="mt-3 text-xs text-faint">
              The score rates the <em>company</em> from public web signals
              (business health, benefits, reputation, momentum, risk). It knows
              nothing about your resume or background, so it is not a measure
              of your personal fit or your chances.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Charts row ===== */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          accent="teal"
          eyebrow="Company analysis"
          title="Company strength radar"
          info="Each axis rates one aspect of the company (0–100) based on what the agents found in public sources. A bigger shape means a stronger company overall. On the Risk axis, higher means LOWER risk."
        >
          <FitRadar data={charts?.fit_radar ?? []} />
          <p className="mt-1 text-xs text-faint">
            Rates the company on public signals — not your personal fit.
          </p>
        </Card>
        <Card
          accent="yellow"
          eyebrow="News pulse"
          title="Headline sentiment"
          info="The news agent classified each recent headline it found as positive, neutral, or negative for the company. Mostly negative slices are worth reading closely before the interview."
        >
          <SentimentDonut data={charts?.news_sentiment ?? []} />
          <p className="mt-2 text-sm text-faint">{news?.big_picture}</p>
        </Card>
        <Card
          accent="red"
          eyebrow="Risk scan"
          title="Red flags by severity"
          info="Counts the red flags the due-diligence agent found (layoffs, lawsuits, culture complaints…), grouped by how serious each one looks. Details and sources are in the Red Flag Scan section below."
        >
          <RiskBars data={charts?.risk_severity ?? []} />
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <span className="text-muted">Overall risk: </span>
            <span
              className={`font-semibold uppercase ${RISK_LEVEL_COLOR[red_flags?.risk_level] ?? "text-muted"}`}
            >
              {red_flags?.risk_level}
            </span>
            <InfoTip text="The due-diligence agent's overall judgement of how risky this company looks for a new joiner, weighing how serious the red flags are and whether they form a pattern or are isolated incidents." />
          </p>
        </Card>
      </div>

      {/* ===== Dimension scores ===== */}
      <Card
        accent="teal"
        eyebrow="Scorecard"
        title="Why these scores"
        info="The synthesis agent's one-line justification for every dimension score on the radar, so you can see what each number is based on."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {synthesis?.scores?.map((s, i) => {
            const color = dimensionColor(s.dimension, i);
            return (
              <div key={s.dimension} className="rounded-xl border border-borderline p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-paper">{s.dimension}</span>
                  <span className="font-mono text-lg font-bold" style={{ color }}>
                    {s.score}
                  </span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-track">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, s.score))}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <p className="text-xs text-faint">{s.reason}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ===== Values & mission ===== */}
      <Card accent="teal" eyebrow="01 · Shared values" title="Mission, values & culture">
        <p className="text-sm leading-relaxed text-soft">
          {mission_values?.mission}
        </p>
        <SubHeading>Core values</SubHeading>
        <div className="grid gap-3 md:grid-cols-2">
          {mission_values?.core_values?.map((v, i) => (
            <div key={i} className="rounded-xl border border-borderline p-3">
              <p className="text-sm font-semibold text-brand-teal">{v.value}</p>
              <p className="mt-1 text-xs text-faint">{v.meaning}</p>
            </div>
          ))}
        </div>
        <SubHeading>Culture</SubHeading>
        <p className="text-sm text-soft">{mission_values?.culture_summary}</p>
        <SubHeading>Ask yourself</SubHeading>
        <Bullets items={mission_values?.values_alignment_questions} />
        <SubHeading>Talking points for the interview</SubHeading>
        <Bullets items={mission_values?.talking_points} />
        <Sources urls={mission_values?.sources} />
      </Card>

      {/* ===== Benefits ===== */}
      <Card accent="yellow" eyebrow="02 · Benefits" title="Employee benefits & perks">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {benefits?.benefits?.map((b, i) => (
            <div key={i} className="rounded-xl border border-borderline p-3">
              <p className="text-sm font-semibold text-brand-yellow">{b.category}</p>
              <ul className="mt-1 space-y-1 text-xs text-faint">
                {b.items?.map((item, j) => (
                  <li key={j}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <SubHeading>Compensation</SubHeading>
        <p className="text-sm text-soft">{benefits?.compensation_notes}</p>
        <SubHeading>Work-life balance</SubHeading>
        <p className="text-sm text-soft">{benefits?.work_life_balance}</p>
        <SubHeading>Standout perks</SubHeading>
        <Bullets items={benefits?.standout_perks} marker="★" />
        <SubHeading>Questions to ask</SubHeading>
        <Bullets items={benefits?.questions_to_ask} />
        <Sources urls={benefits?.sources} />
      </Card>

      {/* ===== Business operations ===== */}
      <Card accent="red" eyebrow="03 · The business" title="How the company operates">
        <p className="text-sm leading-relaxed text-soft">
          {business_ops?.what_they_do}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["employees", "headquarters", "founded", "revenue"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-borderline p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted">{k}</p>
              <p className="mt-1 text-sm font-semibold text-paper">
                {business_ops?.scale?.[k] ?? "—"}
              </p>
            </div>
          ))}
        </div>
        <SubHeading>Business model</SubHeading>
        <p className="text-sm text-soft">{business_ops?.business_model}</p>
        <SubHeading>Key products & services</SubHeading>
        <div className="grid gap-3 md:grid-cols-2">
          {business_ops?.key_products?.map((p, i) => (
            <div key={i} className="rounded-xl border border-borderline p-3">
              <p className="text-sm font-semibold text-brand-red">{p.name}</p>
              <p className="mt-1 text-xs text-faint">{p.description}</p>
            </div>
          ))}
        </div>
        <SubHeading>Market position</SubHeading>
        <p className="text-sm text-soft">{business_ops?.market_position}</p>
        {business_ops?.competitors?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {business_ops.competitors.map((c, i) => (
              <span
                key={i}
                className="rounded-full border border-borderline px-3 py-1 text-xs text-soft"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
        <SubHeading>Growth trajectory</SubHeading>
        <p className="text-sm text-soft">{business_ops?.growth_trajectory}</p>
        <SubHeading>Business-savvy questions</SubHeading>
        <Bullets items={business_ops?.smart_questions} />
        <Sources urls={business_ops?.sources} />
      </Card>

      {/* ===== Leadership ===== */}
      <Card accent="teal" eyebrow="04 · Leadership" title="Who runs the company">
        <div className="grid gap-3 md:grid-cols-2">
          {leadership?.leaders?.map((l, i) => (
            <div key={i} className="rounded-xl border border-borderline p-4">
              <p className="font-semibold text-paper">{l.name}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-teal">
                {l.title}
              </p>
              <p className="mt-2 text-xs text-faint">{l.background}</p>
              {l.notable ? (
                <p className="mt-2 rounded-lg bg-brand-yellow/10 p-2 text-xs text-brand-yellow">
                  💡 {l.notable}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <SubHeading>Leadership style</SubHeading>
        <p className="text-sm text-soft">{leadership?.leadership_style}</p>
        <SubHeading>Public vision</SubHeading>
        <Bullets items={leadership?.vision_statements} marker="“" />
        <SubHeading>Recent changes</SubHeading>
        <p className="text-sm text-soft">{leadership?.recent_changes}</p>
        <SubHeading>How to use this</SubHeading>
        <p className="text-sm text-soft">{leadership?.interview_angle}</p>
        <Sources urls={leadership?.sources} />
      </Card>

      {/* ===== News ===== */}
      <Card accent="yellow" eyebrow="05 · In the news" title="Recent events & headlines">
        <div className="space-y-3">
          {news?.headlines?.map((h, i) => (
            <a
              key={i}
              href={h.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-borderline p-4 transition-colors hover:border-brand-teal/60"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-paper">{h.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SENTIMENT_BADGE[h.sentiment] ?? "bg-track text-muted"}`}
                >
                  {h.sentiment}
                </span>
              </div>
              <p className="mt-1 text-xs text-faint">{h.summary}</p>
              {h.date ? <p className="mt-1 text-[10px] text-muted">{h.date}</p> : null}
            </a>
          ))}
        </div>
        <SubHeading>Conversation starters</SubHeading>
        <Bullets items={news?.conversation_starters} />
        <Sources urls={news?.sources} />
      </Card>

      {/* ===== Red flags ===== */}
      <Card accent="red" eyebrow="06 · Red flag scan" title="Due diligence: anything to worry about?">
        {red_flags?.red_flags?.length ? (
          <div className="space-y-3">
            {red_flags.red_flags.map((f, i) => (
              <div key={i} className="rounded-xl border border-brand-red/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-paper">🚩 {f.flag}</p>
                  <div className="flex shrink-0 gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE[f.severity] ?? "bg-track text-muted"}`}
                    >
                      {f.severity}
                    </span>
                    <span className="rounded-full bg-track px-2 py-0.5 text-[10px] uppercase text-muted">
                      {f.pattern_or_isolated}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-faint">{f.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-brand-teal/40 bg-brand-teal/10 p-4 text-sm text-brand-teal">
            ✓ No significant red flags surfaced in the scan.
          </p>
        )}
        <SubHeading>Green flags</SubHeading>
        <Bullets items={red_flags?.green_flags} marker="✓" />
        <SubHeading>Verdict</SubHeading>
        <p className="text-sm text-soft">{red_flags?.verdict}</p>
        <SubHeading>Diplomatic questions to probe</SubHeading>
        <Bullets items={red_flags?.questions_to_probe} />
        <Sources urls={red_flags?.sources} />
      </Card>

      {/* ===== Interview cheat sheet ===== */}
      <Card accent="yellow" eyebrow="Final prep" title="Your interview cheat sheet">
        <SubHeading>30-second elevator pitch</SubHeading>
        <blockquote className="rounded-xl border-l-4 border-brand-yellow bg-brand-yellow/5 p-4 text-sm italic leading-relaxed text-soft">
          “{synthesis?.elevator_pitch}”
        </blockquote>
        <SubHeading>Best questions to ask them</SubHeading>
        <Bullets items={synthesis?.top_questions_to_ask} marker="?" />
        <SubHeading>Prep checklist</SubHeading>
        <ul className="space-y-2 text-sm text-soft">
          {synthesis?.prep_checklist?.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-teal text-[9px] text-brand-teal">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ===== Download ===== */}
      <section className="float-in rounded-2xl border border-borderline bg-gradient-to-br from-card to-background p-8 text-center">
        <h3 className="text-xl font-semibold text-paper">Take it with you</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-faint">
          Save the full briefing locally so you can review it offline right
          before the interview.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => reportToPdf(report)}
            className="rounded-xl bg-brand-red px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            ⬇ Download briefing (PDF)
          </button>
          <button
            onClick={() =>
              downloadFile(
                `${report.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-briefing.md`,
                reportToMarkdown(report),
                "text/markdown"
              )
            }
            className="rounded-xl bg-brand-teal px-6 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            ⬇ Markdown
          </button>
          <button
            onClick={() =>
              downloadFile(
                `${report.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-briefing.json`,
                JSON.stringify(report, null, 2),
                "application/json"
              )
            }
            className="rounded-xl border border-borderline px-6 py-3 text-sm font-semibold text-soft transition-colors hover:border-brand-teal hover:text-paper"
          >
            ⬇ Raw data (JSON)
          </button>
        </div>
      </section>
    </div>
  );
}
