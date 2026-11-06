# Web Detail Marking Packaging

Daftar marking dari Google Sheets: tab kategori, pencarian, urutan, badge revisi, tombol buka link.
Berjalan di Cloudflare Workers. **Sheet ID disimpan sebagai secret**, tidak ada di kode maupun source halaman.

## Struktur

```
marking-web/
├─ public/index.html   # frontend (satu file, tanpa build)
├─ src/worker.ts       # Worker: ambil sheet -> parse -> JSON di /api/data
├─ wrangler.toml       # konfigurasi Worker + assets
└─ package.json
```

Alur: browser -> `/api/data` (Worker, baca `env.SHEET_ID`) -> Google Sheets (CSV) -> JSON -> halaman.

## Setup

1. Share Google Sheet: *Anyone with the link* -> Viewer. Worker membaca lewat endpoint `gviz` tanpa API key.
2. Pasang dependensi dan set secret:
   ```bash
   pnpm install
   npx wrangler secret put SHEET_ID     # tempel ID dari URL .../spreadsheets/d/<SHEET_ID>/edit
   ```
3. Deploy: `pnpm deploy`
4. Dev lokal: buat `.dev.vars` berisi `SHEET_ID=xxxx` (sudah di `.gitignore`), lalu `pnpm dev`.

Nama tab default `MARKING`, ubah di `[vars] SHEET_NAME` pada `wrangler.toml`.

## Format sheet

- Baris dengan **hanya kolom A terisi** (NOBASHI, SUSHI EBI, EBIFRY, RAW, ...) = kategori baru. Tab muncul otomatis.
- Baris dengan **NO angka** + judul = item dokumen.
- Baris `DETAIL...`, `DEPT...`, header `NO`, dan baris kosong diabaikan.

## Catatan keputusan

- **Secret**: browser hanya melihat `/api/data`, tidak pernah melihat ID. Ini menyembunyikan ID, bukan mengunci data: sheet tetap harus *Anyone with the link*. Untuk sheet privat, perlu service account di Worker.
- **Cache 60 detik** di edge supaya Google tidak dibanjiri request. Frontend refresh tiap 5 menit (`REFRESH_MENIT`).
- **Tanggal terbit** diambil dari kode dokumen (`NE.01/051026/00` -> 05 Okt 2026).
- **Fallback**: kalau `/api/data` gagal (secret belum diset, sheet privat), halaman memakai 26 data contoh bawaan. Pesan error ada di console browser dan respons API.

## Tampilan (mobile-first)

- Header menempel di atas: pencarian 48px (font 16px supaya iOS tidak zoom), urutan, dan chip kategori yang bisa digeser dengan jumlah dokumen.
- Satu dokumen = satu kartu yang seluruhnya bisa diketuk untuk membuka link. Label kode (mis. `NE.01`) di kiri meniru label cetak kemasan; warna kategori otomatis dari urutan di sheet (6 warna, berulang).
- Revisi tampil sebagai cap `Rev 01` + isi kolom PERUBAHAN REVISI.
- Kondisi memuat (skeleton), kosong (tombol hapus pencarian), dan data contoh (banner) sudah ditangani. Titik hijau di header = data langsung dari sheet, amber = data contoh.
- Tombol muat ulang di kanan atas, selain auto-refresh. Mode terang/gelap mengikuti perangkat; animasi mati bila perangkat meminta *reduced motion*.
- Font Plus Jakarta Sans dari Google Fonts, dengan fallback font sistem bila offline.
