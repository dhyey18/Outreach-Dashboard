const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4000;
const DIR = __dirname;
const LEADS_DIR = path.join(DIR, 'leads');

// ─────────────────────────────────────────────
//  DATA LOADING
// ─────────────────────────────────────────────
function normalise(raw) {
    let n = String(raw).replace(/[\s\-+()]/g, '');
    if (n.length === 10) n = '91' + n;
    return n;
}

function loadJSON(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function loadAllData() {
    if (!fs.existsSync(LEADS_DIR)) return { leads: [], industries: [], stats: {} };

    // Build contacted map from send_log
    const sendLog = loadJSON(path.join(DIR, 'send_log.json')) || [];
    const contactedMap = new Map();
    for (const e of sendLog) {
        if (e.status === 'sent' && e.phone) {
            const p = normalise(e.phone);
            if ((e.stage || 0) > (contactedMap.get(p) || 0)) contactedMap.set(p, e.stage);
        }
    }

    // Build attempted set from batch_progress
    const progress = loadJSON(path.join(DIR, 'batch_progress.json')) || {};
    const attemptedByFile = {};
    for (const [key, val] of Object.entries(progress)) {
        const file = key.split('|')[0];
        if (!attemptedByFile[file]) attemptedByFile[file] = new Set();
        (val.attempted || []).forEach(p => attemptedByFile[file].add(normalise(p)));
    }

    const industries = [];
    const leads = [];

    const files = fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('_leads.json')).sort();

    for (const file of files) {
        const industry = file.replace('_leads.json', '');
        industries.push(industry);

        const raw = loadJSON(path.join(LEADS_DIR, file)) || [];
        const linkedin = loadJSON(path.join(LEADS_DIR, file.replace('_leads.json', '_linkedin.json'))) || {};
        const analysis = loadJSON(path.join(LEADS_DIR, file.replace('_leads.json', '_analysis.json'))) || {};
        const attempted = attemptedByFile[`leads/${file}`] || new Set();

        for (const lead of raw) {
            if (!lead.phone) continue;
            const p = normalise(lead.phone);
            const li = linkedin[lead.phone] || {};
            const an = analysis[lead.phone] || {};

            leads.push({
                industry,
                title: lead.title || lead.name || '',
                phone: lead.phone,
                website: lead.website || '',
                rating: lead.rating || null,
                reviews: lead.reviews || 0,
                address: (lead.address || '').replace(/, India$/, ''),
                type: lead.type || '',
                linkedin: li.profiles || [],
                issues: an.issues || [],
                siteTitle: an.title || '',
                stage: contactedMap.get(p) || 0,
                attempted: attempted.has(p),
            });
        }
    }

    return {
        industries,
        leads,
        stats: {
            total: leads.length,
            withWebsite: leads.filter(l => l.website).length,
            linkedinFound: leads.filter(l => l.linkedin.length > 0).length,
            analyzed: leads.filter(l => l.issues.length > 0).length,
            stage1: leads.filter(l => l.stage >= 1).length,
            stage2: leads.filter(l => l.stage >= 2).length,
        },
    };
}

// ─────────────────────────────────────────────
//  HTML
// ─────────────────────────────────────────────
function buildHTML(data) {
    const json = JSON.stringify(data);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Catalyq Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f1f5f9; --card: #ffffff; --border: #e2e8f0;
    --navy: #0f172a; --navy2: #1e293b; --navy3: #334155;
    --blue: #3b82f6; --blue-light: #eff6ff;
    --green: #22c55e; --green-light: #f0fdf4;
    --amber: #f59e0b; --amber-light: #fffbeb;
    --red: #ef4444; --red-light: #fef2f2;
    --purple: #8b5cf6; --purple-light: #f5f3ff;
    --text: #0f172a; --text2: #475569; --text3: #94a3b8;
    --radius: 10px; --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
    --shadow-md: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.05);
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  /* HEADER */
  .header { background: var(--navy); color: #fff; padding: 0 24px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  .header-brand { font-size: 18px; font-weight: 700; letter-spacing: -.3px; }
  .header-brand span { color: var(--blue); }
  .header-sub { font-size: 12px; color: #94a3b8; margin-top: 1px; }
  .header-right { display: flex; gap: 8px; align-items: center; }
  .btn-export { background: var(--blue); color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 500; }
  .btn-export:hover { background: #2563eb; }

  /* STATS */
  .stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; padding: 20px 24px 0; }
  .stat-card { background: var(--card); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); border: 1px solid var(--border); }
  .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text3); margin-bottom: 6px; }
  .stat-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1; }
  .stat-sub { font-size: 12px; color: var(--text3); margin-top: 4px; }

  /* FILTERS */
  .filters { padding: 16px 24px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .search-box { position: relative; flex: 1; min-width: 220px; max-width: 320px; }
  .search-box input { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--card); outline: none; color: var(--text); }
  .search-box input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
  .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 14px; pointer-events: none; }
  select.filter { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: var(--card); color: var(--text); outline: none; cursor: pointer; }
  select.filter:focus { border-color: var(--blue); }
  .industry-tabs { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
  .tab { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--text2); transition: all .15s; white-space: nowrap; }
  .tab:hover { border-color: var(--blue); color: var(--blue); }
  .tab.active { background: var(--blue); color: #fff; border-color: var(--blue); }
  .filter-count { font-size: 12px; color: var(--text3); white-space: nowrap; margin-left: auto; }

  /* TABLE */
  .table-wrap { margin: 0 24px 24px; background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow-md); border: 1px solid var(--border); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { background: var(--navy2); color: #cbd5e1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; padding: 11px 14px; text-align: left; white-space: nowrap; position: sticky; top: 56px; z-index: 10; cursor: pointer; user-select: none; }
  thead th:hover { background: var(--navy3); }
  thead th .sort-icon { opacity: .4; margin-left: 4px; }
  thead th.sorted .sort-icon { opacity: 1; }
  tbody tr { border-bottom: 1px solid var(--border); transition: background .1s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover > td { background: #f8fafc; }
  tbody tr.expanded > td { background: #f8fafc; }
  td { padding: 10px 14px; vertical-align: middle; }
  td.name-cell { max-width: 240px; }
  .biz-name { font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .biz-type { font-size: 11px; color: var(--text3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
  .rating { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .star { color: #f59e0b; font-size: 13px; }
  .rating-val { font-weight: 600; }
  .reviews { color: var(--text3); font-size: 11px; }
  .phone-link { color: var(--blue); text-decoration: none; font-weight: 500; white-space: nowrap; }
  .phone-link:hover { text-decoration: underline; }
  .site-link { color: var(--blue); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
  .site-link:hover { text-decoration: underline; }
  .no-data { color: var(--text3); font-size: 12px; }

  /* BADGES */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .badge-blue { background: var(--blue-light); color: var(--blue); }
  .badge-green { background: var(--green-light); color: #16a34a; }
  .badge-amber { background: var(--amber-light); color: #d97706; }
  .badge-red { background: var(--red-light); color: var(--red); }
  .badge-gray { background: #f1f5f9; color: var(--text3); }
  .badge-purple { background: var(--purple-light); color: var(--purple); }
  .ind-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: var(--text2); }

  /* STATUS */
  .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 5px; }
  .dot-none { background: #cbd5e1; }
  .dot-s1 { background: var(--blue); }
  .dot-s2 { background: var(--green); }

  /* EXPAND ROW */
  .expand-btn { background: none; border: none; cursor: pointer; color: var(--text3); font-size: 16px; padding: 2px; line-height: 1; transition: transform .2s; }
  .expand-btn.open { transform: rotate(90deg); }
  .detail-row td { padding: 0; background: #f8fafc !important; }
  .detail-inner { padding: 16px 20px 20px 48px; border-top: 1px solid var(--border); }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .detail-section h4 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text3); margin-bottom: 10px; }
  .linkedin-profile { display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: var(--card); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px; }
  .li-avatar { width: 36px; height: 36px; border-radius: 50%; background: #0077b5; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0; }
  .li-info { flex: 1; min-width: 0; }
  .li-name { font-weight: 600; font-size: 13px; color: var(--text); }
  .li-title { font-size: 12px; color: var(--text2); margin-top: 2px; }
  .li-link { display: inline-block; margin-top: 6px; font-size: 11px; color: #0077b5; text-decoration: none; font-weight: 500; }
  .li-link:hover { text-decoration: underline; }
  .issue-item { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
  .issue-item:last-child { border-bottom: none; }
  .issue-icon { color: var(--red); font-size: 14px; flex-shrink: 0; }
  .address-row { font-size: 12px; color: var(--text2); margin-top: 8px; }
  .empty-state { text-align: center; padding: 60px 24px; color: var(--text3); }
  .empty-state div:first-child { font-size: 40px; margin-bottom: 12px; }

  /* RESPONSIVE */
  @media (max-width: 1100px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 768px) {
    .stats-row { grid-template-columns: repeat(2, 1fr); padding: 12px; }
    .filters { padding: 12px; }
    .table-wrap { margin: 0 12px 12px; }
    td, th { padding: 8px 10px; }
    .detail-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<header class="header">
  <div>
    <div class="header-brand">Catalyq <span>Dashboard</span></div>
    <div class="header-sub">WhatsApp Outreach — Ahmedabad</div>
  </div>
  <div class="header-right">
    <button class="btn-export" onclick="exportCSV()">Export CSV</button>
  </div>
</header>

<div class="stats-row" id="stats-row"></div>

<div class="filters">
  <div class="search-box">
    <span class="search-icon">🔍</span>
    <input type="text" id="search" placeholder="Search business name..." oninput="applyFilters()">
  </div>
  <select class="filter" id="f-status" onchange="applyFilters()">
    <option value="">All statuses</option>
    <option value="0">Not contacted</option>
    <option value="1">Stage 1 sent</option>
    <option value="2">Stage 2 sent</option>
  </select>
  <select class="filter" id="f-website" onchange="applyFilters()">
    <option value="">All (website)</option>
    <option value="yes">Has website</option>
    <option value="no">No website</option>
  </select>
  <select class="filter" id="f-linkedin" onchange="applyFilters()">
    <option value="">All (LinkedIn)</option>
    <option value="yes">LinkedIn found</option>
    <option value="no">No LinkedIn</option>
  </select>
  <select class="filter" id="f-issues" onchange="applyFilters()">
    <option value="">All (issues)</option>
    <option value="yes">Has website issues</option>
  </select>
  <div class="industry-tabs" id="industry-tabs"></div>
  <span class="filter-count" id="filter-count"></span>
</div>

<div class="table-wrap">
  <table id="leads-table">
    <thead>
      <tr>
        <th style="width:28px"></th>
        <th onclick="sortBy('title')">Business <span class="sort-icon">↕</span></th>
        <th onclick="sortBy('industry')">Industry <span class="sort-icon">↕</span></th>
        <th onclick="sortBy('rating')">Rating <span class="sort-icon">↕</span></th>
        <th>Phone</th>
        <th>Website</th>
        <th onclick="sortBy('linkedin')">LinkedIn <span class="sort-icon">↕</span></th>
        <th onclick="sortBy('issues')">Issues <span class="sort-icon">↕</span></th>
        <th onclick="sortBy('stage')">Status <span class="sort-icon">↕</span></th>
      </tr>
    </thead>
    <tbody id="table-body"></tbody>
  </table>
  <div class="empty-state" id="empty-state" style="display:none">
    <div>🔍</div>
    <div>No leads match your filters</div>
  </div>
</div>

<script>
const DATA = ${json};

let filtered = [...DATA.leads];
let activeIndustry = 'all';
let sortKey = 'title';
let sortAsc = true;
let expandedRows = new Set();

// ── STATS ───────────────────────────────────
function renderStats() {
  const s = DATA.stats;
  const pct = n => DATA.leads.length ? Math.round(n / DATA.leads.length * 100) : 0;
  const cards = [
    { label: 'Total Leads', value: s.total.toLocaleString(), sub: DATA.industries.length + ' industries' },
    { label: 'Has Website', value: s.withWebsite.toLocaleString(), sub: pct(s.withWebsite) + '% of leads' },
    { label: 'LinkedIn Found', value: s.linkedinFound.toLocaleString(), sub: pct(s.linkedinFound) + '% founders found' },
    { label: 'Site Issues Found', value: s.analyzed.toLocaleString(), sub: 'websites analyzed' },
    { label: 'Stage 1 Sent', value: s.stage1.toLocaleString(), sub: pct(s.stage1) + '% contacted' },
    { label: 'Stage 2 Sent', value: s.stage2.toLocaleString(), sub: 'follow-up sent' },
  ];
  document.getElementById('stats-row').innerHTML = cards.map(c => \`
    <div class="stat-card">
      <div class="stat-label">\${c.label}</div>
      <div class="stat-value">\${c.value}</div>
      <div class="stat-sub">\${c.sub}</div>
    </div>
  \`).join('');
}

// ── INDUSTRY TABS ───────────────────────────
function renderTabs() {
  const counts = {};
  DATA.leads.forEach(l => { counts[l.industry] = (counts[l.industry] || 0) + 1; });
  const tabs = [{ key: 'all', label: 'All', count: DATA.leads.length }, ...DATA.industries.map(i => ({ key: i, label: i.charAt(0).toUpperCase() + i.slice(1), count: counts[i] || 0 }))];
  document.getElementById('industry-tabs').innerHTML = tabs.map(t => \`
    <div class="tab \${t.key === activeIndustry ? 'active' : ''}" onclick="setIndustry('\${t.key}')">\${t.label} <span style="opacity:.6">\${t.count}</span></div>
  \`).join('');
}

function setIndustry(ind) {
  activeIndustry = ind;
  renderTabs();
  applyFilters();
}

// ── FILTERS ─────────────────────────────────
function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  const fStatus = document.getElementById('f-status').value;
  const fWeb = document.getElementById('f-website').value;
  const fLi = document.getElementById('f-linkedin').value;
  const fIssues = document.getElementById('f-issues').value;

  filtered = DATA.leads.filter(l => {
    if (activeIndustry !== 'all' && l.industry !== activeIndustry) return false;
    if (q && !l.title.toLowerCase().includes(q) && !l.address.toLowerCase().includes(q)) return false;
    if (fStatus !== '' && String(l.stage) !== fStatus) return false;
    if (fWeb === 'yes' && !l.website) return false;
    if (fWeb === 'no' && l.website) return false;
    if (fLi === 'yes' && l.linkedin.length === 0) return false;
    if (fLi === 'no' && l.linkedin.length > 0) return false;
    if (fIssues === 'yes' && l.issues.length === 0) return false;
    return true;
  });

  sortFiltered();
  document.getElementById('filter-count').textContent = filtered.length.toLocaleString() + ' leads';
  renderTable();
}

// ── SORT ─────────────────────────────────────
function sortBy(key) {
  if (sortKey === key) { sortAsc = !sortAsc; } else { sortKey = key; sortAsc = true; }
  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
  sortFiltered();
  renderTable();
}

function sortFiltered() {
  filtered.sort((a, b) => {
    let va, vb;
    if (sortKey === 'rating') { va = a.rating || 0; vb = b.rating || 0; }
    else if (sortKey === 'linkedin') { va = a.linkedin.length; vb = b.linkedin.length; }
    else if (sortKey === 'issues') { va = a.issues.length; vb = b.issues.length; }
    else if (sortKey === 'stage') { va = a.stage; vb = b.stage; }
    else { va = (a[sortKey] || '').toLowerCase(); vb = (b[sortKey] || '').toLowerCase(); }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });
}

// ── TABLE ────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('table-body');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const rows = [];
  filtered.forEach((lead, i) => {
    const isOpen = expandedRows.has(i);
    rows.push(rowHTML(lead, i, isOpen));
    if (isOpen) rows.push(detailHTML(lead, i));
  });
  tbody.innerHTML = rows.join('');
}

function rowHTML(l, i, open) {
  const statusBadge = l.stage === 2
    ? \`<span class="badge badge-green"><span class="status-dot dot-s2"></span>Stage 2</span>\`
    : l.stage === 1
    ? \`<span class="badge badge-blue"><span class="status-dot dot-s1"></span>Stage 1</span>\`
    : \`<span class="badge badge-gray"><span class="status-dot dot-none"></span>Not contacted</span>\`;

  const ratingHTML = l.rating
    ? \`<div class="rating"><span class="star">★</span><span class="rating-val">\${l.rating}</span><span class="reviews">(\${l.reviews?.toLocaleString() || 0})</span></div>\`
    : \`<span class="no-data">—</span>\`;

  const websiteHTML = l.website
    ? \`<a class="site-link" href="\${l.website}" target="_blank">🌐 Visit</a>\`
    : \`<span class="no-data">—</span>\`;

  const liHTML = l.linkedin.length > 0
    ? \`<span class="badge badge-blue">🔗 \${l.linkedin.length}</span>\`
    : \`<span class="no-data">—</span>\`;

  const issuesHTML = l.issues.length > 0
    ? \`<span class="badge badge-red">⚠ \${l.issues.length}</span>\`
    : l.website
    ? \`<span class="badge badge-green">✓ OK</span>\`
    : \`<span class="no-data">—</span>\`;

  return \`
    <tr class="\${open ? 'expanded' : ''}" id="row-\${i}">
      <td><button class="expand-btn \${open ? 'open' : ''}" onclick="toggleRow(\${i})">▶</button></td>
      <td class="name-cell">
        <div class="biz-name" title="\${esc(l.title)}">\${esc(l.title)}</div>
        <div class="biz-type">\${esc(l.type)}</div>
      </td>
      <td><span class="ind-badge">\${l.industry}</span></td>
      <td>\${ratingHTML}</td>
      <td><a class="phone-link" href="tel:\${l.phone}">\${l.phone}</a></td>
      <td>\${websiteHTML}</td>
      <td>\${liHTML}</td>
      <td>\${issuesHTML}</td>
      <td>\${statusBadge}</td>
    </tr>
  \`;
}

function detailHTML(l, i) {
  const liSection = l.linkedin.length > 0
    ? l.linkedin.map(p => {
        const initials = (p.name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
        return \`
          <div class="linkedin-profile">
            <div class="li-avatar">\${initials}</div>
            <div class="li-info">
              <div class="li-name">\${esc(p.name || '')}</div>
              <div class="li-title">\${esc(p.title || p.snippet?.substring(0,80) || '')}</div>
              <a class="li-link" href="\${p.profile_url}" target="_blank">🔗 View LinkedIn Profile →</a>
            </div>
          </div>
        \`;
      }).join('')
    : \`<div class="no-data" style="padding:10px 0">No LinkedIn profiles found for this business.</div>\`;

  const issuesSection = l.issues.length > 0
    ? l.issues.map(iss => \`
        <div class="issue-item">
          <span class="issue-icon">✗</span>
          <span>\${esc(iss)}</span>
        </div>
      \`).join('')
    : l.website
    ? \`<div class="badge badge-green" style="display:inline-flex">✓ No issues found</div>\`
    : \`<div class="no-data" style="padding:10px 0">Run analyze.js to check this website.</div>\`;

  return \`
    <tr class="detail-row" id="detail-\${i}">
      <td colspan="9">
        <div class="detail-inner">
          <div class="detail-grid">
            <div class="detail-section">
              <h4>LinkedIn Profiles</h4>
              \${liSection}
            </div>
            <div class="detail-section">
              <h4>Website Issues</h4>
              \${issuesSection}
              \${l.address ? \`<div class="address-row">📍 \${esc(l.address)}</div>\` : ''}
            </div>
          </div>
        </div>
      </td>
    </tr>
  \`;
}

function toggleRow(i) {
  if (expandedRows.has(i)) expandedRows.delete(i);
  else expandedRows.add(i);
  renderTable();
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CSV EXPORT ───────────────────────────────
function exportCSV() {
  const cols = ['industry','title','phone','website','rating','reviews','type','address','stage','linkedin_names','linkedin_urls','issues'];
  const rows = [cols.join(',')];
  filtered.forEach(l => {
    const cell = v => '"' + String(v || '').replace(/"/g,'""') + '"';
    rows.push([
      cell(l.industry), cell(l.title), cell(l.phone), cell(l.website),
      cell(l.rating), cell(l.reviews), cell(l.type), cell(l.address),
      cell(l.stage === 2 ? 'Stage 2' : l.stage === 1 ? 'Stage 1' : 'Not contacted'),
      cell(l.linkedin.map(p => p.name).join(' | ')),
      cell(l.linkedin.map(p => p.profile_url).join(' | ')),
      cell(l.issues.join(' | ')),
    ].join(','));
  });
  const blob = new Blob([rows.join('\\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'catalyq_leads_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}

// ── INIT ──────────────────────────────────────
renderStats();
renderTabs();
applyFilters();
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────
//  SERVER
// ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/dashboard') {
        const data = loadAllData();
        const html = buildHTML(data);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀  Catalyq Dashboard running`);
    console.log(`    Open: http://localhost:${PORT}\n`);
});
