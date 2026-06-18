// One fixed, harmonious color per scorecard dimension. Used by the score bars
// (and anywhere a dimension needs a consistent hue) so the palette reads as a
// deliberate set rather than a noisy gradient. Tuned to sit well on dark slate.
export const DIMENSION_COLORS: Record<string, string> = {
  "Values & Mission": "#2dd4bf", // teal
  "Benefits & Pay": "#fbbf24", // amber
  "Business Health": "#60a5fa", // blue
  "Leadership": "#a78bfa", // violet
  "Momentum & News": "#fb923c", // orange
  "Risk Profile": "#fb7185", // rose
};

// Ordered fallbacks for any dimension not in the map (keeps colors distinct).
const FALLBACKS = ["#2dd4bf", "#fbbf24", "#60a5fa", "#a78bfa", "#fb923c", "#fb7185"];

export function dimensionColor(dimension: string, index = 0): string {
  return DIMENSION_COLORS[dimension] ?? FALLBACKS[index % FALLBACKS.length];
}
