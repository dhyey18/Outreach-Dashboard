// Reads all vadodara leads and writes dashboard-vadodara.html

const fs   = require('fs');
const path = require('path');

const DIR        = __dirname;
const LEADS_DIR  = path.join(DIR, 'leads', 'vadodara');
const SEND_LOG   = path.join(DIR, 'send_log.json');
const BATCH_PROG = path.join(DIR, 'batch_progress.json');
const OUT_FILE   = path.join(DIR, 'dashboard-vadodara.html');

function norm(raw) {
    let n = String(raw || '').replace(/[\s\-+()]/g, '');
    if (n.length === 10) n = '91' + n;
    return n;
}
function loadJSON(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

const sendLog   = loadJSON(SEND_LOG)   || [];
const batchProg = loadJSON(BATCH_PROG) || {};

const contactedMap = new Map();
for (const e of sendLog) {
    if (e.status === 'sent' && e.phone) {
        const p = norm(e.phone);
        if ((e.stage || 0) > (contactedMap.get(p) || 0)) contactedMap.set(p, e.stage);
    }
}

const attemptedByFile = {};
for (const [key, val] of Object.entries(batchProg)) {
    const file = key.split('|')[0];
    if (!attemptedByFile[file]) attemptedByFile[file] = new Set();
    (val.attempted || []).forEach(p => attemptedByFile[file].add(norm(p)));
}

const files = fs.existsSync(LEADS_DIR)
    ? fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('_leads.json')).sort()
    : [];

const industries = [];
const leads = [];

for (const file of files) {
    const industry = file.replace('_leads.json', '');
    industries.push(industry);

    const raw      = loadJSON(path.join(LEADS_DIR, file)) || [];
    const linkedin = loadJSON(path.join(LEADS_DIR, file.replace('_leads.json', '_linkedin.json'))) || {};
    const analysis = loadJSON(path.join(LEADS_DIR, file.replace('_leads.json', '_analysis.json'))) || {};
    const attempted = attemptedByFile[`leads/vadodara/${file}`] || new Set();

    for (const lead of raw) {
        if (!lead.phone) continue;
        const p  = norm(lead.phone);
        const li = linkedin[lead.phone] || {};
        const an = analysis[lead.phone] || {};

        leads.push({
            industry,
            name    : (lead.title || lead.name || '').trim(),
            phone   : lead.phone,
            website : lead.website || '',
            rating  : lead.rating  || null,
            reviews : lead.reviews || 0,
            address : (lead.address || '').replace(/, India$/, ''),
            type    : lead.type    || (Array.isArray(lead.types) ? lead.types[0] : '') || '',
            linkedin: li.profiles  || [],
            issues  : an.issues    || [],
            stage   : contactedMap.get(p) || 0,
        });
    }
}

const stats = {
    total      : leads.length,
    withWebsite: leads.filter(l => l.website).length,
    liFound    : leads.filter(l => l.linkedin.length > 0).length,
    analyzed   : leads.filter(l => l.issues.length > 0).length,
    stage1     : leads.filter(l => l.stage >= 1).length,
    stage2     : leads.filter(l => l.stage >= 2).length,
};

const indCounts = {};
for (const l of leads) indCounts[l.industry] = (indCounts[l.industry] || 0) + 1;

console.log(`  Loaded ${leads.length} leads across ${industries.length} industries (Vadodara)`);

const dataJSON = JSON.stringify({ leads, industries, stats, indCounts });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalyq — Vadodara Lead Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f1f5f9;--card:#fff;--border:#e2e8f0;
  --sidebar:#0f172a;--sidebar2:#1e293b;--sidebar3:#334155;
  --blue:#3b82f6;--blue2:#2563eb;--blue-bg:#eff6ff;
  --green:#16a34a;--green-bg:#f0fdf4;
  --amber:#d97706;--amber-bg:#fffbeb;
  --red:#dc2626;--red-bg:#fef2f2;
  --purple:#7c3aed;--purple-bg:#f5f3ff;
  --text:#0f172a;--text2:#475569;--text3:#94a3b8;--text4:#cbd5e1;
  --radius:10px;
  --shadow:0 1px 3px rgba(0,0,0,.07),0 1px 2px rgba(0,0,0,.04);
  --shadow-md:0 4px 6px rgba(0,0,0,.06),0 2px 4px rgba(0,0,0,.04);
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;height:100vh;overflow:hidden}

/* ── SIDEBAR ── */
.sidebar{width:220px;flex-shrink:0;background:var(--sidebar);display:flex;flex-direction:column;overflow:hidden}
.sb-logo{padding:20px 16px 14px;border-bottom:1px solid var(--sidebar3)}
.sb-logo-text{font-size:20px;font-weight:800;color:#fff;letter-spacing:-.5px}
.sb-logo-text span{color:var(--blue)}
.sb-logo-sub{font-size:11px;color:var(--text3);margin-top:2px}
.sb-city{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#f59e0b;margin-top:4px;display:flex;align-items:center;gap:4px}
.sb-section{padding:12px 0 4px;color:var(--text3);font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding-left:16px}
.sb-nav{flex:1;overflow-y:auto;padding-bottom:12px}
.sb-nav::-webkit-scrollbar{width:4px}
.sb-nav::-webkit-scrollbar-thumb{background:var(--sidebar3);border-radius:2px}
.ind-item{display:flex;align-items:center;justify-content:space-between;padding:7px 16px;cursor:pointer;color:var(--text4);font-size:13px;transition:all .12s;border-left:2px solid transparent}
.ind-item:hover{background:var(--sidebar2);color:#fff}
.ind-item.active{background:var(--sidebar2);color:#fff;border-left-color:var(--blue)}
.ind-item .ind-name{text-transform:capitalize}
.ind-count{background:var(--sidebar3);color:var(--text3);border-radius:10px;padding:1px 7px;font-size:10px;font-weight:600}
.ind-item.active .ind-count{background:var(--blue2);color:#fff}
.sb-footer{padding:12px 16px;border-top:1px solid var(--sidebar3);font-size:11px;color:var(--text3)}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}

/* ── TOPBAR ── */
.topbar{background:var(--card);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.search-wrap{position:relative;flex:1;max-width:340px}
.search-wrap input{width:100%;padding:7px 12px 7px 34px;border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:var(--bg);color:var(--text);transition:border-color .15s}
.search-wrap input:focus{border-color:var(--blue);background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none;font-size:14px}
select.flt{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--bg);color:var(--text);outline:none;cursor:pointer}
select.flt:focus{border-color:var(--blue)}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.result-count{font-size:12px;color:var(--text3);white-space:nowrap}
.btn{padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-primary{background:var(--blue);color:#fff}
.btn-primary:hover{background:var(--blue2)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--bg)}

/* ── STATS ── */
.stats-row{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:16px 20px;flex-shrink:0}
.stat{background:var(--card);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow);border:1px solid var(--border);position:relative;overflow:hidden}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--stat-color,var(--blue))}
.stat-icon{font-size:20px;margin-bottom:6px}
.stat-val{font-size:24px;font-weight:800;color:var(--text);line-height:1}
.stat-lbl{font-size:11px;color:var(--text3);margin-top:4px;font-weight:500}
.stat-sub{font-size:11px;color:var(--text3);margin-top:2px}

/* ── TABLE WRAPPER ── */
.tbl-wrap{flex:1;overflow-y:auto;padding:0 20px 20px;min-height:0}
.tbl-wrap::-webkit-scrollbar{width:6px}
.tbl-wrap::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.tbl-card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow-md);border:1px solid var(--border);overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{background:var(--sidebar2);color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:10px 14px;text-align:left;white-space:nowrap;cursor:pointer;user-select:none;position:sticky;top:0;z-index:5}
thead th:hover{background:var(--sidebar3);color:#fff}
thead th.asc::after{content:' ▲';opacity:.7}
thead th.desc::after{content:' ▼';opacity:.7}
tbody tr{border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s}
tbody tr:last-child{border-bottom:none}
tbody tr:hover td{background:#f8fafc}
tbody tr.open td{background:#f0f9ff}
td{padding:10px 14px;vertical-align:middle}

.name-col{max-width:220px}
.biz-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.biz-type{font-size:11px;color:var(--text3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ind-pill{background:#f1f5f9;color:var(--text2);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;text-transform:capitalize;white-space:nowrap}
.stars{color:#f59e0b;font-size:12px}
.rating-num{font-weight:700;font-size:13px}
.rev-count{color:var(--text3);font-size:11px;margin-left:3px}
a.phone{color:var(--blue);text-decoration:none;font-weight:500;white-space:nowrap;font-size:12px}
a.phone:hover{text-decoration:underline}
a.site{color:var(--blue);text-decoration:none;font-size:12px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
a.site:hover{text-decoration:underline}
.dash{color:var(--text4);font-size:12px}

/* badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
.b-blue{background:var(--blue-bg);color:var(--blue)}
.b-green{background:var(--green-bg);color:var(--green)}
.b-amber{background:var(--amber-bg);color:var(--amber)}
.b-red{background:var(--red-bg);color:var(--red)}
.b-gray{background:#f1f5f9;color:var(--text3)}
.b-purple{background:var(--purple-bg);color:var(--purple)}
.dot{width:6px;height:6px;border-radius:50%;display:inline-block}

/* expand chevron */
.chev{display:inline-block;transition:transform .2s;color:var(--text3);font-size:12px;line-height:1}
tr.open .chev{transform:rotate(90deg);color:var(--blue)}

/* detail row */
.detail-row td{padding:0;background:#f0f9ff !important;cursor:default}
.detail-inner{padding:16px 16px 20px 44px;border-top:1px solid #bfdbfe}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.d-head{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin-bottom:10px}
.li-card{display:flex;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;align-items:flex-start}
.li-ava{width:34px;height:34px;border-radius:50%;background:#0077b5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.li-name{font-weight:700;font-size:13px;color:var(--text)}
.li-title{font-size:11px;color:var(--text2);margin-top:2px;line-height:1.4}
.li-url{display:inline-block;margin-top:6px;font-size:11px;color:#0077b5;font-weight:600;text-decoration:none}
.li-url:hover{text-decoration:underline}
.issue-line{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2)}
.issue-line:last-child{border-bottom:none}
.ix{color:var(--red);font-size:13px;flex-shrink:0;margin-top:1px}
.no-detail{font-size:12px;color:var(--text3);padding:8px 0}
.addr{font-size:11px;color:var(--text3);margin-top:10px;display:flex;gap:5px;align-items:flex-start}

/* empty */
.empty{text-align:center;padding:60px 20px;color:var(--text3)}
.empty-icon{font-size:48px;margin-bottom:12px}
.empty-txt{font-size:15px;font-weight:500}
</style>
</head>
<body>

<!-- SIDEBAR -->
<aside class="sidebar">
  <div class="sb-logo">
    <div class="sb-logo-text">Cat<span>alyq</span></div>
    <div class="sb-logo-sub">Outreach Dashboard</div>
    <div class="sb-city">📍 Vadodara</div>
  </div>
  <div class="sb-nav">
    <div class="sb-section">Industries</div>
    <div class="ind-item active" onclick="setIndustry('all')" id="ind-all">
      <span class="ind-name">All Industries</span>
      <span class="ind-count" id="cnt-all">0</span>
    </div>
    <div id="ind-list"></div>
  </div>
  <div class="sb-footer" id="last-built"></div>
</aside>

<!-- MAIN -->
<div class="main">

  <!-- TOPBAR -->
  <div class="topbar">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="search" placeholder="Search businesses… (press /)" oninput="filter()">
    </div>
    <select class="flt" id="f-status" onchange="filter()">
      <option value="">All statuses</option>
      <option value="0">Not contacted</option>
      <option value="1">Stage 1 sent</option>
      <option value="2">Stage 2 sent</option>
    </select>
    <select class="flt" id="f-web" onchange="filter()">
      <option value="">Website: all</option>
      <option value="1">Has website</option>
      <option value="0">No website</option>
    </select>
    <select class="flt" id="f-li" onchange="filter()">
      <option value="">LinkedIn: all</option>
      <option value="1">Found</option>
      <option value="0">Not found</option>
    </select>
    <select class="flt" id="f-issues" onchange="filter()">
      <option value="">Issues: all</option>
      <option value="1">Has issues</option>
    </select>
    <div class="tb-right">
      <span class="result-count" id="result-count"></span>
      <button class="btn btn-ghost" onclick="clearFilters()">Clear</button>
      <button class="btn btn-primary" onclick="exportCSV()">↓ Export CSV</button>
    </div>
  </div>

  <!-- STATS -->
  <div class="stats-row" id="stats-row"></div>

  <!-- TABLE -->
  <div class="tbl-wrap">
    <div class="tbl-card">
      <table id="tbl">
        <thead>
          <tr>
            <th style="width:24px"></th>
            <th onclick="sortBy('name')">Business</th>
            <th onclick="sortBy('industry')">Industry</th>
            <th onclick="sortBy('rating')">Rating</th>
            <th>Phone</th>
            <th onclick="sortBy('website')">Website</th>
            <th onclick="sortBy('li')">LinkedIn</th>
            <th onclick="sortBy('issues')">Issues</th>
            <th onclick="sortBy('stage')">Status</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
      <div class="empty" id="empty" style="display:none">
        <div class="empty-icon">🔍</div>
        <div class="empty-txt">No leads match your filters</div>
      </div>
    </div>
  </div>
</div>

<script>
const {leads, industries, stats, indCounts} = ${dataJSON};

let filtered = leads.slice();
let activeInd = 'all';
let sortKey   = 'name';
let sortDir   = 1;
let openRows  = new Set();

function init() {
  renderStats();
  renderSidebar();
  filter();
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); document.getElementById('search').focus();
    }
    if (e.key === 'Escape') { document.getElementById('search').value=''; filter(); }
  });
}

function renderStats() {
  const p = n => leads.length ? Math.round(n/leads.length*100) : 0;
  const cards = [
    {icon:'📋', val:stats.total.toLocaleString(),       lbl:'Total Leads',       sub:industries.length+' industries',         color:'#3b82f6'},
    {icon:'🌐', val:stats.withWebsite.toLocaleString(), lbl:'Have Website',      sub:p(stats.withWebsite)+'% of leads',        color:'#8b5cf6'},
    {icon:'🔗', val:stats.liFound.toLocaleString(),     lbl:'LinkedIn Found',    sub:p(stats.liFound)+'% founders identified', color:'#0077b5'},
    {icon:'⚠️', val:stats.analyzed.toLocaleString(),    lbl:'Site Issues Found', sub:'websites analyzed',                      color:'#f59e0b'},
    {icon:'✉️', val:stats.stage1.toLocaleString(),      lbl:'Stage 1 Sent',      sub:p(stats.stage1)+'% contacted',            color:'#22c55e'},
    {icon:'🔁', val:stats.stage2.toLocaleString(),      lbl:'Stage 2 Sent',      sub:'follow-ups sent',                        color:'#f43f5e'},
  ];
  document.getElementById('stats-row').innerHTML = cards.map(c => \`
    <div class="stat" style="--stat-color:\${c.color}">
      <div class="stat-icon">\${c.icon}</div>
      <div class="stat-val">\${c.val}</div>
      <div class="stat-lbl">\${c.lbl}</div>
      <div class="stat-sub">\${c.sub}</div>
    </div>\`).join('');
}

function renderSidebar() {
  document.getElementById('cnt-all').textContent = leads.length;
  document.getElementById('ind-list').innerHTML = industries.map(ind => \`
    <div class="ind-item" onclick="setIndustry('\${ind}')" id="ind-\${ind}">
      <span class="ind-name">\${ind}</span>
      <span class="ind-count" id="cnt-\${ind}">\${indCounts[ind]||0}</span>
    </div>\`).join('');
  document.getElementById('last-built').textContent = 'Built ' + new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}

function setIndustry(ind) {
  activeInd = ind;
  document.querySelectorAll('.ind-item').forEach(el => el.classList.remove('active'));
  document.getElementById('ind-'+ind)?.classList.add('active');
  openRows.clear();
  filter();
}

function filter() {
  const q    = document.getElementById('search').value.toLowerCase();
  const fSt  = document.getElementById('f-status').value;
  const fWeb = document.getElementById('f-web').value;
  const fLi  = document.getElementById('f-li').value;
  const fIss = document.getElementById('f-issues').value;

  filtered = leads.filter(l => {
    if (activeInd !== 'all' && l.industry !== activeInd) return false;
    if (q && !l.name.toLowerCase().includes(q) && !l.address.toLowerCase().includes(q) && !l.type.toLowerCase().includes(q)) return false;
    if (fSt  !== '' && String(l.stage) !== fSt)  return false;
    if (fWeb === '1' && !l.website)               return false;
    if (fWeb === '0' && l.website)                return false;
    if (fLi  === '1' && !l.linkedin.length)       return false;
    if (fLi  === '0' && l.linkedin.length)        return false;
    if (fIss === '1' && !l.issues.length)         return false;
    return true;
  });
  doSort();
  document.getElementById('result-count').textContent = filtered.length.toLocaleString() + ' leads';
  renderTable();
}

function clearFilters() {
  document.getElementById('search').value = '';
  ['f-status','f-web','f-li','f-issues'].forEach(id => document.getElementById(id).value = '');
  filter();
}

function sortBy(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
  document.querySelectorAll('thead th').forEach(th => { th.classList.remove('asc','desc'); });
  const map = {name:1,industry:2,rating:3,website:5,li:6,issues:7,stage:8};
  const th  = document.querySelectorAll('thead th')[map[key]];
  if (th) th.classList.add(sortDir===1?'asc':'desc');
  doSort(); renderTable();
}

function doSort() {
  filtered.sort((a,b) => {
    let va,vb;
    switch(sortKey){
      case 'rating':  va=a.rating||0;              vb=b.rating||0;              break;
      case 'li':      va=a.linkedin.length;         vb=b.linkedin.length;        break;
      case 'issues':  va=a.issues.length;           vb=b.issues.length;          break;
      case 'stage':   va=a.stage;                   vb=b.stage;                  break;
      case 'website': va=a.website?1:0;             vb=b.website?1:0;            break;
      case 'industry':va=a.industry;                vb=b.industry;               break;
      default:        va=a.name.toLowerCase();      vb=b.name.toLowerCase();
    }
    if(va<vb) return -sortDir; if(va>vb) return sortDir; return 0;
  });
}

function renderTable() {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!filtered.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  const rows = [];
  filtered.forEach((l,i) => {
    rows.push(rowHTML(l,i));
    if (openRows.has(i)) rows.push(detailHTML(l,i));
  });
  tbody.innerHTML = rows.join('');
}

const STATUS = {
  0: '<span class="badge b-gray"><span class="dot" style="background:#94a3b8"></span>Not contacted</span>',
  1: '<span class="badge b-blue"><span class="dot" style="background:#3b82f6"></span>Stage 1</span>',
  2: '<span class="badge b-green"><span class="dot" style="background:#16a34a"></span>Stage 2</span>',
};

function rowHTML(l,i) {
  const rat = l.rating
    ? \`<span class="stars">★</span><span class="rating-num">\${l.rating}</span><span class="rev-count">(\${(l.reviews||0).toLocaleString()})</span>\`
    : '<span class="dash">—</span>';
  const web = l.website
    ? \`<a class="site" href="\${esc(l.website)}" target="_blank" onclick="event.stopPropagation()">🌐 Visit</a>\`
    : '<span class="dash">—</span>';
  const li = l.linkedin.length
    ? \`<span class="badge b-blue">🔗 \${l.linkedin.length} found</span>\`
    : '<span class="dash">—</span>';
  const iss = l.issues.length
    ? \`<span class="badge b-red">⚠ \${l.issues.length} issues</span>\`
    : l.website ? '<span class="badge b-green">✓ Clean</span>' : '<span class="dash">—</span>';
  const open = openRows.has(i);
  return \`<tr class="\${open?'open':''}" onclick="toggle(\${i})">
    <td><span class="chev">▶</span></td>
    <td class="name-col">
      <div class="biz-name" title="\${esc(l.name)}">\${esc(l.name)}</div>
      <div class="biz-type">\${esc(l.type)}</div>
    </td>
    <td><span class="ind-pill">\${l.industry}</span></td>
    <td>\${rat}</td>
    <td><a class="phone" href="tel:\${l.phone}" onclick="event.stopPropagation()">\${l.phone}</a></td>
    <td>\${web}</td>
    <td>\${li}</td>
    <td>\${iss}</td>
    <td>\${STATUS[l.stage]||STATUS[0]}</td>
  </tr>\`;
}

function detailHTML(l,i) {
  const liHTML = l.linkedin.length
    ? l.linkedin.map(p => {
        const ini = (p.name||'?').split(' ').map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
        return \`<div class="li-card">
          <div class="li-ava">\${ini}</div>
          <div>
            <div class="li-name">\${esc(p.name||'')}</div>
            <div class="li-title">\${esc((p.title||p.snippet||'').substring(0,90))}</div>
            <a class="li-url" href="\${esc(p.profile_url||'')}" target="_blank">View LinkedIn →</a>
          </div>
        </div>\`;
      }).join('')
    : '<div class="no-detail">No LinkedIn profiles found for this business.</div>';

  const issHTML = l.issues.length
    ? l.issues.map(s=>\`<div class="issue-line"><span class="ix">✗</span><span>\${esc(s)}</span></div>\`).join('')
    : l.website
      ? '<div class="badge b-green" style="display:inline-flex;margin-top:4px">✓ No issues found</div>'
      : '<div class="no-detail">Run analyze.js to audit this website.</div>';

  return \`<tr class="detail-row" onclick="event.stopPropagation()">
    <td colspan="9">
      <div class="detail-inner">
        <div class="detail-grid">
          <div>
            <div class="d-head">LinkedIn Profiles</div>
            \${liHTML}
          </div>
          <div>
            <div class="d-head">Website Issues</div>
            \${issHTML}
            \${l.address?'<div class="addr">📍 '+esc(l.address)+'</div>':''}
          </div>
        </div>
      </div>
    </td>
  </tr>\`;
}

function toggle(i) {
  if (openRows.has(i)) openRows.delete(i); else openRows.add(i);
  renderTable();
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function exportCSV() {
  const cols = ['Industry','Business','Phone','Website','Rating','Reviews','Type','Address','Status','LinkedIn Names','LinkedIn URLs','Issues'];
  const rows = [cols.join(',')];
  const cell = v => '"'+String(v||'').replace(/"/g,'""')+'"';
  const stMap = {0:'Not contacted',1:'Stage 1 sent',2:'Stage 2 sent'};
  filtered.forEach(l => rows.push([
    cell(l.industry), cell(l.name), cell(l.phone), cell(l.website),
    cell(l.rating), cell(l.reviews), cell(l.type), cell(l.address),
    cell(stMap[l.stage]||''), cell(l.linkedin.map(p=>p.name).join(' | ')),
    cell(l.linkedin.map(p=>p.profile_url).join(' | ')), cell(l.issues.join(' | ')),
  ].join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\\n')],{type:'text/csv'}));
  a.download = 'catalyq_vadodara_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

init();
</script>
</body>
</html>`;

fs.writeFileSync(OUT_FILE, html, 'utf8');
const size = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
console.log(`\n✅  dashboard-vadodara.html built (${size} KB)`);
console.log(`   Open in browser: file://${OUT_FILE}\n`);
