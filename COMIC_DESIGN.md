# CHOG Clash — motion comic

Landing aktif: **http://localhost:5173/**. Game: **http://localhost:5173/play.html**. Judul konsep: *Issue #01 — The House Cup*. Halaman dibangun sebagai satu issue komik yang dapat digulir, dengan cerita, persona, tempat, showdown dan undangan masuk game.

## Riset yang dipakai

- [Marvel by Design — Anatomy of a Comic Book Cover, Gestalten](https://news.gestalten.com/sites/default/files/press/pdf/p.40-41_MarvelbyDesign,gestalten2021.pdf). Sampel penerbit menjelaskan posisi judul, corner box, cover line, artwork dominan dan lettering ekspresif. Terjemahan desain di CHOG: issue badge, judul CHOG CLASH ber-outline, callout, komposisi karakter besar dan caption yang hidup.
- [Marvel — What are Marvel Infinity Comics?](https://help.marvel.com/article/marvel-what-are-marvel-infinity-comics). Format vertikal dengan scroll kontinu menjadi referensi urutan chapter. Implementasi CHOG memakai scroll native dan panel yang muncul berurutan.
- [Marvel Rivals — Art Vision Vol. 01: GUI & Video](https://www.marvelrivals.com/devdiaries/20250421/40954_1228989.html). Halaman resmi memperkenalkan pembahasan art direction, interface dan animasi dari tim visual. Halaman ini merupakan konteks riset; video tertanam tidak ditonton secara penuh.

Ben-Day dots, tinta tebal, cross-hatching, warna ungu–kuning–coral, panel miring, speech balloon dan efek kata merupakan keputusan art direction untuk landing ini. Marvel dipakai sebagai referensi bahasa komik. Seluruh ilustrasi landing adalah komposisi CHOG baru; tidak ada panel atau karakter Marvel yang dipasang di produk.

## Empat artwork baru

| Artwork | Runtime | Pemakaian |
|---|---|---|
| Comic city | `assets/chog/landing/comic-city.webp` | Latar cover, terpisah dari karakter untuk parallax |
| Yot, Rogue, Cookie | `assets/chog/landing/comic-heroes.webp` | Foreground cover dengan alpha asli |
| The spark | `assets/chog/landing/comic-spark.webp` | Panel ilustrasi origin/community |
| Rogue vs Tabsu | `assets/chog/landing/comic-showdown.webp` | Panel showdown dan efek POW interaktif |

Gambar dibuat dengan **image_gen bawaan**, lalu disimpan ke workspace. PNG sumber utuh berada di `assets/chog/source-art/comic-*.png`; WebP runtime berjumlah sekitar 1,88 MB. [Prompt final dan provenance](tools/comic-generation.json) mencatat tiap referensi, prompt, hasil asli, copy source dan path runtime. Keempat gambar telah diperiksa secara visual; hero memiliki transparansi asli.

Roster memakai 12 PNG CHOG resmi yang sudah tersimpan dan tetap utuh. Persona serta peran mengikuti CHOG Team. House Cup, jurus, tempat dan adegan landing merupakan interpretasi fan game, bukan penambahan canon resmi. Arena memakai lima ilustrasi CHOG dari rebuild sebelumnya.

Typography: Bangers untuk judul komik, Barlow Regular/Bold untuk teks. Ketiga font di-host lokal dari repositori [Google Fonts](https://github.com/google/fonts), dengan OFL masing-masing di `assets/chog/landing/fonts/`. Tidak ada hotlink font atau media.

## Gerak dan interaksi

- Cover masuk dengan stagger; foreground melayang, pointer menggerakkan karakter dan latar dengan kedalaman berbeda.
- Ink particles digambar dengan Canvas sekitar 30 fps hanya saat cover terlihat dan tab aktif.
- Scroll native, progress bar, reveal per panel dan parallax pada panel origin.
- Marquee bergerak, callout berayun, kata efek bergerak dan stamp akhir berayun.
- Kartu persona bereaksi pada pointer. Click/tap atau panah keyboard mengubah dossier, jurus dan link Play as.
- Lima pilihan tempat mengganti artwork dan caption; panah keyboard juga bekerja.
- Tombol POW memicu satu impact singkat. Link game memakai transisi page-turn.
- Motion toggle menghentikan gerak dan menyimpan preferensi. Reduced motion dari sistem dihormati; tab tersembunyi menghentikan animasi. Tanpa JavaScript, cerita, artwork dan link game tetap terbaca.

## Integrasi game

`index.html`, `comic.css` dan `comic.js` adalah landing. Entry game sebelumnya dipertahankan di `play.html`. Shell mobile membuka entry tersebut dalam iframe landscape; landing sendiri tetap memakai orientasi normal perangkat.

`play.html?fighter=cookie` membuka roster dengan Cookie terpilih untuk preview dan konfirmasi. `?mode=training` atau `?mode=versus` membuka setup mode terkait. Klik Play as tidak langsung mengonfirmasi karakter; pemain tetap mengonfirmasi persona dan rival. Hover roster hanya bereaksi pada gerakan pointer agar karakter dari landing tidak berubah ketika DOM menu muncul di bawah kursor.

Engine combat, kit, statistik dan timing tidak berubah. Atribusi kode MIT tetap tersedia di footer, About dan LICENSE.

## Comic game dan versus roster

Bahasa visual kini berlaku untuk cover arcade, character select, pemilihan arena, HUD, move dock, cut-in ultimate, combo/round call, Training, Settings, pause, About dan hasil pertandingan. `house-base.css` memakai Bangers/Barlow lokal dan palet yang sama dengan landing; seluruh panel memakai tinta tebal, sudut tajam, halftone dan bayangan cetak.

Character select mengikuti komposisi screenshot **Marvel vs Capcom: Infinite yang diberikan pengguna**: artwork besar di kiri/kanan dan portrait grid di tengah. Produk memakai 12 CHOG dalam grid 4×3; landscape pendek memakai 6×2. P1 ditandai biru dan rival CPU coral. Peran resmi tetap ditampilkan di nameplate; jurus adalah adaptasi fan game. Ping ×4 adalah label grid yang ringkas; nama lengkap tetap tersedia pada artwork dan accessible label.

Pemain mengonfirmasi CHOG terlebih dahulu. Saat memilih rival, artwork pemain tetap terkunci; hover, keyboard atau tap hanya mengganti sisi yang sedang dipilih. Keduanya bisa memilih CHOG yang sama. Back mengembalikan preview pilihan sebelumnya. Tombol lock serta empat jurus tetap dekat dengan portrait grid. Game tetap pertarungan 1v1 dalam Canvas 2D.

Cover arcade memakai kembali `comic-city.webp` dan `comic-heroes.webp`; roster memakai referensi resmi yang sudah ada dan portrait CHOG. Tidak ada aset Marvel/Capcom yang ditambahkan. Arena serta kit combat tetap memakai aset dan timing CHOG sebelumnya.

Gerak game: panel fade in, artwork roster masuk singkat dan melayang, cover berlapis melayang, victory rays berputar perlahan. Gerak dihentikan saat tab tersembunyi atau Settings terbuka. Landing dan game berbagi preferensi `chog-comic-motion`; pause/Settings tersimpan setelah reload. Reduced motion sistem mengunci animasi ke off dan menonaktifkan kontrol motion sampai pengaturan sistem berubah.

Preview game: [cover arcade](validation/comic-game-home.png), [roster](validation/comic-game-roster.png), [rival](validation/comic-game-rival.png), [mobile landscape](validation/comic-game-roster-844.png), [peta](validation/comic-game-map.png), [HUD](validation/comic-game-combat.png), [Settings](validation/comic-game-settings.png), [pause](validation/comic-game-pause.png), [hasil](validation/comic-game-result.png).

## Verifikasi dan preview

```bash
python3 tools/build_cache.py
python3 tools/verify_landing.py
python3 tools/verify_game.py
python3 tools/verify_layout.py
python3 tools/verify_media_runtime.py
python3 tools/audit_media.py
```

[landing.json](validation/landing.json) mencatat tes gerak, pause, roster, tempat, keyboard, delapan ukuran viewport, entry game, Back, reduced motion serta pembacaan tanpa JavaScript. [runtime.json](validation/runtime.json) dan [layout.json](validation/layout.json) mencatat regresi game. Mobile diuji dengan emulasi Chromium; perangkat fisik belum diuji.

Preview: [cover desktop](validation/comic-cover.png), [cover mobile](validation/comic-mobile-cover.png), [halaman penuh](validation/comic-full.png), [cast](validation/comic-crew.png), [world](validation/comic-world.png) dan [showdown](validation/comic-showdown.png).
