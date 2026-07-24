// app/api/learning/route.js
// ─────────────────────────────────────────────────────────────────────────
// Learning Modules — kandungan pembelajaran berstruktur (bacaan/video/SOP)
// tersusun ikut step, terutamanya untuk onboarding staf baru. Admin/manager
// urus kandungan (create/edit/delete module & step), SEMUA role boleh baca
// & tanda step siap.
//
// GET /api/learning
//   -> { modules: [{ ...module, steps: [...] }], completedStepIds: [...] }
//   completedStepIds = step yang USER SEMASA dah tandakan selesai (bukan
//   agregat semua orang — tu untuk manager punya "progress overview" kalau
//   nak ditambah kelak, out of scope buat masa ni).
//
// POST /api/learning   (admin/manager sahaja)
//   { kind:'module', title, description?, orderIndex? }              -> create module
//   { kind:'module', id, title, description?, orderIndex? }          -> update module
//   { kind:'step', moduleId, title, contentType, content, orderIndex? } -> create step
//   { kind:'step', id, title, contentType, content, orderIndex? }       -> update step
//
// PATCH /api/learning   (semua role — tanda step siap/belum untuk diri sendiri)
//   { stepId, done:true }  -> mark complete
//   { stepId, done:false } -> unmark (kalau tersalah klik)
//
// DELETE /api/learning   (admin/manager sahaja)
//   { kind:'module', id }  -> padam module (cascade padam semua steps & progress)
//   { kind:'step', id }    -> padam satu step sahaja
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function moduleShape(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    orderIndex: row.order_index,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
function stepShape(row) {
  return {
    id: row.id,
    moduleId: row.module_id,
    title: row.title,
    contentType: row.content_type,
    content: row.content,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const sb = supabaseAdmin();
    const [{ data: modulesRaw, error: mErr }, { data: stepsRaw, error: sErr }, { data: progressRaw, error: pErr }] = await Promise.all([
      sb.from('learning_modules').select('*').order('order_index', { ascending: true }),
      sb.from('learning_steps').select('*').order('order_index', { ascending: true }),
      sb.from('learning_progress').select('step_id').eq('user_id', authUser.id),
    ]);
    if (mErr) throw mErr;
    if (sErr) throw sErr;
    if (pErr) throw pErr;

    const steps = (stepsRaw || []).map(stepShape);
    const modules = (modulesRaw || []).map(m => ({
      ...moduleShape(m),
      steps: steps.filter(s => s.moduleId === m.id),
    }));
    const completedStepIds = (progressRaw || []).map(p => p.step_id);
    return Response.json({ modules, completedStepIds });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load learning modules.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    const sb = supabaseAdmin();

    if (body.kind === 'module') {
      if (!body.title || !body.title.trim()) {
        return Response.json({ error: 'title is required.' }, { status: 400 });
      }
      if (body.id) {
        const { data, error } = await sb
          .from('learning_modules')
          .update({ title: body.title.trim(), description: body.description || null, order_index: body.orderIndex ?? 0 })
          .eq('id', body.id)
          .select()
          .single();
        if (error) throw error;
        return Response.json({ module: moduleShape(data) });
      }
      const id = 'lmod_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const { data, error } = await sb
        .from('learning_modules')
        .insert({ id, title: body.title.trim(), description: body.description || null, order_index: body.orderIndex ?? 0, created_by: authUser.id })
        .select()
        .single();
      if (error) throw error;
      return Response.json({ module: moduleShape(data) });
    }

    if (body.kind === 'step') {
      if (!body.title || !body.title.trim() || !body.content || !body.content.trim()) {
        return Response.json({ error: 'title and content are required.' }, { status: 400 });
      }
      const contentType = ['text', 'video', 'link', 'file'].includes(body.contentType) ? body.contentType : 'text';
      if (body.id) {
        const { data, error } = await sb
          .from('learning_steps')
          .update({ title: body.title.trim(), content_type: contentType, content: body.content.trim(), order_index: body.orderIndex ?? 0 })
          .eq('id', body.id)
          .select()
          .single();
        if (error) throw error;
        return Response.json({ step: stepShape(data) });
      }
      if (!body.moduleId) return Response.json({ error: 'moduleId is required.' }, { status: 400 });
      const id = 'lstep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const { data, error } = await sb
        .from('learning_steps')
        .insert({ id, module_id: body.moduleId, title: body.title.trim(), content_type: contentType, content: body.content.trim(), order_index: body.orderIndex ?? 0 })
        .select()
        .single();
      if (error) throw error;
      return Response.json({ step: stepShape(data) });
    }

    return Response.json({ error: "kind must be 'module' or 'step'." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to save.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  // Sesiapa yang log masuk boleh tanda progress diri sendiri — tiada
  // roles restriction (admin/manager pun boleh ikut sekali kalau nak).
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.stepId) return Response.json({ error: 'stepId is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    if (body.done === false) {
      const { error } = await sb.from('learning_progress').delete().eq('user_id', authUser.id).eq('step_id', body.stepId);
      if (error) throw error;
      return Response.json({ ok: true, done: false });
    }
    const { error } = await sb.from('learning_progress').upsert({ user_id: authUser.id, step_id: body.stepId, completed_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ ok: true, done: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to update progress.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { kind, id } = await request.json();
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    const table = kind === 'step' ? 'learning_steps' : 'learning_modules';
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete.' }, { status: 500 });
  }
}
