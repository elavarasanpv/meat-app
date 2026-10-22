import type { Product } from "@/hooks/useCatalog";

/**
 * Catalog search built for rural users: tolerant of misspellings
 * ("chikan", "maton"), Tamil-in-English typing ("kozhi", "muttai", "seval"),
 * and Tamil script. Pure client-side — the catalog is small.
 */

/** Spoken/typed synonyms → the English token they mean. */
const SYNONYMS: Record<string, string[]> = {
  chicken: ["kozhi", "koli", "kolee", "chiken", "chikan", "chkn", "broiler", "broylar"],
  country: ["nattu", "naatu", "natu", "desi"],
  cock: ["seval", "saval", "sevel", "rooster"],
  hen: ["pettai", "petta"],
  mutton: ["aatu", "attu", "adu", "goat", "maton", "matan", "mattan", "kari"],
  egg: ["muttai", "mutta", "anda", "eggs", "egss"],
  curry: ["kari", "curi", "cury", "kulambu"],
  cut: ["thundu", "tundu", "pieces", "piece", "cutt"],
  boneless: ["bonles", "boneles", "elumbilla", "elumbu"],
  breast: ["brest", "nenju", "nemju"],
  leg: ["kaal", "kal", "thodai", "todai", "drumstick"],
  wings: ["wing", "siragu", "chiragu", "siraku"],
  whole: ["muzhu", "mulu", "muzhusu", "mulusu", "full"],
  skinless: ["skinles", "thol", "tholilla"],
  farm: ["pannai", "panai", "white", "vellai"],
};

/** token → canonical english word(s) it may stand for */
const ALIAS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [eng, alts] of Object.entries(SYNONYMS)) {
    for (const a of [eng, ...alts]) {
      const list = m.get(a) ?? [];
      if (!list.includes(eng)) list.push(eng);
      m.set(a, list);
    }
  }
  return m;
})();

function normalize(s: string): string {
  return s.toLowerCase().replace(/[()–—/.,-]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/** Levenshtein distance, early-exit when over max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let best = (prev[0] = i) as number;
    let left = i - 1;
    for (let j = 1; j <= b.length; j++) {
      const sub = left + (a[i - 1] === b[j - 1] ? 0 : 1);
      left = prev[j];
      prev[j] = Math.min(sub, prev[j] + 1, prev[j - 1] + 1);
      if (prev[j] < best) best = prev[j];
    }
    if (best > max) return max + 1;
  }
  return prev[b.length];
}

/** How well a single query word matches a single target word (0..1). */
function wordScore(q: string, w: string): number {
  if (q === w) return 1;
  if (w.startsWith(q) || q.startsWith(w)) return 0.92;
  if (w.includes(q) && q.length >= 3) return 0.8;
  const max = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  const d = editDistance(q, w, max);
  if (d <= max) return 0.85 - 0.15 * d;
  return 0;
}

type WeightedWord = { w: string; weight: number };

export type SearchTarget = {
  product: Product;
  /** Pre-computed words to match against (own name = 1, category words = 0.85). */
  words: WeightedWord[];
};

type NamedRow = { id: string; name: string; name_ta: string | null };

/**
 * Build the word list once per product: English + Tamil names + expanded
 * synonyms, plus its category/sub-category words at a lower weight so
 * "chikan" also finds Curry cut and Wings (they live under Chicken).
 */
export function buildTargets(products: Product[], categories: NamedRow[] = [], subcategories: NamedRow[] = []): SearchTarget[] {
  const catWords = new Map(categories.map((c) => [c.id, expand(c)]));
  const subWords = new Map(subcategories.map((s) => [s.id, expand(s)]));

  function expand(row: { name: string; name_ta: string | null }): string[] {
    const words = new Set<string>();
    for (const w of tokens(row.name)) {
      words.add(w);
      for (const [alias, engs] of ALIAS) if (engs.some((e) => w.startsWith(e))) words.add(alias);
    }
    if (row.name_ta) for (const w of tokens(row.name_ta)) words.add(w);
    return [...words];
  }

  return products.map((p) => {
    const map = new Map<string, number>();
    const add = (w: string, weight: number) => map.set(w, Math.max(map.get(w) ?? 0, weight));
    for (const w of expand(p)) add(w, 1);
    for (const w of catWords.get(p.category_id) ?? []) add(w, 0.85);
    for (const w of (p.subcategory_id && subWords.get(p.subcategory_id)) || []) add(w, 0.85);
    return { product: p, words: [...map].map(([w, weight]) => ({ w, weight })) };
  });
}

export type SearchResult = { product: Product; score: number };

/** Rank products for a query. Strong results first; weak ones serve as "did you mean". */
export function searchProducts(targets: SearchTarget[], query: string): { strong: SearchResult[]; close: SearchResult[] } {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return { strong: [], close: [] };

  // expand query tokens through the alias map ("kozhi" also tries "chicken")
  const expanded = qTokens.map((q) => {
    const alts = new Set<string>([q]);
    for (const [alias, engs] of ALIAS) {
      if (alias === q || wordScore(q, alias) >= 0.8) for (const e of engs) alts.add(e);
    }
    return [...alts];
  });

  const results: SearchResult[] = [];
  for (const t of targets) {
    let total = 0;
    for (const alts of expanded) {
      let best = 0;
      for (const q of alts) for (const { w, weight } of t.words) best = Math.max(best, wordScore(q, w) * weight);
      total += best;
    }
    const score = total / expanded.length;
    if (score > 0.4) results.push({ product: t.product, score });
  }
  results.sort((a, b) => b.score - a.score);
  return {
    strong: results.filter((r) => r.score >= 0.75),
    close: results.filter((r) => r.score < 0.75).slice(0, 5),
  };
}
