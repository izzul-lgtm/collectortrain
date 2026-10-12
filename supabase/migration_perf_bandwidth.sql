-- Kurangkan bandwidth Supabase: kira unread & ringkasan inbox DALAM database,
-- bukan tarik semua baris mesej ke Vercel. Jalankan SEBELUM deploy kod baru.

create index if not exists idx_messages_recipient_unread on messages(recipient_id) where read_at is null;
create index if not exists idx_messages_group_created on messages(group_id, created_at desc);
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_discussion_parent on discussion_posts(parent_id);
create index if not exists idx_discussion_created on discussion_posts(created_at desc);

-- Jumlah unread merentasi semua group yang user jadi ahli (dipoll tiap 30s)
create or replace function ct_group_unread_count(p_user text) returns integer
language sql stable as $$
  select count(*)::int
  from messages m
  join message_group_members gm on gm.group_id = m.group_id and gm.user_id = p_user
  left join message_group_reads r on r.group_id = m.group_id and r.user_id = p_user
  where m.sender_id <> p_user
    and (r.last_read_at is null or m.created_at > r.last_read_at);
$$;

-- Ringkasan per group: mesej terakhir + unread
create or replace function ct_group_summaries(p_user text)
returns table(group_id text, last_body text, last_at timestamptz, unread integer)
language sql stable as $$
  select gm.group_id,
    (select m.body from messages m where m.group_id = gm.group_id order by m.created_at desc limit 1),
    (select m.created_at from messages m where m.group_id = gm.group_id order by m.created_at desc limit 1),
    (select count(*)::int from messages m
       left join message_group_reads r on r.group_id = m.group_id and r.user_id = p_user
       where m.group_id = gm.group_id and m.sender_id <> p_user
         and (r.last_read_at is null or m.created_at > r.last_read_at))
  from message_group_members gm
  where gm.user_id = p_user;
$$;

-- Inbox DM: satu baris setiap perbualan
create or replace function ct_dm_inbox(p_user text)
returns table(other_id text, last_body text, last_at timestamptz, unread integer)
language sql stable as $$
  select d.other,
         (array_agg(d.body order by d.created_at desc))[1],
         max(d.created_at),
         (count(*) filter (where d.recipient_id = p_user and d.read_at is null))::int
  from (
    select m.*, case when m.sender_id = p_user then m.recipient_id else m.sender_id end as other
    from messages m
    where m.group_id is null and (m.sender_id = p_user or m.recipient_id = p_user)
  ) d
  group by d.other;
$$;
