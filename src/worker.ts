/**
 * Worker: proxy data Google Sheets -> JSON.
 * SHEET_ID is stored as a Worker secret; static files are served by Assets.
 */
export interface Env {
  SHEET_ID: string;
  SHEET_NAME?: string;
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export interface Item {
  kategori: string; no: number; judul: string;
  kode: string; revisi: string; perubahan: string; link: string;
}

/** CSV parser supporting quoted cells, commas, and embedded newlines. */
export function parseCSV(t: string): string[][] {
  const rows: string[][] = [];
  let r: string[] = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; }
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { r.push(c); c = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      r.push(c); rows.push(r); r = []; c = "";
    } else c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}

/**
 * MARKING sheet:
 * A = category heading on its own row, or numeric document number;
 * B = document title; C-F = issue code, revision, change, link.
 * Category headings remain in effect for subsequent numbered rows.
 * If a heading is absent from the CSV export, infer category from code prefix.
 */
export function rowsToItems(rows: string[][]): Item[] {
  const out: Item[] = [];
  let kat: string | null = null;
  const kategoriDariKode: Record<string, string> = {
    NE: "NOBASHI",
    SE: "SUSHI EBI",
    EF: "EBIFRY",
    RAW: "RAW",
  };

  for (const r of rows) {
    const cell = (i: number) => (r[i] || "").replace(/^\uFEFF/, "").trim();
    const a = cell(0), b = cell(1), c = cell(2);
    const d = cell(3), e = cell(4), f = cell(5);
    const nomorValid = /^\d+(?:\.0+)?$/.test(a);

    if (!a && !b && !c) continue;

    // A text value without a title is a category heading (never require B edits).
    if (a && !nomorValid && !b) {
      if (!/^(DETAIL|DEPT|NO$)/i.test(a)) kat = a;
      continue;
    }

    // A numeric value in A plus a title in B is a document row.
    if (nomorValid && b) {
      const prefixKode = c.split(/[./_-]/, 1)[0].toUpperCase();
      out.push({
        kategori: kat || kategoriDariKode[prefixKode] || "LAIN",
        no: Number(a),
        judul: b,
        kode: c,
        revisi: d,
        perubahan: e,
        link: f,
      });
    }
  }
  return out;
}

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/api/data") return env.ASSETS.fetch(req);
    if (!env.SHEET_ID) return json({ error: "SHEET_ID belum diset (wrangler secret put SHEET_ID)" }, 500);

    const sheet = env.SHEET_NAME || "MARKING";
    const src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.SHEET_ID)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
    const res = await fetch(src, { cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit);
    if (!res.ok) return json({ error: `Gagal ambil sheet (HTTP ${res.status}). Pastikan sheet dibagikan 'Anyone with the link'.` }, 502);

    const items = rowsToItems(parseCSV(await res.text()));
    return json({ items, updated: new Date().toISOString() }, 200, { "cache-control": "public, max-age=60" });
  },
};
