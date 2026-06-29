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
    <div class="hero-headline">Train your skills.<br>Elevate <em>performance</em>.</div>
    <div class="hero-tagline">AI-powered voice training platform for the Newvest Recoveries collection team.</div>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="hero-stat-val">AI</div>
        <div class="hero-stat-label">Virtual Debtor</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val">3</div>
        <div class="hero-stat-label">Accents Supported</div>
      </div>
      <div class="hero-stat">
        <div class="hero-stat-val">∞</div>
        <div class="hero-stat-label">Training Scenarios</div>
      </div>
    </div>
    <div class="hero-dots">
      ${Array(36).fill('<div class="hero-dot"></div>').join('')}
    </div>
  </div>

  <!-- Right: Form Panel -->
  <div class="auth-form-panel">
    <div class="auth-box">
      <div class="auth-form-title">Welcome 👋</div>
      <div class="auth-form-sub">Sign in to start your training session</div>

      <div class="tabs">
        <button class="tab-btn active" onclick="switchAuthTab('login')">Sign In</button>
        <button class="tab-btn" onclick="switchAuthTab('register')">Register Account</button>
      </div>

      <div id="loginForm">
        <div id="loginAlert" style="display:none"></div>
        <div class="field">
          <label>Employee ID</label>
          <input id="loginId" placeholder="e.g. COL-001" />
        </div>
        <div class="field">
          <label>Password</label>
          <div class="pw-wrap">
            <input id="loginPass" type="password" placeholder="••••••" />
            <button class="pw-eye" onclick="togglePw('loginPass',this)">👁</button>
          </div>
        </div>
        <button class="btn btn-primary btn-full" onclick="doLogin()">Sign In</button>
        <div class="demo-hint">
          <strong>Demo:</strong> admin / admin123 &nbsp;·&nbsp; manager / mgr123 &nbsp;·&nbsp; collector / col123
        </div>
      </div>

      <div id="registerForm" style="display:none">
        <div id="regAlert" style="display:none"></div>
        <div class="field"><label>Full Name</label><input id="regName" placeholder="Ahmad bin Hassan" /></div>
        <div class="field">
          <label>Employee ID</label>
          <input id="regId" placeholder="COL-004" />
          <p class="field-hint">Used for sign in</p>
        </div>
        <div class="field">
          <label>Password</label>
          <div class="pw-wrap">
            <input id="regPass" type="password" placeholder="Min 6 characters" />
            <button class="pw-eye" onclick="togglePw('regPass',this)">👁</button>
          </div>
        </div>
        <div class="field">
          <label>Confirm Password</label>
          <div class="pw-wrap">
            <input id="regPass2" type="password" placeholder="Re-enter password" />
            <button class="pw-eye" onclick="togglePw('regPass2',this)">👁</button>
          </div>
        </div>
        <div style="background:#fff8e1;border:1px solid #f9a825;border-radius:8px;padding:10px 12px;font-size:12px;color:#e65100;margin-bottom:10px;line-height:1.6">
          ⏳ <strong>Account requires approval.</strong> This registers a Collector account. After registering, your account will be reviewed by a manager or admin before you can sign in. (Need a Manager/Admin account? Ask an existing admin to create one for you, or register here and ask an admin to upgrade your role afterwards.)
        </div>
        <button class="btn btn-primary btn-full" onclick="doRegister()">Register Account</button>
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
      <button class="btn btn-secondary btn-full" onclick="doLogout()">🚪 Sign Out</button>
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
