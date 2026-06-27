import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    registeredAt: row.registered_at,
    isApproved: row.is_approved,
  };
}

export async function GET(req) {
  const authErr = await requireAuth(req, ['admin', 'manager']);
  if (authErr) return authErr;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, is_approved')
      .order('registered_at', { ascending: false });
    if (error) throw error;
    return Response.json({ users: data.map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load users.' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const authErr = await requireAuth(req, ['admin', 'manager']);
  if (authErr) return authErr;
  try {
    const { id } = await req.json();
    const sb = supabaseAdmin();
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete user.' }, { status: 500 });
  }
}

// PATCH — approve or reject a user account
export async function PATCH(req) {
  const authErr = await requireAuth(req, ['admin', 'manager']);
  if (authErr) return authErr;
  try {
    const { id, is_approved } = await req.json();
    if (!id || typeof is_approved !== 'boolean') {
      return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .update({ is_approved })
      .eq('id', id)
      .select('id, name, role, registered_at, is_approved')
      .single();
    if (error) throw error;
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to update user.' }, { status: 500 });
  }
}
