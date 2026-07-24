// app/api/cron/purge-attachments/route.js
// ─────────────────────────────────────────────────────────────────────────
// GET /api/cron/purge-attachments
//
// Dipanggil SEKALI SEHARI oleh Vercel Cron (lihat "crons" dalam vercel.json)
// — padam lampiran mesej/discussion yang berumur >48 jam dari Storage,
// supaya bucket tak membesar tanpa had ("elak system berat"). Mesej/post
// itu sendiri TIDAK dipadam, cuma lampirannya.
//
// KEsELAMATAN: route ni TAK guna requireAuth (Vercel Cron tak hantar
// x-session-token) — sebaliknya check header Authorization terus, mesti
// sepadan CRON_SECRET (env var). TANPA CRON_SECRET diset, route ni tutup
// terus (403) — jangan tinggalkan endpoint padam-fail terbuka kat public.
//
// Setup (sekali sahaja):
//   1. Vercel dashboard → project → Settings → Environment Variables
//      → tambah CRON_SECRET = <rentetan rawak panjang, cth generate dengan
//      `openssl rand -hex 32>`
//   2. Deploy semula — Vercel Cron (dalam vercel.json) automatik hantar
//      header "Authorization: Bearer <CRON_SECRET>" bila ia panggil route
//      cron pada jadual yang ditetapkan.
import { purgeOldAttachments } from '../../../../lib/attachments';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET belum diset di server (env var).' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const [messages, discussion] = await Promise.all([
      purgeOldAttachments('messages'),
      purgeOldAttachments('discussion_posts'),
    ]);
    return Response.json({ ok: true, messages, discussion });
  } catch (e) {
    return Response.json({ error: e.message || 'Purge gagal.' }, { status: 500 });
  }
}
