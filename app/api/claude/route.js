// Proxies chat-completion calls to Anthropic's Messages API.
// The API key lives only here, as a Vercel/Next.js environment
// variable — it is never sent to or stored in the browser.

import { requireAuth } from '../../../lib/requireAuth';
import { rateLimit } from '../../../lib/rateLimit';

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  // Rate limit: max 40 request/minit per user — protect Claude API credit (cukup untuk nego panjang ~20 giliran)
  const limitError = rateLimit(request, 'claude', { max: 40, windowMs: 60_000 });
  if (limitError) return limitError;

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
  // gagal → fallback "Tidak dapat menganalisis sesi ini". Cap ditetapkan ke
  // 2600 — cukup luang untuk JSON penilaian penuh (missed[] max 5 item,
  // feedback 2-3 ayat ringkas, lihat evalCall() dalam app.js) + buffer, TAPI
  // tak terlalu tinggi supaya generation Claude tak ambil masa lebih lama
  // dari perlu (result "Keputusan Latihan" terasa perlahan kalau cap tinggi
  // sangat berbanding saiz output sebenar yang dijangka).
  const safeMaxTokens = Math.min(Number(max_tokens) || 200, 2600);

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
        model: "claude-haiku-4-5-20251001",
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
