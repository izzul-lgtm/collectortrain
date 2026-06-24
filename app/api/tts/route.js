// Proxies text-to-speech ke Gemini 3.1 Flash TTS API.
// Style/emotion dihandle melalui audio tags dalam text itself ([angry], [sad], dll)
// dan melalui system instruction dalam contents.

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY belum diset.' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Body tidak sah.' }, { status: 400 }); }

  const { text, gender, geminiVoice } = body || {};
  if (!text) return Response.json({ error: "'text' diperlukan." }, { status: 400 });

  const safeText = String(text).slice(0, 500);
  const voice = geminiVoice || pickGeminiVoice(gender || 'male');

  // Style instruction letak dalam text sebagai system context
  // Gemini TTS faham natural language instruction dalam contents
  const stylePrefix = gender === 'female'
    ? 'Kamu adalah seorang wanita Malaysia yang menerima panggilan debt collection. Cakap dalam Bahasa Malaysia yang natural dan spontan. Baca teks berikut:\n\n'
    : 'Kamu adalah seorang lelaki Malaysia yang menerima panggilan debt collection. Cakap dalam Bahasa Malaysia yang natural dan spontan. Baca teks berikut:\n\n';

  const fullText = stylePrefix + safeText;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullText }] }],
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

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Gemini TTS error:', errText);
      return Response.json({ error: 'Gemini TTS error: ' + errText }, { status: upstream.status });
    }

    const json = await upstream.json();
    const audioData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      console.error('No audio in Gemini response:', JSON.stringify(json).slice(0, 500));
      return Response.json({ error: 'Tiada audio dalam response Gemini.' }, { status: 500 });
    }

    const audioBuffer = Buffer.from(audioData, 'base64');
    const wavBuffer = pcmToWav(audioBuffer, 24000, 1, 16);

    return new Response(wavBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' }
    });

  } catch (err) {
    console.error('TTS proxy error:', err);
    return Response.json({ error: 'Ralat proxy TTS: ' + err.message }, { status: 500 });
  }
}

function pcmToWav(pcmBuffer, sampleRate, numChannels, bitDepth) {
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
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
