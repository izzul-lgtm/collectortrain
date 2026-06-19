import { supabaseAdmin } from '../../../lib/supabaseAdmin';

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
  };
}

export async function GET() {
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
  try {
    const body = await req.json();
    if (!body.id || !body.name || !body.title || !body.prompt) {
      return Response.json({ error: 'Sila isi semua maklumat (id/name/title/prompt diperlukan).' }, { status: 400 });
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
