import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at };
}

export async function POST(req) {
  try {
    const { id, name, pass, role } = await req.json();
    if (!id || !name || !pass) {
      return Response.json({ error: 'Sila isi semua maklumat.' }, { status: 400 });
    }
    if (pass.length < 6) {
      return Response.json({ error: 'Kata laluan min 6 aksara.' }, { status: 400 });
    }
    const cleanId = id.trim().toUpperCase();
    const sb = supabaseAdmin();

    const { data: existing, error: checkErr } = await sb
      .from('users').select('id').eq('id', cleanId).maybeSingle();
    if (checkErr) throw checkErr;
    if (existing) {
      return Response.json({ error: 'ID ini sudah wujud.' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(pass, 10); // password mentah tak pernah disimpan
    const { data, error } = await sb
      .from('users')
      .insert({ id: cleanId, name: name.trim(), password_hash, role: role || 'collector' })
      .select('id, name, role, registered_at')
      .single();
    if (error) throw error;
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal daftar pengguna.' }, { status: 500 });
  }
}
