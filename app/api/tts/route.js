// Proxies text-to-speech ke Soniox TTS REST API.
//
// SWITCH BESAR DARI GEMINI (lihat route.js.gemini.bak untuk versi lama):
// Satukan TTS + STT bawah SATU provider (Soniox) — satu SONIOX_API_KEY untuk
// voice pipeline penuh. Bonus besar: Soniox TTS REST boleh output MP3 TERUS
// (`audio_format: 'mp3'`), jadi kita TAK PERLU lagi:
//   - parse SSE event demi event macam Gemini streamGenerateContent
//   - decode base64 → raw PCM 16-bit manual
//   - encode PCM → MP3 guna lamejs (dependency @breezystack/lamejs dibuang)
// Response body Soniox untuk audio_format=mp3 ialah MP3 bytes terus dengan
// Content-Type: audio/mpeg — kita cuma proxy stream tu terus ke client,
// client punya MediaSource Extensions (MSE) code di app.js TAK BERUBAH
// (dia expect 'audio/mpeg' progresif chunks, sama macam sebelum ni).
//
// Endpoint: POST https://tts-rt.soniox.com/tts (REST, bukan WebSocket —
// sesuai sebab kita ada teks penuh sebelum hantar, bukan streaming dari LLM
// token demi token).

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';

const TTS_MODEL = 'tts-rt-v1';
const TTS_LANGUAGE = 'ms'; // Bahasa Malaysia — lihat soniox.com/docs/tts/models untuk senarai bahasa

// Suara Soniox (12 voice, sama untuk semua 60+ bahasa termasuk BM) — dibahagi
// male/female ikut nama. Lihat soniox.com/docs/tts/concepts/voices.
const SONIOX_VOICES = {
  male:   ['Daniel', 'Noah', 'Jack', 'Adrian', 'Owen', 'Kenji'],
  female: ['Maya', 'Nina', 'Emma', 'Claire', 'Grace', 'Mina'],
};

const usedVoicesMap = { male: [], female: [] };

function pickSonioxVoice(gender) {
  const g = gender === 'female' ? 'female' : 'male';
  const pool = SONIOX_VOICES[g];
  let available = pool.filter(v => !usedVoicesMap[g].includes(v));
  if (!available.length) { usedVoicesMap[g] = []; available = pool; }
  const picked = available[Math.floor(Math.random() * available.length)];
  usedVoicesMap[g].push(picked);
  return picked;
}

export async function POST(request) {
  try {
    return await handleTts(request);
  } catch (err) {
    // SAFETY NET: apa-apa error yang terlepas dari try/catch dalam
    // handleTts() akan ditangkap sini — supaya browser dapat JSON error yang
    // boleh dibaca, bukan generic Next.js "500 This page couldn't load" HTML.
    console.error('TTS route fatal error:', err && err.stack || err);
    return Response.json(
      { error: 'TTS fatal error: ' + (err && err.message ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

async function handleTts(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  // Rate limit: max 40 request/minit per user — protect Soniox TTS credit.
  const limitError = rateLimit(request, 'tts', { max: 40, windowMs: 60_000 });
  if (limitError) return limitError;

  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'SONIOX_API_KEY belum diset.' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Body tidak sah.' }, { status: 400 }); }

  const { text, gender, sonioxVoice } = body || {};
  if (!text) return Response.json({ error: "'text' diperlukan." }, { status: 400 });

  const safeText = String(text).slice(0, 400);
  const voice = sonioxVoice || pickSonioxVoice(gender || 'male');

  let upstream;
  try {
    upstream = await fetch('https://tts-rt.soniox.com/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        language: TTS_LANGUAGE,
        voice,
        audio_format: 'mp3',
        text: safeText,
      }),
    });
  } catch (err) {
    console.error('TTS proxy error (fetch):', err);
    return Response.json({ error: 'Ralat proxy TTS: ' + err.message }, { status: 500 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    console.error('Soniox TTS error:', errText);
    return Response.json({ error: 'Soniox TTS error: ' + errText }, { status: upstream.status || 500 });
  }

  // Soniox dah hantar MP3 bytes progresif terus — proxy stream mentah,
  // tiada transformasi/encoding tambahan diperlukan di server kita.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
