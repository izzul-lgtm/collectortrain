import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    collectorId: row.collector_id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    duration: row.duration,
    totalScore: row.total_score,
    scores: row.scores || {},
    scoreReasons: row.score_reasons || {},
    strengths: row.strengths || [],
    missed: row.missed || [],
    priorityFocus: row.priority_focus,
    harassmentRisk: row.harassment_risk,
    harassmentNote: row.harassment_note,
    feedback: row.feedback,
    transcript: row.transcript || [],
    date: row.created_at,
    customerType: row.customer_type || '',
    objectionType: row.objection_type || '',
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
    score_reasons: data.scoreReasons || {},
    strengths: data.strengths || [],
    missed: data.missed || [],
    priority_focus: data.priorityFocus || null,
    harassment_risk: data.harassmentRisk || 'none',
    harassment_note: data.harassmentNote || '',
    feedback: data.feedback || '',
    transcript: data.transcript || [],
    customer_type: data.customerType || '',
    objection_type: data.objectionType || '',
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;

  try {
    const sb = supabaseAdmin();
    let query = sb
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: true });

    // FIX KESELAMATAN: Collector hanya boleh nampak sesi sendiri.
    // Admin & manager boleh nampak semua — untuk dashboard & coaching.
    // Sebelum ni semua user dapat semua data, cuma frontend yang tapis —
    // collector boleh nampak data orang lain melalui Network tab (F12).
    if (authUser.role === 'collector') {
      query = query.eq('collector_id', authUser.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ sessions: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal ambil sesi latihan.' }, { status: 500 });
  }
}

export async function POST(req) {
  const { authError, authUser } = await requireAuthWithUser(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    if (!body.id || !body.collectorId) {
      return Response.json({ error: 'id dan collectorId diperlukan.' }, { status: 400 });
    }

    // Collector hanya boleh simpan sesi untuk diri sendiri — elak spoofing
    // (cth collector A hantar request dengan collectorId = collector B).
    if (authUser.role === 'collector' && body.collectorId !== authUser.id) {
      return Response.json({ error: 'Akses ditolak: tidak boleh simpan sesi untuk pengguna lain.' }, { status: 403 });
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
