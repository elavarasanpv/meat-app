import { editDistance, tokens } from "./search";

/**
 * Grocery search. A product is a result only when every typed word is in its own
 * name or brand ("dal" finds Toor Dal, not the rice that shares its shelf). The shelf
 * (sub-category) is offered separately, spelling slips are corrected only when nothing
 * matches as typed, and the results come with their brands and common "toor dal"-style
 * phrases so the page can offer ways to narrow down.
 */

/** Tamil-in-English and common spellings → the word on the pack. */
const SYNONYMS: Record<string, string[]> = {
  dal: ["dhal", "daal", "dhall", "paruppu", "parupu"],
  toor: ["tur", "thuvaram", "tuvaram", "thuvar", "arhar"],
  moong: ["mung", "pasi", "paasi"],
  urad: ["ulundu", "ulunthu", "uzhunthu"],
  chana: ["channa", "kadalai"],
  rice: ["arisi", "arishi"],
  oil: ["ennai", "yennai", "ennei"],
  sugar: ["sakkarai", "sarkarai", "seeni", "cheeni"],
  salt: ["uppu"],
  milk: ["paal", "pal"],
  flour: ["maavu", "mavu"],
  atta: ["godhumai", "gothumai", "wheat"],
  chilli: ["chili", "chilly", "milagai", "mirchi"],
  turmeric: ["manjal"],
  pepper: ["milagu"],
  mustard: ["kadugu"],
  tamarind: ["puli"],
  coconut: ["thengai", "thenga"],
  ghee: ["nei", "ney"],
  curd: ["thayir", "dahi"],
  biscuit: ["biscut", "biskut", "bikkat"],
  soap: ["sop"],
  tea: ["chai", "theyilai"],
  coffee: ["kaapi", "kapi", "cofee"],
  jaggery: ["vellam"],
  onion: ["vengayam"],
  garlic: ["poondu"],
};
const CANON = new Map<string, string[]>();
for (const [word, alts] of Object.entries(SYNONYMS)) for (const a of alts) CANON.set(a, [...(CANON.get(a) ?? []), word]);

/** Words that say nothing about what the product is; never offered as a phrase. */
const FILLER = new Set(["and", "&", "with", "of", "the", "for", "in", "pack", "kg", "g", "gm", "gms", "ml", "l", "ltr", "pcs", "pc", "loose", "new"]);

type Row = { name: string; name_ta: string | null; brand: string | null; category_id: string | null; in_stock: boolean };
type Cat = { id: string; parent_id: string | null; name: string; name_ta: string | null };

type Entry<T> = { item: T; raw: string[]; name: string[]; ta: string[]; brand: string[] };
export type GroceryIndex<T, C> = { entries: Entry<T>[]; shelves: { cat: C; words: string[]; count: number }[] };

/** Split like `tokens`, but keep the capitals for showing ("Toor Dal"). */
const rawTokens = (s: string) => s.replace(/[()–—/.,-]+/g, " ").split(/\s+/).filter(Boolean);

export function buildGroceryIndex<T extends Row, C extends Cat>(items: T[], categories: C[] = []): GroceryIndex<T, C> {
  const count = new Map<string, number>();
  for (const r of items) if (r.category_id) count.set(r.category_id, (count.get(r.category_id) ?? 0) + 1);
  return {
    entries: items.map((item) => {
      const raw = rawTokens(item.name);
      return { item, raw, name: raw.map((w) => w.toLowerCase()), ta: item.name_ta ? tokens(item.name_ta) : [], brand: item.brand ? tokens(item.brand) : [] };
    }),
    shelves: categories
      .filter((c) => !!c.parent_id && (count.get(c.id) ?? 0) > 0)
      .map((cat) => ({ cat, words: [...tokens(cat.name), ...(cat.name_ta ? tokens(cat.name_ta) : [])], count: count.get(cat.id) ?? 0 })),
  };
}

/** The typed word is this word: the same, its beginning, or its plural ("biscuits" → biscuit). */
function hit(q: string, w: string): number {
  if (q === w) return 1;
  if (w.startsWith(q)) return 0.93;
  if (q.length >= 4 && w.length >= 3 && q.startsWith(w) && q.length - w.length <= 2) return 0.9;
  return 0;
}

/** A spelling slip away ("coce" → coke). Short words are not guessed at. */
function near(q: string, w: string): number {
  if (q.length < 4 || w.length < 3) return 0;
  const max = q.length <= 5 ? 1 : 2;
  const d = editDistance(q, w, max);
  return d <= max ? 0.7 - 0.1 * d : 0;
}

export type Phrase<T> = { key: string; before?: string; word: string; after?: string; item: T; count: number };
export type BrandGroup<T> = { brand: string; count: number; item: T };
export type GroceryFound<T, C> = {
  /** Products that match what was typed, best first, in stock before out of stock. */
  results: T[];
  /** Set when nothing matched as typed and the results are for this corrected spelling. */
  corrected: string | null;
  /** True when the words name a brand ("tata"): the page groups by brand instead of filtering. */
  brandQuery: boolean;
  brands: BrandGroup<T>[];
  phrases: Phrase<T>[];
  shelves: { cat: C; count: number }[];
};

export function searchGrocery<T extends Row, C extends Cat>(index: GroceryIndex<T, C>, query: string, retry = true): GroceryFound<T, C> {
  const qs = tokens(query).filter((q) => q !== "&");
  const none: GroceryFound<T, C> = { results: [], corrected: null, brandQuery: false, brands: [], phrases: [], shelves: [] };
  if (qs.length === 0) return none;
  const alts = qs.map((q) => [q, ...(CANON.get(q) ?? [])]);
  const best = (list: string[], words: string[], fn: (q: string, w: string) => number) => {
    let score = 0;
    let at = -1;
    for (const q of list) words.forEach((w, i) => { const s = fn(q, w); if (s > score) { score = s; at = i; } });
    return { score, at };
  };

  const exact: { e: Entry<T>; score: number; viaBrand: boolean; at: number }[] = [];
  const slips = qs.map(() => new Map<string, number>());
  let anySlip = false;
  for (const e of index.entries) {
    let total = 0;
    let all = true;
    let viaBrand = true;
    let at = -1;
    const fix: (string | null)[] = [];
    for (const list of alts) {
      const n = best(list, e.name, hit);
      const ta = best(list, e.ta, hit);
      const b = best(list, e.brand, hit);
      const own = Math.max(n.score, ta.score);
      if (own > 0 || b.score > 0) {
        total += Math.max(own, b.score * 0.97);
        if (own > 0) viaBrand = false;
        if (n.score > 0) at = n.at;
        fix.push(null);
        continue;
      }
      all = false;
      const words = [...e.name, ...e.brand];
      const s = best(list, words, near);
      fix.push(s.score > 0 ? words[s.at] : "");
    }
    if (all) exact.push({ e, score: total / qs.length, viaBrand, at });
    else if (fix.every((f) => f !== "")) {
      anySlip = true;
      fix.forEach((f, i) => f && slips[i].set(f, (slips[i].get(f) ?? 0) + 1));
    }
  }

  if (exact.length === 0) {
    // Nothing as typed: try once more with each slipped word replaced by the catalog word it is closest to.
    if (retry && anySlip) {
      const fixed = qs.map((q, i) => [...slips[i]].sort((a, b) => b[1] - a[1])[0]?.[0] ?? q).join(" ");
      if (fixed !== qs.join(" ")) {
        const again = searchGrocery(index, fixed, false);
        if (again.results.length > 0) return { ...again, corrected: fixed };
      }
    }
    return { ...none, shelves: shelvesFor(index, alts) };
  }

  exact.sort((a, b) => Number(b.e.item.in_stock) - Number(a.e.item.in_stock) || b.score - a.score);
  const brandQuery = exact.every((x) => x.viaBrand);

  const brandMap = new Map<string, BrandGroup<T>>();
  for (const { e } of exact) {
    const brand = e.item.brand?.trim();
    if (!brand) continue;
    const g = brandMap.get(brand.toLowerCase());
    if (g) g.count += 1;
    else brandMap.set(brand.toLowerCase(), { brand, count: 1, item: e.item });
  }

  // "Toor dal", "Rice flour": the word next to the typed one on the packs that matched.
  const phraseMap = new Map<string, Phrase<T>>();
  if (qs.length === 1 && !brandQuery) {
    const usable = (e: Entry<T>, i: number) => {
      const w = e.name[i];
      return w !== undefined && w.length >= 2 && !FILLER.has(w) && !/^\d/.test(w) && !e.brand.includes(w);
    };
    for (const { e, at } of exact) {
      if (at < 0) continue;
      const add = (p: Omit<Phrase<T>, "key" | "item" | "count">) => {
        const key = [p.before, p.word, p.after].filter(Boolean).join(" ").toLowerCase();
        const had = phraseMap.get(key);
        if (had) had.count += 1;
        else phraseMap.set(key, { ...p, key, item: e.item, count: 1 });
      };
      if (usable(e, at - 1)) add({ before: e.raw[at - 1], word: e.raw[at] });
      if (usable(e, at + 1)) add({ word: e.raw[at], after: e.raw[at + 1] });
    }
  }

  return {
    results: exact.map((x) => x.e.item),
    corrected: null,
    brandQuery,
    brands: [...brandMap.values()].sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)),
    // A phrase that would show the very same list again is no help.
    phrases: [...phraseMap.values()].filter((p) => p.count < exact.length).sort((a, b) => b.count - a.count).slice(0, 8),
    shelves: shelvesFor(index, alts),
  };
}

function shelvesFor<T, C>(index: GroceryIndex<T, C>, alts: string[][]) {
  return index.shelves
    .filter((s) => alts.every((list) => list.some((q) => q.length >= 3 && s.words.some((w) => hit(q, w) > 0))))
    .map(({ cat, count }) => ({ cat, count }));
}
