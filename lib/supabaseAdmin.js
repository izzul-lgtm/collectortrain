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

  // .trim() di sini sengaja — copy-paste dari Supabase dashboard/Vercel
  // env var kadang bawa whitespace/newline tersembunyi di hujung value
  // yang tak nampak dengan mata, tapi cukup untuk rosakkan URL dan throw
  // "Invalid path specified in request URL". Strip juga trailing slash
  // pada URL ("https://x.supabase.co/" → "https://x.supabase.co") sebab
  // itu juga punca biasa untuk error yang sama.
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

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
