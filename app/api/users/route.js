import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    registeredAt: row.registered_at,
    isApproved: row.is_approved,
    maxSessionsPerDay: row.max_sessions_per_day ?? null,
  };
}

export async function GET(req) {
  const authErr = await requireAuth(req, ['admin', 'manager']);
  if (authErr) return authErr;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, is_approved, max_sessions_per_day')
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

// PATCH — approve/reject a user account, and/or set their daily session cap
export async function PATCH(req) {
  const authErr = await requireAuth(req, ['admin', 'manager']);
  if (authErr) return authErr;
  try {
    const { id, is_approved, max_sessions_per_day } = await req.json();
    if (!id) {
      return Response.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const update = {};
    if (typeof is_approved === 'boolean') update.is_approved = is_approved;
    if (max_sessions_per_day !== undefined) {
      // null = remove the cap (unlimited); otherwise must be a positive integer
      if (max_sessions_per_day !== null && (!Number.isInteger(max_sessions_per_day) || max_sessions_per_day < 1)) {
        return Response.json({ error: 'Daily session cap must be a positive whole number, or empty for unlimited.' }, { status: 400 });
      }
      update.max_sessions_per_day = max_sessions_per_day;
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .update(update)
      .eq('id', id)
      .select('id, name, role, registered_at, is_approved, max_sessions_per_day')
      .single();
    if (error) throw error;
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to update user.' }, { status: 500 });
  }
}
