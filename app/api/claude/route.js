// Proxies chat-completion calls to Anthropic's Messages API.
// The API key lives only here, as a Vercel/Next.js environment
// variable — it is never sent to or stored in the browser.

import { requireAuth } from '../../../lib/requireAuth';

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY belum diset di server (env var)." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body request tidak sah." }, { status: 400 });
  }

  const { system, messages, max_tokens } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "'messages' diperlukan." }, { status: 400 });
  }

  // Small server-side guardrail so a stray/abusive request can't run away
  // with token usage — this is NOT a substitute for real auth, see README.
  //
  // PENTING: cap ni pernah jadi punca evalCall() (app.js) gagal — panggilan
  // latihan yang panjang buat Claude jana lebih banyak missed[]/quote dalam
  // JSON penilaian, lalu output terputus sebelum sempat habis → JSON.parse()
  // gagal → fallback "Tidak dapat menganalisis sesi ini". Cap dinaikkan ke
  // 3000 (cukup luang untuk JSON penilaian penuh + buffer), DAN evalCall()
  // sendiri kini hadkan saiz output (missed[] max 5 item, feedback ringkas)
  // supaya saiz JSON tak bergantung kepada tempoh panggilan — dua lapisan
  // perlindungan, bukan hanya naikkan nombor.
  const safeMaxTokens = Math.min(Number(max_tokens) || 200, 3000);

  // Prompt caching — system prompt yang sama dihantar setiap turn dalam satu call.
  // Dengan cache_control: { type: 'ephemeral' }, Anthropic cache token system prompt
  // selama 5 minit. Cache read = 10% harga je berbanding input token biasa.
  // Cara: tukar system dari plain string jadi array dengan cache breakpoint.
  // Nota: caching only kicks in kalau system prompt > 1024 token (getSysPrompt()
  // dalam CollectorTrain biasanya ~800-1200 token bergantung scenario — panjang
  // scenario.prompt yang custom boleh tips over the threshold dengan mudah).
  const systemPayload = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: safeMaxTokens,
        ...(systemPayload ? { system: systemPayload } : {}),
        messages,
      }),
    });

    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    return Response.json(
      { error: "Ralat proxy Claude: " + err.message },
      { status: 500 }
    );
  }
}
