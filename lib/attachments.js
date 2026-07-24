// lib/attachments.js
// ─────────────────────────────────────────────────────────────────────────
// Helper dikongsi untuk lampiran (attachment) pada mesej peribadi & discussion
// post. Fail sebenar disimpan dalam Supabase Storage bucket `attachments`
// (private); jadual `messages`/`discussion_posts` cuma simpan metadata
// (path, name, type, size) — lihat supabase/schema.sql untuk lajur & bucket.
//
// PURGE 48 JAM: fail dipadam automatik selepas 48 jam (lihat purgeOldAttachments
// di bawah, dipanggil dari app/api/cron/purge-attachments/route.js setiap hari)
// — ni untuk elak Storage membesar tanpa had ("elak system berat"), BUKAN
// untuk padam mesej/post itu sendiri, yang kekal selama-lamanya macam biasa.
import { supabaseAdmin } from './supabaseAdmin';

export const ATTACHMENT_BUCKET = 'attachments';
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const ATTACHMENT_TTL_MS = 48 * 60 * 60 * 1000; // 48 jam
export const ATTACHMENT_ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

// Signed URL sah 1 jam — cukup untuk satu sesi buka thread/discussion; kalau
// tamat, user cuma perlu refresh page untuk dapat link baru (GET route jana
// semula setiap kali dipanggil).
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Upload satu fail (dari request.formData()) ke Storage, return metadata
// untuk disimpan dalam lajur attachment_* jadual messages/discussion_posts.
// Throws Error dengan mesej BM yang boleh terus dihantar balik ke client.
export async function uploadAttachment(file, ownerId) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Fail tidak sah.');
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    throw new Error(`Fail terlalu besar. Had maksimum ${ATTACHMENT_MAX_BYTES / 1024 / 1024}MB.`);
  }
  const type = file.type || 'application/octet-stream';
  if (!ATTACHMENT_ALLOWED_TYPES.includes(type)) {
    throw new Error('Jenis fail tidak disokong. Guna imej, PDF, Word, Excel atau teks (.txt).');
  }

  const sb = supabaseAdmin();
  const safeName = (file.name || 'lampiran').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const path = `${ownerId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await sb.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, {
    contentType: type,
    upsert: false,
  });
  if (error) throw new Error('Gagal muat naik lampiran: ' + error.message);

  return { path, name: file.name || safeName, type, size: file.size };
}

// Tukar attachment_path (storage path, disimpan dalam DB) jadi signed URL
// sementara yang boleh terus diakses browser. Kalau path null/expired/fail,
// return null senyap-senyap (client tunjuk "lampiran tak lagi tersedia").
export async function toSignedUrl(path) {
  if (!path) return null;
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// Lampirkan { attachmentUrl } (signed URL, atau null) pada setiap row dalam
// senarai, berdasarkan row.attachment_path. Guna Promise.all supaya semua
// signed URL dijana serentak (bukan bersiri — laju lagi bila banyak lampiran).
export async function withSignedUrls(rows) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      attachmentUrl: row.attachment_path ? await toSignedUrl(row.attachment_path) : null,
    }))
  );
}

// Padam lampiran >48 jam dari table `table` (messages | discussion_posts):
// buang fail dari Storage, null-kan lajur attachment_* dalam DB. Mesej/post
// itu sendiri TIDAK dipadam — cuma lampirannya. Dipanggil dari cron job.
export async function purgeOldAttachments(table) {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - ATTACHMENT_TTL_MS).toISOString();

  const { data: rows, error } = await sb
    .from(table)
    .select('id, attachment_path')
    .not('attachment_path', 'is', null)
    .lt('created_at', cutoff);
  if (error) throw error;
  if (!rows || rows.length === 0) return { checked: 0, purged: 0 };

  const paths = rows.map((r) => r.attachment_path).filter(Boolean);
  if (paths.length) {
    // Storage remove() terima array — satu panggilan untuk semua fail expired.
    const { error: removeError } = await sb.storage.from(ATTACHMENT_BUCKET).remove(paths);
    // Jangan throw kalau remove gagal separuh (cth fail dah tak wujud) — kita
    // tetap nak clear lajur DB supaya UI berhenti cuba papar lampiran mati.
    if (removeError) console.error(`[purgeOldAttachments:${table}] storage remove error:`, removeError.message);
  }

  const ids = rows.map((r) => r.id);
  const { error: updateError } = await sb
    .from(table)
    .update({ attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null })
    .in('id', ids);
  if (updateError) throw updateError;

  return { checked: rows.length, purged: ids.length };
}
