import { supabaseAdmin } from '../../../lib/supabaseAdmin';

function toClientShape(row) {
  return {
    id: row.id,
    collectorId: row.collector_id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    duration: row.duration,
    totalScore: row.total_score,
    scores: row.scores || {},
    strengths: row.strengths || [],
    missed: row.missed || [],
    priorityFocus: row.priority_focus,
    harassmentRisk: row.harassment_risk,
    harassmentNote: row.harassment_note,
    feedback: row.feedback,
    transcript: row.transcript || [],
    date: row.created_at,
  };
}

function toDbShape(data) {
  return {
    id: data.id,
    collector_id: data.collectorId,
    scenario_id: data.scenarioId,
    scenario_name: data.scenarioName,
    duration: data.duration,
    total_score: data.totalScore,
    scores: data.scores || {},
    strengths: data.strengths || [],
    missed: data.missed || [],
    priority_focus: data.priorityFocus || null,
    harassment_risk: data.harassmentRisk || 'none',
    harassment_note: data.harassmentNote || '',
    feedback: data.feedback || '',
    transcript: data.transcript || [],
  };
}

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: true }); // ascending: app.js sendiri yang reverse bila perlu "terbaru dulu"
    if (error) throw error;
    return Response.json({ sessions: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal ambil sesi latihan.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.id || !body.collectorId) {
      return Response.json({ error: 'id dan collectorId diperlukan.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('sessions')
      .insert(toDbShape(body))
      .select()
      .single();
    if (error) throw error;
    return Response.json({ session: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal simpan sesi latihan.' }, { status: 500 });
  }
}
