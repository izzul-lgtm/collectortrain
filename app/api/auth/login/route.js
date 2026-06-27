import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at, isApproved: row.is_approved };
}

export async function POST(req) {
  try {
    const { id, pass } = await req.json();
    if (!id || !pass) {
      return Response.json({ error: 'Please fill in all fields.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, password_hash, is_approved')
      .eq('id', id.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return Response.json({ error: 'Employee ID not found.' }, { status: 404 });
    }
    const valid = await bcrypt.compare(pass, data.password_hash);
    if (!valid) {
      return Response.json({ error: 'Incorrect password.' }, { status: 401 });
    }
    // Block unapproved accounts
    if (!data.is_approved) {
      return Response.json({ error: 'Your account is pending approval. Please contact your manager or admin.' }, { status: 403 });
    }
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to sign in.' }, { status: 500 });
  }
}
