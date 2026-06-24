// lib/requireAuth.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight auth check untuk API routes.
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
//   'x-user-id': currentUser.id   ← dah ada dalam localStorage / currentUser
//
// Bukan JWT/cookie httpOnly — ini auth ringkas tahap yang sesuai untuk app
// internal (20 collector, bukan public-facing SaaS). Cukup untuk block:
//   • curl/Postman random yang jumpa Vercel URL
//   • abuse Claude/Gemini/Deepgram credit
//   • delete data tanpa login
//
// Untuk upgrade ke Supabase Auth proper (session token signed) kemudian hari,
// cuma fail ni je yang perlu ditukar — semua route tak perlu sentuh.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from './supabaseAdmin';

// Cache ringkas dalam memori — elak Supabase query setiap kali API dipanggil.
// Key: user ID (string), Value: { role, expiresAt (ms timestamp) }
// TTL 5 minit — kalau user dipadam, max 5 minit je dia masih boleh guna API.
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minit

// Resolve user dari header, guna cache kalau ada.
// Return { id, role } kalau valid, atau null kalau gagal (error response dalam authError).
async function _resolveUser(request, { roles } = {}) {
  const userId = (request.headers.get('x-user-id') || '').trim().toUpperCase();

  if (!userId) {
    return { authUser: null, authError: _deny('Akses ditolak: tiada ID pengguna dalam request.', 401) };
  }

  // Semak cache dulu
  const cached = _cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    if (roles && !roles.includes(cached.role)) {
      return { authUser: null, authError: _deny(`Akses ditolak: perlu role ${roles.join('/')} untuk tindakan ini.`, 403) };
    }
    return { authUser: { id: userId, role: cached.role }, authError: null };
  }

  // Verify ID wujud dalam DB
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { authUser: null, authError: _deny('Akses ditolak: pengguna tidak dijumpai atau sesi tidak sah.', 401) };
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
