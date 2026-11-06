/**
 * Worker: proxy data Google Sheets -> JSON.
 *
 * - SHEET_ID disimpan sebagai secret (`wrangler secret put SHEET_ID`), tidak pernah dikirim ke browser.
 * - Hanya /api/data yang diproses di sini; file statis di ./public dilayani oleh Assets binding.
 * - Hasil di-cache 60 detik di edge supaya tidak membebani Google saat banyak pengunjung.
 */
export interface Env {
  SHEET_ID: string;          // secret
  SHEET_NAME?: string;       // opsional, default "MARKING" (lihat wrangler.toml [vars])
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export interface Item {
  kategori: string; no: number; judul: string;
  kode: string; revisi: string; perubahan: string; link: string;
}

/** Parser CSV kecil: mendukung tanda kutip, koma, dan newline di dalam sel. */
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
 * Struktur sheet: baris dengan hanya kolom A terisi (non-angka) = judul kategori
 * (NOBASHI, SUSHI EBI, ...). Baris dengan NO angka + judul = item. Sisanya diabaikan.
 */
export function rowsToItems(rows: string[][]): Item[] {
  const out: Item[] = [];
  let kat: string | null = null;
  for (const r of rows) {
    const [a, b, c, d, e, f] = [0, 1, 2, 3, 4, 5].map((i) => (r[i] || "").trim());
    if (!a && !b && !c) continue;
    if (a && !b && !/^\d+$/.test(a)) {
      if (!/^(DETAIL|DEPT|NO$)/i.test(a)) kat = a;
      continue;
    }
    if (/^\d+$/.test(a) && b)
      out.push({ kategori: kat || "LAIN", no: +a, judul: b, kode: c, revisi: d, perubahan: e, link: f });
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

    // cf.cacheTtl: cache hasil fetch di edge Cloudflare selama 60 detik
    const res = await fetch(src, { cf: { cacheTtl: 60, cacheEverything: true } } as RequestInit);
    if (!res.ok) return json({ error: `Gagal ambil sheet (HTTP ${res.status}). Pastikan sheet dibagikan 'Anyone with the link'.` }, 502);

    const items = rowsToItems(parseCSV(await res.text()));
    return json({ items, updated: new Date().toISOString() }, 200, { "cache-control": "public, max-age=60" });
  },
};
