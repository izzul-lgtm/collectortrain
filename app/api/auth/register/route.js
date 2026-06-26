import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at, isApproved: row.is_approved };
}

export async function POST(req) {
  try {
    const { id, name, pass, role } = await req.json();
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

    // Admin and manager accounts are auto-approved; collectors require approval
    const isApproved = (role === 'admin' || role === 'manager');

    const password_hash = await bcrypt.hash(pass, 10);
    const { data, error } = await sb
      .from('users')
      .insert({ id: cleanId, name: name.trim(), password_hash, role: role || 'collector', is_approved: isApproved })
      .select('id, name, role, registered_at, is_approved')
      .single();
    if (error) throw error;
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to register user.' }, { status: 500 });
  }
}
