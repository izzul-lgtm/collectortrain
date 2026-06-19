// Proxies chat-completion calls to Anthropic's Messages API.
// The API key lives only here, as a Vercel/Next.js environment
// variable — it is never sent to or stored in the browser.

export async function POST(request) {
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
  // PENTING: cap ni dulu 500, tapi evalCall() di app.js minta 1300+ token
  // untuk JSON penilaian penuh (scores + strengths + missed[] + priorityFocus
  // + feedback). Bila request kena cap kat 500, jawapan Claude terputus
  // separuh jalan → JSON tak lengkap → JSON.parse() gagal → sistem fallback
  // ke mesej generik "Tidak dapat menganalisis sesi ini". Ini sebab komen
  // & cadangan penambahbaikan collector nampak kosong/generik — bukan AI
  // tak boleh buat, tapi jawapannya dipotong sebelum sempat habis tulis.
  const safeMaxTokens = Math.min(Number(max_tokens) || 200, 1600);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: safeMaxTokens,
        ...(system ? { system } : {}),
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
