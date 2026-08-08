// Proxies text-to-speech ke Gemini 3.1 Flash TTS API.
//
// UPDATE (Ogos 2026): Google tambah balik streaming support khas untuk
// gemini-3.1-flash-tts-preview pada 17 Jun 2026 (lihat changelog rasmi:
// ai.google.dev/gemini-api/docs/changelog#june-17-2026 —
// "Streaming support for speech generation ... now supported for the
// gemini-3.1-flash-tts-preview model"). Sebelum ni kita revert ke
// generateContent (non-streaming) sebab masa tu TTS memang tak support
// streaming langsung — tapi itu dah outdated sekarang.
//
// Balik guna streamGenerateContent?alt=sse: Gemini hantar audio dalam
// beberapa SSE event (base64 PCM chunk demi chunk) instead of tunggu
// semua siap dulu. Kita parse tiap event, encode PCM->MP3 SECARA
// INCREMENTAL (lamejs encoder support encodeBuffer() dipanggil berkali-kali
// dgn chunk kecil), dan terus stream MP3 bytes tu ke client guna
// ReadableStream/chunked response — client dapat audio bytes awal-awal,
// tak perlu tunggu whole generation siap macam sebelum ni.
//
// Format raw PCM Gemini TTS: 16-bit signed little-endian, mono, 24000 Hz.

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';
import lamejs from '@breezystack/lamejs';

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
  try {
    return await handleTts(request);
  } catch (err) {
    // SAFETY NET: apa-apa error yang terlepas dari try/catch dalam
    // handleTts() (contoh: lamejs gagal init, atau exception lain yang
    // tak dijangka) akan ditangkap sini — supaya browser dapat JSON error
    // yang boleh dibaca, bukan generic Next.js "500 This page couldn't
    // load" HTML yang tak bagitau apa-apa punca sebenar.
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

  const safeText = String(text).slice(0, 400); // dah tak perlu keping ~140 char macam dulu — streaming urus turn penuh terus
  const voice = geminiVoice || pickGeminiVoice(gender || 'male');

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:streamGenerateContent?alt=sse`,
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

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    console.error('Gemini TTS error:', errText);
    return Response.json({ error: 'Gemini TTS error: ' + errText }, { status: upstream.status || 500 });
  }

  const sampleRate = 24000;
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 48); // mono, 48kbps
  const MP3_BLOCK_SIZE = 1152; // saiz frame standard MP3 encoder

  // Leftover odd byte antara SSE chunk (PCM 16-bit = 2 byte/sample, chunk
  // boundary dari Gemini tak semestinya align ke 2-byte).
  let leftoverByte = null;
  // Sample buffer belum cukup 1152 (block size) untuk encode lagi.
  let sampleCarry = new Int16Array(0);
  let gotAudio = false;

  function pcmChunkToInt16(pcmBytes) {
    let bytes = pcmBytes;
    if (leftoverByte !== null) {
      const merged = new Uint8Array(bytes.length + 1);
      merged[0] = leftoverByte;
      merged.set(bytes, 1);
      bytes = merged;
      leftoverByte = null;
    }
    if (bytes.length % 2 !== 0) {
      leftoverByte = bytes[bytes.length - 1];
      bytes = bytes.slice(0, bytes.length - 1);
    }
    const sampleCount = bytes.length / 2;
    const samples = new Int16Array(sampleCount);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    for (let i = 0; i < sampleCount; i++) samples[i] = dv.getInt16(i * 2, true);
    return samples;
  }

  function encodeSamples(samples, controller) {
    // Gabung dgn carry dari call sebelum, encode dlm block 1152, simpan baki sbg carry baru.
    const combined = new Int16Array(sampleCarry.length + samples.length);
    combined.set(sampleCarry, 0);
    combined.set(samples, sampleCarry.length);

    let i = 0;
    for (; i + MP3_BLOCK_SIZE <= combined.length; i += MP3_BLOCK_SIZE) {
      const mp3buf = encoder.encodeBuffer(combined.subarray(i, i + MP3_BLOCK_SIZE));
      if (mp3buf.length > 0) controller.enqueue(new Uint8Array(mp3buf));
    }
    sampleCarry = combined.slice(i);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // SSE frames dipisah dgn "\n\n"; tiap frame ada line "data: {...}"
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = frame.split('\n').find(l => l.startsWith('data:'));
            if (!line) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            let evt;
            try { evt = JSON.parse(jsonStr); }
            catch { continue; } // frame parsial/rosak — skip, bukan fatal

            const b64 = evt?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!b64) continue;
            gotAudio = true;
            const pcmBytes = Buffer.from(b64, 'base64');
            const samples = pcmChunkToInt16(pcmBytes);
            if (samples.length) encodeSamples(samples, controller);
          }
        }

        if (!gotAudio) {
          console.error('Tiada audio dalam stream Gemini TTS.');
          controller.error(new Error('Gemini TTS tidak pulangkan audio — sila cuba lagi.'));
          return;
        }

        // Flush baki sample yang tak cukup 1 block, then flush encoder.
        if (sampleCarry.length) {
          const mp3buf = encoder.encodeBuffer(sampleCarry);
          if (mp3buf.length > 0) controller.enqueue(new Uint8Array(mp3buf));
        }
        const end = encoder.flush();
        if (end.length > 0) controller.enqueue(new Uint8Array(end));

        controller.close();
      } catch (err) {
        console.error('TTS stream error:', err);
        controller.error(err);
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store'
    }
  });
}
