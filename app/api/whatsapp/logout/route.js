// app/api/whatsapp/logout/route.js
// ─────────────────────────────────────────────────────────────────────────
// Logout WhatsApp untuk user YANG LOGIN SAHAJA (tak boleh logout akaun
// orang lain). Route ni TIDAK terus logout — cuma set status jadi
// 'logout_requested', whatsapp-service (Railway, ada socket sebenar) yang
// poll status ni dan buat logout BETUL: usock.logout() + padam auth files
// local + padam backup session di Supabase Storage, baru set 'not_linked'.
//
// Sebab tak buat terus di sini: route Next.js ni tiada akses socket
// Baileys yang live (socket tu wujud dalam proses whatsapp-service),
// jadi kena minta service tu yang laksanakan — sama pattern macam
// POST /api/whatsapp/link (set status='requested', service yang proses).
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();

    const { data: existing, error: getErr } = await sb
      .from('whatsapp_user_links')
      .select('status')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (getErr) throw getErr;

    // Tiada apa nak di-logout — jangan buat apa-apa (elak isi row baru
    // dengan status pelik untuk user yang memang tak pernah link).
    if (!existing || existing.status === 'not_linked') {
      return Response.json({ ok: true, status: 'not_linked' });
    }

    const { error } = await sb
      .from('whatsapp_user_links')
      .upsert({ user_id: authUser.id, status: 'logout_requested', qr_data: null, updated_at: new Date().toISOString() });
    if (error) throw error;

    return Response.json({ ok: true, status: 'logout_requested' });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to request WhatsApp logout.' }, { status: 500 });
  }
}
