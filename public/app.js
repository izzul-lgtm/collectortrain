// ═══════════ DATABASE (localStorage — kosong sekarang, semua dah pindah ke Supabase) ═══════════
// Helper: inject x-user-id header untuk semua API calls yang perlu auth.
// /api/auth/* (login, register, session) dikecualikan — tu memang pre-login.
function authHeaders(extra) {
  const id = localStorage.getItem('ct_session_id') || '';
  return { 'Content-Type': 'application/json', 'x-user-id': id, ...extra };
}

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
    const res=await fetch('/api/scenarios',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil senario.');
    return data.scenarios||[];
  },
  async save(scenario){
    const res=await fetch('/api/scenarios',{method:'POST',headers:authHeaders(),body:JSON.stringify(scenario)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal simpan senario.');
    return data.scenario;
  },
  async remove(id){
    const res=await fetch('/api/scenarios',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
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
    const res=await fetch('/api/sessions',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil sesi latihan.');
    return data.sessions||[];
  },
  async create(sessionData){
    const res=await fetch('/api/sessions',{method:'POST',headers:authHeaders(),body:JSON.stringify(sessionData)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal simpan sesi latihan.');
    return data.session;
  }
};
let sessionsCache=null;
let sessionsCacheAt=0;
const CACHE_TTL=5*60*1000; // 5 minit — kalau tab lama buka, data auto-refresh
async function loadSessions(force){
  if(sessionsCache&&!force&&(Date.now()-sessionsCacheAt<CACHE_TTL))return sessionsCache;
  sessionsCache=await sessionApi.list();
  sessionsCacheAt=Date.now();
  return sessionsCache;
}

// ═══════════ PENDING SESSION QUEUE (Offline / Supabase down recovery) ═══════════
// Kalau Supabase tak boleh reach semasa save session, kita simpan dulu
// dalam localStorage sebagai "pending" — dan auto-retry bila app load
// semula atau bila user buka mana-mana page (setiap 60 saat).
const PENDING_KEY='ct_pending_sessions';
function getPendingSessions(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');}catch{return[];}}
function savePendingSessions(arr){localStorage.setItem(PENDING_KEY,JSON.stringify(arr));}
function addPendingSession(sessionData){
  const arr=getPendingSessions();
  // Elak duplicate kalau id sama dah ada dalam queue
  if(!arr.find(x=>x.id===sessionData.id))arr.push(sessionData);
  savePendingSessions(arr);
  showPendingBanner();
}
function removePendingSession(id){
  savePendingSessions(getPendingSessions().filter(x=>x.id!==id));
}

function showPendingBanner(){
  const pending=getPendingSessions();
  let banner=document.getElementById('pendingSyncBanner');
  if(pending.length===0){if(banner)banner.remove();return;}
  if(!banner){
    banner=document.createElement('div');
    banner.id='pendingSyncBanner';
    banner.style.cssText='position:fixed;bottom:16px;right:16px;background:#854F0B;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:9999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:320px;';
    document.body.appendChild(banner);
  }
  banner.innerHTML=`⏳ <span>${pending.length} sesi belum tersimpan — akan cuba semula...</span> <button onclick="retryPendingSessions()" style="background:#fff;color:#854F0B;border:none;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-weight:600">Cuba Sekarang</button>`;
}

async function retryPendingSessions(){
  const pending=getPendingSessions();
  if(pending.length===0){showPendingBanner();return;}
  let successCount=0;
  for(const s of pending){
    try{
      await sessionApi.create(s);
      removePendingSession(s.id);
      successCount++;
    }catch(e){
      // Masih gagal — tunggu retry seterusnya
    }
  }
  if(successCount>0){
    await loadSessions(true);
    showPendingBanner();
    if(getPendingSessions().length===0){
      const banner=document.getElementById('pendingSyncBanner');
      if(banner){
        banner.style.background='#166534';
        banner.innerHTML='✅ Semua sesi berjaya disimpan!';
        setTimeout(()=>banner.remove(),3000);
      }
    }
  }
}

// Auto-retry setiap 60 saat kalau ada pending sessions
setInterval(()=>{if(getPendingSessions().length>0)retryPendingSessions();},60000);

// ═══════════ USERS API (Supabase, via /api/users + /api/auth/*) ═══════
// Sama sebab macam scenarios di atas — users (admin/manager/collector)
// dulu hidup dalam localStorage (plaintext password pun di situ, boleh
// terus dibaca dalam app.js source!). Sekarang password di-hash (bcrypt)
// dan disimpan di Supabase; verify password buat di SERVER (app/api/
// auth/login) — password mentah tak pernah sampai balik ke browser lagi.
const userApi = {
  async list(){
    const res=await fetch('/api/users',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal ambil senarai pengguna.');
    return data.users||[];
  },
  async remove(id){
    const res=await fetch('/api/users',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
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

// FIX: kad preview senario (sebelum mula call) dulu tunjuk teks {name}/{amount}/{days}
// literal sebab tak di-substitute — collector nampak "Anda berlakon sebagai {name}..."
// sedangkan prompt sebenar yang dihantar ke AI (buildSystemPrompt) dah substitute betul.
// Helper ni dipakai khusus untuk PAPARAN preview supaya collector nampak nama/amount
// sebenar sebelum start call, tanpa ubah logik buildSystemPrompt yang sedia ada.
function fillScenarioPlaceholders(text,s){
  if(!text||!s)return text||'';
  return text
    .replace(/{name}/g,s.name||'')
    .replace(/{amount}/g,s.amount||'')
    .replace(/{days}/g,s.days||'');
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

// Filter state untuk page "Sesi Latihan" (manager/admin) & "Rekod Saya" (collector).
// Disimpan di sini (bukan dalam form je) supaya filter tak hilang bila page
// di-render semula (contoh: lepas tutup modal "Lihat" sesi).
let sessionsFilter={collectorId:'',scenario:'',skor:'',dateFrom:'',dateTo:''};
let myHistoryFilter={scenario:'',skor:'',dateFrom:'',dateTo:''};

// PAGINATION — senarai sesi boleh sampai 100+ rekod, elak list semua sekali
// (lambat & sukar nak scroll). Papar ikut "muka surat" dengan butang Sebelum/Next.
const SESSIONS_PAGE_SIZE=20;
let sessionsPage=1;     // muka surat semasa — "Sesi Latihan" (admin/manager)
let myHistoryPage=1;    // muka surat semasa — "Rekod Saya" (collector)

// Render bar "Muka X dari Y" + butang Sebelum/Next. `onPageChange` ialah nama
// fungsi JS (string) yang dipanggil bila tukar muka surat, cth "goSessionsPage".
function paginationBar(currentPage,totalItems,pageSize,onPageChange){
  const totalPages=Math.max(1,Math.ceil(totalItems/pageSize));
  if(totalPages<=1)return'';
  return`
  <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 0 4px">
    <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" ${currentPage<=1?'disabled':''} onclick="${onPageChange}(${currentPage-1})">‹ Sebelum</button>
    <span style="font-size:12px;color:var(--text3)">Muka ${currentPage} dari ${totalPages}</span>
    <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" ${currentPage>=totalPages?'disabled':''} onclick="${onPageChange}(${currentPage+1})">Next ›</button>
  </div>`;
}
function goSessionsPage(p){sessionsPage=p;renderSessions();}
function goMyHistoryPage(p){myHistoryPage=p;renderMyHistory();}

// Filter dashboard "Hari Ini / Bulan Ini / Tahun Ini / Semua" — supaya admin/manager
// senang nak tengok prestasi ikut tempoh tertentu tanpa kira manual dari senarai penuh.
let dashboardPeriod='all';
function getPeriodRange(period){
  const now=new Date();
  if(period==='day'){
    const start=new Date(now);start.setHours(0,0,0,0);
    const end=new Date(start);end.setDate(end.getDate()+1);
    return{start,end};
  }
  if(period==='month'){
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,1);
    return{start,end};
  }
  if(period==='year'){
    const start=new Date(now.getFullYear(),0,1);
    const end=new Date(now.getFullYear()+1,0,1);
    return{start,end};
  }
  return null; // 'all' — tiada had tarikh
}
// Tempoh SEBELUM tempoh semasa (sama jenis) — untuk kira trend ▲▼ vs tempoh lepas
function getPrevPeriodRange(period){
  const now=new Date();
  if(period==='day'){
    const start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-1);
    const end=new Date(start);end.setDate(end.getDate()+1);
    return{start,end};
  }
  if(period==='month'){
    const start=new Date(now.getFullYear(),now.getMonth()-1,1);
    const end=new Date(now.getFullYear(),now.getMonth(),1);
    return{start,end};
  }
  if(period==='year'){
    const start=new Date(now.getFullYear()-1,0,1);
    const end=new Date(now.getFullYear(),0,1);
    return{start,end};
  }
  return null;
}
function filterSessionsByRange(sessions,range){
  if(!range)return sessions;
  return sessions.filter(s=>{const d=new Date(s.date);return d>=range.start&&d<range.end;});
}
function periodLabel(period){
  return{day:'Hari Ini',month:'Bulan Ini',year:'Tahun Ini'}[period]||'Keseluruhan';
}
function setDashboardPeriod(p){dashboardPeriod=p;renderDashboard();}

// Tapis array sesi berdasarkan satu set filter (dipakai oleh renderSessions
// & renderMyHistory — logik sama, beza saja sumber filter & ada/tiada collectorId).
function applySessionFilters(sessions,f){
  return sessions.filter(s=>{
    if(f.collectorId&&s.collectorId!==f.collectorId)return false;
    if(f.scenario&&s.scenarioName!==f.scenario)return false;
    if(f.skor==='high'&&!(s.totalScore>=70))return false;
    if(f.skor==='mid'&&!(s.totalScore>=50&&s.totalScore<70))return false;
    if(f.skor==='low'&&!(s.totalScore<50))return false;
    if(f.dateFrom&&new Date(s.date)<new Date(f.dateFrom))return false;
    if(f.dateTo&&new Date(s.date)>new Date(f.dateTo+'T23:59:59'))return false;
    return true;
  });
}
let scenario=null, callHistory=[], callFullTranscript=[], callSeconds=0, timerInterval=null;
// callHistory → trimmed (20 turn) untuk Claude API (jimat token)
// callFullTranscript → semua turn untuk eval QA
const HISTORY_WINDOW=20;
let recognition=null, isRecording=false, callActive=false;
let audioQueue=[], isPlayingAudio=false, currentAudio=null;
// ─── TTS TOGGLE ────────────────────────────────────────────────────────────────
// Set ke `true` bila budget ada dan Gemini TTS key aktif semula.
// Bila `false`: suara AI dimatikan, teks tetap muncul, latihan jalan seperti biasa.
const TTS_ENABLED = false;
// ───────────────────────────────────────────────────────────────────────────────
let micStream=null, micAudioCtx=null, micAnalyser=null, micLevelRAF=null;
let micPeakSinceStart=0; // peak bunyi dikesan sejak recognition.onstart turn semasa
let endCallInProgress=false; // guard: elak double-trigger (cth double-click/double-tap "Tamatkan Panggilan") hantar 2x evalCall() utk panggilan yang sama
let scoreLoadingInterval=null; // id setInterval utk rotate mesej spinner skrin "Menganalisis sesi..." — di-clear bila result sedia/gagal

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
    // Cache maklumat asas user — guna sebagai fallback kalau Supabase tak boleh reach masa restore sesi
    localStorage.setItem('ct_cached_user',JSON.stringify({id:user.id,name:user.name,role:user.role}));
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
  localStorage.removeItem('ct_cached_user'); // buang cached user semasa logout
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
  // Tunjuk banner & cuba retry kalau ada pending sessions dari sesi lepas
  if(getPendingSessions().length>0){showPendingBanner();retryPendingSessions();}
}

function buildNav(){
  const nav=document.getElementById('sidebarNav');
  // Admin/manager tidak buat call — tiada Latihan Suara atau Rekod Saya.
  // Peranan diorang: pantau prestasi, urus senario, review sesi collector.
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
  const recentSessions=sessions.slice(-10).reverse();
  const flaggedSessions=sessions.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none');
  const recentFlagged=flaggedSessions.slice(-6).reverse();
  const weakness=tallyWeakness(sessions);
  const weaknessTotal=weakness.reduce((a,[,c])=>a+c,0);

  // ── Filter "Hari Ini / Bulan Ini / Tahun Ini" ──────────────────────────
  // Senang admin/manager nak tengok prestasi ikut tempoh tertentu, tanpa
  // kira/scroll manual dari senarai penuh. Default 'all' = macam sebelum ni.
  const periodRange=getPeriodRange(dashboardPeriod);
  const prevPeriodRange=getPrevPeriodRange(dashboardPeriod);
  const periodSessions=filterSessionsByRange(sessions,periodRange);
  const prevPeriodSessions=prevPeriodRange?filterSessionsByRange(sessions,prevPeriodRange):[];
  const periodAvg=periodSessions.length?Math.round(periodSessions.reduce((a,s)=>a+s.totalScore,0)/periodSessions.length):0;
  const prevPeriodAvg=prevPeriodSessions.length?Math.round(prevPeriodSessions.reduce((a,s)=>a+s.totalScore,0)/prevPeriodSessions.length):null;
  const periodDiff=(dashboardPeriod!=='all'&&prevPeriodAvg!==null)?periodAvg-prevPeriodAvg:null;
  const periodFlagged=periodSessions.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none');
  const periodBtn=(p,label)=>`<button class="btn ${dashboardPeriod===p?'btn-primary':'btn-secondary'}" style="padding:6px 14px;font-size:12px" onclick="setDashboardPeriod('${p}')">${label}</button>`;

  // ── Weekly aggregation ─────────────────────────────────────────────────
  // 4 minggu terkini, setiap minggu Isnin-Ahad
  function getWeeks(n){
    const now=new Date();
    const day=now.getDay()||7;
    const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-(day-1));
    const weeks=[];
    for(let i=n-1;i>=0;i--){
      const start=new Date(monday); start.setDate(monday.getDate()-i*7);
      const end=new Date(start); end.setDate(start.getDate()+7);
      const d=start.getDate(), m=start.getMonth()+1;
      weeks.push({label:`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`,start,end});
    }
    return weeks;
  }
  const WEEKS=getWeeks(4);
  const thisWeek=WEEKS[3]; const lastWeek=WEEKS[2];

  function weeklyData(collectorId){
    const cs=sessions.filter(s=>s.collectorId===collectorId);
    return WEEKS.map(w=>{
      const ws=cs.filter(s=>{const d=new Date(s.date);return d>=w.start&&d<w.end;});
      return ws.length?Math.round(ws.reduce((a,s)=>a+s.totalScore,0)/ws.length):null;
    });
  }

  // Arrow trend: bandingkan 2 minggu terkini yang ada data
  function trendArrow(wData){
    const filled=wData.filter(v=>v!==null);
    if(filled.length<2)return{icon:'—',color:'var(--text3)',label:''};
    const diff=filled[filled.length-1]-filled[filled.length-2];
    if(diff>=5)return{icon:'▲',color:'var(--green)',label:`+${diff}`};
    if(diff<=-5)return{icon:'▼',color:'var(--red)',label:`${diff}`};
    return{icon:'→',color:'var(--amber)',label:diff===0?'0':(diff>0?`+${diff}`:`${diff}`)};
  }

  // Bar chart HTML untuk satu collector — skala relatif kepada max minggu tu
  function weeklyBars(wData){
    const maxVal=Math.max(...wData.filter(v=>v!==null),1);
    return WEEKS.map((w,i)=>{
      const v=wData[i];
      if(v===null)return`
        <div class="chart-bar-col" style="flex:1;min-width:0">
          <div class="chart-bar-val" style="font-size:10px;color:var(--text3)">-</div>
          <div style="height:6px;width:100%;background:var(--border);border-radius:3px;margin-bottom:4px"></div>
          <div class="chart-bar-label" style="font-size:9px">${w.label}</div>
        </div>`;
      const h=Math.max(10,Math.round(v/maxVal*70));
      const col=v>=70?'#5CB85C':v>=50?'#F0AD4E':'#E24B4A';
      return`
        <div class="chart-bar-col" style="flex:1;min-width:0">
          <div class="chart-bar-val" style="font-size:10px">${v}</div>
          <div class="chart-bar" style="height:${h}px;background:${col}"></div>
          <div class="chart-bar-label" style="font-size:9px">${w.label}</div>
        </div>`;
    }).join('');
  }

  // Stat card: minggu ini vs minggu lepas (semua collector)
  const thisWeekSessions=sessions.filter(s=>{const d=new Date(s.date);return d>=thisWeek.start&&d<thisWeek.end;});
  const lastWeekSessions=sessions.filter(s=>{const d=new Date(s.date);return d>=lastWeek.start&&d<lastWeek.end;});
  const thisWeekAvg=thisWeekSessions.length?Math.round(thisWeekSessions.reduce((a,s)=>a+s.totalScore,0)/thisWeekSessions.length):null;
  const lastWeekAvg=lastWeekSessions.length?Math.round(lastWeekSessions.reduce((a,s)=>a+s.totalScore,0)/lastWeekSessions.length):null;
  const weekDiff=(thisWeekAvg!==null&&lastWeekAvg!==null)?thisWeekAvg-lastWeekAvg:null;

  setContent(`
  <div class="page-header"><div class="page-title">Dashboard</div><div class="page-sub">Overview prestasi collector</div></div>

  <div class="card" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px">
    <span style="font-size:12px;color:var(--text3);margin-right:4px">Tempoh Prestasi:</span>
    ${periodBtn('day','Hari Ini')}
    ${periodBtn('month','Bulan Ini')}
    ${periodBtn('year','Tahun Ini')}
    ${periodBtn('all','Keseluruhan')}
  </div>

  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Jumlah Sesi</div><div class="stat-val">${periodSessions.length}</div><div class="stat-sub">${periodLabel(dashboardPeriod)}</div></div>
    <div class="stat-card"><div class="stat-label">Purata Markah</div><div class="stat-val">${periodAvg}</div><div class="stat-sub">${periodDiff!==null?`<span style="color:${periodDiff>=0?'var(--green)':'var(--red)'}">${periodDiff>=0?'▲ +':'▼ '}${periodDiff} vs tempoh lepas</span>`:'/ 100'}</div></div>
    <div class="stat-card"><div class="stat-label">Sesi Hari Ini</div><div class="stat-val">${todaySessions}</div><div class="stat-sub">Latihan hari ini</div></div>
    <div class="stat-card"><div class="stat-label">Markah Minggu Ini</div><div class="stat-val">${thisWeekAvg!==null?thisWeekAvg:'—'}</div><div class="stat-sub">${weekDiff!==null?`<span style="color:${weekDiff>=0?'var(--green)':'var(--red)'}">${weekDiff>=0?'▲ +':'▼ '}${weekDiff} vs minggu lepas</span>`:`${thisWeekSessions.length} sesi minggu ini`}</div></div>
    <div class="stat-card"><div class="stat-label">Isu Pematuhan</div><div class="stat-val" style="color:${periodFlagged.length?'var(--red)':'inherit'}">${periodFlagged.length}</div><div class="stat-sub">Sesi berisiko · ${periodLabel(dashboardPeriod)}</div></div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div class="card-title" style="margin-bottom:0">📅 Trend Mingguan Per Collector (4 Minggu)</div>
      <div style="font-size:11px;color:var(--text3)">Purata markah · Isnin–Ahad</div>
    </div>
    <div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:center;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text3)">Nama · Trend</div>
      <div style="display:flex;gap:6px">
        ${WEEKS.map((w,i)=>`<div style="flex:1;text-align:center;font-size:11px;font-weight:600;color:${i===3?'var(--purple)':'var(--text3)'}">${w.label}${i===3?' ★':''}</div>`).join('')}
      </div>
    </div>
    ${collectors.length===0?`<div class="empty-state"><div class="es-icon">👥</div><p>Belum ada collector berdaftar.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Daftar akaun collector dari menu <strong>Urus Pengguna</strong>.</p></div>`:''}
    ${collectors.map(c=>{
      const wData=weeklyData(c.id);
      const arrow=trendArrow(wData);
      const cs=sessions.filter(s=>s.collectorId===c.id);
      const overallAvg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;
      return`
      <div style="display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:center;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:500;margin-bottom:4px">${c.name}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="score-pill ${overallAvg>=70?'score-high':overallAvg>=50?'score-mid':'score-low'}" style="font-size:11px">${overallAvg}</span>
            <span style="font-size:14px;color:${arrow.color};font-weight:700">${arrow.icon}</span>
            ${arrow.label?`<span style="font-size:11px;color:${arrow.color};font-weight:600">${arrow.label}</span>`:''}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">${cs.length} sesi jumlah</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:6px;height:80px">
          ${weeklyBars(wData)}
        </div>
      </div>`;
    }).join('')}
    <div style="font-size:11px;color:var(--text3);padding-top:4px">
      ▲ naik ≥5 · ▼ turun ≥5 · → stabil ±4 · — tiada data minggu itu · ★ minggu semasa
    </div>
  </div>

  <div class="two-col">
    <div class="card">
      <div class="card-title">Prestasi Per Collector — ${periodLabel(dashboardPeriod)}</div>
      ${collectors.length===0?`<div class="empty-state"><div class="es-icon">👥</div><p>Tiada collector lagi</p></div>`:''}
      ${collectors.map(c=>{
        const cs=periodSessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;
        const prevCs=prevPeriodSessions.filter(s=>s.collectorId===c.id);
        const prevAvg=prevCs.length?Math.round(prevCs.reduce((a,s)=>a+s.totalScore,0)/prevCs.length):null;
        const diff=(dashboardPeriod!=='all'&&prevAvg!==null)?avg-prevAvg:null;
        return`<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px;font-weight:500">${c.name}</span>
            <div style="display:flex;align-items:center;gap:6px">
              ${diff!==null?`<span style="font-size:11px;color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'▲ +':'▼ '}${diff}</span>`:''}
              <span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${cs.length?avg:'—'}</span>
            </div>
          </div>
          <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
            <div style="height:100%;width:${avg}%;background:${avg>=70?'#5CB85C':avg>=50?'#F0AD4E':'#E24B4A'};border-radius:3px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${cs.length} sesi · ${periodLabel(dashboardPeriod)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">Sesi Terbaru</div>
      ${recentSessions.length===0?`<div class="empty-state"><div class="es-icon">📋</div><p>Tiada sesi latihan lagi.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Collector boleh mulakan latihan dari menu <strong>Latihan Suara</strong>.</p></div>`:''}
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
      ${weakness.length===0?`<div class="empty-state"><div class="es-icon">📊</div><p>Belum cukup data untuk analisis.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Perlukan sekurang-kurangnya 3 sesi latihan.</p></div>`:
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
        const u=findUserById(users,s.collectorId);
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
let scenariosCacheAt=0;
async function loadScenarios(force){
  if(scenariosCache&&!force&&(Date.now()-scenariosCacheAt<CACHE_TTL))return scenariosCache;
  scenariosCache=await scenarioApi.list();
  scenariosCacheAt=Date.now();
  return scenariosCache;
}

async function renderTraining(){
  setContent('<div class="page-header"><div class="page-title">Voice Training</div></div><div class="card">Loading scenarios...</div>');
  let scenarios;
  try{
    scenarios=await loadScenarios();
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Voice Training</div></div><div class="card">⚠ Failed to load scenarios: ${e.message}</div>`);
    return;
  }
  if(!scenario&&scenarios.length)scenario=scenarios[0];

  function scPreviewHTML(s){
    if(!s)return`<div class="sc-preview-empty"><div style="font-size:36px;margin-bottom:10px">👆</div><div style="font-size:13px;color:var(--text3)">Select a scenario to view details</div></div>`;
    const lvlLabel=s.level==='easy'?'Easy':s.level==='med'?'Medium':'Hard';
    const accentLabel=s.accent==='melayu'?'Malay':s.accent==='cina'?'Mandarin Manglish':'Tamil';
    const genderLabel=s.gender==='male'?'Male':'Female';
    const row=(label,val)=>val?`<div class="preview-row"><span class="preview-label">${label}</span><span class="preview-val">${val}</span></div>`:'';
    const disclosureList=(s.disclosures||[]).length
      ?`<div class="preview-section-title">📢 Required Disclosures</div>${(s.disclosures||[]).map(d=>`<div class="preview-disclosure">• ${d}</div>`).join('')}`
      :'';
    const checklistHTML=(s.checklist||[]).length
      ?`<div class="preview-section-title" style="margin-top:14px">✅ Evaluation Checklist</div>${(s.checklist||[]).map(c=>`<div class="preview-checklist-item"><span class="preview-cl-cat">${c.cat}</span><span class="preview-cl-text">${c.text}</span></div>`).join('')}`
      :'';
    return`
      <div class="sc-preview-header">
        <div style="font-size:32px">${s.emoji}</div>
        <div style="flex:1;min-width:0">
          <div class="sc-preview-title">${s.title}</div>
          <div class="sc-preview-sub">${s.description||s.desc||''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <span class="level-badge level-${s.level}">${lvlLabel}</span>
            <span class="preview-badge-neutral">${accentLabel} · ${genderLabel}</span>
            ${s.client?`<span class="preview-badge-client">${s.client}</span>`:''}
          </div>
        </div>
      </div>
      <div class="preview-divider"></div>
      <div class="preview-section-title">📋 Customer Account Information</div>
      ${row('Debtor Name',s.name)}
      ${row('Amount Outstanding',s.amount)}
      ${row('Days Overdue',s.days?s.days+' days':'')}
      ${row('IC Number',s.icNumber)}
      ${row('Acc Number',s.accNumber)}
      ${row('Service No.',s.serviceNo)}
      ${row('Acc Type',s.accType)}
      ${row('Registration Date',s.registrationDate?new Date(s.registrationDate).toLocaleDateString('en-MY'):'')}
      ${row('Termination Date',s.terminationDate?new Date(s.terminationDate).toLocaleDateString('en-MY'):'')}
      <div class="preview-divider"></div>
      <div class="preview-section-title">🎭 Debtor Situation & Approach</div>
      <div class="preview-mood-box">${fillScenarioPlaceholders(s.prompt,s)}</div>
      ${disclosureList}
      ${checklistHTML}
    `;
  }

  setContent(`
  <div class="page-header"><div class="page-title">Voice Training</div><div class="page-sub">Select a scenario, review the details, then start the call</div></div>
  <div class="training-layout">
    <div class="training-left">
      <div class="card" style="margin-bottom:0">
        <div class="card-title">Select Scenario</div>
        <div class="sc-list" id="scGrid">
          ${scenarios.map(s=>`
          <div class="sc-card ${scenario&&scenario.id===s.id?'selected':''}" onclick="selectScenario('${s.id}')">
            <div class="sc-emoji">${s.emoji}</div>
            <div class="sc-body">
              <div class="sc-name">${s.title}</div>
              <div class="sc-desc">${s.description||s.desc||''}</div>
              <div class="sc-meta">
                <span class="level-badge level-${s.level}">${s.level==='easy'?'Easy':s.level==='med'?'Medium':'Hard'}</span>
                ${s.client?`<span class="preview-badge-client" style="font-size:10px">${s.client}</span>`:''}
              </div>
            </div>
            <div class="sc-check">${scenario&&scenario.id===s.id?'✓':''}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="training-right">
      <div class="card sc-preview-card" id="scPreviewCard">
        ${scPreviewHTML(scenario)}
      </div>
      ${!TTS_ENABLED?`<div style="display:flex;align-items:center;gap:10px;background:#fff8e1;border:1.5px solid #f9a825;border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:12px">
        <span style="font-size:20px">🔇</span>
        <div>
          <div style="font-weight:600;font-size:13px;color:#e65100">Silent Mode — AI Voice Disabled</div>
          <div style="font-size:12px;color:#bf360c;margin-top:2px">Training can still run. Debtor text will appear in chat as usual.</div>
        </div>
      </div>`:''}
      <button class="btn btn-primary" style="width:100%;padding:13px;font-size:15px;margin-top:0" onclick="startCall()">🎙 Start Training Call</button>
    </div>
  </div>`);
}

function selectScenario(id){
  const scenarios=scenariosCache||[];
  scenario=scenarios.find(s=>s.id===id)||scenarios[0];
  // Update UI without full re-render — just swap selected state & preview
  document.querySelectorAll('.sc-card').forEach(el=>{
    const isThis=el.getAttribute('onclick')||''===`selectScenario('${id}')`;
    el.classList.remove('selected');
    el.querySelector('.sc-check').textContent='';
  });
  const allCards=document.querySelectorAll('.sc-card');
  allCards.forEach(el=>{
    if((el.getAttribute('onclick')||'')==`selectScenario('${id}')`){
      el.classList.add('selected');
      const chk=el.querySelector('.sc-check');
      if(chk)chk.textContent='✓';
    }
  });
  // Update preview panel
  const preview=document.getElementById('scPreviewCard');
  if(preview&&scenario){
    const lvlLabel=scenario.level==='easy'?'Easy':scenario.level==='med'?'Medium':'Hard';
    const accentLabel=scenario.accent==='melayu'?'Malay':scenario.accent==='cina'?'Mandarin Manglish':'Tamil';
    const genderLabel=scenario.gender==='male'?'Male':'Female';
    const row=(label,val)=>val?`<div class="preview-row"><span class="preview-label">${label}</span><span class="preview-val">${val}</span></div>`:'';
    const disclosureList=(scenario.disclosures||[]).length
      ?`<div class="preview-section-title">📢 Required Disclosures</div>${(scenario.disclosures||[]).map(d=>`<div class="preview-disclosure">• ${d}</div>`).join('')}`
      :'';
    const checklistHTML=(scenario.checklist||[]).length
      ?`<div class="preview-section-title" style="margin-top:14px">✅ Evaluation Checklist</div>${(scenario.checklist||[]).map(c=>`<div class="preview-checklist-item"><span class="preview-cl-cat">${c.cat}</span><span class="preview-cl-text">${c.text}</span></div>`).join('')}`
      :'';
    preview.innerHTML=`
      <div class="sc-preview-header">
        <div style="font-size:32px">${scenario.emoji}</div>
        <div style="flex:1;min-width:0">
          <div class="sc-preview-title">${scenario.title}</div>
          <div class="sc-preview-sub">${scenario.description||scenario.desc||''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <span class="level-badge level-${scenario.level}">${lvlLabel}</span>
            <span class="preview-badge-neutral">${accentLabel} · ${genderLabel}</span>
            ${scenario.client?`<span class="preview-badge-client">${scenario.client}</span>`:''}
          </div>
        </div>
      </div>
      <div class="preview-divider"></div>
      <div class="preview-section-title">📋 Customer Account Information</div>
      ${row('Debtor Name',scenario.name)}
      ${row('Amount Outstanding',scenario.amount)}
      ${row('Days Overdue',scenario.days?scenario.days+' days':'')}
      ${row('IC Number',scenario.icNumber)}
      ${row('Acc Number',scenario.accNumber)}
      ${row('Service No.',scenario.serviceNo)}
      ${row('Acc Type',scenario.accType)}
      ${row('Registration Date',scenario.registrationDate?new Date(scenario.registrationDate).toLocaleDateString('en-MY'):'')}
      ${row('Termination Date',scenario.terminationDate?new Date(scenario.terminationDate).toLocaleDateString('en-MY'):'')}
      <div class="preview-divider"></div>
      <div class="preview-section-title">🎭 Debtor Situation & Approach</div>
      <div class="preview-mood-box">${fillScenarioPlaceholders(scenario.prompt,scenario)}</div>
      ${disclosureList}
      ${checklistHTML}
    `;
  }
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
        <div class="status-bar"><div class="status-dot green" id="statusDot"></div><span id="statusText">Sesi aktif</span>${!TTS_ENABLED?'<span style="margin-left:auto;font-size:11px;font-weight:600;color:#e65100;background:#fff3e0;border:1px solid #ffb74d;border-radius:20px;padding:2px 8px">🔇 Mod Senyap</span>':''}</div>
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
        <div style="font-size:13px;color:var(--brand)"><strong>Cadangan:</strong> ${m.suggestion||''}</div>
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
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" style="flex:1;min-width:120px" onclick="navigate('training')">🔁 Latihan Semula</button>
      <button class="btn btn-secondary" style="flex:1;min-width:120px" onclick="navigate('my-history')">📊 Lihat Rekod</button>
      <button class="btn btn-secondary" style="flex:1;min-width:120px" onclick="copyScoreSummary()">📋 Salin Ringkasan</button>
    </div>
  </div>`);
}

function copyScoreSummary(){
  const s=window._lastScore;
  if(!s)return;
  const catLabels={tone:'Tone / Nada',delivery:'Cara Penyampaian',counter:'Hujah Balas',action:'Tindakan & Pematuhan',balance:'Strategi Baki Hutang'};
  const scoreLines=Object.entries(s.scores||{}).map(([k,v])=>`  ${catLabels[k]||k}: ${v}/20`).join('\n');
  const strengthLines=(s.strengths||[]).map(t=>`  ✅ ${t}`).join('\n');
  const missedLines=(s.missed||[]).map(m=>`  ⚠ ${m.issue||''} → ${m.suggestion||''}`).join('\n');
  const harassment=s.harassmentRisk&&s.harassmentRisk!=='none'?`\n⚠ Isu Pematuhan (${s.harassmentRisk}): ${s.harassmentNote||''}\n`:'';
  const text=[
    `📊 Keputusan Latihan CollectorTrain`,
    `Senario: ${s.scenarioName||'-'} · Masa: ${s.duration||'-'}`,
    `Markah Keseluruhan: ${s.totalScore}/100`,
    ``,
    `Pecahan Markah:`,
    scoreLines,
    harassment,
    strengthLines?`Kekuatan:\n${strengthLines}`:'',
    missedLines?`Perlu Diperbaiki:\n${missedLines}`:'',
    s.priorityFocus?`\n🎯 Fokus Seterusnya (${catLabels[s.priorityFocus.category]||s.priorityFocus.category}):\n  ${s.priorityFocus.tip||''}`:'',
    ``,
    `💬 Maklum Balas AI:`,
    s.feedback||'',
  ].filter(Boolean).join('\n');
  navigator.clipboard.writeText(text).then(()=>{
    const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Salin Ringkasan'));
    if(btn){const orig=btn.textContent;btn.textContent='✅ Disalin!';setTimeout(()=>{btn.textContent=orig;},2000);}
  }).catch(()=>alert('Gagal salin — sila highlight teks dan salin manual.'));
}

async function renderMyHistory(){
  const all=await loadSessions();
  const mine=all.filter(s=>s.collectorId===currentUser.id).reverse();
  const scenarioNames=[...new Set(mine.map(s=>s.scenarioName))].sort();
  const sessions=applySessionFilters(mine,myHistoryFilter);
  const weakness=tallyWeakness(sessions);
  const latestFocus=sessions.length?sessions[0].priorityFocus:null; // sessions[0] = sesi terbaru (list dah reverse)
  // Clamp muka surat (cth: filter baru jadikan jumlah sesi lebih kecil dari myHistoryPage semasa)
  const totalPages=Math.max(1,Math.ceil(sessions.length/SESSIONS_PAGE_SIZE));
  if(myHistoryPage>totalPages)myHistoryPage=totalPages;
  if(myHistoryPage<1)myHistoryPage=1;
  const pageStart=(myHistoryPage-1)*SESSIONS_PAGE_SIZE;
  const pageSessions=sessions.slice(pageStart,pageStart+SESSIONS_PAGE_SIZE);
  const filterBar=`
  <div class="card filter-bar">
    <select id="filtMyScenario" onchange="myHistoryFilter.scenario=this.value;myHistoryPage=1;renderMyHistory();">
      <option value="">Semua Senario</option>
      ${scenarioNames.map(n=>`<option value="${n}" ${myHistoryFilter.scenario===n?'selected':''}>${n}</option>`).join('')}
    </select>
    <select id="filtMySkor" onchange="myHistoryFilter.skor=this.value;myHistoryPage=1;renderMyHistory();">
      <option value="">Semua Markah</option>
      <option value="high" ${myHistoryFilter.skor==='high'?'selected':''}>Tinggi (≥70)</option>
      <option value="mid" ${myHistoryFilter.skor==='mid'?'selected':''}>Sederhana (50-69)</option>
      <option value="low" ${myHistoryFilter.skor==='low'?'selected':''}>Rendah (&lt;50)</option>
    </select>
    <input type="date" id="filtMyFrom" value="${myHistoryFilter.dateFrom}" onchange="myHistoryFilter.dateFrom=this.value;myHistoryPage=1;renderMyHistory();" title="Dari tarikh"/>
    <input type="date" id="filtMyTo" value="${myHistoryFilter.dateTo}" onchange="myHistoryFilter.dateTo=this.value;myHistoryPage=1;renderMyHistory();" title="Hingga tarikh"/>
    <button class="btn btn-secondary" onclick="myHistoryFilter={scenario:'',skor:'',dateFrom:'',dateTo:''};myHistoryPage=1;renderMyHistory();">Reset</button>
  </div>`;
  setContent(`
  <div class="page-header"><div class="page-title">Rekod Latihan Saya</div><div class="page-sub">${sessions.length} dari ${mine.length} sesi latihan</div></div>
  ${mine.length>0?filterBar:''}
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📊</div><p>${mine.length===0?'Belum ada sesi latihan. Mulakan latihan pertama anda!':'Tiada sesi sepadan dengan filter.'}</p></div></div>`:''}
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
      ${pageSessions.map((s,i)=>`<tr>
        <td>${sessions.length-pageStart-i}</td>
        <td>${s.scenarioName}</td>
        <td>${s.duration}</td>
        <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
        <td style="font-size:12px">${fmtDateTime(s.date)}</td>
        <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">Lihat</button></td>
      </tr>`).join('')}
    </table></div>
    ${paginationBar(myHistoryPage,sessions.length,SESSIONS_PAGE_SIZE,'goMyHistoryPage')}
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
  const allSessions=(await loadSessions()).slice().reverse();
  const users=await loadUsers();
  const collectors=users.filter(u=>u.role==='collector');
  const scenarioNames=[...new Set(allSessions.map(s=>s.scenarioName))].sort();
  const sessions=applySessionFilters(allSessions,sessionsFilter);
  // Clamp muka surat (cth: filter baru jadikan jumlah sesi lebih kecil dari sessionsPage semasa)
  const totalPages=Math.max(1,Math.ceil(sessions.length/SESSIONS_PAGE_SIZE));
  if(sessionsPage>totalPages)sessionsPage=totalPages;
  if(sessionsPage<1)sessionsPage=1;
  const pageStart=(sessionsPage-1)*SESSIONS_PAGE_SIZE;
  const pageSessions=sessions.slice(pageStart,pageStart+SESSIONS_PAGE_SIZE);
  setContent(`
  <div class="page-header"><div class="page-title">Sesi Latihan</div><div class="page-sub">${sessions.length} dari ${allSessions.length} sesi</div></div>
  <div class="card filter-bar">
    <select id="filtSessionsCollector" onchange="sessionsFilter.collectorId=this.value;sessionsPage=1;renderSessions();">
      <option value="">Semua Collector</option>
      ${collectors.map(c=>`<option value="${c.id}" ${sessionsFilter.collectorId===c.id?'selected':''}>${c.name}</option>`).join('')}
    </select>
    <select id="filtSessionsScenario" onchange="sessionsFilter.scenario=this.value;sessionsPage=1;renderSessions();">
      <option value="">Semua Senario</option>
      ${scenarioNames.map(n=>`<option value="${n}" ${sessionsFilter.scenario===n?'selected':''}>${n}</option>`).join('')}
    </select>
    <select id="filtSessionsSkor" onchange="sessionsFilter.skor=this.value;sessionsPage=1;renderSessions();">
      <option value="">Semua Markah</option>
      <option value="high" ${sessionsFilter.skor==='high'?'selected':''}>Tinggi (≥70)</option>
      <option value="mid" ${sessionsFilter.skor==='mid'?'selected':''}>Sederhana (50-69)</option>
      <option value="low" ${sessionsFilter.skor==='low'?'selected':''}>Rendah (&lt;50)</option>
    </select>
    <input type="date" id="filtSessionsFrom" value="${sessionsFilter.dateFrom}" onchange="sessionsFilter.dateFrom=this.value;sessionsPage=1;renderSessions();" title="Dari tarikh"/>
    <input type="date" id="filtSessionsTo" value="${sessionsFilter.dateTo}" onchange="sessionsFilter.dateTo=this.value;sessionsPage=1;renderSessions();" title="Hingga tarikh"/>
    <button class="btn btn-secondary" onclick="sessionsFilter={collectorId:'',scenario:'',skor:'',dateFrom:'',dateTo:''};sessionsPage=1;renderSessions();">Reset</button>
  </div>
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📋</div><p>Tiada sesi latihan sepadan dengan filter.</p></div></div>`:''}
  ${sessions.length>0?`<div class="card">
    <div class="table-wrap"><table>
      <tr><th>Collector</th><th>Senario</th><th>Masa</th><th>Markah</th><th>Risiko Harassment</th><th>Tarikh</th><th></th></tr>
      ${pageSessions.map(s=>{
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
    ${paginationBar(sessionsPage,sessions.length,SESSIONS_PAGE_SIZE,'goSessionsPage')}
  </div>`:''}
  `);
}

async function viewSession(id){
  const all=await loadSessions();
  const s=all.find(s=>s.id===id);
  if(!s)return;
  // Collector tengok rekod sendiri = tak payah call /api/users (route tu
  // admin/manager-only, collector akan dapat 403). currentUser dah cukup.
  const u=currentUser.role==='collector'?currentUser:findUserById(await loadUsers(),s.collectorId);
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
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem">
    ${scoreRows(s).map(([l,v,m,cat,reason])=>`
    <div style="background:var(--bg);border-radius:6px;padding:8px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600;color:var(--text2)">${l}</div>
        <div style="font-size:16px;font-weight:700;color:${v/m<0.5?'#E24B4A':v/m<0.75?'#F0AD4E':'var(--purple)'}">
          ${v}<span style="font-size:11px;font-weight:400;color:var(--text3)">/${m}</span>
        </div>
      </div>
      <div style="background:var(--border);border-radius:3px;height:5px;overflow:hidden;margin-bottom:${reason?'5px':'0'}">
        <div style="height:100%;width:${m?v/m*100:0}%;background:${v/m<0.5?'#E24B4A':v/m<0.75?'#F0AD4E':'var(--purple)'};border-radius:3px"></div>
      </div>
      ${reason?`<div style="font-size:11px;color:var(--text3);line-height:1.5">${reason}</div>`:''}
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
    ${m.quote?`<div style="font-size:11px;color:var(--text3);font-style:italic;margin:2px 0">"${m.quote}"</div>`:''}
    <div style="font-size:12px;color:var(--brand)"><strong>Cadangan:</strong> ${m.suggestion||''}</div>
  </div>`).join('')}
  <hr class="divider"/>`:''}
  ${s.priorityFocus?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">🎯 Fokus Latihan Akan Datang</div>
  <div style="margin-bottom:1rem">
    <span class="chip chip-purple" style="font-size:11px">${catIcon(s.priorityFocus.category)} ${catLabel(s.priorityFocus.category)}</span>
    <div style="font-size:12px;color:var(--text2);margin-top:4px">${s.priorityFocus.tip||''}</div>
  </div>
  <hr class="divider"/>`:''}
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">📝 Transcript Penuh</div>
  <div style="background:var(--bg);border-radius:6px;padding:10px">
    ${(s.transcript||[]).map(m=>`<div style="margin-bottom:10px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${m.role==='user'?(u?u.name:'Collector'):'Penghutang'}</div>
      <div style="padding:6px 10px;border-radius:6px;font-size:12px;line-height:1.6;background:${m.role==='user'?'var(--purple-light)':'var(--surface)'};color:${m.role==='user'?'var(--purple)':'var(--text)'}">
        ${m.content}
      </div></div>`).join('')}
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

// ═══════════ SCENARIO FORM DRAFT AUTO-SAVE ═══════════
// Scenario form boleh ada banyak field — kalau browser refresh atau crash
// semasa tengah edit, semua input hilang. Fix: auto-save draft ke localStorage
// setiap 30 saat. Draft dikosongkan bila form berjaya disimpan atau dibatal.
const SCENARIO_DRAFT_KEY='ct_scenario_draft';
let _scenarioDraftTimer=null;

function readScenarioFormDraft(){
  // Baca semua field dari form semasa
  const scClientSel=(document.getElementById('scClient')||{}).value||'';
  return {
    emoji:(document.getElementById('scEmoji')||{}).value||'',
    name:(document.getElementById('scName')||{}).value||'',
    gender:(document.getElementById('scGender')||{}).value||'male',
    accent:(document.getElementById('scAccent')||{}).value||'melayu',
    title:(document.getElementById('scTitle')||{}).value||'',
    amount:(document.getElementById('scAmount')||{}).value||'',
    days:(document.getElementById('scDays')||{}).value||'30',
    level:(document.getElementById('scLevel')||{}).value||'med',
    balanceTier:(document.getElementById('scBalanceTier')||{}).value||'high',
    prompt:(document.getElementById('scPrompt')||{}).value||'',
    clientSel:scClientSel,
    clientOther:(document.getElementById('scClientOther')||{}).value||'',
    icNumber:(document.getElementById('scIc')||{}).value||'',
    accNumber:(document.getElementById('scAccNumber')||{}).value||'',
    serviceNo:(document.getElementById('scServiceNo')||{}).value||'',
    accType:(document.getElementById('scAccType')||{}).value||'',
    regDate:(document.getElementById('scRegDate')||{}).value||'',
    termDate:(document.getElementById('scTermDate')||{}).value||'',
    checklist:Array.from(document.querySelectorAll('#checklistRows .checklist-row'))
      .map(r=>({cat:r.querySelector('.cl-cat').value,text:r.querySelector('.cl-text').value})),
    disclosures:Array.from(document.querySelectorAll('#disclosureRows .disclosure-row .dc-text'))
      .map(i=>i.value),
    _existingId:(document.getElementById('modalBox')||{}).dataset&&document.getElementById('modalBox').dataset.scenarioEditId||'',
    _savedAt:Date.now()
  };
}

function startScenarioDraftTimer(){
  stopScenarioDraftTimer();
  _scenarioDraftTimer=setInterval(()=>{
    // Pastikan form masih terbuka
    if(!document.getElementById('scName'))return;
    const draft=readScenarioFormDraft();
    localStorage.setItem(SCENARIO_DRAFT_KEY,JSON.stringify(draft));
    // Tunjuk indicator kecil
    let ind=document.getElementById('scenarioDraftInd');
    if(!ind){
      ind=document.createElement('span');
      ind.id='scenarioDraftInd';
      ind.style.cssText='font-size:11px;color:var(--text3);margin-left:8px;';
      const footer=document.querySelector('.modal-footer');
      if(footer)footer.insertBefore(ind,footer.firstChild);
    }
    ind.textContent='Draft auto-saved '+new Date().toLocaleTimeString('ms-MY',{hour:'2-digit',minute:'2-digit'});
  },30000);
}

function stopScenarioDraftTimer(){
  if(_scenarioDraftTimer){clearInterval(_scenarioDraftTimer);_scenarioDraftTimer=null;}
}

function clearScenarioDraft(){
  localStorage.removeItem(SCENARIO_DRAFT_KEY);
  stopScenarioDraftTimer();
}

function applyScenarioDraft(draft){
  // Apply stored draft values back into the already-rendered form
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined&&val!=='')el.value=val;};
  set('scEmoji',draft.emoji);
  set('scName',draft.name);
  set('scGender',draft.gender);
  set('scAccent',draft.accent);
  set('scTitle',draft.title);
  set('scAmount',draft.amount);
  set('scDays',draft.days);
  set('scLevel',draft.level);
  set('scBalanceTier',draft.balanceTier);
  set('scPrompt',draft.prompt);
  set('scIc',draft.icNumber);
  set('scAccNumber',draft.accNumber);
  set('scServiceNo',draft.serviceNo);
  set('scAccType',draft.accType);
  set('scRegDate',draft.regDate);
  set('scTermDate',draft.termDate);
  // Client dropdown
  const clientSel=document.getElementById('scClient');
  if(clientSel&&draft.clientSel){clientSel.value=draft.clientSel;toggleClientOther();}
  if(draft.clientOther){const co=document.getElementById('scClientOther');if(co)co.value=draft.clientOther;}
  // Checklist rows — clear existing (kosong masa form open) then re-add
  const clWrap=document.getElementById('checklistRows');
  if(clWrap&&draft.checklist&&draft.checklist.length){
    clWrap.innerHTML='';
    draft.checklist.forEach(c=>addChecklistRow(c.cat,c.text));
  }
  // Disclosure rows
  const dcWrap=document.getElementById('disclosureRows');
  if(dcWrap&&draft.disclosures&&draft.disclosures.length){
    dcWrap.innerHTML='';
    draft.disclosures.forEach(d=>addDisclosureRow(d));
  }
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
    <div class="form-row"><label>Jumlah Hutang</label><input id="scAmount" value="${s?s.amount:'RM5,000'}" placeholder="cth: RM1,234.50" pattern="^RM[\d,]+(\.[\d]{1,2})?$" title="Format: RM diikuti nombor sahaja, cth RM1,234.50" /></div>
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
  <div style="background:#FAEEDA;border:1px solid #EF9F27;border-radius:8px;padding:8px 12px;font-size:12px;color:#854F0B;margin-bottom:4px">
    ⚠️ <b>Privasi:</b> Gunakan nombor IC, akaun, dan nombor telefon <b>fiktif/dummy</b> sahaja. Jangan masukkan data pelanggan sebenar dalam sistem latihan ini.
  </div>
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
    <button class="btn btn-secondary" onclick="cancelScenarioForm()">Batal</button>
    <button class="btn btn-primary" onclick="saveScenario('${existingId||''}')">Simpan</button>
  </div>`);
  // Hanya load extra checklist items — 5 kategori utama auto-score oleh AI
  const clData=(s&&s.checklist&&s.checklist.length)?s.checklist:[];
  clData.forEach(c=>addChecklistRow(c.cat,c.text));
  const existingDisclosures=(s&&s.disclosures&&s.disclosures.length)?s.disclosures:[];
  existingDisclosures.forEach(d=>addDisclosureRow(d));

  // ── Draft recovery ──
  // Kalau bukan edit existing scenario (modal kosong), check ada draft tersimpan tak.
  // Kalau ada, tanya user nak restore atau buang.
  if(!existingId){
    const raw=localStorage.getItem(SCENARIO_DRAFT_KEY);
    if(raw){
      try{
        const draft=JSON.parse(raw);
        // Draft valid kalau ada nama atau prompt yang dah ditaip
        if(draft.name||draft.prompt){
          const age=Math.round((Date.now()-draft._savedAt)/60000);
          const restore=confirm('Ada draf yang belum disimpan (\u00b1'+age+' minit lepas).\n\nMahu restore draf tersebut?');
          if(restore){
            applyScenarioDraft(draft);
          }else{
            clearScenarioDraft();
          }
        }
      }catch(e){localStorage.removeItem(SCENARIO_DRAFT_KEY);}
    }
  }
  // Simpan existingId kat modal supaya readScenarioFormDraft boleh detect mod edit
  document.getElementById('modalBox').dataset.scenarioEditId=existingId||'';
  startScenarioDraftTimer();
}

// Batal form senario — kalau ada kandungan dalam draft, tanya dulu sebelum tutup.
function cancelScenarioForm(){
  const name=(document.getElementById("scName")||{}).value||"";
  const prompt=(document.getElementById("scPrompt")||{}).value||"";
  const hasContent=name.trim()||prompt.trim();
  if(hasContent&&!confirm("Borang belum disimpan. Batalkan dan buang perubahan?")){
    return;
  }
  clearScenarioDraft();
  closeModal();
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
    clearScenarioDraft(); // Berjaya simpan — buang draft
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
// Gemini 3.1 Flash TTS voices
// Male:   Orus (dalam/serius), Fenrir (kasar/tegas), Charon (neutral), Puck (muda/ekspresif)
// Female: Kore (serius/tegang), Aoede (warm/natural), Leda (muda/casual), Zephyr (lembut)
const VOICE_POOL = {
  male:   ['Orus','Fenrir','Charon','Puck'],
  female: ['Kore','Aoede','Leda','Zephyr']
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


// Pilih Gemini voice — konsisten dalam satu sesi (activeVoiceId)
// Voice dipilih masa call mula, sama sampai call tamat
function getGeminiVoice(){
  if(activeVoiceId) return activeVoiceId;
  if(!scenario) return 'Charon';
  const gender=scenario.gender||'male';
  activeVoiceId=pickVoice(gender);
  return activeVoiceId;
}
// Convert emotion dari debtor AI reply → Gemini audio tags
// Audio tags inject TERUS dalam text sebelum hantar ke TTS
// Gemini akan cakap ikut tag tu — jauh lagi natural dari ElevenLabs numbers
function getAudioTagInstruction(text){
  if(!text) return text;
  const t=text.toLowerCase();

  // Kira intensity markers
  const bangCount=(text.match(/!+/g)||[]).reduce((s,m)=>s+m.length,0);
  const questCount=(text.match(/\?+/g)||[]).length;

  // Score emosi — sama logic seperti getVoiceSettings lama
  let scores={marah:0,sedih:0,keliru:0,susah:0,santai:0,kasar:0};

  if(/marah|tension|bengang|geram|tak nak|pergi|letak telefon|dah la|buat apa|apa kejadah|menyampah|tak faham ke|dah cakap dah|tak payah|suka hati|jangan kacau|leceh|penat la|jangan ganggu/.test(t)) scores.marah+=3;
  scores.marah+=Math.min(bangCount,3);

  if(/nangis|menangis|sedih|tertekan|takut|dah tak tahu|minta maaf|harap maaf|tolong faham|susah sangat|dah cuba|penat dah|give up|tak larat|nak buat macam mana/.test(t)) scores.sedih+=3;
  if(/tahu nak buat macam mana/.test(t)) scores.sedih+=2;

  if(/ha\?|eh\?|tak faham|maksud|yang mana|yang ni ke|yang tu ke|tak ingat|lupa|betul ke|ye ke|serius|confirm|pastikan|check balik/.test(t)) scores.keliru+=3;
  scores.keliru+=Math.min(questCount,2);

  if(/tak boleh bayar|tak ada duit|takde duit|poket|kering|gaji|tak cukup|nak makan pun|anak|keluarga|masalah sekarang|susah sekarang|tak mampu|tak ada kerja|baru kena buang/.test(t)) scores.susah+=3;
  if(/hutang lain|kerja pun|hidup/.test(t)) scores.susah+=1;

  if(/haha|hehe|lawak|takpe|ok ok|boleh je|alright|ok la|fine|no problem|insyaallah|kalau macam tu/.test(t)) scores.santai+=3;

  if(/saman je la|lapor|report|lawyer|saman|mahkamah|tak kisah|buat apa nak kisah|lantak/.test(t)) scores.kasar+=3;

  const top=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  const intense=top[1]>=5;

  // Map emosi → Gemini audio tags
  // Tags inject di awal text supaya affect keseluruhan delivery
  if(top[1]===0) return text; // default — no tag, natural tone

  const tagMap={
    marah:  intense ? '[angry] [frustrated] ' : '[irritated] ',
    sedih:  intense ? '[sad] [soft] '         : '[melancholic] ',
    keliru: '[confused] ',
    susah:  intense ? '[sad] [worried] '      : '[concerned] ',
    santai: '[casual] [relaxed] ',
    kasar:  intense ? '[hostile] [dismissive] ': '[defensive] '
  };

  const tag = tagMap[top[0]] || '';
  return tag + text;
}
function getSysPrompt(){
  if(!scenario)return '';

  // Accent-specific language instruction — OVERRIDE apa dalam scenario.prompt
  // supaya AI ikut loghat yang dipilih, bukan default slang Melayu
  const accent=scenario.accent||'melayu';
  const fmtD=d=>d?new Date(d).toLocaleDateString('ms-MY'):'-';
  const accentInstruction={
    melayu:`Gaya pertuturan: loghat Melayu Malaysia yang santai dan natural, macam orang biasa bercakap di telefon.
Boleh selang-seli (jangan setiap ayat) guna partikel macam: "la", "kan", "tak", "nak", "ye ke", "betul ke", "hmm", "InsyaAllah", "alhamdulillah".
Elak nada formal/surat-menyurat — kekal ringkas dan spontan.`,

    india:`Gaya pertuturan: Manglish santai yang biasa digunakan ramai rakyat Malaysia, dengan sentuhan ringan loghat masyarakat India tanpa over-acting.
Boleh selang-seli (bukan setiap ayat) guna partikel macam: "aiyo", "ah", "macam mana ni", "cannot la", atau struktur ayat Manglish biasa.
Cakap macam manusia sebenar dalam panggilan telefon — bukan watak komedi atau parodi. Jangan over-exaggerate sebutan atau gunakan stereotype yang melampau.`,

    cina:`Gaya pertuturan: Manglish santai yang biasa digunakan ramai rakyat Malaysia, dengan sentuhan ringan loghat masyarakat Cina tanpa over-acting.
Boleh selang-seli (bukan setiap ayat) guna partikel macam: "lah", "lor", "meh", "one" — secukupnya untuk rasa natural, bukan setiap ayat.
Cakap macam manusia sebenar dalam panggilan telefon — bukan watak komedi atau parodi. Jangan over-exaggerate sebutan atau gunakan stereotype yang melampau.`
  }[accent]||'Bercakap dalam Bahasa Malaysia yang santai dan natural.';

  const base=scenario.prompt
    .replace(/{name}/g,scenario.name)
    .replace(/{amount}/g,scenario.amount)
    .replace(/{days}/g,scenario.days);

  // ARAHAN BAHASA / LOGHAT — inject selepas base prompt, lebih utama
  const accentBlock=`\n\nARAHAN BAHASA / LOGHAT (WAJIB IKUT — lebih utama daripada arahan lain): ${accentInstruction}\n\nPENTING: Ini SEKADAR gaya pertuturan. JANGAN sebut secara literal perkataan "Melayu", "Cina", atau "India" sebagai label kaum diri sendiri semasa panggilan (contoh: jangan cakap "saya orang India" / "saya orang Cina" / "saya Melayu"), melainkan collector sendiri tanya soalan yang relevan secara langsung. Fokus pada cara sebut dan gaya ayat sahaja, bukan menyebut label kaum.`;

  // Tukar nombor telefon ke sebutan natural: 0142536985 → "oh satu empat dua lima tiga enam sembilan lapan lima"
  const digitWord=['kosong','satu','dua','tiga','empat','lima','enam','tujuh','lapan','sembilan'];
  function spokenPhone(num){
    // Strip semua bukan-digit dulu (dash, space, bracket) sebelum convert
    return (num||'').replace(/[^\d]/g,'').replace(/\d/g,d=>digitWord[+d]).replace(/\s+/g,' ').trim();
  }
  // Tukar RM ke sebutan natural: RM1234.50 → "seribu dua ratus tiga puluh empat ringgit lima puluh sen"
  function spokenRM(amtStr){
    if(!amtStr)return amtStr;
    // Strip RM prefix, spaces, dan teks extra sebelum extract nombor
    const cleaned=amtStr.replace(/^RM\s*/i,'').replace(/,/g,'').trim();
    const m=cleaned.match(/^[\d]+(?:\.[\d]{1,2})?/);
    if(!m)return amtStr; // fallback: sebut as-is kalau format pelik
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

  const groundingBlock=`\n\nPENTING — FAKTA DI ATAS ADALAH TETAP, termasuk NAMA CLIENT/TELCO (${scenario.client||'-'}). Jika collector sebut jumlah, tarikh, nama syarikat/client telco, atau maklumat akaun yang BERBEZA daripada fakta di atas — termasuk salah sebut nama syarikat (contoh: collector sebut "RedOne" tapi KONTEKS SENARIO kata client ialah "${scenario.client||'syarikat lain'}") — JANGAN terus bersetuju/"mengiyakan" begitu sahaja walaupun collector cakap dengan yakin. Bertindak realistik — keliru, tanya balik, atau betulkan collector. Contoh: "Eh, bukan ke hutang saya ${scenario.amount}? Kenapa awak sebut lain pula?", "Eh, akaun saya ni bukan dengan ${scenario.client||'syarikat tu'} ke? Awak sebut lain tadi.", atau "Saya tak pasti betul ke tak, boleh check balik?". Jangan akur secara automatik kepada apa-apa maklumat (termasuk nama syarikat) yang tidak konsisten dengan KONTEKS SENARIO di atas.`;

  const levelBehaviour={
    easy:`Aras Mudah — anda adalah penghutang yang MUDAH dilayan: cepat akur bila diberi alasan munasabah, tidak banyak bantahan, bersedia bagi PTP kalau diminta dengan baik, nada agak cooperative walaupun ada sedikit keberatan awal.`,
    med:`Aras Sederhana — anda adalah penghutang yang ADA RESISTANCE: bagi 1-2 bantahan atau alasan sebelum akur, perlu sedikit pujukan, mungkin minta masa lebih atau tawar PTP yang lewat, tapi akhirnya boleh reach agreement kalau collector approach dengan betul.`,
    hard:`Aras Sukar — anda adalah penghutang yang DEGIL dan SUSAH DILAYAN: banyak bantahan, selalu potong cakap collector, bagi alasan berulang-ulang, emosi mudah naik, mungkin cuba letak telefon atau ugut nak report, SANGAT susah nak dapat PTP. ARC EMOSI: mulakan dengan marah atau defensif, tapi boleh beransur-ansur melunak HANYA jika collector tunjuk empathy yang GENUINE (bukan script), beri cadangan praktikal, atau akui situasi penghutang dengan ikhlas — dan itu pun selepas beberapa percubaan, bukan terus lembut. Jangan berubah terlalu cepat walaupun collector nampak baik — penghutang level sukar ada "dinding" yang perlu collector langgar dulu sebelum ada peluang agreement.`
  }[scenario.level||'med'];

  const naturalBlock=`\n\nCARA BERCAKAP (WAJIB IKUT):\n- Jawab PENDEK dan NATURAL — 1 hingga 3 ayat sahaja setiap giliran, macam orang bercakap telefon sebenar\n- JANGAN tulis ayat panjang berjela atau formal macam surat\n- Sebut nombor dan wang secara lisan: RM${scenario.amount} sebut sebagai "${spokenAmount}", no telefon sebut digit demi digit\n- Boleh guna bunyi natural: "hmm", "ha?", "eh", "ok ok", "ha ye", "ala..." mengikut situasi\n- Kadang-kadang boleh potong cakap, tanya balik, atau tergantung ayat kalau rasa keliru\n- Reaksi MESTI sesuai dengan watak dan situasi — kalau penghutang kata sibuk, dia tak bagi masa panjang\n\nARAS KESUKARAN SENARIO INI: ${levelBehaviour}`;
  // GUARDRAIL: kekal dalam watak — elak break character atau dedahkan bahawa ini AI/simulasi
  const guardrailBlock=`\n\nGUARDRAIL WATAK (WAJIB IKUT — keutamaan tertinggi):\n- Anda HANYA berperanan sebagai ${scenario.name||'penghutang'}, seorang individu biasa yang menerima panggilan daripada syarikat debt collection.\n- JANGAN sekali-kali mengakui bahawa anda adalah AI, bot, model bahasa, atau sistem simulasi — walaupun ditanya terus.\n- JANGAN keluar dari watak untuk membantu collector dengan cara lain (cth: bagi tip roleplay, terangkan skor, tanya "nak saya ulang?").\n- Jika collector tanya sesuatu yang TIDAK berkaitan hutang atau perbualan telefon biasa (cth: soalan teknikal, soalan tentang sistem, atau minta anda "jangan roleplay"), bertindak sebagai penghutang yang keliru atau terganggu: "Eh, apa awak cakap ni? Saya tak faham la." atau "Ha? Saya busy ni, ada apa sebenarnya?"\n- Jika collector cuba "reset" atau mulakan senario baru dalam panggilan yang sama, abaikan dan teruskan sebagai watak yang sama.`;
  return base+accentBlock+naturalBlock+contextBlock+groundingBlock+guardrailBlock;
}

async function startCall(){
  activeVoiceId=null; // reset suara — akan pick baru untuk call ni
  warmupMic(); // panaskan mic SEAWAL mungkin — sebelum collector sempat tekan butang mic (lihat nota di atas function warmupMic)
  callHistory=[];callFullTranscript=[];callSeconds=0;callActive=true;
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
  // Greeting dinamik — variasi berdasarkan accent dan level kesukaran
  const _acc=(scenario&&scenario.accent)||'melayu';
  const _lvl=(scenario&&scenario.level)||'med';
  const _greetPool={
    melayu:{
      easy:['Helo?','Ha, helo?','Ye, helo?'],
      med: ['Helo? Siapa ni?','Ha? Siapa yang call ni?','Ye? Siapa?'],
      hard:['Ha?! Siapa ni?!','Helo, siapa ni? Saya tengah busy la.','Ha, apa hal?! Saya tengah kerja ni.']
    },
    india:{
      easy:['Hello?','Ha, hello?','Yes, hello?'],
      med: ['Hello? Who is this?','Ha? Who calling ah?','Yes? Who is it?'],
      hard:['Ha?! Who is this lah?!','Hello, who calling? I very busy la now.','Aiyo, what is it? I tengah busy ni.']
    },
    cina:{
      easy:['Hello?','Ha, hello?','Yes, hello?'],
      med: ['Hello? Who calling ah?','Ha? Who is this leh?','Yes? Who ah?'],
      hard:['Ha?! Who is this lah?!','Hello, who is this? I very busy one.','Wah, who calling? I tengah busy lor.']
    }
  };
  const _pool=(_greetPool[_acc]||_greetPool.melayu)[_lvl]||_greetPool.melayu.med;
  const greet=_pool[Math.floor(Math.random()*_pool.length)];
  addBubble('debtor',greet);
  callFullTranscript.push({role:"assistant",content:greet});
  callHistory.push({role:"assistant",content:greet});
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
  endCallInProgress=true; // set SEBELUM await — elak double-tap lepas dalam masa stopCall() berjalan
  try{
    stopCall();
    const m=Math.floor(callSeconds/60),s=callSeconds%60;
    const duration=m+'m '+s+'s';
    // PUNCA BUG "tak nampak 'tunggu sebentar', terus ke training/dashboard,
    // result baru muncul tiba-tiba": navigate('score') kat sini panggil
    // renderScoreScreen() — yang kalau window._lastScore BELUM ada (sesi
    // pertama lepas refresh, contohnya), terus navigate('training') secara
    // fire-and-forget (async, tak di-await). Render training tu boleh siap
    // LEPAS spinner bawah ni diletak (race condition — bergantung kelajuan
    // fetch senario) dan overwrite balik spinner dengan page training, sebab
    // evalCall() di bawah masih jalan 10-20 saat. Fix: jangan panggil
    // navigate('score') di sini langsung — set currentPage & letak spinner
    // terus tanpa render function. navigate('score') sebenar berlaku dalam
    // evalCall() bila window._lastScore dah sedia.
    currentPage='score';
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById('mainContent').innerHTML=`
    <div style="text-align:center;padding:3rem 1rem">
      <div style="font-size:48px;margin-bottom:16px;animation:spin 1.5s linear infinite;display:inline-block">⏳</div>
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px" id="scoreLoadingMsg">Menganalisis nada & cara penyampaian...</div>
      <div style="font-size:13px;color:var(--text3)">AI sedang menilai prestasi anda. Boleh sehingga seminit untuk panggilan yang panjang.</div>
    </div>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
  `;
    // Rotate mesej setiap 4 saat — bukan utk laju, tapi elak rasa "stuck"/diam
    // semasa AI tengah jana penilaian (proses non-streaming, semua/tiada).
    const loadingMsgs=['Menganalisis nada & cara penyampaian...','Menyemak hujah balas & rundingan...','Menyemak SOP & pematuhan...','Menilai strategi mengikut baki hutang...','Menyediakan maklum balas akhir...'];
    let loadingMsgIdx=0;
    scoreLoadingInterval=setInterval(()=>{
      loadingMsgIdx=(loadingMsgIdx+1)%loadingMsgs.length;
      const el=document.getElementById('scoreLoadingMsg');
      if(el)el.textContent=loadingMsgs[loadingMsgIdx];
    },4000);
    await evalCall(duration);
  }finally{
    endCallInProgress=false;
    if(scoreLoadingInterval){clearInterval(scoreLoadingInterval);scoreLoadingInterval=null;}
  }
}

async function speakEl(text){
  if(!TTS_ENABLED){
    // TTS dimatikan — skip terus ke state sedia terima input
    if(callActive){setStatus('green','Tekan mikrofon untuk bercakap.');resetMicBtn();}
    return;
  }
  audioQueue.push(text);if(!isPlayingAudio)playNext();
}
async function playNext(){
  if(!audioQueue.length){isPlayingAudio=false;if(callActive){setStatus('green','Tekan mikrofon untuk bercakap.');resetMicBtn();}return;}
  isPlayingAudio=true;
  const text=audioQueue.shift();
  setStatus('purple',scenario.name+' sedang bercakap...');
  setMicState('speaking','🔊','AI sedang bercakap...');
  try{
    const res=await fetch('/api/tts',{
      method:'POST',
      headers:authHeaders(),
      body:JSON.stringify({text:getAudioTagInstruction(text),gender:scenario?.gender||'male',geminiVoice:getGeminiVoice()})
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


// ═══════════ STT — DEEPGRAM (gantikan Web Speech API) ═══════════
// KENAPA DEEPGRAM: Web Speech API (webkitSpeechRecognition) bergantung pada
// Google STT cloud melalui Chrome — latency tinggi, bahasa rojak BM+English
// selalu drop/salah, dan tiada kawalan. Deepgram Nova-2 jauh lebih accurate
// untuk sebutan Malaysia, latency lebih rendah, dan kita kawalan penuh.
// FLOW BARU: push-to-talk — tekan mic → MediaRecorder rakam audio →
// lepas mic (atau auto-detect senyap) → hantar audio ke /api/stt →
// Deepgram transcribe → processSpeech() seperti biasa.

let mediaRecorder = null;
let audioChunks = [];
let silenceDetectInterval = null;
let recordingStartTime = 0;

function toggleMic() {
  if (isPlayingAudio) return;
  if (isRecording) stopRec();
  else startRec();
}

// ═══════════ NOMBOR BM → DIGIT ═══════════
// Deepgram language=ms tidak support smart_format Numerals — "dua ribu dua puluh enam"
// kekal sebagai perkataan, bukan "2026". Kita convert sendiri, lebih predictable.
// Dijalankan SELEPAS STT, SEBELUM STT_CORRECTIONS dan hantar ke AI.
// Hanya convert nombor yang dikenali — perkataan lain kekal tidak berubah.
function convertBMNumbers(text) {
  if (!text) return text;

  // Unit asas (1-19)
  const ONES = {
    'kosong': 0, 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
    'enam': 6, 'tujuh': 7, 'lapan': 8, 'sembilan': 9, 'sepuluh': 10,
    'sebelas': 11, 'dua belas': 12, 'tiga belas': 13, 'empat belas': 14,
    'lima belas': 15, 'enam belas': 16, 'tujuh belas': 17,
    'lapan belas': 18, 'sembilan belas': 19
  };
  // Puluhan (20-90)
  const TENS = {
    'dua puluh': 20, 'tiga puluh': 30, 'empat puluh': 40, 'lima puluh': 50,
    'enam puluh': 60, 'tujuh puluh': 70, 'lapan puluh': 80, 'sembilan puluh': 90
  };

  // Parse satu "nombor BM" dari senarai token (rekursif ke bawah)
  // Pulangkan { value: <number>, consumed: <bilangan token yang dipakai> } atau null
  function parseNum(tokens, i) {
    if (i >= tokens.length) return null;

    let val = 0;
    let start = i;

    // ── Juta ──
    // "X juta [Y]" — X boleh jadi nombor (rekursif) atau "se"
    const jutaMatch = /^(se)?juta$/.test(tokens[i]) && i > start
      ? null // akan handle di bawah
      : null;
    // (handle juta selepas kumpul sub-value, lihat bawah)

    // ── Ratus ──
    // "seratus", "dua ratus", ...
    if (tokens[i] === 'seratus') { val += 100; i++; }
    else if (i + 1 < tokens.length && tokens[i + 1] === 'ratus') {
      const h = ONES[tokens[i]];
      if (h !== undefined && h >= 2 && h <= 9) { val += h * 100; i += 2; }
    }

    // ── Puluhan ──
    // Cek "dua belas", "tiga belas" etc dulu (2-token)
    const twoTok = tokens.slice(i, i + 2).join(' ');
    if (ONES[twoTok] !== undefined) { val += ONES[twoTok]; i += 2; }
    // Kemudian "dua puluh", "tiga puluh" etc
    else if (TENS[twoTok] !== undefined) {
      val += TENS[twoTok]; i += 2;
      // Cek unit selepas: "dua puluh satu", "tiga puluh lapan"
      if (i < tokens.length && ONES[tokens[i]] !== undefined && ONES[tokens[i]] > 0) {
        val += ONES[tokens[i]]; i++;
      }
    }
    // Unit tunggal (1-10)
    else if (ONES[tokens[i]] !== undefined) { val += ONES[tokens[i]]; i++; }

    if (i === start) return null; // tiada token dikenali
    return { value: val, consumed: i - start };
  }

  // Tukar frasa nombor BM dalam teks kepada digit
  // Strategi: scan token demi token, try parse, ganti kalau berjaya
  function replaceBMNums(str) {
    // Normalize: lowercase, trim, strip tanda baca dalam nombor
    // Tapi jangan lowercase KESELURUHAN teks — hanya untuk lookup
    const lower = str.toLowerCase();
    const tokens = lower.split(/\s+/);
    const origTokens = str.split(/\s+/); // jaga kes asal untuk token yang tak ditukar
    const result = [];
    let i = 0;

    while (i < tokens.length) {
      // Cuba parse nombor dari posisi i
      // Cek "seribu", "dua ribu", ... + optional ratus/puluhan
      let numVal = null;
      let consumed = 0;

      // ── Ribu ──
      if (tokens[i] === 'seribu') {
        numVal = 1000; consumed = 1; i++;
        // Tambah bawah seribu: "seribu lapan ratus lima puluh"
        const sub = parseNum(tokens, i);
        if (sub && sub.value < 1000) { numVal += sub.value; consumed += sub.consumed; i += sub.consumed; }
      } else {
        // Cek "X ribu" — X boleh ratus/puluhan/ones sebelum "ribu"
        // Scan ke hadapan untuk cari "ribu"
        let peekVal = 0; let peekConsumed = 0; let j = i;

        // Cek ratus dulu
        if (tokens[j] === 'seratus') { peekVal = 100; peekConsumed++; j++; }
        else if (j + 1 < tokens.length && tokens[j + 1] === 'ratus') {
          const h = ONES[tokens[j]];
          if (h >= 2 && h <= 9) { peekVal = h * 100; peekConsumed += 2; j += 2; }
        }
        // Cek puluhan/ones
        const twoTok = tokens.slice(j, j + 2).join(' ');
        if (ONES[twoTok] !== undefined) { peekVal += ONES[twoTok]; peekConsumed += 2; j += 2; }
        else if (TENS[twoTok] !== undefined) {
          peekVal += TENS[twoTok]; peekConsumed += 2; j += 2;
          if (j < tokens.length && ONES[tokens[j]] !== undefined && ONES[tokens[j]] > 0) {
            peekVal += ONES[tokens[j]]; peekConsumed++; j++;
          }
        } else if (ONES[tokens[j]] !== undefined) { peekVal += ONES[tokens[j]]; peekConsumed++; j++; }

        if (j < tokens.length && tokens[j] === 'ribu' && peekConsumed > 0) {
          numVal = peekVal * 1000; consumed = peekConsumed + 1; i = j + 1;
          // Tambah bawah ribu
          const sub = parseNum(tokens, i);
          if (sub && sub.value < 1000) { numVal += sub.value; consumed += sub.consumed; i += sub.consumed; }
        }
      }

      if (numVal !== null) {
        // Berjaya parse nombor BM — ganti dengan digit
        result.push(String(numVal));
      } else {
        // Cek nombor biasa (ratus/puluhan/ones tanpa ribu)
        const plain = parseNum(tokens, i);
        if (plain && plain.value > 0) {
          // Hanya convert kalau bukan perkataan biasa yang kebetulan sama
          // (cth "satu" dalam "satu hal" — terlalu aggressive kalau selalu tukar)
          // Tukar JIKA ada context nombor (ada "RM", "ringgit", "tahun", "bulan", "hari", "sen" selepas)
          const nextTok = tokens[i + plain.consumed] || '';
          const prevTok = result.length > 0 ? result[result.length - 1].toLowerCase() : '';
          const isNumContext = /^(rm|ringgit|tahun|bulan|hari|sen|%|peratus|sesi|kali|jam|minit)$/.test(nextTok)
            || /^(rm|ringgit|dalam|lebih|bawah|atas|sekitar|dalam|antara|hanya|cuma|sejumlah)$/.test(prevTok)
            || (plain.value >= 100); // nilai besar (100+) lebih selamat untuk convert
          if (isNumContext) {
            result.push(String(plain.value));
            i += plain.consumed;
          } else {
            result.push(origTokens[i] || tokens[i]);
            i++;
          }
        } else {
          result.push(origTokens[i] || tokens[i]);
          i++;
        }
      }
    }

    return result.join(' ');
  }

  // Spesial: tukar tahun BM → digit (lebih aggressive sebab tahun selalu nombor)
  // "dua ribu dua puluh enam" → "2026"
  // Ini handled oleh replaceBMNums() di atas (>= 2000 → tukar), tapi tambah
  // frasa "tahun" + BM sebagai hint kalau replaceBMNums tak catch
  let t = text;
  // Normalkan "dua puluh" yang mungkin di-STT-kan terpisah dengan dash/space
  t = t.replace(/dua\s*-\s*puluh/gi, 'dua puluh')
       .replace(/tiga\s*-\s*puluh/gi, 'tiga puluh')
       .replace(/empat\s*-\s*puluh/gi, 'empat puluh')
       .replace(/lima\s*-\s*puluh/gi, 'lima puluh')
       .replace(/enam\s*-\s*puluh/gi, 'enam puluh')
       .replace(/tujuh\s*-\s*puluh/gi, 'tujuh puluh')
       .replace(/lapan\s*-\s*puluh/gi, 'lapan puluh')
       .replace(/sembilan\s*-\s*puluh/gi, 'sembilan puluh');
  t = replaceBMNums(t);
  return t;
}

// Kamus pembetulan STT — masih dipakai untuk betulkan output Deepgram
const STT_CORRECTIONS = [
  // ── Telco / brand names ──
  [/\bpr\s*one\b/gi, 'RedOne'], [/\bred\s*one\b/gi, 'RedOne'],
  [/\bcel\s*com\b/gi, 'Celcom'], [/\bsel\s*com\b/gi, 'Celcom'], [/\bcel\s*come\b/gi, 'Celcom'],
  [/\bde\s*gi\b/gi, 'Digi'], [/\bdi\s*gi\b/gi, 'Digi'], [/\bdigi\s*cel\b/gi, 'Digi'],
  [/\bmaxis\s*one\b/gi, 'Maxis'], [/\bu\s*mobile\b/gi, 'U Mobile'],
  [/\bc\s*t\s*o\s*s\b/gi, 'CTOS'], [/\bc\s*c\s*r\s*i\s*s\b/gi, 'CCRIS'],
  [/\bn\s*p\s*l\b/gi, 'NPL'], [/\bn\s*p\s*n\b/gi, 'NPL'], [/\bnon\s*performing\b/gi, 'NPL'],
  [/\bp\s*t\s*p\b/gi, 'PTP'], [/\bpromise\s*to\s*pay\b/gi, 'PTP'],
  [/\bspdca\b/gi, 'SPDCA'], [/\bspd\s*ca\b/gi, 'SPDCA'],
  [/\bjom\s*pay\b/gi, 'JomPay'], [/\bjompay\b/gi, 'JomPay'],
  [/\bfpx\b/gi, 'FPX'], [/\bringgit\s*malaysia\b/gi, 'RM'],
  [/\bnew\s*vest\b/gi, 'Newvest'], [/\bnew\s*face\b/gi, 'New Face'],
  [/\bdc\s*a\b/gi, 'DCA'], [/\bde\s*ce\s*a\b/gi, 'DCA'],
  [/\bwhat\s*sapp\b/gi, 'WhatsApp'], [/\bwhat\s*app\b/gi, 'WhatsApp'],
  // ── BM perkataan hutang — Deepgram selalu silap ──
  [/\bbuyer\b/gi, 'bayar'],            // "bayar" → "buyer"
  [/\bbuy her\b/gi, 'bayar'],
  [/\bgood\s*time\b/gi, 'hutang'],    // "hutang" → "good time"
  [/\bgoodtime\b/gi, 'hutang'],
  [/\bhooting\b/gi, 'hutang'],
  [/\bhootang\b/gi, 'hutang'],
  [/\bringette\b/gi, 'ringgit'],       // "ringgit" → "ringette"
  [/\bring it\b/gi, 'ringgit'],
  [/\bpay\s*check\b/gi, 'PTP'],       // "PTP" → "paycheck"
  [/\bpaycheck\b/gi, 'PTP'],
  [/\btak\s*bole\b/gi, 'tak boleh'],  // common truncation
  [/\bnak\s*bole\b/gi, 'nak boleh'],
  [/\btunggak\b/gi, 'tertunggak'],     // partial word
  [/\bber\s*janji\b/gi, 'berjanji'],
  [/\bjan\s*ji\b/gi, 'janji'],
  [/\bansurans\b/gi, 'ansuran'],       // "ansuran" → "ansurans"
  [/\bansurance\b/gi, 'ansuran'],
  [/\bpay\s*later\b/gi, 'paylater'],
  [/\be\s*wallet\b/gi, 'ewallet'],
  [/\bwallet\s*e\b/gi, 'ewallet'],
  [/\bkas\s*im\b/gi, 'CCRIS'],        // misfire pada nama
  [/\bam\s*bank\b/gi, 'AmBank'],
  [/\bcimb\s*click\b/gi, 'CIMB'],
  [/\bmay\s*bank\b/gi, 'Maybank'],
  [/\bh\s*l\s*b\b/gi, 'HLB'],        // Hong Leong Bank
  [/\bpublic\s*bang\b/gi, 'Public Bank'],
];
function correctSTT(text) {
  let t = text;
  STT_CORRECTIONS.forEach(([pattern, replacement]) => { t = t.replace(pattern, replacement); });
  return t;
}

// ═══════════ MIC LEVEL METER ═══════════
// FIX: dulu ada 2 cara kira "level" berbeza (meter visual guna ×4 scaling,
// silence detector guna raw RMS) — tukar jadi SATU helper supaya semua bahagian
// (meter, silence detect, ambient calibration, peak tracking) guna unit yang sama.
function getMicRMS() {
  if (!micAnalyser) return 0;
  const data = new Uint8Array(micAnalyser.fftSize);
  micAnalyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / data.length);
}

// FIX (auto-calibrate ikut bilik/mic sebenar): dulu SILENCE_THRESHOLD nombor
// hardcode (0.02, lepas tu 0.012) — nombor yang sama boleh "betul" untuk satu
// mic/bilik tapi "salah" untuk yang lain (noise floor setiap setup lain-lain).
// Sample ambient noise level secara berterusan SEMASA TAK RECORDING, supaya kita
// tahu "senyap sebenar" tu berapa untuk setup semasa, baru threshold dikira
// relatif kepada tu — bukan teka nombor fixed.
let ambientSamples = [];
let ambientSampleInterval = null;

function startAmbientCalibration() {
  if (ambientSampleInterval) return;
  ambientSampleInterval = setInterval(() => {
    if (!micAnalyser || isRecording) return; // hanya sample bila TAK recording (anggap senyap)
    ambientSamples.push(getMicRMS());
    if (ambientSamples.length > 40) ambientSamples.shift(); // ~6 saat rolling window (150ms x 40)
  }, 150);
}

function stopAmbientCalibration() {
  if (ambientSampleInterval) { clearInterval(ambientSampleInterval); ambientSampleInterval = null; }
  ambientSamples = [];
}

function getAdaptiveSilenceThreshold() {
  if (ambientSamples.length < 5) return 0.02; // belum cukup sample, fallback default
  const sorted = [...ambientSamples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]; // median — tahan terhadap noise spike sekejap (cth: kerusi berderak)
  // Threshold = noise floor + margin. Clamp supaya tak terlalu sensitive (room sangat senyap)
  // atau terlalu "buta" (room agak bising).
  return Math.min(0.06, Math.max(0.014, median * 1.7 + 0.006));
}

async function warmupMic() {
  try {
    if (micStream) return;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = micAudioCtx.createMediaStreamSource(micStream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    source.connect(micAnalyser);
    tickMicLevel();
    startAmbientCalibration();
  } catch (e) {
    console.warn('Mic warm-up gagal:', e.message);
  }
}

function tickMicLevel() {
  if (!micAnalyser) return;
  const rms = getMicRMS();
  const visualLevel = Math.min(1, rms * 4); // scaling khusus untuk visual bar je
  if (isRecording) micPeakSinceStart = Math.max(micPeakSinceStart, rms);
  const fill = document.getElementById('micLevelFill');
  if (fill) fill.style.width = (isRecording ? Math.round(visualLevel * 100) : 0) + '%';
  micLevelRAF = requestAnimationFrame(tickMicLevel);
}

function stopMicLevelMeter() {
  if (micLevelRAF) { cancelAnimationFrame(micLevelRAF); micLevelRAF = null; }
  stopAmbientCalibration();
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (micAudioCtx) { try { micAudioCtx.close(); } catch (e) { } micAudioCtx = null; }
  micAnalyser = null;
}

// ═══════════ AUTO-SILENCE DETECTION ═══════════
// Bila collector berhenti cakap, auto-stop recording dan hantar.
// Threshold sekarang DIKIRA semasa setiap recording start (snapshot ambient
// floor terkini), bukan nombor fixed — adapt automatik ikut bilik/mic semasa.
let lastSilenceThreshold = 0.02; // disimpan supaya onstop boleh check "ada cakap sebenar tak"
function startSilenceDetection() {
  const SILENCE_THRESHOLD = getAdaptiveSilenceThreshold();
  lastSilenceThreshold = SILENCE_THRESHOLD;
  const SILENCE_MS = 2000;
  let silenceStart = null;
  console.log('[STT debug] silence threshold (adaptive):', SILENCE_THRESHOLD.toFixed(4));

  silenceDetectInterval = setInterval(() => {
    if (!micAnalyser || !isRecording) return;
    const level = getMicRMS();

    // Jangan trigger auto-stop dalam 1 saat pertama — bagi masa collector mula cakap
    const elapsed = Date.now() - recordingStartTime;
    if (elapsed < 1000) { silenceStart = null; return; }

    if (level < SILENCE_THRESHOLD) {
      if (!silenceStart) silenceStart = Date.now();
      else if (Date.now() - silenceStart >= SILENCE_MS) {
        // Senyap cukup lama — auto stop
        clearInterval(silenceDetectInterval);
        silenceDetectInterval = null;
        stopRec();
      }
    } else {
      silenceStart = null; // ada bunyi — reset timer senyap
    }
  }, 100);
}


function stopSilenceDetection() {
  if (silenceDetectInterval) { clearInterval(silenceDetectInterval); silenceDetectInterval = null; }
}

// ═══════════ START / STOP RECORDING ═══════════
async function startRec() {
  if (isRecording) return;

  // FIX: track boleh "mati" senyap-senyap (cth: tab kena freeze, OS cabut akses
  // mic sekejap, headset bertukar device) — bila ni jadi, getUserMedia call asal
  // still ada object micStream tapi track dah 'ended', so MediaRecorder akan
  // rakam diam je → Deepgram balas transcript kosong → rasa macam "tak detect".
  // Check track.readyState dan re-acquire kalau dah mati.
  const trackDead = micStream && micStream.getAudioTracks().some(t => t.readyState === 'ended');
  if (trackDead) { stopMicLevelMeter(); micStream = null; }

  // Pastikan ada mic stream (warmupMic dah panggil sebelum ni, tapi kalau gagal, cuba lagi)
  if (!micStream) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = micAudioCtx.createMediaStreamSource(micStream);
      micAnalyser = micAudioCtx.createAnalyser();
      micAnalyser.fftSize = 512;
      source.connect(micAnalyser);
      tickMicLevel();
      startAmbientCalibration();
    } catch (e) {
      setStatus('', '⚠ Mic tidak dibenarkan. Allow akses mikrofon dalam browser.');
      return;
    }
  }

  // Pilih format terbaik yang disokong browser
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';

  audioChunks = [];
  mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : {});

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    isRecording = false;
    stopSilenceDetection();
    // Tunjuk "Memproses..." SEGERA sebaik mic stop — collector tau request dah dihantar
    // (jangan tunggu STT response dulu baru update UI — nampak laggy)
    setMicState('thinking', '⏳', 'Memproses audio...');
    setStatus('', 'Memproses...');

    const recDurationMs = Date.now() - recordingStartTime;
    console.log('[STT debug] recording duration:', recDurationMs, 'ms | chunks:', audioChunks.length,
      '| peak RMS:', micPeakSinceStart.toFixed(4), '| threshold used:', lastSilenceThreshold.toFixed(4));

    if (audioChunks.length === 0) {
      setStatus('green', 'Tekan mikrofon untuk bercakap.');
      return;
    }

    // FIX (elak hantar clip "kosong" ke Deepgram): kalau peak volume sepanjang
    // recording tak pernah naik jauh atas ambient floor, kemungkinan besar collector
    // tak sempat cakap (cth: tersilap tekan, atau cakap terlalu jauh dari mic) — bukan
    // Deepgram yang silap. Bagi feedback terus kat sini, jangan hantar API call yang
    // memang akan balik kosong (jimat masa + jimat duit Deepgram credit jugak).
    if (micPeakSinceStart < lastSilenceThreshold * 1.4) {
      console.warn('[STT debug] peak terlalu rendah berbanding ambient — skip hantar ke Deepgram');
      audioChunks = [];
      setStatus('', '⚠ Tak nampak ada suara dikesan. Cuba cakap lebih dekat/lebih kuat dgn mic.');
      resetMicBtn();
      return;
    }

    const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
    audioChunks = [];

    // Hantar ke /api/stt (Deepgram) — retry SEKALI bila network blip (bukan bila
    // Deepgram sendiri reject request), sebab tanpa retry, satu request gagal =
    // collector kena ulang cakap balik dari awal = rasa "tak smooth".
    async function callSTT() {
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': mimeType || 'audio/webm', 'x-user-id': localStorage.getItem('ct_session_id')||'' },
        body: audioBlob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'STT gagal');
      return data;
    }

    try {
      setMicState('thinking', '⏳', 'Mentranskrip...');
      let data;
      try {
        data = await callSTT();
      } catch (firstErr) {
        // Cuba sekali lagi — kemungkinan network blip sekejap, bukan ralat tetap
        setMicState('thinking', '⏳', 'Cuba semula...');
        data = await callSTT();
      }

      console.log('[STT debug] blob size:', audioBlob.size, 'bytes | transcript:', JSON.stringify(data.transcript),
        '| confidence:', data.confidence);

      const transcript = (data.transcript || '').trim();
      if (!transcript) {
        // Tiada teks — audio ada dihantar (peak check dah lepas), tapi Deepgram balas
        // kosong. Ini BUKAN "tiada suara" — kemungkinan isu format/encoding/upstream.
        // Console log di atas akan tunjuk blob size sebenar untuk debug lanjut.
        setStatus('', '⚠ Tak dapat transkrip ayat tu — cuba cakap lagi sekali.');
        resetMicBtn();
        return;
      }

      // Update live text display sekejap sebelum hantar
      const lt = document.getElementById('liveText');
      if (lt) lt.textContent = transcript;

      await processSpeech(transcript);
    } catch (e) {
      console.error('STT error:', e);
      setStatus('', '⚠ Gagal transkrip: ' + e.message);
      resetMicBtn();
    }
  };

  mediaRecorder.start(250); // collect chunks setiap 250ms
  isRecording = true;
  micPeakSinceStart = 0;
  recordingStartTime = Date.now();
  setMicState('recording', '🎙', 'Sedang rakam... (lepas untuk hantar)');
  setStatus('red', 'Anda sedang bercakap...');
  startSilenceDetection();
}

function stopRec() {
  if (!isRecording || !mediaRecorder) return;
  stopSilenceDetection();
  try { mediaRecorder.stop(); } catch (e) { }
  // isRecording akan diset false dalam mediaRecorder.onstop
}

async function processSpeech(rawText){
  // Pipeline: STT raw → convert nombor BM → STT corrections → AI
  const withNums=convertBMNumbers(rawText);
  const text=correctSTT(withNums); // betulkan STT errors selepas convert nombor
  const lt=document.getElementById('liveText');if(lt)lt.textContent='';
  setMicState('thinking','⏳','AI sedang berfikir...');setStatus('','AI sedang berfikir...');
  // Push ke full transcript (untuk eval) DAN callHistory (untuk API)
  addBubble('collector',text);
  callFullTranscript.push({role:'user',content:text});
  callHistory.push({role:'user',content:text});
  // Trim callHistory untuk API — hantar HISTORY_WINDOW turn terkini sahaja
  // Mesti kekalkan pasangan user+assistant (trim dari depan, 2 sekaligus)
  while(callHistory.length>HISTORY_WINDOW*2){callHistory.splice(0,2);}
  // max_tokens: hard level bagi lebih ruang untuk respon emosi panjang
  const maxTok=(scenario&&scenario.level==='hard')?400:200;
  try{
    const res=await fetch('/api/claude',{method:'POST',headers:authHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:maxTok,system:getSysPrompt(),messages:callHistory})});
    const data=await res.json();
    const reply=data.content?.[0]?.text||'Hmm...';
    callFullTranscript.push({role:'assistant',content:reply});
    callHistory.push({role:'assistant',content:reply});addBubble('debtor',reply);
    speakEl(reply);
  }catch(e){addBubble('debtor','[Ralat AI. Cuba lagi.]');resetMicBtn();setStatus('green','Tekan mikrofon untuk bercakap.');}
}

async function evalCall(duration){
  const transcript=callFullTranscript.map(m=>`${m.role==='user'?'Collector':'Penghutang'}: ${m.content}`).join('\n');
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

  // Hadkan transcript kepada 8000 aksara untuk elak context overflow pada panggilan sangat panjang
  // Potong dari depan (bahagian awal kurang kritikal untuk QA) — kekal bahagian akhir panggilan
  const MAX_TRANSCRIPT_CHARS = 8000;
  const trimmedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS
    ? '[...awal panggilan dipotong untuk ruang...]\n' + transcript.slice(-MAX_TRANSCRIPT_CHARS)
    : transcript;

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
${trimmedTranscript}

Masa Panggilan: ${duration}

PENTING: Jika transcript amat pendek (kurang 5 giliran perbualan), tetap beri markah ADIL berdasarkan apa yang ADA — jangan bagi 2/20 secara default. Walaupun singkat, analisis nada, cara sebut nama, cara bagi salam/perkenalan, dan sama ada collector terus ke tujuan panggilan dengan betul.

PENTING — HARASSMENT ASSESSMENT: Nilai harassmentRisk berdasarkan TINDAKAN COLLECTOR SAHAJA (baris "Collector:" dalam transcript). ABAIKAN sepenuhnya apa yang "Penghutang:" cakap — dialog debtor adalah AI simulation dan tidak relevan untuk penilaian etika. harassmentNote mesti hurai tindakan/ayat COLLECTOR yang bermasalah dalam Bahasa Malaysia, bukan translate atau petik dialog debtor.

TUGAS ANDA — analisis transcript di atas baris demi baris, kemudian:

1. Markah 5 aspek (setiap satu 0-20, jumlah maksimum 100) DAN bagi "scoreReasons" — 1-2 ayat per kategori yang WAJIB sebut (a) apa yang collector buat/tidak buat dalam kategori tu, (b) contoh SPESIFIK dari transcript (petik ayat pendek atau situasi), dan (c) kenapa markah tu diberikan (bukan sekadar cakap "baik" atau "lemah" tanpa bukti):
   - tone: Nada & profesionalisme collector (sopan, tenang, tidak defensif/agresif)
   - delivery: Cara penyampaian — kejelasan, struktur ayat, kawalan perbualan
   - counter: Keberkesanan hujah balas (counter) terhadap bantahan/dalih/emosi penghutang
   - action: Tindakan & pematuhan — ikut checklist di atas + SOP umum (pengesahan identiti/akaun, nyatakan tujuan panggilan, dapatkan PTP yang jelas & spesifik, dokumentasi, TIDAK mengugut/memaksa). Selitkan juga: (a) Dispute Handling — jika penghutang bangkitkan bantahan/dispute (dakwa sudah bayar, jumlah tak tepat, dsb), adakah collector tangani dengan betul (semak, jelaskan, jangan abaikan/tolak bantahan secara sambil lewa)? (b) Ketepatan Notes — adakah maklumat yang disebut/disahkan collector (jumlah, tarikh, tempoh, No. IC, Acc Number, Service No., Acc Type, Client, dsb) tepat dan konsisten dengan SENARIO & Maklumat Akaun Pelanggan di atas, atau adakah collector tersilap nyatakan maklumat akaun? (c) Pengumuman Wajib — adakah collector menyebut SECARA EKSPLISIT setiap item dalam senarai "PENGUMUMAN/POLISI WAJIB" di atas (jika senarai tu tak kosong)? Jika ada satu sahaja yang tertinggal, markah aspek action MESTI rendah.
   - balance: Strategi mengikut tahap baki hutang (${tierLabel} — ${tierHint})

2. strengths: 1-4 perkara yang collector BETUL-BETUL buat dengan baik (spesifik, bukan umum).

3. missed: WAJIB 3-5 perkara checklist/SOP yang PATUT dilakukan collector TAPI TIDAK dilakukan, atau dilakukan dengan salah/lemah (MAKSIMUM 5 — pilih yang PALING penting/kritikal sahaja, walaupun panggilan panjang/banyak isu). Ini bahagian PALING PENTING dalam latihan ini — JANGAN biarkan kosong walaupun panggilan nampak baik; setiap panggilan ADA ruang penambahbaikan, cari ia walaupun kecil. PENTING: jika mana-mana item dalam "PENGUMUMAN/POLISI WAJIB" di atas TIDAK disebut langsung oleh collector sepanjang transcript, WAJIB masukkan sebagai SATU item 'missed' (category: action, issue mulakan dengan "Pengumuman wajib tidak disampaikan: ...") — beri keutamaan tertinggi kepada isu jenis ni berbanding isu gaya/SOP umum yang lain, sebab ia kegagalan pematuhan, bukan sekadar kelemahan rundingan. Untuk SETIAP item beri (kekalkan ringkas, 1 ayat setiap field):
   - category: salah satu dari tone/delivery/counter/action/balance
   - issue: apa yang tak dibuat/salah (spesifik kepada perbualan ini, bukan teori umum)
   - suggestion: ayat atau tindakan SPESIFIK (boleh terus dipakai/dihafal) yang patut collector guna sebagai gantinya
   - quote: petikan ringkas (≤15 patah perkataan) dari ayat collector dalam transcript yang berkaitan isu ini, atau "" jika tiada ayat spesifik berkaitan

4. harassmentRisk: "none" jika tiada isu langsung, "low"/"medium"/"high" jika collector menggunakan nada mengugut/memaksa/mendesak melampau, malu-malukan, atau melanggar etika debt collection. Jika bukan "none", isi harassmentNote (1 ayat ringkas dalam Bahasa Malaysia — hurai TINDAKAN collector yang bermasalah, JANGAN translate atau petik dialog debtor secara literal, fokus kepada APA yang collector buat yang melanggar etika) — ini akan dipaparkan kepada manager untuk semakan pematuhan.

5. priorityFocus: SATU aspek (category sama macam atas) yang PALING perlu collector fokus dalam sesi latihan SETERUSNYA (biasanya aspek dengan markah terendah atau isu paling kritikal), dengan "tip" ringkas 1 ayat — spesifik & boleh terus diamalkan, bukan nasihat umum.

6. feedback: ringkasan keseluruhan 2-3 ayat dalam Bahasa Malaysia, nada membina (constructive coaching), bukan menghukum. WAJIB spesifik kepada panggilan ini (rujuk isu/kekuatan sebenar dari transcript, bukan ayat generik macam "secara keseluruhan baik"), dan tutup dengan 1 ayat galakan/arah tindakan konkrit untuk sesi latihan akan datang — bukan sekadar pujian kosong.

Jawab JSON SAHAJA tanpa markdown/code-fence, ikut struktur tepat ini:
{"totalScore":<0-100>,"scores":{"tone":<0-20>,"delivery":<0-20>,"counter":<0-20>,"action":<0-20>,"balance":<0-20>},"scoreReasons":{"tone":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","delivery":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","counter":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","action":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript","balance":"1-2 ayat kenapa dapat markah ini — sebut contoh spesifik dari transcript"},"strengths":["..."],"missed":[{"category":"tone|delivery|counter|action|balance","issue":"...","suggestion":"...","quote":"..."}],"harassmentRisk":"none|low|medium|high","harassmentNote":"","priorityFocus":{"category":"tone|delivery|counter|action|balance","tip":"..."},"feedback":"..."}`;

  try{
    const res=await fetch('/api/claude',{method:'POST',headers:authHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2600,messages:[{role:'user',content:prompt}]})});
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
      feedback:r.feedback||'',transcript:callFullTranscript
    };
    // Simpan ke Supabase dalam try/catch BERASINGAN dari parsing AI di atas —
    // kalau save DB ni gagal (cth network blip / Supabase down), collector
    // masih nampak hasil penilaian. Sesi yang gagal masuk pending queue dalam
    // localStorage — auto-retry setiap 60s atau bila user tekan "Cuba Sekarang".
    try{
      await sessionApi.create(sessionData);
      await loadSessions(true); // refresh cache supaya dashboard/manager terus nampak sesi baru
    }catch(saveErr){
      console.error('Gagal simpan sesi ke Supabase (cubaan 1):',saveErr);
      // Cuba sekali lagi dengan id baru (litupi kes id collision serentak)
      try{
        sessionData.id='sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
        await sessionApi.create(sessionData);
        await loadSessions(true);
      }catch(saveErr2){
        console.error('Gagal simpan sesi ke Supabase (cubaan 2), masuk pending queue:',saveErr2);
        // Simpan dalam pending queue — auto-retry, jangan panik collector
        addPendingSession(sessionData);
      }
    }
    window._lastScore={...sessionData};
    navigate('score');
  }catch(e){
    window._lastScore={
      totalScore:0,scores:{tone:0,delivery:0,counter:0,action:0,balance:0},
      strengths:[],missed:[],priorityFocus:null,harassmentRisk:'none',harassmentNote:'',
      feedback:'Tidak dapat menganalisis sesi ini — sila cuba sekali lagi.',
      scenarioName:scenario?scenario.title:'',duration,transcript:callFullTranscript
    };
    navigate('score');
  }
}

// ═══════════ MODAL ═══════════
function openModal(html){document.getElementById('modalBox').innerHTML=html;document.getElementById('modalOverlay').classList.add('open');}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay')){document.getElementById('modalOverlay').classList.remove('open');stopScenarioDraftTimer();}}

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
//
// OFFLINE FALLBACK: Kalau Supabase tak boleh reach masa restore (timeout /
// maintenance), guna maklumat user yang di-cache dalam localStorage semasa
// login terakhir — collector masih boleh masuk app & buat training.
// Banner kecil akan tunjuk "⚠ Offline mode" supaya user sedar ada isu.
// Bila Supabase balik online, sesi akan verify semula pada request API seterusnya.
(async function restoreSession(){
  const savedId=localStorage.getItem('ct_session_id');
  if(!savedId)return;

  // Cuba verify dengan Supabase dulu (normal flow)
  try{
    const u=await userApi.session(savedId);
    if(!u){
      // ID tak wujud (akaun dipadam) — kekal di skrin login, buang cache lama
      localStorage.removeItem('ct_session_id');
      localStorage.removeItem('ct_cached_user');
      return;
    }
    // Berjaya verify — update cache dengan data terkini & proceed
    localStorage.setItem('ct_cached_user',JSON.stringify({id:u.id,name:u.name,role:u.role}));
    currentUser=u;
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    initApp();
  }catch(e){
    // Supabase tak boleh reach — cuba guna cached user sebagai fallback
    try{
      const cached=JSON.parse(localStorage.getItem('ct_cached_user')||'null');
      if(!cached||!cached.id||!cached.name||!cached.role)return; // tiada cache — kena login balik
      currentUser=cached;
      document.getElementById('authScreen').classList.remove('active');
      document.getElementById('mainApp').classList.add('active');
      initApp();
      // Tunjuk banner offline mode supaya user sedar
      setTimeout(()=>{
        let banner=document.getElementById('offlineModeBanner');
        if(!banner){
          banner=document.createElement('div');
          banner.id='offlineModeBanner';
          banner.style.cssText='position:fixed;top:0;left:0;right:0;background:#854F0B;color:#fff;padding:8px 16px;font-size:13px;z-index:99999;text-align:center;';
          banner.innerHTML='⚠️ <strong>Mod Terhad:</strong> Tidak dapat sambung ke pelayan. Data mungkin tidak terkini. <button onclick="window.location.reload()" style="margin-left:10px;background:#fff;color:#854F0B;border:none;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600">Cuba Semula</button>';
          document.body.prepend(banner);
        }
      },500);
    }catch(e2){
      // Langsung tak boleh recover — biar kat login screen
    }
  }
})();
