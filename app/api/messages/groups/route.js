// app/api/messages/groups/route.js
// ─────────────────────────────────────────────────────────────────────────
// Pengurusan Group Chat (bukan mesej — lihat app/api/messages/route.js untuk
// hantar/baca mesej dalam group). Route ni CREATE/RENAME/member-management/
// DELETE group — sengaja admin + manager SAHAJA (collector tak boleh create
// atau urus group, tapi boleh hantar mesej dalam group dia jadi ahli).
//
// GET  /api/messages/groups?groupId=<id>  -> detail satu group + ahli
//                                             (kena ahli ATAU admin/manager)
// POST /api/messages/groups { name, memberIds:[] }
//                                          -> create group baru (admin/manager)
//                                             pencipta automatik jadi ahli
// PATCH /api/messages/groups { groupId, name?, addMemberIds?:[], removeMemberIds?:[] }
//                                          -> rename / tambah / buang ahli (admin/manager)
// DELETE /api/messages/groups?groupId=<id> -> padam group (admin/manager)
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');
  if (!groupId) return Response.json({ error: 'groupId diperlukan.' }, { status: 400 });

  try {
    const sb = supabaseAdmin();
    const isManagerAdmin = authUser.role === 'admin' || authUser.role === 'manager';
    if (!isManagerAdmin) {
      const { data: membership } = await sb
        .from('message_group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', authUser.id)
        .maybeSingle();
      if (!membership) return Response.json({ error: 'Anda bukan ahli group chat ini.' }, { status: 403 });
    }

    const { data: group } = await sb.from('message_groups').select('*').eq('id', groupId).maybeSingle();
    if (!group) return Response.json({ error: 'Group chat tidak dijumpai.' }, { status: 404 });

    const { data: memberRows } = await sb.from('message_group_members').select('user_id').eq('group_id', groupId);
    const memberIds = (memberRows || []).map(r => r.user_id);
    const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', memberIds.length ? memberIds : ['__none__']);

    return Response.json({
      group: {
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        createdAt: group.created_at,
        members: (memberUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role })),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load group.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    if (!name) return Response.json({ error: 'Nama group diperlukan.' }, { status: 400 });

    // Dedupe + keluarkan pencipta sendiri dari senarai (ditambah automatik di bawah)
    const memberIds = Array.from(new Set((body.memberIds || []).filter(id => id && id !== authUser.id)));
    if (memberIds.length === 0) {
      return Response.json({ error: 'Pilih sekurang-kurangnya 1 ahli lain untuk group.' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const id = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { data: group, error } = await sb
      .from('message_groups')
      .insert({ id, name, created_by: authUser.id })
      .select()
      .single();
    if (error) throw error;

    const allMemberIds = [authUser.id, ...memberIds];
    const { error: memErr } = await sb
      .from('message_group_members')
      .insert(allMemberIds.map(uid => ({ group_id: id, user_id: uid })));
    if (memErr) throw memErr;

    const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', allMemberIds);
    return Response.json({
      group: {
        id: group.id,
        name: group.name,
        createdBy: group.created_by,
        createdAt: group.created_at,
        members: (memberUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role })),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to create group.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.groupId) return Response.json({ error: 'groupId diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: group } = await sb.from('message_groups').select('*').eq('id', body.groupId).maybeSingle();
    if (!group) return Response.json({ error: 'Group chat tidak dijumpai.' }, { status: 404 });

    if (typeof body.name === 'string' && body.name.trim()) {
      const { error } = await sb.from('message_groups').update({ name: body.name.trim() }).eq('id', body.groupId);
      if (error) throw error;
    }

    const addIds = Array.from(new Set((body.addMemberIds || []).filter(Boolean)));
    if (addIds.length) {
      const { data: existing } = await sb.from('message_group_members').select('user_id').eq('group_id', body.groupId);
      const existingIds = new Set((existing || []).map(r => r.user_id));
      const toAdd = addIds.filter(uid => !existingIds.has(uid));
      if (toAdd.length) {
        const { error } = await sb.from('message_group_members').insert(toAdd.map(uid => ({ group_id: body.groupId, user_id: uid })));
        if (error) throw error;
      }
    }

    const removeIds = Array.from(new Set((body.removeMemberIds || []).filter(Boolean)));
    if (removeIds.length) {
      const { error } = await sb.from('message_group_members').delete().eq('group_id', body.groupId).in('user_id', removeIds);
      if (error) throw error;
    }

    const { data: memberRows } = await sb.from('message_group_members').select('user_id').eq('group_id', body.groupId);
    const memberIds = (memberRows || []).map(r => r.user_id);
    const { data: memberUsers } = await sb.from('users').select('id, name, role').in('id', memberIds.length ? memberIds : ['__none__']);
    const { data: freshGroup } = await sb.from('message_groups').select('*').eq('id', body.groupId).maybeSingle();

    return Response.json({
      group: {
        id: freshGroup.id,
        name: freshGroup.name,
        createdBy: freshGroup.created_by,
        createdAt: freshGroup.created_at,
        members: (memberUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role })),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to update group.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');
    if (!groupId) return Response.json({ error: 'groupId diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();
    // FK on delete cascade urus message_group_members, message_group_reads,
    // dan messages (group_id) sekali — lihat supabase/schema.sql.
    const { error } = await sb.from('message_groups').delete().eq('id', groupId);
    if (error) throw error;
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete group.' }, { status: 500 });
  }
}
