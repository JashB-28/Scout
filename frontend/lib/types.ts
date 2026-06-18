export interface CoreValue {
  value: string;
  meaning: string;
}

export interface MissionValues {
  mission: string;
  core_values: CoreValue[];
  culture_summary: string;
  values_alignment_questions: string[];
  talking_points: string[];
  sources: string[];
}

export interface BenefitCategory {
  category: string;
  items: string[];
}

export interface Benefits {
  benefits: BenefitCategory[];
  compensation_notes: string;
  work_life_balance: string;
  standout_perks: string[];
  questions_to_ask: string[];
  sources: string[];
}

export interface Product {
  name: string;
  description: string;
}

export interface BusinessOps {
  what_they_do: string;
  business_model: string;
  key_products: Product[];
  market_position: string;
  scale: {
    employees: string;
    headquarters: string;
    founded: string;
    revenue: string;
  };
  competitors: string[];
  growth_trajectory: string;
  smart_questions: string[];
  sources: string[];
}

export interface Leader {
  name: string;
  title: string;
  background: string;
  notable: string;
}

export interface Leadership {
  leaders: Leader[];
  leadership_style: string;
  vision_statements: string[];
  recent_changes: string;
  interview_angle: string;
  sources: string[];
}

export interface Headline {
  title: string;
  date: string;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  url: string;
}

export interface News {
  headlines: Headline[];
  big_picture: string;
  conversation_starters: string[];
  sources: string[];
}

export interface RedFlag {
  flag: string;
  severity: "low" | "medium" | "high";
  detail: string;
  pattern_or_isolated: "pattern" | "isolated";
}

export interface RedFlags {
  risk_level: "low" | "moderate" | "elevated" | "high";
  red_flags: RedFlag[];
  green_flags: string[];
  verdict: string;
  questions_to_probe: string[];
  sources: string[];
}

export interface DimensionScore {
  dimension: string;
  score: number;
  reason: string;
}

export interface Synthesis {
  executive_summary: string;
  overall_score: number;
  recommendation: string;
  scores: DimensionScore[];
  elevator_pitch: string;
  top_questions_to_ask: string[];
  prep_checklist: string[];
}

export interface Charts {
  fit_radar: { dimension: string; score: number }[];
  news_sentiment: { name: string; value: number }[];
  risk_severity: { name: string; value: number }[];
}

export interface CompanyProfile {
  canonical_name: string;
  domain: string;
  logo_url: string;
  one_liner: string;
  industry: string;
  headquarters: string;
  identifiers: string[];
  aliases: string[];
  not_to_be_confused_with: string[];
  confidence: "high" | "medium" | "low";
}

export interface Report {
  company: string;
  role: string;
  profile?: CompanyProfile | null;
  synthesis: Synthesis;
  charts: Charts;
  sections: {
    mission_values: MissionValues;
    benefits: Benefits;
    business_ops: BusinessOps;
    leadership: Leadership;
    news: News;
    red_flags: RedFlags;
  };
}

export const AGENTS = [
  { id: "mission_values", label: "Values & Mission Agent", blurb: "Mission, core values, culture fit" },
  { id: "benefits", label: "Benefits Agent", blurb: "Perks, pay, work-life balance" },
  { id: "business_ops", label: "Business Operations Agent", blurb: "Model, products, market position" },
  { id: "leadership", label: "Leadership Agent", blurb: "Executives, vision, recent changes" },
  { id: "news", label: "News & Events Agent", blurb: "Headlines with sentiment analysis" },
  { id: "red_flags", label: "Red Flag Scanner", blurb: "Layoffs, lawsuits, controversies" },
  { id: "synthesizer", label: "Synthesis Agent", blurb: "Scores, pitch, prep checklist" },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];
