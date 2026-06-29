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
```

Tiada satu pun dari ni optional — app akan return error kalau mana-mana satu missing.

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

---

## Deploy

Push ke `main` branch → Vercel auto-deploy. Pastikan semua 5 env vars dah set dalam Vercel dashboard sebelum deploy pertama.

