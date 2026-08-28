// app/api/whatsapp/send/route.js
// ─────────────────────────────────────────────────────────────────────────
// Terima notis dari CollectorTrain (SEMUA role — tiada roles restriction,
// sengaja ikut keputusan: "semua role termasuk Collector" boleh post) dan
// masukkan dalam queue `whatsapp_outbox`. Route ni TIDAK hantar terus ke
// WhatsApp — whatsapp-service (Railway, ada live socket connection) yang
// poll queue ni dan hantar sebenar. Kalau nak had akses ni lagi (contoh
// admin/manager sahaja), tambah { roles: [...] } kat requireAuthWithUser
// di bawah.
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const jid = (body.jid || '').trim();
    const text = (body.text || '').trim();
    if (!jid || !text) {
      return Response.json({ error: 'jid dan text diperlukan.' }, { status: 400 });
    }
    if (text.length > 4000) {
      return Response.json({ error: 'Notis terlalu panjang (max 4000 aksara).' }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Sahkan jid tu memang salah satu channel yang dibenarkan (senarai ni
    // di-sync oleh whatsapp-service dari ALLOWED_JIDS) — jangan benarkan
    // hantar ke jid sembarangan biarpun request datang dari user sah.
    const { data: channel, error: chErr } = await sb
      .from('whatsapp_channels')
      .select('jid')
      .eq('jid', jid)
      .maybeSingle();
    if (chErr) throw chErr;
    if (!channel) {
      return Response.json({ error: 'Channel/community tidak dikenali atau tidak dibenarkan.' }, { status: 400 });
    }

    // Setiap user hantar guna akaun WhatsApp SENDIRI (bukan akaun shared)
    // — kena dah link & connected dulu sebelum boleh compose.
    const { data: link, error: linkErr } = await sb
      .from('whatsapp_user_links')
      .select('status')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link || link.status !== 'connected') {
      return Response.json({ error: 'WhatsApp anda belum di-link. Sila link WhatsApp anda dahulu di bahagian atas page ini.' }, { status: 400 });
    }

    const { data: userRow, error: userErr } = await sb
      .from('users')
      .select('name')
      .eq('id', authUser.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const { data, error } = await sb
      .from('whatsapp_outbox')
      .insert({ jid, text, posted_by: authUser.id, posted_by_name: (userRow && userRow.name) || authUser.id, status: 'pending' })
      .select()
      .single();
    if (error) throw error;

    return Response.json({ outbox: data });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to queue WhatsApp notice.' }, { status: 500 });
  }
}
