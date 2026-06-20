// ═══════════ DATABASE (localStorage — kosong sekarang, semua dah pindah ke Supabase) ═══════════
const DB = {
  get(k){try{return JSON.parse(localStorage.getItem('ct_'+k)||'null');}catch{return null;}},
  set(k,v){localStorage.setItem('ct_'+k,JSON.stringify(v));}
  // Nota: getSessions()/addSession() (localStorage) dah dibuang — sessions
  // sekarang hidup di Supabase (jadual `sessions`), diakses melalui
  // sessionApi di bawah, bukan DB.getSessions()/addSession() lagi.
  // Nota: defaultUsers()/getUsers()/saveUsers() (localStorage) dah dibuang —
  // users sekarang hidup di Supabase (jadual `users`, password di-hash
  // bcrypt), diakses melalui userApi di bawah, bukan DB.getUsers() lagi.
  // Nota: defaultScenarios() (localStorage) dah dibuang — senario sekarang
  // hidup di Supabase (jadual `scenarios`, lihat supabase/schema.sql untuk
  // seed data 4 senario default) dan diakses melalui scenarioApi di bawah,
  // bukan DB.getScenarios()/saveScenarios() lagi.
};

// ═══════════ SCENARIOS API (Supabase, via /api/scenarios) ═══════════
// PUNCA PERUBAHAN: scenarios dulu hidup dalam localStorage (DB.getScenarios/
// saveScenarios) — bermakna setiap collector/manager nampak senario yang
// tersimpan di BROWSER MASING-MASING, tak shared, hilang kalau cache clear.
// Sekarang scenarios disimpan dalam Supabase (jadual `scenarios`), diakses
// melalui /api/scenarios — SATU sumber data untuk semua orang, semua device.
// Nota: fungsi-fungsi ni async (perlu `await`) sebab kini panggilan network,
// bukan baca localStorage yang instant — semua caller pun ditukar jadi async.
const scenarioApi = {
  async list(){
    const res=await fetch('/api/scenarios');
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil senario.');
    return data.scenarios||[];
  },
  async save(scenario){
    const res=await fetch('/api/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(scenario)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal simpan senario.');
    return data.scenario;
  },
  async remove(id){
    const res=await fetch('/api/scenarios',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal padam senario.');
    return true;
  }
};

// ═══════════ SESSIONS API (Supabase, via /api/sessions) ═══════════
// Sama sebab macam scenarios & users — sessions (rekod & skor latihan)
// dulu hidup dalam localStorage, tak shared antara device/browser. Kini
// di Supabase (jadual `sessions`) — manager boleh nampak SEMUA rekod
// collector dari mana-mana device, bukan terhad ke browser collector tu.
const sessionApi = {
  async list(){
    const res=await fetch('/api/sessions');
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil sesi latihan.');
    return data.sessions||[];
  },
  async create(sessionData){
    const res=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sessionData)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal simpan sesi latihan.');
    return data.session;
  }
};
let sessionsCache=null;
async function loadSessions(force){
  if(sessionsCache&&!force)return sessionsCache;
  sessionsCache=await sessionApi.list();
  return sessionsCache;
}

// ═══════════ USERS API (Supabase, via /api/users + /api/auth/*) ═══════
// Sama sebab macam scenarios di atas — users (admin/manager/collector)
// dulu hidup dalam localStorage (plaintext password pun di situ, boleh
// terus dibaca dalam app.js source!). Sekarang password di-hash (bcrypt)
// dan disimpan di Supabase; verify password buat di SERVER (app/api/
// auth/login) — password mentah tak pernah sampai balik ke browser lagi.
const userApi = {
  async list(){
    const res=await fetch('/api/users');
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil senarai pengguna.');
    return data.users||[];
  },
  async remove(id){
    const res=await fetch('/api/users',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal padam pengguna.');
    return true;
  },
  async login(id,pass){
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,pass})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal log masuk.');
    return data.user;
  },
  async register(id,name,pass,role){
    const res=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,pass,role})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal daftar pengguna.');
    return data.user;
  },
  async session(id){
    const res=await fetch('/api/auth/session?id='+encodeURIComponent(id));
    const data=await res.json();
    if(!res.ok)return null; // sesi tak sah/ID dah dipadam — biar fallback ke login screen
    return data.user;
  }
};
let usersCache=null;
async function loadUsers(force){
  if(usersCache&&!force)return usersCache;
  usersCache=await userApi.list();
  return usersCache;
}
function findUserById(usersArr,id){return (usersArr||[]).find(u=>u.id===id);}

// ═══════════ KATEGORI PENILAIAN ═══════════
const SCORE_CATS = ['tone','delivery','counter','action','balance'];
function catLabel(cat){
  return {tone:'Tone / Nada',delivery:'Cara Penyampaian',counter:'Hujah Balas (Counter)',action:'Tindakan & Pematuhan',balance:'Strategi Baki Hutang'}[cat]||cat;
}
function catIcon(cat){
  return {tone:'🗣',delivery:'📣',counter:'🛡',action:'✅',balance:'⚖️'}[cat]||'•';
}
// Sokong sesi lama (format communication/empathy/compliance/effectiveness) & sesi baru (format scores{})
function scoreRows(s){
  if(s.scores){
    return SCORE_CATS.map(c=>[catLabel(c),s.scores[c]||0,20]);
  }
  return [['Komunikasi',s.communication||0,25],['Empati',s.empathy||0,25],['Pematuhan',s.compliance||0,25],['Keberkesanan',s.effectiveness||0,25]];
}
function harassmentBadge(risk){
  if(!risk||risk==='none')return '';
  const map={low:{label:'Risiko Rendah',cls:'chip-amber'},medium:{label:'Risiko Sederhana',cls:'chip-amber'},high:{label:'Risiko Tinggi',cls:'chip-red'}};
  const m=map[risk]||{label:risk,cls:'chip-red'};
  return `<span class="chip ${m.cls}" style="margin-left:6px">⚠ Harassment: ${m.label}</span>`;
}
// Kira aspek mana paling kerap tersilap, daripada senarai sesi (tally s.missed[].category)
function tallyWeakness(sessions){
  const tally={};
  sessions.forEach(s=>(s.missed||[]).forEach(m=>{tally[m.category]=(tally[m.category]||0)+1;}));
  return Object.entries(tally).sort((a,b)=>b[1]-a[1]);
}
function topWeaknessLabel(sessions){
  const t=tallyWeakness(sessions);
  return t.length?catLabel(t[0][0]):'-';
}
// Kalau AI tak return priorityFocus (cth versi lama/response tak sempurna),
// kira sendiri dari skor 5 aspek paling rendah + cadangan "missed" yang sepadan
function fallbackPriority(scores,missed){
  const entries=Object.entries(scores||{});
  if(!entries.length)return null;
  const lowestCat=entries.sort((a,b)=>a[1]-b[1])[0][0];
  const match=(missed||[]).find(m=>m.category===lowestCat);
  return {category:lowestCat,tip:match?match.suggestion:('Fokus perbaiki aspek '+catLabel(lowestCat)+' dalam latihan akan datang.')};
}

// ═══════════ STATE ═══════════
let currentUser=null, currentPage='';
let scenario=null, callHistory=[], callSeconds=0, timerInterval=null;
let recognition=null, isRecording=false, callActive=false;
let audioQueue=[], isPlayingAudio=false, currentAudio=null;

// ═══════════ AUTH ═══════════
function switchAuthTab(tab){
  document.querySelectorAll('.tab-btn').forEach((t,i)=>t.classList.toggle('active',(tab==='login'&&i===0)||(tab==='register'&&i===1)));
  document.getElementById('loginForm').style.display=tab==='login'?'block':'none';
  document.getElementById('registerForm').style.display=tab==='register'?'block':'none';
}
function togglePw(id,btn){const i=document.getElementById(id);i.type=i.type==='password'?'text':'password';btn.textContent=i.type==='password'?'👁':'🙈';}
function showAlert(id,msg,type){const el=document.getElementById(id);el.className='alert alert-'+(type==='ok'?'ok':'err');el.textContent=msg;el.style.display='block';if(type==='ok')setTimeout(()=>el.style.display='none',3000);}

async function doLogin(){
  const id=document.getElementById('loginId').value.trim().toUpperCase();
  const pass=document.getElementById('loginPass').value;
  if(!id||!pass){showAlert('loginAlert','Sila isi semua maklumat.','err');return;}
  const btn=document.querySelector('#loginForm .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Log masuk...';}
  try{
    const user=await userApi.login(id,pass);
    currentUser=user;
    localStorage.setItem('ct_session_id',user.id); // supaya refresh page tak terus logout
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    initApp();
  }catch(e){
    showAlert('loginAlert',e.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Log Masuk';}
  }
}

async function doRegister(){
  const name=document.getElementById('regName').value.trim();
  const id=document.getElementById('regId').value.trim().toUpperCase();
  const pass=document.getElementById('regPass').value;
  const pass2=document.getElementById('regPass2').value;
  const role=document.getElementById('regRole').value;
  if(!name||!id||!pass){showAlert('regAlert','Sila isi semua maklumat.','err');return;}
  if(pass.length<6){showAlert('regAlert','Kata laluan min 6 aksara.','err');return;}
  if(pass!==pass2){showAlert('regAlert','Kata laluan tidak sepadan.','err');return;}
  const btn=document.querySelector('#registerForm .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Mendaftar...';}
  try{
    await userApi.register(id,name,pass,role);
    showAlert('regAlert','Berjaya didaftar! Sila log masuk.','ok');
    setTimeout(()=>{switchAuthTab('login');document.getElementById('loginId').value=id;},1500);
  }catch(e){
    showAlert('regAlert',e.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Daftar Akaun';}
  }
}

function doLogout(){
  currentUser=null;
  usersCache=null; // elak data pengguna sebelum ni terbawa kalau orang lain login di device sama
  localStorage.removeItem('ct_session_id');
  stopCall();
  document.getElementById('mainApp').classList.remove('active');
  document.getElementById('authScreen').classList.add('active');
  document.getElementById('loginPass').value='';
}

// ═══════════ APP INIT ═══════════
function initApp(){
  const ini=currentUser.name.split(' ').filter(w=>w.length>1).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sidebarInitials').textContent=ini;
  document.getElementById('sidebarName').textContent=currentUser.name;
  const rb=document.getElementById('sidebarRoleBadge');
  rb.textContent=currentUser.role==='admin'?'Admin':currentUser.role==='manager'?'Manager':'Collector';
  rb.className='user-role-badge badge-'+currentUser.role;
  buildNav();
  navigate(currentUser.role==='collector'?'training':'dashboard');
}

function buildNav(){
  const nav=document.getElementById('sidebarNav');
  const adminItems=[
    {page:'dashboard',icon:'📈',label:'Dashboard'},
    {page:'collectors',icon:'👥',label:'Semua Collector'},
    {page:'sessions',icon:'📋',label:'Sesi Latihan'},
    {page:'scenarios',icon:'🎭',label:'Urus Senario'},
    {page:'users',icon:'👤',label:'Urus Pengguna'},
  ];
  const items={
    collector:[
      {page:'training',icon:'🎯',label:'Latihan Suara'},
      {page:'my-history',icon:'📊',label:'Rekod Saya'},
    ],
    // Manager: akses penuh sama macam admin ("manager support can access all")
    manager:adminItems,
    admin:adminItems
  };
  const myItems=items[currentUser.role]||items.collector;
  nav.innerHTML=myItems.map(i=>`<div class="nav-item" id="nav-${i.page}" onclick="navigate('${i.page}')"><span class="nav-icon">${i.icon}</span>${i.label}</div>`).join('');
}

function navigate(page){
  currentPage=page;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navEl=document.getElementById('nav-'+page);
  if(navEl)navEl.classList.add('active');
  const pages={
    'dashboard':renderDashboard,
    'training':renderTraining,
    'my-history':renderMyHistory,
    'collectors':renderCollectors,
    'sessions':renderSessions,
    'scenarios':renderScenarios,
    'users':renderUsers,
    'call':renderCallScreen,
    'score':renderScoreScreen
  };
  if(pages[page])pages[page]();
}

// ═══════════ PAGES ═══════════
async function renderDashboard(){
  const sessions=await loadSessions();
  const users=await loadUsers();
  const collectors=users.filter(u=>u.role==='collector');
  const totalSessions=sessions.length;
  const avgScore=sessions.length?Math.round(sessions.reduce((a,s)=>a+s.totalScore,0)/sessions.length):0;
  const todaySessions=sessions.filter(s=>s.date&&s.date.startsWith(new Date().toISOString().slice(0,10))).length;
  const topCollector=collectors.map(c=>{const cs=sessions.filter(s=>s.collectorId===c.id);const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;return{...c,avg,count:cs.length};}).sort((a,b)=>b.avg-a.avg)[0];

  const recentSessions=sessions.slice(-10).reverse();
  const flaggedSessions=sessions.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none');
  const recentFlagged=flaggedSessions.slice(-6).reverse();
  const weakness=tallyWeakness(sessions);
  const weaknessTotal=weakness.reduce((a,[,c])=>a+c,0);

  setContent(`
  <div class="page-header"><div class="page-title">Dashboard</div><div class="page-sub">Overview prestasi collector</div></div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Jumlah Sesi</div><div class="stat-val">${totalSessions}</div><div class="stat-sub">Sesi latihan</div></div>
    <div class="stat-card"><div class="stat-label">Purata Markah</div><div class="stat-val">${avgScore}</div><div class="stat-sub">/ 100 mata</div></div>
    <div class="stat-card"><div class="stat-label">Sesi Hari Ini</div><div class="stat-val">${todaySessions}</div><div class="stat-sub">Latihan hari ini</div></div>
    <div class="stat-card"><div class="stat-label">Jumlah Collector</div><div class="stat-val">${collectors.length}</div><div class="stat-sub">Collector aktif</div></div>
    <div class="stat-card"><div class="stat-label">Isu Pematuhan</div><div class="stat-val" style="color:${flaggedSessions.length?'var(--red)':'inherit'}">${flaggedSessions.length}</div><div class="stat-sub">Sesi berisiko harassment</div></div>
  </div>
  <div class="two-col">
    <div class="card">
      <div class="card-title">Prestasi Per Collector</div>
      ${collectors.length===0?`<div class="empty-state"><div class="es-icon">👥</div><p>Tiada collector lagi</p></div>`:''}
      ${collectors.map(c=>{
        const cs=sessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;
        const pct=avg;
        return`<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px;font-weight:500">${c.name}</span>
            <span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${avg}</span>
          </div>
          <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${avg>=70?'#5CB85C':avg>=50?'#F0AD4E':'#E24B4A'};border-radius:3px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${cs.length} sesi</div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">Sesi Terbaru</div>
      ${recentSessions.length===0?`<div class="empty-state"><div class="es-icon">📋</div><p>Tiada sesi lagi</p></div>`:''}
      ${recentSessions.map(s=>{
        const u=findUserById(users,s.collectorId);
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${s.scenarioName} · ${s.duration}</div></div>
          <span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span>
        </div>`;
      }).join('')}
    </div>
  </div>
  <div class="two-col">
    <div class="card">
      <div class="card-title">🎯 Aspek Paling Kerap Tersilap (Seluruh Pasukan)</div>
      ${weakness.length===0?`<div class="empty-state"><div class="es-icon">📊</div><p>Belum cukup data sesi.</p></div>`:
      weakness.slice(0,5).map(([cat,count])=>{
        const pct=weaknessTotal?Math.round(count/weaknessTotal*100):0;
        return`<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:13px">${catIcon(cat)} ${catLabel(cat)}</span>
            <span style="font-size:12px;color:var(--text3)">${count}x dikesan</span>
          </div>
          <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--amber);border-radius:3px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">⚠ Isu Pematuhan / Harassment Terkini</div>
      ${recentFlagged.length===0?`<div class="empty-state"><div class="es-icon">✅</div><p>Tiada isu pematuhan dikesan setakat ini.</p></div>`:
      recentFlagged.map(s=>{
        const u=Object.values(users).find(u=>u.id===s.collectorId);
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${s.scenarioName}</div></div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="chip ${s.harassmentRisk==='high'?'chip-red':'chip-amber'}">⚠ ${s.harassmentRisk}</span>
            <button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" onclick="viewSession('${s.id}')">Lihat</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`);
}

// Cache senario dalam memory supaya selectScenario() (klik kad senario) tak
// perlu refetch network setiap kali — cuma reload bila benar-benar perlu
// (first load, atau lepas simpan/padam senario di halaman manager).
let scenariosCache=null;
async function loadScenarios(force){
  if(scenariosCache&&!force)return scenariosCache;
  scenariosCache=await scenarioApi.list();
  return scenariosCache;
}

async function renderTraining(){
  setContent('<div class="page-header"><div class="page-title">Latihan Suara</div></div><div class="card">Memuatkan senario...</div>');
  let scenarios;
  try{
    scenarios=await loadScenarios();
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Latihan Suara</div></div><div class="card">⚠ Gagal memuatkan senario: ${e.message}</div>`);
    return;
  }
  if(!scenario&&scenarios.length)scenario=scenarios[0];
  setContent(`
  <div class="page-header"><div class="page-title">Latihan Suara</div><div class="page-sub">Pilih senario dan mulakan panggilan latihan</div></div>
  <div class="card">
    <div class="card-title">Pilih Senario</div>
    <div class="sc-grid" id="scGrid">
      ${scenarios.map((s,i)=>`
      <div class="sc-card ${scenario&&scenario.id===s.id?'selected':''}" onclick="selectScenario('${s.id}')">
        <div class="sc-emoji">${s.emoji}</div>
        <div class="sc-name">${s.title}</div>
        <div class="sc-desc">${s.desc}</div>
        <span class="level-badge level-${s.level}">${s.level==='easy'?'Mudah':s.level==='med'?'Sederhana':'Sukar'}</span>
      </div>`).join('')}
    </div>
    ${scenario?`<div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 14px;margin-top:4px">
      <span style="font-weight:500;font-size:13px">${scenario.name}</span>
      <span style="color:var(--text3);font-size:12px"> · ${scenario.amount} · ${scenario.days} hari tunggakan</span>
    </div>`:''}
  </div>
  <button class="btn btn-primary" style="width:100%;padding:12px;font-size:15px" onclick="startCall()">🎙 Mula Panggilan Latihan</button>`);
}

function selectScenario(id){
  const scenarios=scenariosCache||[];
  scenario=scenarios.find(s=>s.id===id)||scenarios[0];
  renderTraining();
}

function renderCallScreen(){
  if(!scenario)return navigate('training');
  const ini=scenario.name.split(' ').filter(w=>w.length>1).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  setContent(`
  <div class="call-wrap">
    <div class="call-card">
      <div class="call-header">
        <div class="debtor-info">
          <div class="debtor-ava">${ini}</div>
          <div><div class="debtor-name">${scenario.name}</div><div class="debtor-sub">${scenario.title}</div></div>
        </div>
        <div class="call-timer" id="callTimer">00:00</div>
      </div>
      <div class="status-bar"><div class="status-dot green" id="statusDot"></div><span id="statusText">Sesi aktif</span></div>
      <div class="transcript" id="transcriptBox"></div>
      <div class="mic-area">
        <div class="live-text" id="liveText"></div>
        <button class="mic-btn" id="micBtn" onclick="toggleMic()"><span id="micIcon">🎙</span></button>
        <div class="mic-label" id="micLabel">Tekan untuk bercakap</div>
      </div>
    </div>
    <button class="btn btn-danger btn-full" onclick="endCall()">📵 Tamatkan Panggilan</button>
  </div>`);
}

function renderScoreScreen(){
  if(!window._lastScore)return navigate('training');
  const s=window._lastScore;
  setContent(`
  <div style="max-width:640px;margin:0 auto">
    <div class="page-header"><div class="page-title">Keputusan Latihan</div><div class="page-sub">${s.scenarioName} · ${s.duration}</div></div>
    <div class="card">
      <div class="score-hero">
        <div class="score-circle"><div class="score-big">${s.totalScore}</div><div class="score-of">/ 100</div></div>
        <div style="font-size:16px;font-weight:600;color:${s.totalScore>=70?'var(--green)':s.totalScore>=50?'var(--amber)':'var(--red)'}">
          ${s.totalScore>=70?'Cemerlang! 🏆':s.totalScore>=50?'Baik! Teruskan 💪':'Perlu Latihan Lagi 📚'}
        </div>
        ${harassmentBadge(s.harassmentRisk)}
      </div>
      ${s.harassmentRisk&&s.harassmentRisk!=='none'?`<div class="alert alert-err" style="display:block;margin-top:0">⚠ <strong>Isu Pematuhan/Harassment:</strong> ${s.harassmentNote||'Nada/ayat berisiko dikesan dalam panggilan ini.'}</div>`:''}
      <div class="score-rows">
        ${scoreRows(s).map(([l,v,m])=>`
        <div class="score-row">
          <span>${l}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="score-bar-wrap"><div class="score-bar" style="width:${m?v/m*100:0}%;background:${v/m<0.5?'#E24B4A':v/m<0.75?'#F0AD4E':'var(--purple)'}"></div></div>
            <span style="font-weight:600;color:var(--purple);min-width:40px;text-align:right">${v}/${m}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-title">💬 Maklum Balas AI</div>
      <p style="font-size:13px;color:var(--text2);line-height:1.7">${s.feedback}</p>
    </div>
    ${(s.strengths&&s.strengths.length)?`
    <div class="card">
      <div class="card-title">✅ Apa Yang Anda Sudah Buat Dengan Baik</div>
      ${s.strengths.map(t=>`<div style="display:flex;gap:8px;padding:6px 0;font-size:13px;color:var(--text2)"><span style="color:var(--green)">●</span><span>${t}</span></div>`).join('')}
    </div>`:''}
    ${(s.missed&&s.missed.length)?`
    <div class="card">
      <div class="card-title">🛠 Apa Yang Perlu Diperbaiki</div>
      ${s.missed.map(m=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="chip chip-red">${catIcon(m.category)} ${catLabel(m.category)}</span>
        </div>
        <div style="font-size:13px;color:var(--text);margin-bottom:3px"><strong>Isu:</strong> ${m.issue||''}</div>
        ${m.quote?`<div style="font-size:12px;color:var(--text3);font-style:italic;margin-bottom:3px">"${m.quote}"</div>`:''}
        <div style="font-size:13px;color:var(--purple)"><strong>Cadangan:</strong> ${m.suggestion||''}</div>
      </div>`).join('')}
    </div>`:''}
    ${s.priorityFocus?`
    <div class="card" style="border-left:4px solid var(--purple)">
      <div class="card-title">🎯 Fokus Latihan Akan Datang</div>
      <span class="chip chip-purple">${catIcon(s.priorityFocus.category)} ${catLabel(s.priorityFocus.category)}</span>
      <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:8px">${s.priorityFocus.tip||''}</p>
    </div>`:''}
    <div class="card">
      <div class="card-title">📝 Transcript Perbualan</div>
      <div style="max-height:300px;overflow-y:auto">
        ${(s.transcript||[]).map(m=>`<div style="margin-bottom:10px"><div style="font-size:11px;color:var(--text3);margin-bottom:2px">${m.role==='user'?currentUser.name:scenario?scenario.name:'Penghutang'}</div>
        <div style="padding:8px 12px;border-radius:8px;font-size:13px;background:${m.role==='user'?'var(--purple-light)':'var(--bg)'};color:${m.role==='user'?'var(--purple)':'var(--text)'}">${m.content}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" style="flex:1" onclick="navigate('training')">🔁 Latihan Semula</button>
      <button class="btn btn-secondary" style="flex:1" onclick="navigate('my-history')">📊 Lihat Rekod</button>
    </div>
  </div>`);
}

async function renderMyHistory(){
  const all=await loadSessions();
  const sessions=all.filter(s=>s.collectorId===currentUser.id).reverse();
  const weakness=tallyWeakness(sessions);
  const latestFocus=sessions.length?sessions[0].priorityFocus:null; // sessions[0] = sesi terbaru (list dah reverse)
  setContent(`
  <div class="page-header"><div class="page-title">Rekod Latihan Saya</div><div class="page-sub">${sessions.length} sesi latihan</div></div>
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📊</div><p>Belum ada sesi latihan. Mulakan latihan pertama anda!</p></div></div>`:''}
  ${sessions.length>0?`
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Jumlah Sesi</div><div class="stat-val">${sessions.length}</div></div>
    <div class="stat-card"><div class="stat-label">Purata Markah</div><div class="stat-val">${Math.round(sessions.reduce((a,s)=>a+s.totalScore,0)/sessions.length)}</div><div class="stat-sub">/ 100</div></div>
    <div class="stat-card"><div class="stat-label">Markah Tertinggi</div><div class="stat-val">${Math.max(...sessions.map(s=>s.totalScore))}</div></div>
    <div class="stat-card"><div class="stat-label">Sesi Terbaru</div><div class="stat-val">${sessions[0].totalScore}</div><div class="stat-sub">mata</div></div>
  </div>
  ${latestFocus?`
  <div class="card" style="border-left:4px solid var(--purple)">
    <div class="card-title">🎯 Fokus Latihan Akan Datang</div>
    <span class="chip chip-purple">${catIcon(latestFocus.category)} ${catLabel(latestFocus.category)}</span>
    <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:8px">${latestFocus.tip||''}</p>
  </div>`:''}
  <div class="card">
    <div class="card-title">🛠 Aspek Paling Kerap Perlu Diperbaiki</div>
    ${weakness.length===0?`<div style="font-size:13px;color:var(--text3)">Belum cukup data — teruskan latihan untuk lihat corak kesilapan anda.</div>`:
    weakness.slice(0,5).map(([cat,count])=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px">${catIcon(cat)} ${catLabel(cat)}</span>
        <span class="chip chip-red">${count}x dikesan</span>
      </div>`).join('')}
  </div>
  <div class="card">
    <div class="card-title">Trend Markah</div>
    <div class="chart-bar-wrap">
      ${sessions.slice(0,10).reverse().map((s,i)=>`
      <div class="chart-bar-col">
        <div class="chart-bar-val">${s.totalScore}</div>
        <div class="chart-bar" style="height:${s.totalScore*0.9}px;background:${s.totalScore>=70?'#5CB85C':s.totalScore>=50?'#F0AD4E':'#E24B4A'}"></div>
        <div class="chart-bar-label">S${i+1}</div>
      </div>`).join('')}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Semua Sesi</div>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Senario</th><th>Masa</th><th>Markah</th><th>Tarikh</th><th></th></tr>
      ${sessions.map((s,i)=>`<tr>
        <td>${sessions.length-i}</td>
        <td>${s.scenarioName}</td>
        <td>${s.duration}</td>
        <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
        <td>${s.date?new Date(s.date).toLocaleDateString('ms-MY'):'-'}</td>
        <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">Lihat</button></td>
      </tr>`).join('')}
    </table></div>
  </div>`:''}
  `);
}

async function renderCollectors(){
  const users=await loadUsers();
  const sessions=await loadSessions();
  const collectors=users.filter(u=>u.role==='collector');
  setContent(`
  <div class="page-header"><div class="page-title">Semua Collector</div><div class="page-sub">${collectors.length} collector berdaftar</div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Nama</th><th>ID</th><th>Sesi</th><th>Purata</th><th>Tertinggi</th><th>Aspek Lemah</th><th>Harassment</th><th>Terakhir</th></tr>
      ${collectors.map(c=>{
        const cs=sessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):'-';
        const best=cs.length?Math.max(...cs.map(s=>s.totalScore)):'-';
        const last=cs.length?cs[cs.length-1]:null;
        const weakLabel=cs.length?topWeaknessLabel(cs):'-';
        const harassCount=cs.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none').length;
        return`<tr>
          <td><div style="font-weight:500">${c.name}</div></td>
          <td><span class="chip chip-purple">${c.id}</span></td>
          <td>${cs.length}</td>
          <td>${typeof avg==='number'?`<span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${avg}</span>`:'-'}</td>
          <td>${typeof best==='number'?`<span class="score-pill score-high">${best}</span>`:'-'}</td>
          <td>${weakLabel!=='-'?`<span class="chip chip-amber">${weakLabel}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td>${harassCount>0?`<span class="chip chip-red">⚠ ${harassCount}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td style="font-size:12px;color:var(--text3)">${last?new Date(last.date).toLocaleDateString('ms-MY'):'-'}</td>
        </tr>`;
      }).join('')}
    </table></div>
  </div>`);
}

async function renderSessions(){
  const sessions=(await loadSessions()).slice().reverse();
  const users=await loadUsers();
  setContent(`
  <div class="page-header"><div class="page-title">Sesi Latihan</div><div class="page-sub">${sessions.length} sesi keseluruhan</div></div>
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📋</div><p>Belum ada sesi latihan.</p></div></div>`:''}
  ${sessions.length>0?`<div class="card">
    <div class="table-wrap"><table>
      <tr><th>Collector</th><th>Senario</th><th>Masa</th><th>Markah</th><th>Risiko Harassment</th><th>Tarikh</th><th></th></tr>
      ${sessions.map(s=>{
        const u=findUserById(users,s.collectorId);
        return`<tr>
          <td><div style="font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${s.collectorId}</div></td>
          <td>${s.scenarioName}</td>
          <td>${s.duration}</td>
          <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
          <td>${s.harassmentRisk&&s.harassmentRisk!=='none'?`<span class="chip chip-red">⚠ ${s.harassmentRisk}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td style="font-size:12px;color:var(--text3)">${s.date?new Date(s.date).toLocaleDateString('ms-MY'):'-'}</td>
          <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">Lihat</button></td>
        </tr>`;
      }).join('')}
    </table></div>
  </div>`:''}
  `);
}

async function viewSession(id){
  const all=await loadSessions();
  const s=all.find(s=>s.id===id);
  if(!s)return;
  const users=await loadUsers();
  const u=findUserById(users,s.collectorId);
  openModal(`
  <div class="modal-title">📋 Detail Sesi Latihan</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div><div style="font-size:12px;color:var(--text3)">Collector</div><div style="font-weight:500">${u?u.name:'—'}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Senario</div><div style="font-weight:500">${s.scenarioName}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Masa</div><div style="font-weight:500">${s.duration}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Markah</div><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}/100</span></div>
  </div>
  ${s.harassmentRisk&&s.harassmentRisk!=='none'?`<div class="alert alert-err" style="display:block">⚠ <strong>Isu Pematuhan/Harassment (${s.harassmentRisk}):</strong> ${s.harassmentNote||''}</div>`:''}
  <hr class="divider"/>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:1rem">
    ${scoreRows(s).map(([l,v,m])=>`
    <div style="background:var(--bg);border-radius:6px;padding:8px 12px">
      <div style="font-size:11px;color:var(--text3)">${l}</div>
      <div style="font-size:18px;font-weight:600;color:var(--purple)">${v}<span style="font-size:12px;color:var(--text3)">/${m}</span></div>
    </div>`).join('')}
  </div>
  <hr class="divider"/>
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">💬 Maklum Balas AI</div>
  <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:1rem">${s.feedback||''}</p>
  ${(s.strengths&&s.strengths.length)?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">✅ Kekuatan</div>
  ${s.strengths.map(t=>`<div style="font-size:12px;color:var(--text2);margin-bottom:4px">• ${t}</div>`).join('')}
  <hr class="divider"/>`:''}
  ${(s.missed&&s.missed.length)?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">🛠 Perlu Diperbaiki (untuk coaching)</div>
  ${s.missed.map(m=>`
  <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
    <span class="chip chip-red" style="font-size:11px">${catIcon(m.category)} ${catLabel(m.category)}</span>
    <div style="font-size:12px;color:var(--text);margin-top:4px"><strong>Isu:</strong> ${m.issue||''}</div>
    <div style="font-size:12px;color:var(--purple)"><strong>Cadangan:</strong> ${m.suggestion||''}</div>
  </div>`).join('')}
  <hr class="divider"/>`:''}
  ${s.priorityFocus?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">🎯 Fokus Latihan Akan Datang</div>
  <div style="margin-bottom:1rem">
    <span class="chip chip-purple" style="font-size:11px">${catIcon(s.priorityFocus.category)} ${catLabel(s.priorityFocus.category)}</span>
    <div style="font-size:12px;color:var(--text2);margin-top:4px">${s.priorityFocus.tip||''}</div>
  </div>
  <hr class="divider"/>`:''}
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">📝 Transcript</div>
  <div style="max-height:220px;overflow-y:auto;background:var(--bg);border-radius:6px;padding:10px">
    ${(s.transcript||[]).map(m=>`<div style="margin-bottom:8px"><div style="font-size:10px;color:var(--text3)">${m.role==='user'?(u?u.name:'Collector'):'Penghutang'}</div>
    <div style="font-size:12px;line-height:1.5">${m.content}</div></div>`).join('')}
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div>`);
}

async function renderScenarios(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Urus Senario</div></div><div class="card">Memuatkan senario...</div>');
  let scenarios;
  try{
    scenarios=await loadScenarios(true); // force=true: manager perlu data terkini, bukan cache lama
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Urus Senario</div></div><div class="card">⚠ Gagal memuatkan senario: ${e.message}</div>`);
    return;
  }
  setContent(`
  <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div class="page-title">Urus Senario</div><div class="page-sub">${scenarios.length} senario tersedia</div></div>
    <button class="btn btn-primary" onclick="openAddScenario()">+ Tambah Senario</button>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Emoji</th><th>Nama</th><th>Tajuk</th><th>Hutang</th><th>Baki</th><th>Aras</th><th>Checklist</th><th>Tindakan</th></tr>
      ${scenarios.map(s=>`<tr>
        <td style="font-size:20px">${s.emoji}</td>
        <td><div style="font-weight:500">${s.name}</div></td>
        <td>${s.title}</td>
        <td>${s.amount}</td>
        <td><span class="chip ${s.balanceTier==='high'?'chip-red':'chip-green'}">${s.balanceTier==='high'?'Tinggi':'Rendah'}</span></td>
        <td><span class="level-badge level-${s.level}">${s.level==='easy'?'Mudah':s.level==='med'?'Sederhana':'Sukar'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${(s.checklist||[]).length} item</td>
        <td><div class="action-row">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="editScenario('${s.id}')">Edit</button>
          <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteScenario('${s.id}')">Padam</button>
        </div></td>
      </tr>`).join('')}
    </table></div>
  </div>`);
}

async function openAddScenario(existingId){
  const scenarios=await loadScenarios();
  const s=existingId?scenarios.find(x=>x.id===existingId):null;
  openModal(`
  <div class="modal-title">${s?'Edit':'Tambah'} Senario</div>
  <div class="form-row"><label>Emoji</label><input id="scEmoji" value="${s?s.emoji:'😐'}" placeholder="😐" /></div>
  <div class="form-row"><label>Nama Penghutang</label><input id="scName" value="${s?s.name:''}" placeholder="Encik Ahmad" /></div>
  <div class="two-col">
    <div class="form-row"><label>Jantina (untuk pilih suara AI yang betul)</label>
      <select id="scGender"><option value="male" ${!s||s.gender==='male'?'selected':''}>Lelaki</option><option value="female" ${s&&s.gender==='female'?'selected':''}>Perempuan</option></select>
    </div>
    <div class="form-row"><label>Loghat / Bangsa Suara</label>
      <select id="scAccent">
        <option value="melayu" ${!s||!s.accent||s.accent==='melayu'?'selected':''}>Melayu</option>
        <option value="cina" ${s&&s.accent==='cina'?'selected':''}>Cina</option>
        <option value="india" ${s&&s.accent==='india'?'selected':''}>India</option>
      </select>
    </div>
  </div>
  <div class="form-row"><label>Tajuk Senario</label><input id="scTitle" value="${s?s.title:''}" placeholder="Penghutang Bekerjasama" /></div>
  <div class="form-row"><label>Keterangan Ringkas</label><input id="scDesc" value="${s?s.desc:''}" placeholder="Lupa bayar, mudah dibujuk..." /></div>
  <div class="two-col">
    <div class="form-row"><label>Jumlah Hutang</label><input id="scAmount" value="${s?s.amount:'RM5,000'}" /></div>
    <div class="form-row"><label>Hari Tertunggak</label><input id="scDays" value="${s?s.days:30}" type="number" /></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Aras Kesukaran</label>
      <select id="scLevel"><option value="easy" ${s&&s.level==='easy'?'selected':''}>Mudah</option><option value="med" ${s&&s.level==='med'?'selected':''}>Sederhana</option><option value="hard" ${s&&s.level==='hard'?'selected':''}>Sukar</option></select>
    </div>
    <div class="form-row"><label>Tahap Baki Hutang</label>
      <select id="scBalanceTier"><option value="low" ${s&&s.balanceTier==='low'?'selected':''}>Rendah (Low Balance)</option><option value="high" ${!s||s.balanceTier==='high'?'selected':''}>Tinggi (High Balance)</option></select>
    </div>
  </div>
  <div class="form-row"><label>Prompt AI (gunakan {name}, {amount}, {days})</label>
    <textarea id="scPrompt" rows="4" placeholder="Anda berlakon sebagai {name}...">${s?s.prompt:'Anda berlakon sebagai {name}, penghutang yang berhutang {amount} tertunggak {days} hari. Bercakap dalam Bahasa Malaysia. Jawab 1-3 ayat sahaja.'}</textarea>
  </div>
  <div class="form-row">
    <label>Checklist Penilaian (apa yang collector PATUT lakukan dalam senario ini)</label>
    <div id="checklistRows"></div>
    <button type="button" class="btn btn-secondary" style="margin-top:6px;font-size:12px;padding:6px 10px" onclick="addChecklistRow('tone','')">+ Tambah Item Checklist</button>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveScenario('${existingId||''}')">Simpan</button>
  </div>`);
  const existingChecklist=(s&&s.checklist&&s.checklist.length)?s.checklist:SCORE_CATS.map(c=>({cat:c,text:''}));
  existingChecklist.forEach(c=>addChecklistRow(c.cat,c.text));
}

function addChecklistRow(cat,text){
  const wrap=document.getElementById('checklistRows');
  if(!wrap)return;
  const row=document.createElement('div');
  row.className='checklist-row';
  row.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:flex-start';
  row.innerHTML=`
    <select class="cl-cat" style="max-width:150px;flex-shrink:0">
      ${SCORE_CATS.map(c=>`<option value="${c}" ${c===cat?'selected':''}>${catLabel(c)}</option>`).join('')}
    </select>
    <input class="cl-text" value="${(text||'').replace(/"/g,'&quot;')}" placeholder="Cth: Dapatkan tarikh PTP yang spesifik..." />
    <button type="button" class="btn btn-danger" style="padding:6px 10px;flex-shrink:0" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

function editScenario(id){openAddScenario(id);}
async function saveScenario(existingId){
  const checklist=Array.from(document.querySelectorAll('#checklistRows .checklist-row'))
    .map(r=>({cat:r.querySelector('.cl-cat').value,text:r.querySelector('.cl-text').value.trim()}))
    .filter(c=>c.text);
  const gender=document.getElementById('scGender').value;
  const accent=document.getElementById('scAccent').value;
  const data={
    id:existingId||'s'+Date.now(),
    emoji:document.getElementById('scEmoji').value||'😐',
    name:document.getElementById('scName').value.trim(),
    gender,accent,
    voiceId:resolveVoiceId(gender,accent),
    title:document.getElementById('scTitle').value.trim(),
    desc:document.getElementById('scDesc').value.trim(),
    amount:document.getElementById('scAmount').value.trim(),
    days:parseInt(document.getElementById('scDays').value)||30,
    level:document.getElementById('scLevel').value,
    balanceTier:document.getElementById('scBalanceTier').value,
    prompt:document.getElementById('scPrompt').value.trim(),
    checklist
  };
  if(!data.name||!data.title||!data.prompt){alert('Sila isi semua maklumat.');return;}
  const btn=document.querySelector('.modal-footer .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Menyimpan...';}
  try{
    await scenarioApi.save(data);
    await loadScenarios(true); // refresh cache supaya semua page (training/manager) nampak data terkini
    closeModal();
    renderScenarios();
  }catch(e){
    alert('Gagal simpan senario: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='Simpan';}
  }
}
async function deleteScenario(id){
  if(!confirm('Padam senario ini?'))return;
  try{
    await scenarioApi.remove(id);
    await loadScenarios(true);
    renderScenarios();
  }catch(e){
    alert('Gagal padam senario: '+e.message);
  }
}

async function renderUsers(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Urus Pengguna</div></div><div class="card">Memuatkan pengguna...</div>');
  let all;
  try{
    all=await loadUsers(true); // force=true: manager perlu data terkini
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Urus Pengguna</div></div><div class="card">⚠ Gagal memuatkan pengguna: ${e.message}</div>`);
    return;
  }
  setContent(`
  <div class="page-header"><div class="page-title">Urus Pengguna</div><div class="page-sub">${all.length} pengguna berdaftar</div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Nama</th><th>ID</th><th>Role</th><th>Didaftar</th><th>Tindakan</th></tr>
      ${all.map(u=>`<tr>
        <td><div style="font-weight:500">${u.name}</div></td>
        <td><span class="chip chip-purple">${u.id}</span></td>
        <td><span class="user-role-badge badge-${u.role}">${u.role==='admin'?'Admin':u.role==='manager'?'Manager':'Collector'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${u.registeredAt?new Date(u.registeredAt).toLocaleDateString('ms-MY'):'-'}</td>
        <td>${u.id!==currentUser.id?`<button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteUser('${u.id}')">Padam</button>`:'-'}</td>
      </tr>`).join('')}
    </table></div>
  </div>`);
}
async function deleteUser(id){
  if(!confirm('Padam pengguna ini?'))return;
  try{
    await userApi.remove(id);
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Gagal padam pengguna: '+e.message);
  }
}

// ═══════════ CALL LOGIC ═══════════
// PUNCA BUG "nama wanita jadi suara lelaki" / "nama bangsa lain tetap suara
// Melayu": getVoiceId() dulu CUMA teka jantina dengan check substring
// "Puan"/"Cik" dalam scenario.name, dan cuma ada 2 ID suara total (1
// perempuan, 1 lelaki — kedua-dua loghat Melayu) — jadi nama tanpa gelaran
// tu (cth nama Cina/India, atau nama wanita tanpa "Puan/Cik") semua jatuh ke
// fallback lelaki Melayu yang sama. Fix: scenario sekarang simpan `gender`
// & `voiceId` SECARA EXPLICIT (dipilih semasa cipta/edit senario, bukan
// teka dari nama). VOICE_LIBRARY di bawah ialah tempat untuk tambah suara
// loghat/bangsa lain — ganti placeholder dengan Voice ID sebenar dari
// ElevenLabs (Voice Library → cari loghat yang sesuai → copy Voice ID).
const VOICE_LIBRARY = {
  male_melayu:   'TX3LPaxmHKxFdv7VOQHJ',
  female_melayu: 'EXAVITQu4vr4xnSDxMaL',
  // TODO: ganti dua ID di bawah dengan Voice ID sebenar dari ElevenLabs
  // Voice Library sebelum pilihan ni digunakan — sementara ni ia fallback
  // ke suara Melayu mengikut jantina supaya app tak rosak.
  male_cina:     'REPLACE_WITH_ELEVENLABS_VOICE_ID',
  female_cina:   'REPLACE_WITH_ELEVENLABS_VOICE_ID',
  male_india:    'REPLACE_WITH_ELEVENLABS_VOICE_ID',
  female_india:  'REPLACE_WITH_ELEVENLABS_VOICE_ID',
};
function resolveVoiceId(gender,accent){
  const key=(accent||'melayu')+'_'+(gender==='female'?'female':'male');
  const lookupKey=(gender==='female'?'female':'male')+'_'+(accent||'melayu');
  const id=VOICE_LIBRARY[lookupKey];
  if(id&&!id.startsWith('REPLACE_WITH'))return id;
  // Belum ada voice ID sebenar utk loghat ni — fallback ikut jantina sahaja
  return gender==='female'?VOICE_LIBRARY.female_melayu:VOICE_LIBRARY.male_melayu;
}
function getVoiceId(){
  if(!scenario)return VOICE_LIBRARY.male_melayu;
  if(scenario.voiceId)return scenario.voiceId; // disimpan secara explicit semasa cipta senario
  // Senario lama (sebelum fix ni) tiada voiceId/gender disimpan — guna
  // heuristik lama sebagai fallback supaya senario sedia ada tak rosak.
  return (scenario.name.includes('Puan')||scenario.name.includes('Cik'))?VOICE_LIBRARY.female_melayu:VOICE_LIBRARY.male_melayu;
}
function getSysPrompt(){
  if(!scenario)return '';
  const base=scenario.prompt.replace(/{name}/g,scenario.name).replace(/{amount}/g,scenario.amount).replace(/{days}/g,scenario.days);
  const grounding=`\n\nPENTING — FAKTA SEBENAR AKAUN ANDA (jangan sekali-kali lupa/abaikan ni): jumlah hutang sebenar = ${scenario.amount}, tertunggak sebenar = ${scenario.days} hari, nama anda = ${scenario.name}. Ini fakta TETAP — collector TIDAK boleh mengubahnya sekadar dengan menyebutnya secara berbeza.
- Jika collector sebut jumlah/tempoh/maklumat akaun yang BERBEZA daripada fakta di atas, JANGAN terus bersetuju atau teruskan perbualan seperti biasa. Anda MESTI bertindak balas secara realistik: nampak keliru, tertanya-tanya, atau betulkan collector — contohnya "Eh, bukan ke hutang saya ${scenario.amount}? Kenapa awak sebut lain pula?" atau "Saya tak pasti la nombor tu betul ke tak, boleh check balik?"
- Jika collector terus mendesak/teruskan dengan maklumat yang salah tanpa membetulkannya, anda boleh jadi lagi tidak yakin/curiga dengan panggilan ni (sebagai penghutang sebenar yang risau kena scam/silap akaun), bukan terus akur.
- Anda hanya boleh "terima" sesuatu maklumat jika ia konsisten dengan fakta sebenar di atas.`;
  return base+grounding;
}

async function startCall(){
  callHistory=[];callSeconds=0;callActive=true;
  audioQueue=[];isPlayingAudio=false;
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  navigate('call');
  timerInterval=setInterval(()=>{
    callSeconds++;
    const m=String(Math.floor(callSeconds/60)).padStart(2,'0');
    const s=String(callSeconds%60).padStart(2,'0');
    const el=document.getElementById('callTimer');
    if(el)el.textContent=m+':'+s;
  },1000);
  await new Promise(r=>setTimeout(r,600));
  const greet='Helo? Siapa ni?';
  addBubble('debtor',greet);
  callHistory.push({role:'assistant',content:greet});
  speakEl(greet);
}

function stopCall(){
  callActive=false;
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  if(recognition)try{recognition.stop();}catch(e){}
  if(currentAudio){currentAudio.pause();currentAudio=null;}
  audioQueue=[];isPlayingAudio=false;isRecording=false;
}

async function endCall(){
  stopCall();
  const m=Math.floor(callSeconds/60),s=callSeconds%60;
  const duration=m+'m '+s+'s';
  navigate('score');
  document.getElementById('mainContent').innerHTML='<div style="text-align:center;padding:4rem;color:var(--text3)">⏳ Menganalisis sesi latihan...</div>';
  await evalCall(duration);
}

async function speakEl(text){audioQueue.push(text);if(!isPlayingAudio)playNext();}
async function playNext(){
  if(!audioQueue.length){isPlayingAudio=false;if(callActive){setStatus('green','Tekan mikrofon untuk bercakap.');resetMicBtn();}return;}
  isPlayingAudio=true;
  const text=audioQueue.shift();
  setStatus('purple',scenario.name+' sedang bercakap...');
  setMicState('speaking','🔊','AI sedang bercakap...');
  try{
    const res=await fetch('/api/tts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text,voiceId:getVoiceId()})
    });
    if(!res.ok)throw new Error(res.status);
    const blob=await res.blob();const url=URL.createObjectURL(blob);
    currentAudio=new Audio(url);
    currentAudio.onended=()=>{URL.revokeObjectURL(url);playNext();};
    currentAudio.onerror=()=>playNext();
    await currentAudio.play();
  }catch(e){addBubble('debtor','[Ralat suara — sila cuba lagi sebentar]');playNext();}
}

function setStatus(dot,msg){
  const d=document.getElementById('statusDot');const t=document.getElementById('statusText');
  if(d)d.className='status-dot '+dot;if(t)t.textContent=msg;
}
function setMicState(cls,icon,label){
  const b=document.getElementById('micBtn');const l=document.getElementById('micLabel');const i=document.getElementById('micIcon');
  if(b)b.className='mic-btn '+cls;if(i)i.textContent=icon;if(l)l.textContent=label;
}
function resetMicBtn(){setMicState('','🎙','Tekan untuk bercakap');}

function addBubble(role,text){
  const box=document.getElementById('transcriptBox');
  if(!box)return;
  const div=document.createElement('div');
  div.className='msg msg-'+role;
  const lbl=role==='collector'?currentUser.name:(scenario?scenario.name:'Penghutang');
  div.innerHTML=`<div class="msg-who">${lbl}</div><div class="bubble bubble-${role}">${text}</div>`;
  box.appendChild(div);box.scrollTop=box.scrollHeight;
}

// ═══════════ STT — DIPERBAIKI ═══════════
function toggleMic(){if(isPlayingAudio)return;if(isRecording)stopRec();else startRec();}

function startRec(retryCount){
  retryCount=retryCount||0;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Sila guna Google Chrome untuk fungsi mikrofon.');return;}
  recognition=new SR();
  recognition.lang='ms-MY';
  recognition.continuous=true;       // ← tak auto-stop bila senyap sekejap
  recognition.interimResults=true;

  // PUNCA BUG "system detect lambat & cut sebelum habis cakap":
  // dulu timer senyap ni HANYA reset bila ada hasil "final" — tapi engine STT
  // Chrome kadang lambat finalize ayat panjang/bercampur BM-Inggeris (kena
  // round-trip ke server Google). Bila gap antara satu "final" dengan "final"
  // seterusnya lagi panjang dari 1.5s — walaupun collector tengah aktif
  // bercakap (nampak pada "interim") — sistem silap anggap dah senyap, terus
  // recognition.stop(), dan apa-apa yang belum "final" hilang terus (tak
  // sempat masuk transcript pun). Fix: reset timer pada SETIAP hasil (final
  // ATAU interim), dan bila timer fire, hantar gabungan final+interim supaya
  // tak ada perkataan terakhir yang hilang.
  const SILENCE_MS=2200; // naik dari 1500ms → lebih ruang utk pause natural

  // PUNCA BUG "suara tak detect / ralat / tak stable":
  // webkitSpeechRecognition Chrome bergantung pada round-trip rangkaian ke
  // server STT cloud Google — bukan diproses lokal. Bila ada network blip
  // sekejap atau Chrome anggap tiada suara (silap detect, especially dengan
  // mic murah/headset bluetooth), ia throw 'network'/'no-speech'/'aborted'
  // dan DULU terus mati ke idle + buang apa-apa teks yang dah capture, force
  // collector tekan mic semula dari kosong. Fix: (a) kalau ralat ni jenis
  // recoverable & BELUM ada teks dicapture, auto-restart sendiri (senyap,
  // collector tak perasan) sehingga 2 kali sebelum mengalah; (b) kalau dah
  // ada teks yang sempat capture sebelum ralat, hantar je teks tu (jangan
  // buang) — collector boleh sambung cakap dalam giliran seterusnya.
  const MAX_RETRY=2;
  const RECOVERABLE=['no-speech','network','aborted'];

  let silenceTimer=null;
  let lastFinal='';
  let lastInterim='';

  function currentText(){return (lastFinal+' '+lastInterim).trim();}

  function armSilenceTimer(){
    clearTimeout(silenceTimer);
    silenceTimer=setTimeout(()=>{
      const text=currentText();
      if(text.length>1){
        recognition.stop();
        processSpeech(text);
        lastFinal='';lastInterim='';
      }
    },SILENCE_MS);
  }

  recognition.onstart=()=>{
    isRecording=true;
    setMicState('recording','🎙','Sedang rakam...');
    setStatus('red','Anda sedang bercakap...');
  };

  recognition.onresult=(e)=>{
    let interim='',final='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal)final+=e.results[i][0].transcript;
      else interim+=e.results[i][0].transcript;
    }
    if(final)lastFinal+=' '+final;
    lastInterim=interim;
    const lt=document.getElementById('liveText');
    if(lt)lt.textContent=currentText();
    // Reset timer pada SETIAP event STT (final ATAU interim) — bukan final sahaja
    armSilenceTimer();
  };

  recognition.onerror=(e)=>{
    clearTimeout(silenceTimer);
    isRecording=false;
    const text=currentText();
    if(text.length>1){
      // Ada teks yang sempat ditangkap sebelum ralat — jangan buang, hantar.
      recognition.stop();
      processSpeech(text);
      return;
    }
    if(RECOVERABLE.includes(e.error)&&retryCount<MAX_RETRY){
      // Cuba sendiri semula tanpa kacau collector — ralat sekejap macam ni
      // selalunya hilang sendiri pada cubaan seterusnya.
      setStatus('','Mendengar semula...');
      setTimeout(()=>startRec(retryCount+1),300);
      return;
    }
    resetMicBtn();
    const m={'not-allowed':'Mic tidak dibenarkan. Allow akses mikrofon.','no-speech':'Tiada suara dikesan. Cuba cakap lebih dekat dengan mic, atau tekan mikrofon sekali lagi.','network':'Ralat rangkaian. Sila semak sambungan internet & cuba lagi.'};
    setStatus('','⚠ '+(m[e.error]||'Ralat: '+e.error));
  };

  recognition.onend=()=>{
    isRecording=false;
    // Kalau ada teks terkumpul (final ATAU interim) tapi timer belum fire —
    // cth browser stop recognition tiba-tiba (network blip) — hantar sekarang
    // supaya tak ada perkataan terakhir yang hilang.
    clearTimeout(silenceTimer);
    const text=currentText();
    if(text.length>1){
      processSpeech(text);
      lastFinal='';lastInterim='';
    }
  };

  recognition.start();
}

function stopRec(){
  if(recognition)recognition.stop();
  isRecording=false;
  const lt=document.getElementById('liveText');
  const text=lt?lt.textContent.trim():'';
  if(text&&text.length>1)processSpeech(text);
  else resetMicBtn();
}

async function processSpeech(text){
  const lt=document.getElementById('liveText');if(lt)lt.textContent='';
  setMicState('thinking','⏳','AI sedang berfikir...');setStatus('','AI sedang berfikir...');
  addBubble('collector',text);callHistory.push({role:'user',content:text});
  try{
    const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:200,system:getSysPrompt(),messages:callHistory})});
    const data=await res.json();
    const reply=data.content?.[0]?.text||'Hmm...';
    callHistory.push({role:'assistant',content:reply});addBubble('debtor',reply);speakEl(reply);
  }catch(e){addBubble('debtor','[Ralat AI. Cuba lagi.]');resetMicBtn();setStatus('green','Tekan mikrofon untuk bercakap.');}
}

async function evalCall(duration){
  const transcript=callHistory.map(m=>`${m.role==='user'?'Collector':'Penghutang'}: ${m.content}`).join('\n');
  const checklist=(scenario&&scenario.checklist)||[];
  const checklistText=checklist.length
    ?checklist.map(c=>`- [${catLabel(c.cat)}] ${c.text}`).join('\n')
    :'(Tiada checklist khusus — nilai berdasarkan standard umum debt collection.)';
  const tierLabel=scenario&&scenario.balanceTier==='low'?'RENDAH':'TINGGI';
  const tierHint=scenario&&scenario.balanceTier==='low'
    ?'Strategi sesuai: dorong bayaran PENUH sekaligus dahulu sebelum tawar ansuran.'
    :'Strategi sesuai: tawar pelan ansuran/penjadualan semula berstruktur, bukan desak bayaran sekaligus.';

  const prompt=`Anda seorang Quality Assurance Manager pakar debt collection di Malaysia. Tugas anda menilai prestasi COLLECTOR (BUKAN penghutang) dalam perbualan latihan di bawah secara KRITIKAL, SPESIFIK dan membina — fokus mencari kesilapan sebenar dan perkara yang sepatutnya dibuat tapi TIDAK dibuat, bukan pujian generik kosong.

SENARIO: ${scenario?scenario.title:''} — ${scenario?scenario.desc:''}
Nama Penghutang: ${scenario?scenario.name:''} | Jumlah Hutang: ${scenario?scenario.amount:''} | Tertunggak: ${scenario?scenario.days:''} hari
Tahap Baki Hutang: ${tierLabel}. ${tierHint}

CHECKLIST TINDAKAN YANG DIJANGKA UNTUK SENARIO INI:
${checklistText}

PERBUALAN PENUH (Collector vs Penghutang):
${transcript}

Masa Panggilan: ${duration}

TUGAS ANDA — analisis transcript di atas baris demi baris, kemudian:

1. Markah 5 aspek (setiap satu 0-20, jumlah maksimum 100):
   - tone: Nada & profesionalisme collector (sopan, tenang, tidak defensif/agresif)
   - delivery: Cara penyampaian — kejelasan, struktur ayat, kawalan perbualan
   - counter: Keberkesanan hujah balas (counter) terhadap bantahan/dalih/emosi penghutang
   - action: Tindakan & pematuhan — ikut checklist di atas + SOP umum (pengesahan identiti/akaun, nyatakan tujuan panggilan, dapatkan PTP yang jelas & spesifik, dokumentasi, TIDAK mengugut/memaksa). Selitkan juga: (a) Dispute Handling — jika penghutang bangkitkan bantahan/dispute (dakwa sudah bayar, jumlah tak tepat, dsb), adakah collector tangani dengan betul (semak, jelaskan, jangan abaikan/tolak bantahan secara sambil lewa)? (b) Ketepatan Notes — adakah maklumat yang disebut/disahkan collector (jumlah, tarikh, tempoh) tepat dan konsisten dengan SENARIO di atas, atau adakah collector tersilap nyatakan maklumat akaun?
   - balance: Kesesuaian strategi rundingan dengan tahap baki hutang (${tierLabel}) seperti dinyatakan di atas. Selitkan juga PTP Negotiation — adakah collector berjaya runding PTP yang berstruktur (jumlah & tarikh bayaran jelas, pecahan ansuran yang munasabah mengikut kemampuan penghutang) ATAU, jika sesuai dengan situasi, menawarkan diskaun penyelesaian penuh/settlement sebagai insentif? Markah rendah jika PTP yang diperoleh kabur/tidak spesifik atau strategi tak sepadan dengan baki hutang.

2. strengths: 1-4 perkara yang collector BETUL-BETUL buat dengan baik (spesifik, bukan umum).

3. missed: WAJIB 3-5 perkara checklist/SOP yang PATUT dilakukan collector TAPI TIDAK dilakukan, atau dilakukan dengan salah/lemah (MAKSIMUM 5 — pilih yang PALING penting/kritikal sahaja, walaupun panggilan panjang/banyak isu). Ini bahagian PALING PENTING dalam latihan ini — JANGAN biarkan kosong walaupun panggilan nampak baik; setiap panggilan ADA ruang penambahbaikan, cari ia walaupun kecil. Untuk SETIAP item beri (kekalkan ringkas, 1-2 ayat setiap field):
   - category: salah satu dari tone/delivery/counter/action/balance
   - issue: apa yang tak dibuat/salah (spesifik kepada perbualan ini, bukan teori umum)
   - suggestion: ayat atau tindakan SPESIFIK (boleh terus dipakai/dihafal) yang patut collector guna sebagai gantinya
   - quote: petikan ringkas (≤15 patah perkataan) dari ayat collector dalam transcript yang berkaitan isu ini, atau "" jika tiada ayat spesifik berkaitan

4. harassmentRisk: "none" jika tiada isu langsung, "low"/"medium"/"high" jika collector menggunakan nada mengugut/memaksa/mendesak melampau, malu-malukan, atau melanggar etika debt collection. Jika bukan "none", isi harassmentNote (1 ayat ringkas, rujuk contoh dari transcript) — ini akan dipaparkan kepada manager untuk semakan pematuhan.

5. priorityFocus: SATU aspek (category sama macam atas) yang PALING perlu collector fokus dalam sesi latihan SETERUSNYA (biasanya aspek dengan markah terendah atau isu paling kritikal), dengan "tip" ringkas 1 ayat — spesifik & boleh terus diamalkan, bukan nasihat umum.

6. feedback: ringkasan keseluruhan 3-4 ayat dalam Bahasa Malaysia, nada membina (constructive coaching), bukan menghukum. WAJIB spesifik kepada panggilan ini (rujuk isu/kekuatan sebenar dari transcript, bukan ayat generik macam "secara keseluruhan baik"), dan tutup dengan 1 ayat galakan/arah tindakan konkrit untuk sesi latihan akan datang — bukan sekadar pujian kosong.

Jawab JSON SAHAJA tanpa markdown/code-fence, ikut struktur tepat ini:
{"totalScore":<0-100>,"scores":{"tone":<0-20>,"delivery":<0-20>,"counter":<0-20>,"action":<0-20>,"balance":<0-20>},"strengths":["..."],"missed":[{"category":"tone|delivery|counter|action|balance","issue":"...","suggestion":"...","quote":"..."}],"harassmentRisk":"none|low|medium|high","harassmentNote":"","priorityFocus":{"category":"tone|delivery|counter|action|balance","tip":"..."},"feedback":"..."}`;

  try{
    const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2200,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const raw=(data.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim();
    let r;
    try{
      r=JSON.parse(raw);
    }catch(parseErr){
      // Cuba selamatkan JSON jika Claude tambah teks luar {...} atau ada
      // pemotongan kecil di hujung — ambil dari '{' pertama ke '}' terakhir.
      const start=raw.indexOf('{');const end=raw.lastIndexOf('}');
      if(start===-1||end<=start)throw parseErr;
      r=JSON.parse(raw.slice(start,end+1));
    }
    const scores=Object.assign({tone:0,delivery:0,counter:0,action:0,balance:0},r.scores||{});
    const totalScore=typeof r.totalScore==='number'?r.totalScore:Object.values(scores).reduce((a,b)=>a+b,0);
    const missed=Array.isArray(r.missed)?r.missed.slice(0,5):[];
    const priorityFocus=(r.priorityFocus&&r.priorityFocus.category)?{category:r.priorityFocus.category,tip:r.priorityFocus.tip||''}:fallbackPriority(scores,missed);
    const sessionData={
      id:'sess_'+Date.now(),collectorId:currentUser.id,scenarioId:scenario?scenario.id:'',
      scenarioName:scenario?scenario.title:'',duration,date:new Date().toISOString(),
      totalScore,scores,
      strengths:Array.isArray(r.strengths)?r.strengths:[],
      missed,priorityFocus,
      harassmentRisk:r.harassmentRisk||'none',
      harassmentNote:r.harassmentNote||'',
      feedback:r.feedback||'',transcript:callHistory
    };
    // Simpan ke Supabase dalam try/catch BERASINGAN dari parsing AI di atas —
    // kalau save DB ni gagal (cth network blip), collector masih nak nampak
    // hasil penilaian yang Claude baru jana (jangan buang feedback yang dah
    // berjaya dianalisis hanya sebab DB write gagal sekejap).
    try{
      await sessionApi.create(sessionData);
      await loadSessions(true); // refresh cache supaya dashboard/manager terus nampak sesi baru
    }catch(saveErr){
      console.error('Gagal simpan sesi ke Supabase:',saveErr);
      sessionData.feedback+=' (Nota: hasil ni mungkin tak tersimpan dalam rekod sebab isu rangkaian sekejap — skrin ni je yang ada, tak dapat dilihat semula dalam "Rekod Latihan".)';
    }
    window._lastScore={...sessionData};
    navigate('score');
  }catch(e){
    window._lastScore={
      totalScore:0,scores:{tone:0,delivery:0,counter:0,action:0,balance:0},
      strengths:[],missed:[],priorityFocus:null,harassmentRisk:'none',harassmentNote:'',
      feedback:'Tidak dapat menganalisis sesi ini — sila cuba sekali lagi.',
      scenarioName:scenario?scenario.title:'',duration,transcript:callHistory
    };
    navigate('score');
  }
}

// ═══════════ MODAL ═══════════
function openModal(html){document.getElementById('modalBox').innerHTML=html;document.getElementById('modalOverlay').classList.add('open');}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay'))document.getElementById('modalOverlay').classList.remove('open');}

// ═══════════ UTILS ═══════════
function setContent(html){document.getElementById('mainContent').innerHTML=html;}

// ═══════════ RESTORE SESSION ═══════════
// PUNCA BUG "refresh page = logout": currentUser sebelum ni cuma variable
// JavaScript dalam memori — bila page refresh, semua variable JS reset ke
// kosong, dan HTML #authScreen sentiasa "active" secara default (tengok
// app/page.js) — jadi user SENTIASA terbaling balik ke skrin login bila
// refresh, walaupun baru je login. Fix: simpan ID pengguna (BUKAN
// password) dalam localStorage semasa login, dan cuba restore sesi tu
// secara automatik setiap kali app.js load.
(async function restoreSession(){
  try{
    const savedId=localStorage.getItem('ct_session_id');
    if(!savedId)return;
    const u=await userApi.session(savedId);
    if(!u)return; // ID dah tak wujud (cth akaun dipadam) — kekal di skrin login
    currentUser=u;
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    initApp();
  }catch(e){
    // network/localStorage tak available — biar fallback senyap ke skrin login biasa, jangan crash app.
  }
})();
