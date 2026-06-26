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
