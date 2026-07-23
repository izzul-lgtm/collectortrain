// app/api/messages/route.js
// ─────────────────────────────────────────────────────────────────────────
// Mesej peribadi (1:1 DM) antara mana-mana 2 staf (collector/manager/admin
// boleh mesej sesiapa sahaja — tiada sekatan role, ini bukan announcement).
//
// GET /api/messages                    -> senarai perbualan (inbox), + unreadTotal
// GET /api/messages?with=<userId>      -> thread penuh dengan user tu, DAN
//                                          auto mark-read semua mesej masuk
//                                          yang belum dibaca dalam thread ni
// GET /api/messages?contacts=1         -> senarai staf lain (untuk "New Message")
// GET /api/messages?unreadCountOnly=1  -> { unreadTotal } sahaja — untuk polling
//                                          badge notification, murah/cepat
// POST /api/messages { recipientId, body } -> hantar mesej baru
//
// Nota: /api/users (senarai penuh user + registeredAt/isApproved/dsb) sengaja
// admin/manager-only untuk privacy pengurusan staf. Route ni JANGAN guna
// /api/users — ia resolve nama sendiri (server-side, guna service-role key)
// supaya SEMUA role (termasuk collector) boleh guna messaging tanpa 403.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const withUser = searchParams.get('with');
  const contactsOnly = searchParams.get('contacts');
  const unreadCountOnly = searchParams.get('unreadCountOnly');
  const sb = supabaseAdmin();

  try {
    // ── Lightweight poll: badge count sahaja, tiada senarai/thread ──
    if (unreadCountOnly) {
      const { count, error } = await sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', authUser.id)
        .is('read_at', null);
      if (error) throw error;
      return Response.json({ unreadTotal: count || 0 });
    }

    // ── Senarai staf lain untuk mula mesej baru ──
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

    // ── Thread penuh dengan satu user + auto mark-read ──
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
      return Response.json({
        thread: (thread || []).map(toClientShape),
        otherUser: otherUserRow ? { id: otherUserRow.id, name: otherUserRow.name } : { id: withUser, name: withUser },
      });
    }

    // ── Senarai perbualan (inbox) ──
    const { data: all, error } = await sb
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${authUser.id},recipient_id.eq.${authUser.id}`)
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
    const unreadTotal = conversations.reduce((a, c) => a + c.unreadCount, 0);

    return Response.json({ conversations, unreadTotal });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load messages.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.recipientId || !body.body || !body.body.trim()) {
      return Response.json({ error: 'recipientId and body are required.' }, { status: 400 });
    }
    if (body.recipientId === authUser.id) {
      return Response.json({ error: 'Cannot send a message to yourself.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { data, error } = await sb
      .from('messages')
      .insert({
        id,
        sender_id: authUser.id,
        recipient_id: body.recipientId,
        body: body.body.trim(),
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ message: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to send message.' }, { status: 500 });
  }
}
