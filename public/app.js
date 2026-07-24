// ═══════════ DATABASE (localStorage — kosong sekarang, semua dah pindah ke Supabase) ═══════════
// SECURITY: escape user-controlled text sebelum masuk dalam innerHTML —
// elak stored XSS (cth nama collector/scenario yang mengandungi HTML/script
// akan ter-execute bila dashboard render). Guna kat semua free-text field
// yang datang dari input manusia (nama, tajuk scenario, feedback, quote).
function esc(str){
  if(str===null||str===undefined)return'';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Helper: inject x-session-token header untuk semua API calls yang perlu auth.
// /api/auth/* (login, register, session) dikecualikan — tu memang pre-login.
// SEKURITI: ni signed token (dari login response), BUKAN employee ID mentah —
// lihat lib/session.js untuk sebab. localStorage key pun dah tukar nama
// (ct_session_token, dulu ct_session_id) supaya senang nampak beza dia.
function authHeaders(extra) {
  const token = localStorage.getItem('ct_session_token') || '';
  return { 'Content-Type': 'application/json', 'x-session-token': token, ...extra };
}

// ═══════════ Emoji picker (dikongsi: Messages + Discussion compose box) ═══════════
// Ringkas & tanpa dependency luar — satu grid emoji biasa, klik untuk selit
// ke dalam textarea/input yang mana satu dibuka picker ni (targetId).
const EMOJI_QUICK_LIST=['😀','😂','😊','😍','🥲','😢','😡','👍','👎','🙏','🎉','🔥','💯','✅','❌','📌','⏰','💬','👏','🙌','😅','🤔','😴','🚀','💰','📞','📅','⚠️','❤️','😮'];

function emojiBtnHTML(targetId){
  return `<button type="button" id="emojiBtn-${targetId}" class="btn btn-secondary" style="padding:6px 10px;font-size:14px;line-height:1" onclick="event.stopPropagation();toggleEmojiPicker('${targetId}')" title="Emoji">😊</button>`;
}
function toggleEmojiPicker(targetId){
  const existing=document.getElementById('emojiPopover');
  if(existing){
    const wasSameTarget=existing.dataset.target===targetId;
    existing.remove();
    document.removeEventListener('click',_closeEmojiOnOutside);
    if(wasSameTarget)return; // toggle off — dah cukup
  }
  const btn=document.getElementById('emojiBtn-'+targetId);
  if(!btn)return;
  const pop=document.createElement('div');
  pop.id='emojiPopover';
  pop.dataset.target=targetId;
  pop.style.cssText='position:fixed;z-index:1000;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;box-shadow:var(--shadow-lg);max-width:272px';
  pop.innerHTML=EMOJI_QUICK_LIST.map(e=>`<span style="cursor:pointer;font-size:18px;text-align:center;padding:3px;border-radius:6px" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''" onclick="insertEmoji('${targetId}','${e}')">${e}</span>`).join('');
  document.body.appendChild(pop);
  const rect=btn.getBoundingClientRect();
  const top=Math.min(rect.bottom+4,window.innerHeight-220);
  const left=Math.min(rect.left,window.innerWidth-280);
  pop.style.top=top+'px';
  pop.style.left=Math.max(8,left)+'px';
  setTimeout(()=>document.addEventListener('click',_closeEmojiOnOutside),0);
}
function _closeEmojiOnOutside(e){
  const pop=document.getElementById('emojiPopover');
  if(pop&&!pop.contains(e.target)&&!e.target.closest('[id^="emojiBtn-"]')){
    pop.remove();
    document.removeEventListener('click',_closeEmojiOnOutside);
  }
}
function insertEmoji(targetId,emoji){
  const el=document.getElementById(targetId);
  if(el){
    const start=el.selectionStart??el.value.length;
    const end=el.selectionEnd??el.value.length;
    el.value=el.value.slice(0,start)+emoji+el.value.slice(end);
    el.focus();
    el.selectionStart=el.selectionEnd=start+emoji.length;
  }
  const pop=document.getElementById('emojiPopover');
  if(pop)pop.remove();
  document.removeEventListener('click',_closeEmojiOnOutside);
}

// ═══════════ Lampiran/Attachment (dikongsi: Messages + Discussion) ═══════════
// Fail dipilih disimpan sementara dalam _pendingAttachments[targetId] (client
// memory sahaja) sehingga user hantar mesej/post — barulah upload sebenar
// jalan (uploadPendingAttachment), supaya fail tak "orphan" dalam Storage
// kalau user pilih fail tapi tak jadi hantar. Lampiran automatik dipadam
// server-side selepas 48 jam (lihat lib/attachments.js + cron job) — tujuan
// nya elak Storage/system jadi berat sebab lampiran lama bertimbun.
const ATTACHMENT_MAX_MB=10;
const ATTACHMENT_ALLOWED_TYPES=['image/jpeg','image/png','image/gif','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'];
const _pendingAttachments={};

function attachBtnHTML(targetId){
  return `<button type="button" class="btn btn-secondary" style="padding:6px 10px;font-size:14px;line-height:1" onclick="document.getElementById('file-${targetId}').click()" title="Lampirkan fail (max ${ATTACHMENT_MAX_MB}MB, auto-padam 48j)">📎</button><input type="file" id="file-${targetId}" style="display:none" onchange="handleAttachmentPick('${targetId}',this)" />`;
}
function attachPreviewHTML(targetId){
  return `<div id="attachPreview-${targetId}" style="font-size:11px;color:var(--text3);margin-top:4px"></div>`;
}
function handleAttachmentPick(targetId,inputEl){
  const file=inputEl.files&&inputEl.files[0];
  if(!file)return;
  if(file.size>ATTACHMENT_MAX_MB*1024*1024){
    alert(`Fail terlalu besar (max ${ATTACHMENT_MAX_MB}MB).`);
    inputEl.value='';
    return;
  }
  if(!ATTACHMENT_ALLOWED_TYPES.includes(file.type)){
    alert('Jenis fail tidak disokong. Guna imej, PDF, Word, Excel atau teks (.txt).');
    inputEl.value='';
    return;
  }
  _pendingAttachments[targetId]=file;
  const prev=document.getElementById('attachPreview-'+targetId);
  if(prev)prev.innerHTML=`📎 ${esc(file.name)} (${(file.size/1024).toFixed(0)}KB) — auto-padam lepas 48j <a href="#" onclick="event.preventDefault();clearAttachment('${targetId}')" style="color:var(--red);font-weight:600">✕ Buang</a>`;
}
function clearAttachment(targetId){
  delete _pendingAttachments[targetId];
  const inputEl=document.getElementById('file-'+targetId);
  if(inputEl)inputEl.value='';
  const prev=document.getElementById('attachPreview-'+targetId);
  if(prev)prev.innerHTML='';
}
// Upload fail (kalau ada) untuk targetId ni, return {path,name,type,size} atau
// null kalau tiada fail dipilih. Throws kalau upload gagal — caller patut
// tunjuk error tu dan JANGAN teruskan hantar mesej/post (elak "separuh jalan").
async function uploadPendingAttachment(targetId){
  const file=_pendingAttachments[targetId];
  if(!file)return null;
  const fd=new FormData();
  fd.append('file',file);
  const token=localStorage.getItem('ct_session_token')||'';
  const res=await fetch('/api/attachments',{method:'POST',headers:{'x-session-token':token},body:fd});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'Gagal muat naik lampiran.');
  clearAttachment(targetId);
  return data.attachment;
}
// Papar satu lampiran (dari row API — attachmentUrl/Name/Type/Size) dalam
// mesej/post. Imej papar sebagai thumbnail klik-untuk-besar; jenis lain
// papar sebagai chip fail dengan link download. null kalau tiada lampiran
// ATAU lampiran dah dipurge (>48 jam, attachmentUrl jadi null di server).
function attachmentHTML(m){
  if(!m||!m.attachmentUrl)return'';
  const isImage=(m.attachmentType||'').startsWith('image/');
  const sizeKb=m.attachmentSize?(m.attachmentSize/1024).toFixed(0)+'KB':'';
  if(isImage){
    return `<div style="margin-top:6px"><a href="${esc(m.attachmentUrl)}" target="_blank" rel="noopener"><img src="${esc(m.attachmentUrl)}" alt="${esc(m.attachmentName||'lampiran')}" style="max-width:220px;max-height:220px;border-radius:8px;display:block" /></a></div>`;
  }
  return `<div style="margin-top:6px"><a href="${esc(m.attachmentUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;color:var(--text2)">📎 ${esc(m.attachmentName||'Lampiran')} ${sizeKb?`<span style="color:var(--text3)">(${sizeKb})</span>`:''}</a></div>`;
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
    if(!res.ok)throw new Error(data.error||'Failed to load scenarios.');
    return data.scenarios||[];
  },
  async save(scenario){
    const res=await fetch('/api/scenarios',{method:'POST',headers:authHeaders(),body:JSON.stringify(scenario)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to save scenario.');
    return data.scenario;
  },
  async remove(id){
    const res=await fetch('/api/scenarios',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to delete scenario.');
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
    if(!res.ok)throw new Error(data.error||'Failed to load training sessions.');
    return data.sessions||[];
  },
  // PERFORMANCE: list() sengaja tak bawa `transcript` (boleh besar per sesi).
  // getById() tarik SATU sesi sahaja, penuh dengan transcript — dipanggil
  // bila user betul-betul buka detail sesi tu (viewSession), bukan setiap
  // kali dashboard/list di-load.
  async getById(id){
    const res=await fetch('/api/sessions?id='+encodeURIComponent(id),{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load session detail.');
    return data.session;
  },
  async create(sessionData){
    const res=await fetch('/api/sessions',{method:'POST',headers:authHeaders(),body:JSON.stringify(sessionData)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to save training session.');
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
  banner.innerHTML=`⏳ <span>${pending.length} session(s) not yet saved — will retry...</span> <button onclick="retryPendingSessions()" style="background:#fff;color:#854F0B;border:none;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;font-weight:600">Try Now</button>`;
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
        banner.innerHTML='✅ All sessions saved successfully!';
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
    if(!res.ok)throw new Error(data.error||'Failed to load user list.');
    return data.users||[];
  },
  async remove(id){
    const res=await fetch('/api/users',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to delete user.');
    return true;
  },
  async login(id,pass){
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,pass})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to sign in.');
    return data; // { user, token }
  },
  async register(id,name,pass){
    const res=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,pass})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to register user.');
    return data.user;
  },
  async session(token){
    const res=await fetch('/api/auth/session?token='+encodeURIComponent(token));
    const data=await res.json();
    if(!res.ok)return null;
    return data.user;
  },
  async approve(id){
    const res=await fetch('/api/users',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({id,is_approved:true})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to approve user.');
    return data.user;
  },
  async reject(id){
    const res=await fetch('/api/users',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({id,is_approved:false})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to reject user.');
    return data.user;
  },
  async setLimit(id,maxSessionsPerDay){
    const res=await fetch('/api/users',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({id,max_sessions_per_day:maxSessionsPerDay})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to update session limit.');
    return data.user;
  },
  async setRole(id,role){
    const res=await fetch('/api/users',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({id,role})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to update role.');
    return data.user;
  },
  async resetPassword(id,newPass){
    const res=await fetch('/api/auth/reset-password',{method:'POST',headers:authHeaders(),body:JSON.stringify({id,newPass})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to reset password.');
    return true;
  }
};
let usersCache=null;
async function loadUsers(force){
  if(usersCache&&!force)return usersCache;
  usersCache=await userApi.list();
  return usersCache;
}
function findUserById(usersArr,id){return (usersArr||[]).find(u=>u.id===id);}

// ── Manager-assigned mandatory scenarios ────────────────────────────────
const assignmentApi = {
  async list(){
    const res=await fetch('/api/assignments',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load assignments.');
    return data.assignments||[];
  },
  async create(collectorId,scenarioId,scenarioName,dueDate){
    const res=await fetch('/api/assignments',{method:'POST',headers:authHeaders(),body:JSON.stringify({collectorId,scenarioId,scenarioName,dueDate})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to create assignment.');
    return data.assignment;
  },
  async remove(id){
    const res=await fetch('/api/assignments',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to cancel assignment.');
    return true;
  }
};
let assignmentsCache=null;
async function loadAssignments(force){
  if(assignmentsCache&&!force)return assignmentsCache;
  assignmentsCache=await assignmentApi.list();
  return assignmentsCache;
}
// PERMINTAAN: tunjuk waktu (bukan tarikh sahaja) untuk setiap sesi latihan —
// senang semak kalau ada beberapa sesi pada hari yang sama (cth nak confirm
// sesi mana dah betul-betul masuk Supabase semasa testing/audit).
function fmtDateTime(d){
  if(!d)return '-';
  const dt=new Date(d);
  return dt.toLocaleDateString('en-MY')+' '+dt.toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'});
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
  return {tone:'Tone',delivery:'Delivery',counter:'Counter Argument',action:'Action & Compliance',balance:'Balance Strategy'}[cat]||cat;
}
function catIcon(cat){
  return {tone:'🗣',delivery:'📣',counter:'🛡',action:'✅',balance:'⚖️'}[cat]||'•';
}

// ═══════════ TAG SENARIO: Customer Type & Objection Type (Fasa 1 quick win) ═══════════
// Dua dimensi diasingkan sengaja — lihat nota penuh dalam supabase/schema.sql:
//   customerType  = segmen akaun (suspended/terminated/restructured/other)
//   objectionType = corak tingkah laku semasa call (cooperative/denial/hardship/aggressive/avoidance)
const CUSTOMER_TYPES=['suspended','terminated','restructured','other'];
const OBJECTION_TYPES=['cooperative','denial','hardship','aggressive','avoidance'];
function customerTypeLabel(t){
  return {suspended:'Suspended',terminated:'Terminated',restructured:'Restructured',other:'Other/Tidak Pasti'}[t]||t||'-';
}
function objectionTypeLabel(t){
  return {cooperative:'Cooperative',denial:'Denial / Dispute',hardship:'Financial Hardship',aggressive:'Aggressive',avoidance:'Avoidance / Ghosting'}[t]||t||'-';
}
function objectionTypeIcon(t){
  return {cooperative:'😊',denial:'😤',hardship:'😔',aggressive:'😡',avoidance:'🙈'}[t]||'•';
}
// Cross-tab: untuk setiap objection_type, kira purata score + kategori
// skill paling kerap missed — jawapan kepada "collector/team lemah skill
// X bila lawan jenis penghutang Y", bukan sekadar skill lemah global
// macam tallyWeakness() (yang buta kepada jenis penghutang).
function weaknessByObjectionType(sessions){
  const groups={};
  sessions.forEach(s=>{
    const ot=s.objectionType||'unknown';
    if(!groups[ot])groups[ot]={count:0,scoreSum:0,catTally:{}};
    groups[ot].count++;
    groups[ot].scoreSum+=(s.totalScore||0);
    (s.missed||[]).forEach(m=>{groups[ot].catTally[m.category]=(groups[ot].catTally[m.category]||0)+1;});
  });
  return Object.entries(groups).map(([ot,g])=>{
    const topCat=Object.entries(g.catTally).sort((a,b)=>b[1]-a[1])[0];
    return {
      objectionType:ot,
      count:g.count,
      avgScore:g.count?Math.round(g.scoreSum/g.count):0,
      topWeakCat:topCat?topCat[0]:null,
      topWeakCount:topCat?topCat[1]:0
    };
  }).sort((a,b)=>a.avgScore-b.avgScore); // lemah (avg score rendah) dahulu
}

// Cross-tab Compliance Risk × Debtor Type — untuk kenal pasti jenis penghutang
// (cth "aggressive", "denial") mana yang paling kerap trigger isu compliance/
// harassment, supaya coaching boleh fokus situasi yang berisiko, bukan cuma
// skor am. Juga pecahkan ikut collector untuk setiap jenis (siapa punya isu).
function complianceByObjectionType(sessions){
  const groups={};
  sessions.forEach(s=>{
    const ot=s.objectionType||'unknown';
    if(!groups[ot])groups[ot]={count:0,flagged:0,high:0,medium:0,low:0,byCollector:{}};
    groups[ot].count++;
    if(s.harassmentRisk&&s.harassmentRisk!=='none'){
      groups[ot].flagged++;
      groups[ot][s.harassmentRisk]=(groups[ot][s.harassmentRisk]||0)+1;
      groups[ot].byCollector[s.collectorId]=(groups[ot].byCollector[s.collectorId]||0)+1;
    }
  });
  return Object.entries(groups)
    .map(([ot,g])=>({
      objectionType:ot,
      count:g.count,
      flagged:g.flagged,
      high:g.high,medium:g.medium,low:g.low,
      pct:g.count?Math.round(g.flagged/g.count*100):0,
      topCollectors:Object.entries(g.byCollector).sort((a,b)=>b[1]-a[1])
    }))
    .filter(g=>g.flagged>0)
    .sort((a,b)=>b.pct-a.pct); // paling berisiko dahulu
}
// Scenario effectiveness: banding avg score tempoh SEMASA vs tempoh SEBELUM
// (guna periodSessions/prevPeriodSessions yang sama dengan filter "Hari Ini/
// Bulan Ini/Tahun Ini" kat atas dashboard) — jawapan kepada "training jenis
// ni betul-betul beri kesan/improve, atau stagnant?"
function trendForObjectionType(periodSessions,prevPeriodSessions,ot){
  const cur=periodSessions.filter(s=>(s.objectionType||'unknown')===ot);
  const prev=prevPeriodSessions.filter(s=>(s.objectionType||'unknown')===ot);
  if(!cur.length||!prev.length)return{icon:'—',color:'var(--text3)',label:'tiada data tempoh lepas'};
  const curAvg=Math.round(cur.reduce((a,s)=>a+(s.totalScore||0),0)/cur.length);
  const prevAvg=Math.round(prev.reduce((a,s)=>a+(s.totalScore||0),0)/prev.length);
  const diff=curAvg-prevAvg;
  if(diff>=5)return{icon:'▲',color:'var(--green)',label:`+${diff} vs previous period`};
  if(diff<=-5)return{icon:'▼',color:'var(--red)',label:`${diff} vs previous period`};
  return{icon:'→',color:'var(--amber)',label:`${diff>=0?'+':''}${diff} vs previous period`};
}
// Sokong sesi lama (format communication/empathy/compliance/effectiveness) & sesi baru (format scores{})
function scoreRows(s){
  if(s.scores){
    return SCORE_CATS.map(c=>[catLabel(c),s.scores[c]||0,(s.scoreMax&&s.scoreMax[c])||20,c,(s.scoreReasons&&s.scoreReasons[c])||'']);
  }
  return [['Komunikasi',s.communication||0,25],['Empati',s.empathy||0,25],['Pematuhan',s.compliance||0,25],['Keberkesanan',s.effectiveness||0,25]];
}
function harassmentBadge(risk){
  if(!risk||risk==='none')return '';
  const map={low:{label:'Low Risk',cls:'chip-amber'},medium:{label:'Medium Risk',cls:'chip-amber'},high:{label:'High Risk',cls:'chip-red'}};
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
  return {category:lowestCat,tip:match?match.suggestion:('Focus on improving the '+catLabel(lowestCat)+' aspect in future training.')};
}

// ═══════════ STATE ═══════════
let currentUser=null, currentPage='';

// Filter state untuk page "Training Sessions" (manager/admin) & "My Records" (collector).
// Disimpan di sini (bukan dalam form je) supaya filter tak hilang bila page
// di-render semula (contoh: lepas tutup modal "Lihat" sesi).
let sessionsFilter={collectorId:'',scenario:'',objectionType:'',skor:'',dateFrom:'',dateTo:''};
let myHistoryFilter={scenario:'',objectionType:'',skor:'',dateFrom:'',dateTo:''};

// PAGINATION — senarai sesi boleh sampai 100+ rekod, elak list semua sekali
// (lambat & sukar nak scroll). Papar ikut "muka surat" dengan butang Sebelum/Next.
const SESSIONS_PAGE_SIZE=20;
let sessionsPage=1;     // muka surat semasa — "Training Sessions" (admin/manager)
let myHistoryPage=1;    // muka surat semasa — "My Records" (collector)

// Render bar "Muka X dari Y" + butang Sebelum/Next. `onPageChange` ialah nama
// fungsi JS (string) yang dipanggil bila tukar muka surat, cth "goSessionsPage".
function paginationBar(currentPage,totalItems,pageSize,onPageChange){
  const totalPages=Math.max(1,Math.ceil(totalItems/pageSize));
  if(totalPages<=1)return'';
  return`
  <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 0 4px">
    <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" ${currentPage<=1?'disabled':''} onclick="${onPageChange}(${currentPage-1})">‹ Previous</button>
    <span style="font-size:12px;color:var(--text3)">Muka ${currentPage} dari ${totalPages}</span>
    <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" ${currentPage>=totalPages?'disabled':''} onclick="${onPageChange}(${currentPage+1})">Next ›</button>
  </div>`;
}
function goSessionsPage(p){sessionsPage=p;renderSessions();}
function goMyHistoryPage(p){myHistoryPage=p;renderMyHistory();}

// BUGFIX (dashboard/weekly date lari): jangan guna `Date.toISOString().slice(0,10)`
// untuk dapatkan "tarikh hari ini" — toISOString() bagi tarikh dalam UTC, bukan
// waktu tempatan (Malaysia = UTC+8). Sesi yang dibuat lepas tengah malam tapi
// sebelum pukul 8 pagi (waktu Malaysia) akan tersilap kira sebagai "semalam"
// sebab tarikh UTC dia masih hari sebelumnya. Guna localISODate() sebagai ganti
// — ambil Y/M/D dari waktu tempatan browser, bukan UTC.
function localISODate(d){
  d=d||new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Semak sama ada satu ISO timestamp (cth dari s.date, yang disimpan dalam UTC)
// jatuh pada tarikh tempatan yang sama macam `localDateStr` (default hari ini).
// Guna ni gantikan corak lama `s.date.startsWith(todayStr)` yang silap banding
// tarikh UTC dengan tarikh UTC — sepatutnya banding tarikh TEMPATAN dgn tempatan.
function isLocalDate(isoString,localDateStr){
  if(!isoString)return false;
  return localISODate(new Date(isoString))===(localDateStr||localISODate());
}

// Filter dashboard "Hari Ini / Bulan Ini / Tahun Ini / Semua" — supaya admin/manager
// senang nak tengok prestasi ikut tempoh tertentu tanpa kira manual dari senarai penuh.
let dashboardPeriod='all';
// Custom range state — dipakai bila dashboardPeriod==='custom'. Disimpan sebagai
// string 'YYYY-MM-DD' (terus dari <input type=date>) supaya senang nak bind balik ke input.
let dashboardCustomFrom='';
let dashboardCustomTo='';
// Row yang tengah expand kat "Weekly Trend Per Collector" — klik nama collector
// untuk breakdown ikut minggu (dalam bulan yang dipilih), lepas tu ikut hari.
let expandedTrendCollectorId=null;
// Bulan yang tengah dipapar kat Weekly Trend — supaya trend ikut bulan kalendar
// (bukan "4 minggu bergolek" yang boleh merentas 2 bulan & jadi mengelirukan
// bila tukar bulan, cth Jun→Julai atau lagi teruk bila sampai Disember).
let dashboardTrendMonth=null; // Date (1hb bulan tu) — di-set ke bulan semasa kali pertama render
// Minggu (dalam bulan yang dipilih) yang tengah expand untuk satu collector —
// key: `${collectorId}__${weekIndex}` — untuk breakdown hari dalam minggu tu.
let expandedTrendWeekKey=null;
function toggleTrendRow(collectorId){
  expandedTrendCollectorId=(expandedTrendCollectorId===collectorId)?null:collectorId;
  expandedTrendWeekKey=null;
  renderDashboard();
}
function toggleTrendWeek(collectorId,weekIdx){
  const key=`${collectorId}__${weekIdx}`;
  expandedTrendWeekKey=(expandedTrendWeekKey===key)?null:key;
  renderDashboard();
}
function shiftTrendMonth(delta){
  const d=new Date(dashboardTrendMonth);
  d.setMonth(d.getMonth()+delta);
  dashboardTrendMonth=new Date(d.getFullYear(),d.getMonth(),1);
  expandedTrendCollectorId=null;
  expandedTrendWeekKey=null;
  renderDashboard();
}
function resetTrendMonth(){
  const now=new Date();
  dashboardTrendMonth=new Date(now.getFullYear(),now.getMonth(),1);
  expandedTrendCollectorId=null;
  expandedTrendWeekKey=null;
  renderDashboard();
}
// ── Export Coaching Memo ────────────────────────────────────────────────
// Jana memo HTML yang kemas (boleh dibuka terus, atau print → Save as PDF
// dari browser) merangkumi prestasi keseluruhan, aspek paling kerap silap,
// dan sesi terkini seorang collector. Tak guna library luar (PDF generator)
// sebab app ni single-file — HTML print-friendly cukup untuk kegunaan
// coaching 1-on-1 dan senang share/print.
// ── Export Sessions CSV (bulk) ──────────────────────────────────────────
// Export SEMUA sesi yang match filter semasa kat halaman Sessions (bukan
// cuma satu muka surat) — untuk reporting bulanan ke management/luar sistem
// tanpa perlu salin manual dari table.
function toCSVField(v){
  const s=String(v??'');
  if(/[",\n\r]/.test(s))return'"'+s.replace(/"/g,'""')+'"';
  return s;
}
async function exportCurrentSessionsCSV(){
  const allSessions=(await loadSessions()).slice().reverse();
  const users=await loadUsers();
  const sessions=applySessionFilters(allSessions,sessionsFilter);
  if(!sessions.length){alert('Tiada data untuk export — cuba longgarkan filter.');return;}
  const headers=['Date','Collector ID','Collector Name','Scenario','Debtor Type','Duration','Score','Harassment Risk','Compliance Note'];
  const rows=sessions.map(s=>{
    const u=findUserById(users,s.collectorId);
    return[
      fmtDateTime(s.date),
      s.collectorId,
      u?u.name:'',
      s.scenarioName,
      s.objectionType?objectionTypeLabel(s.objectionType):'',
      s.duration,
      s.totalScore,
      s.harassmentRisk&&s.harassmentRisk!=='none'?s.harassmentRisk:'',
      s.harassmentNote||''
    ].map(toCSVField).join(',');
  });
  // \uFEFF (BOM) — supaya Excel baca UTF-8 betul (elak nama/emoji jadi ????)
  const csv='\uFEFF'+[headers.join(','),...rows].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`sessions-export-${localISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportCollectorsSummaryCSV(){
  const users=await loadUsers();
  const sessions=await loadSessions();
  const collectors=users.filter(u=>u.role==='collector');
  if(!collectors.length){alert('Tiada collector untuk export.');return;}
  const headers=['Name','Employee ID','Total Sessions','Average Score','Highest Score','Weak Aspect','Weakest Debtor Type','Harassment Flags','Last Session'];
  const rows=collectors.map(c=>{
    const cs=sessions.filter(s=>s.collectorId===c.id);
    const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):'';
    const best=cs.length?Math.max(...cs.map(s=>s.totalScore)):'';
    const last=cs.length?cs[cs.length-1]:null;
    const weakLabel=cs.length?topWeaknessLabel(cs):'';
    const csWeakTypes=weaknessByObjectionType(cs).filter(g=>g.count>=2);
    const weakType=csWeakTypes.length?objectionTypeLabel(csWeakTypes[0].objectionType):'';
    const harassCount=cs.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none').length;
    return[c.name,c.id,cs.length,avg,best,weakLabel==='-'?'':weakLabel,weakType,harassCount,last?fmtDateTime(last.date):'']
      .map(toCSVField).join(',');
  });
  const csv='\uFEFF'+[headers.join(','),...rows].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`collectors-summary-${localISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportCoachingMemo(collectorId){
  const [users,allSessions]=await Promise.all([loadUsers(),loadSessions()]);
  const c=findUserById(users,collectorId);
  if(!c){alert('Collector tidak dijumpai.');return;}
  const cs=allSessions.filter(s=>s.collectorId===collectorId);
  if(!cs.length){alert('Tiada data sesi untuk collector ini — belum boleh jana memo.');return;}

  const overallAvg=Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length);
  const weakTally=tallyWeakness(cs);
  const top3=weakTally.slice(0,3);
  const recent=cs.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  const generatedAt=new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const pillClass=v=>v>=70?'high':v>=50?'mid':'low';
  const eh=str=>String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Coaching Memo — ${eh(c.name)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1a;line-height:1.6;padding:0 20px}
  h1{font-size:22px;border-bottom:3px solid #7C3AED;padding-bottom:12px;margin-bottom:4px}
  h2{font-size:14px;color:#7C3AED;margin-top:28px;text-transform:uppercase;letter-spacing:0.04em}
  .meta{color:#666;font-size:13px;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e5e5;font-size:13px}
  th{background:#f5f6fa;font-size:11px;text-transform:uppercase;color:#666}
  .pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:700}
  .high{background:#DCFCE7;color:#166534}.mid{background:#FEF3C7;color:#92400E}.low{background:#FEE2E2;color:#991B1B}
  .note{margin-top:36px;color:#999;font-size:11px;border-top:1px solid #eee;padding-top:12px}
  @media print{body{margin:10px}.note{display:none}}
</style></head><body>
  <h1>📋 Coaching Memo — ${eh(c.name)}</h1>
  <div class="meta">Dijana: ${generatedAt} · Employee ID: ${eh(c.id)} · Berdasarkan ${cs.length} sesi latihan keseluruhan</div>

  <h2>Ringkasan Prestasi</h2>
  <p>Skor purata keseluruhan: <span class="pill ${pillClass(overallAvg)}">${overallAvg}/100</span></p>

  <h2>Aspek Paling Kerap Tersilap</h2>
  ${top3.length?`<table><tr><th>Aspek</th><th>Bilangan Dikesan</th></tr>
  ${top3.map(([cat,count])=>`<tr><td>${eh(catIcon(cat))} ${eh(catLabel(cat))}</td><td>${count}x</td></tr>`).join('')}
  </table>`:`<p style="color:#666;font-size:13px">Tiada isu ketara dikesan setakat ini.</p>`}

  <h2>Sesi Terkini (5 terakhir)</h2>
  <table><tr><th>Tarikh</th><th>Scenario</th><th>Skor</th></tr>
  ${recent.map(s=>`<tr><td>${eh(fmtDateTime(s.date))}</td><td>${eh(s.scenarioName)}</td><td><span class="pill ${pillClass(s.totalScore)}">${s.totalScore}</span></td></tr>`).join('')}
  </table>

  <h2>Cadangan Coaching</h2>
  <p style="font-size:13px">${top3.length?`Fokuskan sesi coaching akan datang pada aspek <strong>${eh(catLabel(top3[0][0]))}</strong> — ini yang paling kerap tersilap (${top3[0][1]}x dikesan).`:'Prestasi stabil, tiada isu ketara — teruskan latihan berkala untuk kekalkan konsistensi.'}</p>

  <div class="note">Dijana secara automatik oleh CollectorTrain. Untuk simpan sebagai PDF: buka fail ni dalam browser → Ctrl+P (atau Cmd+P) → "Save as PDF".</div>
</body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`coaching-memo-${c.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${localISODate()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function viewCollectorSessions(collectorId,dateFrom,dateTo){
  sessionsFilter={collectorId,scenario:'',objectionType:'',skor:'',dateFrom:dateFrom||'',dateTo:dateTo||''};
  sessionsPage=1;
  navigate('sessions');
}
// Category yang tengah expand kat "Most Frequently Missed Aspects" — klik untuk
// tengok collector mana yang paling banyak buat silap kategori tu ("siapa punya silap").
let expandedWeaknessCat=null;
function toggleWeaknessCat(cat){
  expandedWeaknessCat=(expandedWeaknessCat===cat)?null:cat;
  renderDashboard();
}
// Pecahan ikut collector untuk satu kategori weakness — untuk jawab "siapa yang
// paling banyak buat silap ni" bila manager klik kat kategori tu.
function weaknessByCollector(sessions,category,users){
  const tally={};
  sessions.forEach(s=>(s.missed||[]).forEach(m=>{
    if(m.category===category)tally[s.collectorId]=(tally[s.collectorId]||0)+1;
  }));
  return Object.entries(tally).map(([id,count])=>({
    id,name:(findUserById(users,id)||{}).name||id,count
  })).sort((a,b)=>b.count-a.count);
}
// Row yang tengah expand kat "Compliance Risk × Debtor Type" — klik untuk
// tengok collector mana yang paling banyak isu compliance untuk jenis tu.
let expandedComplianceOT=null;
function toggleComplianceOT(ot){
  expandedComplianceOT=(expandedComplianceOT===ot)?null:ot;
  renderDashboard();
}
// Row yang tengah expand kat "All Collectors" — klik nama untuk preview
// sesi terkini collector tu terus dalam table, tak payah pindah page.
let expandedCollectorRow=null;
function toggleCollectorRow(id){
  expandedCollectorRow=(expandedCollectorRow===id)?null:id;
  renderCollectors();
}
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
  if(period==='custom'){
    if(!dashboardCustomFrom||!dashboardCustomTo)return null; // belum lengkap pilih — anggap macam 'all'
    const start=new Date(dashboardCustomFrom+'T00:00:00');
    const end=new Date(dashboardCustomTo+'T00:00:00');end.setDate(end.getDate()+1); // inclusive sampai hujung hari 'to'
    return{start,end};
  }
  return null; // 'all' — tiada had tarikh
}
// Tempoh SEBELUM tempoh semasa (sama jenis) — untuk kira trend ▲▼ vs previous period
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
  if(period==='custom'){
    const r=getPeriodRange('custom');
    if(!r)return null;
    const days=Math.round((r.end-r.start)/86400000);
    const start=new Date(r.start);start.setDate(start.getDate()-days);
    const end=new Date(r.start);
    return{start,end};
  }
  return null;
}
function filterSessionsByRange(sessions,range){
  if(!range)return sessions;
  return sessions.filter(s=>{const d=new Date(s.date);return d>=range.start&&d<range.end;});
}
function periodLabel(period){
  if(period==='custom'){
    if(!dashboardCustomFrom||!dashboardCustomTo)return 'Custom Range';
    return `${dashboardCustomFrom} → ${dashboardCustomTo}`;
  }
  return{day:'Today',month:'This Month',year:'This Year'}[period]||'All Time';
}
function setDashboardPeriod(p){dashboardPeriod=p;renderDashboard();}
function setDashboardCustomFrom(v){dashboardCustomFrom=v;if(dashboardPeriod==='custom')renderDashboard();}
function setDashboardCustomTo(v){dashboardCustomTo=v;if(dashboardPeriod==='custom')renderDashboard();}

// Tapis array sesi berdasarkan satu set filter (dipakai oleh renderSessions
// & renderMyHistory — logik sama, beza saja sumber filter & ada/tiada collectorId).
function applySessionFilters(sessions,f){
  return sessions.filter(s=>{
    if(f.collectorId&&s.collectorId!==f.collectorId)return false;
    if(f.scenario&&s.scenarioName!==f.scenario)return false;
    if(f.objectionType&&s.objectionType!==f.objectionType)return false;
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

// ─── TEMP PERF INSTRUMENTATION (buang lepas confirm bottleneck) ───────────────
// Satu giliran (turn) = lepas user lepas mic sampai audio pertama betul2 main.
// Setiap stage log elapsed ms drpd turnStart, supaya breakdown jelas kat console.
let _perfTurnStart=0, _perfFirstAudio=false;
function perfStart(){ _perfTurnStart=performance.now(); _perfFirstAudio=false; console.log('%c[PERF] ── turn start (mic released) ──','color:#888'); }
function perfMark(label){
  if(!_perfTurnStart)return;
  const ms=Math.round(performance.now()-_perfTurnStart);
  console.log(`%c[PERF] ${label}: +${ms}ms`,'color:#0a8;font-weight:bold');
}
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
  if(!id||!pass){showAlert('loginAlert','Please fill in all fields.','err');return;}
  const btn=document.querySelector('#loginForm .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Signing in...';}
  try{
    const {user,token}=await userApi.login(id,pass);
    currentUser=user;
    localStorage.setItem('ct_session_token',token); // signed token — supaya refresh page tak terus logout
    // Cache maklumat asas user — guna sebagai fallback kalau Supabase tak boleh reach masa restore sesi
    localStorage.setItem('ct_cached_user',JSON.stringify({id:user.id,name:user.name,role:user.role}));
    document.getElementById('authScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    initApp();
  }catch(e){
    showAlert('loginAlert',e.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Sign In';}
  }
}

async function doRegister(){
  const name=document.getElementById('regName').value.trim();
  const id=document.getElementById('regId').value.trim().toUpperCase();
  const pass=document.getElementById('regPass').value;
  const pass2=document.getElementById('regPass2').value;
  if(!name||!id||!pass){showAlert('regAlert','Please fill in all required fields.','err');return;}
  if(pass.length<6){showAlert('regAlert','Password must be at least 6 characters.','err');return;}
  if(pass!==pass2){showAlert('regAlert','Passwords do not match.','err');return;}
  const btn=document.querySelector('#registerForm .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Registering...';}
  try{
    await userApi.register(id,name,pass);
    showAlert('regAlert','Registration successful! Your account is pending approval. Contact your manager or admin to get access.','ok');
    setTimeout(()=>{switchAuthTab('login');document.getElementById('loginId').value=id;},1500);
  }catch(e){
    showAlert('regAlert',e.message,'err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Register Account';}
  }
}

function doLogout(){
  currentUser=null;
  usersCache=null; // elak data pengguna sebelum ni terbawa kalau orang lain login di device sama
  lastNotifiedUnreadTotal=null; // reset baseline — user lain mungkin login di device sama
  localStorage.removeItem('ct_session_token');
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
  pollUnreadMessages();
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
    {page:'collectors',icon:'👥',label:'All Collectors'},
    {page:'sessions',icon:'📋',label:'Training Sessions'},
    {page:'assignments',icon:'📌',label:'Assignments'},
    {page:'leaderboard',icon:'🏆',label:'Leaderboard'},
    {page:'announcements',icon:'📢',label:'Announcements'},
    {page:'discussion',icon:'💬',label:'Discussion'},
    {page:'messages',icon:'✉️',label:'Messages'},
    {page:'scenarios',icon:'🎭',label:'Manage Scenarios'},
    {page:'users',icon:'👤',label:'Manage Users'},
    {page:'audit-log',icon:'🕵️',label:'Audit Log'},
  ];
  const items={
    collector:[
      {page:'training',icon:'🎯',label:'Voice Training'},
      {page:'leaderboard',icon:'🏆',label:'Leaderboard'},
      {page:'my-history',icon:'📊',label:'My Records'},
      {page:'announcements',icon:'📢',label:'Announcements'},
      {page:'discussion',icon:'💬',label:'Discussion'},
      {page:'messages',icon:'✉️',label:'Messages'},
    ],
    // Manager: akses penuh sama macam admin ("manager support can access all")
    manager:adminItems,
    admin:adminItems
  };
  const myItems=items[currentUser.role]||items.collector;
  nav.innerHTML=myItems.map(i=>`<div class="nav-item" id="nav-${i.page}" onclick="navigate('${i.page}')"><span class="nav-icon">${i.icon}</span>${i.label}${i.page==='messages'?' <span id="navMsgBadge" style="display:none;background:var(--red);color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:4px"></span>':''}</div>`).join('');
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
    'audit-log':renderAuditLog,
    'assignments':renderAssignments,
    'leaderboard':renderLeaderboard,
    'call':renderCallScreen,
    'score':renderScoreScreen,
    'announcements':renderAnnouncements,
    'discussion':renderDiscussion,
    'messages':renderMessages,
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
  const todaySessions=sessions.filter(s=>isLocalDate(s.date)).length;
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

  // ── Weekly aggregation (Trend widget) ───────────────────────────────────
  // Ikut BULAN KALENDAR yang dipilih (bukan "4 minggu bergolek" macam dulu —
  // tu yang buat lajur boleh merentas 2 bulan skaligus (cth Jun→Julai) dan jadi
  // makin mengelirukan bila sampai penghujung tahun/Disember). Sekarang: pilih
  // 1 bulan → tengok minggu² dalam bulan tu → klik minggu → breakdown harian.
  if(!dashboardTrendMonth){
    const now=new Date();
    dashboardTrendMonth=new Date(now.getFullYear(),now.getMonth(),1);
  }
  function pad2(n){return String(n).padStart(2,'0');}
  function getWeeksInMonth(monthDate){
    const y=monthDate.getFullYear(), m=monthDate.getMonth();
    const monthStart=new Date(y,m,1);
    const monthEnd=new Date(y,m+1,1); // exclusive
    const firstDow=monthStart.getDay()||7; // 1=Isnin..7=Ahad
    let cur=new Date(monthStart); cur.setDate(monthStart.getDate()-(firstDow-1)); // Isnin minggu pertama
    const weeks=[];
    while(cur<monthEnd){
      const start=new Date(cur);
      const end=new Date(start); end.setDate(start.getDate()+7);
      weeks.push({label:`${pad2(start.getDate())}/${pad2(start.getMonth()+1)}`,start,end});
      cur=end;
    }
    return weeks;
  }
  const WEEKS=getWeeksInMonth(dashboardTrendMonth);
  const monthLabel=dashboardTrendMonth.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const now_=new Date();
  const isCurrentMonth=dashboardTrendMonth.getFullYear()===now_.getFullYear()&&dashboardTrendMonth.getMonth()===now_.getMonth();
  const currentWeekIdx=isCurrentMonth?WEEKS.findIndex(w=>now_>=w.start&&now_<w.end):-1;

  function weeklyData(collectorId){
    const cs=sessions.filter(s=>s.collectorId===collectorId);
    return WEEKS.map(w=>{
      const ws=cs.filter(s=>{const d=new Date(s.date);return d>=w.start&&d<w.end;});
      return ws.length?Math.round(ws.reduce((a,s)=>a+s.totalScore,0)/ws.length):null;
    });
  }

  // Breakdown harian (Isnin-Ahad) untuk satu collector, dalam satu minggu tertentu
  function dailyData(collectorId,week){
    const cs=sessions.filter(s=>s.collectorId===collectorId);
    const days=[];
    for(let i=0;i<7;i++){
      const dStart=new Date(week.start); dStart.setDate(week.start.getDate()+i);
      const dEnd=new Date(dStart); dEnd.setDate(dStart.getDate()+1);
      const ds=cs.filter(s=>{const d=new Date(s.date);return d>=dStart&&d<dEnd;});
      days.push({
        date:dStart,
        dayName:dStart.toLocaleDateString('en-GB',{weekday:'short'}),
        label:`${pad2(dStart.getDate())}/${pad2(dStart.getMonth()+1)}`,
        count:ds.length,
        avg:ds.length?Math.round(ds.reduce((a,s)=>a+s.totalScore,0)/ds.length):null,
        sessions:ds.slice().reverse()
      });
    }
    return days;
  }

  // Arrow trend: bandingkan 2 minggu terkini (dalam bulan dipilih) yang ada data
  function trendArrow(wData){
    const filled=wData.filter(v=>v!==null);
    if(filled.length<2)return{icon:'—',color:'var(--text3)',label:''};
    const diff=filled[filled.length-1]-filled[filled.length-2];
    if(diff>=5)return{icon:'▲',color:'var(--green)',label:`+${diff}`};
    if(diff<=-5)return{icon:'▼',color:'var(--red)',label:`${diff}`};
    return{icon:'→',color:'var(--amber)',label:diff===0?'0':(diff>0?`+${diff}`:`${diff}`)};
  }

  // Satu <td> untuk satu minggu — mini horizontal bar (lebar = score%, 0-100
  // skala tetap) + nombor. Guna table sebenar (bukan nested flex div) supaya
  // semua lajur align kemas macam table lain dalam app ni.
  function weekCell(v,isCurrent){
    const bg=isCurrent?'var(--purple-light)':'transparent';
    if(v===null)return`<td style="text-align:center;background:${bg}"><span style="font-size:12px;color:var(--text3)">–</span></td>`;
    const col=v>=70?'var(--green)':v>=50?'var(--amber)':'var(--red)';
    return`<td style="text-align:center;background:${bg}">
      <div style="display:inline-flex;flex-direction:column;align-items:center;gap:4px">
        <span style="font-size:12px;font-weight:700;color:${col}">${v}</span>
        <div style="width:44px;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${v}%;background:${col};border-radius:3px"></div>
        </div>
      </div>
    </td>`;
  }

  // Stat card "Score This Week" — SENTIASA ikut minggu kalendar sebenar (hari
  // ini), berasingan daripada bulan yang dipilih kat Trend widget di atas.
  function currentCalendarWeek(){
    const n=new Date(); const day=n.getDay()||7;
    const start=new Date(n); start.setHours(0,0,0,0); start.setDate(n.getDate()-(day-1));
    const end=new Date(start); end.setDate(start.getDate()+7);
    return{start,end};
  }
  const thisWeek=currentCalendarWeek();
  const lastWeek=(()=>{const s=new Date(thisWeek.start);s.setDate(s.getDate()-7);const e=new Date(thisWeek.end);e.setDate(e.getDate()-7);return{start:s,end:e};})();
  const thisWeekSessions=sessions.filter(s=>{const d=new Date(s.date);return d>=thisWeek.start&&d<thisWeek.end;});
  const lastWeekSessions=sessions.filter(s=>{const d=new Date(s.date);return d>=lastWeek.start&&d<lastWeek.end;});
  const thisWeekAvg=thisWeekSessions.length?Math.round(thisWeekSessions.reduce((a,s)=>a+s.totalScore,0)/thisWeekSessions.length):null;
  const lastWeekAvg=lastWeekSessions.length?Math.round(lastWeekSessions.reduce((a,s)=>a+s.totalScore,0)/lastWeekSessions.length):null;
  const weekDiff=(thisWeekAvg!==null&&lastWeekAvg!==null)?thisWeekAvg-lastWeekAvg:null;

  const sectionLabel=(icon,title)=>`<div style="display:flex;align-items:center;gap:8px;margin:28px 0 12px"><span style="font-size:13px">${icon}</span><span style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em">${title}</span><div style="flex:1;height:1px;background:var(--border)"></div></div>`;

  setContent(`
  <div class="page-header"><div class="page-title">Dashboard</div><div class="page-sub">Collector performance overview</div></div>

  <div class="card" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px">
    <span style="font-size:12px;color:var(--text3);margin-right:4px">Performance Period:</span>
    ${periodBtn('day','Today')}
    ${periodBtn('month','This Month')}
    ${periodBtn('year','This Year')}
    ${periodBtn('all','All Time')}
    ${periodBtn('custom','Custom Range')}
    ${dashboardPeriod==='custom'?`
      <span style="display:flex;align-items:center;gap:6px;margin-left:4px">
        <input type="date" value="${dashboardCustomFrom}" onchange="setDashboardCustomFrom(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text)">
        <span style="font-size:12px;color:var(--text3)">to</span>
        <input type="date" value="${dashboardCustomTo}" onchange="setDashboardCustomTo(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text)">
      </span>`:''}
  </div>

  ${sectionLabel('📊','Overview')}
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Total Sessions</div><div class="stat-val">${periodSessions.length}</div><div class="stat-sub">${periodLabel(dashboardPeriod)}</div></div>
    <div class="stat-card"><div class="stat-label">Average Score</div><div class="stat-val">${periodAvg}</div><div class="stat-sub">${periodDiff!==null?`<span style="color:${periodDiff>=0?'var(--green)':'var(--red)'}">${periodDiff>=0?'▲ +':'▼ '}${periodDiff} vs previous period</span>`:'/ 100'}</div></div>
    <div class="stat-card"><div class="stat-label">Sessions Today</div><div class="stat-val">${todaySessions}</div><div class="stat-sub">Training today</div></div>
    <div class="stat-card"><div class="stat-label">Score This Week</div><div class="stat-val">${thisWeekAvg!==null?thisWeekAvg:'—'}</div><div class="stat-sub">${weekDiff!==null?`<span style="color:${weekDiff>=0?'var(--green)':'var(--red)'}">${weekDiff>=0?'▲ +':'▼ '}${weekDiff} vs last week</span>`:`${thisWeekSessions.length} sessions this week`}</div></div>
    <div class="stat-card"><div class="stat-label">Compliance Issues</div><div class="stat-val" style="color:${periodFlagged.length?'var(--red)':'inherit'}">${periodFlagged.length}</div><div class="stat-sub">Risky sessions · ${periodLabel(dashboardPeriod)}</div></div>
  </div>

  ${sectionLabel('📈','Team Trend')}
  <div class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:18px 20px 4px">
      <div class="card-title" style="margin-bottom:0">📅 Weekly Trend Per Collector</div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="shiftTrendMonth(-1)">◀</button>
        <span style="font-size:13px;font-weight:700;min-width:130px;text-align:center">${monthLabel}</span>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="shiftTrendMonth(1)">▶</button>
        ${!isCurrentMonth?`<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="resetTrendMonth()">This Month</button>`:''}
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);padding:0 20px 14px">Minggu Isnin–Ahad dalam ${monthLabel}. Klik nama collector → pilih minggu → breakdown harian.</div>
    ${collectors.length===0?`<div class="empty-state" style="padding:20px"><div class="es-icon">👥</div><p>No collectors registered yet.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Register a collector account from the <strong>Manage Users</strong> menu.</p></div>`:`
    <div class="table-wrap"><table>
      <tr>
        <th style="min-width:170px">Collector</th>
        ${WEEKS.map((w,i)=>`<th style="text-align:center;${i===currentWeekIdx?'color:var(--purple);background:var(--purple-light)':''}">${w.label}${i===currentWeekIdx?' ★':''}</th>`).join('')}
        <th style="text-align:center">Trend</th>
      </tr>
      ${collectors.map(c=>{
        const wData=weeklyData(c.id);
        const arrow=trendArrow(wData);
        const cs=sessions.filter(s=>s.collectorId===c.id);
        const overallAvg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;
        const isExpanded=expandedTrendCollectorId===c.id;
        const weakLabel=cs.length?topWeaknessLabel(cs):null;
        const row=`<tr style="cursor:pointer;${isExpanded?'background:var(--surface2)':''}" onclick="toggleTrendRow('${c.id}')">
          <td>
            <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">
              <span style="font-size:9px;color:var(--text3);display:inline-block;transition:transform .15s;transform:rotate(${isExpanded?90:0}deg)">▶</span>
              ${esc(c.name)}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;margin-left:15px">${cs.length} sessions · overall <span class="score-pill ${overallAvg>=70?'score-high':overallAvg>=50?'score-mid':'score-low'}" style="font-size:10px;padding:1px 7px">${overallAvg}</span></div>
          </td>
          ${WEEKS.map((w,i)=>weekCell(wData[i],i===currentWeekIdx)).join('')}
          <td style="text-align:center">
            <span style="font-size:14px;color:${arrow.color};font-weight:700">${arrow.icon}</span>
            ${arrow.label?`<span style="font-size:11px;color:${arrow.color};font-weight:600;margin-left:3px">${arrow.label}</span>`:''}
          </td>
        </tr>`;
        const detail=isExpanded?`<tr style="background:var(--surface2)"><td colspan="${WEEKS.length+2}" style="padding:0 16px 18px">
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;animation:fadeIn .15s ease">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
              <div style="font-size:12px;font-weight:700">Pilih minggu untuk breakdown harian — ${monthLabel}</div>
              <div style="display:flex;align-items:center;gap:8px">
                ${weakLabel&&weakLabel!=='-'?`<span class="chip chip-amber" style="font-size:10px">🎯 Lemah keseluruhan: ${weakLabel}</span>`:''}
                <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="event.stopPropagation();exportCoachingMemo('${c.id}')">📄 Export Coaching Memo</button>
                <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="event.stopPropagation();viewCollectorSessions('${c.id}')">View all sessions →</button>
              </div>
            </div>
            ${WEEKS.map((w,i)=>{
              const v=wData[i];
              const weekCount=cs.filter(s=>{const d=new Date(s.date);return d>=w.start&&d<w.end;}).length;
              const wKey=`${c.id}__${i}`;
              const isWeekOpen=expandedTrendWeekKey===wKey;
              const barCol=v===null?'var(--border)':(v>=70?'var(--green)':v>=50?'var(--amber)':'var(--red)');
              const weekDetail=isWeekOpen?(()=>{
                const days=dailyData(c.id,w);
                const weekEndIncl=new Date(w.end); weekEndIncl.setDate(weekEndIncl.getDate()-1);
                const allSessions=days.flatMap(d=>d.sessions);
                return`<div style="padding:8px 0 14px 24px;animation:fadeIn .15s ease">
                  <div class="table-wrap"><table>
                    <tr><th>Day</th><th>Date</th><th style="text-align:center">Sessions</th><th style="text-align:center">Avg Score</th></tr>
                    ${days.map(d=>`<tr>
                      <td style="font-size:12px">${d.dayName}</td>
                      <td style="font-size:12px;color:var(--text3)">${d.label}</td>
                      <td style="font-size:12px;text-align:center">${d.count}</td>
                      <td style="text-align:center">${d.avg!==null?`<span class="score-pill ${d.avg>=70?'score-high':d.avg>=50?'score-mid':'score-low'}">${d.avg}</span>`:'<span style="color:var(--text3);font-size:11px">-</span>'}</td>
                    </tr>`).join('')}
                  </table></div>
                  ${allSessions.length?`
                  <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px">
                    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.03em">Sesi minggu ini</div>
                    <button class="btn btn-secondary" style="padding:3px 9px;font-size:10px" onclick="event.stopPropagation();viewCollectorSessions('${c.id}','${localISODate(w.start)}','${localISODate(weekEndIncl)}')">View in Sessions →</button>
                  </div>
                  <div class="table-wrap"><table>
                    <tr><th>Date</th><th>Scenario</th><th>Duration</th><th>Score</th><th>Harassment</th></tr>
                    ${allSessions.map(s=>`<tr>
                      <td style="font-size:12px;color:var(--text3)">${fmtDateTime(s.date)}</td>
                      <td style="font-size:12px">${esc(s.scenarioName)}</td>
                      <td style="font-size:12px">${s.duration}</td>
                      <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
                      <td>${s.harassmentRisk&&s.harassmentRisk!=='none'?`<span class="chip chip-red" style="font-size:10px">⚠ ${s.harassmentRisk}</span>`:'<span style="color:var(--text3);font-size:11px">-</span>'}</td>
                    </tr>`).join('')}
                  </table></div>`:`<div style="font-size:12px;color:var(--text3);padding:6px 0">Tiada sesi latihan minggu ini.</div>`}
                </div>`;
              })():'';
              return`<div style="border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer" onclick="event.stopPropagation();toggleTrendWeek('${c.id}',${i})">
                  <span style="font-size:9px;color:var(--text3);display:inline-block;transition:transform .15s;transform:rotate(${isWeekOpen?90:0}deg)">▶</span>
                  <span style="font-size:12px;font-weight:600;flex:0 0 90px">${w.label}${i===currentWeekIdx?' ★':''}</span>
                  <div style="flex:1;background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
                    <div style="height:100%;width:${v||0}%;background:${barCol};border-radius:3px"></div>
                  </div>
                  <span style="font-size:11px;color:var(--text3);flex:0 0 100px;text-align:right">${v!==null?v+' avg · ':''}${weekCount} sesi</span>
                </div>
                ${weekDetail}
              </div>`;
            }).join('')}
          </div>
        </td></tr>`:'';
        return row+detail;
      }).join('')}
    </table></div>`}
    <div style="font-size:11px;color:var(--text3);padding:12px 20px">
      ▲ naik ≥5 · ▼ turun ≥5 · → stabil ±4 · – tiada sesi minggu itu · ★ minggu semasa
    </div>
  </div>

  ${sectionLabel('👤','Individual Performance')}
  <div class="two-col">
    <div class="card">
      <div class="card-title">Performance Per Collector — ${periodLabel(dashboardPeriod)}</div>
      ${collectors.length===0?`<div class="empty-state"><div class="es-icon">👥</div><p>No collectors yet</p></div>`:''}
      ${collectors.map(c=>{
        const cs=periodSessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):0;
        const prevCs=prevPeriodSessions.filter(s=>s.collectorId===c.id);
        const prevAvg=prevCs.length?Math.round(prevCs.reduce((a,s)=>a+s.totalScore,0)/prevCs.length):null;
        const diff=(dashboardPeriod!=='all'&&prevAvg!==null)?avg-prevAvg:null;
        return`<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px;font-weight:500">${esc(c.name)}</span>
            <div style="display:flex;align-items:center;gap:6px">
              ${diff!==null?`<span style="font-size:11px;color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'▲ +':'▼ '}${diff}</span>`:''}
              <span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${cs.length?avg:'—'}</span>
            </div>
          </div>
          <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
            <div style="height:100%;width:${avg}%;background:${avg>=70?'#5CB85C':avg>=50?'#F0AD4E':'#E24B4A'};border-radius:3px;transition:width 0.5s"></div>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${cs.length} sessions · ${periodLabel(dashboardPeriod)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">Recent Sessions</div>
      ${recentSessions.length===0?`<div class="empty-state"><div class="es-icon">📋</div><p>No training sessions yet.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Collectors can start training from the <strong>Voice Training</strong> menu.</p></div>`:''}
      ${recentSessions.map(s=>{
        const u=findUserById(users,s.collectorId);
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${esc(s.scenarioName)} · ${s.duration}</div></div>
          <span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  ${sectionLabel('🧭','Coaching Insights & Compliance')}
  <div class="two-col">
    <div class="card">
      <div class="card-title">🎯 Most Frequently Missed Aspects (Whole Team)</div>
      <div style="font-size:11px;color:var(--text3);margin-top:-8px;margin-bottom:12px">Klik kategori untuk tengok siapa paling kerap silap.</div>
      ${weakness.length===0?`<div class="empty-state"><div class="es-icon">📊</div><p>Not enough data for analysis yet.</p><p style="font-size:12px;color:var(--text3);margin-top:4px">Requires at least 3 training sessions.</p></div>`:
      weakness.slice(0,5).map(([cat,count])=>{
        const pct=weaknessTotal?Math.round(count/weaknessTotal*100):0;
        const isOpen=expandedWeaknessCat===cat;
        const byCollector=isOpen?weaknessByCollector(sessions,cat,users):[];
        const topCount=byCollector.length?byCollector[0].count:1;
        return`<div style="margin-bottom:6px;${isOpen?'background:var(--surface2);border-radius:8px;padding:8px 10px;margin-left:-10px;margin-right:-10px':''}">
          <div style="cursor:pointer" onclick="toggleWeaknessCat('${cat}')">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:13px;display:flex;align-items:center;gap:5px">
                <span style="font-size:9px;color:var(--text3);display:inline-block;transition:transform .15s;transform:rotate(${isOpen?90:0}deg)">▶</span>
                ${catIcon(cat)} ${catLabel(cat)}
              </span>
              <span style="font-size:12px;color:var(--text3)">${count}x detected · ${pct}%</span>
            </div>
            <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden;margin-left:15px">
              <div style="height:100%;width:${pct}%;background:var(--amber);border-radius:3px"></div>
            </div>
          </div>
          ${isOpen?`
          <div style="margin-top:10px;margin-left:15px;padding-top:10px;border-top:1px solid var(--border);animation:fadeIn .15s ease">
            <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:8px">Siapa paling kerap silap — ${catLabel(cat)}</div>
            ${byCollector.length===0?`<div style="font-size:12px;color:var(--text3)">Tiada data collector untuk kategori ini.</div>`:
            byCollector.map(b=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer" onclick="event.stopPropagation();viewCollectorSessions('${b.id}')">
              <span style="font-size:12px;flex:0 0 130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
              <div style="flex:1;background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
                <div style="height:100%;width:${Math.round(b.count/topCount*100)}%;background:var(--red);border-radius:3px"></div>
              </div>
              <span style="font-size:11px;color:var(--text3);flex:0 0 20px;text-align:right">${b.count}x</span>
            </div>`).join('')}
          </div>`:''}
        </div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-title">⚠ Recent Compliance / Harassment Issues</div>
      ${recentFlagged.length===0?`<div class="empty-state"><div class="es-icon">✅</div><p>No compliance issues detected so far.</p></div>`:
      recentFlagged.map(s=>{
        const u=findUserById(users,s.collectorId);
        return`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${u?u.name:'—'}</div><div style="font-size:11px;color:var(--text3)">${esc(s.scenarioName)}</div></div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="chip ${s.harassmentRisk==='high'?'chip-red':'chip-amber'}">⚠ ${s.harassmentRisk}</span>
            <button class="btn btn-secondary" style="padding:3px 8px;font-size:11px" onclick="viewSession('${s.id}')">View</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  ${sectionLabel('🔬','Deep-Dive Analysis')}
  <div class="card">
    <div class="card-title">🎯 Performance By Debtor Type (Objection Type)</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Cross-tab: average score & most frequently missed skill, by debtor behavior pattern — not just a global weak skill. Trend compares the period selected above (${periodLabel(dashboardPeriod)}) vs the previous period.</div>
    ${weaknessByObjectionType(sessions).length===0?`<div class="empty-state"><div class="es-icon">📊</div><p>Not enough data yet — make sure scenarios have Objection Type tagged.</p></div>`:
    `<div class="table-wrap"><table>
      <tr><th>Debtor Type</th><th>Sessions</th><th>Avg Score</th><th>Most Frequently Missed Skill</th><th>Trend</th></tr>
      ${weaknessByObjectionType(sessions).map(g=>{
        const t=trendForObjectionType(periodSessions,prevPeriodSessions,g.objectionType);
        return`<tr>
        <td>${objectionTypeIcon(g.objectionType)} ${objectionTypeLabel(g.objectionType)}</td>
        <td>${g.count}</td>
        <td><span class="score-pill ${g.avgScore>=70?'score-high':g.avgScore>=50?'score-mid':'score-low'}">${g.avgScore}</span></td>
        <td>${g.topWeakCat?`<span class="chip chip-red">${catIcon(g.topWeakCat)} ${catLabel(g.topWeakCat)} (${g.topWeakCount}x)</span>`:'-'}</td>
        <td><span style="color:${t.color};font-size:12px">${t.icon} ${t.label}</span></td>
      </tr>`;}).join('')}
    </table></div>`}
  </div>

  <div class="card">
    <div class="card-title">⚠ Compliance Risk × Debtor Type</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Jenis penghutang mana yang paling kerap trigger isu compliance/harassment. Klik baris untuk tengok collector mana yang paling banyak terlibat.</div>
    ${(()=>{
      const compliance=complianceByObjectionType(sessions);
      if(compliance.length===0)return`<div class="empty-state"><div class="es-icon">✅</div><p>Tiada isu compliance/harassment dikesan setakat ini.</p></div>`;
      return`<div class="table-wrap"><table>
        <tr><th>Debtor Type</th><th style="text-align:center">Sessions</th><th style="text-align:center">Flagged</th><th style="text-align:center">% Berisiko</th><th>Severity</th></tr>
        ${compliance.map(g=>{
          const isOpen=expandedComplianceOT===g.objectionType;
          const row=`<tr style="cursor:pointer;${isOpen?'background:var(--surface2)':''}" onclick="toggleComplianceOT('${g.objectionType}')">
            <td style="display:flex;align-items:center;gap:6px">
              <span style="font-size:9px;color:var(--text3);display:inline-block;transition:transform .15s;transform:rotate(${isOpen?90:0}deg)">▶</span>
              ${objectionTypeIcon(g.objectionType)} ${objectionTypeLabel(g.objectionType)}
            </td>
            <td style="text-align:center">${g.count}</td>
            <td style="text-align:center">${g.flagged}</td>
            <td style="text-align:center"><span class="chip ${g.pct>=30?'chip-red':'chip-amber'}" style="font-size:11px">${g.pct}%</span></td>
            <td>
              ${g.high?`<span class="chip chip-red" style="font-size:10px;margin-right:3px">high ×${g.high}</span>`:''}
              ${g.medium?`<span class="chip chip-amber" style="font-size:10px;margin-right:3px">medium ×${g.medium}</span>`:''}
              ${g.low?`<span class="chip" style="font-size:10px">low ×${g.low}</span>`:''}
            </td>
          </tr>`;
          const detail=isOpen?`<tr style="background:var(--surface2)"><td colspan="5" style="padding:0 16px 16px">
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;animation:fadeIn .15s ease">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:8px">Collector terlibat — ${objectionTypeLabel(g.objectionType)}</div>
              ${g.topCollectors.map(([id,count])=>{
                const u=findUserById(users,id);
                const topCount=g.topCollectors[0][1];
                return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer" onclick="event.stopPropagation();viewCollectorSessions('${id}')">
                  <span style="font-size:12px;flex:0 0 130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u?u.name:id)}</span>
                  <div style="flex:1;background:var(--bg);border-radius:3px;height:6px;overflow:hidden">
                    <div style="height:100%;width:${Math.round(count/topCount*100)}%;background:var(--red);border-radius:3px"></div>
                  </div>
                  <span style="font-size:11px;color:var(--text3);flex:0 0 50px;text-align:right">${count}x</span>
                </div>`;
              }).join('')}
            </div>
          </td></tr>`:'';
          return row+detail;
        }).join('')}
      </table></div>`;
    })()}
  </div>

  <div class="card">
    <div class="card-title">🔍 Recurring Failure Pattern Analysis (AI)</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Uses AI to find recurring failure THEMES (not just a category tally) across all existing sessions, by debtor type. Runs on-demand when clicked — not auto-run every time the dashboard opens, to save API cost.</div>
    <button id="btnAnalyzePatterns" class="btn btn-primary" style="font-size:12px" onclick="analyzeWeaknessPatterns()">🔍 Analyze Failure Patterns (AI)</button>
    <div id="patternAnalysisOut" style="margin-top:12px"></div>
  </div>`);
}

// On-demand AI pattern detection — sengaja BUKAN auto-run setiap kali
// dashboard dibuka (Izzul dah ada concern pasal kos API sebelum ni, cth
// TTS feature flag) — hanya jalan bila manager tekan button, dan cuma 1
// Claude call ringan (max_tokens 1200), bukan per-sesi.
async function analyzeWeaknessPatterns(){
  const btn=document.getElementById('btnAnalyzePatterns');
  const out=document.getElementById('patternAnalysisOut');
  if(!btn||!out)return;
  btn.disabled=true;btn.textContent='Menganalisis...';
  out.innerHTML='<div style="font-size:13px;color:var(--text3)">⏳ Analyzing failure patterns...</div>';
  try{
    const sessions=await loadSessions();
    // Hadkan kepada 15 missed items terkini setiap jenis penghutang —
    // kawal saiz prompt (kos) & elak context overflow kalau data dah banyak.
    const byType={};
    sessions.forEach(s=>{
      const ot=s.objectionType||'unknown';
      if(!byType[ot])byType[ot]=[];
      (s.missed||[]).forEach(m=>{if(byType[ot].length<15)byType[ot].push(`[${m.category}] ${m.issue||''}`);});
    });
    const summary=Object.entries(byType).filter(([,arr])=>arr.length>=3)
      .map(([ot,arr])=>`### ${objectionTypeLabel(ot)}\n${arr.map(x=>'- '+x).join('\n')}`).join('\n\n');
    if(!summary){
      out.innerHTML='<div style="font-size:13px;color:var(--text3)">Not enough "missed" data for pattern analysis yet (requires at least 3 issues per debtor type).</div>';
      return;
    }
    const prompt=`Anda QA Manager pakar debt collection di Malaysia. Di bawah disenaraikan isu "missed" (perkara yang collector gagal/lemah lakukan) dari sesi latihan, dikumpul ikut jenis penghutang (objection type):

${summary}

Untuk SETIAP jenis penghutang di atas, kenal pasti 2-3 CORAK kegagalan BERULANG (tema yang muncul lebih dari sekali — bukan senarai semua isu satu-satu) dan SATU cadangan coaching ringkas, spesifik & boleh terus diamalkan untuk setiap corak. Jawab dalam Bahasa Malaysia, format markdown ringkas dengan heading "### [Jenis Penghutang]" untuk setiap jenis.`;
    const res=await fetch('/api/claude',{method:'POST',headers:authHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal analisis.');
    const text=(data.content?.[0]?.text||'Tiada hasil.');
    // Escape HTML asas (data ni dari AI, bukan dari user, tapi tetap berjaga-jaga)
    // lepas tu tukar newline ke <br> & heading ### ringkas, supaya senang dibaca.
    const escaped=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const html=escaped
      .replace(/^### (.+)$/gm,'<div style="font-weight:600;margin-top:14px;margin-bottom:4px">🎯 $1</div>')
      .replace(/\n/g,'<br>');
    out.innerHTML=`<div style="font-size:13px;line-height:1.7;color:var(--text2)">${html}</div>`;
  }catch(e){
    out.innerHTML=`<div style="font-size:13px;color:var(--red)">⚠ Gagal analisis: ${e.message}</div>`;
  }finally{
    btn.disabled=false;btn.textContent='🔍 Analisis Corak Kegagalan (AI)';
  }
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
  let scenarios, mySessions, myAssignments;
  try{
    scenarios=await loadScenarios();
    // API server-side dah filter: collector cuma dapat sesi dia sendiri
    // (lihat app/api/sessions/route.js GET — authUser.role==='collector'
    // → query.eq('collector_id', authUser.id)), jadi takyah filter lagi kat sini.
    mySessions=await loadSessions();
    myAssignments=await loadAssignments(); // server pun dah filter: collector cuma dapat assignment sendiri
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Voice Training</div></div><div class="card">⚠ Failed to load scenarios: ${e.message}</div>`);
    return;
  }
  if(!scenario&&scenarios.length)scenario=scenarios[0];

  // ── Daily session cap (FASA 4) — kira sesi HARI NI je, enforce client-side
  // (untuk UX — block awal sebelum buang masa pilih scenario) DAN server-side
  // (app/api/sessions POST, sumber kebenaran sebenar — client ni cuma UX).
  const todayStr=localISODate();
  const todaySessionCount=mySessions.filter(s=>isLocalDate(s.date,todayStr)).length;
  const dailyCap=currentUser.maxSessionsPerDay;
  const dailyCapReached=dailyCap!=null&&todaySessionCount>=dailyCap;

  // ── Assignment wajib (FASA 4) — scenario yang manager assign khusus untuk
  // collector ni, status masih 'pending'. Map by scenarioId untuk badge cepat.
  const pendingAssignments=(myAssignments||[]).filter(a=>a.status==='pending');
  const assignedScenarioIds=new Set(pendingAssignments.map(a=>a.scenarioId));

  // ═══════ FASA 3: Collector Target Plan — auto-cadang scenario seterusnya ═══════
  // Guna jenis penghutang yang PALING lemah untuk collector NI SENDIRI
  // (min 2 sesi jenis tu, elak cadangan dari 1 sesi outlier semata-mata).
  const myWeakTypes=weaknessByObjectionType(mySessions).filter(g=>g.count>=2);
  const myWeakest=myWeakTypes.length?myWeakTypes[0]:null;
  let recommendedScenario=null;
  if(myWeakest){
    const candidates=scenarios.filter(s=>s.objectionType===myWeakest.objectionType);
    if(candidates.length){
      // Antara candidate jenis sama, pilih yang PALING JARANG/belum dicuba —
      // supaya cadangan pelbagai dari semasa ke semasa, bukan scenario sama
      // berulang-ulang setiap kali buka page ni.
      const triedCounts={};
      mySessions.forEach(s=>{triedCounts[s.scenarioId]=(triedCounts[s.scenarioId]||0)+1;});
      recommendedScenario=candidates.slice().sort((a,b)=>(triedCounts[a.id]||0)-(triedCounts[b.id]||0))[0];
    }
  }

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
      ?`<div class="preview-section-title" style="margin-top:14px">✅ Evaluation Checklist</div>${(s.checklist||[]).map(c=>`<div class="preview-checklist-item"><span class="preview-cl-cat">${c.cat}</span><span class="preview-cl-text">${c.text}${c.critical?' <span style="color:#C0392B;font-weight:600;font-size:11px">⚠️ Critical</span>':''}</span></div>`).join('')}`
      :'';
    return`
      <div class="sc-preview-header">
        <div style="font-size:32px">${s.emoji}</div>
        <div style="flex:1;min-width:0">
          <div class="sc-preview-title">${esc(s.title)}</div>
          <div class="sc-preview-sub">${s.description||s.desc||''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <span class="level-badge level-${s.level}">${lvlLabel}</span>
            <span class="preview-badge-neutral">${accentLabel} · ${genderLabel}</span>
            <span class="chip chip-amber" style="font-size:11px">${objectionTypeIcon(s.objectionType)} ${objectionTypeLabel(s.objectionType)}</span>
            ${s.client?`<span class="preview-badge-client">${esc(s.client)}</span>`:''}
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
  ${dailyCapReached?`
  <div class="card" style="border-left:4px solid var(--red);margin-bottom:14px;background:#fff5f5">
    <div class="card-title" style="color:var(--red)">🚫 Daily Session Limit Reached</div>
    <p style="font-size:13px;color:var(--text2);line-height:1.6">You've completed <b>${todaySessionCount}/${dailyCap}</b> training sessions allowed today. The limit resets at midnight. Contact your manager if you need this adjusted.</p>
  </div>`:dailyCap!=null?`
  <div class="card" style="border-left:4px solid var(--amber);margin-bottom:14px;padding:10px 14px">
    <span style="font-size:12px;color:var(--text2)">📊 Sessions today: <b>${todaySessionCount}/${dailyCap}</b></span>
  </div>`:''}
  ${pendingAssignments.length?`
  <div class="card" style="border-left:4px solid var(--purple);margin-bottom:14px">
    <div class="card-title">📌 Assigned to You (${pendingAssignments.length})</div>
    <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:10px">Your manager assigned these scenarios as mandatory. Complete them by the due date.</p>
    ${pendingAssignments.map(a=>{
      const s=scenarios.find(x=>x.id===a.scenarioId);
      const overdue=a.dueDate&&new Date(a.dueDate)<new Date(todayStr);
      return`
      <div class="sc-card ${scenario&&scenario.id===a.scenarioId?'selected':''}" style="margin-bottom:8px;cursor:${s?'pointer':'default'}" ${s?`onclick="selectScenario('${a.scenarioId}')"`:''}>
        <div class="sc-emoji">${s?s.emoji:'❓'}</div>
        <div class="sc-body">
          <div class="sc-name">${a.scenarioName||(s?s.title:'(scenario deleted)')}</div>
          <div class="sc-desc">${a.dueDate?`Due ${new Date(a.dueDate).toLocaleDateString('en-MY')}`:'No due date'}${overdue?' <span style="color:var(--red);font-weight:600">· Overdue</span>':''}</div>
        </div>
        <div class="sc-check">${scenario&&scenario.id===a.scenarioId?'✓':''}</div>
      </div>`;
    }).join('')}
  </div>`:''}
  ${recommendedScenario?`
  <div class="card" style="border-left:4px solid var(--amber);margin-bottom:14px">
    <div class="card-title">🎯 Recommended For You</div>
    <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:10px">Based on your training record, you're weakest against <b>${objectionTypeLabel(myWeakest.objectionType)}</b> type debtors (avg score ${myWeakest.avgScore}/100 from ${myWeakest.count} sessions)${myWeakest.topWeakCat?`, especially on the <b>${catLabel(myWeakest.topWeakCat)}</b> skill`:''}. Try this scenario next:</p>
    <div class="sc-card selected" style="margin:0;cursor:pointer" onclick="selectScenario('${recommendedScenario.id}')">
      <div class="sc-emoji">${recommendedScenario.emoji}</div>
      <div class="sc-body">
        <div class="sc-name">${recommendedScenario.title}</div>
        <div class="sc-desc">${recommendedScenario.description||recommendedScenario.desc||''}</div>
        <div class="sc-meta">
          <span class="level-badge level-${recommendedScenario.level}">${recommendedScenario.level==='easy'?'Easy':recommendedScenario.level==='med'?'Medium':'Hard'}</span>
          <span class="chip chip-amber" style="font-size:10px">${objectionTypeIcon(recommendedScenario.objectionType)} ${objectionTypeLabel(recommendedScenario.objectionType)}</span>
        </div>
      </div>
      <div class="sc-check">✓</div>
    </div>
  </div>`:''}
  <div class="training-layout">
    <div class="training-left">
      <div class="card" style="margin-bottom:0">
        <div class="card-title">Select Scenario</div>
        <div class="sc-list" id="scGrid">
          ${scenarios.map(s=>`
          <div class="sc-card ${scenario&&scenario.id===s.id?'selected':''}" onclick="selectScenario('${s.id}')">
            <div class="sc-emoji">${s.emoji}</div>
            <div class="sc-body">
              <div class="sc-name">${esc(s.title)}${assignedScenarioIds.has(s.id)?' <span style="font-size:10px;color:var(--purple);font-weight:600">📌 Assigned</span>':recommendedScenario&&recommendedScenario.id===s.id?' <span style="font-size:10px;color:var(--amber);font-weight:600">⭐ Recommended</span>':''}</div>
              <div class="sc-desc">${s.description||s.desc||''}</div>
              <div class="sc-meta">
                <span class="level-badge level-${s.level}">${s.level==='easy'?'Easy':s.level==='med'?'Medium':'Hard'}</span>
                ${s.client?`<span class="preview-badge-client" style="font-size:10px">${esc(s.client)}</span>`:''}
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
      <button class="btn btn-primary" style="width:100%;padding:13px;font-size:15px;margin-top:0" ${dailyCapReached?'disabled':''} onclick="startCall()">${dailyCapReached?'🚫 Daily Limit Reached':'🎙 Start Training Call'}</button>
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
      ?`<div class="preview-section-title" style="margin-top:14px">✅ Evaluation Checklist</div>${(scenario.checklist||[]).map(c=>`<div class="preview-checklist-item"><span class="preview-cl-cat">${c.cat}</span><span class="preview-cl-text">${c.text}${c.critical?' <span style="color:#C0392B;font-weight:600;font-size:11px">⚠️ Critical</span>':''}</span></div>`).join('')}`
      :'';
    preview.innerHTML=`
      <div class="sc-preview-header">
        <div style="font-size:32px">${scenario.emoji}</div>
        <div style="flex:1;min-width:0">
          <div class="sc-preview-title">${esc(scenario.title)}</div>
          <div class="sc-preview-sub">${scenario.description||scenario.desc||''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            <span class="level-badge level-${scenario.level}">${lvlLabel}</span>
            <span class="preview-badge-neutral">${accentLabel} · ${genderLabel}</span>
            <span class="chip chip-amber" style="font-size:11px">${objectionTypeIcon(scenario.objectionType)} ${objectionTypeLabel(scenario.objectionType)}</span>
            ${scenario.client?`<span class="preview-badge-client">${esc(scenario.client)}</span>`:''}
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
            <div><div class="debtor-name">${esc(scenario.name)}</div><div class="debtor-sub">${esc(scenario.title)}</div></div>
          </div>
          <div class="call-timer" id="callTimer">00:00</div>
        </div>
        <div class="status-bar"><div class="status-dot green" id="statusDot"></div><span id="statusText">Session active</span>${!TTS_ENABLED?'<span style="margin-left:auto;font-size:11px;font-weight:600;color:#e65100;background:#fff3e0;border:1px solid #ffb74d;border-radius:20px;padding:2px 8px">🔇 Silent Mode</span>':''}</div>
        <div class="transcript" id="transcriptBox"></div>
        <div class="mic-area">
          <div class="live-text" id="liveText"></div>
          <button class="mic-btn" id="micBtn" onclick="toggleMic()"><span id="micIcon">🎙</span></button>
          <div class="mic-level-track"><div class="mic-level-fill" id="micLevelFill"></div></div>
          <div class="mic-label" id="micLabel">Press to speak</div>
        </div>
      </div>
      <button class="btn btn-danger btn-full" onclick="endCall()">📵 End Call</button>
    </div>
    <div class="acc-ref-card">
      <div class="acc-ref-title">📒 Account Info (negotiation reference)</div>
      ${acc('Client',scenario.client)}
      ${acc('Name',scenario.name)}
      ${acc('IC No.',scenario.icNumber)}
      ${acc('Acc Number',scenario.accNumber)}
      ${acc('Service No.',scenario.serviceNo)}
      ${acc('Amount Outstanding',scenario.amount)}
      ${acc('Acc Type',scenario.accType)}
      ${acc('Registration Date',scenario.registrationDate?new Date(scenario.registrationDate).toLocaleDateString('en-MY'):'')}
      ${acc('Termination Date',scenario.terminationDate?new Date(scenario.terminationDate).toLocaleDateString('en-MY'):'')}
    </div>
  </div>`);
}

function renderScoreScreen(){
  if(!window._lastScore)return navigate('training');
  const s=window._lastScore;
  setContent(`
  <div style="max-width:640px;margin:0 auto">
    <div class="page-header"><div class="page-title">Training Results</div><div class="page-sub">${esc(s.scenarioName)} · ${s.duration}</div></div>
    <div class="card">
      <div class="score-hero">
        <div class="score-circle"><div class="score-big">${s.totalScore}</div><div class="score-of">/ 100</div></div>
        <div style="font-size:16px;font-weight:600;color:${s.totalScore>=70?'var(--green)':s.totalScore>=50?'var(--amber)':'var(--red)'}">
          ${s.totalScore>=70?'Excellent! 🏆':s.totalScore>=50?'Good! Keep it up 💪':'Needs More Practice 📚'}
        </div>
        ${harassmentBadge(s.harassmentRisk)}
      </div>
      ${s.harassmentRisk&&s.harassmentRisk!=='none'?`<div class="alert alert-err" style="display:block;margin-top:0">⚠ <strong>Compliance/Harassment Issue:</strong> ${s.harassmentNote||'Risky tone or wording was detected in this call.'}</div>`:''}
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
      <p style="font-size:13px;color:var(--text2);line-height:1.7">${esc(s.feedback)}</p>
    </div>
    ${(s.strengths&&s.strengths.length)?`
    <div class="card">
      <div class="card-title">✅ Apa Yang Anda Sudah Buat Dengan Baik</div>
      ${s.strengths.map(t=>`<div style="display:flex;gap:8px;padding:6px 0;font-size:13px;color:var(--text2)"><span style="color:var(--green)">●</span><span>${esc(t)}</span></div>`).join('')}
    </div>`:''}
    ${(s.missed&&s.missed.length)?`
    <div class="card">
      <div class="card-title">🛠 Apa Yang Perlu Diperbaiki</div>
      ${s.missed.map(m=>`
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span class="chip chip-red">${catIcon(m.category)} ${catLabel(m.category)}</span>
        </div>
        <div style="font-size:13px;color:var(--text);margin-bottom:3px"><strong>Isu:</strong> ${esc(m.issue)}</div>
        ${m.quote?`<div style="font-size:12px;color:var(--text3);font-style:italic;margin-bottom:3px">"${esc(m.quote)}"</div>`:''}
        <div style="font-size:13px;color:var(--brand)"><strong>Cadangan:</strong> ${esc(m.suggestion)}</div>
      </div>`).join('')}
    </div>`:''}
    ${s.priorityFocus?`
    <div class="card" style="border-left:4px solid var(--purple)">
      <div class="card-title">🎯 Focus For Next Training</div>
      <span class="chip chip-purple">${catIcon(s.priorityFocus.category)} ${catLabel(s.priorityFocus.category)}</span>
      <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:8px">${s.priorityFocus.tip||''}</p>
    </div>`:''}
    <div class="card">
      <div class="card-title">📝 Transcript Perbualan</div>
      <div style="max-height:300px;overflow-y:auto">
        ${(s.transcript||[]).map(m=>`<div style="margin-bottom:10px"><div style="font-size:11px;color:var(--text3);margin-bottom:2px">${esc(m.role==='user'?currentUser.name:scenario?scenario.name:'Debtor')}</div>
        <div style="padding:8px 12px;border-radius:8px;font-size:13px;background:${m.role==='user'?'var(--purple-light)':'var(--bg)'};color:${m.role==='user'?'var(--purple)':'var(--text)'}">${esc(m.content)}</div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" style="flex:1;min-width:120px" onclick="navigate('training')">🔁 Retrain</button>
      <button class="btn btn-secondary" style="flex:1;min-width:120px" onclick="navigate('my-history')">📊 View History</button>
      <button class="btn btn-secondary" style="flex:1;min-width:120px" onclick="copyScoreSummary()">📋 Salin Ringkasan</button>
    </div>
  </div>`);
}

function copyScoreSummary(){
  const s=window._lastScore;
  if(!s)return;
  const catLabels={tone:'Tone',delivery:'Delivery',counter:'Counter Argument',action:'Action & Compliance',balance:'Balance Strategy'};
  const scoreLines=Object.entries(s.scores||{}).map(([k,v])=>`  ${catLabels[k]||k}: ${v}/${(s.scoreMax&&s.scoreMax[k])||20}`).join('\n');
  const strengthLines=(s.strengths||[]).map(t=>`  ✅ ${t}`).join('\n');
  const missedLines=(s.missed||[]).map(m=>`  ⚠ ${m.issue||''} → ${m.suggestion||''}`).join('\n');
  const harassment=s.harassmentRisk&&s.harassmentRisk!=='none'?`\n⚠ Compliance Issue (${s.harassmentRisk}): ${s.harassmentNote||''}\n`:'';
  const text=[
    `📊 CollectorTrain Training Results`,
    `Scenario: ${s.scenarioName||'-'} · Duration: ${s.duration||'-'}`,
    `Overall Score: ${s.totalScore}/100`,
    ``,
    `Score Breakdown:`,
    scoreLines,
    harassment,
    strengthLines?`Strengths:\n${strengthLines}`:'',
    missedLines?`Needs Improvement:\n${missedLines}`:'',
    s.priorityFocus?`\n🎯 Next Focus (${catLabels[s.priorityFocus.category]||s.priorityFocus.category}):\n  ${s.priorityFocus.tip||''}`:'',
    ``,
    `💬 AI Feedback:`,
    s.feedback||'',
  ].filter(Boolean).join('\n');
  navigator.clipboard.writeText(text).then(()=>{
    const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Salin Ringkasan'));
    if(btn){const orig=btn.textContent;btn.textContent='✅ Copied!';setTimeout(()=>{btn.textContent=orig;},2000);}
  }).catch(()=>alert('Copy failed — please highlight text and copy manually.'));
}

async function renderMyHistory(){
  // ── KPI Sendiri (Fasa 3) — collection rate diri sendiri + rank, dari telcodashboard ──
  let myKpi=null;
  try{
    const kpiRes=await fetch('/api/leaderboard',{headers:authHeaders()});
    const kpiData=await kpiRes.json();
    if(kpiRes.ok&&kpiData.collectors){
      const sorted=kpiData.collectors; // dah sorted rate tertinggi dulu
      const idx=sorted.findIndex(c=>c.name.trim().toUpperCase()===currentUser.name.trim().toUpperCase());
      if(idx!==-1)myKpi={...sorted[idx],rank:idx+1,total:sorted.length,periodLabel:kpiData.periodLabel,targetRate:kpiData.targetRate,warnRate:kpiData.warnRate};
    }
  }catch(e){/* KPI bukan critical untuk page ni — kalau gagal, papar training records je macam biasa */}

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
      <option value="">All Scenarios</option>
      ${scenarioNames.map(n=>`<option value="${n}" ${myHistoryFilter.scenario===n?'selected':''}>${n}</option>`).join('')}
    </select>
    <select id="filtMyObjection" onchange="myHistoryFilter.objectionType=this.value;myHistoryPage=1;renderMyHistory();">
      <option value="">All Objection Types</option>
      ${OBJECTION_TYPES.map(t=>`<option value="${t}" ${myHistoryFilter.objectionType===t?'selected':''}>${objectionTypeIcon(t)} ${objectionTypeLabel(t)}</option>`).join('')}
    </select>
    <select id="filtMySkor" onchange="myHistoryFilter.skor=this.value;myHistoryPage=1;renderMyHistory();">
      <option value="">All Scores</option>
      <option value="high" ${myHistoryFilter.skor==='high'?'selected':''}>High (≥70)</option>
      <option value="mid" ${myHistoryFilter.skor==='mid'?'selected':''}>Medium (50-69)</option>
      <option value="low" ${myHistoryFilter.skor==='low'?'selected':''}>Low (&lt;50)</option>
    </select>
    <input type="date" id="filtMyFrom" value="${myHistoryFilter.dateFrom}" onchange="myHistoryFilter.dateFrom=this.value;myHistoryPage=1;renderMyHistory();" title="From date"/>
    <input type="date" id="filtMyTo" value="${myHistoryFilter.dateTo}" onchange="myHistoryFilter.dateTo=this.value;myHistoryPage=1;renderMyHistory();" title="To date"/>
    <button class="btn btn-secondary" onclick="myHistoryFilter={scenario:'',objectionType:'',skor:'',dateFrom:'',dateTo:''};myHistoryPage=1;renderMyHistory();">Reset</button>
  </div>`;
  setContent(`
  <div class="page-header"><div class="page-title">My Training Records</div><div class="page-sub">${sessions.length} of ${mine.length} training sessions</div></div>
  ${myKpi?`
  <div class="card" style="border-left:4px solid ${myKpi.status==='ok'?'var(--green)':myKpi.status==='warn'?'var(--amber)':'var(--red)'}">
    <div class="card-title">📊 KPI Anda — ${esc(myKpi.periodLabel||'Bulan Ini')}</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Collection Rate</div><div class="stat-val">${myKpi.rate.toFixed(1)}%</div><div class="stat-sub">Target ${myKpi.targetRate}%</div></div>
      <div class="stat-card"><div class="stat-label">Jumlah Dikutip</div><div class="stat-val" style="font-size:20px">RM ${Number(myKpi.paid||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
      <div class="stat-card"><div class="stat-label">Ranking Pasukan</div><div class="stat-val">#${myKpi.rank}</div><div class="stat-sub">dari ${myKpi.total} collector</div></div>
    </div>
  </div>`:''}
  ${mine.length>0?filterBar:''}
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📊</div><p>${mine.length===0?'No training sessions yet. Start your first session!':'No sessions match the filter.'}</p></div></div>`:''}
  ${sessions.length>0?`
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Total Sessions</div><div class="stat-val">${sessions.length}</div></div>
    <div class="stat-card"><div class="stat-label">Average Score</div><div class="stat-val">${Math.round(sessions.reduce((a,s)=>a+s.totalScore,0)/sessions.length)}</div><div class="stat-sub">/ 100</div></div>
    <div class="stat-card"><div class="stat-label">Score Tertinggi</div><div class="stat-val">${Math.max(...sessions.map(s=>s.totalScore))}</div></div>
    <div class="stat-card"><div class="stat-label">Most Recent Session</div><div class="stat-val">${sessions[0].totalScore}</div><div class="stat-sub">points</div></div>
  </div>
  ${latestFocus?`
  <div class="card" style="border-left:4px solid var(--purple)">
    <div class="card-title">🎯 Focus For Next Training</div>
    <span class="chip chip-purple">${catIcon(latestFocus.category)} ${catLabel(latestFocus.category)}</span>
    <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:8px">${latestFocus.tip||''}</p>
  </div>`:''}
  <div class="card">
    <div class="card-title">🛠 Most Frequently Needed Improvement Aspects</div>
    ${weakness.length===0?`<div style="font-size:13px;color:var(--text3)">Not enough data yet — keep training to see your mistake patterns.</div>`:
    weakness.slice(0,5).map(([cat,count])=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px">${catIcon(cat)} ${catLabel(cat)}</span>
        <span class="chip chip-red">${count}x detected</span>
      </div>`).join('')}
  </div>
  <div class="card">
    <div class="card-title">🎯 Your Performance By Debtor Type</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Which debtor type you're strongest at / need the most extra training for.</div>
    ${weaknessByObjectionType(sessions).length===0?`<div style="font-size:13px;color:var(--text3)">Not enough data yet.</div>`:
    weaknessByObjectionType(sessions).map(g=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px">${objectionTypeIcon(g.objectionType)} ${objectionTypeLabel(g.objectionType)} <span style="color:var(--text3);font-size:11px">(${g.count} sessions)</span></span>
        <span class="score-pill ${g.avgScore>=70?'score-high':g.avgScore>=50?'score-mid':'score-low'}">${g.avgScore}</span>
      </div>`).join('')}
  </div>
  <div class="card">
    <div class="card-title">Score Trend</div>
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
    <div class="card-title">All Sessions</div>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Scenario</th><th>Duration</th><th>Score</th><th>Date</th><th></th></tr>
      ${pageSessions.map((s,i)=>`<tr>
        <td>${sessions.length-pageStart-i}</td>
        <td>${esc(s.scenarioName)}</td>
        <td>${s.duration}</td>
        <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
        <td style="font-size:12px">${fmtDateTime(s.date)}</td>
        <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">View</button></td>
      </tr>`).join('')}
    </table></div>
    ${paginationBar(myHistoryPage,sessions.length,SESSIONS_PAGE_SIZE,'goMyHistoryPage')}
  </div>`:''}
  `);
}

async function renderCollectors(){
  const users=await loadUsers();
  const sessions=await loadSessions();
  const scenarios=await loadScenarios();
  const collectors=users.filter(u=>u.role==='collector');
  setContent(`
  <div class="page-header"><div class="page-title">All Collectors</div><div class="page-sub">${collectors.length} collectors registered</div></div>
  <div class="card" style="padding-bottom:0">
    <div style="display:flex;justify-content:flex-end;padding:0 0 12px">
      <button class="btn btn-secondary" onclick="exportCollectorsSummaryCSV()">📊 Export Summary CSV</button>
    </div>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>ID</th><th>Sessions</th><th>Average</th><th>Highest</th><th>Weak Aspect</th><th>Weakest Debtor Type</th><th>Recommended Scenario</th><th>Harassment</th><th>Last Session</th><th>Actions</th></tr>
      ${collectors.map(c=>{
        const cs=sessions.filter(s=>s.collectorId===c.id);
        const avg=cs.length?Math.round(cs.reduce((a,s)=>a+s.totalScore,0)/cs.length):'-';
        const best=cs.length?Math.max(...cs.map(s=>s.totalScore)):'-';
        const last=cs.length?cs[cs.length-1]:null;
        const weakLabel=cs.length?topWeaknessLabel(cs):'-';
        // Jenis penghutang yang collector ni paling lemah (avg score terendah,
        // min 2 sesi jenis tu supaya bukan dari 1 sesi outlier).
        const csWeakTypes=weaknessByObjectionType(cs).filter(g=>g.count>=2);
        const weakType=csWeakTypes.length?csWeakTypes[0]:null;
        // Fasa 3, versi manager: sama logic Collector Target Plan macam di
        // Voice Training collector — tapi sini cuma untuk VISIBILITY manager,
        // bukan paksa assign (sistem ni takde mekanisme "assignment wajib").
        let recoScenario=null;
        if(weakType){
          const candidates=scenarios.filter(s=>s.objectionType===weakType.objectionType);
          if(candidates.length){
            const triedCounts={};
            cs.forEach(s=>{triedCounts[s.scenarioId]=(triedCounts[s.scenarioId]||0)+1;});
            recoScenario=candidates.slice().sort((a,b)=>(triedCounts[a.id]||0)-(triedCounts[b.id]||0))[0];
          }
        }
        const harassCount=cs.filter(s=>s.harassmentRisk&&s.harassmentRisk!=='none').length;
        const isOpen=expandedCollectorRow===c.id;
        const row=`<tr style="cursor:pointer;${isOpen?'background:var(--surface2)':''}" onclick="toggleCollectorRow('${c.id}')">
          <td><div style="font-weight:500;display:flex;align-items:center;gap:6px">
            <span style="font-size:9px;color:var(--text3);display:inline-block;transition:transform .15s;transform:rotate(${isOpen?90:0}deg)">▶</span>
            ${esc(c.name)}
          </div></td>
          <td><span class="chip chip-purple">${c.id}</span></td>
          <td>${cs.length}</td>
          <td>${typeof avg==='number'?`<span class="score-pill ${avg>=70?'score-high':avg>=50?'score-mid':'score-low'}">${avg}</span>`:'-'}</td>
          <td>${typeof best==='number'?`<span class="score-pill score-high">${best}</span>`:'-'}</td>
          <td>${weakLabel!=='-'?`<span class="chip chip-amber">${weakLabel}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td>${weakType?`<span class="chip chip-red" style="font-size:11px">${objectionTypeIcon(weakType.objectionType)} ${objectionTypeLabel(weakType.objectionType)} (${weakType.avgScore})</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td>${recoScenario?`<span style="font-size:12px">${recoScenario.emoji} ${esc(recoScenario.title)}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td>${harassCount>0?`<span class="chip chip-red">⚠ ${harassCount}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td style="font-size:12px;color:var(--text3)">${last?fmtDateTime(last.date):'-'}</td>
          <td>${cs.length?`<button class="btn btn-secondary" style="padding:4px 9px;font-size:11px" onclick="event.stopPropagation();exportCoachingMemo('${c.id}')">📄 Memo</button>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
        </tr>`;
        const recentCs=cs.slice().reverse().slice(0,10);
        const detail=isOpen?`<tr style="background:var(--surface2)"><td colspan="11" style="padding:0 16px 18px">
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;animation:fadeIn .15s ease">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
              <div style="font-size:12px;font-weight:700">Sesi terkini — ${esc(c.name)} (${recentCs.length} dari ${cs.length} jumlah)</div>
              <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="event.stopPropagation();viewCollectorSessions('${c.id}')">View all in Sessions →</button>
            </div>
            ${recentCs.length===0?`<div style="font-size:12px;color:var(--text3);padding:6px 0">Belum ada sesi latihan untuk collector ini.</div>`:`
            <div class="table-wrap"><table>
              <tr><th>Date</th><th>Scenario</th><th>Objection</th><th>Duration</th><th>Score</th><th>Harassment</th><th></th></tr>
              ${recentCs.map(s=>`<tr>
                <td style="font-size:12px;color:var(--text3)">${fmtDateTime(s.date)}</td>
                <td style="font-size:12px">${esc(s.scenarioName)}</td>
                <td>${s.objectionType?`<span class="chip chip-amber" style="font-size:10px">${objectionTypeIcon(s.objectionType)} ${objectionTypeLabel(s.objectionType)}</span>`:'<span style="color:var(--text3);font-size:11px">-</span>'}</td>
                <td style="font-size:12px">${s.duration}</td>
                <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
                <td>${s.harassmentRisk&&s.harassmentRisk!=='none'?`<span class="chip chip-red" style="font-size:10px">⚠ ${s.harassmentRisk}</span>`:'<span style="color:var(--text3);font-size:11px">-</span>'}</td>
                <td><button class="btn btn-secondary" style="padding:3px 9px;font-size:11px" onclick="event.stopPropagation();viewSession('${s.id}')">View</button></td>
              </tr>`).join('')}
            </table></div>`}
          </div>
        </td></tr>`:'';
        return row+detail;
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
  <div class="page-header"><div class="page-title">Training Sessions</div><div class="page-sub">${sessions.length} of ${allSessions.length} sessions</div></div>
  <div class="card filter-bar">
    <select id="filtSessionsCollector" onchange="sessionsFilter.collectorId=this.value;sessionsPage=1;renderSessions();">
      <option value="">All Collectors</option>
      ${collectors.map(c=>`<option value="${c.id}" ${sessionsFilter.collectorId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
    </select>
    <select id="filtSessionsScenario" onchange="sessionsFilter.scenario=this.value;sessionsPage=1;renderSessions();">
      <option value="">All Scenarios</option>
      ${scenarioNames.map(n=>`<option value="${n}" ${sessionsFilter.scenario===n?'selected':''}>${n}</option>`).join('')}
    </select>
    <select id="filtSessionsObjection" onchange="sessionsFilter.objectionType=this.value;sessionsPage=1;renderSessions();">
      <option value="">All Objection Types</option>
      ${OBJECTION_TYPES.map(t=>`<option value="${t}" ${sessionsFilter.objectionType===t?'selected':''}>${objectionTypeIcon(t)} ${objectionTypeLabel(t)}</option>`).join('')}
    </select>
    <select id="filtSessionsSkor" onchange="sessionsFilter.skor=this.value;sessionsPage=1;renderSessions();">
      <option value="">All Scores</option>
      <option value="high" ${sessionsFilter.skor==='high'?'selected':''}>High (≥70)</option>
      <option value="mid" ${sessionsFilter.skor==='mid'?'selected':''}>Medium (50-69)</option>
      <option value="low" ${sessionsFilter.skor==='low'?'selected':''}>Low (&lt;50)</option>
    </select>
    <input type="date" id="filtSessionsFrom" value="${sessionsFilter.dateFrom}" onchange="sessionsFilter.dateFrom=this.value;sessionsPage=1;renderSessions();" title="From date"/>
    <input type="date" id="filtSessionsTo" value="${sessionsFilter.dateTo}" onchange="sessionsFilter.dateTo=this.value;sessionsPage=1;renderSessions();" title="To date"/>
    <button class="btn btn-secondary" onclick="sessionsFilter={collectorId:'',scenario:'',objectionType:'',skor:'',dateFrom:'',dateTo:''};sessionsPage=1;renderSessions();">Reset</button>
    <button class="btn btn-secondary" onclick="exportCurrentSessionsCSV()">📊 Export CSV (${sessions.length})</button>
  </div>
  ${sessions.length===0?`<div class="card"><div class="empty-state"><div class="es-icon">📋</div><p>No training sessions match the filter.</p></div></div>`:''}
  ${sessions.length>0?`<div class="card">
    <div class="table-wrap"><table>
      <tr><th>Collector</th><th>Scenario</th><th>Objection</th><th>Duration</th><th>Score</th><th>Harassment Risk</th><th>Date</th><th></th></tr>
      ${pageSessions.map(s=>{
        const u=findUserById(users,s.collectorId);
        return`<tr>
          <td><div style="font-weight:500">${esc(u?u.name:'—')}</div><div style="font-size:11px;color:var(--text3)">${esc(s.collectorId)}</div></td>
          <td>${esc(s.scenarioName)}</td>
          <td>${s.objectionType?`<span class="chip chip-amber" style="font-size:11px">${objectionTypeIcon(s.objectionType)} ${objectionTypeLabel(s.objectionType)}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td>${s.duration}</td>
          <td><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}</span></td>
          <td>${s.harassmentRisk&&s.harassmentRisk!=='none'?`<span class="chip chip-red">⚠ ${s.harassmentRisk}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td style="font-size:12px;color:var(--text3)">${fmtDateTime(s.date)}</td>
          <td><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="viewSession('${s.id}')">View</button></td>
        </tr>`;
      }).join('')}
    </table></div>
    ${paginationBar(sessionsPage,sessions.length,SESSIONS_PAGE_SIZE,'goSessionsPage')}
  </div>`:''}
  `);
}

async function viewSession(id){
  const all=await loadSessions();
  const light=all.find(s=>s.id===id);
  if(!light)return;
  // Collector tengok rekod sendiri = tak payah call /api/users (route tu
  // admin/manager-only, collector akan dapat 403). currentUser dah cukup.
  const u=currentUser.role==='collector'?currentUser:findUserById(await loadUsers(),light.collectorId);
  // Papar modal dengan data ringkas dulu (segera), transcript "loading..."
  // sementara — elak modal terperap kosong semasa tunggu fetch detail penuh.
  openModal(sessionDetailHTML(light,u,'loading'));
  let s=light;
  try{
    s=await sessionApi.getById(id);
  }catch(e){
    // Gagal tarik detail penuh (transcript) — papar apa yang ada je, dengan notis.
  }
  openModal(sessionDetailHTML(s,u,s.transcript?'ready':'error'));
}
function sessionDetailHTML(s,u,transcriptState){
  return`
  <div class="modal-title">📋 Training Session Detail</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
    <div><div style="font-size:12px;color:var(--text3)">Collector</div><div style="font-weight:500">${esc(u?u.name:'—')}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Scenario</div><div style="font-weight:500">${esc(s.scenarioName)}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Debtor Type</div><div style="font-weight:500">${s.objectionType?`${objectionTypeIcon(s.objectionType)} ${objectionTypeLabel(s.objectionType)}`:'-'}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Masa</div><div style="font-weight:500">${s.duration}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Date & Waktu</div><div style="font-weight:500">${fmtDateTime(s.date)}</div></div>
    <div><div style="font-size:12px;color:var(--text3)">Score</div><span class="score-pill ${s.totalScore>=70?'score-high':s.totalScore>=50?'score-mid':'score-low'}">${s.totalScore}/100</span></div>
  </div>
  ${s.harassmentRisk&&s.harassmentRisk!=='none'?`<div class="alert alert-err" style="display:block">⚠ <strong>Isu Pematuhan/Harassment (${s.harassmentRisk}):</strong> ${esc(s.harassmentNote)}</div>`:''}
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
  <p style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:1rem">${esc(s.feedback)}</p>
  ${(s.strengths&&s.strengths.length)?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">✅ Strengths</div>
  ${s.strengths.map(t=>`<div style="font-size:12px;color:var(--text2);margin-bottom:4px">• ${esc(t)}</div>`).join('')}
  <hr class="divider"/>`:''}
  ${(s.missed&&s.missed.length)?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">🛠 Perlu Diperbaiki (untuk coaching)</div>
  ${s.missed.map(m=>`
  <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
    <span class="chip chip-red" style="font-size:11px">${catIcon(m.category)} ${catLabel(m.category)}</span>
    <div style="font-size:12px;color:var(--text);margin-top:4px"><strong>Isu:</strong> ${esc(m.issue)}</div>
    ${m.quote?`<div style="font-size:11px;color:var(--text3);font-style:italic;margin:2px 0">"${esc(m.quote)}"</div>`:''}
    <div style="font-size:12px;color:var(--brand)"><strong>Cadangan:</strong> ${esc(m.suggestion)}</div>
  </div>`).join('')}
  <hr class="divider"/>`:''}
  ${s.priorityFocus?`
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">🎯 Focus For Next Training</div>
  <div style="margin-bottom:1rem">
    <span class="chip chip-purple" style="font-size:11px">${catIcon(s.priorityFocus.category)} ${catLabel(s.priorityFocus.category)}</span>
    <div style="font-size:12px;color:var(--text2);margin-top:4px">${s.priorityFocus.tip||''}</div>
  </div>
  <hr class="divider"/>`:''}
  <div style="font-size:13px;font-weight:500;margin-bottom:8px">📝 Transcript Penuh</div>
  <div style="background:var(--bg);border-radius:6px;padding:10px">
    ${transcriptState==='loading'?`<div style="font-size:12px;color:var(--text3);padding:8px 0">⏳ Loading transcript...</div>`:
      transcriptState==='error'?`<div style="font-size:12px;color:var(--red);padding:8px 0">⚠ Gagal load transcript. Cuba tutup dan buka semula.</div>`:
      (s.transcript||[]).map(m=>`<div style="margin-bottom:10px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${esc(m.role==='user'?(u?u.name:'Collector'):'Debtor')}</div>
      <div style="padding:6px 10px;border-radius:6px;font-size:12px;line-height:1.6;background:${m.role==='user'?'var(--purple-light)':'var(--surface)'};color:${m.role==='user'?'var(--purple)':'var(--text)'}">
        ${esc(m.content)}
      </div></div>`).join('')}
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div>`;
}

async function renderScenarios(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Manage Scenarios</div></div><div class="card">Loading scenarios...</div>');
  let scenarios, sessions;
  try{
    scenarios=await loadScenarios(true); // force=true: manager perlu data terkini, bukan cache lama
    sessions=await loadSessions();
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Manage Scenarios</div></div><div class="card">⚠ Failed to load scenarios: ${e.message}</div>`);
    return;
  }
  // Weakness-to-scenario link: cadang jenis senario apa nak fokus seterusnya,
  // berdasarkan data sesi sebenar (bukan tekaan manager). Minimum 3 sesi
  // supaya cadangan ni ada asas data, bukan dari 1-2 sesi outlier.
  const weakGroups=weaknessByObjectionType(sessions).filter(g=>g.count>=3);
  const recommendation=weakGroups.length?weakGroups[0]:null; // dah sorted, avgScore terendah dahulu
  const recommendationBanner=recommendation?`
  <div class="card" style="border-left:4px solid var(--amber)">
    <div class="card-title">🎯 Recommended Focus <span style="font-weight:400;color:var(--text3);font-size:11px">(auto-generated from real session data)</span></div>
    <p style="font-size:13px;color:var(--text2);line-height:1.6">Team is weakest against <b>${objectionTypeLabel(recommendation.objectionType)}</b> type debtors — avg score <b>${recommendation.avgScore}/100</b> from ${recommendation.count} sessions${recommendation.topWeakCat?`, especially on the <b>${catLabel(recommendation.topWeakCat)}</b> skill (${recommendation.topWeakCount}x missed)`:''}.</p>
    <button class="btn btn-primary" style="margin-top:6px;font-size:12px" onclick="openAddScenario(null,'${recommendation.objectionType}')">+ Create New ${objectionTypeLabel(recommendation.objectionType)} Scenario</button>
  </div>`:'';
  setContent(`
  <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div class="page-title">Manage Scenarios</div><div class="page-sub">${scenarios.length} scenarios available</div></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" onclick="openAiScenarioBuilder()">🤖 AI Scenario Builder</button>
      <button class="btn btn-primary" onclick="openAddScenario()">+ Add Scenario</button>
    </div>
  </div>
  ${recommendationBanner}
  <div class="card">
    <div class="table-wrap"><table>
      <tr><th>Emoji</th><th>Name</th><th>Client</th><th>Title</th><th>Objection</th><th>Customer Type</th><th>Debt</th><th>Balance</th><th>Level</th><th>Checklist</th><th>Actions</th></tr>
      ${scenarios.map(s=>`<tr>
        <td style="font-size:20px">${s.emoji}</td>
        <td><div style="font-weight:500">${esc(s.name)}</div></td>
        <td>${s.client?`<span class="chip chip-purple">${esc(s.client)}</span>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
        <td>${esc(s.title)}</td>
        <td><span class="chip chip-amber" style="font-size:11px">${objectionTypeIcon(s.objectionType)} ${objectionTypeLabel(s.objectionType)}</span></td>
        <td><span style="font-size:12px;color:var(--text2)">${customerTypeLabel(s.customerType)}</span></td>
        <td>${s.amount}</td>
        <td><span class="chip ${s.balanceTier==='high'?'chip-red':'chip-green'}">${s.balanceTier==='high'?'High':'Low'}</span></td>
        <td><span class="level-badge level-${s.level}">${s.level==='easy'?'Easy':s.level==='med'?'Medium':'Hard'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${(s.checklist||[]).length} item${(s.checklist||[]).filter(c=>c.critical).length?` · ⚠️${(s.checklist||[]).filter(c=>c.critical).length}`:''}${(s.disclosures||[]).length?` · 📢${(s.disclosures||[]).length}`:''}</td>
        <td><div class="action-row">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="editScenario('${s.id}')">Edit</button>
          <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteScenario('${s.id}')">Delete</button>
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
    customerType:(document.getElementById('scCustomerType')||{}).value||'other',
    objectionType:(document.getElementById('scObjectionType')||{}).value||'cooperative',
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
      .map(r=>({cat:r.querySelector('.cl-cat').value,text:r.querySelector('.cl-text').value,critical:r.querySelector('.cl-critical').checked})),
    scoreWeights:Object.fromEntries(SCORE_CATS.map(c=>{const el=document.getElementById('scWeight_'+c);return [c,el?el.value:'1'];})),
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
    ind.textContent='Draft auto-saved '+new Date().toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'});
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
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!==undefined&&val!==null&&val!=='')el.value=val;};
  set('scEmoji',draft.emoji);
  set('scName',draft.name);
  set('scGender',draft.gender);
  set('scAccent',draft.accent);
  set('scTitle',draft.title);
  set('scAmount',draft.amount);
  set('scDays',draft.days);
  set('scLevel',draft.level);
  set('scBalanceTier',draft.balanceTier);
  set('scCustomerType',draft.customerType);
  set('scObjectionType',draft.objectionType);
  set('scPrompt',draft.prompt);
  set('scIc',draft.icNumber);
  set('scAccNumber',draft.accNumber);
  set('scServiceNo',draft.serviceNo);
  set('scAccType',draft.accType);
  set('scRegDate',draft.regDate);
  set('scTermDate',draft.termDate);
  if(draft.scoreWeights){SCORE_CATS.forEach(c=>{const el=document.getElementById('scWeight_'+c);if(el&&draft.scoreWeights[c])el.value=draft.scoreWeights[c];});}
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

// ═══════════════════════════════════════════════════════════════════
// FASA 4 (advanced): AI Scenario Builder — "import" dari voice log CRM
// ═══════════════════════════════════════════════════════════════════
// NOTA PENTING: app ni TAKADA sambungan terus ke Volare/CRM (takde API
// key/integration). "Import" sebenar di sini = manager COPY-PASTE
// transkrip/nota call dari CRM ke dalam kotak teks — itu cara paling
// selamat & realistic memandangkan CRM kau tertutup (bukan public API).
// PII REDACTION berjalan di BROWSER (client-side) SEBELUM apa-apa teks
// dihantar ke Claude — supaya IC/no. telefon/no. akaun sebenar tak
// terhantar keluar walaupun manager terlupa nak edit dulu.
function redactPII(text){
  let redacted=text||'';
  const found=[];
  // IC Malaysia: 123456-12-1234 atau 12 digit tanpa dash
  redacted=redacted.replace(/\b\d{6}-?\d{2}-?\d{4}\b/g,m=>{found.push('IC: '+m);return '[IC DIRAHSIAKAN]';});
  // No telefon: 01X-XXXXXXX / 01XXXXXXXXX / landline 0X-XXXXXXX
  redacted=redacted.replace(/\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4,5}\b/g,m=>{found.push('Telefon: '+m);return '[NO TELEFON DIRAHSIAKAN]';});
  // No akaun/rujukan (8-16 digit) — sengaja agresif sikit (boleh false-positive
  // pada amount besar) sebab lagi baik over-redact daripada terlepas PII sebenar.
  redacted=redacted.replace(/\b\d{8,16}\b/g,m=>{found.push('No. Akaun/Rujukan: '+m);return '[NO AKAUN DIRAHSIAKAN]';});
  return {redacted,found};
}

// ── Job Sheet redaction (key-based) ─────────────────────────────────────
// Job sheet CRM (Volare) formatnya BERSTRUKTUR — setiap field sensitif ada
// LABEL jelas di depan ("ACCOUNT NO :", "CARD NO 1 :", "NEW IC NO :"...).
// Regex nombor-je (redactPII di atas) terlepas value yang campur huruf+nombor
// (cth no. kad "PDRFRL2060420264100009"), so kita redact ikut LABEL dulu —
// apa-apa value lepas label sensitif terus dibuang, tak kira format dia.
// Lepas tu kita run redactPII jugak sebagai "net" untuk apa-apa PII yang
// tersebut bebas dalam remarks log (cth no. telefon ditaip dalam nota call).
const JOB_SHEET_SENSITIVE_LABELS=[
  'IC NO','NEW IC NO','OLD IC NO','NEW IC','OLD IC','IC NUMBER','NRIC',
  'ACCOUNT NO','ACC NO','A/C NO',
  'CARD NO','CARD NUMBER',
  'CUSTOMER NAME','NAME','CONTACT PERSON','RELATION NAME',
  'ADDRESS','HOME ADDRESS','MAILING ADDRESS',
  'CONTACT NO','CONTACTNO','PHONE','MOBILE','TEL NO','H/P',
  'EMAIL',
];
function redactJobSheet(text){
  let redacted=text||'';
  const found=[];
  let customerName=null;
  // Padan baris bentuk "LABEL : value" (job sheet Volare guna layout 2 lajur
  // bersebelahan dalam 1 baris fizikal, so kita stop value bila jumpa 3+
  // space berturut — itu tanda sempadan lajur seterusnya, bukan newline je).
  // "(?:^|\s{2,})" depan label elak terpadan label yang muncul SEBAGAI
  // sebahagian perkataan lain (cth "Relation name:" — bukan field "NAME").
  // "\s*\d{0,2}\s*:" benarkan index field macam "CARD NO1 :" (TANPA \b
  // selepas label sebab \b gagal antara huruf-ke-digit yang bercantum terus).
  const labelPattern=JOB_SHEET_SENSITIVE_LABELS.map(l=>l.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const re=new RegExp(`(^|\\s{2,})(${labelPattern})\\s*\\d{0,2}\\s*:\\s*([^\\n]*?)(?=\\s{3,}\\S|\\n|$)`,'gim');
  redacted=redacted.replace(re,(m,lead,label,value)=>{
    if(!value.trim())return m; // medan kosong, tiada apa nak redact
    found.push(`${label.trim()}: ${value.trim()}`);
    // Simpan nama penghutang utama — dipakai lepas ni untuk scrub sebutan
    // bebas nama dia di bahagian LAIN dokumen (cth "Relationship:"/"ATTN:"
    // sering sebut nama sama TANPA label "NAME" terus depan dia, so regex
    // label-based ni je tak cukup tangkap — kena cari & ganti global jugak).
    if(/^CUSTOMER NAME$/i.test(label.trim())&&value.trim().length>2)customerName=value.trim();
    return `${lead}${label} : [DIRAHSIAKAN]`;
  });
  if(customerName){
    const escaped=customerName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
    const nameRe=new RegExp(escaped,'gi');
    redacted=redacted.replace(nameRe,(m)=>{found.push('Sebutan nama lain: '+m);return '[DIRAHSIAKAN]';});
  }
  // Safety net — regex nombor (IC/telefon/no.akaun) untuk apa-apa yang
  // disebut tanpa label jelas, cth dalam remarks log.
  const {redacted:redacted2,found:found2}=redactPII(redacted);
  return {redacted:redacted2,found:[...found,...found2]};
}

function openAiScenarioBuilder(){
  window.__aiBuilderMode='transcript';
  openModal(`
  <div class="modal-title">🤖 AI Scenario Builder</div>
  <p style="font-size:12px;color:var(--text3);line-height:1.6;margin-bottom:10px">Paste real data from CRM/Volare below. The system will <b>auto-redact PII</b> (IC, phone no., account no., card no., name, address) in your browser before anything is sent to the AI, then the AI will suggest a draft scenario for you to review &amp; edit — not auto-published directly.</p>

  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button type="button" id="srcModeTranscript" onclick="setAiBuilderMode('transcript')" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 10px;min-height:80px;border-radius:10px;cursor:pointer;border:2px solid #4F46E5;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-align:center;font-family:inherit;box-shadow:0 4px 12px rgba(79,70,229,0.35)">
      <span style="font-size:20px;line-height:1">💬</span>
      <span style="font-size:12px;font-weight:700;line-height:1.3;letter-spacing:.01em">Transkrip Call</span>
      <span style="font-size:10px;opacity:.85;font-weight:400;line-height:1.3">Paste dialog/perbualan sebenar</span>
    </button>
    <button type="button" id="srcModeJobSheet" onclick="setAiBuilderMode('jobsheet')" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 10px;min-height:80px;border-radius:10px;cursor:pointer;border:2px solid #D1D5DB;background:#fff;color:#4B5563;text-align:center;font-family:inherit;box-shadow:0 1px 4px rgba(0,0,0,0.06)">
      <span style="font-size:20px;line-height:1">📄</span>
      <span style="font-size:12px;font-weight:600;line-height:1.3">Job Sheet CRM</span>
      <span style="font-size:10px;opacity:.7;font-weight:400;line-height:1.3">Paste/import job sheet/case history</span>
    </button>
  </div>

  <div class="form-row"><label id="aiInputLabel">Transkrip / Nota Call</label>
    <div id="aiImportZone" onclick="document.getElementById('aiFileInput').click()" ondragover="event.preventDefault();this.style.borderColor='var(--purple)'" ondragleave="this.style.borderColor='var(--border2)'" ondrop="handleAiFileDrop(event)" style="border:1.5px dashed var(--border2);border-radius:8px;padding:14px;text-align:center;cursor:pointer;margin-bottom:8px;transition:border-color .15s">
      <div style="font-size:13px;font-weight:500">📤 Click to import file, or drag &amp; drop</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">PDF, TXT, or CSV export from CRM/Volare</div>
      <input type="file" id="aiFileInput" accept=".pdf,.txt,.csv" style="display:none" onchange="handleAiFileSelect(event)" />
    </div>
    <div id="aiImportStatus"></div>
    <div style="font-size:11px;color:var(--text3);margin:6px 0">— or paste text manually below —</div>
    <textarea id="aiTranscriptInput" rows="8" placeholder="Contoh:&#10;Collector: Selamat pagi Encik Ahmad, saya dari NewVest Recoveries...&#10;Debtor: Saya tak ada duit lah sekarang, kerja pun kena cut...&#10;..."></textarea>
  </div>
  <div id="aiRedactPreview"></div>
  <div style="display:flex;gap:8px;margin-top:10px">
    <button class="btn btn-secondary" onclick="previewRedaction()">🔒 Redact &amp; Preview</button>
    <button class="btn btn-primary" id="btnGenAiDraft" onclick="generateScenarioDraftFromTranscript()" disabled>🤖 Generate Scenario Draft (AI)</button>
  </div>
  <div id="aiDraftOut" style="margin-top:14px"></div>
  `);
}
function setAiBuilderMode(mode){
  const prev=window.__aiBuilderMode;
  window.__aiBuilderMode=mode;
  const isTranscript=mode==='transcript';
  const tBtn=document.getElementById('srcModeTranscript');
  const jBtn=document.getElementById('srcModeJobSheet');
  // Active button — purple fill
  const activeStyle='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 10px;min-height:80px;border-radius:10px;cursor:pointer;border:2px solid #4F46E5;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff;text-align:center;font-family:inherit;box-shadow:0 4px 12px rgba(79,70,229,0.35)';
  const inactiveStyle='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:14px 10px;min-height:80px;border-radius:10px;cursor:pointer;border:2px solid #D1D5DB;background:#fff;color:#4B5563;text-align:center;font-family:inherit;box-shadow:0 1px 4px rgba(0,0,0,0.06)';
  tBtn.style.cssText=isTranscript?activeStyle:inactiveStyle;
  jBtn.style.cssText=!isTranscript?activeStyle:inactiveStyle;
  document.getElementById('aiInputLabel').textContent=isTranscript?'Transkrip / Nota Call':'Job Sheet / Case History (export dari CRM)';
  const ta=document.getElementById('aiTranscriptInput');
  ta.placeholder=isTranscript
    ?'Contoh:\nCollector: Selamat pagi Encik Ahmad, saya dari NewVest Recoveries...\nDebtor: Saya tak ada duit lah sekarang, kerja pun kena cut...\n...'
    :'Paste job sheet penuh dari CRM/Volare di sini (info akaun + remarks log setiap attempt call)...';
  // Clear textarea bila tukar mode — elak content lama bercampur
  if(prev && prev!==mode){
    ta.value='';
    delete ta.dataset.redacted;
  }
  // Reset semua preview/draft/status
  document.getElementById('aiRedactPreview').innerHTML='';
  document.getElementById('aiDraftOut').innerHTML='';
  document.getElementById('aiImportStatus').innerHTML='';
  document.getElementById('aiFileInput').value='';
  document.getElementById('btnGenAiDraft').disabled=true;
}

// ── Import file (PDF/TXT/CSV) terus ke textarea — alternatif untuk
// copy-paste manual. Extract text jalan di SERVER (/api/parse-document,
// guna pdf-parse) — PDF tak boleh di-parse selamat 100% kat browser tanpa
// load library besar, so kita hantar fail mentah (BUKAN PII redacted lagi,
// sebab redaction perlukan teks plain dulu) ke server kita sendiri untuk
// extract teks. Selepas teks balik, redaction PII jalan di BROWSER macam
// biasa sebelum apa-apa pergi ke AI — server parse cuma "baca" fail,
// tak pernah hantar kandungan fail ke mana-mana selain balik ke browser ni.
function handleAiFileDrop(ev){
  ev.preventDefault();
  ev.currentTarget.style.borderColor='var(--border2)';
  const file=ev.dataTransfer.files[0];
  if(file)importAiFile(file);
}
function handleAiFileSelect(ev){
  const file=ev.target.files[0];
  if(file)importAiFile(file);
}
async function importAiFile(file){
  const status=document.getElementById('aiImportStatus');
  status.innerHTML='<div style="font-size:12px;color:var(--text3);margin-top:6px">⏳ Reading '+file.name+'...</div>';
  try{
    const fd=new FormData();
    fd.append('file',file);
    const token=localStorage.getItem('ct_session_token')||'';
    const res=await fetch('/api/parse-document',{method:'POST',headers:{'x-session-token':token},body:fd});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to read file.');
    document.getElementById('aiTranscriptInput').value=data.text;
    status.innerHTML=`<div class="alert alert-ok" style="display:block;margin-top:6px">✓ Imported "${file.name}" (${data.text.length} characters). Please click "Redact &amp; Preview" next.</div>`;
    // Reset preview/draft lama (kalau ada) sebab textarea content dah ganti
    document.getElementById('aiRedactPreview').innerHTML='';
    document.getElementById('aiDraftOut').innerHTML='';
    document.getElementById('btnGenAiDraft').disabled=true;
    delete document.getElementById('aiTranscriptInput').dataset.redacted;
  }catch(e){
    status.innerHTML=`<div class="alert alert-err" style="display:block;margin-top:6px">⚠ ${e.message}</div>`;
  }
}

function previewRedaction(){
  const raw=document.getElementById('aiTranscriptInput').value;
  const mode=window.__aiBuilderMode||'transcript';
  const box=document.getElementById('aiRedactPreview');
  if(!raw.trim()){box.innerHTML='<div class="alert alert-err" style="display:block">Sila paste '+(mode==='jobsheet'?'job sheet':'transkrip')+' dahulu.</div>';return;}
  // Safety net: kesan kalau teks yang ditampal NAMPAK macam job sheet
  // (banyak field "LABEL :" macam "ACCOUNT NO", "CUSTOMER NAME") tapi mod
  // "Transkrip Call" yang aktif — kalau diteruskan, redaction guna regex
  // je (bukan key-based), risiko PII job sheet (cth no. kad alphanumeric)
  // terlepas. Beri amaran & block proceed sehingga manager confirm/tukar mod.
  const jobSheetSignals=(raw.match(/\b(ACCOUNT NO|CUSTOMER NAME|CARD NO|IC NO|OUTSTANDING AMT|AGING DAYS)\s*\d{0,2}\s*:/gi)||[]).length;
  if(mode==='transcript'&&jobSheetSignals>=3){
    box.innerHTML=`<div class="alert alert-warn" style="display:block">⚠ Teks ni nampak macam <b>job sheet CRM</b> (jumpa ${jobSheetSignals} field macam "ACCOUNT NO :", "CUSTOMER NAME :"...), bukan transkrip dialog. Mod "Transkrip Call" guna kaedah redaction yang kurang sesuai untuk format ni. <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;margin-left:4px" onclick="setAiBuilderMode('jobsheet');previewRedaction()">Tukar ke mod Job Sheet</button></div>`;
    return;
  }
  const {redacted,found}=mode==='jobsheet'?redactJobSheet(raw):redactPII(raw);
  box.innerHTML=`
    <div class="alert ${found.length?'alert-warn':'alert-ok'}" style="display:block;margin-top:8px">
      ${found.length?`⚠ ${found.length} item PII dah di-redact: <i>${found.slice(0,6).join(', ')}${found.length>6?` +${found.length-6} lagi`:''}</i>`:'✓ Tiada PII jelas dikesan, tapi sila semak manual sekali lagi.'}
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:6px;font-size:12px;white-space:pre-wrap;max-height:160px;overflow:auto">${redacted.replace(/</g,'&lt;')}</div>`;
  // Simpan versi redacted utk hantar ke AI (bukan raw asal)
  document.getElementById('aiTranscriptInput').dataset.redacted=redacted;
  document.getElementById('btnGenAiDraft').disabled=false;
}

async function generateScenarioDraftFromTranscript(){
  const btn=document.getElementById('btnGenAiDraft');
  const out=document.getElementById('aiDraftOut');
  const redacted=document.getElementById('aiTranscriptInput').dataset.redacted||'';
  const mode=window.__aiBuilderMode||'transcript';
  if(!redacted.trim()){out.innerHTML='<div class="alert alert-err" style="display:block">Please click "Redact &amp; Preview" first before generating.</div>';return;}
  btn.disabled=true;btn.textContent='Menjana draf...';
  out.innerHTML='<div style="font-size:13px;color:var(--text3)">⏳ AI sedang analisis '+(mode==='jobsheet'?'job sheet':'transkrip')+'...</div>';
  try{
    const prompt=mode==='jobsheet'?`Anda pereka senario latihan untuk syarikat pemulihan hutang telco di Malaysia. Di bawah ialah JOB SHEET / CASE HISTORY SEBENAR dari sistem CRM (PII dah di-redact — JANGAN cuba teka/isi balik IC/no.telefon/no.akaun/nama sebenar). Job sheet ni mengandungi info akaun (amount, aging) dan LOG REMARKS — ringkasan setiap attempt call/SMS secara kronologi, BUKAN transkrip dialog penuh. Remarks sering guna singkatan: SW=Spoke With, CM=Customer, PTP=Promise to Pay, RNA=Ring No Answer, HG UP=Hang Up, VM=Voice Mail, BP=Broken Promise, CTC=Contact.

"""
${redacted}
"""

TUGAS ANDA: baca KESELURUHAN log remarks (bukan satu entry je) dan kenal pasti CORAK TINGKAH LAKU penghutang ni merentas pelbagai attempt — cth adakah dia jenis selalu bagi PTP tapi broken promise berulang kali, jenis terus elak/RNA, jenis bagi alasan konsisten (kerja/kesihatan/komisen), jenis agresif/hang up, dsb. Guna corak tu untuk reka satu watak penghutang yang REALISTIK untuk roleplay — bukan cuma rephrase satu remarks entry.

Hasilkan draf senario latihan dalam format JSON SAHAJA (tiada teks lain, tiada markdown fence), dengan struktur EXACT macam ni:
{
  "emoji": "(satu emoji sesuai mood/corak penghutang)",
  "name": "(nama watak fiktif, BUKAN nama sebenar dari job sheet)",
  "title": "(tajuk pendek senario, cth 'Penghutang Serial Broken Promise - Alasan Komisen')",
  "description": "(1 ayat ringkas situasi & corak tingkah laku)",
  "amount": "(EKSTRAK nilai sebenar field OUTSTANDING AMT/OUTSTANDING BALANCE dari job sheet jika ada, format 'RM' diikuti nombor & koma ribuan cth 'RM1,234.50' — JANGAN reka nilai, set null jika field ni tiada dalam job sheet)",
  "days": "(EKSTRAK nilai sebenar field AGING DAYS/DAYS PAST DUE dari job sheet jika ada, sebagai integer — JANGAN reka nilai, set null jika field ni tiada dalam job sheet)",
  "level": "easy|med|hard",
  "balanceTier": "low|high",
  "objectionType": "cooperative|denial|hardship|aggressive|avoidance",
  "customerType": "suspended|terminated|restructured|other",
  "prompt": "(2-4 ayat arahan untuk AI berperanan sebagai penghutang ni semasa roleplay - tone, gaya respons, objection utama yang akan dia bangkitkan, berdasarkan CORAK SEBENAR dari log remarks)",
  "checklist": [{"cat":"tone|delivery|counter|action|balance","text":"(perkara spesifik collector patut buat, berdasarkan corak/kelemahan yang nampak dalam log remarks ni - cth kalau penghutang selalu broken promise, checklist patut sebut pasal cara nail down PTP yang lebih kukuh)"}],
  "disclosures": ["(jika ada disclosure/maklumat wajib yang patut diucapkan, kosongkan array jika tiada)"]
}
PENTING pasal "amount" dan "days": field ni mesti diekstrak dari NILAI SEBENAR dalam job sheet (cth label "OUTSTANDING AMT :" atau "AGING DAYS :"), BUKAN cuma disebut dalam "prompt"/personaliti — manager tak patut perlu taip balik manual nombor yang AI dah nampak dalam job sheet ni.
Checklist kena ada 3-5 item, betul-betul berdasarkan CORAK SEBENAR yang berulang dalam log remarks ni — bukan generic template.`
    :`Anda pereka senario latihan untuk syarikat pemulihan hutang telco di Malaysia. Di bawah ialah transkrip call SEBENAR (PII dah di-redact — JANGAN cuba teka/isi balik IC/no.telefon/no.akaun sebenar):

"""
${redacted}
"""

Berdasarkan transkrip ni, hasilkan draf senario latihan dalam format JSON SAHAJA (tiada teks lain, tiada markdown fence), dengan struktur EXACT macam ni:
{
  "emoji": "(satu emoji sesuai mood penghutang)",
  "name": "(nama watak fiktif, BUKAN nama sebenar dari transkrip)",
  "title": "(tajuk pendek senario, cth 'Penghutang Kesusahan Kewangan - Kena Retrenchment')",
  "description": "(1 ayat ringkas situasi)",
  "amount": "(EKSTRAK jumlah hutang sebenar jika DISEBUT JELAS dalam transkrip, format 'RM' diikuti nombor & koma ribuan cth 'RM1,234.50' — JANGAN reka/anggar, set null jika tak disebut jelas)",
  "days": "(EKSTRAK hari tertunggak/aging sebenar jika DISEBUT JELAS dalam transkrip, sebagai integer — JANGAN reka/anggar, set null jika tak disebut jelas)",
  "level": "easy|med|hard",
  "balanceTier": "low|high",
  "objectionType": "cooperative|denial|hardship|aggressive|avoidance",
  "customerType": "suspended|terminated|restructured|other",
  "prompt": "(2-4 ayat arahan untuk AI berperanan sebagai penghutang ni semasa roleplay - tone, gaya respons, objection utama yang akan dia bangkitkan)",
  "checklist": [{"cat":"tone|delivery|counter|action|balance","text":"(perkara spesifik collector patut buat, berdasarkan apa yang BERLAKU/HILANG dalam transkrip sebenar ni)"}],
  "disclosures": ["(jika ada disclosure/maklumat wajib yang patut diucapkan, kosongkan array jika tiada)"]
}
PENTING pasal "amount" dan "days": isi je kalau disebut JELAS dalam transkrip — jika hanya tersirat dalam personaliti/prompt watak tapi tak ada nombor jelas, set null (manager akan isi sendiri), JANGAN agak-agak nombor.
Checklist kena ada 3-5 item, betul-betul berdasarkan corak SEBENAR dalam transkrip (apa collector buat baik / apa yang patut diperbaiki) — bukan generic template.`;
    const res=await fetch('/api/claude',{method:'POST',headers:authHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2000,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Gagal generate draf.');
    let text=(data.content?.[0]?.text||'').trim();
    text=text.replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim(); // jaga-jaga kalau AI masih bungkus dengan fence
    // Kadang AI tambah ayat pengenalan sebelum/lepas JSON walaupun diarah
    // jangan — so extract blok {...} TERLUAR je (dari "{" pertama ke "}"
    // terakhir) sebelum parse, bukan terus JSON.parse teks mentah.
    const firstBrace=text.indexOf('{'), lastBrace=text.lastIndexOf('}');
    if(firstBrace!==-1&&lastBrace>firstBrace)text=text.slice(firstBrace,lastBrace+1);
    let draft;
    try{draft=JSON.parse(text);}catch(parseErr){
      console.error('[AI Scenario Builder] Gagal parse JSON. Raw response:',text);
      throw new Error('AI bagi format tidak sah, sila cuba lagi. (Jika berulang, cuba ringkaskan job sheet/transkrip sikit.)');
    }
    window.__aiScenarioDraft=draft; // simpan sementara, dipakai bila "Guna Draf Ni" ditekan
    out.innerHTML=`
      <div class="alert alert-ok" style="display:block">✓ Draft is ready — please REVIEW first, nothing is saved automatically.</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px">
        <div style="font-weight:600;margin-bottom:4px">${draft.emoji||''} ${draft.title||'(no title)'}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${draft.description||''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <span class="chip chip-amber" style="font-size:11px">${objectionTypeIcon(draft.objectionType)} ${objectionTypeLabel(draft.objectionType)}</span>
          <span style="font-size:11px;color:var(--text3)">${customerTypeLabel(draft.customerType)}</span>
        </div>
        <div style="font-size:12px;color:var(--text3)">${(draft.checklist||[]).length} checklist items suggested</div>
      </div>
      <button class="btn btn-primary" style="margin-top:10px" onclick="useAiScenarioDraft()">✅ Guna Draf Ni → Buka Form Untuk Edit</button>`;
  }catch(e){
    out.innerHTML=`<div class="alert alert-err" style="display:block">⚠ ${e.message}</div>`;
  }finally{
    btn.disabled=false;btn.textContent='🤖 Generate Scenario Draft (AI)';
  }
}

async function useAiScenarioDraft(){
  const draft=window.__aiScenarioDraft;
  if(!draft)return;
  await openAddScenario(); // bukak form Add Senario kosong dulu
  applyScenarioDraft(draft); // lepas tu isi dengan draf AI — manager review/edit sebelum Save
  window.__aiScenarioDraft=null;
}

async function openAddScenario(existingId,presetObjectionType){
  const scenarios=await loadScenarios();
  const s=existingId?scenarios.find(x=>x.id===existingId):null;
  // Client "Lain-lain" — kalau client sedia ada bukan salah satu dari 3
  // pilihan tetap (RedOne/Celcom/Digi), anggap ia nama custom yang ditaip
  // sebelum ni → select "Lain-lain" & prefill input bebas dengan nama tu.
  const KNOWN_CLIENTS=['RedOne','Celcom','Digi'];
  const isCustomClient=!!(s&&s.client&&!KNOWN_CLIENTS.includes(s.client));
  openModal(`
  <div class="modal-title">${s?'Edit':'Add'} Scenario</div>
  <div class="form-row"><label>Scenario Emoji</label>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="scEmoji" type="text" value="${s?s.emoji:'😐'}" placeholder="😐" style="max-width:70px;font-size:24px;text-align:center" maxlength="4" />
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${['😐','😤','😠','😔','😰','🤔','😒','😭','🙄','😑'].map(e=>`<button type="button" onclick="document.getElementById('scEmoji').value='${e}'" style="font-size:20px;background:none;border:1px solid var(--border2);border-radius:6px;padding:2px 5px;cursor:pointer">${e}</button>`).join('')}
      </div>
    </div>
  </div>
  <div class="form-row"><label>Debtor Name</label><input id="scName" value="${s?s.name:''}" placeholder="Ahmad bin Hassan" /></div>
  <div class="two-col">
    <div class="form-row"><label>Gender (for correct AI voice)</label>
      <select id="scGender"><option value="male" ${!s||s.gender==='male'?'selected':''}>Male</option><option value="female" ${s&&s.gender==='female'?'selected':''}>Female</option></select>
    </div>
    <div class="form-row"><label>Voice Accent / Language</label>
      <select id="scAccent">
        <option value="melayu" ${!s||!s.accent||s.accent==='melayu'?'selected':''}>Malay</option>
        <option value="cina" ${s&&s.accent==='cina'?'selected':''}>Chinese</option>
        <option value="india" ${s&&s.accent==='india'?'selected':''}>Indian</option>
      </select>
    </div>
  </div>
  <div class="form-row"><label>Scenario Title</label><input id="scTitle" value="${s?s.title:''}" placeholder="Debtor Bekerjasama" /></div>
  <div class="two-col">
    <div class="form-row"><label>Outstanding Amount</label><input id="scAmount" value="${s?s.amount:'RM5,000'}" placeholder="e.g. RM1,234.50" pattern="^RM[\d,]+(\.[\d]{1,2})?$" title="Format: RM followed by numbers only, e.g. RM1,234.50" /></div>
    <div class="form-row"><label>Days Overdue</label><input id="scDays" value="${s?s.days:30}" type="number" /></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Difficulty Level</label>
      <select id="scLevel"><option value="easy" ${s&&s.level==='easy'?'selected':''}>Easy</option><option value="med" ${s&&s.level==='med'?'selected':''}>Medium</option><option value="hard" ${s&&s.level==='hard'?'selected':''}>Hard</option></select>
    </div>
    <div class="form-row"><label>Balance Tier</label>
      <select id="scBalanceTier"><option value="low" ${s&&s.balanceTier==='low'?'selected':''}>Rendah (Low Balance)</option><option value="high" ${!s||s.balanceTier==='high'?'selected':''}>Tinggi (High Balance)</option></select>
    </div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Objection Type <span style="font-weight:400;color:var(--text3)">(debtor behavior pattern during the call — used for weakness analytics by type)</span></label>
      <select id="scObjectionType">
        ${OBJECTION_TYPES.map(t=>`<option value="${t}" ${s&&s.objectionType===t?'selected':(!s&&t===(presetObjectionType||'cooperative')?'selected':'')}>${objectionTypeIcon(t)} ${objectionTypeLabel(t)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>Customer Type <span style="font-weight:400;color:var(--text3)">(account segment — refer to bucket assignment SOP-COL-002)</span></label>
      <select id="scCustomerType">
        ${CUSTOMER_TYPES.map(t=>`<option value="${t}" ${s&&s.customerType===t?'selected':(!s&&t==='other'?'selected':'')}>${customerTypeLabel(t)}</option>`).join('')}
      </select>
    </div>
  </div>
  <hr class="divider"/>
  <div style="font-size:13px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
    <span>📒 Customer Account Information <span style="font-weight:400;color:var(--text3)">(required — shown as collector reference during call)</span></span>
    <button type="button" class="btn btn-secondary" style="font-size:11px;padding:5px 10px;font-weight:500" onclick="autofillDummyData()">🎲 Auto-fill Dummy Data</button>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Client</label>
      <select id="scClient" onchange="toggleClientOther()">
        <option value="" ${!s||!s.client?'selected':''} disabled>— Select Client —</option>
        <option value="RedOne" ${s&&s.client==='RedOne'?'selected':''}>RedOne</option>
        <option value="Celcom" ${s&&s.client==='Celcom'?'selected':''}>Celcom</option>
        <option value="Digi" ${s&&s.client==='Digi'?'selected':''}>Digi</option>
        <option value="Lain-lain" ${isCustomClient?'selected':''}>Other</option>
      </select>
      <input id="scClientOther" value="${isCustomClient?s.client.replace(/"/g,'&quot;'):''}" placeholder="Type other client name..." style="margin-top:6px;display:${isCustomClient?'block':'none'}" />
    </div>
    <div class="form-row"><label>No. IC</label><input id="scIc" value="${s?s.icNumber:''}" placeholder="901231-10-1234" /></div>
  <div style="background:#FAEEDA;border:1px solid #EF9F27;border-radius:8px;padding:8px 12px;font-size:12px;color:#854F0B;margin-bottom:4px">
    ⚠️ <b>Privacy:</b> Use <b>fictional/dummy</b> IC, account, and phone numbers only. Do not enter real customer data into this training system.
  </div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Acc Number</label><input id="scAccNumber" value="${s?s.accNumber:''}" placeholder="1234567890" /></div>
    <div class="form-row"><label>Service No.</label><input id="scServiceNo" value="${s?s.serviceNo:''}" placeholder="012-3456789" /></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Acc Type</label>
      <select id="scAccType">
        <option value="" ${!s||!s.accType?'selected':''} disabled>— Select Type —</option>
        <option value="Active" ${s&&s.accType==='Active'?'selected':''}>Active</option>
        <option value="Pre-NPL" ${s&&s.accType==='Pre-NPL'?'selected':''}>Pre-NPL</option>
        <option value="NPL" ${s&&s.accType==='NPL'?'selected':''}>NPL</option>
        <option value="Write Off" ${s&&s.accType==='Write Off'?'selected':''}>Write Off</option>
      </select>
    </div>
    <div></div>
  </div>
  <div class="two-col">
    <div class="form-row"><label>Registration Date</label><input id="scRegDate" type="date" value="${s&&s.registrationDate?s.registrationDate:''}" /></div>
    <div class="form-row"><label>Date Termination</label><input id="scTermDate" type="date" value="${s&&s.terminationDate?s.terminationDate:''}" /></div>
  </div>
  <hr class="divider"/>
  <hr class="divider"/>
  <div class="form-row">
    <label>Debtor Character / Personality <span style="font-weight:400;color:var(--text3)">(describe attitude/character only — name, amount, IC, language & account details are auto-injected)</span></label>
    <textarea id="scPrompt" rows="3" placeholder="E.g. Defensive debtor who always gives excuses about being busy. Mudah marah bila ditekan tapi akan akur kalau didekati dengan sabar. Nada cepat tidak sabar.">${s?s.prompt:'Debtor yang bekerjasama tetapi penuh alasan. Nada neutral, minta masa lebih untuk bayar.'}</textarea>
    <div style="margin-top:6px;padding:8px 10px;background:var(--bg);border-radius:var(--radius-sm);font-size:11px;color:var(--text3);line-height:1.6">
      ℹ️ <b>Auto-inject oleh sistem (tidak perlu tulis dalam prompt):</b> Nama penghutang · Jumlah hutang · Hari tertunggak · Loghat/bangsa · No. IC · Acc Number · Service No. · Acc Type · Fakta akaun
    </div>
  </div>
  <div class="form-row">
    <label>Evaluation Checklist <span style="font-weight:400;color:var(--text3)">(AI will evaluate & score automatically based on these 5 categories)</span></label>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">🗣 Tone / Nada</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">📢 Cara Penyampaian</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">🔄 Hujah Balas</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">✅ Tindakan & Pematuhan</span>
      <span style="padding:4px 10px;border-radius:20px;background:var(--bg);border:1px solid var(--border2);font-size:12px;font-weight:600;color:var(--text2)">💰 Strategi Baki Hutang</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Score Weight per category <span style="font-weight:400">(optional — adjust which category matters more for this scenario; max points are auto-normalised to total 100)</span>:</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">
      ${SCORE_CATS.map(c=>`<div style="display:flex;flex-direction:column;gap:2px">
        <label style="font-size:10px;color:var(--text3)">${catIcon(c)} ${catLabel(c)}</label>
        <select id="scWeight_${c}" style="font-size:12px;padding:4px 6px">
          ${[0.5,1,1.5,2].map(w=>`<option value="${w}" ${(((s&&s.scoreWeights&&s.scoreWeights[c])||1)==w)?'selected':''}>${w}×</option>`).join('')}
        </select>
      </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Add specific items for this scenario (optional):</div>
    <div id="checklistRows"></div>
    <button type="button" class="btn btn-secondary" style="font-size:12px;padding:6px 10px" onclick="addChecklistRow('action','')">+ Add Item</button>
  </div>
  <div class="form-row">
    <label>📢 Mandatory Announcement / Policy To Inform Debtor <span style="font-weight:400;color:var(--text3)">(new information/policy that the collector MUST mention during this call — cth: "Inform the debtor that ewallet/paylater will be blocked because the account was listed with CTOS". Optional — leave empty if no special announcement for this scenario.)</span></label>
    <div id="disclosureRows"></div>
    <button type="button" class="btn btn-secondary" style="margin-top:6px;font-size:12px;padding:6px 10px" onclick="addDisclosureRow('')">+ Add Announcement</button>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary" onclick="cancelScenarioForm()">Cancel</button>
    <button class="btn btn-primary" onclick="saveScenario('${existingId||''}')">Save</button>
  </div>`);
  // Hanya load extra checklist items — 5 kategori utama auto-score oleh AI
  const clData=(s&&s.checklist&&s.checklist.length)?s.checklist:[];
  clData.forEach(c=>addChecklistRow(c.cat,c.text,c.critical));
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
          const restore=confirm('There is an unsaved draft (±'+age+' min ago).\n\nWould you like to restore it?');
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
  if(hasContent&&!confirm("Form not saved yet. Cancel and discard changes?")){
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
  other.style.display=sel.value==='Other'?'block':'none';
  if(sel.value!=='Lain-lain')other.value='';
}

// Auto-fill Dummy Data — generate IC/Acc Number/Service No format yang betul
// secara rawak, supaya manager senang buat scenario baru tanpa kena fikir
// nombor manual setiap kali. Manager boleh override lepas auto-fill kalau
// nak nilai specifik. Client/Acc Type/Dates TIDAK disentuh — biar manager pilih sendiri.
function genDummyIC(){
  // Format: YYMMDD-PB-XXXX. PB = kod negeri pendaftaran (gunakan set umum yang sah).
  const stateCodes=['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16'];
  const yy=String(Math.floor(Math.random()*50)+50).padStart(2,'0'); // 50-99 → lahir 1950-1999
  const mm=String(Math.floor(Math.random()*12)+1).padStart(2,'0');
  const dd=String(Math.floor(Math.random()*28)+1).padStart(2,'0');
  const pb=stateCodes[Math.floor(Math.random()*stateCodes.length)];
  const last=String(Math.floor(Math.random()*9999)).padStart(4,'0');
  return `${yy}${mm}${dd}-${pb}-${last}`;
}
function genDummyAccNumber(){
  let n='';
  for(let i=0;i<10;i++)n+=Math.floor(Math.random()*10);
  return n;
}
function genDummyServiceNo(){
  const prefixes=['010','011','012','013','016','017','018','019'];
  const p=prefixes[Math.floor(Math.random()*prefixes.length)];
  let n='';
  for(let i=0;i<7;i++)n+=Math.floor(Math.random()*10);
  return `${p}-${n}`;
}
function autofillDummyData(){
  const ic=document.getElementById('scIc');
  const acc=document.getElementById('scAccNumber');
  const svc=document.getElementById('scServiceNo');
  if(ic)ic.value=genDummyIC();
  if(acc)acc.value=genDummyAccNumber();
  if(svc)svc.value=genDummyServiceNo();
}

function addChecklistRow(cat,text,critical){
  const wrap=document.getElementById('checklistRows');
  if(!wrap)return;
  const row=document.createElement('div');
  row.className='checklist-row';
  row.style.cssText='display:flex;gap:6px;margin-bottom:6px;align-items:flex-start';
  row.innerHTML=`
    <input class="cl-cat" type="hidden" value="${cat||'action'}" />
    <input class="cl-text" value="${(text||'').replace(/"/g,'&quot;')}" placeholder="E.g. Ensure collector verifies identity sebelum bagi maklumat akaun..." style="flex:1" />
    <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text3);flex-shrink:0;white-space:nowrap;padding-top:8px" title="Critical — kalau miss, markah aspek action MESTI rendah">
      <input class="cl-critical" type="checkbox" ${critical?'checked':''} style="margin:0" />⚠️ Critical
    </label>
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
    <input class="dc-text" value="${(text||'').replace(/"/g,'&quot;')}" placeholder="E.g. Inform debtor that ewallet/paylater akan disekat kerana akaun dimasukkan ke CTOS..." style="flex:1" />
    <button type="button" class="btn btn-danger" style="padding:6px 10px;flex-shrink:0" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}

function editScenario(id){openAddScenario(id);}
async function saveScenario(existingId){
  const checklist=Array.from(document.querySelectorAll('#checklistRows .checklist-row'))
    .map(r=>({cat:r.querySelector('.cl-cat').value,text:r.querySelector('.cl-text').value.trim(),critical:r.querySelector('.cl-critical').checked}))
    .filter(c=>c.text);
  const disclosures=Array.from(document.querySelectorAll('#disclosureRows .disclosure-row .dc-text'))
    .map(i=>i.value.trim())
    .filter(Boolean);
  // Score weight per kategori — fallback 1 (neutral) kalau select tak jumpa.
  const scoreWeights={};
  SCORE_CATS.forEach(c=>{
    const el=document.getElementById('scWeight_'+c);
    scoreWeights[c]=el?parseFloat(el.value)||1:1;
  });
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
    objectionType:document.getElementById('scObjectionType').value,
    customerType:document.getElementById('scCustomerType').value,
    prompt:document.getElementById('scPrompt').value.trim(),
    checklist,
    disclosures,
    scoreWeights,
    client:clientValue,
    icNumber:document.getElementById('scIc').value.trim(),
    accNumber:document.getElementById('scAccNumber').value.trim(),
    serviceNo:document.getElementById('scServiceNo').value.trim(),
    accType:document.getElementById('scAccType').value,
    registrationDate:document.getElementById('scRegDate').value,
    terminationDate:document.getElementById('scTermDate').value
  };
  if(!data.name||!data.title||!data.prompt){alert('Please fill in all required fields.');return;}
  // WAJIB: Maklumat Akaun Pelanggan kena lengkap dulu sebelum boleh simpan —
  // kalau tak, panel rujukan kat skrin panggilan collector akan separuh kosong.
  if(!data.client||!data.icNumber||!data.accNumber||!data.serviceNo||!data.accType||!data.registrationDate||!data.terminationDate){
    alert('Please complete all Customer Account Information (Client/IC/Acc Number/Service No./Acc Type/Registration Date/Termination Date) before saving.');
    return;
  }
  const btn=document.querySelector('.modal-footer .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  try{
    await scenarioApi.save(data);
    await loadScenarios(true); // refresh cache supaya semua page (training/manager) nampak data terkini
    clearScenarioDraft(); // Berjaya simpan — buang draft
    closeModal();
    renderScenarios();
  }catch(e){
    alert('Failed to save scenario: '+e.message);
    if(btn){btn.disabled=false;btn.textContent='Save';}
  }
}
async function deleteScenario(id){
  if(!confirm('Delete this scenario?'))return;
  try{
    await scenarioApi.remove(id);
    await loadScenarios(true);
    renderScenarios();
  }catch(e){
    alert('Failed to delete scenario: '+e.message);
  }
}

async function approveUser(id,approve){
  try{
    if(approve){
      await userApi.approve(id);
    } else {
      // Reject = delete the account entirely (pending requests don't need to linger)
      if(!confirm('Reject this account? The registration will be permanently deleted.'))return;
      await userApi.remove(id);
    }
    usersCache=null;
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Failed: '+e.message);
  }
}
// BUG FIX: "Revoke" on an already-approved user used to call approveUser(id,false),
// which internally DELETES the account (same path as Reject for pending users) —
// so Revoke and Delete ended up doing the exact same thing. Revoke should only
// SUSPEND access (is_approved=false, account + history kept), not delete it.
// userApi.reject() already existed (PATCH is_approved:false) but was unused —
// wire it up here instead of reusing approveUser(id,false).
async function revokeUser(id){
  if(!confirm('Revoke access for this user? They will not be able to sign in until re-approved. Their account and session history will be kept (use Delete to permanently remove instead).'))return;
  try{
    await userApi.reject(id);
    usersCache=null;
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Failed to revoke user: '+e.message);
  }
}
// Label & chip-class mesra-manusia untuk setiap jenis tindakan audit
function auditActionInfo(action){
  const map={
    reset_password:{icon:'🔑',label:'Reset Password',chip:'chip-amber'},
    delete_user:{icon:'🗑️',label:'Delete User',chip:'chip-red'},
    change_role:{icon:'🎚️',label:'Change Role',chip:'chip-purple'},
    approve_user:{icon:'✅',label:'Approve Account',chip:'chip-green'},
    reject_user:{icon:'⛔',label:'Reject/Revoke Account',chip:'chip-red'},
    set_session_limit:{icon:'🎯',label:'Set Session Limit',chip:'chip-purple'},
  };
  return map[action]||{icon:'📝',label:action,chip:''};
}
function auditDetailsText(e){
  const d=e.details||{};
  if(e.action==='change_role')return`${d.oldRole||'-'} → ${d.newRole||'-'}`;
  if(e.action==='set_session_limit')return`${d.oldLimit??'unlimited'} → ${d.newLimit??'unlimited'} sesi/hari`;
  if(e.action==='delete_user')return d.deletedRole?`(role: ${d.deletedRole})`:'';
  return'';
}
async function renderAuditLog(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Audit Log</div></div><div class="card">Loading...</div>');
  let entries;
  try{
    const res=await fetch('/api/audit-log?limit=300',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load audit log.');
    entries=data.entries||[];
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Audit Log</div></div><div class="card">⚠ ${esc(e.message)}</div>`);
    return;
  }
  setContent(`
  <div class="page-header"><div class="page-title">Audit Log</div><div class="page-sub">Rekod tindakan sensitif admin/manager — reset password, delete user, tukar role, dsb. ${entries.length} rekod terkini.</div></div>
  <div class="card">
    ${entries.length===0?`<div class="empty-state"><div class="es-icon">🕵️</div><p>Tiada tindakan direkod setakat ini.</p></div>`:
    `<div class="table-wrap"><table>
      <tr><th>Bila</th><th>Siapa Buat</th><th>Tindakan</th><th>Kepada</th><th>Detail</th></tr>
      ${entries.map(e=>{
        const info=auditActionInfo(e.action);
        return`<tr>
          <td style="font-size:12px;color:var(--text3);white-space:nowrap">${fmtDateTime(e.date)}</td>
          <td><div style="font-weight:500">${esc(e.actorName||e.actorId)}</div><div style="font-size:11px;color:var(--text3)">${esc(e.actorId)}</div></td>
          <td><span class="chip" style="background:color-mix(in srgb, ${info.color} 15%, transparent);color:${info.color}">${info.icon} ${info.label}</span></td>
          <td>${e.targetId?`<div style="font-weight:500">${esc(e.targetName||e.targetId)}</div><div style="font-size:11px;color:var(--text3)">${esc(e.targetId)}</div>`:'<span style="color:var(--text3);font-size:12px">-</span>'}</td>
          <td style="font-size:12px;color:var(--text2)">${esc(auditDetailsText(e))}</td>
        </tr>`;
      }).join('')}
    </table></div>`}
  </div>`);
}

async function renderUsers(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Manage Users</div></div><div class="card">Loading users...</div>');
  let all;
  try{
    all=await loadUsers(true);
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Manage Users</div></div><div class="card">⚠ Failed to load users: ${e.message}</div>`);
    return;
  }
  const pending=all.filter(u=>!u.isApproved);
  const approved=all.filter(u=>u.isApproved);
  setContent(`
  <div class="page-header"><div class="page-title">Manage Users</div><div class="page-sub">${all.length} users · ${pending.length} pending approval</div></div>

  ${pending.length>0?`
  <div class="card" style="border-left:4px solid var(--amber)">
    <div class="card-title" style="color:var(--amber)">⏳ Pending Approval (${pending.length})</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">These accounts registered but cannot sign in until approved. Review each one below.</p>
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>ID</th><th>Role</th><th>Registered At</th><th>Actions</th></tr>
      ${pending.map(u=>`<tr style="background:#fffbea">
        <td><div style="font-weight:500">${esc(u.name)}</div></td>
        <td><span class="chip chip-amber">${u.id}</span></td>
        <td><span class="user-role-badge badge-${u.role}">${u.role==='admin'?'Admin':u.role==='manager'?'Manager':'Collector'}</span></td>
        <td style="font-size:12px;color:var(--text3)">${u.registeredAt?new Date(u.registeredAt).toLocaleDateString('en-MY'):'-'}</td>
        <td>
          <div class="action-row">
            <button class="btn btn-primary" style="padding:4px 12px;font-size:12px;background:#16a34a;border-color:#16a34a" onclick="approveUser('${u.id}',true)">✓ Approve</button>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="approveUser('${u.id}',false)">✕ Reject</button>
          </div>
        </td>
      </tr>`).join('')}
    </table></div>
  </div>`:''}

  <div class="card">
    <div class="card-title">✅ Approved Users (${approved.length})</div>
    <div class="table-wrap"><table>
      <tr><th>Name</th><th>ID</th><th>Role</th><th>Registered At</th><th>Daily Session Limit</th><th>Actions</th></tr>
      ${approved.map(u=>`<tr>
        <td><div style="font-weight:500">${esc(u.name)}</div></td>
        <td><span class="chip chip-purple">${u.id}</span></td>
        <td>
          ${currentUser.role==='admin'&&u.id!==currentUser.id?`
          <div style="display:flex;align-items:center;gap:6px">
            <select id="role-${u.id}" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text)">
              <option value="collector" ${u.role==='collector'?'selected':''}>Collector</option>
              <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
              <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
            </select>
            <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="saveUserRole('${u.id}')">Save</button>
          </div>
          `:`<span class="user-role-badge badge-${u.role}">${u.role==='admin'?'Admin':u.role==='manager'?'Manager':'Collector'}</span>`}
        </td>
        <td style="font-size:12px;color:var(--text3)">${u.registeredAt?new Date(u.registeredAt).toLocaleDateString('en-MY'):'-'}</td>
        <td>
          ${u.role==='collector'?`
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" min="1" step="1" id="limit-${u.id}" value="${u.maxSessionsPerDay??''}" placeholder="Unlimited" style="width:80px;padding:5px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text)">
            <button class="btn btn-secondary" style="padding:4px 10px;font-size:11px" onclick="saveSessionLimit('${u.id}')">Save</button>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">${u.maxSessionsPerDay?`Max ${u.maxSessionsPerDay} session${u.maxSessionsPerDay>1?'s':''}/day`:'No limit'}</div>
          `:`<span style="font-size:12px;color:var(--text3)">—</span>`}
        </td>
        <td>
          <div class="action-row">
          ${u.id!==currentUser.id?`
            <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="promptResetPassword('${u.id}','${u.name.replace(/'/g,"\\'")}','${u.role}')">🔑 Reset Pass</button>
            <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="revokeUser('${u.id}')">🚫 Revoke</button>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteUser('${u.id}')">Delete</button>
          `:'-'}
          </div>
        </td>
      </tr>`).join('')}
    </table></div>
  </div>`);
}
async function saveSessionLimit(id){
  const input=document.getElementById('limit-'+id);
  const raw=input.value.trim();
  const val=raw===''?null:parseInt(raw,10);
  if(val!==null&&(!Number.isInteger(val)||val<1)){
    alert('Daily session limit must be a positive whole number, or leave empty for unlimited.');
    return;
  }
  try{
    await userApi.setLimit(id,val);
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Failed to update session limit: '+e.message);
  }
}
async function saveUserRole(id){
  const select=document.getElementById('role-'+id);
  const role=select.value;
  if(!confirm(`Change this user's role to "${role}"? They may need to sign out and back in for the change to fully apply.`))return;
  try{
    usersCache=null;
    await userApi.setRole(id,role);
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Failed to update role: '+e.message);
  }
}
async function promptResetPassword(id, name, role) {
  // Manager hanya boleh reset collector — tapis kat sini pun (API enforce jugak)
  if (currentUser.role === 'manager' && role !== 'collector') {
    alert('Hanya Admin yang boleh reset password Manager atau Admin lain.');
    return;
  }
  const newPass = prompt(`Reset password untuk ${name} (${id})\n\nMasukkan password baru (min 6 aksara):`);
  if (newPass === null) return; // user cancel
  if (newPass.length < 6) {
    alert('Password mesti sekurang-kurangnya 6 aksara.');
    return;
  }
  const confirm1 = prompt(`Confirm password baru untuk ${name}:`);
  if (confirm1 === null) return;
  if (newPass !== confirm1) {
    alert('Password tidak sepadan. Cuba lagi.');
    return;
  }
  if (!confirm(`Reset password ${name} (${id})?\n\nPastikan anda beritahu password baru kepada mereka.`)) return;
  try {
    await userApi.resetPassword(id, newPass);
    alert(`✅ Password ${name} berjaya direset. Maklumkan password baru kepada mereka.`);
  } catch (e) {
    alert('Gagal reset password: ' + e.message);
  }
}
async function deleteUser(id){
  if(!confirm('Delete this user?'))return;
  try{
    await userApi.remove(id);
    await loadUsers(true);
    renderUsers();
  }catch(e){
    alert('Failed to delete user: '+e.message);
  }
}

// ═══════════ ASSIGNMENTS (manager-assigned mandatory scenarios) ═══════════
async function renderAssignments(){
  if(currentUser.role==='collector')return;
  setContent('<div class="page-header"><div class="page-title">Assignments</div></div><div class="card">Loading...</div>');
  let allAssignments,users,scenarios;
  try{
    [allAssignments,users,scenarios]=await Promise.all([loadAssignments(true),loadUsers(),loadScenarios()]);
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Assignments</div></div><div class="card">⚠ Failed to load: ${e.message}</div>`);
    return;
  }
  const collectors=users.filter(u=>u.role==='collector');
  const todayStr=localISODate();
  const statusBadge=(a)=>{
    if(a.status==='completed')return`<span class="chip" style="background:#e8f5e9;color:#2e7d32;font-size:11px">✓ Completed</span>`;
    const overdue=a.dueDate&&a.dueDate<todayStr;
    if(overdue)return`<span class="chip" style="background:#fdecea;color:var(--red);font-size:11px">⚠ Overdue</span>`;
    return`<span class="chip chip-amber" style="font-size:11px">⏳ Pending</span>`;
  };
  setContent(`
  <div class="page-header"><div class="page-title">Assignments</div><div class="page-sub">Assign mandatory scenarios to collectors with a due date, and track completion</div></div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">➕ New Assignment</div>
    ${collectors.length===0?`<p style="font-size:13px;color:var(--text3)">No collectors registered yet.</p>`:`
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div style="flex:1;min-width:160px">
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Collector</label>
        <select id="asgCollector" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px">
          ${collectors.map(c=>`<option value="${c.id}">${esc(c.name)} (${c.id})</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:200px">
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Scenario</label>
        <select id="asgScenario" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px">
          ${scenarios.map(s=>`<option value="${s.id}">${s.emoji} ${esc(s.title)}</option>`).join('')}
        </select>
      </div>
      <div style="min-width:150px">
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Due Date (optional)</label>
        <input type="date" id="asgDueDate" style="width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px">
      </div>
      <button class="btn btn-primary" style="padding:9px 16px;font-size:13px" onclick="createAssignment()">Assign</button>
    </div>`}
  </div>

  <div class="card">
    <div class="card-title">All Assignments (${allAssignments.length})</div>
    ${allAssignments.length===0?`<div class="empty-state"><div class="es-icon">📌</div><p>No assignments yet.</p></div>`:`
    <div class="table-wrap"><table>
      <tr><th>Collector</th><th>Scenario</th><th>Assigned By</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
      ${allAssignments.map(a=>{
        const c=findUserById(collectors,a.collectorId);
        const assigner=findUserById(users,a.assignedBy);
        return`<tr>
          <td><div style="font-weight:500">${c?c.name:a.collectorId}</div><div style="font-size:11px;color:var(--text3)">${a.collectorId}</div></td>
          <td>${a.scenarioName||a.scenarioId}</td>
          <td style="font-size:12px;color:var(--text3)">${assigner?assigner.name:a.assignedBy}</td>
          <td style="font-size:12px;color:var(--text3)">${a.dueDate?new Date(a.dueDate).toLocaleDateString('en-MY'):'—'}</td>
          <td>${statusBadge(a)}</td>
          <td>${a.status==='pending'?`<button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="cancelAssignment('${a.id}')">Cancel</button>`:'-'}</td>
        </tr>`;
      }).join('')}
    </table></div>`}
  </div>`);
}
async function createAssignment(){
  const collectorId=document.getElementById('asgCollector').value;
  const scenarioId=document.getElementById('asgScenario').value;
  const dueDate=document.getElementById('asgDueDate').value||null;
  const scenarios=scenariosCache||[];
  const sc=scenarios.find(s=>s.id===scenarioId);
  try{
    await assignmentApi.create(collectorId,scenarioId,sc?sc.title:'',dueDate);
    await loadAssignments(true);
    renderAssignments();
  }catch(e){
    alert('Failed to create assignment: '+e.message);
  }
}
async function cancelAssignment(id){
  if(!confirm('Cancel this assignment?'))return;
  try{
    await assignmentApi.remove(id);
    await loadAssignments(true);
    renderAssignments();
  }catch(e){
    alert('Failed to cancel assignment: '+e.message);
  }
}

// ═══════════ LEADERBOARD (collection rate — semua collector, full transparency) ═══════════
async function renderLeaderboard(){
  setContent('<div class="page-header"><div class="page-title">Leaderboard</div></div><div class="card">Loading...</div>');
  let data;
  try{
    const res=await fetch('/api/leaderboard',{headers:authHeaders()});
    data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load leaderboard.');
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Leaderboard</div></div><div class="card">⚠ Failed to load: ${esc(e.message)}</div>`);
    return;
  }

  const collectors=data.collectors||[];
  const rows=collectors.map((c,i)=>{
    const rank=i+1;
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':('#'+rank);
    const isMe=currentUser&&currentUser.name&&c.name.trim().toUpperCase()===currentUser.name.trim().toUpperCase();
    const pillClass=c.status==='ok'?'score-high':c.status==='warn'?'score-mid':'score-low';
    const paidFmt='RM '+Number(c.paid||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
    return`<tr style="${isMe?'background:var(--surface2);font-weight:600':''}">
      <td style="width:44px;text-align:center;font-size:15px">${medal}</td>
      <td>${esc(c.name)}${isMe?' <span class="chip chip-purple" style="font-size:10px">Anda</span>':''}</td>
      <td style="font-size:13px;color:var(--text3)">${paidFmt}</td>
      <td><span class="score-pill ${pillClass}">${c.rate.toFixed(1)}%</span></td>
    </tr>`;
  }).join('');

  setContent(`
  <div class="page-header"><div class="page-title">🏆 Leaderboard</div><div class="page-sub">📅 ${esc(data.periodLabel||'Bulan Ini')} · target ${data.targetRate}%, amaran bawah ${data.warnRate}%</div></div>
  <div class="card">
    ${collectors.length===0?`<div class="empty-state"><div class="es-icon">🏆</div><p>Tiada data collector dijumpai.</p></div>`:`
    <div class="table-wrap"><table>
      <tr><th></th><th>Collector</th><th>Collected (${esc(data.periodLabel||'Bulan Ini')})</th><th>Rate</th></tr>
      ${rows}
    </table></div>`}
  </div>`);
}

// ═══════════ ANNOUNCEMENTS (sehala — manager/admin post, semua baca) ═══════════
async function renderAnnouncements(){
  setContent('<div class="page-header"><div class="page-title">Announcements</div></div><div class="card">Loading...</div>');
  let announcements;
  try{
    const res=await fetch('/api/announcements',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load announcements.');
    announcements=data.announcements||[];
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Announcements</div></div><div class="card">⚠ ${esc(e.message)}</div>`);
    return;
  }
  const canPost=currentUser.role==='admin'||currentUser.role==='manager';
  setContent(`
  <div class="page-header"><div class="page-title">📢 Announcements</div><div class="page-sub">Notis rasmi daripada pengurusan</div></div>
  ${canPost?`
  <div class="card">
    <div class="card-title">➕ New Announcement</div>
    <div class="form-row"><label>Title</label><input id="annTitle" placeholder="Tajuk pengumuman..." /></div>
    <div class="form-row"><label>Message</label><textarea id="annBody" rows="3" placeholder="Kandungan pengumuman..."></textarea></div>
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);margin-bottom:10px">
      <input type="checkbox" id="annPinned" style="margin:0" /> 📌 Pin di atas
    </label>
    <button class="btn btn-primary" onclick="postAnnouncement()">Post Announcement</button>
  </div>`:''}
  <div class="card">
    ${announcements.length===0?`<div class="empty-state"><div class="es-icon">📢</div><p>Tiada pengumuman lagi.</p></div>`:
    announcements.map(a=>`
      <div style="padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="font-weight:700;font-size:14px">${a.pinned?'📌 ':''}${esc(a.title)}</div>
          ${canPost?`<button class="btn btn-danger" style="padding:3px 9px;font-size:11px;flex-shrink:0" onclick="deleteAnnouncement('${a.id}')">Delete</button>`:''}
        </div>
        <div style="font-size:13px;color:var(--text2);margin-top:6px;white-space:pre-wrap;line-height:1.6">${esc(a.body)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px">${esc(a.postedByName)} · ${fmtDateTime(a.createdAt)}</div>
      </div>`).join('')}
  </div>`);
}
async function postAnnouncement(){
  const title=(document.getElementById('annTitle')||{}).value||'';
  const body=(document.getElementById('annBody')||{}).value||'';
  const pinned=(document.getElementById('annPinned')||{}).checked||false;
  if(!title.trim()||!body.trim()){alert('Sila isi tajuk dan kandungan.');return;}
  try{
    const res=await fetch('/api/announcements',{method:'POST',headers:authHeaders(),body:JSON.stringify({title,body,pinned})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to post.');
    renderAnnouncements();
  }catch(e){alert('Gagal post: '+e.message);}
}
async function deleteAnnouncement(id){
  if(!confirm('Padam pengumuman ini?'))return;
  try{
    const res=await fetch('/api/announcements',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to delete.');
    renderAnnouncements();
  }catch(e){alert('Gagal padam: '+e.message);}
}

// ═══════════ DISCUSSION (dua-hala — semua boleh post & reply) ═══════════
async function renderDiscussion(){
  setContent('<div class="page-header"><div class="page-title">Discussion</div></div><div class="card">Loading...</div>');
  let posts;
  try{
    const postsRes=await fetch('/api/discussion',{headers:authHeaders()}).then(r=>r.json());
    if(postsRes.error)throw new Error(postsRes.error);
    posts=postsRes.posts||[];
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Discussion</div></div><div class="card">⚠ ${esc(e.message)}</div>`);
    return;
  }
  const authorName=id=>{const p=posts.find(x=>x.authorId===id);return p?p.authorName:id;};
  const topLevel=posts.filter(p=>!p.parentId);
  const repliesOf=pid=>posts.filter(p=>p.parentId===pid);
  const canModerate=currentUser.role==='admin'||currentUser.role==='manager';

  function postHTML(p,isReply){
    const isOwner=p.authorId===currentUser.id;
    return`
    <div style="padding:${isReply?'10px 0 10px 24px':'14px 0'};${isReply?'border-left:2px solid var(--border);margin-left:8px':'border-bottom:1px solid var(--border)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="font-weight:600;font-size:13px">${esc(authorName(p.authorId))}</div>
        ${(isOwner||canModerate)?`<button class="btn btn-danger" style="padding:2px 8px;font-size:10px" onclick="deleteDiscussionPost('${p.id}')">Delete</button>`:''}
      </div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px;white-space:pre-wrap;line-height:1.5">${esc(p.body)}</div>
      ${attachmentHTML(p)}
      <div style="font-size:11px;color:var(--text3);margin-top:6px;display:flex;align-items:center;gap:10px">
        <span>${fmtDateTime(p.createdAt)}</span>
        ${!isReply?`<a href="#" onclick="event.preventDefault();toggleReplyBox('${p.id}')" style="color:var(--purple);font-weight:600">Reply</a>`:''}
      </div>
      ${!isReply?`<div id="replyBox-${p.id}" style="display:none;margin-top:8px;margin-left:8px">
        <textarea id="replyText-${p.id}" rows="2" placeholder="Tulis balasan..." style="width:100%;margin-bottom:6px"></textarea>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          ${emojiBtnHTML('replyText-'+p.id)}
          ${attachBtnHTML('replyText-'+p.id)}
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="postDiscussionReply('${p.id}')">Send Reply</button>
        </div>
        ${attachPreviewHTML('replyText-'+p.id)}
      </div>`:''}
      ${!isReply?repliesOf(p.id).map(r=>postHTML(r,true)).join(''):''}
    </div>`;
  }

  setContent(`
  <div class="page-header"><div class="page-title">💬 Discussion</div><div class="page-sub">Ruang perbincangan terbuka untuk semua</div></div>
  <div class="card">
    <div class="card-title">✍️ New Post</div>
    <textarea id="discNewPost" rows="3" placeholder="Kongsi sesuatu dengan pasukan..."></textarea>
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px">
      ${emojiBtnHTML('discNewPost')}
      ${attachBtnHTML('discNewPost')}
      <button class="btn btn-primary" onclick="postDiscussion()">Post</button>
    </div>
    ${attachPreviewHTML('discNewPost')}
  </div>
  <div class="card">
    ${topLevel.length===0?`<div class="empty-state"><div class="es-icon">💬</div><p>Belum ada perbincangan lagi. Mulakan yang pertama!</p></div>`:
    topLevel.slice().reverse().map(p=>postHTML(p,false)).join('')}
  </div>`);
}
function toggleReplyBox(id){
  const box=document.getElementById('replyBox-'+id);
  if(box)box.style.display=box.style.display==='none'?'block':'none';
}
async function postDiscussion(){
  const el=document.getElementById('discNewPost');
  const body=(el||{}).value||'';
  if(!body.trim()){alert('Sila tulis sesuatu dulu.');return;}
  try{
    const attachment=await uploadPendingAttachment('discNewPost');
    const res=await fetch('/api/discussion',{method:'POST',headers:authHeaders(),body:JSON.stringify({
      body,
      ...(attachment?{attachmentPath:attachment.path,attachmentName:attachment.name,attachmentType:attachment.type,attachmentSize:attachment.size}:{}),
    })});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to post.');
    renderDiscussion();
  }catch(e){alert('Gagal post: '+e.message);}
}
async function postDiscussionReply(parentId){
  const el=document.getElementById('replyText-'+parentId);
  const body=(el||{}).value||'';
  if(!body.trim()){alert('Sila tulis balasan dulu.');return;}
  try{
    const attachment=await uploadPendingAttachment('replyText-'+parentId);
    const res=await fetch('/api/discussion',{method:'POST',headers:authHeaders(),body:JSON.stringify({
      body,parentId,
      ...(attachment?{attachmentPath:attachment.path,attachmentName:attachment.name,attachmentType:attachment.type,attachmentSize:attachment.size}:{}),
    })});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to post.');
    renderDiscussion();
  }catch(e){alert('Gagal post: '+e.message);}
}
async function deleteDiscussionPost(id){
  if(!confirm('Padam post ini?'))return;
  try{
    const res=await fetch('/api/discussion',{method:'DELETE',headers:authHeaders(),body:JSON.stringify({id})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to delete.');
    renderDiscussion();
  }catch(e){alert('Gagal padam: '+e.message);}
}

// ═══════════ MESSAGES (mesej peribadi/DM + notification badge) ═══════════
async function renderMessages(){
  setContent('<div class="page-header"><div class="page-title">Messages</div></div><div class="card">Loading...</div>');
  let data;
  try{
    const res=await fetch('/api/messages',{headers:authHeaders()});
    data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load messages.');
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Messages</div></div><div class="card">⚠ ${esc(e.message)}</div>`);
    return;
  }
  pollUnreadMessages(); // refresh badge terus lepas buka inbox
  const convos=data.conversations||[];
  setContent(`
  <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
    <div><div class="page-title">✉️ Messages</div><div class="page-sub">Mesej peribadi antara staf</div></div>
    <div style="display:flex;gap:8px;align-items:center">
      ${notifStatusButton()}
      <button class="btn btn-primary" onclick="openNewMessagePicker()">+ New Message</button>
    </div>
  </div>
  <div class="card">
    ${convos.length===0?`<div class="empty-state"><div class="es-icon">✉️</div><p>Tiada mesej lagi. Klik "+ New Message" untuk mula.</p></div>`:
    convos.map(c=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openMessageThread('${c.userId}')">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:13px">${esc(c.userName)}${c.unreadCount>0?` <span class="chip chip-red" style="font-size:10px">${c.unreadCount} baru</span>`:''}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.lastMessage)}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);flex-shrink:0;margin-left:10px">${fmtDateTime(c.lastAt)}</div>
      </div>`).join('')}
  </div>`);
}

function openMessageThread(userId){
  renderMessageThread(userId);
}
function closeMessageThread(){
  renderMessages();
}

async function renderMessageThread(userId){
  setContent('<div class="page-header"><div class="page-title">Messages</div></div><div class="card">Loading...</div>');
  let data;
  try{
    const res=await fetch('/api/messages?with='+encodeURIComponent(userId),{headers:authHeaders()});
    data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load thread.');
  }catch(e){
    setContent(`<div class="page-header"><div class="page-title">Messages</div></div><div class="card">⚠ ${esc(e.message)}</div>`);
    return;
  }
  pollUnreadMessages(); // badge patut turun lepas baca thread ni (server dah mark read)
  const thread=data.thread||[];
  const otherName=data.otherUser?data.otherUser.name:userId;
  setContent(`
  <div class="page-header">
    <a href="#" onclick="event.preventDefault();closeMessageThread()" style="font-size:12px;color:var(--purple);font-weight:600">← Back to Messages</a>
    <div class="page-title" style="margin-top:4px">${esc(otherName)}</div>
  </div>
  <div class="card">
    <div id="msgThreadBox" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-bottom:8px">
      ${thread.length===0?`<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px 0">Belum ada mesej. Mulakan perbualan!</div>`:
      thread.map(m=>{
        const isMe=m.senderId===currentUser.id;
        return`<div style="align-self:${isMe?'flex-end':'flex-start'};max-width:70%">
          <div style="padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;background:${isMe?'var(--purple-light)':'var(--bg)'};color:${isMe?'var(--purple)':'var(--text)'}">${esc(m.body)}${attachmentHTML(m)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;text-align:${isMe?'right':'left'}">${fmtDateTime(m.createdAt)}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
      <div style="display:flex;gap:8px">
        <input id="msgThreadInput" placeholder="Tulis mesej..." style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();sendMessageInThread('${userId}');}" />
        ${emojiBtnHTML('msgThreadInput')}
        ${attachBtnHTML('msgThreadInput')}
        <button class="btn btn-primary" style="padding:8px 16px" onclick="sendMessageInThread('${userId}')">Send</button>
      </div>
      ${attachPreviewHTML('msgThreadInput')}
    </div>
  </div>`);
  const box=document.getElementById('msgThreadBox');
  if(box)box.scrollTop=box.scrollHeight;
  const input=document.getElementById('msgThreadInput');
  if(input)input.focus();
}

async function sendMessageInThread(userId){
  const input=document.getElementById('msgThreadInput');
  const body=(input||{}).value||'';
  if(!body.trim())return;
  try{
    const attachment=await uploadPendingAttachment('msgThreadInput');
    const res=await fetch('/api/messages',{method:'POST',headers:authHeaders(),body:JSON.stringify({
      recipientId:userId,body,
      ...(attachment?{attachmentPath:attachment.path,attachmentName:attachment.name,attachmentType:attachment.type,attachmentSize:attachment.size}:{}),
    })});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to send.');
    if(input)input.value='';
    renderMessageThread(userId);
  }catch(e){alert('Gagal hantar: '+e.message);}
}

async function openNewMessagePicker(){
  let contacts;
  try{
    const res=await fetch('/api/messages?contacts=1',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to load contacts.');
    contacts=data.contacts||[];
  }catch(e){alert('Gagal muat senarai staf: '+e.message);return;}
  if(!contacts.length){alert('Tiada staf lain untuk dihubungi.');return;}
  openModal(`
    <div class="modal-title">✉️ New Message</div>
    <div class="form-row"><label>Kepada</label>
      <select id="newMsgTo" style="width:100%">
        ${contacts.map(c=>`<option value="${c.id}">${esc(c.name)} (${c.role})</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>Mesej</label>
      <textarea id="newMsgBody" rows="3" placeholder="Tulis mesej..."></textarea>
      <div style="display:flex;gap:6px;margin-top:6px">${emojiBtnHTML('newMsgBody')}${attachBtnHTML('newMsgBody')}</div>
      ${attachPreviewHTML('newMsgBody')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="sendNewMessage()">Send</button>
    </div>
  `);
}

async function sendNewMessage(){
  const to=(document.getElementById('newMsgTo')||{}).value;
  const body=(document.getElementById('newMsgBody')||{}).value||'';
  if(!to||!body.trim()){alert('Sila pilih penerima dan tulis mesej.');return;}
  try{
    const attachment=await uploadPendingAttachment('newMsgBody');
    const res=await fetch('/api/messages',{method:'POST',headers:authHeaders(),body:JSON.stringify({
      recipientId:to,body,
      ...(attachment?{attachmentPath:attachment.path,attachmentName:attachment.name,attachmentType:attachment.type,attachmentSize:attachment.size}:{}),
    })});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed to send.');
    closeModal();
    openMessageThread(to);
  }catch(e){alert('Gagal hantar: '+e.message);}
}

// ═══════════ Browser Notifications + Sound untuk mesej baru ═══════════
// SEBAB INI WUJUD: badge dalam nav (navMsgBadge) cuma DOM element — kalau
// user tengah buka tab/window lain (bukan tab CollectorTrain), dia takkan
// nampak badge tu langsung sampailah dia balik ke tab ni. Browser
// Notification API pula pop-up di luar tab (macam notification WhatsApp
// Web), dan bunyi "ding" boleh didengar walaupun tab tak focus.
//
// Flow:
//   1. User klik "🔔 Enable Notifications" (kena user gesture, browser
//      block auto-request tanpa klik) → simpan keputusan dalam
//      Notification.permission (browser yang uruskan, bukan kita).
//   2. pollUnreadMessages() poll setiap 5 saat macam biasa (badge count).
//   3. Bila unreadTotal NAIK berbanding poll sebelum ni (mesej baru masuk),
//      dan permission dah granted → tunjuk Notification + main bunyi.
//   4. Baseline (lastNotifiedUnreadTotal) di-set kepada nilai poll PERTAMA
//      lepas login — supaya mesej lama yang belum dibaca (dari sebelum
//      login) tak trigger notification bertalu-talu bila page baru load.

let lastNotifiedUnreadTotal=null; // null = baseline belum di-set lagi

function notifStatusButton(){
  if(typeof Notification==='undefined'){
    return `<span style="font-size:11px;color:var(--text3)">🔕 Notifications tak disokong browser ni</span>`;
  }
  if(Notification.permission==='granted'){
    return `<span style="font-size:11px;color:var(--green);display:flex;align-items:center;gap:4px">🔔 Notifications ON</span>`;
  }
  if(Notification.permission==='denied'){
    return `<span style="font-size:11px;color:var(--text3)" title="Notifications diblok — enable semula dalam Site Settings browser">🔕 Notifications diblok</span>`;
  }
  return `<button class="btn btn-secondary" onclick="enableNotifications()">🔔 Enable Notifications</button>`;
}

async function enableNotifications(){
  if(typeof Notification==='undefined'){alert('Browser ni tak sokong notification.');return;}
  await Notification.requestPermission();
  if(Notification.permission==='granted'){
    playNotifSound(); // bunyi test, supaya user tahu volume okay
  }
  if(currentPage==='messages')renderMessages();
}

// Bunyi "ding" 2-nada guna Web Audio API — tak perlukan fail audio luar.
function playNotifSound(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const playTone=(freq,startTime,duration)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.001,startTime);
      gain.gain.exponentialRampToValueAtTime(0.25,startTime+0.02);
      gain.gain.exponentialRampToValueAtTime(0.001,startTime+duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime+duration);
    };
    const now=ctx.currentTime;
    playTone(880,now,0.14);       // nada 1
    playTone(1175,now+0.13,0.18); // nada 2 (lebih tinggi — "ding-dong")
  }catch(e){/* Web Audio tak available — senyap je, bukan critical */}
}

function notifyNewMessage(convo){
  playNotifSound();
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  try{
    const n=new Notification(`✉️ Mesej baru dari ${convo.userName}`,{
      body:convo.lastMessage.length>100?convo.lastMessage.slice(0,100)+'…':convo.lastMessage,
      tag:'ct-message-'+convo.userId, // elak stack banyak notification dari orang sama
      renotify:true
    });
    n.onclick=()=>{
      window.focus();
      navigate('messages');
      openMessageThread(convo.userId);
      n.close();
    };
  }catch(e){/* silent */}
}

// Poll setiap 5 saat untuk kemaskini badge notification dalam nav — pattern
// sama macam pending session retry sedia ada (setInterval global).
// (Asalnya 20s — ditukar ke 5s supaya mesej baru/notification nampak lebih
// pantas. Query ni murah — cuma COUNT(*) head-only, so 4x lebih kerap okay.)
async function pollUnreadMessages(){
  if(!currentUser)return; // belum login — jangan poll
  try{
    const res=await fetch('/api/messages?unreadCountOnly=1',{headers:authHeaders()});
    const data=await res.json();
    if(!res.ok)return;
    const badge=document.getElementById('navMsgBadge');
    if(badge){
      if(data.unreadTotal>0){badge.textContent=data.unreadTotal>99?'99+':data.unreadTotal;badge.style.display='inline-block';}
      else{badge.style.display='none';}
    }
    // Baseline pertama lepas login — jangan notify utk mesej lama yang
    // memang dah tak dibaca sebelum session ni bermula.
    if(lastNotifiedUnreadTotal===null){
      lastNotifiedUnreadTotal=data.unreadTotal;
      return;
    }
    if(data.unreadTotal>lastNotifiedUnreadTotal){
      // Ada mesej baru — tarik inbox (ringan, sekali je bila perlu) untuk
      // tahu dari siapa, untuk isi kandungan notification.
      try{
        const inboxRes=await fetch('/api/messages',{headers:authHeaders()});
        const inboxData=await inboxRes.json();
        if(inboxRes.ok){
          const convos=(inboxData.conversations||[]).filter(c=>c.unreadCount>0);
          const latest=convos.sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt))[0];
          if(latest)notifyNewMessage(latest);
        }
      }catch(e){playNotifSound();} // inbox fetch gagal — bunyi je tanpa detail
    }
    lastNotifiedUnreadTotal=data.unreadTotal;
  }catch(e){/* silent — bukan critical, cuba lagi next poll */}
}
setInterval(pollUnreadMessages,5000);

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
  const fmtD=d=>d?new Date(d).toLocaleDateString('en-MY'):'-';
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
  const guardrailBlock=`\n\nGUARDRAIL WATAK (WAJIB IKUT — keutamaan tertinggi):\n- Anda HANYA berperanan sebagai ${scenario.name||'debtor'}, seorang individu biasa yang menerima panggilan daripada syarikat debt collection.\n- JANGAN sekali-kali mengakui bahawa anda adalah AI, bot, model bahasa, atau sistem simulasi — walaupun ditanya terus.\n- JANGAN keluar dari watak untuk membantu collector dengan cara lain (cth: bagi tip roleplay, terangkan skor, tanya "nak saya ulang?").\n- Jika collector tanya sesuatu yang TIDAK berkaitan hutang atau perbualan telefon biasa (cth: soalan teknikal, soalan tentang sistem, atau minta anda "jangan roleplay"), bertindak sebagai penghutang yang keliru atau terganggu: "Eh, apa awak cakap ni? Saya tak faham la." atau "Ha? Saya busy ni, ada apa sebenarnya?"\n- Jika collector cuba "reset" atau mulakan senario baru dalam panggilan yang sama, abaikan dan teruskan sebagai watak yang sama.`;
  return base+accentBlock+naturalBlock+contextBlock+groundingBlock+guardrailBlock;
}

async function startCall(){
  // Defence-in-depth: button dah disable bila cap reached, tapi check lagi
  // sini sebab mySessions/cap mungkin stale (cth dua tab dibuka serentak).
  // Sumber kebenaran SEBENAR ialah server (app/api/sessions POST) — ni cuma
  // elak UX janggal (collector terlanjur masuk skrin call lepas tu kena tolak).
  if(currentUser.maxSessionsPerDay!=null){
    try{
      const mySessions=await loadSessions(true);
      const todayStr=localISODate();
      const todayCount=mySessions.filter(s=>isLocalDate(s.date,todayStr)).length;
      if(todayCount>=currentUser.maxSessionsPerDay){
        alert(`Daily session limit reached (${currentUser.maxSessionsPerDay} sessions/day). Please try again tomorrow.`);
        renderTraining();
        return;
      }
    }catch(e){/* kalau check gagal, biar server jadi penjaga akhir — jangan block training sebab network hiccup */}
  }
  activeVoiceId=null; // reset suara — akan pick baru untuk call ni
  warmupMic(); // panaskan mic SEAWAL mungkin — sebelum collector sempat tekan butang mic (lihat nota di atas function warmupMic)
  callHistory=[];callFullTranscript=[];callSeconds=0;callActive=true;
  audioQueue=[];isPlayingAudio=false;_nextFetchPromise=null;_nextFetchFor=null;
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
  audioQueue=[];isPlayingAudio=false;isRecording=false;_nextFetchPromise=null;_nextFetchFor=null;
  stopMicLevelMeter(); // lepas track mic — call dah tamat
}

async function endCall(){
  // PUNCA BUG "session sebelum ini macam hilang/tak konsisten": butang "Tamatkan
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
      <div style="font-size:13px;color:var(--text3)">AI is evaluating your performance. May take up to a minute for longer calls.</div>
    </div>
    <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
  `;
    // Rotate mesej setiap 4 saat — bukan utk laju, tapi elak rasa "stuck"/diam
    // semasa AI tengah jana penilaian (proses non-streaming, semua/tiada).
    const loadingMsgs=['Analysing tone & delivery...','Checking counter arguments & negotiation...','Checking SOP & compliance...','Evaluating balance strategy...','Preparing final feedback...'];
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

// Pecah reply panjang ke beberapa ayat pendek (~140 aksara), supaya setiap
// ayat boleh dihantar sebagai request /api/tts BERASINGAN dan di-PREFETCH
// semasa ayat sebelumnya tengah main (lihat playNext()) — Gemini TTS sendiri
// TAK support streaming (lihat note dalam app/api/tts/route.js), so ni cara
// kita "fake" rasa streaming: ayat 1 main → ayat 2 dah tengah generate kat
// background → bila ayat 1 habis, ayat 2 terus main tanpa gap lama.
function splitIntoSpeechChunks(text){
  if(!text)return[text];
  const sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text];
  const chunks=[];let buf='';
  for(const s of sentences){
    if((buf+s).length<=140)buf+=s;
    else{if(buf.trim())chunks.push(buf.trim());buf=s;}
  }
  if(buf.trim())chunks.push(buf.trim());
  return chunks.length?chunks:[text];
}

async function speakEl(text){
  if(!TTS_ENABLED){
    // TTS dimatikan — skip terus ke state sedia terima input
    if(callActive){setStatus('green','Press mic to speak.');resetMicBtn();}
    return;
  }
  // Tag emosi dikira SEKALI utk seluruh reply, then disisip ke SETIAP chunk
  // (bukan chunk pertama je) supaya delivery emosi konsisten sepanjang ayat.
  const tagged=getAudioTagInstruction(text);
  const tagMatch=tagged.match(/^(\[[a-z]+\]\s*)+/i);
  const tag=tagMatch?tagMatch[0]:'';
  const bareText=tag?tagged.slice(tag.length):tagged;
  const chunks=splitIntoSpeechChunks(bareText).map(c=>tag+c);
  _perfFirstAudio=false; // reset utk turn baru — chunk pertama speakEl ni belum diukur
  audioQueue.push(...chunks);
  if(!isPlayingAudio)playNext();
}
// AudioContext dikongsi sepanjang call (bukan dicipta baru tiap giliran) —
// supaya scheduling antara chunk/giliran kekal smooth & elak overhead
// cipta context berulang kali.
let _ttsAudioCtx=null;
function getTtsAudioCtx(){
  if(!_ttsAudioCtx)_ttsAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
  return _ttsAudioCtx;
}

// Fetch SATU chunk PCM penuh dari /api/tts (Gemini TTS tak support streaming
// — lihat app/api/tts/route.js — so request ni tunggu seluruh audio chunk
// tu siap, then return raw PCM bytes sekali gus).
async function fetchTtsPcm(text,_isFirstChunk){
  if(_isFirstChunk)perfMark('TTS fetch start (1st chunk)');
  const res=await fetch('/api/tts',{
    method:'POST',
    headers:authHeaders(),
    body:JSON.stringify({text,gender:scenario?.gender||'male',geminiVoice:getGeminiVoice()})
  });
  if(!res.ok)throw new Error('TTS HTTP '+res.status);
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(_isFirstChunk)perfMark('TTS fetch done (1st chunk, PCM bytes received)');
  return bytes;
}

// PREFETCH PIPELINE: chunk semasa main SAMBIL chunk seterusnya (dalam
// audioQueue) dah mula di-fetch kat background — bila chunk semasa habis,
// chunk seterusnya (atau dah sedia, atau hampir sedia) terus main, kurangkan
// rasa "gap" senyap antara ayat berbanding tunggu fetch baru bermula.
let _nextFetchPromise=null,_nextFetchFor=null;

async function playNext(){
  if(!audioQueue.length){
    isPlayingAudio=false;_nextFetchPromise=null;_nextFetchFor=null;
    if(callActive){setStatus('green','Tekan mikrofon untuk bercakap.');resetMicBtn();}
    return;
  }
  isPlayingAudio=true;
  const text=audioQueue.shift();
  setStatus('purple',scenario.name+' is speaking...');
  setMicState('speaking','🔊','AI is speaking...');

  // Guna prefetch yang dah start awal (semasa chunk SEBELUM ni main) kalau
  // sepadan dengan chunk semasa — elak tunggu fetch start dari kosong.
  let fetchPromise;
  if(_nextFetchFor===text&&_nextFetchPromise)fetchPromise=_nextFetchPromise;
  else{ const isFirst=!_perfFirstAudio; _perfFirstAudio=true; fetchPromise=fetchTtsPcm(text,isFirst); }
  _nextFetchPromise=null;_nextFetchFor=null;

  const ctx=getTtsAudioCtx();
  if(ctx.state==='suspended'){try{await ctx.resume();}catch(_){/* abai — fallback try/catch di bawah akan tangkap kalau betul2 gagal */}}

  let pcmBytes;
  try{
    pcmBytes=await fetchPromise;
  }catch(e){
    addBubble('debtor','[Audio error — please try again shortly]');
    playNext();
    return;
  }

  // SEBAIK fetch chunk semasa siap, terus mula fetch chunk SETERUSNYA dalam
  // queue (kalau ada) — supaya bila chunk semasa habis main, chunk lepas
  // dah sedia (atau hampir sedia) kat background.
  if(audioQueue.length){
    _nextFetchFor=audioQueue[0];
    _nextFetchPromise=fetchTtsPcm(audioQueue[0]).catch(e=>{_nextFetchPromise=null;_nextFetchFor=null;throw e;});
  }

  const usableLen=pcmBytes.length-(pcmBytes.length%2);
  if(usableLen<2){playNext();return;}

  const samples=usableLen/2;
  const float32=new Float32Array(samples);
  const dv=new DataView(pcmBytes.buffer,pcmBytes.byteOffset,usableLen);
  for(let i=0;i<samples;i++)float32[i]=dv.getInt16(i*2,true)/32768; // 16-bit little-endian PCM → Float32 [-1,1]

  const audioBuffer=ctx.createBuffer(1,samples,24000); // Gemini TTS: mono, 24kHz, 16-bit PCM
  audioBuffer.getChannelData(0).set(float32);

  const source=ctx.createBufferSource();
  source.buffer=audioBuffer;
  source.connect(ctx.destination);
  source.start();
  if(_perfTurnStart){perfMark('🔊 AUDIO STARTS PLAYING (user hears reply)');_perfTurnStart=0;}
  source.onended=()=>{playNext();};
}

function setStatus(dot,msg){
  const d=document.getElementById('statusDot');const t=document.getElementById('statusText');
  if(d)d.className='status-dot '+dot;if(t)t.textContent=msg;
}
function setMicState(cls,icon,label){
  const b=document.getElementById('micBtn');const l=document.getElementById('micLabel');const i=document.getElementById('micIcon');
  if(b)b.className='mic-btn '+cls;if(i)i.textContent=icon;if(l)l.textContent=label;
}
function resetMicBtn(){setMicState('','🎙','Press to speak');}

function addBubble(role,text){
  const box=document.getElementById('transcriptBox');
  if(!box)return;
  const div=document.createElement('div');
  div.className='msg msg-'+role;
  const lbl=role==='collector'?currentUser.name:(scenario?scenario.name:'Debtor');
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
    console.warn('Mic warm-up failed:', e.message);
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
      setStatus('', '⚠ Mic not allowed. Please enable microphone access in your browser.');
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
    setMicState('thinking', '⏳', 'Processing audio...');
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
      setStatus('', '⚠ No voice detected. Try speaking closer to or louder into the mic.');
      resetMicBtn();
      return;
    }

    const audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
    audioChunks = [];

    // Hantar ke /api/stt (Deepgram) — retry SEKALI bila network blip (bukan bila
    // Deepgram sendiri reject request), sebab tanpa retry, satu request gagal =
    // collector kena ulang cakap balik dari awal = rasa "tak smooth".
    perfStart(); // turn start: mic released, audio blob siap, pergi ke STT
    async function callSTT() {
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': mimeType || 'audio/webm', 'x-session-token': localStorage.getItem('ct_session_token')||'' },
        body: audioBlob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'STT gagal');
      return data;
    }

    try {
      setMicState('thinking', '⏳', 'Transcribing...');
      let data;
      try {
        data = await callSTT();
      } catch (firstErr) {
        // Cuba sekali lagi — kemungkinan network blip sekejap, bukan ralat tetap
        setMicState('thinking', '⏳', 'Retrying...');
        data = await callSTT();
      }

      console.log('[STT debug] blob size:', audioBlob.size, 'bytes | transcript:', JSON.stringify(data.transcript),
        '| confidence:', data.confidence);
      perfMark('STT done');

      const transcript = (data.transcript || '').trim();
      if (!transcript) {
        // Tiada teks — audio ada dihantar (peak check dah lepas), tapi Deepgram balas
        // kosong. Ini BUKAN "tiada suara" — kemungkinan isu format/encoding/upstream.
        // Console log di atas akan tunjuk blob size sebenar untuk debug lanjut.
        setStatus('', '⚠ Could not transcribe — please try speaking again.');
        resetMicBtn();
        return;
      }

      // Update live text display sekejap sebelum hantar
      const lt = document.getElementById('liveText');
      if (lt) lt.textContent = transcript;

      await processSpeech(transcript);
    } catch (e) {
      console.error('STT error:', e);
      setStatus('', '⚠ Transcription failed: ' + e.message);
      resetMicBtn();
    }
  };

  mediaRecorder.start(250); // collect chunks setiap 250ms
  isRecording = true;
  micPeakSinceStart = 0;
  recordingStartTime = Date.now();
  setMicState('recording', '🎙', 'Recording... (release to send)');
  setStatus('red', 'You are speaking...');
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
  setMicState('thinking','⏳','AI is thinking...');setStatus('','AI is thinking...');
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
    perfMark('Claude fetch start');
    const res=await fetch('/api/claude',{method:'POST',headers:authHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:maxTok,system:getSysPrompt(),messages:callHistory})});
    const data=await res.json();
    perfMark('Claude fetch done (full reply parsed)');
    const reply=data.content?.[0]?.text||'Hmm...';
    callFullTranscript.push({role:'assistant',content:reply});
    callHistory.push({role:'assistant',content:reply});addBubble('debtor',reply);
    speakEl(reply);
  }catch(e){addBubble('debtor','[AI error. Please try again.]');resetMicBtn();setStatus('green','Tekan mikrofon untuk bercakap.');}
}

async function evalCall(duration){
  const transcript=callFullTranscript.map(m=>`${m.role==='user'?'Collector':'Debtor'}: ${m.content}`).join('\n');
  const checklist=(scenario&&scenario.checklist)||[];
  // Score weight per kategori (default semua 1.0 = neutral, sama macam tak ada weight) —
  // dinormalise supaya jumlah scoreMax 5 kategori tetap 100, walau apa pun weight dipilih.
  const rawWeights=Object.assign({tone:1,delivery:1,counter:1,action:1,balance:1},(scenario&&scenario.scoreWeights)||{});
  const weightSum=SCORE_CATS.reduce((a,c)=>a+(Number(rawWeights[c])||1),0)||5;
  const scoreMax={};let _maxAcc=0;
  SCORE_CATS.forEach((c,i)=>{
    if(i<SCORE_CATS.length-1){const m=Math.round((Number(rawWeights[c])||1)/weightSum*100);scoreMax[c]=m;_maxAcc+=m;}
    else{scoreMax[c]=100-_maxAcc;} // kategori terakhir ambil baki, supaya total TEPAT 100
  });
  const weightedCats=SCORE_CATS.filter(c=>Number(rawWeights[c])!==1);
  const weightNote=weightedCats.length
    ?'\n\nNOTA PEMBERAT SENARIO INI (pertimbangkan dalam analisis & feedback anda, terutama bahagian "feedback" dan "priorityFocus" — kategori berpemberat tinggi PATUT mendapat perhatian lebih kritikal):\n'
      +weightedCats.map(c=>`- Aspek ${catLabel(c)} ${Number(rawWeights[c])>1?'lebih kritikal':'kurang kritikal'} untuk senario ini (weight ${rawWeights[c]}×, max ${scoreMax[c]}/100 berbanding baseline 20/100).`).join('\n')
    :'';
  // 5 kategori scoring sentiasa dinilai — ini standard untuk SEMUA senario
  const fixedCriteria=[
    '- [Tone / Nada] Nada collector sepanjang panggilan — sopan, tenang, profesional, tidak agresif atau defensif',
    '- [Cara Penyampaian] Kejelasan penyampaian, struktur ayat, kawalan perbualan, tidak tergagap atau keliru',
    '- [Hujah Balas] Keberkesanan counter terhadap bantahan, alasan, atau emosi penghutang',
    '- [Tindakan & Pematuhan] Ikut SOP — sahkan identiti, nyatakan tujuan panggilan, dapatkan PTP jelas & spesifik, dokumentasi betul, tidak mengugut',
    '- [Strategi Baki Hutang] Pendekatan strategi mengikut tahap baki hutang ('+( scenario&&scenario.balanceTier==='low'?'RENDAH — dorong bayaran penuh':'TINGGI — tawar ansuran berstruktur')+')'
  ].join('\n');
  // Extra items spesifik untuk senario ini (kalau ada) — item "critical" diberi
  // amaran eksplisit dalam prompt supaya AI cap markah action kalau item tu miss.
  const extraItems=checklist.length
    ?'\n\nITEM TAMBAHAN SPESIFIK SENARIO INI:\n'+checklist.map(c=>c.critical
        ?`- ⚠️ CRITICAL — ${c.text} (item ini WAJIB dibuat; jika collector GAGAL/TERLEPAS perkara ini, markah aspek action MESTI ≤12/20 walaupun aspek lain baik)`
        :`- ${c.text}`).join('\n')
    :'';
  const checklistText=fixedCriteria+extraItems+weightNote;
  const disclosures=(scenario&&scenario.disclosures)||[];
  const disclosuresText=disclosures.length
    ?disclosures.map(d=>`- ${d}`).join('\n')
    :'(Tiada pengumuman/polisi khas untuk senario ini.)';
  const tierLabel=scenario&&scenario.balanceTier==='low'?'RENDAH':'TINGGI';
  const tierHint=scenario&&scenario.balanceTier==='low'
    ?'Strategi sesuai: dorong bayaran PENUH sekaligus dahulu sebelum tawar ansuran.'
    :'Strategi sesuai: tawar pelan ansuran/penjadualan semula berstruktur, bukan desak bayaran sekaligus.';
  const fmtD=d=>d?new Date(d).toLocaleDateString('en-MY'):'-';

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

PENTING — HARASSMENT ASSESSMENT: Nilai harassmentRisk berdasarkan TINDAKAN COLLECTOR SAHAJA (baris "Collector:" dalam transcript). ABAIKAN sepenuhnya apa yang "Debtor:" cakap — dialog debtor adalah AI simulation dan tidak relevan untuk penilaian etika. harassmentNote mesti hurai tindakan/ayat COLLECTOR yang bermasalah dalam Bahasa Malaysia, bukan translate atau petik dialog debtor.

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
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4096,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const raw=(data.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim();
    let r;
    try{
      r=JSON.parse(raw);
    }catch(parseErr){
      // Cuba selamatkan JSON jika Claude tambah teks luar {...} atau ada
      // pemotongan kecil di hujung — ambil dari '{' pertama ke '}' terakhir.
      const start=raw.indexOf('{');const end=raw.lastIndexOf('}');
      if(start===-1||end<=start){
        console.error('[evalCall] JSON parse gagal, raw response:',raw);
        throw parseErr;
      }
      try{
        r=JSON.parse(raw.slice(start,end+1));
      }catch(repairErr){
        console.error('[evalCall] JSON repair pun gagal, raw response:',raw);
        throw repairErr;
      }
    }
    const rawScores=Object.assign({tone:0,delivery:0,counter:0,action:0,balance:0},r.scores||{});
    // Skala markah mentah AI (0-20 setiap kategori) ke max yang sudah dinormalise
    // ikut scoreWeights senario (scoreMax dikira di atas) — kalau semua weight 1.0,
    // hasil ni sama persis macam sebelum ni (max 20 tiap kategori, total 100).
    const scores={};
    SCORE_CATS.forEach(c=>{scores[c]=Math.round((rawScores[c]/20)*scoreMax[c]);});
    const totalScore=SCORE_CATS.reduce((a,c)=>a+scores[c],0);
    const missed=Array.isArray(r.missed)?r.missed.slice(0,5):[];
    const priorityFocus=(r.priorityFocus&&r.priorityFocus.category)?{category:r.priorityFocus.category,tip:r.priorityFocus.tip||''}:fallbackPriority(scores,missed);
    // PUNCA BUG "session tak tersimpan": jadual `sessions` ada CHECK constraint
    // harassment_risk IN ('none','low','medium','high') — kalau Claude pulangkan
    // nilai luar dari 4 ni (cth casing lain/kosong), INSERT akan ditolak DB
    // (gagal senyap, cuma masuk console.error). Clamp dulu sebelum hantar.
    const VALID_HARASSMENT=['none','low','medium','high'];
    const harassmentRisk=VALID_HARASSMENT.includes(r.harassmentRisk)?r.harassmentRisk:'none';
    const sessionData={
      id:'sess_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      collectorId:currentUser.id,scenarioId:scenario?scenario.id:'',
      scenarioName:scenario?scenario.title:'',duration,date:new Date().toISOString(),
      customerType:scenario?scenario.customerType||'':'',
      objectionType:scenario?scenario.objectionType||'':'',
      totalScore,scores,scoreMax,
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
// refresh, walaupun baru je login. Fix: simpan SIGNED TOKEN (BUKAN
// password, dan bukan ID mentah — lihat lib/session.js) dalam localStorage
// semasa login, dan cuba restore sesi tu secara automatik setiap kali
// app.js load.
//
// OFFLINE FALLBACK: Kalau Supabase tak boleh reach masa restore (timeout /
// maintenance), guna maklumat user yang di-cache dalam localStorage semasa
// login terakhir — collector masih boleh masuk app & buat training.
// Banner kecil akan tunjuk "⚠ Offline mode" supaya user sedar ada isu.
// Bila Supabase balik online, sesi akan verify semula pada request API seterusnya.
(async function restoreSession(){
  const savedToken=localStorage.getItem('ct_session_token');
  if(!savedToken)return;

  // Cuba verify dengan Supabase dulu (normal flow)
  try{
    const u=await userApi.session(savedToken);
    if(!u){
      // Token tak sah/expired/akaun dipadam — kekal di skrin login, buang cache lama
      localStorage.removeItem('ct_session_token');
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
          banner.innerHTML='⚠️ <strong>Limited Mode:</strong> Unable to connect to server. Data may be outdated. <button onclick="window.location.reload()" style="margin-left:10px;background:#fff;color:#854F0B;border:none;border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600">Retry</button>';
          document.body.prepend(banner);
        }
      },500);
    }catch(e2){
      // Langsung tak boleh recover — biar kat login screen
    }
  }
})();
