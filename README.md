# CollectorTrain

Platform latihan AI untuk debt collectors — simulasi panggilan dengan debtor AI, penilaian prestasi automatik, dan dashboard manager.

Dibina dengan **Next.js 14 (App Router)** · Deploy di **Vercel** · Database **Supabase**

---

## Stack

| Layer | Service | Kegunaan |
|---|---|---|
| Frontend | Next.js / vanilla JS (`public/app.js`) | UI single-page |
| Auth + DB | Supabase (Postgres) | Users, sessions, scenarios, assignments |
| AI Roleplay + Eval | Anthropic Claude (`claude-sonnet-4-6`) | Debtor roleplay + marking collector |
| TTS (suara debtor) | Google Gemini Flash TTS | Text-to-speech PCM → WAV |
| STT (suara collector) | Groq Whisper | Speech-to-text, support BM |
| Hosting | Vercel (region: `sin1` Singapore) | API routes + static |

---

## Environment Variables

Semua key kena set dalam **Vercel Dashboard → Project → Settings → Environment Variables** (production) atau `.env.local` (local dev).

Salin `.env.local.example` → `.env.local` dan isi nilai sebenar:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
GROQ_API_KEY
CRON_SECRET
```

Tiada satu pun dari ni optional — app akan return error kalau mana-mana satu missing. `CRON_SECRET` khusus untuk lindungi endpoint `/api/cron/purge-attachments` (lihat bahagian **Attachments** di bawah) — generate dengan `openssl rand -hex 32`, tak perlu daftar mana-mana service.

---

## Setup Local Dev

```bash
git clone https://github.com/<your-org>/collectortrain.git
cd collectortrain
npm install
cp .env.local.example .env.local
# isi .env.local dengan keys sebenar
npm run dev
```

Buka `http://localhost:3000`.

---

## Database

Schema penuh ada dalam `supabase/schema.sql`. Run sekali dalam **Supabase Dashboard → SQL Editor** untuk setup tables.

Tables utama:

- `users` — collectors, managers, admins (bcrypt password, role, approval status, session cap)
- `scenarios` — senario roleplay (client, persona debtor, checklist disclosure)
- `sessions` — rekod setiap sesi latihan + eval scores (tone, delivery, counter argument, action, balance strategy, harassment)
- `assignments` — manager assign senario wajib kepada collector
- `messages` — mesej peribadi (DM) antara staf, sokong lampiran (attachment_*)
- `discussion_posts` — perbincangan terbuka (thread 1 tahap), sokong lampiran (attachment_*)

---

## Attachments (lampiran Messages & Discussion)

Messages dan Discussion boleh sertakan **satu lampiran** setiap mesej/post (imej, PDF, Word, Excel, atau `.txt`, max **10MB**).

- Fail disimpan dalam Supabase **Storage bucket `attachments`** (private) — client tak pernah upload/baca terus dari Storage, semua melalui API route (`POST /api/attachments` untuk upload, signed URL 1-jam dijana server bila mesej/post dipapar).
- **Auto-purge selepas 48 jam** — Vercel Cron (`vercel.json` → `crons`) panggil `GET /api/cron/purge-attachments` sekali sehari, padam fail Storage yang lampirannya berumur >48 jam dan null-kan lajur `attachment_*` dalam DB. **Mesej/post itu sendiri KEKAL** (teks je), cuma lampirannya hilang — tujuan ni elak Storage membesar tanpa had.
- Endpoint cron dilindungi header `Authorization: Bearer <CRON_SECRET>` — kena set env var `CRON_SECRET` (lihat **Environment Variables** di atas), kalau tak, endpoint tutup (500/403).
- Setup DB & Storage bucket sekali gus melalui `supabase/schema.sql` (statement idempotent — selamat run berkali-kali).

---

## Emoji

Butang 😊 dalam setiap compose box (Messages: thread & new message modal; Discussion: new post & reply) — buka grid emoji ringkas, klik untuk selit ke text box. Tak perlukan sebarang setup/dependency tambahan.

---

## Roles

| Role | Akses |
|---|---|
| **Collector** | Latihan sahaja — rekod sesi sendiri, lihat skor sendiri |
| **Manager** | Semua collector data, assign senario wajib, approve/reset akaun, **tidak boleh** promote ke admin |
| **Admin** | Akses penuh termasuk manage roles, buat/edit/padam senario |

Semua akaun baru register sebagai **collector + pending approval** — manager/admin perlu approve sebelum boleh login. Promote role buat dalam Manage Users (admin only).

---

## API Routes

```
POST   /api/auth/login              — Sign in
POST   /api/auth/register           — Register akaun baru (collector, pending)
GET    /api/auth/session            — Verify sesi aktif
POST   /api/auth/reset-password     — Admin/manager reset password user lain

GET    /api/users                   — Senarai semua users (admin/manager)
PATCH  /api/users                   — Approve, set limit, tukar role
DELETE /api/users                   — Padam user

GET    /api/scenarios               — Senarai senario
POST   /api/scenarios               — Buat senario baru
PATCH  /api/scenarios               — Edit senario
DELETE /api/scenarios               — Padam senario

POST   /api/claude                  — Roleplay debtor AI + eval scoring
POST   /api/tts                     — Text-to-speech (Gemini)
POST   /api/stt                     — Speech-to-text (Groq Whisper)

GET    /api/sessions                — Rekod sesi latihan
POST   /api/sessions                — Simpan sesi baru

GET    /api/assignments             — Manager-assigned senario wajib
POST   /api/assignments             — Assign senario
DELETE /api/assignments             — Cancel assignment

POST   /api/parse-document          — Parse PDF/TXT/CSV untuk scenario builder

GET    /api/messages                — Inbox / thread / senarai kontak / unread count (lihat query params dalam route.js)
POST   /api/messages                — Hantar mesej peribadi (+ lampiran opsyenal)

GET    /api/discussion              — Senarai post + reply
POST   /api/discussion              — Post/reply baru (+ lampiran opsyenal)
DELETE /api/discussion              — Padam post (pemilik atau admin/manager)

POST   /api/attachments             — Upload satu fail lampiran (imej/PDF/Word/Excel/txt, max 10MB)
GET    /api/cron/purge-attachments  — [Vercel Cron sahaja, perlu CRON_SECRET] Padam lampiran >48 jam
```

---

## Eval Scoring

Setiap sesi dinilai oleh Claude merentas 6 aspek (0–100 setiap satu):

1. **Tone** — nada dan sikap semasa panggilan
2. **Delivery** — cara penyampaian maklumat
3. **Counter Argument** — respon kepada bantahan debtor
4. **Action & Compliance** — follow-through dan pematuhan prosedur
5. **Balance Strategy** — strategi untuk baki rendah vs tinggi
6. **Harassment Risk** — flag kalau ada bahasa berisiko

Plus `priorityFocus` — satu aspek kritikal untuk collector fokus sesi akan datang.

---

## Rate Limits

| Route | Limit |
|---|---|
| `/api/claude` | 40 req/min |
| `/api/tts` | 40 req/min |
| `/api/stt` | 60 req/min |
| `/api/attachments` | 20 req/min |

---

## Deploy

Push ke `main` branch → Vercel auto-deploy. Pastikan semua 6 env vars dah set dalam Vercel dashboard sebelum deploy pertama, dan `supabase/schema.sql` (versi terkini, termasuk `messages`/`discussion_posts`/Storage bucket `attachments`) dah di-run dalam Supabase SQL Editor.

