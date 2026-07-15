// app/api/discussion/route.js
// ─────────────────────────────────────────────────────────────────────────
// Dua-hala: SEMUA role (collector/manager/admin) boleh post & reply.
// Satu tahap thread sahaja (parent_id) — cukup untuk perbualan ringkas,
// elak kerumitan nested-reply berbilang tahap.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  const { authError } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('discussion_posts')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ posts: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load discussion.' }, { status: 500 });
  }
}

export async function POST(request) {
  // Sesiapa yang log masuk boleh post — tiada roles restriction.
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.body || !body.body.trim()) {
      return Response.json({ error: 'body is required.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const id = 'disc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { data, error } = await sb
      .from('discussion_posts')
      .insert({
        id,
        author_id: authUser.id,
        body: body.body.trim(),
        parent_id: body.parentId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ post: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to post message.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  // Boleh padam post sendiri, ATAU admin/manager boleh padam mana-mana post
  // (moderation — contoh kandungan tak sesuai).
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { data: post } = await sb.from('discussion_posts').select('author_id').eq('id', id).maybeSingle();
    if (!post) return Response.json({ error: 'Post not found.' }, { status: 404 });
    const isOwner = post.author_id === authUser.id;
    const isModerator = authUser.role === 'admin' || authUser.role === 'manager';
    if (!isOwner && !isModerator) {
      return Response.json({ error: 'You can only delete your own posts.' }, { status: 403 });
    }
    const { error } = await sb.from('discussion_posts').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete message.' }, { status: 500 });
  }
}
