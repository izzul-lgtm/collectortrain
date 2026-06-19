# CollectorTrain — Next.js + Vercel

## 🆕 Apa yang diperbaiki/upgrade (sesi ini)

**Bug fix #1 — suara collector "cut" sebelum habis cakap (Latihan Suara LIVE)**
Punca sebenar: timer "senyap" untuk auto-hantar ke AI cuma reset bila Chrome
dah confirm satu ayat sebagai "final". Tapi engine STT Chrome kadang lambat
finalize ayat panjang/bercampur BM-Inggeris (kena round-trip ke server Google).
Bila gap antara "final" jadi lebih lama dari 1.5 saat — walaupun collector
masih aktif bercakap — sistem silap anggap dah senyap, terus stop dan hantar
teks yang ada, jadi ada bahagian hujung ayat yang collector sempat cakap
tapi tak masuk transcript langsung. Fix (`public/app.js`, fungsi `startRec`):
- Timer senyap sekarang reset pada **setiap** hasil STT (final ATAU interim),
  bukan final sahaja.
- Tempoh senyap naik dari 1.5s → 2.2s, bagi lebih ruang utk pause natural.
- Bila timer fire / recognition terhenti tiba-tiba, sistem hantar gabungan
  final+interim yang ada — bukan final sahaja — supaya tiada perkataan
  terakhir yang hilang.

**Bug fix #2 — komen/cadangan penambahbaikan nampak kosong/generik**
Punca: proxy `app/api/claude/route.js` cap `max_tokens` kat 500, tapi fungsi
penilaian (`evalCall`) di `app.js` minta sampai 1300+ token untuk satu
JSON penuh (markah 5 aspek + kekuatan + senarai kesilapan + fokus latihan +
maklum balas). Bila kena cap, jawapan Claude terputus separuh jalan → JSON
tak sah → sistem fallback ke mesej generik "Tidak dapat menganalisis sesi
ini". Fix: naikkan cap server ke 1600 token.

**Upgrade — coaching lebih mendalam, bukan sekadar simulasi nego**
Struktur penilaian 5 aspek (tone / cara penyampaian / hujah counter /
tindakan & pematuhan / strategi baki rendah-tinggi) + risiko harassment dah
sedia ada dalam kod asal — tapi dua isu di atas menyebabkan ia tak
berfungsi penuh. Tambahan baru:
- `priorityFocus` — AI sekarang wajib bagi SATU aspek paling kritikal untuk
  collector fokus pada sesi latihan akan datang, lengkap dengan tip
  spesifik. Dipaparkan terus di skrin keputusan & rekod collector.
- Senarai "Apa Yang Perlu Diperbaiki" (`missed[]`) sekarang **wajib** ada
  3-6 item walaupun panggilan nampak baik — supaya AI sentiasa cari ruang
  penambahbaikan, bukan bagi pujian generik kosong.
- **Trend kesilapan berulang** — fungsi `tallyWeakness`/`topWeaknessLabel`
  yang dulu wujud dalam kod tapi tak pernah digunakan, sekarang dipaparkan:
  - Collector (Rekod Saya): "Aspek Paling Kerap Perlu Diperbaiki" merentas
    semua sesi sendiri.
  - Admin/Manager (Semua Collector): lajur "Aspek Lemah" + "Harassment"
    setiap collector.
  - Admin/Manager (Dashboard): breakdown aspek lemah seluruh pasukan +
    panel "Isu Pematuhan/Harassment Terkini" untuk semakan compliance.
- Badge harassment sekarang ada warna berbeza ikut tahap (amber utk
  rendah/sederhana, merah utk tinggi) supaya lebih senang scan di dashboard.

Struktur role (admin buat senario + tengok skor, manager akses penuh sama
macam admin, collector hanya latihan + rekod sendiri) sudah wujud dalam kod
asal (`buildNav()`) — tak perlu rombak, cuma manfaatkan data baru di atas.

---


Port dari `collectortrain.html` ke struktur Next.js (App Router), dengan
ElevenLabs + Claude key dipindah ke server-side proxy. Auth dan database
buat masa ni KEKAL macam asal (localStorage, role-based, scenario/session
data) — ini langkah migration Supabase yang seterusnya.

## Apa yang berubah dari fail asal

- **`/app/api/tts/route.js`** — proxy ke ElevenLabs. Terima `{text, voiceId}`,
  panggil ElevenLabs guna `ELEVENLABS_API_KEY` dari env var, balas terus
  dengan audio (`audio/mpeg`).
- **`/app/api/claude/route.js`** — proxy ke Anthropic Messages API. Terima
  `{system, messages, max_tokens}`, panggil Anthropic guna
  `ANTHROPIC_API_KEY` dari env var, balas JSON yang sama format macam
  Anthropic API asal (supaya `data.content[0].text` di frontend tak perlu
  ubah).
- **`/public/app.js`** — sama logic macam `<script>` asal, cuma fetch ke
  `/api/tts` dan `/api/claude` (relative path, hosted sekali dengan app)
  instead of terus ke `api.elevenlabs.io` / `api.anthropic.com`.
- Field "ElevenLabs API Key" dah dibuang dari form daftar akaun dan dari
  skrin Latihan Suara — sebab key tu sekarang shared, hosted di server,
  collector tak perlu key sendiri lagi.

## Setup local

```bash
npm install
cp .env.local.example .env.local
# isi ANTHROPIC_API_KEY dan ELEVENLABS_API_KEY dalam .env.local
npm run dev
```

Buka http://localhost:3000 — login demo: `admin/admin123`,
`manager/mgr123`, atau `collector/col123` (sama macam fail asal).

## Deploy ke Vercel

1. Push folder ni ke satu GitHub repo.
2. Di Vercel: **Add New Project** → import repo tu → Vercel auto-detect
   Next.js, takyah ubah build settings.
3. **Sebelum** deploy (atau lepas deploy pertama, redeploy lepas tu),
   pergi **Project Settings → Environment Variables** dan tambah:
   - `ANTHROPIC_API_KEY`
   - `ELEVENLABS_API_KEY`
4. Deploy. Setiap collector cuma buka URL Vercel tu, daftar/login, terus
   boleh mula latihan suara — tak payah apa-apa key.

## ⚠️ Limitation penting (sebelum betul-betul "live" untuk ramai pengguna)

Proxy ni sembunyikan key dari browser, tapi dia **tak verify siapa yang
call endpoint tu**. Sebab auth sekarang ni 100% client-side (localStorage),
server takde cara nak tahu request ke `/api/tts` atau `/api/claude` datang
dari collector yang sah login, atau dari sesiapa je yang jumpa URL app ni
dan terus call endpoint tu sendiri (devtools/Postman/curl).

Implikasi: kalau app ni public-facing, key shared korang boleh kena abuse
oleh orang luar — bukan sebab key leak (key dah selamat), tapi sebab
endpoint takde access control.

Mitigasi sementara yang dah ada dalam proxy ni:
- `max_tokens` di-cap kat 500 setiap request.
- Teks TTS di-cap kat 1000 aksara setiap request.

Ni cuma speed bump, bukan auth sebenar. Bila migrate ke Supabase
(langkah seterusnya), setiap request ke `/api/tts` dan `/api/claude`
patut verify session/JWT Supabase user tu dulu sebelum proxy teruskan
ke ElevenLabs/Anthropic — supaya hanya collector yang login sah boleh
guna shared key tu.

## Struktur fail

```
collectortrain-next/
  app/
    layout.js          root layout, import globals.css
    globals.css         CSS asal (token warna, semua class) — unchanged
    page.js              markup asal (auth screen, sidebar, modal) + load /app.js
    api/
      tts/route.js       proxy ElevenLabs
      claude/route.js    proxy Anthropic
  public/
    app.js               logic asal (DB, render*, call flow) — fetch URL diubah
  .env.local.example
  package.json
  next.config.mjs
```
