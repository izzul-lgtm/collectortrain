-- ═══════════════════════════════════════════════════════════════════
-- CollectorTrain — Supabase schema
-- Fasa 1: jadual `scenarios`
-- Fasa 3: jadual `users`
-- Fasa 4: jadual `sessions` (lihat bahagian bawah fail ni)
-- ═══════════════════════════════════════════════════════════════════
-- Cara guna:
-- 1. Buka Supabase dashboard → project anda → SQL Editor → New query
-- 2. Copy-paste SEMUA fail ni → Run
-- 3. Pergi Table Editor, sahkan jadual `scenarios` (4 baris), `users`
--    (5 baris), dan `sessions` (0 baris — kosong sehingga ada sesi
--    latihan baru direkod) wujud
--
-- Nota: storage bucket untuk audio akan ditambah dalam fasa seterusnya.

create table if not exists scenarios (
  id            text primary key,
  emoji         text not null default '😐',
  name          text not null,
  gender        text not null default 'male' check (gender in ('male','female')),
  accent        text not null default 'melayu' check (accent in ('melayu','cina','india')),
  voice_id      text not null,
  title         text not null,
  description   text not null default '',
  amount        text not null,
  days          integer not null default 30,
  level         text not null default 'easy' check (level in ('easy','med','hard')),
  balance_tier  text not null default 'high' check (balance_tier in ('low','high')),
  prompt        text not null,
  checklist     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update `updated_at` setiap kali baris diubah, supaya manager boleh
-- nampak bila kali terakhir senario disunting tanpa perlu app.js set manual.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists scenarios_set_updated_at on scenarios;
create trigger scenarios_set_updated_at
  before update on scenarios
  for each row execute function set_updated_at();

-- ── Seed data (4 senario default — padanan dengan defaultScenarios() lama) ──
insert into scenarios (id, emoji, name, gender, accent, voice_id, title, description, amount, days, level, balance_tier, prompt, checklist)
values
  ('s1','😊','Encik Razif','male','melayu','TX3LPaxmHKxFdv7VOQHJ','Penghutang Bekerjasama','Lupa bayar, mudah dibujuk, minta tempoh.','RM3,200',45,'easy','low',
   'Anda berlakon sebagai {name}, penghutang yang lupa bayar pinjaman {amount} tertunggak {days} hari. Terkejut bila dihubungi tapi bersedia bekerjasama. Minta tempoh 2 minggu. Bahasa Malaysia natural. Jawab 1-3 ayat sahaja.',
   '[
     {"cat":"tone","text":"Kekal mesra tapi tegas — jangan terlalu lembut sampai tiada komitmen jelas diperoleh."},
     {"cat":"delivery","text":"Sebut tujuan panggilan & jumlah tertunggak dengan jelas dalam 2 ayat pertama."},
     {"cat":"counter","text":"Jika minta tempoh panjang, kemukakan tarikh spesifik (bukan \"nanti saya bayar\") dan tawar ansuran kecil jika tempoh ditolak."},
     {"cat":"action","text":"Sahkan semula nombor akaun & jumlah tepat, dapatkan tarikh PTP (Promise to Pay) yang spesifik sebelum tamat panggilan."},
     {"cat":"balance","text":"Baki RENDAH (<RM5,000) — dorong bayaran penuh sekaligus dahulu sebelum tawar ansuran."}
   ]'::jsonb),

  ('s2','😤','Puan Sarina','female','melayu','EXAVITQu4vr4xnSDxMaL','Penghutang Defensif','Mendakwa sudah bayar, marah bila dihubungi.','RM5,800',60,'med','high',
   'Anda berlakon sebagai {name}, penghutang yang mendakwa sudah bayar {amount}. Marah dan rasa difitnah. Minta bukti. Bahasa Malaysia emosional tapi sopan. Jawab 1-3 ayat.',
   '[
     {"cat":"tone","text":"Jangan defensif balik bila penghutang marah — validasi kekecewaan dia dahulu sebelum jelaskan rekod."},
     {"cat":"delivery","text":"Minta nombor resit/rujukan bayaran yang didakwa, jangan terus menafikan tanpa bertanya."},
     {"cat":"counter","text":"Bila didakwa \"sudah bayar\", tawar semak rekod bersama dan beri tempoh hantar bukti."},
     {"cat":"action","text":"Catat tarikh & cara bayaran yang didakwa untuk verifikasi back-office."},
     {"cat":"balance","text":"Baki TINGGI (RM5,800) — selepas isu dakwaan bayar selesai, tawar pelan ansuran berstruktur, bukan sekaligus."}
   ]'::jsonb),

  ('s3','😔','Encik Faizal','male','melayu','TX3LPaxmHKxFdv7VOQHJ','Kesusahan Kewangan','Kehilangan kerja, ikhlas nak bayar tapi tak mampu.','RM8,500',90,'med','high',
   'Anda berlakon sebagai {name}, penghutang yang hilang kerja 2 bulan. Hutang {amount} tertunggak {days} hari. Ada isteri dan 2 anak. Nada sedih. Bahasa Malaysia. Jawab 1-3 ayat.',
   '[
     {"cat":"tone","text":"Tunjuk empati genuine — elak nada formal/robotic bila penghutang kongsi kesusahan."},
     {"cat":"delivery","text":"Elak terus tekan bayar penuh; tanya dahulu kapasiti kewangan semasa penghutang."},
     {"cat":"counter","text":"Tawar penjadualan semula (restructuring) atau ansuran kecil yang realistik berdasarkan situasi kerja penghutang."},
     {"cat":"action","text":"Dokumenkan status \"kehilangan pekerjaan\" dalam nota akaun dan maklumkan langkah seterusnya dengan jelas."},
     {"cat":"balance","text":"Baki TINGGI (RM8,500) — fokus pelan jangka panjang berperingkat, bukan desakan bayaran segera."}
   ]'::jsonb),

  ('s4','😡','Encik Darwis','male','melayu','TX3LPaxmHKxFdv7VOQHJ','Penghutang Agresif','Marah, mengugut, cuba menakutkan collector.','RM12,000',120,'hard','high',
   'Anda berlakon sebagai {name}, penghutang sangat agresif. Hutang {amount}. Ugut nak adukan ke AKPK. Agresif tapi TANPA bahasa kesat. Bahasa Malaysia. Jawab 1-3 ayat.',
   '[
     {"cat":"tone","text":"Kekal profesional & tenang walaupun penghutang agresif — JANGAN naikkan nada/balas secara agresif."},
     {"cat":"delivery","text":"Guna ayat menenangkan (\"saya faham kekecewaan encik...\") sebelum kembali ke isu hutang."},
     {"cat":"counter","text":"Jika diugut nak lapor AKPK, jelaskan hak penghutang dengan tepat & tenang, bukan bertahan/defensif."},
     {"cat":"action","text":"JANGAN gunakan ugutan balas atau bahasa yang boleh dianggap harassment — ini kesalahan pematuhan serius."},
     {"cat":"balance","text":"Baki SANGAT TINGGI (RM12,000) — cadangkan rundingan/penjadualan semula formal, elak desak bayaran sekaligus."}
   ]'::jsonb)
on conflict (id) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────
-- Buat masa ni API routes guna SUPABASE_SERVICE_ROLE_KEY (bypass RLS
-- automatik), jadi RLS belum kritikal. Tapi enable + policy permisif ni
-- dari awal sebagai tabiat baik & sediakan asas untuk Fasa users/auth nanti
-- (bila kita pindah ke anon key + role-based policy di client).
alter table scenarios enable row level security;

drop policy if exists "scenarios_read_all" on scenarios;
create policy "scenarios_read_all" on scenarios
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Fasa 3: jadual `users` (gantikan localStorage DB.getUsers/saveUsers)
-- ═══════════════════════════════════════════════════════════════════
-- PENTING: `password_hash` ialah bcrypt hash (10 rounds), BUKAN plain
-- text — jangan sekali-kali simpan password mentah dalam jadual ni.
-- Hashing & verify dibuat di server (app/api/auth/*) guna `bcryptjs`,
-- password mentah TIDAK PERNAH sampai/simpan dalam browser/JS source
-- lagi (beza besar dengan sebelum ni, yang password plaintext ADMIN/
-- MGR001/COL001-3 boleh terus dibaca dalam app.js source code).
create table if not exists users (
  id             text primary key,
  name           text not null,
  password_hash  text not null,
  role           text not null default 'collector' check (role in ('admin','manager','collector')),
  registered_at  timestamptz not null default now()
);

-- ── Seed 5 akaun default (password sama macam sebelum ni, tapi kini
--    hashed — ADMIN/admin123, MGR001/mgr123, COL001-3/col123) ──
insert into users (id, name, password_hash, role)
values
  ('ADMIN', 'Admin Sistem',  '$2b$10$lQHXd74aC6jYD8S9GTWZxOWpHosRfbDa/mjvHQ7TFItJpAy5XzgYS', 'admin'),
  ('MGR001','Puan Rashidah', '$2b$10$GBFrj3LpI1F8UCr6WNkE4OdKUmhAFvMDpyWGSUpH5oVUp1cTr3Ou6', 'manager'),
  ('COL001','Ahmad Faris',   '$2b$10$D.VDe01PPC.7UPIxpj0v4.KbgXxZdiiYlZz9Y6PUrw8UmVkhPDLju', 'collector'),
  ('COL002','Siti Nabilah',  '$2b$10$i.bu7S.r3A28cNrsclRZfuWtRN3mZiAK.6SX6LKG2d31wcA1rYu4m', 'collector'),
  ('COL003','Rizwan Hakim',  '$2b$10$JUIU1AbK/aS4Ta63xXfe8O8LE9h26bByOEzn9nVwF3oxqrwI3p3ke', 'collector')
on conflict (id) do nothing;

-- RLS: sama macam scenarios, API routes guna service role key (bypass),
-- enable + policy permisif sebagai asas untuk masa depan.
alter table users enable row level security;

drop policy if exists "users_read_all" on users;
create policy "users_read_all" on users
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Fasa 4: jadual `sessions` (gantikan localStorage DB.getSessions/addSession)
-- ═══════════════════════════════════════════════════════════════════
-- PENTING: ni jadual yang paling besar/kerap ditulis (1 baris setiap kali
-- collector habis 1 sesi latihan) — transcript & scores disimpan sebagai
-- jsonb (sama struktur macam dulu disimpan dalam localStorage), supaya
-- app.js tak perlu banyak ubah bentuk data.
create table if not exists sessions (
  id               text primary key,
  collector_id     text not null,
  scenario_id      text,
  scenario_name    text not null default '',
  duration         text not null default '',
  total_score      integer not null default 0,
  scores           jsonb not null default '{}'::jsonb,
  strengths        jsonb not null default '[]'::jsonb,
  missed           jsonb not null default '[]'::jsonb,
  priority_focus   jsonb,
  harassment_risk  text not null default 'none' check (harassment_risk in ('none','low','medium','high')),
  harassment_note  text not null default '',
  feedback         text not null default '',
  transcript       jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

-- Index untuk query biasa: "sesi collector ni" (My History) & susun ikut tarikh
create index if not exists idx_sessions_collector on sessions(collector_id);
create index if not exists idx_sessions_created_at on sessions(created_at desc);

alter table sessions enable row level security;

drop policy if exists "sessions_read_all" on sessions;
create policy "sessions_read_all" on sessions
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Tambahan: Maklumat Akaun Pelanggan (rujukan collector semasa nego)
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: collector perlukan detail akaun sebenar (no. akaun, no. servis, IC,
-- tarikh, dll) untuk dirujuk SEMASA panggilan nego, bukan sekadar nama &
-- jumlah hutang yang dah sedia ada. Guna `add column if not exists` supaya
-- selamat di-run berulang & tak ganggu 4 senario seed yang dah wujud (akan
-- masuk sebagai '' / null dulu sehingga manager isi melalui form Edit Senario).
-- Nota: `name` (Nama Penghutang) & `amount` (Jumlah Hutang/Amount Outstanding)
-- TAK diduplikasi — column tu dah sedia ada & dipakai semula utk maklumat ni.
alter table scenarios add column if not exists client            text not null default '';
alter table scenarios add column if not exists ic_number         text not null default '';
alter table scenarios add column if not exists acc_number        text not null default '';
alter table scenarios add column if not exists service_no        text not null default '';
alter table scenarios add column if not exists acc_type          text not null default '';
alter table scenarios add column if not exists termination_date  date;
alter table scenarios add column if not exists registration_date date;

-- ═══════════════════════════════════════════════════════════════════
-- Tambahan: Pengumuman / Polisi Wajib Dimaklumkan kepada Penghutang
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: bila syarikat brief collector pasal tindakan/dasar BARU (cth:
-- "paylater/e-wallet akan disekat sebab akaun masuk CTOS") yang WAJIB
-- disampaikan kepada penghutang semasa nego, sebelum ni tiada cara untuk
-- AI Quality Assurance tahu pasal dasar tu — jadi walaupun collector tak
-- maklumkan langsung, AI takkan tangkap sebagai isu. Column ni simpan
-- senarai (jsonb array of text, "open" — tiada kategori dipaksa macam
-- checklist) pengumuman/dasar yang relevan untuk senario tu, supaya
-- evalCall() (app.js) boleh sertakan dalam prompt penilaian Claude &
-- tandakan sebagai "missed" (kategori action) kalau collector langsung
-- tak sebut sepanjang panggilan.
alter table scenarios add column if not exists disclosures jsonb not null default '[]'::jsonb;

-- ══════════════════════════════════════════════════════════
-- APPROVAL SYSTEM — add to existing deployments
-- ══════════════════════════════════════════════════════════
-- Run in Supabase SQL Editor if users table already exists:

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Auto-approve existing admin and manager accounts
UPDATE users SET is_approved = true WHERE role IN ('admin', 'manager');

-- ══════════════════════════════════════════════════════════
-- MIGRATION: if users table already exists, run these:
-- ══════════════════════════════════════════════════════════
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;
-- UPDATE users SET is_approved = true WHERE role IN ('admin', 'manager');

-- ═══════════════════════════════════════════════════════════════════
-- FASA 1 (quick win): Customer Type & Objection Type — tag berstruktur
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: sebelum ni "jenis penghutang" cuma wujud sebagai title/prompt
-- bebas teks (cth "Penghutang Agresif") — sistem tak boleh query/tally
-- ikut jenis tu. Manager pun tak boleh nampak "collector lemah skill X
-- KHUSUS bila lawan jenis penghutang Y" — cuma "lemah skill X" global.
--
-- NOTA DEFINISI (penting, dua field ni sengaja diasingkan supaya tak
-- bercampur 2 makna dalam 1 tag):
--   customer_type  = SEGMEN AKAUN penghutang (rujuk bucket assignment
--                     NewVest, SOP-COL-002): suspended / terminated /
--                     restructured / other. Ni "SIAPA" penghutang dari
--                     segi status akaun — BUKAN cara dia bercakap dalam call.
--   objection_type = CORAK TINGKAH LAKU/bantahan penghutang SEMASA call:
--                     cooperative / denial / hardship / aggressive /
--                     avoidance. Ni "BAGAIMANA" dia respons bila dihubungi
--                     — sepadan dengan 4 archetype senario sedia ada.
alter table scenarios add column if not exists customer_type  text not null default 'other'
  check (customer_type in ('suspended','terminated','restructured','other'));
alter table scenarios add column if not exists objection_type text not null default 'cooperative'
  check (objection_type in ('cooperative','denial','hardship','aggressive','avoidance'));

-- Backfill 4 seed scenario sedia ada ikut archetype masing-masing supaya
-- data lama pun terus berguna untuk analytics baru (bukan kosong/'other').
update scenarios set objection_type='cooperative' where id='s1';
update scenarios set objection_type='denial'      where id='s2';
update scenarios set objection_type='hardship'    where id='s3';
update scenarios set objection_type='aggressive'  where id='s4';

-- `sessions` simpan SALINAN tag ni (denormalized, sama pattern macam
-- scenario_name/scenario_id) — supaya analytics/tally TAK perlu join balik
-- ke `scenarios`. Sebab tu penting: scenario boleh diedit/dipadam lepas
-- sesi dah jalan — tag masa sesi tu BERLAKU mesti kekal sebagai rekod
-- sejarah, bukan terikut value scenario yang mungkin dah berubah.
alter table sessions add column if not exists customer_type  text not null default '';
alter table sessions add column if not exists objection_type text not null default '';
create index if not exists idx_sessions_objection_type on sessions(objection_type);

-- ═══════════════════════════════════════════════════════════════════
-- Fasa 4 fix: Per-scenario score weight multiplier
-- ═══════════════════════════════════════════════════════════════════
-- Manager boleh set weight 0.5×/1×/1.5×/2× per kategori (tone/delivery/
-- counter/action/balance) untuk scenario tertentu — cth NPL scenario,
-- "action" patut lebih berat dari "tone". Default semua 1.0 (neutral,
-- sama macam tak ada weight — backward compatible dengan scenario sedia ada).
alter table scenarios add column if not exists score_weights jsonb not null
  default '{"tone":1,"delivery":1,"counter":1,"action":1,"balance":1}'::jsonb;

-- Simpan max point per kategori (selepas weight dinormalise ke jumlah 100)
-- BERSAMA setiap sesi pada masa ia dinilai — supaya breakdown score session
-- lama kekal konsisten/tepat walaupun weight scenario diubah lepas tu.
-- null = sesi lama sebelum fix ni; app.js fallback ke 20/kategori untuk null.
alter table sessions add column if not exists score_max jsonb;

-- ═══════════════════════════════════════════════════════════════════
-- Fasa 4 (concern kos API): Daily session cap per collector
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: TTS feature flag & on-demand AI analysis dah ada untuk jimat kos,
-- tapi takde cara had berapa banyak sesi training collector boleh buat
-- sehari — collector boleh train tak terhad, makan kos Claude/Groq/Gemini
-- API tanpa kawalan. Column ni null = tiada had (backward compatible,
-- semua collector sedia ada terus unlimited macam sebelum ni) — admin/
-- manager set integer (cth 5) melalui Manage Users untuk had collector
-- tertentu. Enforce di server (app/api/sessions POST), bukan client-side
-- saja, supaya tak boleh bypass dengan edit JS di browser.
alter table users add column if not exists max_sessions_per_day integer;

-- ═══════════════════════════════════════════════════════════════════
-- Fasa 4: Manager-assigned mandatory scenarios
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: "Recommended" scenario sedia ada cuma cadangan (collector boleh
-- ignore terus & pilih scenario lain) — manager takde cara assign scenario
-- WAJIB ke collector tertentu dengan due date, dan takde cara track siapa
-- dah/belum selesaikan assignment tu.
create table if not exists assignments (
  id                    text primary key,
  collector_id          text not null,
  scenario_id           text not null,
  scenario_name         text not null default '', -- denormalized, sama pattern macam sessions.scenario_name — kekal walau scenario diedit/dipadam lepas tu
  assigned_by           text not null,
  due_date              date,
  status                text not null default 'pending' check (status in ('pending','completed','cancelled')),
  completed_session_id  text,
  completed_at          timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists idx_assignments_collector on assignments(collector_id);
create index if not exists idx_assignments_status on assignments(status);

alter table assignments enable row level security;

drop policy if exists "assignments_read_all" on assignments;
create policy "assignments_read_all" on assignments
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Audit log — rekod tindakan sensitif admin/manager
-- ═══════════════════════════════════════════════════════════════════
-- PUNCA: reset password, delete user, tukar role, approve/reject akaun,
-- set daily session limit — semua tindakan ni tiada rekod "siapa buat,
-- bila, kat siapa". Kalau ada dispute/isu compliance internal kemudian
-- hari, tiada cara nak trace balik. Jadual ni rekod setiap tindakan
-- sensitif secara automatik (insert-only, tiada UPDATE/DELETE dari app).
create table if not exists audit_log (
  id            text primary key,
  actor_id      text not null,               -- siapa buat tindakan (employee ID)
  actor_name    text not null default '',     -- denormalized — kekal walau actor account dipadam lepas tu
  action        text not null,                -- cth 'reset_password' | 'delete_user' | 'change_role' | 'approve_user' | 'reject_user' | 'set_session_limit'
  target_id     text,                         -- siapa/apa yang kena bagi tindakan ni (cth ID user yang di-reset)
  target_name   text not null default '',     -- denormalized — sama sebab
  details       jsonb not null default '{}',  -- konteks tambahan (cth {"oldRole":"collector","newRole":"manager"})
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on audit_log(created_at desc);
create index if not exists idx_audit_log_actor on audit_log(actor_id);
create index if not exists idx_audit_log_target on audit_log(target_id);

alter table audit_log enable row level security;

-- Baca sahaja untuk semua role authenticated melalui service role key (app
-- kita guna supabaseAdmin — bypass RLS sepenuhnya di server); policy ni
-- sekadar defence-in-depth kalau ada akses terus ke Supabase kemudian hari.
drop policy if exists "audit_log_read_all" on audit_log;
create policy "audit_log_read_all" on audit_log
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Mesej peribadi (DM) + Discussion board — dengan sokongan lampiran
-- ═══════════════════════════════════════════════════════════════════
-- Nota: `create table if not exists` di sini idempotent — kalau jadual ni
-- dah wujud (dibuat manual dalam dashboard sebelum ni), statement ni skip
-- sahaja dan terus ke `alter table ... add column if not exists` di bawah,
-- yang akan tambah 4 lajur lampiran baru tanpa jejaskan data sedia ada.

create table if not exists messages (
  id            text primary key,
  sender_id     text not null,
  recipient_id  text not null,
  body          text not null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists discussion_posts (
  id            text primary key,
  author_id     text not null,
  body          text not null,
  parent_id     text references discussion_posts(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- Lampiran (attachment) — fail disimpan dalam Storage bucket `attachments`
-- (private), lajur di bawah cuma simpan METADATA + path storan, bukan fail
-- sebenar. attachment_url simpan STORAGE PATH (bukan public URL — bucket
-- private), server jana signed URL sementara (1 jam) bila GET dipanggil.
--
-- PURGE 48 JAM: cron job harian (/api/cron/purge-attachments, lihat
-- vercel.json) padam fail dalam Storage + null-kan 4 lajur ni untuk
-- baris >48 jam. Mesej/post sendiri KEKAL — cuma lampiran dibuang, supaya
-- Storage tak membesar tanpa had ("elak system berat").
alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_name text;
alter table messages add column if not exists attachment_type text;
alter table messages add column if not exists attachment_size integer;

alter table discussion_posts add column if not exists attachment_path text;
alter table discussion_posts add column if not exists attachment_name text;
alter table discussion_posts add column if not exists attachment_type text;
alter table discussion_posts add column if not exists attachment_size integer;

create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_messages_recipient on messages(recipient_id);
create index if not exists idx_messages_created_at on messages(created_at);
-- Bantu query purge job cari lampiran >48 jam dengan cepat (jadual boleh
-- jadi besar lama-lama, index partial ni kekal kecil sebab cuma cover
-- baris yang MASIH ada lampiran).
create index if not exists idx_messages_attachment_purge on messages(created_at) where attachment_path is not null;

create index if not exists idx_discussion_posts_parent on discussion_posts(parent_id);
create index if not exists idx_discussion_posts_created_at on discussion_posts(created_at);
create index if not exists idx_discussion_posts_attachment_purge on discussion_posts(created_at) where attachment_path is not null;

-- Discussion tak macam Messages (tiada recipient khusus per baris — semua
-- orang boleh nampak semua post), so "unread" tak boleh disimpan sebagai
-- lajur read_at atas discussion_posts. Sebaliknya kita simpan SATU
-- timestamp "last_read_at" per user — unread count = bilangan post
-- (bukan author sendiri) dengan created_at > last_read_at user tu.
-- Di-upsert setiap kali user buka page Discussion (GET /api/discussion).
create table if not exists discussion_reads (
  user_id       text primary key,
  last_read_at  timestamptz not null default now()
);

alter table messages enable row level security;
alter table discussion_posts enable row level security;
alter table discussion_reads enable row level security;

-- App guna supabaseAdmin (service role, bypass RLS) di server sahaja —
-- policy read-all ni sekadar defence-in-depth, sama pattern macam audit_log.
drop policy if exists "messages_read_all" on messages;
create policy "messages_read_all" on messages for select using (true);
drop policy if exists "discussion_posts_read_all" on discussion_posts;
create policy "discussion_posts_read_all" on discussion_posts for select using (true);
drop policy if exists "discussion_reads_read_all" on discussion_reads;
create policy "discussion_reads_read_all" on discussion_reads for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Storage bucket untuk lampiran mesej/discussion
-- ═══════════════════════════════════════════════════════════════════
-- Bucket PRIVATE (public=false) — fail cuma boleh dibaca melalui signed URL
-- yang dijana server (service role), elak sesiapa guna URL awam untuk akses
-- lampiran orang lain. file_size_limit & allowed_mime_types di sini ikut had
-- PALING LONGGAR (Learning, 100MB + video) — had lagi ketat untuk mesej/
-- discussion (10MB, tiada video) dikuatkuasakan di app/api/attachments/
-- route.js (bukan di Storage), 2 lapisan check sekadar defence-in-depth.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 104857600,
  array['image/jpeg','image/png','image/gif','image/webp','application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'video/mp4','video/webm','video/quicktime','video/x-msvideo']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Tiada storage.objects policy ditambah sengaja — semua akses (upload, signed
-- URL, delete semasa purge) berlaku melalui supabaseAdmin (service role) di
-- server, yang bypass RLS/Storage policy sepenuhnya. Client TIDAK PERNAH
-- berurusan terus dengan Supabase Storage.

-- ═══════════════════════════════════════════════════════════════════
-- Learning Modules — kandungan pembelajaran berstruktur (bacaan/video/SOP)
-- tersusun ikut step, terutamanya untuk onboarding staf baru. Admin/manager
-- urus kandungan, semua staf (termasuk collector) boleh baca & tanda step
-- sebagai selesai. Susunan modul & step (order_index) tentukan urutan
-- "course" — supaya staf baru ikut ikut step yang logik, bukan random.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists learning_modules (
  id            text primary key,
  title         text not null,
  description   text,
  order_index   integer not null default 0,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create table if not exists learning_steps (
  id            text primary key,
  module_id     text not null references learning_modules(id) on delete cascade,
  title         text not null,
  -- content_type: 'text' (bacaan/SOP, content = badan teks), 'video' atau
  -- 'link' (content = URL — video YouTube/Drive/dsb, atau link luar), 'file'
  -- (content = URL fail luar, ATAU kosong kalau fail dimuat naik terus —
  -- lihat attachment_* di bawah).
  content_type  text not null default 'text' check (content_type in ('text','video','link','file')),
  content       text not null,
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Lampiran fail dimuat naik terus (PDF/Word/Excel/imej) untuk step jenis
-- 'file' — guna Storage bucket `attachments` YANG SAMA macam messages/
-- discussion (lihat app/api/attachments/route.js & lib/attachments.js),
-- TAPI SENGAJA TIDAK tertakluk pada cron purge 48 jam (purge-attachments
-- cuma target table messages/discussion_posts secara explicit — lihat
-- app/api/cron/purge-attachments/route.js). Fail Learning kekal SELAMA-
-- LAMANYA sehingga step dipadam/fail diganti (app/api/learning/route.js
-- padam fail Storage lama secara manual bila itu berlaku).
alter table learning_steps add column if not exists attachment_path text;
alter table learning_steps add column if not exists attachment_name text;
alter table learning_steps add column if not exists attachment_type text;
alter table learning_steps add column if not exists attachment_size integer;

-- Progress per staf per step — composite PK (bukan text id berasingan)
-- sebab semantiknya "adakah user ni dah selesai step ni", bukan rekod
-- berbilang attempt macam quiz_attempts di bawah.
create table if not exists learning_progress (
  user_id       text not null,
  step_id       text not null references learning_steps(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, step_id)
);

create index if not exists idx_learning_steps_module on learning_steps(module_id);
create index if not exists idx_learning_progress_user on learning_progress(user_id);

alter table learning_modules enable row level security;
alter table learning_steps enable row level security;
alter table learning_progress enable row level security;
drop policy if exists "learning_modules_read_all" on learning_modules;
create policy "learning_modules_read_all" on learning_modules for select using (true);
drop policy if exists "learning_steps_read_all" on learning_steps;
create policy "learning_steps_read_all" on learning_steps for select using (true);
drop policy if exists "learning_progress_read_all" on learning_progress;
create policy "learning_progress_read_all" on learning_progress for select using (true);

-- ═══════════════════════════════════════════════════════════════════
-- Weekly Quiz — wajib (macam Assignments), admin/manager boleh set soalan
-- manual ATAU auto-generate draf guna AI (Claude, client-side call ke
-- /api/claude — sama pattern macam AI Scenario Builder, tiada endpoint
-- server berasingan diperlukan untuk generation). Status siapa dah/belum
-- jawab DIKIRA on-the-fly (bukan pre-created stub row per collector) —
-- sama approach macam statusBadge() dalam Assignments: bandingkan
-- quiz_attempts sedia ada vs due_date, bukan simpan status eksplisit.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists quizzes (
  id            text primary key,
  title         text not null,
  description   text,
  source        text not null default 'manual' check (source in ('manual','ai')),
  due_date      date,
  published     boolean not null default false,
  created_by    text not null,
  created_at    timestamptz not null default now()
);

create table if not exists quiz_questions (
  id            text primary key,
  quiz_id       text not null references quizzes(id) on delete cascade,
  question      text not null,
  options       jsonb not null,   -- array of strings, cth ["A","B","C","D"]
  correct_index integer not null, -- index dalam `options` yang betul
  order_index   integer not null default 0
);

-- unique(quiz_id, user_id): satu attempt sahaja per collector per quiz —
-- elak collector cuba berkali-kali sampai jawab betul (defeat purpose
-- "wajib" tu — nak ukur pemahaman sebenar, bukan proses cuba-jaya).
create table if not exists quiz_attempts (
  id            text primary key,
  quiz_id       text not null references quizzes(id) on delete cascade,
  user_id       text not null,
  answers       jsonb,      -- array of selected option index, ikut order_index soalan
  score         integer,    -- bilangan jawapan betul
  total         integer,    -- jumlah soalan (snapshot masa attempt — elak salah kira kalau soalan ditambah/dibuang lepas ni)
  submitted_at  timestamptz not null default now(),
  unique(quiz_id, user_id)
);

create index if not exists idx_quiz_questions_quiz on quiz_questions(quiz_id);
create index if not exists idx_quiz_attempts_quiz on quiz_attempts(quiz_id);
create index if not exists idx_quiz_attempts_user on quiz_attempts(user_id);

alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;
drop policy if exists "quizzes_read_all" on quizzes;
create policy "quizzes_read_all" on quizzes for select using (true);
drop policy if exists "quiz_questions_read_all" on quiz_questions;
create policy "quiz_questions_read_all" on quiz_questions for select using (true);
drop policy if exists "quiz_attempts_read_all" on quiz_attempts;
create policy "quiz_attempts_read_all" on quiz_attempts for select using (true);
