// app/api/attachments/route.js
// ─────────────────────────────────────────────────────────────────────────
// POST /api/attachments  (multipart/form-data, field "file")
//   -> upload SATU fail ke Supabase Storage (bucket private `attachments`),
//      return metadata { path, name, type, size }.
//
// Bukan sebahagian daripada POST /api/messages atau /api/discussion sengaja
// — dipisahkan supaya client boleh upload fail dulu (dapat "path"), pastikan
// upload berjaya, BARU hantar mesej/post sebenar dengan path tu sekali.
// Kalau upload gagal, mesej/post terus tak dihantar (elak mesej "separuh
// jalan" — ada teks tapi lampiran hilang senyap-senyap).
//
// Rate limit sama macam claude route — elak abuse storage (spam upload).
import { requireAuthWithUser } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';
import { uploadAttachment } from '../../../lib/attachments';

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  const limitError = rateLimit(request, 'attachments', { max: 20, windowMs: 60_000 });
  if (limitError) return limitError;

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Request bukan multipart/form-data yang sah.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file) {
    return Response.json({ error: "Field 'file' diperlukan." }, { status: 400 });
  }

  try {
    const attachment = await uploadAttachment(file, authUser.id);
    return Response.json({ attachment });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal muat naik lampiran.' }, { status: 400 });
  }
}
