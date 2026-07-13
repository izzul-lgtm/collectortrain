import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';
import { logAudit } from '../../../lib/auditLog';

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
  // BUG FIX: was `requireAuth(req, ['admin','manager'])` — requireAuth expects
  // a second arg shaped { roles: [...] }, not a bare array. Destructuring
  // `roles` out of an array gives undefined, which silently skipped the role
  // check entirely — so ANY logged-in user (including collector) could call
  // this. Switched to the correct { roles: [...] } shape below.
  const { authError } = await requireAuthWithUser(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;
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
  // Same calling-convention bug as GET — fixed the same way.
  const { authError, authUser } = await requireAuthWithUser(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { id } = await req.json();
    const sb = supabaseAdmin();
    const { data: target } = await sb.from('users').select('id, name, role').eq('id', id).maybeSingle();
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
    const { data: actor } = await sb.from('users').select('name').eq('id', authUser.id).maybeSingle();
    await logAudit(sb, {
      actorId: authUser.id,
      actorName: actor?.name || '',
      action: 'delete_user',
      targetId: id,
      targetName: target?.name || '',
      details: { deletedRole: target?.role || null },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete user.' }, { status: 500 });
  }
}

// PATCH — approve/reject a user, set their daily session cap, and/or change their role.
export async function PATCH(req) {
  // Same calling-convention bug as GET/DELETE — fixed the same way.
  const { authError, authUser } = await requireAuthWithUser(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { id, is_approved, max_sessions_per_day, role } = await req.json();
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
    // Role change — granting manager/admin is sensitive, so ADMIN ONLY (manager
    // can still approve/reject/set caps above, just not hand out elevated roles).
    // This is the controlled replacement for self-registration ever being able
    // to pick its own role (see app/api/auth/register/route.js fix).
    if (role !== undefined) {
      if (authUser.role !== 'admin') {
        return Response.json({ error: 'Only an admin can change a user\'s role.' }, { status: 403 });
      }
      const VALID_ROLES = ['collector', 'manager', 'admin'];
      if (!VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Invalid role.' }, { status: 400 });
      }
      if (id === authUser.id) {
        return Response.json({ error: "You can't change your own role." }, { status: 400 });
      }
      update.role = role;
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data: before } = await sb.from('users').select('id, name, role, is_approved, max_sessions_per_day').eq('id', id).maybeSingle();
    const { data, error } = await sb
      .from('users')
      .update(update)
      .eq('id', id)
      .select('id, name, role, registered_at, is_approved, max_sessions_per_day')
      .single();
    if (error) throw error;

    // Audit — log setiap jenis perubahan sebagai action berasingan supaya
    // senang scan/filter kemudian ("siapa reject siapa", "siapa naikkan role
    // siapa jadi admin", dsb), bukan satu "update_user" generic yang kabur.
    const { data: actor } = await sb.from('users').select('name').eq('id', authUser.id).maybeSingle();
    const actorInfo = { actorId: authUser.id, actorName: actor?.name || '', targetId: id, targetName: before?.name || data.name || '' };
    if (typeof is_approved === 'boolean' && before && before.is_approved !== is_approved) {
      await logAudit(sb, { ...actorInfo, action: is_approved ? 'approve_user' : 'reject_user' });
    }
    if (role !== undefined && before && before.role !== role) {
      await logAudit(sb, { ...actorInfo, action: 'change_role', details: { oldRole: before.role, newRole: role } });
    }
    if (max_sessions_per_day !== undefined && before && before.max_sessions_per_day !== max_sessions_per_day) {
      await logAudit(sb, { ...actorInfo, action: 'set_session_limit', details: { oldLimit: before.max_sessions_per_day, newLimit: max_sessions_per_day } });
    }

    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to update user.' }, { status: 500 });
  }
}
