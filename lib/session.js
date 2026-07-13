// lib/session.js
// ─────────────────────────────────────────────────────────────────────────────
// Signed, expiring session token (HMAC-SHA256) — guna Node `crypto` terbina
// dalam, TIADA dependency baru.
//
// SEBAB INI WUJUD: sebelum ni "login" cuma simpan Employee ID mentah (cth
// "ADM01") dalam localStorage, dan hantar balik ID tu sebagai header pada
// setiap API call. Server terima bulat-bulat ID tu sebagai identiti —
// TIADA signature/secret check langsung. Sesiapa yang buka DevTools boleh:
//
//     localStorage.setItem('ct_session_token', 'ADM01')
//
// ...dan terus jadi admin, tanpa tahu password admin tu langsung (asalkan
// employee ID predictable/diketahui). Token bertandatangan ni tutup lubang
// tu — token HANYA boleh dijana oleh server (guna SESSION_SECRET yang cuma
// server tahu). Client boleh simpan & hantar token, tapi tak boleh reka atau
// ubah kandungannya — sebarang percubaan tamper akan gagal signature check.
//
// Format token:  base64url(payload_json) + '.' + base64url(hmac_sha256_sig)
// Payload:       { id, role, iat, exp }
//
// Role & existence akaun tetap di-double-check terhadap DB (lihat
// lib/requireAuth.js) — token cuma buktikan IDENTITI ("server memang issue
// token ni untuk id X"), bukan authoriti kekal. Kalau admin delete/demote
// user, token lama akan gagal re-check dalam masa max 5 minit (cache TTL),
// sama macam tingkah laku sebelum ni.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam — cukup untuk satu shift kerja

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // Sengaja throw (bukan fallback ke default secret) — default secret yang
    // predictable sama teruk macam takde signature langsung.
    throw new Error(
      'SESSION_SECRET belum diset (atau terlalu pendek, minimum 16 aksara). ' +
      'Set dalam Vercel → Project → Settings → Environment Variables. ' +
      'Cadangan: jana rawak, cth `openssl rand -hex 32`.'
    );
  }
  return secret;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Jana token bertandatangan untuk satu user. */
export function createSessionToken({ id, role }) {
  const secret = getSecret();
  const now = Date.now();
  const payload = { id, role, iat: now, exp: now + TOKEN_TTL_MS };
  const payloadEncoded = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(payloadEncoded).digest();
  return `${payloadEncoded}.${b64url(sig)}`;
}

/**
 * Verify token — check signature (elak tampering/forgery) DAN expiry.
 * @returns {{id:string, role:string, iat:number, exp:number}|null}  null = tak sah
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const dotIdx = token.lastIndexOf('.');
  const payloadEncoded = token.slice(0, dotIdx);
  const sigEncoded = token.slice(dotIdx + 1);
  if (!payloadEncoded || !sigEncoded) return null;

  let secret;
  try {
    secret = getSecret();
  } catch {
    return null; // SESSION_SECRET tak diset — treat semua token sebagai invalid
  }

  const expectedSigBuf = crypto.createHmac('sha256', secret).update(payloadEncoded).digest();
  let providedSigBuf;
  try {
    providedSigBuf = Buffer.from(sigEncoded, 'base64url');
  } catch {
    return null;
  }

  // Timing-safe compare — elak timing attack untuk teka signature.
  if (providedSigBuf.length !== expectedSigBuf.length) return null;
  if (!crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || !payload.id || !payload.exp) return null;
  if (Date.now() > payload.exp) return null; // token dah expired

  return payload;
}
