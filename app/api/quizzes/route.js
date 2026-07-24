// app/api/quizzes/route.js
// ─────────────────────────────────────────────────────────────────────────
// Weekly Quiz — wajib untuk collector (macam Assignments), admin/manager
// boleh set soalan manual ATAU auto-generate draf guna AI (Claude — client
// panggil /api/claude terus untuk generate draf JSON, SAMA pattern macam AI
// Scenario Builder dalam public/app.js; endpoint ni cuma simpan hasil akhir,
// tak kisah source dia manual atau AI).
//
// GET /api/quizzes                 -> senarai quiz (bentuk ikut role, lihat bawah)
// GET /api/quizzes?id=<quizId>     -> satu quiz + soalan (correctIndex disorok
//                                      dari collector SEHINGGA dia dah submit)
// GET /api/quizzes?tracking=<id>   -> (admin/manager) status semua collector
//                                      untuk quiz ni — pending/completed/overdue,
//                                      sama konsep macam statusBadge() Assignments
//
// POST /api/quizzes                -> (admin/manager) create/update quiz + soalan
// POST /api/quizzes?action=submit  -> (collector) hantar jawapan, dikira & dikunci
// POST /api/quizzes?action=publish -> (admin/manager) toggle published on/off
//
// DELETE /api/quizzes              -> (admin/manager) padam quiz
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { requireAuthWithUser } from '../../../lib/requireAuth';

function quizShape(row, questionCount) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    source: row.source,
    dueDate: row.due_date,
    published: row.published,
    createdBy: row.created_by,
    createdAt: row.created_at,
    questionCount: questionCount ?? undefined,
  };
}
// includeAnswer: admin/manager, atau collector yang DAH submit (untuk review) —
// bila false, correctIndex disorok supaya collector tak boleh cheat guna devtools.
function questionShape(row, includeAnswer) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    question: row.question,
    options: row.options || [],
    orderIndex: row.order_index,
    ...(includeAnswer ? { correctIndex: row.correct_index } : {}),
  };
}

export async function GET(request) {
  const { authError, authUser } = await requireAuthWithUser(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const trackingId = searchParams.get('tracking');
  const sb = supabaseAdmin();
  const isStaff = authUser.role === 'admin' || authUser.role === 'manager';

  try {
    // ── Tracking: siapa dah/belum jawab quiz ni (admin/manager sahaja) ──
    if (trackingId) {
      if (!isStaff) return Response.json({ error: 'Akses ditolak.' }, { status: 403 });
      const [{ data: quiz, error: qErr }, { data: users, error: uErr }, { data: attempts, error: aErr }] = await Promise.all([
        sb.from('quizzes').select('*').eq('id', trackingId).maybeSingle(),
        sb.from('users').select('id, name, role').eq('role', 'collector'),
        sb.from('quiz_attempts').select('*').eq('quiz_id', trackingId),
      ]);
      if (qErr) throw qErr;
      if (uErr) throw uErr;
      if (aErr) throw aErr;
      if (!quiz) return Response.json({ error: 'Quiz not found.' }, { status: 404 });
      const attemptByUser = {};
      (attempts || []).forEach(a => { attemptByUser[a.user_id] = a; });
      const todayStr = new Date().toISOString().slice(0, 10);
      const rows = (users || []).map(u => {
        const a = attemptByUser[u.id];
        let status = 'pending';
        if (a) status = 'completed';
        else if (quiz.due_date && quiz.due_date < todayStr) status = 'overdue';
        return {
          userId: u.id, userName: u.name, status,
          score: a ? a.score : null, total: a ? a.total : null,
          submittedAt: a ? a.submitted_at : null,
        };
      });
      return Response.json({ quiz: quizShape(quiz), rows });
    }

    // ── Satu quiz + soalan (untuk ambil/review) ──
    if (id) {
      const { data: quiz, error: qErr } = await sb.from('quizzes').select('*').eq('id', id).maybeSingle();
      if (qErr) throw qErr;
      if (!quiz) return Response.json({ error: 'Quiz not found.' }, { status: 404 });
      const { data: questions, error: qsErr } = await sb.from('quiz_questions').select('*').eq('quiz_id', id).order('order_index', { ascending: true });
      if (qsErr) throw qsErr;
      const { data: myAttempt } = await sb.from('quiz_attempts').select('*').eq('quiz_id', id).eq('user_id', authUser.id).maybeSingle();
      const showAnswers = isStaff || !!myAttempt;
      return Response.json({
        quiz: quizShape(quiz),
        questions: (questions || []).map(q => questionShape(q, showAnswers)),
        myAttempt: myAttempt ? { answers: myAttempt.answers, score: myAttempt.score, total: myAttempt.total, submittedAt: myAttempt.submitted_at } : null,
      });
    }

    // ── Senarai quiz ──
    const { data: quizzes, error } = await sb.from('quizzes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const { data: questionCounts } = await sb.from('quiz_questions').select('quiz_id');
    const countMap = {};
    (questionCounts || []).forEach(q => { countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1; });

    if (isStaff) {
      // Admin/manager nampak SEMUA quiz (termasuk draft belum publish).
      return Response.json({ quizzes: quizzes.map(q => quizShape(q, countMap[q.id] || 0)) });
    }

    // Collector: cuma quiz published, + status/skor diri sendiri.
    const published = (quizzes || []).filter(q => q.published);
    const { data: myAttempts } = await sb.from('quiz_attempts').select('*').eq('user_id', authUser.id);
    const attemptByQuiz = {};
    (myAttempts || []).forEach(a => { attemptByQuiz[a.quiz_id] = a; });
    const todayStr = new Date().toISOString().slice(0, 10);
    const shaped = published.map(q => {
      const a = attemptByQuiz[q.id];
      let myStatus = 'pending';
      if (a) myStatus = 'completed';
      else if (q.due_date && q.due_date < todayStr) myStatus = 'overdue';
      return { ...quizShape(q, countMap[q.id] || 0), myStatus, myScore: a ? a.score : null, myTotal: a ? a.total : null };
    });
    return Response.json({ quizzes: shaped });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to load quizzes.' }, { status: 500 });
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const sb = supabaseAdmin();

  // ── Collector submit jawapan ──
  if (action === 'submit') {
    const { authError, authUser } = await requireAuthWithUser(request);
    if (authError) return authError;
    try {
      const { quizId, answers } = await request.json();
      if (!quizId || !Array.isArray(answers)) {
        return Response.json({ error: 'quizId and answers[] are required.' }, { status: 400 });
      }
      const { data: existing } = await sb.from('quiz_attempts').select('id').eq('quiz_id', quizId).eq('user_id', authUser.id).maybeSingle();
      if (existing) return Response.json({ error: 'Anda dah submit quiz ini sebelum ini.' }, { status: 409 });

      const { data: questions, error: qErr } = await sb.from('quiz_questions').select('*').eq('quiz_id', quizId).order('order_index', { ascending: true });
      if (qErr) throw qErr;
      if (!questions || questions.length === 0) return Response.json({ error: 'Quiz ini tiada soalan.' }, { status: 400 });

      let score = 0;
      questions.forEach((q, i) => { if (Number(answers[i]) === q.correct_index) score++; });

      const id = 'qatt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const { error } = await sb.from('quiz_attempts').insert({
        id, quiz_id: quizId, user_id: authUser.id, answers, score, total: questions.length, submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
      return Response.json({ score, total: questions.length, correctIndexes: questions.map(q => q.correct_index) });
    } catch (e) {
      return Response.json({ error: e.message || 'Failed to submit quiz.' }, { status: 500 });
    }
  }

  // ── Toggle publish ──
  if (action === 'publish') {
    const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
    if (authError) return authError;
    try {
      const { id, published } = await request.json();
      if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
      const { data, error } = await sb.from('quizzes').update({ published: !!published }).eq('id', id).select().single();
      if (error) throw error;
      return Response.json({ quiz: quizShape(data) });
    } catch (e) {
      return Response.json({ error: e.message || 'Failed to update quiz.' }, { status: 500 });
    }
  }

  // ── Create / update quiz + questions (admin/manager) ──
  const { authError, authUser } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const body = await request.json();
    if (!body.title || !body.title.trim()) return Response.json({ error: 'title is required.' }, { status: 400 });
    const questions = Array.isArray(body.questions) ? body.questions : [];
    if (questions.length === 0) return Response.json({ error: 'At least 1 question is required.' }, { status: 400 });
    for (const q of questions) {
      if (!q.question || !Array.isArray(q.options) || q.options.length < 2 || q.correctIndex === undefined || q.correctIndex === null) {
        return Response.json({ error: 'Every question needs text, 2+ options, and a correctIndex.' }, { status: 400 });
      }
    }

    let quizId = body.id;
    if (quizId) {
      const { error } = await sb.from('quizzes').update({
        title: body.title.trim(), description: body.description || null,
        source: body.source === 'ai' ? 'ai' : 'manual', due_date: body.dueDate || null,
      }).eq('id', quizId);
      if (error) throw error;
      // Ganti semua soalan lama dengan set baru — lebih ringkas & selamat
      // (elak isu diff/reorder id lama) berbanding cuba upsert individu.
      // OK sebab quiz belum boleh diedit lepas ada attempt (dicegah di UI).
      await sb.from('quiz_questions').delete().eq('quiz_id', quizId);
    } else {
      quizId = 'quiz_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const { error } = await sb.from('quizzes').insert({
        id: quizId, title: body.title.trim(), description: body.description || null,
        source: body.source === 'ai' ? 'ai' : 'manual', due_date: body.dueDate || null,
        published: false, created_by: authUser.id,
      });
      if (error) throw error;
    }

    const rows = questions.map((q, i) => ({
      id: 'qq_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
      quiz_id: quizId, question: q.question.trim(), options: q.options, correct_index: Number(q.correctIndex), order_index: i,
    }));
    const { error: insErr } = await sb.from('quiz_questions').insert(rows);
    if (insErr) throw insErr;

    const { data: quiz } = await sb.from('quizzes').select('*').eq('id', quizId).single();
    return Response.json({ quiz: quizShape(quiz, rows.length) });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to save quiz.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { authError } = await requireAuthWithUser(request, { roles: ['admin', 'manager'] });
  if (authError) return authError;
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from('quizzes').delete().eq('id', id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || 'Failed to delete quiz.' }, { status: 500 });
  }
}
