// Proxies text-to-speech ke Gemini 3.1 Flash TTS API — STREAMING.
// Emotion/style dihandle melalui audio tags dalam text ([angry], [sad], dll)
// Style instruction guna systemInstruction field yang berasingan dari text.
//
// PERUBAHAN DARI VERSI NON-STREAMING (generateContent):
// Versi lama tunggu Gemini generate SELURUH audio dulu, convert ke WAV
// (pcmToWav, perlukan saiz buffer penuh diketahui awal utk header WAV),
// baru return SATU blob kepada client. Client pun tunggu res.blob() siap
// sebelum boleh play() — collector rasa voice "lambat" sebab kena tunggu:
//   [LLM siap jana text] -> [papar bubble] -> [Gemini siap jana SEMUA audio]
//   -> [server convert ke WAV] -> [client download blob penuh] -> [play]
// Sekarang guna streamGenerateContent?alt=sse — Gemini hantar audio dalam
// beberapa chunk PCM (raw, TANPA WAV header — WAV header perlukan saiz
// total diketahui awal, tak boleh untuk streaming). Server proxy SETIAP
// chunk terus ke client SEBAIK ia sampai dari Gemini (tak buffer/tunggu),
// client (playNext() dalam app.js) main chunk tu guna Web Audio API
// sebaik terima — voice boleh mula bunyi jauh lebih awal drpd tunggu
// seluruh audio siap.
//
// Format raw PCM yang Gemini TTS pulangkan (sama macam versi lama):
// 16-bit signed little-endian, mono, 24000 Hz — client kena tahu format
// ni untuk decode (lihat playNext() dalam app.js — hardcode 24000/16-bit/mono).

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    console.error('TTS stream proxy error (fetch):', err);
    return Response.json({ error: 'Ralat proxy TTS: ' + err.message }, { status: 500 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    console.error('Gemini TTS stream error:', errText);
    return Response.json({ error: 'Gemini TTS error: ' + errText }, { status: upstream.status });
  }
  if (!upstream.body) {
    return Response.json({ error: 'Gemini TTS tiada response body untuk stream.' }, { status: 500 });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Parse event SSE ("data: {...}\n\n") satu-satu dari upstream, extract
  // base64 PCM chunk dari setiap event, decode, terus enqueue raw bytes ke
  // client — TIDAK tunggu upstream habis dulu (itu yang buat streaming ni
  // beza dari versi generateContent biasa).
  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = done ? '' : (events.pop() || '');

      for (const evt of events) {
        const line = evt.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const b64 = parsed?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (b64) controller.enqueue(new Uint8Array(Buffer.from(b64, 'base64')));
        } catch (parseErr) {
          console.error('Gagal parse SSE chunk Gemini TTS:', parseErr, jsonStr.slice(0, 200));
        }
      }

      if (done) controller.close();
    },
    cancel() {
      reader.cancel();
    }
  });

  return new Response(stream, {
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
