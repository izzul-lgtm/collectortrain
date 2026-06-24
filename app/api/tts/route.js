// Proxies text-to-speech calls ke Gemini 3.1 Flash TTS API.
// API key disimpan di server (env var GEMINI_API_KEY) — tak pernah dedah ke browser.
// Model: gemini-3.1-flash-tts-preview
// Supports audio tags ([marah], [sedih], dll) dan natural language style instructions.

// Gemini 3.1 Flash TTS voices — 30 voices tersedia
// Pilihan untuk CollectorTrain (debtor character):
// Male:   Orus (dalam/serius), Fenrir (kasar/tegas), Charon (neutral), Puck (ekspresif/muda)
// Female: Kore (serius/tegang), Aoede (warm/natural), Leda (muda/casual), Zephyr (lembut)
const GEMINI_VOICES = {
  male:   ['Orus','Fenrir','Charon','Puck'],
  female: ['Kore','Aoede','Leda','Zephyr']
};

// Track voices yang dah guna supaya rotate — persistent across requests via module scope
// (akan reset bila server restart, acceptable untuk dev/staging)
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'GEMINI_API_KEY belum diset di server (env var).' },
      { status: 500 }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Body request tidak sah.' }, { status: 400 }); }

  const { text, gender, geminiVoice } = body || {};
  if (!text) return Response.json({ error: "'text' diperlukan." }, { status: 400 });

  // Limit 500 chars — jimat kos, debtor reply patut pendek
  const safeText = String(text).slice(0, 500);

  // Guna voice yang dihantar dari client (consistent dalam satu sesi),
  // atau pick baru ikut gender
  const voice = geminiVoice || pickGeminiVoice(gender || 'male');

  // Style instruction — describe character secara natural untuk Gemini
  // Audio tags dalam safeText sendiri akan handle per-sentence emotion
  const styleInstruction = gender === 'female'
    ? 'Seorang wanita Malaysia yang sedang menerima panggilan debt collection. Cakap dalam Bahasa Malaysia yang natural dan spontan seperti perbualan telefon biasa, bukan formal.'
    : 'Seorang lelaki Malaysia yang sedang menerima panggilan debt collection. Cakap dalam Bahasa Malaysia yang natural dan spontan seperti perbualan telefon biasa, bukan formal.';

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`,
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
              },
              // Style instruction — describe character, emotion handled by audio tags in text
              speakingStyle: styleInstruction
            }
          }
        })
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json({ error: 'Gemini TTS error: ' + errText }, { status: upstream.status });
    }

    const json = await upstream.json();

    // Gemini returns base64 PCM audio dalam response
    const audioData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      return Response.json({ error: 'Tiada audio dalam response Gemini.' }, { status: 500 });
    }

    // Decode base64 → binary
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Gemini 3.1 Flash TTS output: PCM 24kHz 16-bit mono — kena wrap dalam WAV header
    // supaya browser boleh play terus via Audio()
    const wavBuffer = pcmToWav(audioBuffer, 24000, 1, 16);

    return new Response(wavBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' }
    });

  } catch (err) {
    return Response.json({ error: 'Ralat proxy TTS: ' + err.message }, { status: 500 });
  }
}

// Helper: wrap raw PCM bytes dalam WAV container
// Gemini output PCM — browser tak boleh play raw PCM, kena ada WAV header
function pcmToWav(pcmBuffer, sampleRate, numChannels, bitDepth) {
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);          // chunk size
  buffer.writeUInt16LE(1, 20);           // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}
