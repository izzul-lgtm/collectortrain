// Proxies audio ke Deepgram Speech-to-Text API.
// API key disimpan di server (env var) — tak pernah dedah ke browser.

export async function POST(request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'DEEPGRAM_API_KEY belum diset di server (env var).' },
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

  try {
    // Deepgram Nova-2 — model terbaik untuk accuracy Bahasa Malaysia/Inggeris campur
    // smart_format: auto format nombor, tarikh, mata wang
    // punctuate: tambah tanda baca automatik
    // diarize: false — satu speaker je (collector)
    const upstream = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&language=ms&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'audio/webm',
        },
        body: audioBuffer,
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      return Response.json(
        { error: 'Deepgram error: ' + errText },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence =
      data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    return Response.json({ transcript, confidence });
  } catch (err) {
    return Response.json(
      { error: 'Ralat proxy STT: ' + err.message },
      { status: 500 }
    );
  }
}
