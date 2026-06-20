import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at };
}

// Nota keselamatan: route ni TIDAK verify password — ia cuma untuk
// restore sesi selepas refresh page (ID disimpan dalam localStorage
// semasa login berjaya, password tak pernah disimpan/dihantar semula).
// Risiko: kalau seseorang ubah localStorage value secara manual untuk
// "claim" jadi ID orang lain, dia akan dianggap log masuk sebagai ID
// tu. Ini level risiko yang SAMA macam sistem "remember me" ringkas
// kebanyakan app kecil — bukan auth tahap enterprise (tiada
// cookie httpOnly/JWT signed). Untuk keperluan security lebih tinggi
// nanti, upgrade ke Supabase Auth proper (session token, bukan ID
// mentah) disebut dalam perbincangan migration awal.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at')
      .eq('id', id.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Sesi tidak sah.' }, { status: 404 });
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal sahkan sesi.' }, { status: 500 });
  }
}
