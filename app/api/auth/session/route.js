import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { verifySessionToken } from '../../../../lib/session';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    if (!token) return Response.json({ error: 'No session token provided.' }, { status: 400 });

    // SEKURITI: dulu route ni terima `?id=` mentah dan terus percaya —
    // sesiapa boleh restore "sesi" mana-mana ID dengan tukar URL param.
    // Sekarang wajib token sah (signature + belum expired).
    const claims = verifySessionToken(token);
    if (!claims) return Response.json({ error: 'Session invalid or expired.' }, { status: 401 });

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, is_approved, max_sessions_per_day')
      .eq('id', claims.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Session invalid.' }, { status: 404 });
    if (!data.is_approved) return Response.json({ error: 'Account not approved.' }, { status: 403 });

    return Response.json({ user: { id: data.id, name: data.name, role: data.role, registeredAt: data.registered_at, isApproved: data.is_approved, maxSessionsPerDay: data.max_sessions_per_day ?? null } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
