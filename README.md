# Jurnal Trading — saham & crypto

Jurnal trading satu file, jalan sepenuhnya di browser. Tidak ada server, tidak ada akun,
tidak ada data yang dikirim ke mana pun: semua tersimpan di `localStorage`.

**Pakai:** buka `https://notkiws.github.io/jurnal-trading/`

## Isi

- Catat trade saham IDX & crypto: qty, harga entry/exit, stop loss, target, tag setup, psikologi
- Hitung otomatis net P/L (fee beli/jual), return %, R multiple, holding time
- Harga live untuk posisi terbuka — crypto dari Binance, saham IDX dari Yahoo Finance via CORS proxy,
  diperbarui tiap 60 menit, dengan opsi isi harga manual
- Dashboard: equity curve, drawdown, win rate, profit factor, expectancy, avg R
- Analitik: per tag/setup, per simbol, distribusi R, per hari, long vs short, per psikologi
- Jurnal harian + pelajaran
- Multi profil (tiap profil punya trade, jurnal, pengaturan, dan mata uang sendiri)
- Backup/restore JSON (semua profil), export CSV

## Build

Sumber dipecah jadi tiga file; versi publik digabung jadi satu:

```bash
python3 build.py     # -> site/index.html
```

## Catatan

- Data per-origin: `localStorage` terikat domain, jadi data di `localhost` dan di GitHub Pages terpisah.
- Sumber harga publik bisa gagal (rate limit / proxy down). Kalau gagal, isi harga manual di kartu
  "Posisi terbuka" — P/L berjalan tetap dihitung dan ditandai "manual".
- Bukan alat rekomendasi. Tidak ada data broker; semua diisi manual.
