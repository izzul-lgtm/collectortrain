// app/api/whatsapp/outbox-status/route.js
// ─────────────────────────────────────────────────────────────────────────
// Bagi frontend check balik SAMA ADA notis yang dia baru queue (POST
// /api/whatsapp/send) betul-betul berjaya dihantar oleh whatsapp-service,
// atau gagal senyap (contoh: WhatsApp user tu tak connected / bukan ahli
// group). Tanpa ni, UI cuma clear textarea lepas insert ke outbox dan
// user ingat dah terhantar walhal whatsapp-service gagal proses row tu.
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });

    const sb = supabaseAdmin();
    // Scope ke posted_by = authUser.id sahaja — jangan bagi user lain
    // intip status notis orang lain.
    const { data, error } = await sb
      .from('whatsapp_outbox')
      .select('id, status, error')
      .eq('id', id)
      .eq('posted_by', authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Notis tidak dijumpai.' }, { status: 404 });

    return Response.json({ status: data.status, error: data.error || null });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to check notice status.' }, { status: 500 });
  }
}
