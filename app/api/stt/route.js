// Proxies audio ke Soniox Speech-to-Text (async transcription API).
//
// SWITCH BESAR DARI GROQ WHISPER (lihat route.js.groq.bak untuk versi lama):
// Kita satukan STT + TTS bawah SATU provider (Soniox) — sebelum ni STT guna
// Groq Whisper dan TTS guna Gemini, dua vendor berasingan, dua env var, dua
// gaya error/retry. Soniox pulak first-class speech-to-text company (bukan
// LLM provider yang "boleh buat" transcription macam Groq/Whisper), plus kini
// ada TTS sendiri — jadi satu API key (SONIOX_API_KEY) untuk voice pipeline
// penuh, satu tempat untuk tuning bahasa/vocab.
//
// Flow Soniox ASYNC transcription (bukan Realtime WebSocket — sebab client
// kita hantar SATU blob audio penuh lepas collector lepas mic, bukan stream
// berterusan, jadi async REST flow lagi sesuai berbanding kekalkan
// live WebSocket connection dalam serverless function):
//   1. POST /v1/files          → upload audio blob, dapat file_id
//   2. POST /v1/transcriptions → create job dgn file_id + config, dapat id
//   3. GET  /v1/transcriptions/{id}          → poll sampai status=completed
//   4. GET  /v1/transcriptions/{id}/transcript → ambil teks + tokens
//   5. DELETE file + transcription           → cleanup (fire-and-forget)
//
// Trade-off yang kita TERIMA bila tukar dari Groq:
// - Ada overhead rangkaian extra (upload → create → poll → fetch, ~4-5 round
//   trip berbanding 1 call terus Groq). Untuk clip pendek (beberapa saat
//   percakapan), biasanya siap dalam 1-3 saat polling — boleh diterima untuk
//   flow push-to-talk yang dah pun tunjuk "Transcribing..." state kat UI.
// - Vocab boost sekarang guna `context.terms` (list eksplisit) + `context.general`
//   (key/value pasangan domain/topic) — lebih kuat & struktur berbanding
//   Whisper `prompt` (soft hint dlm 1 ayat). VOCAB_TERMS kekal sebagai array,
//   bukan digabung jadi satu ayat.
// - `language_hints` (bias, BUKAN restrict) gantikan `language` param Groq
//   yang restrict terus ke 'ms'. Kita letak ['ms','en'] sebab collector kadang
//   rojak BM-Inggeris dalam satu ayat — Soniox handle code-switch dgn baik.
// - Tiada skor "confidence" sebenar dari transcript — confidence di bawah
//   kekal STAND-IN (1 = ada transcript, 0 = kosong) sama macam Groq dulu.
//   STT_CORRECTIONS + convertBMNumbers (app.js) kekal sebagai safety-net.

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';

const SONIOX_BASE = 'https://api.soniox.com';

// Model async terkini — lihat soniox.com/docs/stt/models untuk versi baru.
const STT_MODEL = 'stt-async-v5';

// VOCAB TERMS: istilah/brand yang paling kerap silap dengar dalam panggilan
// debt collection BM. Dihantar sebagai `context.terms` (list eksplisit, bukan
// satu ayat prompt macam Whisper) — Soniox boost setiap term individu.
const VOCAB_TERMS = [
  'RedOne', 'Celcom', 'Digi', 'Maxis', 'U Mobile', 'CTOS', 'CCRIS', 'NPL',
  'PTP', 'SPDCA', 'JomPay', 'FPX', 'Newvest', 'DCA', 'WhatsApp',
  'AmBank', 'CIMB', 'Maybank', 'HLB', 'Public Bank',
  'ringgit', 'hutang', 'ansuran', 'tertunggak', 'berjanji bayar',
];

// Poll setiap 400ms, timeout selepas ~20 saat (clip collector biasanya jauh
// lebih pendek — ni just safety net elak function serverless hang selamanya).
const POLL_INTERVAL_MS = 400;
const POLL_TIMEOUT_MS = 20_000;

function sonioxHeaders(apiKey, extra) {
  return { Authorization: `Bearer ${apiKey}`, ...(extra || {}) };
}

async function sonioxJson(path, apiKey, opts = {}) {
  const res = await fetch(`${SONIOX_BASE}${path}`, {
    ...opts,
    headers: sonioxHeaders(apiKey, opts.headers),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Soniox ${path} error (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Best-effort cleanup — jangan biar kegagalan delete rosakkan response utama.
function cleanup(transcriptionId, fileId, apiKey) {
  const jobs = [];
  if (transcriptionId) {
    jobs.push(sonioxJson(`/v1/transcriptions/${transcriptionId}`, apiKey, { method: 'DELETE' }));
  }
  if (fileId) {
    jobs.push(sonioxJson(`/v1/files/${fileId}`, apiKey, { method: 'DELETE' }));
  }
  Promise.allSettled(jobs).then((results) => {
    results.forEach((r) => {
      if (r.status === 'rejected') console.log('[STT] cleanup gagal (non-fatal):', r.reason?.message);
    });
  });
}

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  // Rate limit: max 60 request/minit per user — protect Soniox STT credit.
  const limitError = rateLimit(request, 'stt', { max: 60, windowMs: 60_000 });
  if (limitError) return limitError;

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'SONIOX_API_KEY belum diset di server (env var).' },
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

  // Soniox auto-detect format dari isi fail — tapi masih perlukan filename
  // dgn extension yang munasabah utk multipart upload (Safari mp4, Firefox
  // ogg, Chrome webm — isu sama yang kita handle utk Groq/Deepgram dulu).
  const rawContentType = request.headers.get('content-type') || 'audio/webm';
  const contentType = rawContentType.split(';')[0].trim();
  const EXT_MAP = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/m4a': 'm4a',
  };
  const ext = EXT_MAP[contentType] || 'webm';

  let fileId = null;
  let transcriptionId = null;

  try {
    // 1) Upload fail audio.
    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([audioBuffer], { type: contentType }), `audio.${ext}`);
    const uploaded = await sonioxJson('/v1/files', apiKey, { method: 'POST', body: uploadForm });
    fileId = uploaded.id;

    // 2) Create transcription job.
    const created = await sonioxJson('/v1/transcriptions', apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: STT_MODEL,
        file_id: fileId,
        language_hints: ['ms', 'en'],
        context: {
          general: [
            { key: 'domain', value: 'Debt collection' },
            { key: 'topic', value: 'Panggilan negosiasi hutang Bahasa Malaysia' },
          ],
          terms: VOCAB_TERMS,
        },
      }),
    });
    transcriptionId = created.id;

    // 3) Poll sampai siap.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = created.status;
    while (status !== 'completed') {
      if (status === 'error') {
        throw new Error('Soniox transcription gagal: ' + (created.error_message || 'unknown'));
      }
      if (Date.now() > deadline) {
        throw new Error('Soniox transcription timeout (>20s).');
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const polled = await sonioxJson(`/v1/transcriptions/${transcriptionId}`, apiKey);
      status = polled.status;
      if (status === 'error') {
        throw new Error('Soniox transcription gagal: ' + (polled.error_message || 'unknown'));
      }
    }

    // 4) Ambil transcript.
    const result = await sonioxJson(`/v1/transcriptions/${transcriptionId}/transcript`, apiKey);
    const transcript = (result?.text || '').trim();

    // 5) Cleanup (tak tunggu — jangan lambatkan response ke collector).
    cleanup(transcriptionId, fileId, apiKey);

    return Response.json({ transcript, confidence: transcript ? 1 : 0 });
  } catch (err) {
    // Cuba cleanup apa-apa resource yang sempat dicipta walaupun gagal di tengah jalan.
    cleanup(transcriptionId, fileId, apiKey);
    console.error('[STT] ralat:', err.message);
    return Response.json(
      { error: 'Ralat proxy STT: ' + err.message },
      { status: err.status || 500 }
    );
  }
}
