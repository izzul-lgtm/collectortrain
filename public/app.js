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
// PERMINTAAN: tunjuk waktu (bukan tarikh sahaja) untuk setiap sesi latihan —
// senang semak kalau ada beberapa sesi pada hari yang sama (cth nak confirm
// sesi mana dah betul-betul masuk Supabase semasa testing/audit).
function fmtDateTime(d){
  if(!d)return '-';
  const dt=new Date(d);
  return dt.toLocaleDateString('ms-MY')+' '+dt.toLocaleTimeString('ms-MY',{hour:'2-digit',minute:'2-digit'});
}

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
    return SCORE_CATS.map(c=>[catLabel(c),s.scores[c]||0,20,c,(s.scoreReasons&&s.scoreReasons[c])||'']);
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
let micStream=null, micAudioCtx=null, micAnalyser=null, micLevelRAF=null;
let micPeakSinceStart=0; // peak bunyi dikesan sejak recognition.onstart turn semasa
let endCallInProgress=false; // guard: elak double-trigger (cth double-click/double-tap "Tamatkan Panggilan") hantar 2x evalCall() utk panggilan yang sama

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
  const acc=(label,val)=>`<div class="acc-ref-row"><span>${label}</span><span>${val&&String(val).trim()?val:'-'}</span></div>`;
  setContent(`
  <div class="call-wrap">
    <div class="call-main">
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
          <div class="mic-level-track"><div class="mic-level-fill" id="micLevelFill"></div></div>
          <div class="mic-label" id="micLabel">Tekan untuk bercakap</div>
        </div>
      </div>
      <button class="btn btn-danger btn-full" onclick="endCall()">📵 Tamatkan Panggilan</button>
    </div>
    <div class="acc-ref-card">
      <div class="acc-ref-title">📒 Maklumat Akaun (rujukan nego)</div>
      ${acc('Client',scenario.client)}
      ${acc('Nama',scenario.name)}
      ${acc('No. IC',scenario.icNumber)}
      ${acc('Acc Number',scenario.accNumber)}
      ${acc('Service No.',scenario.serviceNo)}
      ${acc('Amount Outstanding',scenario.amount)}
      ${acc('Acc Type',scenario.accType)}
      ${acc('Tarikh Daftar',scenario.registrationDate?new Date(scenario.registrationDate).toLocaleDateString('ms-MY'):'')}
      ${acc('Tarikh Termination',scenario.terminationDate?new Date(scenario.terminationDate).toLocaleDateString('ms-MY'):'')}
    </div>
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
        ${scoreRows(s).map(([l,v,m,cat,reason])=>`
        <div class="score-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600">${l}</span>
            <span style="font-weight:700;color:${v/m<0.5?'#E24B4A':v/m<0.75?'#F0AD4E':'var(--purple)'}">${v}/${m}</span>
          </div>
          <div class="score-bar-wrap"><div class="score-bar" style="width:${m?v/m*100:0}%;background:${v/m<0.5?'#E24B4A':v/m<0.75?'#F0AD4E':'var(--purple)'}"></div></div>
          ${reason?`<p style="font-size:12px;color:var(--text2);margin:2px 0 0;line-height:1.5">${reason}</p>`:''}
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
        <td style="font-size:12px">${fmtDateTime(s.date)}</td>
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
          <td style="font-size:12px;color:var(--text3)">${last?fmtDateTime(last.date):'-'}</td>
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
          <td style="font-size:12px;color:var(--text3)">${fmtDateTime(s.date)}</td>
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
    <div><div style="font-size:12px;color:var(--text3)">Tarikh & Waktu</div><div style="font-weight:500">${fmtDateTime(s.date)}</div></div>
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
      <tr><th>Emoji</th><th>Nama</th><th>Client</th><th>Tajuk</th><th>Hutang</th><th>Baki</th><th>Aras</th><th>Checklist</th><th>Tindakan</th></tr>
      ${scenarios.map(s=>`<tr>
        <td style="font-size:20px">${s.emoji}</td>
        <td><div style="font-weight:500">${s.name}</div></td>
        <td>${s.client?`<span class="chip chip-purple">${s.client}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
        <td>${s.title}</td>
        <td>${s.amount}</td>
        <td><span class="chip ${s.balanceTier==='high'?'chip-red':'chip-green'}">${s.balanceTier==='high'?'Tinggi':'Rendah'}</span></td>
        <td><span class="level-badge level-${s.level}">${s.level==='easy'?'Mudah':s.level==='med'?'Sederhana':'Sukar'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${(s.checklist||[]).length} item${(s.disclosures||[]).length?` · 📢${(s.disclosures||[]).length}`:''}</td>
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
  // Client "Lain-lain" — kalau client sedia ada bukan salah satu dari 3
  // pilihan tetap (RedOne/Celcom/Digi), anggap ia nama custom yang ditaip
  // sebelum ni → select "Lain-lain" & prefill input bebas dengan nama tu.
  const KNOWN_CLIENTS=['RedOne','Celcom','Digi'];
  const isCustomClient=!!(s&&s.client&&!KNOWN_CLIENTS.includes(s.client));
  openModal(`
  <div class="modal-title">${s?'Edit':'Tambah'} Senario</div>
  <div class="form-row"><label>Emoji Senario</label>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="scEmoji" type="text" value="${s?s.emoji:'😐'}" placeholder="😐" style="max-width:70px;font-size:24px;text-align:center" maxlength="4" />
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${['😐','😤','😠','😔','😰','🤔','😒','😭','🙄','😑'].map(e=>`<button type="button" onclick="document.getElementById('scEmoji').value='${e}'" style="font-size:20px;background:none;border:1px solid var(--border2);border-radius:6px;padding:2px 5px;cursor:pointer">${e}</button>`).join('')}
      </div>
    </div>
  </div>
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
  <hr class="divider"/>
  <div style="font-size:13px;font-weight:600;margin-bottom:10px">📒 Maklumat Akaun Pelanggan <span style="font-weight:400;color:var(--text3)">(wajib diisi — keluar sebagai rujukan collector semasa panggilan)</span></div>
  <div class="two-col">
    <div class="form-row"><label>Client</label>
      <select id="scClient" onchange="toggleClientOther()">
        <option value="" ${!s||!s.client?'selected':''} disabled>— Pilih Client —</option>
        <option value="RedOne" ${s&&s.client==='RedOne'?'selected':''}>RedOne</option>
        <option value="Celcom" ${s&&s.client==='Celcom'?'selected':''}>Celcom</option>
        <option value="Digi" ${s&&s.client==='Digi'?'selected':''}>Digi</option>
        <option value="Lain-lain" ${isCustomClient?'selected':''}>Lain-lain</option>
      </select>
      <input id="scClientOther" value="${isCustomClient?s.client.replace(/"/g,'&quot;'):''}" placeholder="Taip nama client lain..." style="margin-top:6px;display:${isCustomClient?'block':'none'}" />
    </div>
    <div class="form-row"><label>No. IC</label><input id="scIc" value="${s?s.icNumber:''}" placeholder="901231-10-1234" /></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Acc Number</label><input id="scAccNumber" value="${s?s.accNumber:''}" placeholder="1234567890" /></div>
    <div class="form-row"><label>Service No.</label><input id="scServiceNo" value="${s?s.serviceNo:''}" placeholder="012-3456789" /></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Acc Type</label>
      <select id="scAccType">
        <option value="" ${!s||!s.accType?'selected':''} disabled>— Pilih Jenis —</option>
        <option value="Active" ${s&&s.accType==='Active'?'selected':''}>Active</option>
        <option value="Pre-NPL" ${s&&s.accType==='Pre-NPL'?'selected':''}>Pre-NPL</option>
        <option value="NPL" ${s&&s.accType==='NPL'?'selected':''}>NPL</option>
        <option value="Write Off" ${s&&s.accType==='Write Off'?'selected':''}>Write Off</option>
      </select>
    </div>
    <div></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Tarikh Daftar</label><input id="scRegDate" type="date" value="${s&&s.registrationDate?s.registrationDate:''}" /></div>
    <div class="form-row"><label>Tarikh Termination</label><input id="scTermDate" type="date" value="${s&&s.terminationDate?s.terminationDate:''}" /></div>
  </div>
  <hr class="divider"/>
  <hr class="divider"/>
  <div class="form-row">
    <label>Perangai / Watak Penghutang <span style="font-weight:400;color:var(--text3)">(hanya describe sikap/perangai — nama, jumlah, IC, bahasa & fakta akaun auto-inject oleh sistem)</span></label>
    <textarea id="scPrompt" rows="3" placeholder="Cth: Penghutang yang defensif dan selalu bagi alasan sibuk. Mudah marah bila ditekan tapi akan akur kalau didekati dengan sabar. Nada cepat tidak sabar.">${s?s.prompt:'Penghutang yang bekerjasama tetapi penuh alasan. Nada neutral, minta masa lebih untuk bayar.'}</textarea>
    <div style="margin-top:6px;padding:8px 10px;background:var(--bg);border-radius:var(--radius-sm);font-size:11px;color:var(--text3);line-height:1.6">
      ℹ️ <b>Auto-inject oleh sistem (tidak perlu tulis dalam prompt):</b> Nama penghutang · Jumlah hutang · Hari tertunggak · Loghat/bangsa · No. IC · Acc Number · Service No. · Acc Type · Fakta akaun
    </div>
  </div>
  <div class="form-row">
    <label>Checklist Penilaian <span style="font-weight:400;color:var(--text3)">(AI akan nilai & beri markah berdasarkan 5 kategori ini secara automatik)</span></label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">🗣 Tone / Nada</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">📢 Cara Penyampaian</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">🔄 Hujah Balas</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">✅ Tindakan & Pematuhan</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">💰 Strategi Baki Hutang</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Tambah item spesifik untuk senario ini (pilihan):</div>
    <div id="checklistRows"></div>
    <button type="button" class="btn btn-secondary" style="font-size:12px;padding:6px 10px" onclick="addChecklistRow('action','')">+ Tambah Item</button>
  </div>
  <div class="form-row">
    <label>📢 Pengumuman / Polisi Wajib Dimaklumkan kepada Penghutang <span style="font-weight:400;color:var(--text3)">(maklumat/dasar BARU yang collector WAJIB sebut dalam panggilan ini — cth: "Maklumkan penghutang yang ewallet/paylater akan disekat kerana akaun dimasukkan ke CTOS". Pilihan sahaja — boleh kosongkan jika tiada pengumuman khas untuk senario ini.)</span></label>
    <div id="disclosureRows"></div>
    <button type="button" class="btn btn-secondary" style="margin-top:6px;font-size:12px;padding:6px 10px" onclick="addDisclosureRow('')">+ Tambah Pengumuman</button>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveScenario('${existingId||''}')">Simpan</button>
  </div>`);
  // Hanya load extra checklist items — 5 kategori utama auto-score oleh AI
  const clData=(s&&s.checklist&&s.checklist.length)?s.checklist:[];
  clData.forEach(c=>addChecklistRow(c.cat,c.text));
  const existingDisclosures=(s&&s.disclosures&&s.disclosures.length)?s.disclosures:[];
  existingDisclosures.forEach(d=>addDisclosureRow(d));
}

// Tunjuk/sembunyi input bebas "nama client lain" bila pilihan "Lain-lain"
// dipilih dalam dropdown Client — supaya manager boleh taip mana-mana
// nama client (bukan terhad ke RedOne/Celcom/Digi sahaja).
function toggleClientOther(){
  const sel=document.getElementById('scClient');
  const other=document.getElementById('scClientOther');
  if(!sel||!other)return;
  other.style.display=sel.value==='Lain-lain'?'block':'none';
  if(sel.value!=='Lain-lain')other.value='';
}

function addChecklistRow(cat,text){
  const wrap=document.getElementById('checklistRows');
  if(!wrap)return;
  const row=document.createElement('div');
  row.className='checklist-row';
  row.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:flex-start';
  row.innerHTML=`
    <input class="cl-cat" type="hidden" value="${cat||'action'}" />
    <input class="cl-text" value="${(text||'').replace(/"/g,'&quot;')}" placeholder="Cth: Pastikan collector sahkan identiti sebelum bagi maklumat akaun..." style="flex:1" />
    <button type="button" class="btn btn-danger" style="padding:6px 10px;flex-shrink:0" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

// "Open" — tiada kategori dipaksa (tak macam checklist di atas yang kena
// pilih salah satu dari 5 SCORE_CATS) — sebab pengumuman/polisi baru
// (cth dasar CTOS/sekatan e-wallet) bukan soal gaya rundingan, tapi
// maklumat WAJIB yang collector mesti sampaikan, apa-apa pun senarionya.
function addDisclosureRow(text){
  const wrap=document.getElementById('disclosureRows');
  if(!wrap)return;
  const row=document.createElement('div');
  row.className='disclosure-row';
  row.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:flex-start';
  row.innerHTML=`
    <input class="dc-text" value="${(text||'').replace(/"/g,'&quot;')}" placeholder="Cth: Maklumkan penghutang yang ewallet/paylater akan disekat kerana akaun dimasukkan ke CTOS..." style="flex:1" />
    <button type="button" class="btn btn-danger" style="padding:6px 10px;flex-shrink:0" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

function editScenario(id){openAddScenario(id);}
async function saveScenario(existingId){
  const checklist=Array.from(document.querySelectorAll('#checklistRows .checklist-row'))
    .map(r=>({cat:r.querySelector('.cl-cat').value,text:r.querySelector('.cl-text').value.trim()}))
    .filter(c=>c.text);
  const disclosures=Array.from(document.querySelectorAll('#disclosureRows .disclosure-row .dc-text'))
    .map(i=>i.value.trim())
    .filter(Boolean);
  const gender=document.getElementById('scGender').value;
  const accent=document.getElementById('scAccent').value;
  // Client: kalau dropdown set ke "Lain-lain", guna nama yang ditaip dalam
  // input bebas (#scClientOther) sebagai nilai sebenar — bukan simpan
  // literal teks "Lain-lain" dalam DB.
  const scClientSel=document.getElementById('scClient').value;
  const clientValue=scClientSel==='Lain-lain'?document.getElementById('scClientOther').value.trim():scClientSel;
  const data={
    id:existingId||'s'+Date.now(),
    emoji:document.getElementById('scEmoji').value||'😐',
    name:document.getElementById('scName').value.trim(),
    gender,accent,
    voiceId:resolveVoiceId(gender,accent),
    title:document.getElementById('scTitle').value.trim(),
    amount:document.getElementById('scAmount').value.trim(),
    days:parseInt(document.getElementById('scDays').value)||30,
    level:document.getElementById('scLevel').value,
    balanceTier:document.getElementById('scBalanceTier').value,
    prompt:document.getElementById('scPrompt').value.trim(),
    checklist,
    disclosures,
    client:clientValue,
    icNumber:document.getElementById('scIc').value.trim(),
    accNumber:document.getElementById('scAccNumber').value.trim(),
    serviceNo:document.getElementById('scServiceNo').value.trim(),
    accType:document.getElementById('scAccType').value,
    registrationDate:document.getElementById('scRegDate').value,
    terminationDate:document.getElementById('scTermDate').value
  };
  if(!data.name||!data.title||!data.prompt){alert('Sila isi semua maklumat.');return;}
  // WAJIB: Maklumat Akaun Pelanggan kena lengkap dulu sebelum boleh simpan —
  // kalau tak, panel rujukan kat skrin panggilan collector akan separuh kosong.
  if(!data.client||!data.icNumber||!data.accNumber||!data.serviceNo||!data.accType||!data.registrationDate||!data.terminationDate){
    alert('Sila lengkapkan semua Maklumat Akaun Pelanggan (Client/IC/Acc Number/Service No./Acc Type/Tarikh Daftar/Tarikh Termination) sebelum simpan.');
    return;
  }
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
// Pool 20 suara dari ElevenLabs — dibahagi male/female
// Bila start call baru, sistem random pilih satu suara yang belum pernah
// dipakai dalam sesi terkini supaya tak bosan dengar suara sama
const VOICE_POOL = {
  male: [
    'd0grukerEzs069eKIauC','cHDwXsKG0qHMNLIjOusN','42bu2zNrjJXYzreZrTEu',
    'Q2ELiWzbuj5F0eFHXK6S','1wuUVbmqPGK24IaC0QTh','dNnVzcebCLVAswzGKvfO',
    'lMSqoJeA0cBBNA9FeHAs','SrWU271vZiNf2mrBhzL5','jtEc6V0BMZoMqpAMRJbl',
    'lvNyQwaZPcGFiNUWWiVa'
  ],
  female: [
    'PId0lEbL3SOYkQZSraml','nfMYisZqs1GOjTFllho3','vRaj2Gd0mefB1EU96ua2',
    'INmScOFtmeMGA4p0XRr1','qKNMkrcmsdf29T6K7Dbu','15Y62ZlO8it2f5wduybx',
    'GlqBE2PF88HyOJJBxQ9T','ZSNL4hPqCnqoMPaI4jGX','MpbYQvoTmXjHkaxtLiSh',
    'onQAwbsky3pmzMu2uapN'
  ]
};

// PUNCA BUG "scenario gagal simpan / training tak match scenario yang
// dicipta": fungsi resolveVoiceId() asalnya dipadam masa refactor ke
// VOICE_POOL (commit b706d3c), tapi saveScenario() di bawah masih panggil
// dia → ReferenceError senyap setiap kali tekan "Simpan", save fail tanpa
// sebarang alert, DB kekal simpan rekod LAMA. Fix: letak balik
// resolveVoiceId() sebagai placeholder ringkas — column `voice_id` di DB
// masih NOT NULL jadi kena isi sesuatu, tapi nilai ni TAK dipakai untuk
// playback sebenar (getVoiceId() di bawah random pick dari VOICE_POOL
// ikut `gender` setiap kali call baru, bukan baca field voiceId ni).
function resolveVoiceId(gender,accent){
  const pool=gender==='female'?VOICE_POOL.female:VOICE_POOL.male;
  return pool[0];
}

// Track suara yang dah dipakai — rotate supaya tak repeat
let usedVoices=[];
let activeVoiceId=null; // suara untuk sesi call semasa

function pickVoice(gender){
  const pool=gender==='female'?VOICE_POOL.female:VOICE_POOL.male;
  // Filter suara yang belum dipakai — kalau semua dah pakai, reset
  let available=pool.filter(v=>!usedVoices.includes(v));
  if(!available.length){usedVoices=[];available=pool;}
  const picked=available[Math.floor(Math.random()*available.length)];
  usedVoices.push(picked);
  return picked;
}

function getVoiceId(){
  // Guna suara yang dah dipilih untuk sesi ini (konsisten dalam satu call)
  if(activeVoiceId)return activeVoiceId;
  if(!scenario)return VOICE_POOL.male[0];
  const gender=scenario.gender||'male';
  activeVoiceId=pickVoice(gender);
  return activeVoiceId;
}

// Detect sentiment dari AI reply untuk adjust voice emotion
function getVoiceSettings(text){
  if(!text)return {stability:0.5,similarity_boost:0.75,style:0.4};
  const t=text.toLowerCase();
  // Marah/tension/jerit
  if(/marah|tension|bengang|geram|tak nak|pergi|letak|!{2,}|dah la|buat apa/.test(t))
    return {stability:0.25,similarity_boost:0.8,style:0.8,use_speaker_boost:true};
  // Sedih/menangis/tertekan
  if(/tak boleh|susah|masalah|tolong|tak ada duit|nangis|sedih/.test(t))
    return {stability:0.6,similarity_boost:0.75,style:0.3};
  // Gelak/santai
  if(/haha|hehe|lawak|takpe|ok ok|boleh je/.test(t))
    return {stability:0.7,similarity_boost:0.7,style:0.5};
  // Default — natural
  return {stability:0.5,similarity_boost:0.75,style:0.4};
}
function getSysPrompt(){
  if(!scenario)return '';

  // Accent-specific language instruction — OVERRIDE apa dalam scenario.prompt
  // supaya AI ikut loghat yang dipilih, bukan default slang Melayu
  const accent=scenario.accent||'melayu';
  const fmtD=d=>d?new Date(d).toLocaleDateString('ms-MY'):'-';
  const accentInstruction={
    melayu:`Anda orang Melayu Muslim. WAJIB bercakap slang Melayu Malaysia yang NATURAL dan SPONTAN.
GUNAKAN: "la", "kan", "tak", "nak", "ye ke", "betul ke", "hmm", "ha", "lah", "mana ada", "ish", "alah", "InsyaAllah", "alhamdulillah", "Allah".
JANGAN guna: "aiyoh", "da", "aiyo", "lah meh", "cannot meh", atau mana-mana slang Cina/India.
CONTOH AYAT: "Eh tak boleh la macam tu kan.", "Ha InsyaAllah saya bayar minggu depan la.", "Mana ada saya tak bayar, dah bayar dah."`,

    india:`Anda orang Malaysia berbangsa India Tamil. WAJIB bercakap slang Malaysian-Tamil yang JELAS BERBEZA dari Melayu.
GUNAKAN WAJIB: "aiyoh", "aiya", "da", "dei", "macam mana la da", "itu macam ka", "cannot la da", "why like that da", "I tell you da", "samy", "appah".
Campur Tamil words sekali-sekala: "enna" (apa), "theriyum" (tahu), "vendaam" (tak nak).
JANGAN SESEKALI guna: "InsyaAllah", "alhamdulillah", "ish", "mana ada" — anda BUKAN Melayu Muslim.
CONTOH AYAT: "Aiyoh da, macam mana la I nak bayar sekarang da?", "Cannot la dei, I no money now la.", "Enna you want from me da?"`,

    cina:`Anda orang Malaysia berbangsa Cina. WAJIB bercakap slang Malaysian-Chinese (Manglish) yang JELAS BERBEZA dari Melayu dan India.
GUNAKAN WAJIB: "aiyo", "wah", "lah", "meh", "one", "lor", "leh", "cannot meh", "like that also can meh", "why you like that one", "sure or not", "confirm or not", "walao".
Struktur ayat Manglish: letak "lah/meh/lor/one" kat hujung ayat.
JANGAN SESEKALI guna: "InsyaAllah", "alhamdulillah", "aiyoh da", "dei" — anda BUKAN Melayu atau India.
CONTOH AYAT: "Aiyo why you call me one?", "Cannot lah, I no money now lah.", "Walao, so much money meh? Sure or not?"`
  }[accent]||'Bercakap dalam Bahasa Malaysia.';

  const base=scenario.prompt
    .replace(/{name}/g,scenario.name)
    .replace(/{amount}/g,scenario.amount)
    .replace(/{days}/g,scenario.days);

  // ARAHAN BAHASA / LOGHAT — inject selepas base prompt, lebih utama
  const accentBlock=`\n\nARAHAN BAHASA / LOGHAT (WAJIB IKUT — lebih utama daripada arahan lain): ${accentInstruction}`;

  // Tukar nombor telefon ke sebutan natural: 0142536985 → "oh satu empat dua lima tiga enam sembilan lapan lima"
  const digitWord=['kosong','satu','dua','tiga','empat','lima','enam','tujuh','lapan','sembilan'];
  function spokenPhone(num){
    return (num||'').replace(/\d/g,d=>digitWord[+d]).replace(/\s+/g,' ').trim();
  }
  // Tukar RM ke sebutan natural: RM1234.50 → "seribu dua ratus tiga puluh empat ringgit lima puluh sen"
  function spokenRM(amtStr){
    if(!amtStr)return amtStr;
    const m=amtStr.replace(/,/g,'').match(/[\d]+(?:\.[\d]{1,2})?/);
    if(!m)return amtStr;
    const [ringgit,sen]=(m[0]).split('.');
    const r=parseInt(ringgit)||0;
    const s=parseInt((sen||'0').padEnd(2,'0'))||0;
    function toWords(n){
      if(n===0)return '';
      if(n<0)return 'negatif '+toWords(-n);
      const ones=['','satu','dua','tiga','empat','lima','enam','tujuh','lapan','sembilan',
                  'sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas',
                  'enam belas','tujuh belas','lapan belas','sembilan belas'];
      const tens=['','','dua puluh','tiga puluh','empat puluh','lima puluh',
                  'enam puluh','tujuh puluh','lapan puluh','sembilan puluh'];
      if(n<20)return ones[n];
      if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'');
      if(n<1000){const h=Math.floor(n/100);return (h===1?'seratus':ones[h]+' ratus')+(n%100?' '+toWords(n%100):'');}
      if(n<1000000){const k=Math.floor(n/1000);return (k===1?'seribu':toWords(k)+' ribu')+(n%1000?' '+toWords(n%1000):'');}
      return amtStr; // fallback kalau terlalu besar
    }
    let result=toWords(r)+' ringgit';
    if(s>0)result+=' '+toWords(s)+' sen';
    return result||amtStr;
  }

  const spokenAmount=spokenRM(scenario.amount);
  const spokenService=spokenPhone(scenario.serviceNo);
  const spokenIC=spokenPhone(scenario.icNumber);
  const spokenAcc=spokenPhone(scenario.accNumber);

  // KONTEKS PENUH SENARIO — auto-inject semua data dari form
  const contextBlock=`\n\nKONTEKS SENARIO (fakta tetap tentang penghutang ini):\n- Nama: ${scenario.name}\n- Jumlah hutang: ${scenario.amount} (sebut sebagai: "${spokenAmount}")\n- Hari tertunggak: ${scenario.days} hari\n- Jenis akaun: ${scenario.accType||'-'}\n- Client telco: ${scenario.client||'-'}\n- No. IC: ${scenario.icNumber||'-'} (sebut digit demi digit: "${spokenIC}")\n- No. Akaun: ${scenario.accNumber||'-'} (sebut digit demi digit: "${spokenAcc}")\n- No. Servis/telefon: ${scenario.serviceNo||'-'} (sebut digit demi digit: "${spokenService}")\n- Tarikh daftar: ${fmtD(scenario.registrationDate)}\n- Tarikh termination: ${fmtD(scenario.terminationDate)}\n- Aras kesukaran: ${scenario.level==='easy'?'Mudah':scenario.level==='hard'?'Sukar':'Sederhana'}`;

  const groundingBlock=`\n\nPENTING — FAKTA DI ATAS ADALAH TETAP. Jika collector sebut jumlah, tarikh, atau maklumat akaun yang BERBEZA daripada fakta di atas, JANGAN terus bersetuju. Bertindak realistik — keliru, tanya balik, atau betulkan collector. Contoh: "Eh, bukan ke hutang saya ${scenario.amount}? Kenapa awak sebut lain pula?" atau "Saya tak pasti nombor tu betul ke tak, boleh check balik?". Jangan akur jika maklumat tidak konsisten.`;

  const levelBehaviour={
    easy:`Aras Mudah — anda adalah penghutang yang MUDAH dilayan: cepat akur bila diberi alasan munasabah, tidak banyak bantahan, bersedia bagi PTP kalau diminta dengan baik, nada agak cooperative walaupun ada sedikit keberatan awal.`,
    med:`Aras Sederhana — anda adalah penghutang yang ADA RESISTANCE: bagi 1-2 bantahan atau alasan sebelum akur, perlu sedikit pujukan, mungkin minta masa lebih atau tawar PTP yang lewat, tapi akhirnya boleh reach agreement kalau collector approach dengan betul.`,
    hard:`Aras Sukar — anda adalah penghutang yang DEGIL dan SUSAH DILAYAN: banyak bantahan, selalu potong cakap collector, bagi alasan berulang-ulang, emosi mudah naik, mungkin cuba letak telefon atau ugut nak report, SANGAT susah nak dapat PTP — collector kena kerja keras betul-betul baru dapat commitment.`
  }[scenario.level||'med'];

  const naturalBlock=`\n\nCARA BERCAKAP (WAJIB IKUT):\n- Jawab PENDEK dan NATURAL — 1 hingga 3 ayat sahaja setiap giliran, macam orang bercakap telefon sebenar\n- JANGAN tulis ayat panjang berjela atau formal macam surat\n- Sebut nombor dan wang secara lisan: RM${scenario.amount} sebut sebagai "${spokenAmount}", no telefon sebut digit demi digit\n- Boleh guna bunyi natural: "hmm", "ha?", "eh", "ok ok", "ha ye", "ala..." mengikut situasi\n- Kadang-kadang boleh potong cakap, tanya balik, atau tergantung ayat kalau rasa keliru\n- Reaksi MESTI sesuai dengan watak dan situasi — kalau penghutang kata sibuk, dia tak bagi masa panjang\n\nARAS KESUKARAN SENARIO INI: ${levelBehaviour}`;
  return base+accentBlock+naturalBlock+contextBlock+groundingBlock;
}

async function startCall(){
  activeVoiceId=null; // reset suara — akan pick baru untuk call ni
  warmupMic(); // panaskan mic SEAWAL mungkin — sebelum collector sempat tekan butang mic (lihat nota di atas function warmupMic)
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
  stopMicLevelMeter(); // lepas track mic — call dah tamat
}

async function endCall(){
  // PUNCA BUG "sesi sebelum ini macam hilang/tak konsisten": butang "Tamatkan
  // Panggilan" tak pernah disable lepas ditekan — kalau collector double-click/
  // double-tap (selalu jadi bila butang besar kat skrin call), endCall() jalan
  // 2x serentak → evalCall() panggil Claude API 2x utk transcript yang SAMA &
  // cuba POST /api/sessions 2x. Fix: guard senyap, klik kedua/seterusnya
  // diabaikan terus sehingga sesi yang pertama habis disimpan.
  if(endCallInProgress)return;
  endCallInProgress=true;
  try{
    stopCall();
    const m=Math.floor(callSeconds/60),s=callSeconds%60;
    const duration=m+'m '+s+'s';
    navigate('score');
    document.getElementById('mainContent').innerHTML=`
    <div style="text-align:center;padding:3rem 1rem">
      <div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite;display:inline-block">⏳</div>
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">Menganalisis sesi latihan...</div>
      <div style="font-size:13px;color:var(--text3)">AI sedang menilai prestasi anda. Sila tunggu 10–20 saat.</div>
    </div>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
  `;
    await evalCall(duration);
  }finally{
    endCallInProgress=false;
  }
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
      body:JSON.stringify({text,voiceId:getVoiceId(),voiceSettings:getVoiceSettings(text)})
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

// Kamus pembetulan STT — global scope supaya boleh diakses oleh processSpeech()
const STT_CORRECTIONS=[
  [/\bpr\s*one\b/gi,'RedOne'],[/\bred\s*one\b/gi,'RedOne'],
  [/\bcel\s*com\b/gi,'Celcom'],[/\bsel\s*com\b/gi,'Celcom'],[/\bcel\s*come\b/gi,'Celcom'],
  [/\bde\s*gi\b/gi,'Digi'],[/\bdi\s*gi\b/gi,'Digi'],[/\bdigi\s*cel\b/gi,'Digi'],
  [/\bmaxis\s*one\b/gi,'Maxis'],[/\bu\s*mobile\b/gi,'U Mobile'],
  [/\bc\s*t\s*o\s*s\b/gi,'CTOS'],[/\bc\s*c\s*r\s*i\s*s\b/gi,'CCRIS'],
  [/\bn\s*p\s*l\b/gi,'NPL'],[/\bn\s*p\s*n\b/gi,'NPL'],[/\bnon\s*performing\b/gi,'NPL'],
  [/\bp\s*t\s*p\b/gi,'PTP'],[/\bpromise\s*to\s*pay\b/gi,'PTP'],
  [/\bspdca\b/gi,'SPDCA'],[/\bspd\s*ca\b/gi,'SPDCA'],
  [/\bjom\s*pay\b/gi,'JomPay'],[/\bjompay\b/gi,'JomPay'],
  [/\bfpx\b/gi,'FPX'],[/\bringgit\s*malaysia\b/gi,'RM'],
  [/\bnew\s*vest\b/gi,'Newvest'],[/\bnew\s*face\b/gi,'New Face'],
  [/\bdc\s*a\b/gi,'DCA'],[/\bde\s*ce\s*a\b/gi,'DCA'],
  [/\bwhat\s*sapp\b/gi,'WhatsApp'],[/\bwhat\s*app\b/gi,'WhatsApp'],
];
function correctSTT(text){
  let t=text;
  STT_CORRECTIONS.forEach(([pattern,replacement])=>{t=t.replace(pattern,replacement);});
  return t;
}

// ═══════════ MIC LEVEL METER (pre-warm + visual feedback) ═══════════
// PUNCA BUG "mic tak detect, terpaksa cakap berulang-ulang": 2 sebab utama —
// (1) getUserMedia/permission & (untuk headset Bluetooth) profile-switch
//     HSP→HFP cuma start LEPAS collector tekan butang mic, ambil ~1-2 saat;
//     sepanjang masa tu SpeechRecognition dah `start()` tapi mic belum betul²
//     "live" → perkataan PERTAMA yang collector cakap terus hilang, baru
//     perasan lepas dah cakap & kena ulang. Fix: warmupMic() dipanggil
//     seawal startCall() — sebelum collector sempat tekan mic langsung —
//     supaya permission & profile-switch siap dulu, recognition.start()
//     lepas tu terus "panas".
// (2) Takde sebarang visual feedback bunyi betul² masuk ke mic atau tak —
//     collector cuma nampak ikon berkelip statik "Sedang rakam...", tak
//     boleh self-diagnose sama ada isu di hardware/permission dia atau di
//     app. Fix: bar level bunyi real-time bawah butang mic (#micLevelFill)
//     supaya collector nampak SENDIRI kalau mic betul² detect bunyi —
//     kalau bar tu tak gerak langsung walaupun dah cakap kuat, dia terus
//     tahu masalah kat mic/permission dia, bukan app yang rosak.
async function warmupMic(){
  try{
    if(micStream)return; // dah warm dari turn sebelum ni, skip
    micStream=await navigator.mediaDevices.getUserMedia({audio:true});
    micAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const source=micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser=micAudioCtx.createAnalyser();
    micAnalyser.fftSize=512;
    source.connect(micAnalyser);
    tickMicLevel();
  }catch(e){
    // Gagal warm-up awal — bukan fatal, SpeechRecognition akan minta
    // permission sendiri bila recognition.start() dipanggil nanti (cuma
    // collector tak dapat manfaat "panaskan awal" ni).
    console.warn('Mic warm-up gagal:',e.message);
  }
}

function tickMicLevel(){
  if(!micAnalyser)return;
  const data=new Uint8Array(micAnalyser.fftSize);
  micAnalyser.getByteTimeDomainData(data);
  let sum=0;
  for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;sum+=v*v;}
  const level=Math.min(1,Math.sqrt(sum/data.length)*4); // RMS, di-scale supaya nampak jelas dalam bar
  if(isRecording)micPeakSinceStart=Math.max(micPeakSinceStart,level);
  const fill=document.getElementById('micLevelFill');
  if(fill)fill.style.width=(isRecording?Math.round(level*100):0)+'%';
  micLevelRAF=requestAnimationFrame(tickMicLevel);
}

function stopMicLevelMeter(){
  if(micLevelRAF){cancelAnimationFrame(micLevelRAF);micLevelRAF=null;}
  if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}
  if(micAudioCtx){try{micAudioCtx.close();}catch(e){}micAudioCtx=null;}
  micAnalyser=null;
}

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
  const SILENCE_MS=1500; // 1500ms — cukup untuk pause natural, tak terlalu lambat

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
  // PUNCA BUG "teks/respon double": stopRec() (klik manual henti mic) dan
  // recognition.onend (yang ter-fire SEBAB recognition.stop() dipanggil dalam
  // stopRec()) DUA-DUA terus panggil processSpeech() dengan teks yang SAMA —
  // jadi 1 ucapan collector dihantar 2x ke /api/claude, transcript jadi
  // double, dan AI respon (+ suara TTS) pun double. Fix: satu flag `dispatched`
  // jadi "tiket sekali guna" — sesiapa (silence-timer / manual stop / error /
  // onend) yang sampai dulu, dia je yang hantar; selebihnya jadi no-op senyap.
  let dispatched=false;

  function currentText(){return (lastFinal+' '+lastInterim).trim();}

  function dispatchIfNeeded(){
    if(dispatched)return;
    const text=currentText();
    if(text.length>1){
      dispatched=true;
      lastFinal='';lastInterim='';
      processSpeech(text);
    } else {
      // Tiada teks — reset dan restart mic supaya collector boleh cuba semula
      lastFinal='';lastInterim='';
      if(callActive&&!isRecording)startRec();
    }
  }

  function armSilenceTimer(){
    clearTimeout(silenceTimer);
    silenceTimer=setTimeout(()=>{
      if(dispatched)return;
      recognition.stop();
      dispatchIfNeeded();
    },SILENCE_MS);
  }

  recognition.onstart=()=>{
    isRecording=true;
    micPeakSinceStart=0; // reset — ukur peak bunyi untuk turn baru ni je
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
    if(dispatched)return;
    const text=currentText();
    if(text.length>1){
      // Ada teks yang sempat ditangkap sebelum ralat — jangan buang, hantar.
      recognition.stop();
      dispatchIfNeeded();
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
    // Guna micPeakSinceStart (dari level meter) untuk bezakan 2 jenis
    // "no-speech" — mic memang tak dengar APA-APA bunyi (isu hardware/
    // permission/Bluetooth) lawan ada bunyi tapi STT tak dapat faham
    // (cakap kurang jelas/laju). Mesej lain² supaya collector tahu nak
    // buat apa, bukan cuma "ralat" generik.
    const noSpeechMsg=micPeakSinceStart<0.05
      ?'Mic tak mengesan SEBARANG bunyi. Cuba check setting privacy mic browser anda, pastikan headset/mic dipilih betul, atau cuba mic lain.'
      :'Bunyi dikesan tapi tak dapat difahami. Cuba cakap lebih jelas, perlahan & dekat dengan mic.';
    const m={'not-allowed':'Mic tidak dibenarkan. Allow akses mikrofon.','no-speech':noSpeechMsg,'network':'Ralat rangkaian. Sila semak sambungan internet & cuba lagi.'};
    setStatus('','⚠ '+(m[e.error]||'Ralat: '+e.error));
  };

  recognition.onend=()=>{
    isRecording=false;
    clearTimeout(silenceTimer);
    if(dispatched){
      // Sesi STT ni dah pun dihantar (silence-timer/manual-stop/error sampai
      // dulu) — JANGAN sentuh UI lagi, elak overwrite state 'AI sedang
      // berfikir...' yang processSpeech() baru je set.
      return;
    }
    // Kalau ada teks terkumpul (final ATAU interim) tapi belum dihantar lagi —
    // cth browser stop recognition tiba-tiba (network blip) — hantar sekarang
    // supaya tak ada perkataan terakhir yang hilang.
    const text=currentText();
    if(text.length>1){
      dispatchIfNeeded();
    }else{
      resetMicBtn();
    }
  };

  recognition.start();
}

function stopRec(){
  // Jangan panggil processSpeech() terus di sini — recognition.stop() di
  // bawah akan trigger 'onend' (lihat startRec()), dan flag `dispatched`
  // kat situ yang akan uruskan hantar teks (sekali sahaja). Ni punca fix bug
  // "teks/respon double" bila collector tekan mic untuk henti secara manual.
  if(recognition)recognition.stop();
  isRecording=false;
}

async function processSpeech(rawText){
  const text=correctSTT(rawText); // betulkan STT errors sebelum hantar ke AI & transcript
  const lt=document.getElementById('liveText');if(lt)lt.textContent='';
  setMicState('thinking','⏳','AI sedang berfikir...');setStatus('','AI sedang berfikir...');
  addBubble('collector',text);callHistory.push({role:'user',content:text});
  try{
    const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:200,system:getSysPrompt(),messages:callHistory})});
    const data=await res.json();
    const reply=data.content?.[0]?.text||'Hmm...';
    callHistory.push({role:'assistant',content:reply});addBubble('debtor',reply);
    speakEl(reply);
  }catch(e){addBubble('debtor','[Ralat AI. Cuba lagi.]');resetMicBtn();setStatus('green','Tekan mikrofon untuk bercakap.');}
}

async function evalCall(duration){
  const transcript=callHistory.map(m=>`${m.role==='user'?'Collector':'Penghutang'}: ${m.content}`).join('\n');
  const checklist=(scenario&&scenario.checklist)||[];
  // 5 kategori scoring sentiasa dinilai — ini standard untuk SEMUA senario
  const fixedCriteria=[
    '- [Tone / Nada] Nada collector sepanjang panggilan — sopan, tenang, profesional, tidak agresif atau defensif',
    '- [Cara Penyampaian] Kejelasan penyampaian, struktur ayat, kawalan perbualan, tidak tergagap atau keliru',
    '- [Hujah Balas] Keberkesanan counter terhadap bantahan, alasan, atau emosi penghutang',
    '- [Tindakan & Pematuhan] Ikut SOP — sahkan identiti, nyatakan tujuan panggilan, dapatkan PTP jelas & spesifik, dokumentasi betul, tidak mengugut',
    '- [Strategi Baki Hutang] Pendekatan strategi mengikut tahap baki hutang ('+( scenario&&scenario.balanceTier==='low'?'RENDAH — dorong bayaran penuh':'TINGGI — tawar ansuran berstruktur')+')'
  ].join('\n');
  // Extra items spesifik untuk senario ini (kalau ada)
  const extraItems=checklist.length
    ?'\n\nITEM TAMBAHAN SPESIFIK SENARIO INI:\n'+checklist.map(c=>`- ${c.text}`).join('\n')
    :'';
  const checklistText=fixedCriteria+extraItems;
  const disclosures=(scenario&&scenario.disclosures)||[];
  const disclosuresText=disclosures.length
    ?disclosures.map(d=>`- ${d}`).join('\n')
    :'(Tiada pengumuman/polisi khas untuk senario ini.)';
  const tierLabel=scenario&&scenario.balanceTier==='low'?'RENDAH':'TINGGI';
  const tierHint=scenario&&scenario.balanceTier==='low'
    ?'Strategi sesuai: dorong bayaran PENUH sekaligus dahulu sebelum tawar ansuran.'
    :'Strategi sesuai: tawar pelan ansuran/penjadualan semula berstruktur, bukan desak bayaran sekaligus.';
  const fmtD=d=>d?new Date(d).toLocaleDateString('ms-MY'):'-';

  const prompt=`Anda seorang Quality Assurance Manager pakar debt collection di Malaysia. Tugas anda menilai prestasi COLLECTOR (BUKAN penghutang) dalam perbualan latihan di bawah secara KRITIKAL, SPESIFIK dan membina — fokus mencari kesilapan sebenar dan perkara yang sepatutnya dibuat tapi TIDAK dibuat, bukan pujian generik kosong.

SENARIO: ${scenario?scenario.title:''}
Nama Penghutang: ${scenario?scenario.name:''} | Jumlah Hutang: ${scenario?scenario.amount:''} | Tertunggak: ${scenario?scenario.days:''} hari
Maklumat Akaun Pelanggan (rujukan untuk semak ketepatan notes collector): Client ${scenario?scenario.client||'-':'-'} | No. IC ${scenario?scenario.icNumber||'-':'-'} | Acc Number ${scenario?scenario.accNumber||'-':'-'} | Service No. ${scenario?scenario.serviceNo||'-':'-'} | Acc Type ${scenario?scenario.accType||'-':'-'} | Tarikh Daftar ${scenario?fmtD(scenario.registrationDate):'-'} | Tarikh Termination ${scenario?fmtD(scenario.terminationDate):'-'}
Tahap Baki Hutang: ${tierLabel}. ${tierHint}

CHECKLIST TINDAKAN YANG DIJANGKA UNTUK SENARIO INI:
${checklistText}

PENGUMUMAN / POLISI WAJIB YANG COLLECTOR MESTI MAKLUMKAN KEPADA PENGHUTANG DALAM PANGGILAN INI (maklumat/dasar BARU syarikat — collector WAJIB menyebutnya secara EKSPLISIT dalam perbualan; gagal berbuat demikian walaupun SATU item adalah isu pematuhan SERIUS, bukan sekadar gaya rundingan):
${disclosuresText}

PERBUALAN PENUH (Collector vs Penghutang):
${transcript}

Masa Panggilan: ${duration}

PENTING: Jika transcript amat pendek (kurang 5 giliran perbualan), tetap beri markah ADIL berdasarkan apa yang ADA — jangan bagi 2/20 secara default. Walaupun singkat, analisis nada, cara sebut nama, cara bagi salam/perkenalan, dan sama ada collector terus ke tujuan panggilan dengan betul.

TUGAS ANDA — analisis transcript di atas baris demi baris, kemudian:

1. Markah 5 aspek (setiap satu 0-20, jumlah maksimum 100) DAN bagi "scoreReasons" — 1-2 ayat per kategori yang WAJIB sebut (a) apa yang collector buat/tidak buat dalam kategori tu, (b) contoh SPESIFIK dari transcript (petik ayat pendek atau situasi), dan (c) kenapa markah tu diberikan (bukan sekadar cakap "baik" atau "lemah" tanpa bukti):
   - tone: Nada & profesionalisme collector (sopan, tenang, tidak defensif/agresif)
   - delivery: Cara penyampaian — kejelasan, struktur ayat, kawalan perbualan
   - counter: Keberkesanan hujah balas (counter) terhadap bantahan/dalih/emosi penghutang
   - action: Tindakan & pematuhan — ikut checklist di atas + SOP umum (pengesahan identiti/akaun, nyatakan tujuan panggilan, dapatkan PTP yang jelas & spesifik, dokumentasi, TIDAK mengugut/memaksa). Selitkan juga: (a) Dispute Handling — jika penghutang bangkitkan bantahan/dispute (dakwa sudah bayar, jumlah tak tepat, dsb), adakah collector tangani dengan betul (semak, jelaskan, jangan abaikan/tolak bantahan secara sambil lewa)? (b) Ketepatan Notes — adakah maklumat yang disebut/disahkan collector (jumlah, tarikh, tempoh, No. IC, Acc Number, Service No., Acc Type, Client, dsb) tepat dan konsisten dengan SENARIO & Maklumat Akaun Pelanggan di atas, atau adakah collector tersilap nyatakan maklumat akaun? (c) Pengumuman Wajib — adakah collector menyebut SECARA EKSPLISIT setiap item dalam senarai "PENGUMUMAN/POLISI WAJIB" di atas (jika senarai tu tak kosong)? Jika ada satu sahaja yang tertinggal, markah aspek action MESTI rendah.

2. strengths: 1-4 perkara yang collector BETUL-BETUL buat dengan baik (spesifik, bukan umum).

3. missed: WAJIB 3-5 perkara checklist/SOP yang PATUT dilakukan collector TAPI TIDAK dilakukan, atau dilakukan dengan salah/lemah (MAKSIMUM 5 — pilih yang PALING penting/kritikal sahaja, walaupun panggilan panjang/banyak isu). Ini bahagian PALING PENTING dalam latihan ini — JANGAN biarkan kosong walaupun panggilan nampak baik; setiap panggilan ADA ruang penambahbaikan, cari ia walaupun kecil. PENTING: jika mana-mana item dalam "PENGUMUMAN/POLISI WAJIB" di atas TIDAK disebut langsung oleh collector sepanjang transcript, WAJIB masukkan sebagai SATU item 'missed' (category: action, issue mulakan dengan "Pengumuman wajib tidak disampaikan: ...") — beri keutamaan tertinggi kepada isu jenis ni berbanding isu gaya/SOP umum yang lain, sebab ia kegagalan pematuhan, bukan sekadar kelemahan rundingan. Untuk SETIAP item beri (kekalkan ringkas, 1-2 ayat setiap field):
   - category: salah satu dari tone/delivery/counter/action/balance
   - issue: apa yang tak dibuat/salah (spesifik kepada perbualan ini, bukan teori umum)
   - suggestion: ayat atau tindakan SPESIFIK (boleh terus dipakai/dihafal) yang patut collector guna sebagai gantinya
   - quote: petikan ringkas (≤15 patah perkataan) dari ayat collector dalam transcript yang berkaitan isu ini, atau "" jika tiada ayat spesifik berkaitan

4. harassmentRisk: "none" jika tiada isu langsung, "low"/"medium"/"high" jika collector menggunakan nada mengugut/memaksa/mendesak melampau, malu-malukan, atau melanggar etika debt collection. Jika bukan "none", isi harassmentNote (1 ayat ringkas, rujuk contoh dari transcript) — ini akan dipaparkan kepada manager untuk semakan pematuhan.

5. priorityFocus: SATU aspek (category sama macam atas) yang PALING perlu collector fokus dalam sesi latihan SETERUSNYA (biasanya aspek dengan markah terendah atau isu paling kritikal), dengan "tip" ringkas 1 ayat — spesifik & boleh terus diamalkan, bukan nasihat umum.

6. feedback: ringkasan keseluruhan 3-4 ayat dalam Bahasa Malaysia, nada membina (constructive coaching), bukan menghukum. WAJIB spesifik kepada panggilan ini (rujuk isu/kekuatan sebenar dari transcript, bukan ayat generik macam "secara keseluruhan baik"), dan tutup dengan 1 ayat galakan/arah tindakan konkrit untuk sesi latihan akan datang — bukan sekadar pujian kosong.

Jawab JSON SAHAJA tanpa markdown/code-fence, ikut struktur tepat ini:
{"totalScore":<0-100>,"scores":{"tone":<0-20>,"delivery":<0-20>,"counter":<0-20>,"action":<0-20>,"balance":<0-20>},"scoreReasons":{"tone":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","delivery":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","counter":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","action":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","balance":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript"},"strengths":["..."],"missed":[{"category":"tone|delivery|counter|action|balance","issue":"...","suggestion":"...","quote":"..."}],"harassmentRisk":"none|low|medium|high","harassmentNote":"","priorityFocus":{"category":"tone|delivery|counter|action|balance","tip":"..."},"feedback":"..."}`;

  try{
    const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:3000,messages:[{role:'user',content:prompt}]})});
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
    // PUNCA BUG "sesi tak tersimpan": jadual `sessions` ada CHECK constraint
    // harassment_risk IN ('none','low','medium','high') — kalau Claude pulangkan
    // nilai luar dari 4 ni (cth casing lain/kosong), INSERT akan ditolak DB
    // (gagal senyap, cuma masuk console.error). Clamp dulu sebelum hantar.
    const VALID_HARASSMENT=['none','low','medium','high'];
    const harassmentRisk=VALID_HARASSMENT.includes(r.harassmentRisk)?r.harassmentRisk:'none';
    const sessionData={
      id:'sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      collectorId:currentUser.id,scenarioId:scenario?scenario.id:'',
      scenarioName:scenario?scenario.title:'',duration,date:new Date().toISOString(),
      totalScore,scores,
      strengths:Array.isArray(r.strengths)?r.strengths:[],
      scoreReasons:r.scoreReasons||{},
      missed,priorityFocus,
      harassmentRisk,
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
      console.error('Gagal simpan sesi ke Supabase (cubaan 1):',saveErr);
      // Cuba SEKALI lagi dengan id baru — litupi kes jarang (id sama tertimpa
      // request lain hampir serentak). Kalau cubaan kedua pun gagal, baru
      // mengalah & beritahu collector terus terang.
      try{
        sessionData.id='sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
        await sessionApi.create(sessionData);
        await loadSessions(true);
      }catch(saveErr2){
        console.error('Gagal simpan sesi ke Supabase (cubaan 2, mengalah):',saveErr2);
        sessionData.feedback+=' (⚠ Nota: hasil ni TAK tersimpan dalam "Rekod Latihan" — ada ralat simpan ke pangkalan data. Sila screenshot skrin ni & ralat dalam console browser (F12 → Console) untuk dilaporkan.)';
      }
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
