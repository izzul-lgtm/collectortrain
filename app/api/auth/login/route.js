import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

function toClientShape(row) {
  return { id: row.id, name: row.name, role: row.role, registeredAt: row.registered_at };
}

export async function POST(req) {
  try {
    const { id, pass } = await req.json();
    if (!id || !pass) {
      return Response.json({ error: 'Sila isi semua maklumat.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('users')
      .select('id, name, role, registered_at, password_hash')
      .eq('id', id.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return Response.json({ error: 'ID Pekerja tidak dijumpai.' }, { status: 404 });
    }
    const valid = await bcrypt.compare(pass, data.password_hash);
    if (!valid) {
      return Response.json({ error: 'Kata laluan salah.' }, { status: 401 });
    }
    // password_hash sengaja tak diselit dalam response — toClientShape() buang terus.
    return Response.json({ user: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal log masuk.' }, { status: 500 });
  }
}
