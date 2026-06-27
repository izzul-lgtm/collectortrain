import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'No ID provided.' }, { status: 400 });

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, is_approved')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Session invalid.' }, { status: 404 });
    if (!data.is_approved) return Response.json({ error: 'Account not approved.' }, { status: 403 });

    return Response.json({ user: { id: data.id, name: data.name, role: data.role, registeredAt: data.registered_at, isApproved: data.is_approved } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
