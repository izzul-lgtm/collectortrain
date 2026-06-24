// lib/rateLimit.js
// ─────────────────────────────────────────────────────────────────────────────
// Simple in-memory rate limiter untuk API routes yang panggil external API
// berbayar (Claude, Gemini TTS, Deepgram STT).
//
// Cara guna dalam route.js:
//
//   import { rateLimit } from '../../../lib/rateLimit';
//
//   export async function POST(request) {
//     const limitError = rateLimit(request, 'claude', { max: 10, windowMs: 60000 });
//     if (limitError) return limitError;
//     // ... proceed
//   }
//
// In-memory je (bukan Redis) — cukup untuk app internal 20 collector.
// Data reset bila Vercel serverless function cold start — tapi masih
// efektif untuk protect burst abuse dalam satu sesi.
// ─────────────────────────────────────────────────────────────────────────────

// Map: key → { count, windowStart }
// key = `${bucket}:${userId}` cth "claude:C001"
const _store = new Map();

/**
 * Check & increment rate limit.
 * @param {Request} request  - Next.js request object (untuk dapat x-user-id)
 * @param {string}  bucket   - Nama resource: 'claude' | 'tts' | 'stt'
 * @param {object}  opts
 * @param {number}  opts.max       - Max requests dalam window (default: 10)
 * @param {number}  opts.windowMs  - Window size dalam ms (default: 60000 = 1 minit)
 * @returns {Response|null}  null = OK, Response = kena reject
 */
export function rateLimit(request, bucket, { max = 10, windowMs = 60_000 } = {}) {
  const userId = (request.headers.get('x-user-id') || 'anon').trim().toUpperCase();
  const key = `${bucket}:${userId}`;
  const now = Date.now();

  const entry = _store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // Window baru atau dah expired — reset
    _store.set(key, { count: 1, windowStart: now });
    return null; // OK
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return Response.json(
      { error: `Terlalu banyak request. Sila cuba lagi dalam ${retryAfterSec} saat.` },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      }
    );
  }

  entry.count++;
  return null; // OK
}
