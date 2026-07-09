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
    scoreMax: row.score_max || null,
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
    score_max: data.scoreMax || null,
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

    // ── Daily session cap (enforce di server, BUKAN client-side saja —
    // collector tak boleh bypass dengan edit JS di browser) ──────────────
    if (authUser.role === 'collector') {
      const { data: userRow, error: userErr } = await sb
        .from('users')
        .select('max_sessions_per_day')
        .eq('id', authUser.id)
        .maybeSingle();
      if (userErr) throw userErr;
      const cap = userRow?.max_sessions_per_day;
      if (cap != null) {
        // BUGFIX: server (Vercel) run dalam UTC, BUKAN waktu Malaysia — `new
        // Date().setHours(0,0,0,0)` di server bagi tengah malam UTC, jadi had
        // sesi harian collector akan reset pukul 8 PAGI waktu Malaysia,
        // bukan tengah malam macam sepatutnya. Malaysia (Asia/Kuala_Lumpur)
        // tetap UTC+8 sepanjang tahun (tiada DST), jadi guna offset tetap ni
        // untuk kira tengah malam waktu Malaysia, convert balik ke UTC instant.
        const MY_OFFSET_MS = 8 * 60 * 60 * 1000;
        const nowMY = new Date(Date.now() + MY_OFFSET_MS);
        const todayStartMY_asUTC = Date.UTC(nowMY.getUTCFullYear(), nowMY.getUTCMonth(), nowMY.getUTCDate(), 0, 0, 0);
        const todayStart = new Date(todayStartMY_asUTC - MY_OFFSET_MS);
        const { count, error: countErr } = await sb
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('collector_id', authUser.id)
          .gte('created_at', todayStart.toISOString());
        if (countErr) throw countErr;
        if ((count || 0) >= cap) {
          return Response.json({ error: `Daily session limit reached (${cap} session${cap > 1 ? 's' : ''}/day). Please try again tomorrow, or ask your manager to adjust your limit.` }, { status: 429 });
        }
      }
    }

    const { data, error } = await sb
      .from('sessions')
      .insert(toDbShape(body))
      .select()
      .single();
    if (error) throw error;

    // ── Auto-complete matching assignment, kalau sesi ni padan dengan
    // assignment "pending" untuk collector & scenario yang sama ───────────
    if (body.collectorId && body.scenarioId) {
      await sb
        .from('assignments')
        .update({ status: 'completed', completed_session_id: data.id, completed_at: new Date().toISOString() })
        .eq('collector_id', body.collectorId)
        .eq('scenario_id', body.scenarioId)
        .eq('status', 'pending');
    }

    return Response.json({ session: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Gagal simpan sesi latihan.' }, { status: 500 });
  }
}
