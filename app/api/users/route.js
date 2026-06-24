import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/requireAuth';

// PENTING: password_hash JANGAN SEKALI-KALI dihantar balik ke client —
// route ni sengaja .select() column tertentu sahaja (bukan '*') untuk
// elak hash bocor ke browser walaupun secara tak sengaja.
function toClientShape(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    registeredAt: row.registered_at,
  };
}

export async function GET(request) {
  const authError = await requireAuth(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at')
      .order('registered_at', { ascending: true });
    if (error) throw error;
    return Response.json({ users: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal ambil senarai pengguna.' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const authError = await requireAuth(req, { roles: ['admin'] });
  if (authError) return authError;

  try {
    const { id } = await req.json();
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal padam pengguna.' }, { status: 500 });
  }
}
