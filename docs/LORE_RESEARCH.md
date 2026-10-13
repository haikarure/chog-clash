# CHOG — riset asal-usul dan arah dunia game

Diperiksa 11 Oktober 2026. Tujuan: memberi game identitas CHOG berdasarkan sumber yang bisa ditelusuri. Dokumen ini bahan desain; usulan di dalamnya belum mengubah build atau aturan combat.

Sumber utama yang paling berguna adalah [video resmi Chog Lore](https://www.youtube.com/watch?v=P8NSHkL7Fxs), [homepage CHOG](https://www.chog.xyz/), dan [bio Team](https://www.chog.xyz/team). Klik masing-masing karakter untuk membuka bio. Teks bio tidak muncul pada hasil ekstraksi halaman biasa.

## 1. Asal-usul yang punya pijakan

**Cerita resmi dalam video:** Ray J, seekor katak oranye, tinggal di rumah kecil dan mencoba alat gambar AI. Makhluk ungu muncul dari eksperimen itu. Bagian Bill Monday menggambarkan pemberian nama Chog; cerita kemudian berkembang menjadi Chog World Order melalui meme, kerumunan, dan satire kekuasaan. Ini narasi fiksi video, bukan klaim kejadian dunia nyata. [Chog Lore](https://www.youtube.com/watch?v=P8NSHkL7Fxs).

**Riwayat komunitas:** artikel ChicoArroz menyebut RayJ menciptakan maskot pada 10 Desember 2023 dan mencatat nama Monald. Tanggal tersebut masih bersandar pada rangkuman komunitas; arsip Discord yang dirujuk tidak berhasil diakses dalam riset ini. [Rangkuman Monanimals](https://chicoarroz.com/monanimals-monad/).

Homepage menggambarkan CHOG sebagai anak yang penasaran, usil, dan membawa kekacauan. Arah nada game yang cocok: lucu, penuh energi, dan absurd. [About CHOG](https://www.chog.xyz/).

## 2. Identitas 12 karakter

Seluruh entri di bawah terdaftar sebagai anggota Team. Dasar yang terverifikasi adalah profil publik mereka; riwayat lahir, kota asal fiktif, hubungan keluarga, serta sejarah jurus per karakter belum ditemukan.

| Karakter | Peran di bio resmi |
|---|---|
| Yot | Pengelola kolaborasi |
| Mamio | Tim komunitas |
| Benja | Co-founder |
| Toad | Co-founder |
| PingPingPingPing | Chog Police |
| Novee | Developer |
| Tonashiro | Developer |
| Bigchog | Tim komunitas |
| Rogue | Artist |
| Tabsu | Chog Police |
| Venty | Tim komunitas |
| Cookie | Tim komunitas |

Sumber seluruh peran: [CHOG Team, bio per karakter](https://www.chog.xyz/team). Akun publik yang ditautkan oleh situs dicatat di [LORE_RESEARCH.json](LORE_RESEARCH.json). Sebutan di profil dibaca sebagai persona publik; lelucon dalam bio tidak diubah menjadi tuduhan tentang orangnya.

### Usulan identitas combat

Semua nama jurus dan mekanik berikut adalah **rancangan game**, belum merupakan jurus resmi CHOG. Ini dapat menggantikan mapping satu karakter ke satu kit Aether pada pengembangan berikutnya.

| Karakter | Arah combat yang diusulkan |
|---|---|
| Yot | Petarung assist: menyambungkan partner, menandai target dengan papan, lalu memanggil bantuan singkat. |
| Mamio | Petarung improvisasi: dash, feint, dan serangan dengan risiko yang bisa dibaca lawan. |
| Benja | Penggerak kerumunan: rally, rush, dan momentum yang tumbuh dari kombo. |
| Toad | Pemukul berat dengan tempo santai: charged hit dan gangguan posisi. |
| PingPingPingPing | Penyerap tekanan: menampung serangan dalam guard lalu melepaskan gelombang counter. |
| Novee | Pembuat jebakan: bug trap, debug burst, dan area glitch. |
| Tonashiro | Pengendali drone: orbit, drone dash, dan serangan dari atas. |
| Bigchog | Serangan jarak menengah bertema keyboard dan reply: proyektil kata serta rentetan roast. |
| Rogue | Pelukis arena: sapuan kuas, percikan tinta, dan summon hasil gambar. |
| Tabsu | Pemukul dengan bonk: langkah mendekat, pukulan pendek, dan knockback. |
| Venty | Mobilitas dan jebakan perhatian: blink, decoy, dan burst bertema princess. |
| Cookie | Pengendali kerumunan: soundwave, dorongan, dan ultimate panggung. |

Kemiripan tema dengan profil merupakan interpretasi desain. Detail hitbox, damage, cooldown, dan balance tetap perlu dirancang serta diuji saat perubahan ini diimplementasikan.

## 3. Tempat yang bisa menjadi dasar arena

Video resmi menyediakan konteks visual, walau tidak memberi peta lengkap atau nama resmi semua lokasi. Timestamp berikut adalah titik pengamatan, bukan batas setiap adegan. Nama arena di kolom terakhir adalah nama kerja buatan kita.

| Bukti visual | Timestamp | Nama arena usulan |
|---|---|---|
| Rumah kecil tempat cerita Ray J dimulai | 00:00–00:19 | Ray J's House |
| Dinding grafiti dan bagian Bill Monday; mural CWO juga terlihat pada homepage | sekitar 00:54 dan 01:11 | CWO Alley |
| Aula perayaan dengan piala dan tulisan House Cup Champions | sekitar 01:04 | House Cup Hall |
| Jalan kota dengan billboard dan poster Chog World Order | sekitar 01:19 | Neon CWO Street |
| Panggung pertemuan dengan kerumunan dan cahaya ungu | sekitar 01:24 | CWO Rally |
| Studio berita Global Alert dan gag tentang kostum pisang | sekitar 01:31–01:36 | Global Alert Studio |
| Ruangan dengan perlengkapan menggambar | sekitar 01:07 | Sketch Room |

Sumber adegan: [Chog Lore](https://www.youtube.com/watch?v=P8NSHkL7Fxs). Sumber mural homepage: [CHOG](https://www.chog.xyz/), melalui ilustrasi `home/main.png`. Pengamatan visual menegaskan konteks adegan; kota, negara, dan hubungan lokasi tersebut belum teridentifikasi secara resmi.

Untuk lima arena awal, pilihan yang paling konsisten adalah rumah Ray J, gang mural, aula House Cup, jalan kota, dan panggung CWO. Lima lingkungan ini memberi perubahan visual yang jelas dari arena Renaissance pada build saat ini. Artwork final perlu dibuat sebagai aset game baru; riset ini tidak memasukkan frame video sebagai background game.

## 4. Konsep game yang direkomendasikan

**Nama kerja: CHOG — House Cup.** Dua belas persona CHOG bertemu dalam pertandingan komunitas yang riuh. Mereka berebut piala dengan cara masing-masing: gambar, drone, glitch, bonk, dan soundwave. Alasannya bertarung cukup ringan untuk cocok dengan format arcade dan humor dunia CHOG.

Premis turnamen ini adalah tambahan untuk adaptasi kita. Adegan House Cup menjadi referensi visual; video tidak menetapkan turnamen fighting 12 anggota tim.

Alur usulan: pilih karakter → tampilkan profil singkat → pilih tempat → pertandingan → selebrasi khas pemenang. Tambahkan satu mekanik bersama, misalnya meter dukungan penonton, setelah kit per karakter selesai. Mekanik ini harus punya fungsi jelas dalam pertandingan sebelum dimasukkan ke scope.

Prioritas desain berikutnya:

1. Tulis profil singkat yang merangkum sumber, dengan asal tiap informasi tercatat.
2. Ganti nama, artwork, dan atmosfer arena menggunakan konteks adegan yang ditemukan.
3. Buat tiga kit pembuktian: Rogue, Tonashiro, dan Tabsu. Ketiganya memberi aksi yang berbeda dan mudah dikenali.
4. Uji keterbacaan serta balance, lalu lanjutkan ke sembilan karakter lainnya.
5. Tambahkan intro, kemenangan, UI, dan audio yang sesuai dengan turnamen CHOG.

## 5. Batas pengetahuan dan sumber tambahan

Belum ada bukti yang cukup untuk menetapkan kota kelahiran setiap anggota, timeline pribadi, daftar kekuatan resmi, atau peta dunia CHOG. Lore semacam itu boleh dibuat sebagai adaptasi game, dengan label yang jelas.

Cerita [Monadverse — Chapter 7](https://paragraph.com/@monadverse/chapter-7-the-trap) juga menampilkan CHOG, kota, dan hutan. Itu publikasi dunia Monadverse tersendiri; kesesuaiannya dengan canon proyek CHOG belum dikonfirmasi. Lore proyek lain, termasuk Chogi dan Lil Chogstars, tidak digabungkan otomatis ke cerita game ini.

[Linktree Chog](https://linktr.ee/chognft) mengarahkan pembaca ke channel YouTube, koleksi Genesis, komunitas, dan Build with Chog. Metadata video yang diperiksa: channel Chog, judul Chog Lore, durasi 130 detik, publikasi 29 September 2025. Analisis memakai subtitle otomatis dan sampel frame; beberapa kata nama pada subtitle keliru, sehingga ejaan tidak diambil mentah-mentah.

Hasil ini memberi dasar untuk membuat identitas game sendiri. Attribution terhadap kode atau aset Aether yang masih dipakai tetap mengikuti sumbernya; lihat [catatan provenance](../THIRD_PARTY_NOTICES.md).
