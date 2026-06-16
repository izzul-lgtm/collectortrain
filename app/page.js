"use client";

import Script from "next/script";

// Markup ported as-is from the original collectortrain.html <body>.
// app.js (in /public) attaches all behaviour via plain DOM APIs and
// global onclick="..." handlers, exactly like the original file —
// it just now calls our own /api/tts and /api/claude routes instead
// of hitting ElevenLabs / Anthropic directly from the browser.
const BODY_HTML = `<!-- ═══════════════ AUTH SCREEN ═══════════════ -->
<div id="authScreen" class="screen active">
<div class="auth-wrap">
<div class="auth-box">
  <div class="auth-logo">
    <div class="auth-logo-icon">🎧</div>
    <div>
      <div class="auth-logo-text">CollectorTrain</div>
      <div class="auth-logo-sub">Debt Collection Training System</div>
    </div>
  </div>
  <div class="tabs">
    <button class="tab-btn active" onclick="switchAuthTab('login')">Log Masuk</button>
    <button class="tab-btn" onclick="switchAuthTab('register')">Daftar Akaun</button>
  </div>
  <div id="loginForm">
    <div id="loginAlert" style="display:none"></div>
    <div class="field"><label>ID Pekerja</label><input id="loginId" placeholder="cth: COL-001" /></div>
    <div class="field"><label>Kata Laluan</label>
      <div class="pw-wrap"><input id="loginPass" type="password" placeholder="••••••" />
      <button class="pw-eye" onclick="togglePw('loginPass',this)">👁</button></div>
    </div>
    <button class="btn btn-primary btn-full" onclick="doLogin()">Log Masuk</button>
    <p style="font-size:11px;color:var(--text3);text-align:center;margin-top:12px;">Demo: admin/admin123 | manager/mgr123 | collector/col123</p>
  </div>
  <div id="registerForm" style="display:none">
    <div id="regAlert" style="display:none"></div>
    <div class="field"><label>Nama Penuh</label><input id="regName" placeholder="Ahmad bin Hassan" /></div>
    <div class="field"><label>ID Pekerja</label><input id="regId" placeholder="COL-004" /><p class="field-hint">Digunakan untuk log masuk</p></div>
    <div class="field"><label>Kata Laluan</label>
      <div class="pw-wrap"><input id="regPass" type="password" placeholder="Min 6 aksara" />
      <button class="pw-eye" onclick="togglePw('regPass',this)">👁</button></div>
    </div>
    <div class="field"><label>Sahkan Kata Laluan</label>
      <div class="pw-wrap"><input id="regPass2" type="password" placeholder="Ulang kata laluan" />
      <button class="pw-eye" onclick="togglePw('regPass2',this)">👁</button></div>
    </div>
    <div class="field"><label>Daftar sebagai</label>
      <select id="regRole"><option value="collector">Collector</option><option value="manager">Manager</option><option value="admin">Admin</option></select>
    </div>
    <button class="btn btn-primary btn-full" onclick="doRegister()">Daftar Akaun</button>
  </div>
</div>
</div>
</div>

<!-- ═══════════════ MAIN APP ═══════════════ -->
<div id="mainApp" class="screen">
<div class="main-layout">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">🎧</div>
      <div><div class="sidebar-logo-text">CollectorTrain</div><div class="sidebar-logo-sub">Training System</div></div>
    </div>
    <div class="sidebar-user">
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="user-avatar" id="sidebarInitials">A</div>
        <div>
          <div class="user-name" id="sidebarName">—</div>
          <span class="user-role-badge" id="sidebarRoleBadge">—</span>
        </div>
      </div>
    </div>
    <nav class="nav" id="sidebarNav"></nav>
    <div class="sidebar-footer">
      <button class="btn btn-secondary btn-full" onclick="doLogout()">🚪 Log Keluar</button>
    </div>
  </div>

  <!-- CONTENT -->
  <div class="main-content" id="mainContent"></div>
</div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
  <div class="modal" id="modalBox"></div>
</div>
`;

export default function Page() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
