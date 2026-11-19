/**
 * Tiny RFC-4180-ish CSV reader for billing-software exports (Tally, Marg,
 * Vyapar, GoFrugal, Busy, local POS). Handles quoted fields, embedded commas
 * and CRLF. No dependency — the exports are small (a few thousand rows).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // BOM from Excel
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

export type MappedRow = {
  name: string | null;
  barcode: string | null;
  mrp: number | null;
  rate: number | null;
  unit: string | null;
  raw: Record<string, string>;
};

/** Header aliases seen across Indian billing exports, lower-cased. */
const ALIASES: Record<keyof Omit<MappedRow, "raw">, string[]> = {
  name: ["item name", "item", "product", "product name", "description", "particulars", "name", "item description"],
  barcode: ["barcode", "ean", "upc", "ean code", "bar code", "hsn/barcode"],
  mrp: ["mrp", "m.r.p", "m.r.p.", "max retail price", "mrp (rs)"],
  rate: ["rate", "sale rate", "selling price", "sell price", "price", "sale price", "retail rate", "unit price"],
  unit: ["unit", "uom", "units", "unit of measure"],
};

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/** Map a parsed sheet to rows by header name; unknown columns ride along in raw. */
export function mapRows(sheet: string[][]): { rows: MappedRow[]; headers: string[]; unmapped: string[] } {
  if (sheet.length === 0) return { rows: [], headers: [], unmapped: [] };
  const headers = sheet[0].map((h) => h.trim());
  const lower = headers.map((h) => h.toLowerCase());
  const col = (key: keyof typeof ALIASES) => {
    for (const alias of ALIASES[key]) {
      const i = lower.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = { name: col("name"), barcode: col("barcode"), mrp: col("mrp"), rate: col("rate"), unit: col("unit") };
  const unmapped = (["name", "barcode", "mrp", "rate", "unit"] as const).filter((k) => idx[k] < 0);
  const rows: MappedRow[] = sheet.slice(1).map((cells) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => (raw[h] = cells[i] ?? ""));
    const bc = idx.barcode >= 0 ? (cells[idx.barcode] ?? "").replace(/\D/g, "") : "";
    return {
      name: idx.name >= 0 ? (cells[idx.name] ?? "").trim() || null : null,
      barcode: /^\d{8,14}$/.test(bc) ? bc : null,
      mrp: idx.mrp >= 0 ? num(cells[idx.mrp]) : null,
      rate: idx.rate >= 0 ? num(cells[idx.rate]) : null,
      unit: idx.unit >= 0 ? (cells[idx.unit] ?? "").trim().toLowerCase() || null : null,
      raw,
    };
  });
  return { rows, headers, unmapped };
}

/** Billing "UOM" → our unit. kg/kilo → kg; pcs/nos/pc → piece; everything else is a pack. */
export function normaliseUnit(u: string | null): "piece" | "pack" | "kg" {
  if (!u) return "pack";
  if (/^(kg|kgs|kilo|kilogram|kilograms|gm|g|grams)$/.test(u)) return "kg";
  if (/^(pcs|pc|piece|pieces|nos|no|each|ea|unit)$/.test(u)) return "piece";
  return "pack";
}
