-- ═══════════════════════════════════════════════════════════════════
-- CollectorTrain — WhatsApp channel/community bridge (view-only)
-- ═══════════════════════════════════════════════════════════════════
-- Cara guna:
-- 1. Supabase dashboard → project (SAMA dengan yang CollectorTrain guna)
--    → SQL Editor → New query → paste SEMUA fail ni → Run
-- 2. Storage → New bucket → nama `whatsapp-session` → Private
--    (untuk backup session Baileys — lihat whatsapp-service/README.md)
--
-- Jadual ni hanya diakses melalui SUPABASE_SERVICE_ROLE_KEY (dari
-- CollectorTrain API routes DAN dari whatsapp-service Railway) — tiada
-- anon/public policy ditambah sengaja, sebab tiada client-side code yang
-- patut sentuh jadual ni terus.

create table if not exists whatsapp_messages (
  id             text primary key,           -- WhatsApp message id (dari Baileys)
  jid            text not null,               -- channel/community jid (whitelisted sahaja)
  channel_label  text,                        -- nama paparan (dari ALLOWED_JIDS config)
  sender_name    text,
  sender_jid     text,
  text           text,
  from_me        boolean not null default false,
  wa_timestamp   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists whatsapp_messages_jid_ts_idx
  on whatsapp_messages (jid, wa_timestamp desc);

create table if not exists whatsapp_channel_meta (
  id            int primary key default 1,
  status        text not null default 'starting', -- starting | qr | connected | disconnected | logged_out
  updated_at    timestamptz not null default now(),
  constraint whatsapp_channel_meta_singleton check (id = 1)
);
insert into whatsapp_channel_meta (id, status)
values (1, 'starting')
on conflict (id) do nothing;

alter table whatsapp_messages enable row level security;
alter table whatsapp_channel_meta enable row level security;
-- Sengaja TIADA policy anon/authenticated ditambah — akses hanya melalui
-- service role key (server-side sahaja), sama pattern macam jadual lain
-- dalam schema.sql utama buat masa ni.

-- ── Dua-hala: post notis dari CollectorTrain -> WhatsApp channel ────────
-- whatsapp_channels: senarai channel/community dibenarkan, auto-synced
-- oleh whatsapp-service dari config ALLOWED_JIDS bila dia start — supaya
-- CollectorTrain app tahu channel mana available untuk compose target,
-- tanpa duplicate config di dua tempat.
create table if not exists whatsapp_channels (
  jid           text primary key,
  label         text not null,
  created_at    timestamptz not null default now()
);

-- whatsapp_outbox: queue — CollectorTrain app INSERT je (status pending),
-- whatsapp-service (Railway, ada live socket) yang poll & hantar sebenar
-- ke WhatsApp guna sock.sendMessage(), lepas tu update status.
create table if not exists whatsapp_outbox (
  id            bigint generated always as identity primary key,
  jid           text not null,
  text          text not null,
  posted_by     text not null,
  status        text not null default 'pending' check (status in ('pending','sent','failed')),
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index if not exists whatsapp_outbox_status_idx on whatsapp_outbox (status, created_at);

alter table whatsapp_channels enable row level security;
alter table whatsapp_outbox enable row level security;
-- Sama macam jadual lain di atas — service role key sahaja, tiada
-- anon/authenticated policy.
