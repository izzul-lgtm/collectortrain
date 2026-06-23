// Proxies text-to-speech calls to ElevenLabs Speech-to-Text API.
// API key disimpan di server (env var) — tak pernah dedah ke browser.

export async function POST(request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ELEVENLABS_API_KEY belum diset di server (env var).' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body request tidak sah.' }, { status: 400 });
  }

  const { text, voiceId, voiceSettings } = body || {};
  if (!text || !voiceId) {
    return Response.json({ error: "'text' dan 'voiceId' diperlukan." }, { status: 400 });
  }

  // Guna voiceSettings dari client (emotion-aware) atau default
  const settings = voiceSettings || { stability: 0.5, similarity_boost: 0.75, style: 0.4 };

  // FIX 1: Tukar dari eleven_multilingual_v2 → eleven_flash_v2_5
  // eleven_flash_v2_5 = separuh harga, latency lagi rendah (75ms vs 150ms),
  // quality masih natural dan support BM/Manglish.
  // eleven_multilingual_v2 adalah model paling mahal — punca credit cepat habis.
  const MODEL = 'eleven_flash_v2_5';

  // FIX 2: Limit text ke 500 chars (dari 1000)
  // Debtor reply dalam training simulator patut pendek — jimat credit,
  // dan response lagi natural dalam context phone call simulation.
  const safeText = String(text).slice(0, 500);

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: safeText,
          model_id: MODEL,
          voice_settings: {
            stability: settings.stability ?? 0.5,
            similarity_boost: settings.similarity_boost ?? 0.75,
            style: settings.style ?? 0.4,
            use_speaker_boost: settings.use_speaker_boost ?? true,
          },
        }),
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { error: 'ElevenLabs error: ' + errText },
        { status: upstream.status }
      );
    }

    const audioBuffer = await upstream.arrayBuffer();
    return new Response(audioBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (err) {
    return Response.json(
      { error: 'Ralat proxy TTS: ' + err.message },
      { status: 500 }
    );
  }
}
