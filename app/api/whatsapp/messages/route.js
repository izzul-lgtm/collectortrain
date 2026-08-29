// app/api/whatsapp/messages/route.js
// ─────────────────────────────────────────────────────────────────────────
// READ-ONLY dengan sengaja — cuma export GET, tiada POST/DELETE. Mesej
// masuk ke jadual whatsapp_messages melalui whatsapp-service (Railway,
// Baileys) sahaja, bukan melalui app ni.
//
// GATE: sengaja tak terus bagi semua orang authenticated tengok isi group/
// channel. Content (mesej + nama group) cuma didedahkan lepas user tu
// SENDIRI dah link & scan QR (status='connected') — sebelum tu, pulangkan
// { locked:true } tanpa messages/channels langsung. Ni bukan sekadar UI
// hide; kalau tak link, data memang tak keluar dari route ni pun.
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();

    const { data: myLink, error: myLinkErr } = await sb
      .from('whatsapp_user_links')
      .select('status, phone_number')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (myLinkErr) throw myLinkErr;

    const myStatus = (myLink && myLink.status) || 'not_linked';
    if (myStatus !== 'connected') {
      return Response.json({ locked: true, myStatus, messages: [], status: 'unknown', channels: [] });
    }

    const { data: messages, error: msgErr } = await sb
      .from('whatsapp_messages')
      .select('*')
      .order('wa_timestamp', { ascending: true })
      .limit(300);
    if (msgErr) throw msgErr;

    const { data: meta, error: metaErr } = await sb
      .from('whatsapp_channel_meta')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (metaErr) throw metaErr;

    const { data: channels, error: chErr } = await sb
      .from('whatsapp_channels')
      .select('jid, label')
      .order('label', { ascending: true });
    if (chErr) throw chErr;

    return Response.json({
      locked: false,
      // Nombor kita SENDIRI (viewer semasa) — frontend banding dengan
      // m.sender_jid setiap mesej untuk tentukan "ni betul2 AKU hantar"
      // (hijau/kanan) vs "member lain dalam team hantar guna nombor DIA"
      // (putih/kiri, walaupun m.from_me=true dari sudut WhatsApp global).
      myPhone: myLink?.phone_number || null,
      messages: messages || [],
      status: (meta && meta.status) || 'unknown',
      channels: channels || [],
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load WhatsApp channel.' }, { status: 500 });
  }
}
