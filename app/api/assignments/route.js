// app/api/assignments/route.js
// ─────────────────────────────────────────────────────────────────────────
// Manager-assigned mandatory scenarios — manager/admin assign a scenario
// ke collector tertentu dengan due date. Collector nampak "Assigned to you"
// di Training page, manager nampak progress (pending/completed/overdue)
// di sini. Status 'completed' di-set automatik bila collector submit sesi
// untuk scenario yang sama (lihat app/api/sessions/route.js POST).
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function toClientShape(row) {
  return {
    id: row.id,
    collectorId: row.collector_id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    assignedBy: row.assigned_by,
    dueDate: row.due_date,
    status: row.status,
    completedSessionId: row.completed_session_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const sb = supabaseAdmin();
    let query = sb.from('assignments').select('*').order('created_at', { ascending: false });
    // Collector hanya nampak assignment sendiri; manager/admin nampak semua.
    if (authUser.role === 'collector') {
      query = query.eq('collector_id', authUser.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ assignments: (data || []).map(toClientShape) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load assignments.' }, { status: 500 });
  }
}

export async function POST(request) {
  // Hanya manager/admin boleh assign scenario wajib ke collector.
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.collectorId || !body.scenarioId) {
      return Response.json({ error: 'collectorId and scenarioId are required.' }, { status: 400 });
    }
    const sb = supabaseAdmin();
    const id = 'asg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const { data, error } = await sb
      .from('assignments')
      .insert({
        id,
        collector_id: body.collectorId,
        scenario_id: body.scenarioId,
        scenario_name: body.scenarioName || '',
        assigned_by: authUser.id,
        due_date: body.dueDate || null,
        status: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return Response.json({ assignment: toClientShape(data) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to create assignment.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  // Cancel assignment — manager/admin sahaja (cth assign tersilap, atau scenario dah tak relevan).
  const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from('assignments').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to cancel assignment.' }, { status: 500 });
  }
}
