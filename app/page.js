"use client";

import Script from "next/script";

const BODY_HTML = `<!-- ═══════════ AUTH SCREEN ═══════════ -->
<div id="authScreen" class="screen active">
<div class="auth-wrap">

  <!-- Left: Hero Panel -->
  <div class="auth-hero">
    <div class="hero-brand">
      <div class="hero-brand-icon">🎧</div>
      <div>
        <div class="hero-brand-text">CollectorTrain</div>
        <div class="hero-brand-sub">Debt Collection Training System</div>
      </div>
    </div>
    <div class="hero-headline">Latih kemahiran.<br>Tingkat <em>prestasi</em>.</div>
    <div class="hero-tagline">Platform latihan suara berasaskan AI untuk pasukan collection Newvest Recoveries.</div>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-val">AI</div>
        <div class="hero-stat-label">Penghutang Maya</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val">3</div>
        <div class="hero-stat-label">Loghat Disokong</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val">∞</div>
        <div class="hero-stat-label">Senario Latihan</div>
      </div>
    </div>
    <div class="hero-dots">
      ${Array(36).fill('<div class="hero-dot"></div>').join('')}
    </div>
  </div>

  <!-- Right: Form Panel -->
  <div class="auth-form-panel">
    <div class="auth-box">
      <div class="auth-form-title">Selamat datang 👋</div>
      <div class="auth-form-sub">Log masuk untuk memulakan sesi latihan</div>

      <div class="tabs">
        <button class="tab-btn active" onclick="switchAuthTab('login')">Log Masuk</button>
        <button class="tab-btn" onclick="switchAuthTab('register')">Daftar Akaun</button>
      </div>

      <div id="loginForm">
        <div id="loginAlert" style="display:none"></div>
        <div class="field">
          <label>ID Pekerja</label>
          <input id="loginId" placeholder="cth: COL-001" />
        </div>
        <div class="field">
          <label>Kata Laluan</label>
          <div class="pw-wrap">
            <input id="loginPass" type="password" placeholder="••••••" />
            <button class="pw-eye" onclick="togglePw('loginPass',this)">👁</button>
          </div>
        </div>
        <button class="btn btn-primary btn-full" onclick="doLogin()">Log Masuk</button>
        <div class="demo-hint">
          <strong>Demo:</strong> admin / admin123 &nbsp;·&nbsp; manager / mgr123 &nbsp;·&nbsp; collector / col123
        </div>
      </div>

      <div id="registerForm" style="display:none">
        <div id="regAlert" style="display:none"></div>
        <div class="field"><label>Nama Penuh</label><input id="regName" placeholder="Ahmad bin Hassan" /></div>
        <div class="field">
          <label>ID Pekerja</label>
          <input id="regId" placeholder="COL-004" />
          <p class="field-hint">Digunakan untuk log masuk</p>
        </div>
        <div class="field">
          <label>Kata Laluan</label>
          <div class="pw-wrap">
            <input id="regPass" type="password" placeholder="Min 6 aksara" />
            <button class="pw-eye" onclick="togglePw('regPass',this)">👁</button>
          </div>
        </div>
        <div class="field">
          <label>Sahkan Kata Laluan</label>
          <div class="pw-wrap">
            <input id="regPass2" type="password" placeholder="Ulang kata laluan" />
            <button class="pw-eye" onclick="togglePw('regPass2',this)">👁</button>
          </div>
        </div>
        <div class="field">
          <label>Daftar sebagai</label>
          <select id="regRole">
            <option value="collector">Collector</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="btn btn-primary btn-full" onclick="doRegister()">Daftar Akaun</button>
      </div>
    </div>
  </div>

</div>
</div>

<!-- ═══════════ MAIN APP ═══════════ -->
<div id="mainApp" class="screen">
<div class="main-layout">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">🎧</div>
      <div>
        <div class="sidebar-logo-text">CollectorTrain</div>
        <div class="sidebar-logo-sub">Training System</div>
      </div>
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
