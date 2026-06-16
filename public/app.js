// ═══════════ DATABASE (localStorage) ═══════════
const DB = {
  get(k){try{return JSON.parse(localStorage.getItem('ct_'+k)||'null');}catch{return null;}},
  set(k,v){localStorage.setItem('ct_'+k,JSON.stringify(v));},
  getUsers(){return this.get('users')||this.defaultUsers();},
  getSessions(){return this.get('sessions')||[];},
  getScenarios(){return this.get('scenarios')||this.defaultScenarios();},
  defaultUsers(){
    const u={
      'ADMIN':  {id:'ADMIN', name:'Admin Sistem', pass:'admin123', role:'admin', registeredAt:new Date().toISOString()},
      'MGR001': {id:'MGR001',name:'Puan Rashidah',pass:'mgr123',  role:'manager',registeredAt:new Date().toISOString()},
      'COL001': {id:'COL001',name:'Ahmad Faris',  pass:'col123',  role:'collector',registeredAt:new Date().toISOString()},
      'COL002': {id:'COL002',name:'Siti Nabilah', pass:'col123',  role:'collector',registeredAt:new Date().toISOString()},
      'COL003': {id:'COL003',name:'Rizwan Hakim', pass:'col123',  role:'collector',registeredAt:new Date().toISOString()}
    };
    this.set('users',u); return u;
  },
  defaultScenarios(){
    const s=[
      {id:'s1',name:'Encik Razif',emoji:'😊',title:'Penghutang Bekerjasama',desc:'Lupa bayar, mudah dibujuk, minta tempoh.',level:'easy',amount:'RM3,200',days:45,prompt:'Anda berlakon sebagai {name}, penghutang yang lupa bayar pinjaman {amount} tertunggak {days} hari. Terkejut bila dihubungi tapi bersedia bekerjasama. Minta tempoh 2 minggu. Bahasa Malaysia natural. Jawab 1-3 ayat sahaja.'},
      {id:'s2',name:'Puan Sarina', emoji:'😤',title:'Penghutang Defensif',  desc:'Mendakwa sudah bayar, marah bila dihubungi.',level:'med', amount:'RM5,800',days:60,prompt:'Anda berlakon sebagai {name}, penghutang yang mendakwa sudah bayar {amount}. Marah dan rasa difitnah. Minta bukti. Bahasa Malaysia emosional tapi sopan. Jawab 1-3 ayat.'},
      {id:'s3',name:'Encik Faizal',emoji:'😔',title:'Kesusahan Kewangan',  desc:'Kehilangan kerja, ikhlas nak bayar tapi tak mampu.',level:'med', amount:'RM8,500',days:90,prompt:'Anda berlakon sebagai {name}, penghutang yang hilang kerja 2 bulan. Hutang {amount} tertunggak {days} hari. Ada isteri dan 2 anak. Nada sedih. Bahasa Malaysia. Jawab 1-3 ayat.'},
      {id:'s4',name:'Encik Darwis',emoji:'😡',title:'Penghutang Agresif',  desc:'Marah, mengugut, cuba menakutkan collector.',level:'hard',amount:'RM12,000',days:120,prompt:'Anda berlakon sebagai {name}, penghutang sangat agresif. Hutang {amount}. Ugut nak adukan ke AKPK. Agresif tapi TANPA bahasa kesat. Bahasa Malaysia. Jawab 1-3 ayat.'}
    ];
    this.set('scenarios',s); return s;
  },
  addSession(s){const arr=this.getSessions();arr.push(s);this.set('sessions',arr);},
  saveScenarios(s){this.set('scenarios',s);},
  saveUsers(u){this.set('users',u);}
};

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

function doLogin(){
  const id=document.getElementById('loginId').value.trim().toUpperCase();
  const pass=document.getElementById('loginPass').value;
  if(!id||!pass){showAlert('loginAlert','Sila isi semua maklumat.','err');return;}
  const users=DB.getUsers();
  if(!users[id]){showAlert('loginAlert','ID Pekerja tidak dijumpai.','err');return;}
  if(users[id].pass!==pass){showAlert('loginAlert','Kata laluan salah.','err');return;}
  currentUser=users[id];
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('mainApp').classList.add('active');
  initApp();
}

function doRegister(){
  const name=document.getElementById('regName').value.trim();
  const id=document.getElementById('regId').value.trim().toUpperCase();
  const pass=document.getElementById('regPass').value;
  const pass2=document.getElementById('regPass2').value;
  const role=document.getElementById('regRole').value;
  if(!name||!id||!pass){showAlert('regAlert','Sila isi semua maklumat.','err');return;}
  if(pass.length<6){showAlert('regAlert','Kata laluan min 6 aksara.','err');return;}
  if(pass!==pass2){showAlert('regAlert','Kata laluan tidak sepadan.','err');return;}
  const users=DB.getUsers();
  if(users[id]){showAlert('regAlert','ID ini sudah wujud.','err');return;}
  users[id]={id,name,pass,role,registeredAt:new Date().toISOString()};
  DB.saveUsers(users);
  showAlert('regAlert','Berjaya didaftar! Sila log masuk.','ok');
  setTimeout(()=>{switchAuthTab('login');document.getElementById('loginId').value=id;},1500);
}

function doLogout(){
  currentUser=null;
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
  const items={
    collector:[
      {page:'training',icon:'🎯',label:'Latihan Suara'},
      {page:'my-history',icon:'📊',label:'Rekod Saya'},
    ],
    manager:[
      {page:'dashboard',icon:'📈',label:'Dashboard'},
      {page:'collectors',icon:'👥',label:'Semua Collector'},
      {page:'sessions',icon:'📋',label:'Sesi Latihan'},
    ],
    admin:[
      {page:'dashboard',icon:'📈',label:'Dashboard'},
      {page:'collectors',icon:'👥',label:'Semua Collector'},
      {page:'sessions',icon:'📋',label:'Sesi Latihan'},
      {page:'scenarios',icon:'🎭',label:'Urus Senario'},
      {page:'users',icon:'👤',label:'Urus Pengguna'},
    ]
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
function renderDashboard(){
  const sessions=DB.getSessions();
  const users=DB.getUsers();
  const collectors=Object.values(users).filter(u=>u.role==='collector');
  const totalSessions=sessions.length;
  const avgScore=sessions.length?Math.round(sessions.reduce((a,s)=>a+s.totalScore,0)/sessions.length):0;
  const todaySessions=sessions.filter(s=>s.date&&s.date.startsWith(new Date().toISOString().slice(0,10))).length;
  const topCollector=collectors.map(c=>{const cs=sessions.filter(s=>s.collectorId===c.id);const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;return{...c,avg,count:cs.length};}).sort((a,b)=>b.avg-a.avg)[0];

  const recentSessions=sessions.slice(-10).reverse();

  setContent(`
  <div class="page-header"><div class="page-title">Dashboard</div><div class="page-sub">Overview prestasi collector</div></div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Jumlah Sesi</div><div class="stat-val">${totalSessions}</div><div class="stat-sub">Sesi latihan</div></div>
    <div class="stat-card"><div class="stat-label">Purata Markah</div><div class="stat-val">${avgScore}</div><div class="stat-sub">/ 100 mata</div></div>
    <div class="stat-card"><div class="stat-label">Sesi Hari Ini</div><div class="stat-val">${todaySessions}</div><div class="stat-sub">Latihan hari ini</div></div>
    <div class="stat-card"><div class="stat-label">Jumlah Collector</div><div class="stat-val">${collectors.length}</div><div class="stat-sub">Collector aktif</div></div>
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
        const u=Object.values(DB.getUsers()).find(u=>u.id===s.collectorId);
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${s.scenarioName} · ${s.duration}</div></div>
          <span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`);
}

function renderTraining(){
  const scenarios=DB.getScenarios();
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
  const scenarios=DB.getScenarios();
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
  <div style="max-width:560px;margin:0 auto">
    <div class="page-header"><div class="page-title">Keputusan Latihan</div><div class="page-sub">${s.scenarioName} · ${s.duration}</div></div>
    <div class="card">
      <div class="score-hero">
        <div class="score-circle"><div class="score-big">${s.totalScore}</div><div class="score-of">/ 100</div></div>
        <div style="font-size:16px;font-weight:600;color:${s.totalScore>=70?'var(--green)':s.totalScore>=50?'var(--amber)':'var(--red)'}">
          ${s.totalScore>=70?'Cemerlang! 🏆':s.totalScore>=50?'Baik! Teruskan 💪':'Perlu Latihan Lagi 📚'}
        </div>
      </div>
      <div class="score-rows">
        ${[['Komunikasi',s.communication,25],['Empati',s.empathy,25],['Pematuhan',s.compliance,25],['Keberkesanan',s.effectiveness,25]].map(([l,v,m])=>`
        <div class="score-row">
          <span>${l}</span>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="score-bar-wrap"><div class="score-bar" style="width:${v/m*100}%"></div></div>
            <span style="font-weight:600;color:var(--purple);min-width:40px;text-align:right">${v}/${m}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-title">💬 Maklum Balas AI</div>
      <p style="font-size:13px;color:var(--text2);line-height:1.7">${s.feedback}</p>
    </div>
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

function renderMyHistory(){
  const sessions=DB.getSessions().filter(s=>s.collectorId===currentUser.id).reverse();
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

function renderCollectors(){
  const users=DB.getUsers();
  const sessions=DB.getSessions();
  const collectors=Object.values(users).filter(u=>u.role==='collector');
  setContent(`
  <div class="page-header"><div class="page-title">Semua Collector</div><div class="page-sub">${collectors.length} collector berdaftar</div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Nama</th><th>ID</th><th>Sesi</th><th>Purata</th><th>Tertinggi</th><th>Terakhir</th></tr>
      ${collectors.map(c=>{
        const cs=sessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):'-';
        const best=cs.length?Math.max(...cs.map(s=>s.totalScore)):'-';
        const last=cs.length?cs[cs.length-1]:null;
        return`<tr>
          <td><div style="font-weight:500">${c.name}</div></td>
          <td><span class="chip chip-purple">${c.id}</span></td>
          <td>${cs.length}</td>
          <td>${typeof avg==='number'?`<span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${avg}</span>`:'-'}</td>
          <td>${typeof best==='number'?`<span class="score-pill score-high">${best}</span>`:'-'}</td>
          <td style="font-size:12px;color:var(--text3)">${last?new Date(last.date).toLocaleDateString('ms-MY'):'-'}</td>
        </tr>`;
      }).join('')}
    </table></div>
  </div>`);
}

function renderSessions(){
  const sessions=DB.getSessions().slice().reverse();
  const users=DB.getUsers();
  setContent(`
  <div class="page-header"><div class="page-title">Sesi Latihan</div><div class="page-sub">${sessions.length} sesi keseluruhan</div></div>
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📋</div><p>Belum ada sesi latihan.</p></div></div>`:''}
  ${sessions.length>0?`<div class="card">
    <div class="table-wrap"><table>
      <tr><th>Collector</th><th>Senario</th><th>Masa</th><th>Komunikasi</th><th>Empati</th><th>Pematuhan</th><th>Keberkesanan</th><th>Markah</th><th></th></tr>
      ${sessions.map(s=>{
        const u=Object.values(users).find(u=>u.id===s.collectorId);
        return`<tr>
          <td><div style="font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${s.collectorId}</div></td>
          <td>${s.scenarioName}</td>
          <td>${s.duration}</td>
          <td>${s.communication}/25</td>
          <td>${s.empathy}/25</td>
          <td>${s.compliance}/25</td>
          <td>${s.effectiveness}/25</td>
          <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
          <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">Lihat</button></td>
        </tr>`;
      }).join('')}
    </table></div>
  </div>`:''}
  `);
}

function viewSession(id){
  const s=DB.getSessions().find(s=>s.id===id);
  if(!s)return;
  const users=DB.getUsers();
  const u=Object.values(users).find(u=>u.id===s.collectorId);
  openModal(`
  <div class="modal-title">📋 Detail Sesi Latihan</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div><div style="font-size:12px;color:var(--text3)">Collector</div><div style="font-weight:500">${u?u.name:'—'}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Senario</div><div style="font-weight:500">${s.scenarioName}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Masa</div><div style="font-weight:500">${s.duration}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Markah</div><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}/100</span></div>
  </div>
  <hr class="divider"/>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:1rem">
    ${[['Komunikasi',s.communication,25],['Empati',s.empathy,25],['Pematuhan',s.compliance,25],['Keberkesanan',s.effectiveness,25]].map(([l,v,m])=>`
    <div style="background:var(--bg);border-radius:6px;padding:8px 12px">
      <div style="font-size:11px;color:var(--text3)">${l}</div>
      <div style="font-size:18px;font-weight:600;color:var(--purple)">${v}<span style="font-size:12px;color:var(--text3)">/${m}</span></div>
    </div>`).join('')}
  </div>
  <hr class="divider"/>
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">💬 Maklum Balas AI</div>
  <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:1rem">${s.feedback}</p>
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">📝 Transcript</div>
  <div style="max-height:220px;overflow-y:auto;background:var(--bg);border-radius:6px;padding:10px">
    ${(s.transcript||[]).map(m=>`<div style="margin-bottom:8px"><div style="font-size:10px;color:var(--text3)">${m.role==='user'?(u?u.name:'Collector'):'Penghutang'}</div>
    <div style="font-size:12px;line-height:1.5">${m.content}</div></div>`).join('')}
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div>`);
}

function renderScenarios(){
  if(currentUser.role!=='admin')return;
  const scenarios=DB.getScenarios();
  setContent(`
  <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div class="page-title">Urus Senario</div><div class="page-sub">${scenarios.length} senario tersedia</div></div>
    <button class="btn btn-primary" onclick="openAddScenario()">+ Tambah Senario</button>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Emoji</th><th>Nama</th><th>Tajuk</th><th>Hutang</th><th>Aras</th><th>Tindakan</th></tr>
      ${scenarios.map(s=>`<tr>
        <td style="font-size:20px">${s.emoji}</td>
        <td><div style="font-weight:500">${s.name}</div></td>
        <td>${s.title}</td>
        <td>${s.amount}</td>
        <td><span class="level-badge level-${s.level}">${s.level==='easy'?'Mudah':s.level==='med'?'Sederhana':'Sukar'}</span></td>
        <td><div class="action-row">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="editScenario('${s.id}')">Edit</button>
          <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteScenario('${s.id}')">Padam</button>
        </div></td>
      </tr>`).join('')}
    </table></div>
  </div>`);
}

function openAddScenario(existingId){
  const scenarios=DB.getScenarios();
  const s=existingId?scenarios.find(x=>x.id===existingId):null;
  openModal(`
  <div class="modal-title">${s?'Edit':'Tambah'} Senario</div>
  <div class="form-row"><label>Emoji</label><input id="scEmoji" value="${s?s.emoji:'😐'}" placeholder="😐" /></div>
  <div class="form-row"><label>Nama Penghutang</label><input id="scName" value="${s?s.name:''}" placeholder="Encik Ahmad" /></div>
  <div class="form-row"><label>Tajuk Senario</label><input id="scTitle" value="${s?s.title:''}" placeholder="Penghutang Bekerjasama" /></div>
  <div class="form-row"><label>Keterangan Ringkas</label><input id="scDesc" value="${s?s.desc:''}" placeholder="Lupa bayar, mudah dibujuk..." /></div>
  <div class="two-col">
    <div class="form-row"><label>Jumlah Hutang</label><input id="scAmount" value="${s?s.amount:'RM5,000'}" /></div>
    <div class="form-row"><label>Hari Tertunggak</label><input id="scDays" value="${s?s.days:30}" type="number" /></div>
  </div>
  <div class="form-row"><label>Aras Kesukaran</label>
    <select id="scLevel"><option value="easy" ${s&&s.level==='easy'?'selected':''}>Mudah</option><option value="med" ${s&&s.level==='med'?'selected':''}>Sederhana</option><option value="hard" ${s&&s.level==='hard'?'selected':''}>Sukar</option></select>
  </div>
  <div class="form-row"><label>Prompt AI (gunakan {name}, {amount}, {days})</label>
    <textarea id="scPrompt" rows="4" placeholder="Anda berlakon sebagai {name}...">${s?s.prompt:'Anda berlakon sebagai {name}, penghutang yang berhutang {amount} tertunggak {days} hari. Bercakap dalam Bahasa Malaysia. Jawab 1-3 ayat sahaja.'}</textarea>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="closeModal()">Batal</button>
    <button class="btn btn-primary" onclick="saveScenario('${existingId||''}')">Simpan</button>
  </div>`);
}

function editScenario(id){openAddScenario(id);}
function saveScenario(existingId){
  const scenarios=DB.getScenarios();
  const data={
    id:existingId||'s'+Date.now(),
    emoji:document.getElementById('scEmoji').value||'😐',
    name:document.getElementById('scName').value.trim(),
    title:document.getElementById('scTitle').value.trim(),
    desc:document.getElementById('scDesc').value.trim(),
    amount:document.getElementById('scAmount').value.trim(),
    days:parseInt(document.getElementById('scDays').value)||30,
    level:document.getElementById('scLevel').value,
    prompt:document.getElementById('scPrompt').value.trim()
  };
  if(!data.name||!data.title||!data.prompt){alert('Sila isi semua maklumat.');return;}
  if(existingId){const i=scenarios.findIndex(s=>s.id===existingId);if(i>=0)scenarios[i]=data;}
  else{scenarios.push(data);}
  DB.saveScenarios(scenarios);
  closeModal();renderScenarios();
}
function deleteScenario(id){
  if(!confirm('Padam senario ini?'))return;
  const scenarios=DB.getScenarios().filter(s=>s.id!==id);
  DB.saveScenarios(scenarios);renderScenarios();
}

function renderUsers(){
  if(currentUser.role!=='admin')return;
  const users=DB.getUsers();
  const all=Object.values(users);
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
function deleteUser(id){
  if(!confirm('Padam pengguna ini?'))return;
  const users=DB.getUsers();delete users[id];DB.saveUsers(users);renderUsers();
}

// ═══════════ CALL LOGIC ═══════════
function getVoiceId(){return scenario&&(scenario.name.includes('Puan')||scenario.name.includes('Cik'))?'EXAVITQu4vr4xnSDxMaL':'TX3LPaxmHKxFdv7VOQHJ';}
function getSysPrompt(){
  if(!scenario)return '';
  return scenario.prompt.replace(/{name}/g,scenario.name).replace(/{amount}/g,scenario.amount).replace(/{days}/g,scenario.days);
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

function toggleMic(){if(isPlayingAudio)return;if(isRecording)stopRec();else startRec();}
function startRec(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Sila guna Google Chrome untuk fungsi mikrofon.');return;}
  recognition=new SR();recognition.lang='ms-MY';recognition.continuous=false;recognition.interimResults=true;
  recognition.onstart=()=>{isRecording=true;setMicState('recording','🎙','Sedang rakam...');setStatus('red','Anda sedang bercakap...');};
  recognition.onresult=(e)=>{
    let interim='',final='';
    for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript;else interim+=e.results[i][0].transcript;}
    const lt=document.getElementById('liveText');if(lt)lt.textContent=final||interim;
    if(final){recognition.stop();processSpeech(final);}
  };
  recognition.onerror=(e)=>{
    isRecording=false;resetMicBtn();
    const m={'not-allowed':'Mic tidak dibenarkan. Allow akses mikrofon.','no-speech':'Tiada suara. Cuba lagi.','network':'Ralat rangkaian.'};
    setStatus('','⚠ '+(m[e.error]||'Ralat: '+e.error));
  };
  recognition.onend=()=>{isRecording=false;};
  recognition.start();
}
function stopRec(){
  if(recognition)recognition.stop();isRecording=false;
  const lt=document.getElementById('liveText');
  const text=lt?lt.textContent:'';
  if(text&&text.trim().length>1)processSpeech(text);else resetMicBtn();
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
  const prompt=`Anda pengurus latihan debt collection. Analisis perbualan ini dan berikan markah dalam Bahasa Malaysia.\n\nPerbualan:\n${transcript}\n\nSenario: ${scenario?scenario.title:''} — ${scenario?scenario.desc:''}\nMasa: ${duration}\n\nJawab JSON SAHAJA tanpa markdown:\n{"totalScore":<0-100>,"communication":<0-25>,"empathy":<0-25>,"compliance":<0-25>,"effectiveness":<0-25>,"feedback":"<2-3 ayat maklum balas>"}`;
  try{
    const res=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:400,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const r=JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim());
    const sessionData={
      id:'sess_'+Date.now(),collectorId:currentUser.id,scenarioId:scenario?scenario.id:'',
      scenarioName:scenario?scenario.title:'',duration,date:new Date().toISOString(),
      totalScore:r.totalScore,communication:r.communication,empathy:r.empathy,
      compliance:r.compliance,effectiveness:r.effectiveness,feedback:r.feedback,transcript:callHistory
    };
    DB.addSession(sessionData);
    window._lastScore={...sessionData};
    navigate('score');
  }catch(e){
    window._lastScore={totalScore:0,communication:0,empathy:0,compliance:0,effectiveness:0,feedback:'Tidak dapat menganalisis sesi ini.',scenarioName:scenario?scenario.title:'',duration,transcript:callHistory};
    navigate('score');
  }
}

// ═══════════ MODAL ═══════════
function openModal(html){document.getElementById('modalBox').innerHTML=html;document.getElementById('modalOverlay').classList.add('open');}
function closeModal(e){if(!e||e.target===document.getElementById('modalOverlay'))document.getElementById('modalOverlay').classList.remove('open');}

// ═══════════ UTILS ═══════════
function setContent(html){document.getElementById('mainContent').innerHTML=html;}
