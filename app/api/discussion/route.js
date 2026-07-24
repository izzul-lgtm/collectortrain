// app/api/discussion/route.js
// ─────────────────────────────────────────────────────────────────────────
// Dua-hala: SEMUA role (collector/manager/admin) boleh post & reply.
// Satu tahap thread sahaja (parent_id) — cukup untuk perbualan ringkas,
// elak kerumitan nested-reply berbilang tahap.
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';
import { withSignedUrls } from '../../../lib/attachments';

function toClientShape(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    parentId: row.parent_id,
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
  const { authError } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('discussion_posts')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const withUrls = await withSignedUrls(data || []);
    return Response.json({ posts: withUrls.map(toClientShape) });
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
    // Lampiran (attachment) — opsyenal, dihantar client SELEPAS ia berjaya
    // upload melalui POST /api/attachments (lihat public/app.js:
    // uploadPendingAttachment()). attachmentPath = storage path (BUKAN
    // signed URL) — cuma path yang disimpan dalam DB.
    const { attachmentPath, attachmentName, attachmentType, attachmentSize } = body;
    const { data, error } = await sb
      .from('discussion_posts')
      .insert({
        id,
        author_id: authUser.id,
        body: body.body.trim(),
        parent_id: body.parentId || null,
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
    return Response.json({ post: toClientShape(withUrl) });
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
