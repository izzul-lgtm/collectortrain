import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetId: row.target_id,
    targetName: row.target_name,
    details: row.details || {},
    date: row.created_at,
  };
}

export async function GET(req) {
  // Audit log = maklumat sensitif (siapa reset password siapa, siapa
  // delete siapa) — admin & manager je (sama macam akses page lain dalam
  // app ni, manager memang "akses penuh sama macam admin" by design).
  const { authError } = await requireAuthWithUser(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '300', 10) || 300, 1000);
    const sb = supabaseAdmin();
    let query = sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ entries: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal ambil audit log.' }, { status: 500 });
  }
}
