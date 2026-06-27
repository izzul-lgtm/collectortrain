// app/api/parse-document/route.js
// ─────────────────────────────────────────────────────────────────────────
// "Import" job sheet butang dalam AI Scenario Builder — manager upload
// terus fail (PDF/TXT/CSV) dari CRM export, instead of copy-paste manual.
// Route ni extract teks dari fail kat SERVER (supaya tak perlu hantar
// library besar pdf-parse ke browser), pulangkan teks plain untuk diisi
// ke textarea di client — redaction PII tetap jalan di browser SELEPAS
// ni (lihat redactJobSheet/redactPII dalam app.js), bukan di sini.
import { requireAuth } from '../../../lib/requireAuth';

export const runtime = 'nodejs'; // pdf-parse perlukan Node.js runtime, bukan Edge

export async function POST(request) {
  // Sama macam AI Scenario Builder — manager/admin sahaja boleh import job sheet.
  const authError = await requireAuth(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB — job sheet/case history biasanya beberapa KB-ratus KB je
    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'File too large (max 10MB).' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = (file.name || '').toLowerCase();
    let text = '';

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(buf);
      text = result.text || '';
    } else if (name.endsWith('.txt') || name.endsWith('.csv') || file.type.startsWith('text/')) {
      text = buf.toString('utf-8');
    } else {
      return Response.json({ error: 'Unsupported file type. Please upload a PDF, TXT, or CSV file.' }, { status: 400 });
    }

    text = text.trim();
    if (!text) {
      return Response.json({ error: 'No readable text found in this file. If it is a scanned/image PDF, please copy-paste the text manually instead.' }, { status: 422 });
    }

    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to read file.' }, { status: 500 });
  }
}
