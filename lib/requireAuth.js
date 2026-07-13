// lib/requireAuth.js
// ─────────────────────────────────────────────────────────────────────────────
// Auth check untuk API routes.
//
// Cara guna (dalam mana-mana route.js):
//
//   import { requireAuth } from '../../../lib/requireAuth';
//
//   export async function POST(request) {
//     const authError = await requireAuth(request);
//     if (authError) return authError;
//     // ... logic sebenar route
//   }
//
// Untuk dapat info user selepas auth (role, userId):
//
//   const { authError, authUser } = await requireAuthWithUser(request);
//   if (authError) return authError;
//   // authUser = { id, role }
//
// Frontend kena hantar header:
//   'x-session-token': <token dari login response>   ← authHeaders() dah handle ni
//
// SEKURITI: header ni bawa SIGNED TOKEN (lihat lib/session.js), BUKAN raw
// employee ID macam sebelum ni. Sebelum ni sesiapa boleh set header
// 'x-user-id: ADM01' dan terus jadi admin tanpa password — sebab server
// terima ID mentah bulat-bulat sebagai identiti. Token bertandatangan tutup
// lubang tu: token cuma boleh dijana oleh server (createSessionToken, lepas
// password betul disahkan), client tak boleh reka/tukar token sendiri.
//
// Role tetap di-double-check terhadap DB (dengan cache 5 minit) selepas
// token disahkan — supaya delete/demote user masih propagate dengan cepat,
// walaupun token client masih "sah" dari segi signature/expiry.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from './supabaseAdmin';
import { verifySessionToken } from './session';

// Cache ringkas dalam memori — elak Supabase query setiap kali API dipanggil.
// Key: user ID (string), Value: { role, expiresAt (ms timestamp) }
// TTL 5 minit — kalau user dipadam/role ditukar, max 5 minit je token lama
// masih guna maklumat role sebelumnya.
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minit

// Resolve user dari signed token, guna cache role/existence kalau ada.
// Return { id, role } kalau valid, atau null kalau gagal (error response dalam authError).
async function _resolveUser(request, { roles } = {}) {
  const token = request.headers.get('x-session-token') || '';
  const claims = verifySessionToken(token);

  if (!claims) {
    return { authUser: null, authError: _deny('Sesi tidak sah atau telah tamat tempoh. Sila log masuk semula.', 401) };
  }

  const userId = claims.id.trim().toUpperCase();

  // Semak cache dulu (role/existence, BUKAN identiti — identiti dah disahkan
  // melalui signature token di atas)
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    if (roles && !roles.includes(cached.role)) {
      return { authUser: null, authError: _deny(`Akses ditolak: perlu role ${roles.join('/')} untuk tindakan ini.`, 403) };
    }
    return { authUser: { id: userId, role: cached.role }, authError: null };
  }

  // Verify ID masih wujud & tarik role terkini dari DB
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { authUser: null, authError: _deny('Akses ditolak: pengguna tidak dijumpai atau akaun telah dipadam.', 401) };
    }

    // Simpan dalam cache
    _cache.set(userId, { role: data.role, expiresAt: Date.now() + CACHE_TTL_MS });

    if (roles && !roles.includes(data.role)) {
      return { authUser: null, authError: _deny(`Akses ditolak: perlu role ${roles.join('/')} untuk tindakan ini.`, 403) };
    }

    return { authUser: { id: userId, role: data.role }, authError: null };

  } catch (err) {
    console.error('[requireAuth] DB error:', err.message);
    return { authUser: null, authError: _deny('Ralat semak sesi: ' + err.message, 500) };
  }
}

// Original API — backward compatible, semua route sedia ada tak perlu ubah.
export async function requireAuth(request, { roles } = {}) {
  const { authError } = await _resolveUser(request, { roles });
  return authError; // null = OK, Response = rejected
}

// Extended API — untuk routes yang perlukan info user (id, role) selepas auth.
export async function requireAuthWithUser(request, { roles } = {}) {
  return _resolveUser(request, { roles });
}

function _deny(message, status) {
  return Response.json({ error: message }, { status });
}
