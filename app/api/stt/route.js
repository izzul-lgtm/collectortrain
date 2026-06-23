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
    // smart_format: auto format nombor, tarikh, mata wang
    // punctuate: tambah tanda baca automatik
    // diarize: false — satu speaker je (collector)
    // FIX: forward Content-Type sebenar dari browser (bukan hardcode audio/webm)
    // Safari record dalam audio/mp4, Firefox dalam audio/ogg — hardcode audio/webm
    // menyebabkan Deepgram silap decode, accuracy drop, collector kena repeat lebih selalu.
    //
    // FIX (Manglish accuracy): language=ms tadi adalah MONOLINGUAL Malay model.
    // Bila collector campur perkataan English dalam ayat (cara kita cakap sebenar —
    // "ringgit", "hutang", "bayar", "PTP" dicampur dengan English), model monolingual
    // cuba paksa setiap bunyi jadi perkataan Malay/English yang paling "dekat" ikut bahasa
    // yang diset — ini punca STT_CORRECTIONS kena tampung byk salah aneh macam
    // "ringgit"→"ringette", "bayar"→"buyer", "hutang"→"good time"/"hooting".
    // language=multi = Deepgram Multilingual Code-Switching — boleh detect & transkrip
    // BM + English dalam SATU ayat yang sama tanpa kena declare bahasa fixed.
    //
    // FIX (model): nova-3 ada peningkatan accuracy khusus untuk Bahasa Malaysia
    // (Deepgram lapor >20% pengurangan word-error-rate utk Malay berbanding nova-2),
    // jadi jadikan default. nova-2 disimpan sebagai FALLBACK — Deepgram kadang balas
    // transcript kosong + confidence 0 untuk audio yang sebenarnya ada percakapan
    // (isu dilaporkan sendiri oleh community Deepgram, bukan isu pada code kita) —
    // bila ni jadi, cuba sekali lagi dengan model lain sebelum give up.
    const contentType = request.headers.get('content-type') || 'audio/webm';

    async function callDeepgram(model) {
      const upstream = await fetch(
        `https://api.deepgram.com/v1/listen?model=${model}&language=multi&smart_format=true&punctuate=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': contentType,
          },
          body: audioBuffer,
        }
      );
      if (!upstream.ok) {
        const errText = await upstream.text();
        const err = new Error('Deepgram error: ' + errText);
        err.status = upstream.status;
        throw err;
      }
      const data = await upstream.json();
      const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = data?.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
      return { transcript, confidence };
    }

    let result = await callDeepgram('nova-3');

    // Blank + confidence 0 walaupun audio bukan kosong — kemungkinan besar quirk
    // Deepgram tu, bukan memang senyap (client dah filter clip senyap sebelum hantar).
    // Cuba sekali lagi dengan model berbeza — request sama, model lain selalunya
    // bagi hasil berbeza untuk kes conservative-gating macam ni.
    if (!result.transcript && result.confidence === 0) {
      console.log('[STT] nova-3 balas kosong, cuba fallback nova-2...');
      try {
        result = await callDeepgram('nova-2');
      } catch (fallbackErr) {
        // kalau fallback pun gagal, teruskan dengan result asal (kosong) — jangan crash
      }
    }

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: 'Ralat proxy STT: ' + err.message },
      { status: err.status || 500 }
    );
  }
}
