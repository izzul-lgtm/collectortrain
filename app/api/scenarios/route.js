import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuth } from '../../../lib/requireAuth';

// Tukar antara bentuk row Postgres (snake_case) ↔ bentuk yang app.js harap
// (camelCase, sama macam shape localStorage lama) — supaya app.js tak perlu
// banyak berubah bentuk data, cuma sumber data je yang bertukar.
function toClientShape(row) {
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    gender: row.gender,
    accent: row.accent,
    voiceId: row.voice_id,
    title: row.title,
    desc: row.description,
    amount: row.amount,
    days: row.days,
    level: row.level,
    balanceTier: row.balance_tier,
    prompt: row.prompt,
    checklist: row.checklist || [],
    disclosures: row.disclosures || [],
    client: row.client || '',
    icNumber: row.ic_number || '',
    accNumber: row.acc_number || '',
    serviceNo: row.service_no || '',
    accType: row.acc_type || '',
    terminationDate: row.termination_date || '',
    registrationDate: row.registration_date || '',
    customerType: row.customer_type || 'other',
    objectionType: row.objection_type || 'cooperative',
  };
}

function toDbShape(data) {
  return {
    id: data.id,
    emoji: data.emoji,
    name: data.name,
    gender: data.gender,
    accent: data.accent,
    voice_id: data.voiceId,
    title: data.title,
    description: data.desc,
    amount: data.amount,
    days: data.days,
    level: data.level,
    balance_tier: data.balanceTier,
    prompt: data.prompt,
    checklist: data.checklist || [],
    disclosures: data.disclosures || [],
    client: data.client || '',
    ic_number: data.icNumber || '',
    acc_number: data.accNumber || '',
    service_no: data.serviceNo || '',
    acc_type: data.accType || '',
    termination_date: data.terminationDate || null,
    registration_date: data.registrationDate || null,
    customer_type: data.customerType || 'other',
    objection_type: data.objectionType || 'cooperative',
  };
}

export async function GET(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('scenarios')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ scenarios: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal ambil senario.' }, { status: 500 });
  }
}

export async function POST(req) {
  const authError = await requireAuth(req, { roles: ['admin', 'manager'] });
  if (authError) return authError;

  try {
    const body = await req.json();
    if (!body.id || !body.name || !body.title || !body.prompt) {
      return Response.json({ error: 'Sila isi semua maklumat (id/name/title/prompt diperlukan).' }, { status: 400 });
    }
    if (!body.client || !body.icNumber || !body.accNumber || !body.serviceNo || !body.accType || !body.terminationDate || !body.registrationDate) {
      return Response.json({ error: 'Sila isi semua Maklumat Akaun Pelanggan (Client/IC/No. Akaun/No. Servis/Jenis Akaun/Tarikh Termination/Tarikh Daftar) sebelum simpan.' }, { status: 400 });
    }
    // FASA 1 quick win: objectionType WAJIB dipilih (bukan auto-default
    // senyap) — kalau tag ni boleh terlepas tanpa disedari, analytics
    // cross-tab nanti jadi "garbage in, garbage out" sebab sebahagian
    // scenario silently jatuh ke 'cooperative' walaupun bukan tu sebenarnya.
    const VALID_OBJECTION = ['cooperative', 'denial', 'hardship', 'aggressive', 'avoidance'];
    if (!VALID_OBJECTION.includes(body.objectionType)) {
      return Response.json({ error: 'Sila pilih Objection Type (Cooperative/Denial/Hardship/Aggressive/Avoidance) sebelum simpan.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('scenarios')
      .upsert(toDbShape(body), { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ scenario: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal simpan senario.' }, { status: 500 });
  }
}

export async function DELETE(req) {
  const authError = await requireAuth(req, { roles: ['admin'] });
  if (authError) return authError;

  try {
    const { id } = await req.json();
    if (!id) return Response.json({ error: 'id diperlukan.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from('scenarios').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal padam senario.' }, { status: 500 });
  }
}
