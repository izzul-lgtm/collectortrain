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
    // REVERT (PENTING): language=multi BUKAN jawapan untuk Manglish — ini punca
    // sebenar "ayat pelik sampai AI customer pun jadi pelik".
    // Deepgram Multilingual Code-Switching (language=multi) pada Nova-3 HANYA
    // support 10 bahasa ni: English, Spanish, French, German, Hindi, Italian,
    // Japanese, Dutch, Russian, Portuguese. Bahasa Malaysia (ms) TIDAK disenaraikan.
    // Bila collector cakap BM, Deepgram dalam mode `multi` tak boleh "balik" ke BM —
    // dia terpaksa paksa setiap bunyi jadi salah satu drpd 10 bahasa yang dia kenal.
    // Hasil: ayat jadi serpihan Spanish/Italian/Dutch/Hindi yang tak masuk akal
    // (lagi teruk dari sekadar "ringgit"→"ringette" — ini satu ayat penuh boleh
    // jadi bahasa lain sepenuhnya). Ayat hancur ni terus jadi mesej "collector"
    // dalam history yang dihantar ke Claude → AI customer respond kat ayat yang
    // tak masuk akal → seluruh sesi training jadi pelik.
    // FIX: balik guna language=ms (monolingual Malay model). Model ms Deepgram
    // memang dilatih untuk loanword English yang biasa campur dalam BM (ringgit,
    // PTP, ansuran, dll) — STT_CORRECTIONS list di app.js cukup sebagai safety-net
    // untuk residual mishear yang occasional, jauh lebih ringan dari masalah
    // "tukar bahasa sepenuhnya" yang language=multi sebabkan.
    //
    // FIX (model): nova-3 ada peningkatan accuracy khusus untuk Bahasa Malaysia
    // (Deepgram lapor >20% pengurangan word-error-rate utk Malay berbanding nova-2),
    // jadi jadikan default. nova-2 disimpan sebagai FALLBACK — Deepgram kadang balas
    // transcript kosong + confidence 0 untuk audio yang sebenarnya ada percakapan
    // (isu dilaporkan sendiri oleh community Deepgram, bukan isu pada code kita) —
    // bila ni jadi, cuba sekali lagi dengan model lain sebelum give up.
    const contentType = request.headers.get('content-type') || 'audio/webm';

    // ── VOCAB BOOST: nama brand & istilah debt-collection yang Deepgram selalu
    // silap dengar (RedOne, Celcom, Digi, Newvest, CTOS, PTP, dll). Dulu kita
    // cuma "tampung" lepas silap jadi (STT_CORRECTIONS regex di app.js). Lagi
    // baik betulkan di SUMBER — bagi Deepgram tahu istilah ni sebelum dia
    // transcribe, supaya dia lagi cenderung dengar betul dari awal.
    // - Nova-3: guna parameter `keyterm` (Keyterm Prompting — contextual, boleh
    //   nama biasa & istilah pelbagai perkataan).
    // - Nova-2 (fallback): `keyterm` TIDAK disokong — kena guna `keywords`
    //   (lama, format beza: kena tambah intensifier cth "Celcom:2").
    // STT_CORRECTIONS di app.js DIKEKALKAN sebagai safety-net peringkat ke-2 —
    // keyterm tak 100% guarantee, jadi regex tetap tangkap yang masih tersilap.
    const VOCAB_TERMS = [
      'RedOne', 'Celcom', 'Digi', 'Maxis', 'U Mobile',
      'CTOS', 'CCRIS', 'NPL', 'PTP', 'SPDCA', 'JomPay', 'FPX',
      'Newvest', 'New Face', 'DCA', 'WhatsApp',
      'AmBank', 'CIMB', 'Maybank', 'HLB', 'Public Bank',
      'ringgit', 'hutang', 'bayar', 'ansuran', 'tertunggak', 'berjanji', 'janji',
      'paylater', 'ewallet',
    ];

    function vocabQueryString(model) {
      if (model === 'nova-2') {
        // Keywords (Nova-2): format word:intensifier — intensifier sederhana (2)
        // supaya tak over-boost & ganggu perkataan biasa lain.
        return VOCAB_TERMS.map(t => `keywords=${encodeURIComponent(t + ':2')}`).join('&');
      }
      // Keyterm Prompting (Nova-3): plain string, satu parameter per term.
      return VOCAB_TERMS.map(t => `keyterm=${encodeURIComponent(t)}`).join('&');
    }

    async function callDeepgram(model) {
      const upstream = await fetch(
        `https://api.deepgram.com/v1/listen?model=${model}&language=ms&smart_format=true&punctuate=true&${vocabQueryString(model)}`,
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
