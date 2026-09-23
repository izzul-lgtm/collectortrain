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
//
// GET ?jid=<channelJid>&limit=&before=  -> mesej PER-CHANNEL (default 200
// TERKINI, max 300), guna `before=<wa_timestamp>` untuk load batch lama
// seterusnya. Tanpa `jid`, server pilih channel PERTAMA yang user ni ahli
// (activeJid dipulangkan dalam response) supaya first-load tak perlu
// round-trip tambahan sekadar untuk tahu jid apa nak guna.
//
// Sebab tukar dari fetch GLOBAL (semua channel sekali, cap 300 shared): satu
// channel yang sibuk boleh "makan" kesemua 300 slot, channel lain jadi
// kosong walaupun sebenarnya ada history — sekarang setiap channel dapat
// had sendiri.
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const requestedJid = searchParams.get('jid');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 300);
  const before = searchParams.get('before');

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
      return Response.json({ locked: true, myStatus, messages: [], activeJid: null, hasMore: false, status: 'unknown', channels: [] });
    }

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

    // Tapis dropdown compose ikut keahlian SEBENAR user ni — tanpa ni,
    // dia boleh pilih & cuba hantar ke group yang nombor dia bukan ahli,
    // dan WhatsApp akan reject "forbidden" (gagal senyap dari sudut UI).
    // Kalau belum ada row keahlian langsung utk user ni (sync belum
    // sempat jalan lepas connect), fallback tunjuk semua supaya tak
    // sekat compose selama-lamanya — whatsapp-service sync tu cepat
    // (lepas connect terus), so ni patut jarang berlaku.
    const { data: memberships, error: memErr } = await sb
      .from('whatsapp_user_channels')
      .select('jid, is_member')
      .eq('user_id', authUser.id);
    if (memErr) throw memErr;
    const composeChannels = (memberships && memberships.length > 0)
      ? channels.filter(c => memberships.some(m => m.jid === c.jid && m.is_member))
      : (channels || []);

    // ── Tentukan jid AKTIF: guna yang diminta client (kalau sah/dibenarkan),
    // atau default channel PERTAMA yang user ni ahli. ──
    const candidateList = composeChannels.length ? composeChannels : (channels || []);
    const allowedJids = new Set(candidateList.map(c => c.jid));
    const activeJid = (requestedJid && allowedJids.has(requestedJid))
      ? requestedJid
      : (candidateList[0] ? candidateList[0].jid : null);

    let messages = [];
    let hasMore = false;
    if (activeJid) {
      // Order DESCENDING dulu supaya LIMIT ambil mesej TERKINI, baru
      // reverse balik ke ascending untuk papar (lama→baru). (Bug lama:
      // order ascending + limit terus ambil mesej PALING LAMA — lepas
      // channel > cap, page "beku" pada mesej lama selama-lamanya.)
      let msgQuery = sb.from('whatsapp_messages').select('*').eq('jid', activeJid).order('wa_timestamp', { ascending: false }).limit(limit);
      if (before) msgQuery = msgQuery.lt('wa_timestamp', before);
      const { data: page, error: msgErr } = await msgQuery;
      if (msgErr) throw msgErr;
      messages = (page || []).slice().reverse();
      hasMore = (page || []).length === limit;
    }

    return Response.json({
      locked: false,
      // Nombor kita SENDIRI (viewer semasa) — frontend banding dengan
      // m.sender_jid setiap mesej untuk tentukan "ni betul2 AKU hantar"
      // (hijau/kanan) vs "member lain dalam team hantar guna nombor DIA"
      // (putih/kiri, walaupun m.from_me=true dari sudut WhatsApp global).
      myPhone: myLink?.phone_number || null,
      messages,
      activeJid,
      hasMore,
      status: (meta && meta.status) || 'unknown',
      channels: composeChannels,
    });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load WhatsApp channel.' }, { status: 500 });
  }
}
