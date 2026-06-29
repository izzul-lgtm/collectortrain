import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../../lib/requireAuth';

export async function POST(req) {
  // Admin & manager boleh reset password. Manager ONLY boleh reset collector.
  // Admin boleh reset sesiapa (collector/manager/admin lain).
  const { authError, authUser } = await requireAuthWithUser(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;

  try {
    const { id, newPass } = await req.json();

    if (!id || !newPass) {
      return Response.json({ error: 'ID dan password baru diperlukan.' }, { status: 400 });
    }
    if (newPass.length < 6) {
      return Response.json({ error: 'Password mesti sekurang-kurangnya 6 aksara.' }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Fetch target user untuk semak role dia
    const { data: target, error: fetchErr } = await sb
      .from('users')
      .select('id, role')
      .eq('id', id.trim().toUpperCase())
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!target) {
      return Response.json({ error: 'Pengguna tidak dijumpai.' }, { status: 404 });
    }

    // Manager hanya boleh reset password collector — bukan manager/admin lain
    if (authUser.role === 'manager' && target.role !== 'collector') {
      return Response.json(
        { error: 'Manager hanya boleh reset password collector.' },
        { status: 403 }
      );
    }

    // Prevent self-reset via this endpoint (guna change-own-password kalau ada nanti)
    if (target.id === authUser.id) {
      return Response.json({ error: 'Guna Settings untuk tukar password sendiri.' }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(newPass, 10);
    const { error: updateErr } = await sb
      .from('users')
      .update({ password_hash })
      .eq('id', target.id);

    if (updateErr) throw updateErr;

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal reset password.' }, { status: 500 });
  }
}
