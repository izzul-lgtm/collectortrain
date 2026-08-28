// app/api/whatsapp/link/route.js
// ─────────────────────────────────────────────────────────────────────────
// Setiap CollectorTrain user link akaun WhatsApp SENDIRI (bukan share 1
// akaun untuk semua orang). GET pulangkan status + QR (kalau tengah proses
// pairing) untuk USER YANG LOGIN SAHAJA — tak boleh tengok status/QR user
// lain. POST mula proses pairing (whatsapp-service di Railway yang poll
// dan generate QR sebenar, route ni cuma set status='requested').
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('whatsapp_user_links')
      .select('status, qr_data, phone_number')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (error) throw error;

    return Response.json({
      status: (data && data.status) || 'not_linked',
      qrData: (data && data.qr_data) || null,
      phoneNumber: (data && data.phone_number) || null,
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load WhatsApp link status.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();
    const { error } = await sb
      .from('whatsapp_user_links')
      .upsert({ user_id: authUser.id, status: 'requested', qr_data: null, updated_at: new Date().toISOString() });
    if (error) throw error;

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to request WhatsApp link.' }, { status: 500 });
  }
}
