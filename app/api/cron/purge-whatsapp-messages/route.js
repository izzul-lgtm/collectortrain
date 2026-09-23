// app/api/cron/purge-whatsapp-messages/route.js
// ─────────────────────────────────────────────────────────────────────────
// GET /api/cron/purge-whatsapp-messages
//
// Dipanggil SEKALI SEHARI oleh Vercel Cron (lihat "crons" dalam vercel.json)
// — padam baris `whatsapp_messages` yang lebih lama dari
// WHATSAPP_RETENTION_DAYS (default 90 hari).
//
// SEBAB WUJUD: tak macam `messages` (staf boleh Delete sendiri) atau
// attachment (auto-purge 48j), jadual `whatsapp_messages` auto-sync
// SENTIASA drpd whatsapp-service (Baileys) dan tiada cara untuk staf
// padam manual — kalau tiada cron ni, jadual ni membesar tanpa had
// selama-lamanya ("elak system berat"). GET /api/whatsapp/messages dah
// per-channel pagination (lihat route tu), tapi tu cuma hadkan berapa
// banyak DI-LOAD sekali — tak hadkan berapa banyak DISIMPAN dalam DB.
//
// TUKAR TEMPOH RETENTION: kalau syarikat ada polisi rekod/compliance yang
// perlukan tempoh lebih panjang drpd 90 hari (audit trail komunikasi
// debtor, dsb — lihat konteks /areas/audit-compliance.md), set env var
// WHATSAPP_RETENTION_DAYS ikut keperluan tu SEBELUM cron ni pertama kali
// jalan. JANGAN biarkan default 90 hari kalau ia lebih pendek drpd
// keperluan compliance korang.
//
// KESELAMATAN: sama pattern macam purge-attachments — route ni TAK guna
// requireAuth (Vercel Cron tak hantar x-session-token), check header
// Authorization terus, mesti sepadan CRON_SECRET (env var yang sama
// dipakai oleh purge-attachments — tak perlu env var baru).
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET belum diset di server (env var).' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const retentionDays = Math.max(parseInt(process.env.WHATSAPP_RETENTION_DAYS || '90', 10) || 90, 1);
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('whatsapp_messages')
      .delete()
      .lt('wa_timestamp', cutoffIso)
      .select('id');
    if (error) throw error;
    return Response.json({ ok: true, retentionDays, cutoff: cutoffIso, deleted: (data || []).length });
  } catch (e) {
    return Response.json({ error: e.message || 'Purge gagal.' }, { status: 500 });
  }
}
