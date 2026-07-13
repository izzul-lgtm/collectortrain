// lib/auditLog.js
// ─────────────────────────────────────────────────────────────────────────────
// Rekod tindakan sensitif admin/manager (reset password, delete user, tukar
// role, approve/reject akaun, set daily limit) ke jadual `audit_log`.
//
// PENTING: logAudit() SENGAJA tak pernah throw — kalau insert audit log
// gagal (cth DB down), tindakan sebenar (cth reset password) MESTI tetap
// berjaya. Audit log ni "nice to have visibility", bukan critical path;
// kita tak nak block operasi penting sebab audit trail gagal simpan.
// ─────────────────────────────────────────────────────────────────────────────

export async function logAudit(sb, { actorId, actorName, action, targetId, targetName, details }) {
  try {
    await sb.from('audit_log').insert({
      id: `AL${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      actor_id: actorId || 'unknown',
      actor_name: actorName || '',
      action,
      target_id: targetId || null,
      target_name: targetName || '',
      details: details || {},
    });
  } catch (err) {
    // Sengaja senyap — jangan biar audit log gagal patahkan tindakan sebenar.
    console.error('[auditLog] Gagal simpan audit log:', err.message);
  }
}
