// app/api/announcements/route.js
// ─────────────────────────────────────────────────────────────────────────
// Sehala: manager/admin post pengumuman, SEMUA orang (termasuk collector)
// boleh baca. Collector tak boleh POST/DELETE — ni papan notis, bukan forum.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row, userMap) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    postedBy: row.posted_by,
    postedByName: (userMap && userMap[row.posted_by]) || row.posted_by,
    pinned: row.pinned,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  // Semua role boleh baca — tiada roles restriction di sini.
  const { authError } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Resolve posted_by id -> name sekali (elak N+1 query di frontend)
    const { data: users } = await sb.from('users').select('id, name');
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u.name; });

    return Response.json({ announcements: (data || []).map(r => toClientShape(r, userMap)) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load announcements.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.title || !body.body) {
      return Response.json({ error: 'title and body are required.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { data, error } = await sb
      .from('announcements')
      .insert({
        id,
        title: body.title.trim(),
        body: body.body.trim(),
        posted_by: authUser.id,
        pinned: !!body.pinned,
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ announcement: toClientShape(data, {}) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to post announcement.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from('announcements').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete announcement.' }, { status: 500 });
  }
}
