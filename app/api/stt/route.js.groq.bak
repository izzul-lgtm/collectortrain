// Proxies audio ke Groq (Whisper large-v3-turbo) Speech-to-Text API.
// API key disimpan di server (env var) — tak pernah dedah ke browser.
//
// SWITCH DARI DEEPGRAM (lihat route.js.deepgram.bak untuk versi lama):
// Testing real Iz tunjuk Whisper large-v3-turbo jauh lebih accurate utk BM
// berbanding Deepgram nova-3/nova-2 untuk audio collector sebenar.
// Trade-off yang kita TERIMA bila tukar:
// - Tiada keyterm/keywords boosting macam Deepgram. Whisper cuma ada `prompt`
//   (max ~224 token, soft hint style/spelling, BUKAN guaranteed boost).
//   VOCAB_TERMS kekal, tapi jadi SATU ayat prompt — bukan per-term parameter.
// - Tiada smart_format (auto nombor/tarikh). Tak retain frasa tahun BM
//   sebagai keyterm sebab Whisper general multilingual model, biasanya lebih
//   konsisten translate nombor verbal → digit drpd Deepgram language=ms.
//   STT_CORRECTIONS (app.js) + convertBMNumbers (app.js) kekal sebagai
//   safety-net — tak diubah di sini.
// - Tiada skor "confidence" sebenar dari Whisper response_format=json.
//   confidence di bawah ialah STAND-IN (1 = ada transcript, 0 = kosong) —
//   cukup untuk logic existing client (cuma check transcript kosong/tak),
//   jangan anggap ia confidence score sebenar macam Deepgram.

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  // Rate limit: max 60 request/minit per user — protect Groq STT credit (cukup utk nego panjang ~30 giliran)
  const limitError = rateLimit(request, 'stt', { max: 60, windowMs: 60_000 });
  if (limitError) return limitError;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'GROQ_API_KEY belum diset di server (env var).' },
      { status: 500 }
    );
  }

  let audioBuffer;
  try {
    audioBuffer = await request.arrayBuffer();
  } catch {
    return Response.json({ error: 'Gagal baca audio dari request.' }, { status: 400 });
  }

  if (!audioBuffer || audioBuffer.byteLength === 0) {
    return Response.json({ error: 'Audio kosong.' }, { status: 400 });
  }

  // Groq /audio/transcriptions perlukan multipart/form-data dengan filename
  // (bukan raw body macam Deepgram) — kena map Content-Type browser ke
  // extension supaya Groq decode betul. Safari rakam audio/mp4, Firefox
  // audio/ogg, Chrome audio/webm — sama isu yang kita dah handle utk Deepgram.
  const rawContentType = request.headers.get('content-type') || 'audio/webm';
  const contentType = rawContentType.split(';')[0].trim(); // buang ";codecs=opus"
  const EXT_MAP = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/m4a': 'm4a',
  };
  const ext = EXT_MAP[contentType] || 'webm';

  // VOCAB HINT: gantian untuk keyterm Deepgram. Whisper prompt cuma "soft
  // guidance", jadi tumpukan pada brand/istilah yang paling kerap silap
  // dengar — jangan dump semua term + frasa tahun (boleh lebih 224 token
  // dan lemahkan signal). Frasa tahun tak diulang sini (lihat komen atas).
  const VOCAB_HINT =
    'Perbualan debt collection Bahasa Malaysia. Istilah: RedOne, Celcom, Digi, ' +
    'Maxis, U Mobile, CTOS, CCRIS, NPL, PTP, SPDCA, JomPay, FPX, Newvest, ' +
    'DCA, WhatsApp, AmBank, CIMB, Maybank, HLB, Public Bank, ringgit, hutang, ' +
    'ansuran, tertunggak, berjanji bayar.';

  async function callGroq(model) {
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
    form.append('model', model);
    form.append('language', 'ms');
    form.append('prompt', VOCAB_HINT);
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!upstream.ok) {
      const errText = await upstream.text();
      const err = new Error('Groq error: ' + errText);
      err.status = upstream.status;
      throw err;
    }
    const data = await upstream.json();
    const transcript = (data?.text || '').trim();
    return { transcript, confidence: transcript ? 1 : 0 };
  }

  try {
    let result;
    try {
      result = await callGroq('whisper-large-v3-turbo');
    } catch (turboErr) {
      // Fallback ke whisper-large-v3 (lebih perlahan, kadang lebih tepat
      // utk audio sukar) — pattern sama macam fallback nova-3→nova-2 lama.
      console.log('[STT] whisper-large-v3-turbo gagal, cuba fallback whisper-large-v3...', turboErr.message);
      result = await callGroq('whisper-large-v3');
    }

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: 'Ralat proxy STT: ' + err.message },
      { status: err.status || 500 }
    );
  }
}
