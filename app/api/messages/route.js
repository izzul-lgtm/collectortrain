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
// GET /api/messages?with=<userId>      -> thread DM penuh dengan user tu,
//                                          DAN auto mark-read
// GET /api/messages?groupId=<id>       -> thread group penuh (kena ahli),
//                                          DAN auto mark-read (upsert
//                                          message_group_reads)
// GET /api/messages?contacts=1         -> senarai staf lain (untuk "New
//                                          Message" DAN pemilihan ahli group)
// GET /api/messages?unreadCountOnly=1  -> { unreadTotal } sahaja — untuk
//                                          polling badge notification
// POST /api/messages { recipientId, body }         -> hantar mesej DM baru
// POST /api/messages { groupId, body }             -> hantar mesej group
//
// Nota: /api/users (senarai penuh user + registeredAt/isApproved/dsb) sengaja
// admin/manager-only untuk privacy pengurusan staf. Route ni JANGAN guna
// /api/users — ia resolve nama sendiri (server-side, guna service-role key)
// supaya SEMUA role (termasuk collector) boleh guna messaging tanpa 403.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';
import { withSignedUrls } from '../../../lib/attachments';

function toClientShape(row, nameMap) {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: nameMap ? (nameMap[row.sender_id] || row.sender_id) : undefined,
    recipientId: row.recipient_id,
    groupId: row.group_id,
    body: row.body,
    readAt: row.read_at,
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

      const { data: thread, error } = await sb
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const nowIso = new Date().toISOString();
      await sb.from('message_group_reads').upsert({ group_id: groupId, user_id: authUser.id, last_read_at: nowIso }, { onConflict: 'group_id,user_id' });

      const { data: memberRows } = await sb.from('message_group_members').select('user_id').eq('group_id', groupId);
      const memberIds = (memberRows || []).map(r => r.user_id);
      const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', memberIds.length ? memberIds : ['__none__']);
      const nameMap = {};
      (memberUsers || []).forEach(u => { nameMap[u.id] = u.name; });

      const threadWithUrls = await withSignedUrls(thread || []);
      return Response.json({
        thread: threadWithUrls.map(r => toClientShape(r, nameMap)),
        group: {
          id: group.id,
          name: group.name,
          createdBy: group.created_by,
          createdAt: group.created_at,
          members: (memberUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role })),
        },
      });
    }

    // ── Thread DM penuh dengan satu user + auto mark-read ──
    if (withUser) {
      const { data: thread, error } = await sb
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${authUser.id},recipient_id.eq.${withUser}),and(sender_id.eq.${withUser},recipient_id.eq.${authUser.id})`)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const nowIso = new Date().toISOString();
      const unreadIds = (thread || []).filter(m => m.recipient_id === authUser.id && !m.read_at).map(m => m.id);
      if (unreadIds.length) {
        await sb.from('messages').update({ read_at: nowIso }).in('id', unreadIds);
        (thread || []).forEach(m => { if (unreadIds.includes(m.id)) m.read_at = nowIso; });
      }

      const { data: otherUserRow } = await sb.from('users').select('id, name').eq('id', withUser).maybeSingle();
      const threadWithUrls = await withSignedUrls(thread || []);
      return Response.json({
        thread: threadWithUrls.map(r => toClientShape(r)),
        otherUser: otherUserRow ? { id: otherUserRow.id, name: otherUserRow.name } : { id: withUser, name: withUser },
      });
    }

    // ── Senarai perbualan DM (inbox) ──
    const { data: all, error } = await sb
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${authUser.id},recipient_id.eq.${authUser.id}`)
      .is('group_id', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: users } = await sb.from('users').select('id, name');
    const nameMap = {};
    (users || []).forEach(u => { nameMap[u.id] = u.name; });

    const convMap = new Map();
    (all || []).forEach(m => {
      const otherId = m.sender_id === authUser.id ? m.recipient_id : m.sender_id;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, {
          userId: otherId,
          userName: nameMap[otherId] || otherId,
          lastMessage: m.body,
          lastAt: m.created_at,
          unreadCount: 0,
        });
      }
      if (m.recipient_id === authUser.id && !m.read_at) {
        convMap.get(otherId).unreadCount++;
      }
    });
    const conversations = Array.from(convMap.values()).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    // ── Senarai group chat (untuk staf yang jadi ahli) ──
    const groupIds = await myGroupIds();
    let groups = [];
    if (groupIds.length) {
      const { data: groupRows } = await sb.from('message_groups').select('*').in('id', groupIds);
      const { data: memberRows } = await sb.from('message_group_members').select('group_id, user_id').in('group_id', groupIds);
      const memberCountByGroup = {};
      (memberRows || []).forEach(r => { memberCountByGroup[r.group_id] = (memberCountByGroup[r.group_id] || 0) + 1; });

      const { data: reads } = await sb.from('message_group_reads').select('group_id, last_read_at').eq('user_id', authUser.id).in('group_id', groupIds);
      const readMap = {};
      (reads || []).forEach(r => { readMap[r.group_id] = r.last_read_at; });

      const { data: lastMsgs } = await sb.from('messages').select('*').in('group_id', groupIds).order('created_at', { ascending: false });
      const lastByGroup = {};
      const unreadByGroup = {};
      (lastMsgs || []).forEach(m => {
        if (!lastByGroup[m.group_id]) lastByGroup[m.group_id] = m;
        const lastRead = readMap[m.group_id];
        if (m.sender_id !== authUser.id && (!lastRead || new Date(m.created_at) > new Date(lastRead))) {
          unreadByGroup[m.group_id] = (unreadByGroup[m.group_id] || 0) + 1;
        }
      });

      groups = (groupRows || []).map(g => ({
        id: g.id,
        name: g.name,
        memberCount: memberCountByGroup[g.id] || 0,
        lastMessage: lastByGroup[g.id] ? lastByGroup[g.id].body : null,
        lastAt: lastByGroup[g.id] ? lastByGroup[g.id].created_at : g.created_at,
        unreadCount: unreadByGroup[g.id] || 0,
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
  const { data: memberRows } = await sb.from('message_group_members').select('group_id').eq('user_id', userId);
  const groupIds = (memberRows || []).map(r => r.group_id);
  if (!groupIds.length) return 0;

  const { data: reads } = await sb.from('message_group_reads').select('group_id, last_read_at').eq('user_id', userId).in('group_id', groupIds);
  const readMap = {};
  (reads || []).forEach(r => { readMap[r.group_id] = r.last_read_at; });

  const { data: msgs } = await sb.from('messages').select('group_id, sender_id, created_at').in('group_id', groupIds).neq('sender_id', userId);
  let total = 0;
  (msgs || []).forEach(m => {
    const lastRead = readMap[m.group_id];
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) total++;
  });
  return total;
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
