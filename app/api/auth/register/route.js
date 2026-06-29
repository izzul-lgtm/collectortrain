import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at, isApproved: row.is_approved };
}

export async function POST(req) {
  try {
    const { id, name, pass } = await req.json();
    if (!id || !name || !pass) {
      return Response.json({ error: 'Please fill in all fields.' }, { status: 400 });
    }
    if (pass.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
    const cleanId = id.trim().toUpperCase();
    const sb = supabaseAdmin();

    const { data: existing, error: checkErr } = await sb
      .from('users').select('id').eq('id', cleanId).maybeSingle();
    if (checkErr) throw checkErr;
    if (existing) {
      return Response.json({ error: 'This Employee ID already exists.' }, { status: 409 });
    }

    // SECURITY FIX: this endpoint is public/unauthenticated (anyone with the
    // URL can hit it, logged in or not). It used to accept a `role` field
    // from the request body and auto-approve it when role was 'admin' or
    // 'manager' — meaning anyone could self-register as Admin and sign in
    // immediately, no review at all. Self-registration now ALWAYS creates a
    // 'collector' account pending approval, full stop; the role field from
    // the client is no longer read here. To grant manager/admin, an existing
    // admin must promote the account afterwards via Manage Users (PATCH
    // /api/users with `role`, gated to admin-only there).
    const password_hash = await bcrypt.hash(pass, 10);
    const { data, error } = await sb
      .from('users')
      .insert({ id: cleanId, name: name.trim(), password_hash, role: 'collector', is_approved: false })
      .select('id, name, role, registered_at, is_approved')
      .single();
    if (error) throw error;
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to register user.' }, { status: 500 });
  }
}
