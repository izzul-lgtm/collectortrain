# CollectorTrain — Next.js + Vercel

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
