// app/api/messages/route.js
// ─────────────────────────────────────────────────────────────────────────
// Mesej peribadi (1:1 DM) DAN Group Chat antara staf.
// (Group CREATE/rename/delete/member-management = app/api/messages/groups
// route, admin+manager sahaja — lihat fail tu. Route ni cuma URUS MESEJ:
// hantar/baca, sama ada DM atau dalam group yang user tu dah jadi ahli.
// Sesiapa pun — termasuk collector — boleh hantar mesej dalam group yang
// dia ahli, sekadar TAK BOLEH create/urus group tu sendiri.)
//
// GET /api/messages                    -> senarai perbualan DM (inbox) +
//                                          senarai group chat, + unreadTotal
// GET /api/messages?with=<userId>[&limit=&before=]  -> thread DM dengan user
//                                          tu (50 TERKINI ikut default, guna
//                                          `before=<createdAt>` untuk batch
//                                          lama seterusnya), DAN auto mark-
//                                          read (SEMUA unread, bukan setakat
//                                          page ni)
// GET /api/messages?with=<userId>&q=<term>          -> cari mesej dalam DM
//                                          ni (ILIKE, max 200 hasil, TIADA
//                                          mark-read/pagination)
// GET /api/messages?groupId=<id>[&limit=&before=]   -> thread group (kena
//                                          ahli), pagination sama macam DM,
//                                          DAN auto mark-read (upsert
//                                          message_group_reads) + readBy
//                                          per-mesej (lihat toClientShape)
// GET /api/messages?groupId=<id>&q=<term>           -> cari dalam group ni
// GET /api/messages?contacts=1         -> senarai staf lain (untuk "New
//                                          Message" DAN pemilihan ahli group)
// GET /api/messages?unreadCountOnly=1  -> { unreadTotal } sahaja — untuk
//                                          polling badge notification
// POST /api/messages { recipientId, body }         -> hantar mesej DM baru
// POST /api/messages { groupId, body }             -> hantar mesej group
// PATCH /api/messages { id, body }                 -> edit mesej SENDIRI
//                                          (set edited_at) — PERLU jalankan
//                                          supabase/migration_add_edited_at.sql
//                                          dulu (lajur belum wujud)
// DELETE /api/messages { id }                      -> padam SATU mesej
//
// Nota: /api/users (senarai penuh user + registeredAt/isApproved/dsb) sengaja
// admin/manager-only untuk privacy pengurusan staf. Route ni JANGAN guna
// /api/users — ia resolve nama sendiri (server-side, guna service-role key)
// supaya SEMUA role (termasuk collector) boleh guna messaging tanpa 403.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';
import { withSignedUrls, ATTACHMENT_BUCKET } from '../../../lib/attachments';

function toClientShape(row, nameMap) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: nameMap ? (nameMap[row.sender_id] || row.sender_id) : undefined,
    recipientId: row.recipient_id,
    groupId: row.group_id,
    body: row.body,
    readAt: row.read_at,
    editedAt: row.edited_at || null, // lihat supabase/migration_add_edited_at.sql
    createdAt: row.created_at,
    // attachmentUrl = signed URL sementara (1 jam), null kalau tiada lampiran
    // ATAU lampiran dah dipurge (>48 jam) — lihat lib/attachments.js
    attachmentUrl: row.attachmentUrl ?? null,
    attachmentName: row.attachment_name || null,
    attachmentType: row.attachment_type || null,
    attachmentSize: row.attachment_size || null,
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const withUser = searchParams.get('with');
  const groupId = searchParams.get('groupId');
  const contactsOnly = searchParams.get('contacts');
  const unreadCountOnly = searchParams.get('unreadCountOnly');
  const sb = supabaseAdmin();

  try {
    // ── Group ahli user ni — dipakai berulang kali di bawah ──
    async function myGroupIds() {
      const { data, error } = await sb.from('message_group_members').select('group_id').eq('user_id', authUser.id);
      if (error) throw error;
      return (data || []).map(r => r.group_id);
    }

    // ── Lightweight poll: badge count sahaja, tiada senarai/thread ──
    if (unreadCountOnly) {
      const { count: dmCount, error: dmErr } = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', authUser.id)
        .is('read_at', null);
      if (dmErr) throw dmErr;

      const groupUnread = await countGroupUnread(sb, authUser.id);
      return Response.json({ unreadTotal: (dmCount || 0) + groupUnread });
    }

    // ── Senarai staf lain untuk mula mesej baru / pilih ahli group ──
    if (contactsOnly) {
      const { data: users, error } = await sb
        .from('users')
        .select('id, name, role')
        .eq('is_approved', true)
        .neq('id', authUser.id)
        .order('name', { ascending: true });
      if (error) throw error;
      return Response.json({ contacts: users || [] });
    }

    // ── Thread penuh dalam SATU GROUP + auto mark-read ──
    if (groupId) {
      const { data: membership } = await sb
        .from('message_group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (!membership) {
        return Response.json({ error: 'Anda bukan ahli group chat ini.' }, { status: 403 });
      }

      const { data: group } = await sb.from('message_groups').select('*').eq('id', groupId).maybeSingle();
      if (!group) return Response.json({ error: 'Group chat tidak dijumpai.' }, { status: 404 });

      const { data: memberRows } = await sb.from('message_group_members').select('user_id').eq('group_id', groupId);
      const memberIds = (memberRows || []).map(r => r.user_id);
      const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', memberIds.length ? memberIds : ['__none__']);
      const nameMap = {};
      (memberUsers || []).forEach(u => { nameMap[u.id] = u.name; });
      const groupShape = {
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        createdAt: group.created_at,
        members: (memberUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role })),
      };

      const q = searchParams.get('q');
      if (q && q.trim()) {
        // ── Cari dalam group ni sahaja — TIADA mark-as-read/pagination di
        // sini (carian sepatutnya tak ganggu status "dibaca" biasa) ──
        const { data: results, error } = await sb
          .from('messages')
          .select('*')
          .eq('group_id', groupId)
          .ilike('body', `%${q.trim()}%`)
          .order('created_at', { ascending: true })
          .limit(200);
        if (error) throw error;
        const resultsWithUrls = await withSignedUrls(results || []);
        return Response.json({
          searchResults: resultsWithUrls.map(r => toClientShape(r, nameMap)),
          group: groupShape,
          query: q.trim(),
        });
      }

      // ── Pagination: load `limit` mesej TERKINI dulu (default 50, max
      // 100). "Load mesej lebih awal" di frontend hantar `before=<createdAt
      // mesej paling lama yang dah di-load>` untuk tarik batch lama
      // seterusnya. Elak load SEMUA history sekaligus — group lama makin
      // berat kalau di-load penuh setiap kali dibuka. ──
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
      const before = searchParams.get('before');
      let threadQuery = sb.from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(limit);
      if (before) threadQuery = threadQuery.lt('created_at', before);
      const { data: page, error } = await threadQuery;
      if (error) throw error;
      const thread = (page || []).slice().reverse(); // balik ke ascending (lama→baru) untuk papar

      const nowIso = new Date().toISOString();
      await sb.from('message_group_reads').upsert({ group_id: groupId, user_id: authUser.id, last_read_at: nowIso }, { onConflict: 'group_id,user_id' });

      // ── "Dibaca oleh" — dikira dari last_read_at SEMUA ahli (bukan
      // setakat user ni). Mesej dianggap dibaca oleh ahli X kalau
      // last_read_at dia >= waktu mesej tu dihantar (last_read_at
      // dikemaskini tiap kali ahli tu buka thread ni — lihat upsert atas). ──
      const { data: allReads } = await sb.from('message_group_reads').select('user_id, last_read_at').eq('group_id', groupId);
      const lastReadMap = {};
      (allReads || []).forEach(r => { lastReadMap[r.user_id] = r.last_read_at; });
      lastReadMap[authUser.id] = nowIso; // reflect upsert baru tadi terus (elak race baca-lepas-tulis)

      const threadWithUrls = await withSignedUrls(thread || []);
      const threadShaped = threadWithUrls.map(r => {
        const shaped = toClientShape(r, nameMap);
        shaped.readBy = memberIds
          .filter(uid => uid !== r.sender_id && lastReadMap[uid] && new Date(lastReadMap[uid]) >= new Date(r.created_at))
          .map(uid => nameMap[uid] || uid);
        return shaped;
      });

      return Response.json({
        thread: threadShaped,
        group: groupShape,
        hasMore: (page || []).length === limit,
      });
    }

    // ── Thread DM dengan satu user (dengan pagination) + auto mark-read ──
    if (withUser) {
      const { data: otherUserRow } = await sb.from('users').select('id, name').eq('id', withUser).maybeSingle();
      const otherUserShape = otherUserRow ? { id: otherUserRow.id, name: otherUserRow.name } : { id: withUser, name: withUser };

      const q = searchParams.get('q');
      if (q && q.trim()) {
        // ── Cari dalam DM ni sahaja — TIADA mark-as-read/pagination di
        // sini (carian sepatutnya tak ganggu status "dibaca" biasa) ──
        const { data: results, error } = await sb
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${authUser.id},recipient_id.eq.${withUser}),and(sender_id.eq.${withUser},recipient_id.eq.${authUser.id})`)
          .ilike('body', `%${q.trim()}%`)
          .order('created_at', { ascending: true })
          .limit(200);
        if (error) throw error;
        const resultsWithUrls = await withSignedUrls(results || []);
        return Response.json({
          searchResults: resultsWithUrls.map(r => toClientShape(r)),
          otherUser: otherUserShape,
          query: q.trim(),
        });
      }

      // ── Pagination: load `limit` mesej TERKINI dulu (default 50, max
      // 100). "Load mesej lebih awal" di frontend hantar `before=<createdAt
      // mesej paling lama yang dah di-load>` untuk tarik batch lama
      // seterusnya. Elak load SEMUA history sekaligus — conversation lama
      // makin berat kalau di-load penuh setiap kali dibuka. ──
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
      const before = searchParams.get('before');
      let threadQuery = sb
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${authUser.id},recipient_id.eq.${withUser}),and(sender_id.eq.${withUser},recipient_id.eq.${authUser.id})`)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (before) threadQuery = threadQuery.lt('created_at', before);
      const { data: page, error } = await threadQuery;
      if (error) throw error;
      const thread = (page || []).slice().reverse(); // balik ke ascending (lama→baru) untuk papar

      // Mark-as-read: SEMUA mesej belum dibaca dalam conversation ni (BUKAN
      // setakat yang ada dalam page/limit ni) — supaya betul walau ada
      // pagination (kalau tak, mesej lama di luar page takkan pernah
      // termark read).
      const nowIso = new Date().toISOString();
      const { data: justReadRows } = await sb
        .from('messages')
        .update({ read_at: nowIso })
        .eq('sender_id', withUser)
        .eq('recipient_id', authUser.id)
        .is('read_at', null)
        .select('id');
      const justReadIds = new Set((justReadRows || []).map(r => r.id));
      thread.forEach(m => { if (justReadIds.has(m.id)) m.read_at = nowIso; });

      const threadWithUrls = await withSignedUrls(thread || []);
      return Response.json({
        thread: threadWithUrls.map(r => toClientShape(r)),
        otherUser: otherUserShape,
        hasMore: (page || []).length === limit,
      });
    }

    // ── Senarai perbualan DM (inbox) ──
    const { data: inbox, error } = await sb.rpc('ct_dm_inbox', { p_user: authUser.id });
    if (error) throw error;

    const { data: users } = await sb.from('users').select('id, name');
    const nameMap = {};
    (users || []).forEach(u => { nameMap[u.id] = u.name; });

    const convMap = new Map();
    (inbox || []).forEach(r => {
      convMap.set(r.other_id, {
        userId: r.other_id,
        userName: nameMap[r.other_id] || r.other_id,
        lastMessage: r.last_body,
        lastAt: r.last_at,
        unreadCount: r.unread,
      });
    });
    const conversations = Array.from(convMap.values()).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    // ── Senarai group chat (untuk staf yang jadi ahli) ──
    const groupIds = await myGroupIds();
    let groups = [];
    if (groupIds.length) {
      const { data: groupRows } = await sb.from('message_groups').select('id, name, created_at').in('id', groupIds);
      const { data: memberRows } = await sb.from('message_group_members').select('group_id, user_id').in('group_id', groupIds);
      const memberCountByGroup = {};
      (memberRows || []).forEach(r => { memberCountByGroup[r.group_id] = (memberCountByGroup[r.group_id] || 0) + 1; });

      const { data: sums } = await sb.rpc('ct_group_summaries', { p_user: authUser.id });
      const sumByGroup = {};
      (sums || []).forEach(r => { sumByGroup[r.group_id] = r; });

      groups = (groupRows || []).map(g => ({
        id: g.id,
        name: g.name,
        memberCount: memberCountByGroup[g.id] || 0,
        lastMessage: sumByGroup[g.id] ? sumByGroup[g.id].last_body : null,
        lastAt: (sumByGroup[g.id] && sumByGroup[g.id].last_at) || g.created_at,
        unreadCount: sumByGroup[g.id] ? sumByGroup[g.id].unread : 0,
      })).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
    }

    const unreadTotal = conversations.reduce((a, c) => a + c.unreadCount, 0) + groups.reduce((a, g) => a + g.unreadCount, 0);

    return Response.json({ conversations, groups, unreadTotal });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load messages.' }, { status: 500 });
  }
}

// Kira jumlah mesej belum dibaca merentasi SEMUA group user ni jadi ahli —
// dipakai oleh unreadCountOnly=1 (dipoll setiap 5 saat, kena ringan).
async function countGroupUnread(sb, userId) {
  const { data, error } = await sb.rpc('ct_group_unread_count', { p_user: userId });
  if (error) throw error;
  return data || 0;
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.body || !body.body.trim()) {
      return Response.json({ error: 'body mesej diperlukan.' }, { status: 400 });
    }
    if (!body.recipientId && !body.groupId) {
      return Response.json({ error: 'recipientId atau groupId diperlukan.' }, { status: 400 });
    }
    const sb = supabaseAdmin();

    // ── Group message — kena ahli group tu dulu ──
    if (body.groupId) {
      const { data: membership } = await sb
        .from('message_group_members')
        .select('user_id')
        .eq('group_id', body.groupId)
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (!membership) {
        return Response.json({ error: 'Anda bukan ahli group chat ini.' }, { status: 403 });
      }
    } else if (body.recipientId === authUser.id) {
      return Response.json({ error: 'Cannot send a message to yourself.' }, { status: 400 });
    }

    const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    // Lampiran (attachment) — opsyenal, dihantar client SELEPAS ia berjaya
    // upload melalui POST /api/attachments (lihat public/app.js:
    // uploadPendingAttachment()). attachmentPath = storage path (BUKAN
    // signed URL) — cuma path yang disimpan dalam DB.
    const { attachmentPath, attachmentName, attachmentType, attachmentSize } = body;
    const { data, error } = await sb
      .from('messages')
      .insert({
        id,
        sender_id: authUser.id,
        recipient_id: body.groupId ? null : body.recipientId,
        group_id: body.groupId || null,
        body: body.body.trim(),
        ...(attachmentPath ? {
          attachment_path: attachmentPath,
          attachment_name: attachmentName || null,
          attachment_type: attachmentType || null,
          attachment_size: attachmentSize || null,
        } : {}),
      })
      .select()
      .single();
    if (error) throw error;
    const [withUrl] = await withSignedUrls([data]);
    return Response.json({ message: toClientShape(withUrl) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to send message.' }, { status: 500 });
  }
}

// PATCH /api/messages { id, body } -> edit TEKS mesej sendiri (bukan
// lampiran). Owner SAHAJA — TIDAK macam DELETE, admin/manager TAK boleh
// edit kandungan mesej orang lain (moderator patut DELETE kalau perlu
// buang, bukan tukar kata-kata orang — konteks kerja ni audit-sensitive,
// lihat /areas/audit-compliance.md). `edited_at` disimpan supaya penerima
// nampak label "(disunting)" — kekalkan ketelusan.
//
// PERLU MIGRATION DULU: jalankan supabase/migration_add_edited_at.sql
// dalam Supabase SQL editor sebelum deploy — lajur `edited_at` belum wujud
// dalam jadual `messages`, PATCH akan gagal (column does not exist) kalau
// migration ni belum dijalankan.
export async function PATCH(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const { id, body: newBody } = await request.json();
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });
    if (!newBody || !newBody.trim()) return Response.json({ error: 'body mesej diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: msg } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
    if (!msg) return Response.json({ error: 'Mesej tidak dijumpai.' }, { status: 404 });
    if (msg.sender_id !== authUser.id) {
      return Response.json({ error: 'Anda hanya boleh edit mesej sendiri.' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from('messages')
      .update({ body: newBody.trim(), edited_at: nowIso })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const [withUrl] = await withSignedUrls([data]);
    return Response.json({ message: toClientShape(withUrl) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to edit message.' }, { status: 500 });
  }
}

// DELETE /api/messages { id } -> padam SATU mesej (DM atau group).
// Boleh padam mesej sendiri, ATAU admin/manager boleh padam mesej sesiapa
// sahaja (moderation) — sama pattern macam DELETE /api/discussion.
//
// Sebab wujud: sebelum ni jadual `messages` TAK PERNAH kehilangan baris —
// cron purge-attachments cuma buang lampiran lepas 48j, mesej itu sendiri
// kekal selama-lamanya (lihat nota dalam lib/attachments.js). Lama-lama
// jadual ni jadi paling besar/kerap ditulis dalam DB (1 baris setiap DM/
// group message), jadi query GET /api/messages (inbox + thread, dipoll
// kerap untuk badge unread) makin lambat — bagi user function untuk padam
// mesej sendiri (typo, salah hantar, dsb) supaya jadual tak membesar
// tanpa had & sistem tak jadi berat akan datang.
export async function DELETE(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: msg } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
    if (!msg) return Response.json({ error: 'Mesej tidak dijumpai.' }, { status: 404 });

    const isOwner = msg.sender_id === authUser.id;
    const isModerator = authUser.role === 'admin' || authUser.role === 'manager';
    if (!isOwner && !isModerator) {
      return Response.json({ error: 'Anda hanya boleh padam mesej sendiri.' }, { status: 403 });
    }

    // Kalau mesej ada lampiran yang belum sempat dipurge (<48j), buang fail
    // Storage juga di sini — kalau tidak, fail tu jadi orphan (tiada baris
    // DB rujuk dia lagi, tapi kekal dalam Storage selama-lamanya).
    if (msg.attachment_path) {
      const { error: removeError } = await sb.storage.from(ATTACHMENT_BUCKET).remove([msg.attachment_path]);
      if (removeError) console.error('[DELETE /api/messages] storage remove error:', removeError.message);
    }

    const { error } = await sb.from('messages').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete message.' }, { status: 500 });
  }
}
