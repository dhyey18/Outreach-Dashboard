'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  industry: string;
  name: string;
  phone: string;
  website: string;
  rating: number | null;
  reviews: number;
  address: string;
  type: string;
  linkedin: { name: string; title?: string; snippet?: string; profile_url?: string }[];
  issues: string[];
  stage: number;
}

interface Stats {
  total: number;
  withWebsite: number;
  liFound: number;
  analyzed: number;
  stage1: number;
  stage2: number;
}

interface LeadsData {
  leads: Lead[];
  industries: string[];
  stats: Stats;
  indCounts: Record<string, number>;
  cities: string[];
}

interface StatusRow {
  industry: string;
  total: number;
  eligible: number;
  attempted: number;
  remaining: number;
}

interface LogEntry {
  timestamp: string;
  status: string;
  phone: string;
  name: string;
  note: string;
  stage: number;
}

interface StatusData {
  rows: StatusRow[];
  logStats: {
    totalAttempts: number;
    sent: number;
    failed: number;
    skipped: number;
    stage1Sent: number;
    stage2Sent: number;
    recentLog: LogEntry[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string) {
  return String(s || '');
}

function isSocial(url: string) {
  return /facebook\.com|fb\.com|fb\.me|instagram\.com/i.test(url);
}

const STAGE_BADGE: Record<number, { label: string; cls: string }> = {
  0: { label: 'Not contacted', cls: 'bg-slate-100 text-slate-500' },
  1: { label: 'Stage 1 sent', cls: 'bg-blue-100 text-blue-700' },
  2: { label: 'Stage 2 sent', cls: 'bg-green-100 text-green-700' },
};

const STATUS_ICON: Record<string, string> = { sent: '✅', failed: '❌', skipped: '⏭', info: 'ℹ️' };

const ALL_INDUSTRIES = [
  'dental','clinic','restaurant','realestate','fitness','education','interior',
  'clothing','jewellery','manufacturing','immigration','photography','ca','events',
  'automobile','hotel','pharmacy','beauty','legal','diagnostic','logistics','printing',
  'financial','hospital','wedding_venue','travel','electronics',
];

// ─── RunPanel ────────────────────────────────────────────────────────────────

function RunPanel({ city }: { city: string }) {
  const [script, setScript] = useState('scrape');
  const [industry, setIndustry] = useState('');
  const [followup, setFollowup] = useState(false);
  const [force, setForce] = useState(false);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  async function run() {
    const args: string[] = [];
    if (industry) args.push(`--industry=${industry}`);
    if (city && city !== 'ahmedabad') args.push(`--city=${city}`);
    if (script === 'scrape' && force) args.push('--force');
    if (script === 'whatsapp' && followup) args.push('--followup');

    setOutput('');
    setRunning(true);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, args }),
      });

      if (!res.body) { setOutput('No output stream'); setRunning(false); return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        setOutput(buf);
        setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 10);
      }
    } catch (e) {
      setOutput(`Error: ${e}`);
    }
    setRunning(false);
  }

  const SCRIPTS = [
    { key: 'scrape', label: 'Scrape Leads', desc: 'googlesearch.js — fetch leads from Google Maps via SerpAPI' },
    { key: 'analyze', label: 'Analyze Websites', desc: 'analyze.js — audit websites for conversion blockers' },
    { key: 'linkedin', label: 'Find LinkedIn', desc: 'linkedin.js — search Google for founder profiles' },
    { key: 'whatsapp', label: 'Send WhatsApp', desc: 'whatsapp.js — send Stage 1 or Stage 2 messages' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SCRIPTS.map(s => (
          <button
            key={s.key}
            onClick={() => setScript(s.key)}
            className={`text-left p-3 sm:p-4 rounded-xl border-2 transition-all ${script === s.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
          >
            <div className="font-semibold text-sm text-slate-900">{s.label}</div>
            <div className="text-xs text-slate-500 mt-1">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry (optional)</label>
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50"
          >
            <option value="">All industries</option>
            {ALL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {script === 'scrape' && (
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} className="rounded" />
            --force (re-fetch existing)
          </label>
        )}
        {script === 'whatsapp' && (
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={followup} onChange={e => setFollowup(e.target.checked)} className="rounded" />
            --followup (Stage 2)
          </label>
        )}

        <button
          onClick={run}
          disabled={running}
          className="ml-auto px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? '⏳ Running…' : '▶ Run'}
        </button>
      </div>

      {(output || running) && (
        <div className="bg-slate-900 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
            <span className="text-xs font-mono text-slate-400">Terminal Output</span>
            {running && <span className="flex items-center gap-1 text-xs text-green-400"><span className="animate-pulse">●</span> Running</span>}
          </div>
          <pre
            ref={outputRef}
            className="text-xs font-mono text-slate-200 p-4 overflow-auto"
            style={{ maxHeight: '400px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {output || ' '}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── StatusPanel ─────────────────────────────────────────────────────────────

function StatusPanel({ city, stage }: { city: string; stage: number }) {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/status?city=${city}&stage=${stage}`);
    setData(await res.json());
    setLoading(false);
  }, [city, stage]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-slate-400 text-sm">Loading status…</div>;
  if (!data) return null;

  const { rows, logStats } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total Sent', val: logStats.sent, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Failed', val: logStats.failed, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Skipped', val: logStats.skipped, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Stage 1 Sent', val: logStats.stage1Sent, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Stage 2 Sent', val: logStats.stage2Sent, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Total Attempts', val: logStats.totalAttempts, color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${c.color}`}>{c.val.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Per-industry table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm text-slate-700">
          Industry Progress — Stage {stage}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-semibold">Industry</th>
              <th className="text-right px-4 py-2 font-semibold">Total</th>
              <th className="text-right px-4 py-2 font-semibold">Eligible</th>
              <th className="text-right px-4 py-2 font-semibold">Attempted</th>
              <th className="text-right px-4 py-2 font-semibold">Remaining</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.industry} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium capitalize">{r.industry}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.total}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.eligible}</td>
                <td className="px-4 py-2 text-right text-slate-600">{r.attempted}</td>
                <td className="px-4 py-2 text-right font-semibold">{r.remaining}</td>
                <td className="px-4 py-2">
                  {r.remaining === 0
                    ? <span className="text-xs text-green-600 font-semibold">✓ Done</span>
                    : <div className="w-24 bg-slate-200 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${r.eligible ? Math.round((r.attempted / r.eligible) * 100) : 0}%` }} /></div>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent log */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-sm text-slate-700">Recent Activity</span>
          <button onClick={load} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 320 }}>
          {logStats.recentLog.length === 0
            ? <div className="p-4 text-slate-400 text-sm">No activity yet</div>
            : logStats.recentLog.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 text-xs hover:bg-slate-50">
                <span className="text-base leading-none">{STATUS_ICON[e.status] || '•'}</span>
                <span className={`font-semibold w-14 ${e.status === 'sent' ? 'text-green-600' : e.status === 'failed' ? 'text-red-600' : 'text-slate-400'}`}>
                  {e.status.toUpperCase()}
                </span>
                <span className="text-slate-400 w-8 text-center">S{e.stage || 1}</span>
                <span className="font-mono text-slate-600 w-28 truncate">{e.phone}</span>
                <span className="font-medium text-slate-700 flex-1 truncate">{e.name}</span>
                <span className="text-slate-400 truncate max-w-xs">{e.note}</span>
                <span className="text-slate-300 whitespace-nowrap">{new Date(e.timestamp).toLocaleTimeString('en-IN')}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ data, city }: { data: LeadsData; city: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeIndustry, setActiveIndustry] = useState('all');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterWeb, setFilterWeb] = useState('');
  const [filterLi, setFilterLi] = useState('');
  const [filterIssues, setFilterIssues] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());

  const { leads, industries, stats, indCounts } = data;

  const filtered = leads.filter(l => {
    if (activeIndustry !== 'all' && l.industry !== activeIndustry) return false;
    const q = search.toLowerCase();
    if (q && !l.name.toLowerCase().includes(q) && !l.address.toLowerCase().includes(q) && !l.type.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    if (filterStatus !== '' && String(l.stage) !== filterStatus) return false;
    if (filterWeb === '1' && !l.website) return false;
    if (filterWeb === '0' && l.website) return false;
    if (filterLi === '1' && !l.linkedin.length) return false;
    if (filterLi === '0' && l.linkedin.length) return false;
    if (filterIssues === '1' && !l.issues.length) return false;
    return true;
  }).sort((a, b) => {
    let va: string | number, vb: string | number;
    switch (sortKey) {
      case 'rating': va = a.rating || 0; vb = b.rating || 0; break;
      case 'li': va = a.linkedin.length; vb = b.linkedin.length; break;
      case 'issues': va = a.issues.length; vb = b.issues.length; break;
      case 'stage': va = a.stage; vb = b.stage; break;
      case 'website': va = a.website ? 1 : 0; vb = b.website ? 1 : 0; break;
      case 'industry': va = a.industry; vb = b.industry; break;
      default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
    }
    if (va < vb) return -sortDir; if (va > vb) return sortDir; return 0;
  });

  function sort(key: string) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }

  function toggleRow(i: number) {
    setOpenRows(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function exportCSV() {
    const cols = ['Industry','Business','Phone','Website','Rating','Reviews','Type','Address','Status','LinkedIn Names','LinkedIn URLs','Issues'];
    const stMap: Record<number, string> = { 0: 'Not contacted', 1: 'Stage 1 sent', 2: 'Stage 2 sent' };
    const cell = (v: string | number | null | undefined) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = [cols.join(','), ...filtered.map(l => [
      cell(l.industry), cell(l.name), cell(l.phone), cell(l.website),
      cell(l.rating), cell(l.reviews), cell(l.type), cell(l.address),
      cell(stMap[l.stage] || ''), cell(l.linkedin.map(p => p.name).join(' | ')),
      cell(l.linkedin.map(p => p.profile_url).join(' | ')), cell(l.issues.join(' | ')),
    ].join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `catalyq_${city}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function Th({ col, label }: { col: string; label: string }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => sort(col)}
        className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-white hover:bg-slate-700 whitespace-nowrap select-none"
      >
        {label}{active ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
      </th>
    );
  }

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Sidebar */}
      <aside className={`absolute md:relative inset-y-0 left-0 z-20 w-52 flex-shrink-0 bg-slate-900 flex flex-col overflow-hidden transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="px-4 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold text-white tracking-tight">Cat<span className="text-blue-400">alyq</span></div>
            <div className="text-xs text-slate-400 mt-0.5">Lead Dashboard</div>
          </div>
          <button className="md:hidden text-slate-400 hover:text-white p-1" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Industries</div>
          <button
            onClick={() => { setActiveIndustry('all'); setOpenRows(new Set()); }}
            className={`w-full flex items-center justify-between px-4 py-1.5 text-sm transition-all border-l-2 ${activeIndustry === 'all' ? 'border-blue-500 bg-slate-800 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}
          >
            <span>All Industries</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeIndustry === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{leads.length}</span>
          </button>
          {industries.map(ind => (
            <button
              key={ind}
              onClick={() => { setActiveIndustry(ind); setOpenRows(new Set()); }}
              className={`w-full flex items-center justify-between px-4 py-1.5 text-sm transition-all border-l-2 capitalize ${activeIndustry === ind ? 'border-blue-500 bg-slate-800 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <span className="truncate">{ind}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${activeIndustry === ind ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>{indCounts[ind] || 0}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          {[
            { icon: '📋', val: stats.total, label: 'Total Leads', sub: `${industries.length} industries`, color: '#3b82f6' },
            { icon: '🌐', val: stats.withWebsite, label: 'Have Website', sub: `${stats.total ? Math.round(stats.withWebsite / stats.total * 100) : 0}%`, color: '#8b5cf6' },
            { icon: '🔗', val: stats.liFound, label: 'LinkedIn Found', sub: 'founders', color: '#0077b5' },
            { icon: '⚠️', val: stats.analyzed, label: 'Issues Found', sub: 'analyzed', color: '#f59e0b' },
            { icon: '✉️', val: stats.stage1, label: 'Stage 1 Sent', sub: `${stats.total ? Math.round(stats.stage1 / stats.total * 100) : 0}% contacted`, color: '#22c55e' },
            { icon: '🔁', val: stats.stage2, label: 'Stage 2 Sent', sub: 'follow-ups', color: '#f43f5e' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm" style={{ borderTop: `3px solid ${c.color}` }}>
              <div className="text-lg">{c.icon}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{c.val.toLocaleString()}</div>
              <div className="text-xs font-medium text-slate-600">{c.label}</div>
              <div className="text-xs text-slate-400">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Topbar filters */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
          <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg text-base" onClick={() => setSidebarOpen(true)} aria-label="Industries">☰</button>
          <div className="relative flex-1 min-w-32 max-w-80">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, address…"
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>
          <div className="hidden sm:contents">
            {[
              { id: 'status', val: filterStatus, set: setFilterStatus, opts: [['', 'All statuses'], ['0', 'Not contacted'], ['1', 'Stage 1'], ['2', 'Stage 2']] },
              { id: 'web', val: filterWeb, set: setFilterWeb, opts: [['', 'Website: all'], ['1', 'Has website'], ['0', 'No website']] },
              { id: 'li', val: filterLi, set: setFilterLi, opts: [['', 'LinkedIn: all'], ['1', 'Found'], ['0', 'Not found']] },
              { id: 'iss', val: filterIssues, set: setFilterIssues, opts: [['', 'Issues: all'], ['1', 'Has issues']] },
            ].map(f => (
              <select
                key={f.id}
                value={f.val}
                onChange={e => f.set(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-blue-400"
              >
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
          </div>
          <span className="text-xs text-slate-400 ml-1">{filtered.length.toLocaleString()} leads</span>
          <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterWeb(''); setFilterLi(''); setFilterIssues(''); }} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">Clear</button>
          <button onClick={exportCSV} className="ml-auto text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">↓ Export CSV</button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-800">
              <tr>
                <th className="w-6 px-3 py-2"></th>
                <Th col="name" label="Business" />
                <Th col="industry" label="Industry" />
                <Th col="rating" label="Rating" />
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone</th>
                <Th col="website" label="Website" />
                <Th col="li" label="LinkedIn" />
                <Th col="issues" label="Issues" />
                <Th col="stage" label="Status" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-16 text-slate-400">No leads match your filters</td></tr>
              )}
              {filtered.map((l, i) => {
                const isOpen = openRows.has(i);
                const socialOnly = isSocial(l.website);
                const hasReal = l.website && !socialOnly;
                const badge = STAGE_BADGE[l.stage] || STAGE_BADGE[0];
                return [
                  <tr
                    key={`r-${i}`}
                    onClick={() => toggleRow(i)}
                    className={`border-b border-slate-100 cursor-pointer transition-colors ${isOpen ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2 text-slate-400 text-xs">
                      <span className={`inline-block transition-transform ${isOpen ? 'rotate-90 text-blue-500' : ''}`}>▶</span>
                    </td>
                    <td className="px-3 py-2 max-w-52">
                      <div className="font-semibold text-slate-900 truncate" title={l.name}>{esc(l.name)}</div>
                      <div className="text-xs text-slate-400 truncate">{esc(l.type)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 text-xs font-semibold capitalize">{l.industry}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.rating
                        ? <><span className="text-amber-400 text-xs">★</span><span className="font-bold text-xs ml-0.5">{l.rating}</span><span className="text-slate-400 text-xs ml-0.5">({(l.reviews || 0).toLocaleString()})</span></>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-xs font-medium whitespace-nowrap">{l.phone}</a>
                    </td>
                    <td className="px-3 py-2">
                      {hasReal
                        ? <a href={l.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-xs flex items-center gap-1">🌐 Visit</a>
                        : socialOnly
                          ? <a href={l.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-pink-600 hover:underline text-xs">📱 Social</a>
                          : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {l.linkedin.length
                        ? <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">🔗 {l.linkedin.length}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {l.issues.length
                        ? <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-semibold">⚠ {l.issues.length}</span>
                        : l.website
                          ? <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`d-${i}`} className="bg-blue-50 border-b border-slate-100">
                      <td colSpan={9} className="px-3 py-4 sm:pl-12">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                          {/* LinkedIn */}
                          <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">LinkedIn Profiles</div>
                            {l.linkedin.length
                              ? l.linkedin.map((p, pi) => {
                                  const initials = (p.name || '?').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
                                  return (
                                    <div key={pi} className="flex gap-2 p-2 bg-white rounded-lg border border-slate-200 mb-2 items-start">
                                      <div className="w-8 h-8 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{initials}</div>
                                      <div>
                                        <div className="font-semibold text-sm text-slate-900">{p.name}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">{(p.title || p.snippet || '').substring(0, 90)}</div>
                                        {p.profile_url && <a href={p.profile_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 font-semibold hover:underline mt-1 inline-block">View LinkedIn →</a>}
                                      </div>
                                    </div>
                                  );
                                })
                              : <div className="text-xs text-slate-400">No LinkedIn profiles found.</div>}
                          </div>
                          {/* Issues */}
                          <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Website Issues</div>
                            {l.issues.length
                              ? l.issues.map((iss, ii) => (
                                  <div key={ii} className="flex gap-2 py-1.5 border-b border-slate-200 text-xs text-slate-700">
                                    <span className="text-red-500 font-bold flex-shrink-0">✗</span>
                                    <span>{iss}</span>
                                  </div>
                                ))
                              : l.website
                                ? <div className="text-xs text-green-600 font-semibold">✓ No issues found</div>
                                : <div className="text-xs text-slate-400">Run analyze.js to audit this website.</div>}
                            {l.address && <div className="text-xs text-slate-400 mt-3 flex gap-1">📍 {l.address}</div>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Panel ───────────────────────────────────────────────────────────

type WAState = 'idle' | 'initializing' | 'qr' | 'ready' | 'sending' | 'disconnected';

interface WAEvent {
  type: 'state' | 'qr' | 'progress' | 'done' | 'error' | 'log';
  state?: WAState;
  qrDataUrl?: string;
  sent?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  phone?: string;
  name?: string;
  status?: string;
  note?: string;
  message?: string;
}

interface SendProgress {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
  log: { status: string; phone: string; name: string; note: string }[];
}

function WhatsAppPanel({ city, cities }: { city: string; cities: string[] }) {
  const [waState, setWaState] = useState<WAState>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [connLog, setConnLog] = useState<string[]>([]);
  const [sendCity, setSendCity] = useState(city);
  const [industry, setIndustry] = useState(ALL_INDUSTRIES[0]);
  const [stage, setStage] = useState<1 | 2>(1);
  const [batchSize, setBatchSize] = useState(40);
  const [delayMs, setDelayMs] = useState(25000);
  const [contactName, setContactName] = useState('Dhyey');
  const [contactPhone, setContactPhone] = useState('+91 94291 84788');
  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [isSending, setIsSending] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const connLogRef = useRef<HTMLDivElement>(null);
  const progressLogRef = useRef<HTMLDivElement>(null);

  // Sync city prop → sendCity
  useEffect(() => { setSendCity(city); }, [city]);

  // Fetch message preview whenever config changes
  useEffect(() => {
    const params = new URLSearchParams({ industry, stage: String(stage), city: sendCity, contactName, contactPhone });
    fetch(`/api/whatsapp/preview?${params}`)
      .then(r => r.json())
      .then(d => setPreview(d.message || ''))
      .catch(() => {});
  }, [industry, stage, sendCity, contactName, contactPhone]);

  function addLog(msg: string) {
    setConnLog(prev => [...prev.slice(-100), msg]);
    setTimeout(() => connLogRef.current?.scrollTo(0, connLogRef.current.scrollHeight), 10);
  }

  // Connect — subscribe to SSE then POST to start
  function connect() {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }

    const es = new EventSource('/api/whatsapp/connect');
    sseRef.current = es;

    es.onmessage = (ev) => {
      try {
        const event: WAEvent = JSON.parse(ev.data);
        if (event.state) setWaState(event.state);
        if (event.type === 'qr' && event.qrDataUrl) { setQrUrl(event.qrDataUrl); addLog('QR code received — scan with WhatsApp'); }
        if (event.type === 'state' && event.state === 'ready') { setQrUrl(null); addLog('✅ WhatsApp connected and ready!'); }
        if (event.type === 'state' && event.state === 'disconnected') { addLog('⚠️ Disconnected'); }
        if (event.type === 'log' && event.message) addLog(event.message);
        if (event.type === 'error' && event.message) addLog('❌ ' + event.message);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => addLog('SSE connection error — retrying…');

    fetch('/api/whatsapp/connect', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.state) setWaState(d.state); addLog('Initializing WhatsApp Web…'); })
      .catch(e => addLog('Error: ' + e));
  }

  async function disconnect() {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    await fetch('/api/whatsapp/disconnect', { method: 'POST' });
    setWaState('idle');
    setQrUrl(null);
    addLog('Disconnected.');
  }

  // Send messages via SSE
  async function startSend() {
    setIsSending(true);
    setProgress({ sent: 0, failed: 0, skipped: 0, total: 0, log: [] });

    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: sendCity, industry, stage, batchSize, delayMs, contactName, contactPhone }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      setProgress(p => ({ ...(p || { sent: 0, failed: 0, skipped: 0, total: 0, log: [] }), log: [{ status: 'error', phone: '', name: '', note: err.error || 'Unknown error' }] }));
      setIsSending(false);
      return;
    }

    if (!res.body) { setIsSending(false); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev: WAEvent = JSON.parse(line.slice(6));
          if (ev.type === 'progress') {
            setProgress(p => {
              const prev = p || { sent: 0, failed: 0, skipped: 0, total: 0, log: [] };
              return {
                sent: ev.sent ?? prev.sent,
                failed: ev.failed ?? prev.failed,
                skipped: ev.skipped ?? prev.skipped,
                total: ev.total ?? prev.total,
                log: [...prev.log.slice(-200), { status: ev.status || '', phone: ev.phone || '', name: ev.name || '', note: ev.note || '' }],
              };
            });
            setTimeout(() => progressLogRef.current?.scrollTo(0, progressLogRef.current.scrollHeight), 10);
          }
          if (ev.type === 'done') { setProgress(p => p ? { ...p, sent: ev.sent ?? p.sent, failed: ev.failed ?? p.failed, skipped: ev.skipped ?? p.skipped, total: ev.total ?? p.total } : p); }
          if (ev.type === 'log' && ev.message) { setProgress(p => p ? { ...p, log: [...p.log, { status: 'info', phone: '', name: '', note: ev.message || '' }] } : p); }
          if (ev.type === 'error') { setProgress(p => p ? { ...p, log: [...p.log, { status: 'error', phone: '', name: '', note: ev.message || '' }] } : p); }
        } catch { /* ignore */ }
      }
    }
    setIsSending(false);
  }

  const isConnected = waState === 'ready';
  const isConnecting = waState === 'initializing' || waState === 'qr';

  const STATE_COLOR: Record<WAState, string> = {
    idle: 'text-slate-400',
    initializing: 'text-amber-500',
    qr: 'text-blue-500',
    ready: 'text-green-500',
    sending: 'text-indigo-500',
    disconnected: 'text-red-500',
  };
  const STATE_LABEL: Record<WAState, string> = {
    idle: 'Disconnected',
    initializing: 'Initializing…',
    qr: 'Scan QR code',
    ready: 'Connected',
    sending: 'Sending…',
    disconnected: 'Disconnected',
  };

  return (
    <div className="p-4 sm:p-6 overflow-auto h-full">
      <div className="max-w-5xl mx-auto flex flex-col gap-5 sm:gap-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-slate-900">WhatsApp Outreach</h2>
          <p className="text-sm text-slate-500">Scan QR to connect your account, then send personalised messages to leads.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 sm:gap-6">

          {/* ── Left column: connection ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Connection card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-800">Connection</span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${STATE_COLOR[waState]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnecting ? 'animate-pulse bg-amber-400' : isConnected ? 'bg-green-400' : 'bg-slate-300'}`} />
                  {STATE_LABEL[waState]}
                </span>
              </div>

              <div className="p-5 flex flex-col items-center gap-4">
                {/* QR code display */}
                {qrUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="text-xs text-slate-500 text-center">Open WhatsApp → Linked Devices → Link a Device</div>
                    <div className="p-3 bg-white border-2 border-slate-200 rounded-xl shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrUrl} alt="WhatsApp QR" className="w-56 h-56" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium animate-pulse">
                      <span>●</span> Waiting for scan…
                    </div>
                  </div>
                ) : isConnected ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl">✅</div>
                    <div className="font-semibold text-green-700 text-sm">WhatsApp Connected</div>
                    <div className="text-xs text-slate-400">Session is active and ready to send</div>
                  </div>
                ) : isConnecting ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm text-slate-500">Starting WhatsApp Web…</div>
                    <div className="text-xs text-slate-400">This may take 15–30 seconds</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <div className="text-4xl">📱</div>
                    <div className="text-sm font-medium text-slate-700">Connect your WhatsApp</div>
                    <div className="text-xs text-slate-400 max-w-[200px]">You'll scan a QR code from your phone to link your account</div>
                  </div>
                )}

                <div className="flex gap-2 w-full">
                  {!isConnected && !isConnecting && (
                    <button
                      onClick={connect}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
                    >
                      Connect WhatsApp
                    </button>
                  )}
                  {isConnecting && (
                    <button
                      onClick={disconnect}
                      className="flex-1 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {isConnected && (
                    <button
                      onClick={disconnect}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-slate-600 text-sm font-medium transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {/* Connection log */}
              {connLog.length > 0 && (
                <div
                  ref={connLogRef}
                  className="border-t border-slate-100 bg-slate-50 text-xs font-mono text-slate-500 px-4 py-3 overflow-auto"
                  style={{ maxHeight: 120 }}
                >
                  {connLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>

            {/* Message preview */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-800">Message Preview</span>
                <span className="ml-2 text-xs text-slate-400">(Stage {stage}, {industry})</span>
              </div>
              <div className="p-5">
                {preview ? (
                  <div className="text-xs leading-relaxed text-slate-700 bg-green-50 border border-green-100 rounded-xl p-4 whitespace-pre-wrap font-mono">
                    {preview}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">Configure options to see preview…</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: config + send ── */}
          <div className="lg:col-span-3 flex flex-col gap-4">

            {/* Config card */}
            <div className="bg-white border border-slate-200 rounded-2xl">
              <div className="px-5 py-4 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-800">Send Configuration</span>
              </div>
              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">City</label>
                  <select value={sendCity} onChange={e => setSendCity(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize">
                    {cities.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize">
                    {ALL_INDUSTRIES.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    <button onClick={() => setStage(1)} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${stage === 1 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Stage 1</button>
                    <button onClick={() => setStage(2)} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${stage === 2 ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Stage 2</button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Batch Size</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={5} max={100} step={5} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="flex-1 accent-blue-600" />
                    <span className="text-sm font-semibold text-slate-700 w-8 text-right">{batchSize}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay Between Messages</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={5000} max={60000} step={1000} value={delayMs} onChange={e => setDelayMs(Number(e.target.value))} className="flex-1 accent-blue-600" />
                    <span className="text-sm font-semibold text-slate-700 w-14 text-right">{delayMs / 1000}s</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Name</label>
                  <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Dhyey" />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Phone Number</label>
                  <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+91 94291 84788" />
                </div>

              </div>

              {/* Send button */}
              <div className="px-5 pb-5">
                <button
                  onClick={startSend}
                  disabled={!isConnected || isSending}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${isConnected && !isSending ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-sm hover:shadow-md' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                  {isSending
                    ? <span className="flex items-center justify-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Sending messages…</span>
                    : !isConnected
                      ? '🔌 Connect WhatsApp first'
                      : `📨 Send to ${industry} leads (Stage ${stage})`
                  }
                </button>
                {!isConnected && (
                  <p className="text-xs text-slate-400 text-center mt-2">Connect your WhatsApp account to enable sending</p>
                )}
              </div>
            </div>

            {/* Live progress */}
            {progress !== null && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-800">Send Progress</span>
                  {isSending && <span className="flex items-center gap-1.5 text-xs text-indigo-500 font-semibold animate-pulse"><span>●</span> Live</span>}
                </div>

                {/* Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100">
                  {[
                    { label: 'Sent', val: progress.sent, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Failed', val: progress.failed, color: 'text-red-500', bg: 'bg-red-50' },
                    { label: 'Skipped', val: progress.skipped, color: 'text-amber-500', bg: 'bg-amber-50' },
                    { label: 'Total', val: progress.total, color: 'text-slate-700', bg: 'bg-slate-50' },
                  ].map(c => (
                    <div key={c.label} className={`${c.bg} flex flex-col items-center py-4`}>
                      <div className={`text-2xl font-bold ${c.color}`}>{c.val}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                {progress.total > 0 && (
                  <div className="px-5 py-3 border-b border-slate-100">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{progress.sent + progress.failed + progress.skipped} of {progress.total}</span>
                      <span>{Math.round(((progress.sent + progress.failed + progress.skipped) / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round(((progress.sent + progress.failed + progress.skipped) / progress.total) * 100)}%` }} />
                    </div>
                  </div>
                )}

                {/* Log entries */}
                <div
                  ref={progressLogRef}
                  className="overflow-auto bg-slate-900"
                  style={{ maxHeight: 260 }}
                >
                  {progress.log.map((entry, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-800 text-xs">
                      <span className="text-base">{STATUS_ICON[entry.status] || '•'}</span>
                      <span className={`font-semibold w-12 ${entry.status === 'sent' ? 'text-green-400' : entry.status === 'failed' ? 'text-red-400' : entry.status === 'info' ? 'text-blue-400' : 'text-slate-400'}`}>
                        {entry.status.toUpperCase()}
                      </span>
                      {entry.phone && <span className="font-mono text-slate-400 w-28 truncate">{entry.phone}</span>}
                      {entry.name && <span className="text-slate-300 flex-1 truncate">{entry.name}</span>}
                      {entry.note && <span className="text-slate-500 truncate max-w-xs">{entry.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [tab, setTab] = useState<'dashboard' | 'pipeline' | 'outreach' | 'whatsapp'>('dashboard');
  const [city, setCity] = useState('ahmedabad');
  const [stage, setStage] = useState(1);
  const [leadsData, setLeadsData] = useState<LeadsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<string[]>(['ahmedabad']);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/leads?city=${city}`);
    const data: LeadsData = await res.json();
    setLeadsData(data);
    setCities(data.cities || ['ahmedabad']);
    setLoading(false);
  }, [city]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const TABS = [
    { key: 'dashboard', label: '📋 Dashboard' },
    { key: 'pipeline', label: '⚙️ Pipeline' },
    { key: 'outreach', label: '📤 Outreach' },
    { key: 'whatsapp', label: '💬 WhatsApp' },
  ] as const;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0 min-w-0">
        <div className="text-base font-extrabold text-white tracking-tight shrink-0">Cat<span className="text-blue-400">alyq</span></div>

        {/* Tabs - scrollable on mobile */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* City selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={city}
            onChange={e => setCity(e.target.value)}
            className="text-xs bg-slate-700 text-white border border-slate-600 rounded-lg px-2 py-1.5 capitalize focus:outline-none max-w-28"
          >
            {cities.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>

          {tab === 'outreach' && (
            <select
              value={stage}
              onChange={e => setStage(Number(e.target.value))}
              className="text-xs bg-slate-700 text-white border border-slate-600 rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value={1}>S1</option>
              <option value={2}>S2</option>
            </select>
          )}

          <button
            onClick={loadLeads}
            className="text-xs text-slate-400 hover:text-white px-2 py-1.5 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {tab === 'dashboard' && (
          loading
            ? <div className="flex items-center justify-center h-full text-slate-400">Loading leads…</div>
            : leadsData
              ? <Dashboard data={leadsData} city={city} />
              : null
        )}

        {tab === 'pipeline' && (
          <div className="p-4 sm:p-6 overflow-auto h-full">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Pipeline</h2>
              <p className="text-sm text-slate-500 mb-4">Run scraping, analysis, and enrichment scripts. Output streams live below.</p>
              <RunPanel city={city} />
            </div>
          </div>
        )}

        {tab === 'outreach' && (
          <div className="p-4 sm:p-6 overflow-auto h-full">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Outreach Status</h2>
              <p className="text-sm text-slate-500 mb-4">Track WhatsApp outreach progress across all industries.</p>
              <StatusPanel city={city} stage={stage} />
            </div>
          </div>
        )}

        {tab === 'whatsapp' && (
          <WhatsAppPanel city={city} cities={cities} />
        )}
      </main>
    </div>
  );
}
