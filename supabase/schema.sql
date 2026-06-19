-- ═══════════════════════════════════════════════════════════════════
-- CollectorTrain — Supabase schema, Fasa 1: jadual `scenarios`
-- ═══════════════════════════════════════════════════════════════════
-- Cara guna:
-- 1. Buka Supabase dashboard → project anda → SQL Editor → New query
-- 2. Copy-paste SEMUA fail ni → Run
-- 3. Pergi Table Editor, sahkan jadual `scenarios` wujud dengan 4 baris
--    (4 senario default yang sama macam dalam app.js sekarang)
--
-- Nota: jadual users/sessions + storage bucket audio akan ditambah dalam
-- fail/fasa migration seterusnya — fail ni khusus untuk scenarios dahulu.

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
