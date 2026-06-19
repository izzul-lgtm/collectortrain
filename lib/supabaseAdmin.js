// Server-only Supabase client.
//
// PENTING: fail ni guna SUPABASE_SERVICE_ROLE_KEY — key ni ada akses PENUH
// ke database (bypass Row Level Security). JANGAN sekali-kali import fail
// ni dari public/app.js (client-side) atau letak key ni dalam mana-mana
// variable yang bermula dengan NEXT_PUBLIC_*. Fail ni hanya selamat untuk
// digunakan dalam app/api/*/route.js (Next.js API routes), yang sentiasa
// jalan di server, tak pernah sampai ke browser.
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function supabaseAdmin() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase belum dikonfigurasi. Sila set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY dalam .env.local (lihat .env.local.example).'
    );
  }

  _client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return _client;
}
