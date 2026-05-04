/**
 * Match GPT-extracted taxonomy labels to canonical DB names.
 * GPT often returns "and" instead of "&", different hyphenation, or extra punctuation.
 */
export function normalizeTaxonomyLabel(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/-/g, " ")
    .replace(/[""'']/g, "'")
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ");
}

export interface NamedItem {
  id: number;
  name: string;
}

/**
 * Find a taxonomy item by name; tries exact (case-insensitive), then normalized equality,
 * then alphanumeric-only equality.
 */
export function matchTaxonomyName<T extends NamedItem>(raw: string, items: T[]): T | undefined {
  const t = raw.trim();
  if (!t) return undefined;

  const lower = t.toLowerCase();
  let hit = items.find((item) => item.name.toLowerCase() === lower);
  if (hit) return hit;

  const n = normalizeTaxonomyLabel(t);
  hit = items.find((item) => normalizeTaxonomyLabel(item.name) === n);
  if (hit) return hit;

  const strip = (x: string) => normalizeTaxonomyLabel(x).replace(/[^a-z0-9]/g, "");
  const ns = strip(t);
  if (ns.length >= 3) {
    hit = items.find((item) => strip(item.name) === ns);
    if (hit) return hit;
  }

  return undefined;
}

/** Map common GPT phrasing to canonical grade band values used in the app. */
export function normalizeGradeBandToCanonical(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const table: Array<{ re: RegExp; value: string }> = [
    { re: /^(pk-12|p-12|prek-12)$/, value: "PK-12" },
    { re: /^(k-12)$/, value: "K-12" },
    { re: /^(pk-5|prek-5|k-5|elementary)$/, value: "K-5" },
    { re: /^(6-8|middle(\s+school)?)$/, value: "6-8" },
    { re: /^(9-12|high\s*school|hs)$/, value: "9-12" },
    { re: /^(k-8)$/, value: "K-8" },
    { re: /^(6-12)$/, value: "6-12" },
    { re: /^(post-?secondary|postsecondary)$/, value: "Post-secondary" },
  ];

  for (const { re, value } of table) {
    if (re.test(s)) return value;
  }

  // Already canonical (allowlisted in extraction prompt)
  const allowed = new Set([
    "K-5", "6-8", "9-12", "K-8", "K-12", "6-12", "PK-5", "PK-12", "Post-secondary",
  ]);
  const spaced = raw.trim();
  if (allowed.has(spaced)) return spaced;

  return null;
}
