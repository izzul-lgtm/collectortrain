// app/api/whatsapp/messages/route.js
// ─────────────────────────────────────────────────────────────────────────
// READ-ONLY dengan sengaja — cuma export GET, tiada POST/DELETE. Mesej
// masuk ke jadual whatsapp_messages melalui whatsapp-service (Railway,
// Baileys) sahaja, bukan melalui app ni. Semua role authenticated boleh
// baca (macam announcements) — ni untuk viewing channel/community sahaja,
// tiada keupayaan reply/hantar.
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();

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
      messages: messages || [],
      status: (meta && meta.status) || 'unknown',
      channels: channels || [],
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load WhatsApp channel.' }, { status: 500 });
  }
}
