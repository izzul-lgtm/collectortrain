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

// pdf-parse default text extraction loses COLUMN layout (setiap perkataan
// jadi line sendiri, label & value yang sepatutnya sebaris jadi berjauhan)
// — ni punca redaction key-based di browser gagal (label & value terpisah,
// jadi regex "LABEL : value" tak match, PII tak ter-redact). Fix: render
// teks guna KOORDINAT x/y setiap perkataan dalam PDF supaya susunan lajur
// (macam command line `pdftotext -layout`) dikekalkan — perkataan pada
// baris/y yang sama disambung sebaris (gap besar = jarak lajur → multiple
// space, sama macam asal), bukan setiap satu jadi baris berasingan.
function renderPageWithLayout(pageData) {
  return pageData.getTextContent().then((textContent) => {
    const items = textContent.items
      .filter((it) => it.str !== undefined)
      .slice()
      .sort((a, b) => {
        const ay = a.transform[5], by = b.transform[5];
        if (Math.abs(ay - by) > 2) return by - ay; // PDF y-axis: atas = nilai lebih tinggi
        return a.transform[4] - b.transform[4]; // kiri ke kanan dalam baris yang sama
      });
    let text = '';
    let prevY = null, prevXEnd = null;
    for (const item of items) {
      const x = item.transform[4], y = item.transform[5];
      const height = item.height || 10;
      if (prevY === null) {
        text += item.str;
      } else if (Math.abs(y - prevY) > 2) {
        text += '\n' + item.str; // baris baru
      } else {
        const gap = x - prevXEnd;
        if (gap > height * 1.5) text += '   ' + item.str; // jarak besar = sempadan lajur seterusnya
        else if (gap > 1) text += ' ' + item.str;
        else text += item.str;
      }
      prevY = y;
      prevXEnd = x + (item.width || 0);
    }
    return text + '\n\n';
  });
}

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
      const result = await pdfParse(buf, { pagerender: renderPageWithLayout });
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
