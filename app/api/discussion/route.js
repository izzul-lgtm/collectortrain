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
    authorName: row.authorName || row.author_id,
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
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const unreadCountOnly = searchParams.get('unreadCountOnly');
  const sb = supabaseAdmin();

  try {
    // ── Lightweight poll: badge count sahaja, tiada senarai post ──
    // (sama pattern macam GET /api/messages?unreadCountOnly=1)
    if (unreadCountOnly) {
      const { data: readRow, error: readErr } = await sb
        .from('discussion_reads')
        .select('last_read_at')
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (readErr) throw readErr;
      // User belum pernah buka Discussion langsung -> anggap semua post
      // SEBELUM sekarang dah "dibaca" (elak banjir notification post lama
      // untuk staf baru daftar) — sama baseline logic macam client
      // lastNotifiedUnreadTotal, tapi di server-side.
      const lastReadAt = readRow?.last_read_at || new Date().toISOString();
      if (!readRow) {
        await sb.from('discussion_reads').upsert({ user_id: authUser.id, last_read_at: lastReadAt });
      }
      const { count, error } = await sb
        .from('discussion_posts')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', lastReadAt)
        .neq('author_id', authUser.id); // jangan kira post sendiri sebagai unread
      if (error) throw error;
      return Response.json({ unreadTotal: count || 0 });
    }

    const { data, error } = await sb
      .from('discussion_posts')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const { data: users } = await sb.from('users').select('id, name');
    const nameMap = {};
    (users || []).forEach(u => { nameMap[u.id] = u.name; });
    const withNames = (data || []).map(row => ({ ...row, authorName: nameMap[row.author_id] || row.author_id }));
    const withUrls = await withSignedUrls(withNames);
    // Buka page Discussion (senarai penuh dimuatkan) = anggap semua post
    // setakat ni dah dibaca -> upsert last_read_at supaya badge/notification
    // clear lepas ni.
    await sb.from('discussion_reads').upsert({ user_id: authUser.id, last_read_at: new Date().toISOString() });
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
