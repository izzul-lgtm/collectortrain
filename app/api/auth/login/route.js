import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { rateLimit } from '../../../../lib/rateLimit';
import { createSessionToken } from '../../../../lib/session';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at, isApproved: row.is_approved, maxSessionsPerDay: row.max_sessions_per_day ?? null };
}

function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req) {
  try {
    const { id, pass } = await req.json();
    if (!id || !pass) {
      return Response.json({ error: 'Please fill in all fields.' }, { status: 400 });
    }
    // SECURITY: takde had cubaan login sebelum ni — sesiapa boleh brute-force
    // teka password employee ID tanpa lockout. Had kepada 8 cubaan/minit,
    // key gabungan IP + ID yang dicuba (bukan x-user-id sebab belum login lagi).
    const limitError = rateLimit(req, 'login', { max: 8, windowMs: 60_000, key: `${clientIp(req)}:${id.toUpperCase()}` });
    if (limitError) return limitError;
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, password_hash, is_approved, max_sessions_per_day')
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
    // SEKURITI: jana signed token di sini (lepas password disahkan betul) —
    // ni yang client simpan & hantar balik pada setiap API call seterusnya,
    // BUKAN employee ID mentah. Lihat lib/session.js untuk sebab penuh.
    const token = createSessionToken({ id: data.id, role: data.role });
    return Response.json({ user: toClientShape(data), token });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to sign in.' }, { status: 500 });
  }
}
