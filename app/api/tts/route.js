// Proxies text-to-speech ke Gemini 3.1 Flash TTS API.
//
// PERUBAHAN (fix "AI is speaking..." stuck/Pending): Versi sebelum ni guna
// streamGenerateContent?alt=sse sebab nak voice keluar lebih awal (chunk by
// chunk). Tapi dokumentasi rasmi Gemini TTS terkini
// (ai.google.dev/gemini-api/docs/speech-generation, updated 2026-05-18)
// sebut dengan jelas: "TTS does not support streaming". Sebab tu request
// streamGenerateContent kita hang — upstream Gemini tak reply headers pun,
// jadi network tab tunjuk "Pending" selama-lamanya dan client stuck di
// state "AI is speaking..." (audioQueue tak pernah resolve).
//
// Balik guna generateContent biasa (non-streaming): tunggu Gemini siap jana
// SELURUH audio, decode base64 -> raw PCM bytes, return SATU response kepada
// client. Client (playNext() dalam app.js) TAK PERLU diubah — dia baca
// reader.read() dalam loop macam biasa, cuma sekarang dapat satu chunk besar
// drpd byte-byte kecil. Hilang sikit "main awal sementara jana" feel, tapi
// voice keluar balik (drpd stuck pending terus).
//
// Format raw PCM yang Gemini TTS pulangkan: 16-bit signed little-endian,
// mono, 24000 Hz — client kena tahu format ni untuk decode (lihat
// playNext() dalam app.js — hardcode 24000/16-bit/mono).

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';

const GEMINI_VOICES = {
  male:   ['Orus','Fenrir','Charon','Puck'],
  female: ['Kore','Aoede','Leda','Zephyr']
};

const usedVoicesMap = { male: [], female: [] };

function pickGeminiVoice(gender) {
  const g = gender === 'female' ? 'female' : 'male';
  const pool = GEMINI_VOICES[g];
  let available = pool.filter(v => !usedVoicesMap[g].includes(v));
  if (!available.length) { usedVoicesMap[g] = []; available = pool; }
  const picked = available[Math.floor(Math.random() * available.length)];
  usedVoicesMap[g].push(picked);
  return picked;
}

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  // Rate limit: max 40 request/minit per user — protect Gemini TTS credit (cukup untuk nego panjang ~20 giliran)
  const limitError = rateLimit(request, 'tts', { max: 40, windowMs: 60_000 });
  if (limitError) return limitError;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY belum diset.' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Body tidak sah.' }, { status: 400 }); }

  const { text, gender, geminiVoice } = body || {};
  if (!text) return Response.json({ error: "'text' diperlukan." }, { status: 400 });

  const safeText = String(text).slice(0, 200);
  const voice = geminiVoice || pickGeminiVoice(gender || 'male');

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: safeText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice }
              }
            }
          }
        })
      }
    );
  } catch (err) {
    console.error('TTS proxy error (fetch):', err);
    return Response.json({ error: 'Ralat proxy TTS: ' + err.message }, { status: 500 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error('Gemini TTS error:', errText);
    return Response.json({ error: 'Gemini TTS error: ' + errText }, { status: upstream.status });
  }

  let json;
  try {
    json = await upstream.json();
  } catch (err) {
    console.error('Gagal parse response Gemini TTS:', err);
    return Response.json({ error: 'Respons Gemini TTS tidak sah (bukan JSON).' }, { status: 500 });
  }

  const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) {
    // Limitation rasmi Gemini: model occasionally pulang text token instead
    // of audio (random, kadar kecil) -> minta client retry.
    console.error('Tiada audio dalam response Gemini TTS:', JSON.stringify(json).slice(0, 300));
    return Response.json({ error: 'Gemini TTS tidak pulangkan audio — sila cuba lagi.' }, { status: 500 });
  }

  const pcmBytes = Buffer.from(b64, 'base64');

  return new Response(pcmBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      // Metadata format PCM untuk client (playNext() dalam app.js hardcode
      // nilai yang sama, tapi header ni bagi dokumentasi/future-proofing).
      'X-Audio-Sample-Rate': '24000',
      'X-Audio-Channels': '1',
      'X-Audio-Bit-Depth': '16'
    }
  });
}
