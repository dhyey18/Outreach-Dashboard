const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

// ─────────────────────────────────────────────
//  RUN MODE
//  node whatsapp.js                          → auto-pick next industry with pending leads
//  node whatsapp.js --industry=dental        → specific industry, next batch of 20
//  node whatsapp.js --industry=dental --followup  → Stage 2 follow-up
//  node whatsapp.js --leads=path/to/file.json     → use a specific file path
//  node whatsapp.js --industry=dental --reset      → clear batch progress for this industry/stage
//  node whatsapp.js --status                       → show progress across all industries
//
//  Leads are read from the leads/ folder automatically.
//  batch_progress.json tracks which phones were already attempted so each
//  run picks up the next 20 untouched leads.
// ─────────────────────────────────────────────
const path = require('path');

const args = process.argv.slice(2);
const IS_FOLLOWUP  = args.includes('--followup');
const IS_RESET     = args.includes('--reset');
const IS_STATUS    = args.includes('--status');
const leadsFileArg = args.find(a => a.startsWith('--leads='));
const industryArg  = args.find(a => a.startsWith('--industry='));

const LEADS_DIR = './leads';

// Discover all industry files in leads/ folder, sorted alphabetically
function discoverLeadsFiles() {
    if (!fs.existsSync(LEADS_DIR)) return [];
    return fs.readdirSync(LEADS_DIR)
        .filter(f => f.endsWith('_leads.json'))
        .sort()
        .map(f => path.join(LEADS_DIR, f));
}

function resolveLeadsFile() {
    if (leadsFileArg) return leadsFileArg.split('=')[1];
    if (industryArg) return path.join(LEADS_DIR, `${industryArg.split('=')[1]}_leads.json`);
    return null; // null = auto-pick mode
}

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
    BATCH_SIZE: 20,
    DELAY_BETWEEN_MESSAGES_MS: 25000,  // 25s between sends (safer)
    LEADS_FILE: resolveLeadsFile(),    // null in auto-pick mode
    LOG_FILE: 'send_log.json',
    PROGRESS_FILE: 'batch_progress.json',
    SESSION_DIR: './.wwebjs_auth',
};

// ─────────────────────────────────────────────
//  BATCH PROGRESS
//  Tracks which phones have already been attempted (sent/skipped/failed)
//  per leads-file + stage key so each run picks up the next 20.
//
//  batch_progress.json structure:
//  { "<leadsFile>|stage<N>": { "attempted": ["9198...", ...] } }
// ─────────────────────────────────────────────
function progressKey() {
    return `${CONFIG.LEADS_FILE}|stage${IS_FOLLOWUP ? 2 : 1}`;
}

function loadProgress() {
    if (!fs.existsSync(CONFIG.PROGRESS_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8')); }
    catch (_) { return {}; }
}

function saveProgress(all) {
    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(all, null, 2));
}

function getAttemptedPhones(all) {
    const key = progressKey();
    return new Set((all[key] || {}).attempted || []);
}

function markAttempted(all, phones) {
    const key = progressKey();
    if (!all[key]) all[key] = { attempted: [] };
    const existing = new Set(all[key].attempted);
    for (const p of phones) existing.add(p);
    all[key].attempted = [...existing];
}

function resetProgress(all) {
    const key = progressKey();
    delete all[key];
    saveProgress(all);
    console.log(`🔄  Batch progress reset for: ${key}`);
}

// ─────────────────────────────────────────────
//  LOGGER
// ─────────────────────────────────────────────
let log = [];

function loadExistingLog() {
    if (fs.existsSync(CONFIG.LOG_FILE)) {
        try {
            log = JSON.parse(fs.readFileSync(CONFIG.LOG_FILE, 'utf8'));
        } catch (_) {
            log = [];
        }
    }
}

function logger(status, phone, name, note = '', stage = 1) {
    const entry = {
        timestamp: new Date().toISOString(),
        status,
        phone,
        name,
        note,
        stage,
    };
    log.push(entry);
    const icon = { sent: '✅', failed: '❌', skipped: '⏭️', info: 'ℹ️' }[status] || '•';
    console.log(`${icon}  [${entry.timestamp}]  ${status.toUpperCase().padEnd(7)}  S${stage}  ${phone || ''}  ${name || ''}  ${note}`);
}

function saveLog() {
    fs.writeFileSync(CONFIG.LOG_FILE, JSON.stringify(log, null, 2));
    console.log(`\n📄  Log saved → ${CONFIG.LOG_FILE}`);
}

// ─────────────────────────────────────────────
//  CONTACT HISTORY  (based on log)
// ─────────────────────────────────────────────
function getContactedPhones() {
    // Returns a Map: normalisedPhone → highest stage sent
    const map = new Map();
    for (const entry of log) {
        if (entry.status !== 'sent' || !entry.phone) continue;
        const norm = normaliseRaw(entry.phone);
        const prev = map.get(norm) || 0;
        if ((entry.stage || 1) > prev) map.set(norm, entry.stage || 1);
    }
    return map;
}

// ─────────────────────────────────────────────
//  LEADS LOADER
// ─────────────────────────────────────────────
function loadAnalysis(leadsFile) {
    const analysisFile = leadsFile.replace('_leads.json', '_analysis.json');
    try { return JSON.parse(fs.readFileSync(analysisFile, 'utf8')); }
    catch (_) { return {}; }
}

function loadLeads(progressAll) {
    let data;
    if (fs.existsSync(CONFIG.LEADS_FILE)) {
        const raw = fs.readFileSync(CONFIG.LEADS_FILE, 'utf8');
        data = JSON.parse(raw);
        console.log(`📋  Loaded ${data.length} leads from ${CONFIG.LEADS_FILE}`);
    } else {
        console.log(`⚠️   ${CONFIG.LEADS_FILE} not found.`);
        return [];
    }

    // Attach website analysis data if available (from analyze.js)
    const analysis = loadAnalysis(CONFIG.LEADS_FILE);
    const analysisCount = Object.keys(analysis).length;
    if (analysisCount > 0) {
        console.log(`🔍  ${analysisCount} leads have website analysis data — personalized messages will be used.`);
        for (const lead of data) {
            if (lead.phone && analysis[lead.phone]) lead._analysis = analysis[lead.phone];
        }
    }

    // Deduplicate by phone
    const seen = new Set();
    const unique = data.filter(lead => {
        if (!lead.phone) return false;
        const key = normaliseRaw(lead.phone);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    console.log(`🔍  ${unique.length} unique leads after dedup (${data.length - unique.length} removed).`);

    const withWebsite = unique.filter(l => l.website).length;
    console.log(`🌐  ${unique.length - withWebsite} leads without a website, ${withWebsite} with a website (upgrade pitch).`);

    const contacted = getContactedPhones();

    let eligible;
    if (!IS_FOLLOWUP) {
        // Stage 1: only send to leads never contacted before
        eligible = unique.filter(l => !contacted.has(normaliseRaw(l.phone)));
        console.log(`📨  ${eligible.length} fresh leads (not contacted before).`);
    } else {
        // Stage 2: only send to leads that got Stage 1 but NOT Stage 2 yet
        eligible = unique.filter(l => contacted.get(normaliseRaw(l.phone)) === 1);
        console.log(`📨  ${eligible.length} leads ready for follow-up (got Stage 1, no Stage 2 yet).`);
    }

    // Remove leads already attempted in a previous batch this session
    const attempted = getAttemptedPhones(progressAll);
    const remaining = eligible.filter(l => !attempted.has(normaliseRaw(l.phone)));
    const doneCount = eligible.length - remaining.length;
    if (doneCount > 0) {
        console.log(`⏭️   ${doneCount} already attempted in previous batches — skipping.`);
    }
    console.log(`📦  ${remaining.length} remaining. Taking next batch of ${CONFIG.BATCH_SIZE}.`);

    return remaining.slice(0, CONFIG.BATCH_SIZE);
}

// ─────────────────────────────────────────────
//  INDUSTRY DETECTION
// ─────────────────────────────────────────────
function detectIndustry(lead) {
    const allTypes = [
        lead.type || '',
        ...(lead.types || []),
        ...(lead.type_ids || []),
    ].join(' ').toLowerCase();

    if (/dental|dentist/.test(allTypes)) return 'dental';
    if (/clinic|doctor|physician|medical|hospital|health|physiotherapy|ayurved/.test(allTypes)) return 'clinic';
    if (/restaurant|cafe|food|dhaba|hotel|bakery|caterer/.test(allTypes)) return 'restaurant';
    if (/real.?estate|property|builder|developer|apartment/.test(allTypes)) return 'realestate';
    if (/gym|fitness|yoga|pilates|sports/.test(allTypes)) return 'fitness';
    if (/school|college|coaching|tutor|education|institute/.test(allTypes)) return 'education';
    if (/interior|architect|renovation|decor/.test(allTypes)) return 'interior';
    if (/cloth|apparel|fashion|boutique|saree|garment/.test(allTypes)) return 'clothing';
    if (/jewel|gold|silver|diamond/.test(allTypes)) return 'jewellery';
    if (/manufact|factory|industri|engineer|fabricat/.test(allTypes)) return 'manufacturing';
    if (/immigr|visa|travel|tour/.test(allTypes)) return 'immigration';
    if (/photo|studio|videograph|cinemat/.test(allTypes)) return 'photography';
    if (/chartered.?account|ca firm|tax.?consult|audit|gst.?consult/.test(allTypes)) return 'ca';
    if (/event|wedding.?plan|decorator|caterer|banquet/.test(allTypes)) return 'events';
    if (/auto|car|vehicle|garage|mechanic|bike|motorcycle|tyre/.test(allTypes)) return 'automobile';
    if (/hotel|lodge|guest.?house|hostel|resort|stay/.test(allTypes)) return 'hotel';
    if (/pharmac|chemist|drug.?store|medicine/.test(allTypes)) return 'pharmacy';
    return 'generic';
}

// ─────────────────────────────────────────────
//  MESSAGE TEMPLATES
//
//  Stage 1 strategy:
//    — No website: build a website to increase online presence
//    — Has website: update your website to increase online presence & conversions
//    — All messages are short, specific, end with a low-friction yes/no
//
//  Stage 2 strategy:
//    — Don't say "following up on my message" — everyone ignores that
//    — Ask a completely fresh, genuinely curious question about their business
//    — Question they want to answer even if they forgot Stage 1 existed
// ─────────────────────────────────────────────

// Stage 1 — (name, hasWebsite, rating, reviews)
const STAGE1 = {
    dental: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's live — but not optimised to convert visitors into bookings.

A focused update brings 15–20 more appointment requests/month from Google.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for *${name}* in Ahmedabad — you don't have a website.

Patients searching online can't find or book with you. A professional dental website brings 10–15 appointment requests/month from Google — no ads needed.

Worth setting up?

— Dhyey`,

    clinic: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for patient conversions.

A focused update brings 8–12 new patient inquiries/month from Google.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for clinics in Ahmedabad — *${name}* doesn't have a website.

Patients researching online can't find you. A simple clinic website brings 8–12 new patient inquiries/month — no ads needed.

Interested?

— Dhyey`,

    restaurant: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised for online orders.

An improved site brings 20–30 extra orders/month from people researching online.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for restaurants in Ahmedabad — *${name}* doesn't have a website or online menu.

People research online before choosing where to eat. A website + menu page brings 20–30 extra orders/month.

Worth building one?

— Dhyey`,

    realestate: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised to attract buyer inquiries.

A focused update brings more direct buyer calls from Google.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for property agents in Ahmedabad — *${name}* doesn't have a website.

Buyers search online before calling agents. A professional site brings consistent buyer inquiries without OTA commissions.

Worth building?

— Dhyey`,

    fitness: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's live — but not optimised to convert visitors into memberships.

A focused update brings 15–25 more trial inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for gyms in Ahmedabad — *${name}* doesn't have a website.

People researching gyms online want to see pricing, classes, and trials. A gym website brings 15–25 trial inquiries/month.

Worth setting up?

— Dhyey`,

    education: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for student conversions.

A focused update brings 30–40 more student inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for coaching institutes in Ahmedabad — *${name}* doesn't have a website.

Parents and students research online before enrolling. A professional site brings 30–40 student inquiries/month.

Worth building?

— Dhyey`,

    interior: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised to showcase work.

A focused update brings more project inquiries.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for interior designers in Ahmedabad — *${name}* doesn't have a website or portfolio.

Clients want to see your work before reaching out. A portfolio site brings consistent project inquiries.

Worth creating one?

— Dhyey`,

    clothing: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised for online sales.

An updated site brings 25–40 more orders/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for clothing stores in Ahmedabad — *${name}* doesn't have a website or catalogue.

Customers want to browse online. A catalogue + WhatsApp brings 25–40 extra orders/month.

Worth setting up?

— Dhyey`,

    jewellery: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised to attract buyers.

A focused update brings more WhatsApp and in-store inquiries.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for jewellery shops in Ahmedabad — *${name}* doesn't have a website or catalogue.

Buyers want to see designs and prices online. A catalogue brings consistent inquiries.

Worth creating one?

— Dhyey`,

    manufacturing: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised for B2B inquiries.

An improved site brings more inbound leads.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for manufacturers in Ahmedabad — *${name}* doesn't have a website.

B2B buyers search online before shortlisting vendors. A professional site brings consistent inquiries.

Worth building?

— Dhyey`,

    immigration: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for client conversions.

A focused update brings 15–20 more inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for immigration consultants in Ahmedabad — *${name}* doesn't have a website.

Clients want to verify credibility before calling. A professional site brings 15–20 client inquiries/month.

Worth building?

— Dhyey`,

    photography: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised to showcase work.

A focused update brings 10–15 more inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for photographers in Ahmedabad — *${name}* doesn't have a website or portfolio.

Clients want to see your work before booking. A portfolio site brings 10–15 direct bookings/month.

Worth creating?

— Dhyey`,

    ca: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for client conversions.

A focused update brings 10–15 more inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for CAs and tax consultants in Ahmedabad — *${name}* doesn't have a website.

Clients research before hiring. A professional site brings 10–15 client inquiries/month.

Worth building?

— Dhyey`,

    events: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised to showcase work.

A focused update brings more event inquiries.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for event planners in Ahmedabad — *${name}* doesn't have a website or portfolio.

Clients want to see your work before booking. A portfolio site brings consistent event inquiries.

Worth creating?

— Dhyey`,

    automobile: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for service bookings.

A focused update brings more service inquiries.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for car service centres in Ahmedabad — *${name}* doesn't have a website.

Customers search online before visiting. A professional site brings consistent service bookings.

Worth building?

— Dhyey`,

    hotel: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's there — but not optimised for direct bookings.

A focused update reduces OTA dependency.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for hotels in Ahmedabad — *${name}* doesn't have a website.

Guests book online before arriving. A professional site brings direct bookings without OTA commissions.

Worth building?

— Dhyey`,

    pharmacy: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's up — but not optimised for orders.

A focused update brings more WhatsApp orders.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for pharmacies in Ahmedabad — *${name}* doesn't have a website.

Customers order online now. A site + WhatsApp brings orders without app commissions.

Worth building?

— Dhyey`,

    generic: (name, hasWebsite) => hasWebsite
        ? `Hi —

Checked *${name}*'s website. It's live — but not optimised to convert visitors.

A focused update brings 10–20 more inquiries/month.

Want to know what to improve?

— Dhyey`
        : `Hi —

Searched for *${name}* in Ahmedabad — you don't have a website.

Customers search online now. A professional site brings 10–20 new inquiries/month.

Worth building?

— Dhyey`,
};

// Stage 2 — don't say "following up". Ask a fresh question they WANT to answer.
// Their natural instinct is to explain how their business works — that opens the door.
const STAGE2 = {
    dental: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question, genuinely curious — are most of your new patients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey`,

    clinic: (name) =>
        `Hi *${name}* —\n\n` +
        `Out of curiosity — right now, how are most new patients finding your clinic? Referrals, walk-ins, or online?\n\n` +
        `— Dhyey`,

    restaurant: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are you currently getting online orders or mostly walk-in customers?\n\n` +
        `— Dhyey`,

    realestate: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your buyer inquiries coming through referrals, or also from Google and social media?\n\n` +
        `— Dhyey`,

    fitness: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are new members mostly finding you through word of mouth, or also through Google and Instagram?\n\n` +
        `— Dhyey`,

    education: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most student inquiries coming through referrals, or are some parents finding you on Google?\n\n` +
        `— Dhyey`,

    interior: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your project leads coming through referrals, or are clients also finding you online?\n\n` +
        `— Dhyey`,

    clothing: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers walk-ins, or are some ordering through WhatsApp or Instagram?\n\n` +
        `— Dhyey`,

    jewellery: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most customers coming to your shop directly, or are some also reaching out through WhatsApp or Instagram?\n\n` +
        `— Dhyey`,

    manufacturing: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your B2B inquiries coming through existing contacts and referrals, or also from online?\n\n` +
        `— Dhyey`,

    immigration: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your clients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey`,

    photography: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your bookings coming through referrals, or are some clients also finding you through Google or Instagram?\n\n` +
        `— Dhyey`,

    ca: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey`,

    events: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most event enquiries coming through referrals, or are some clients also finding you online?\n\n` +
        `— Dhyey`,

    automobile: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most customers coming through word of mouth, or are some also finding you through Google?\n\n` +
        `— Dhyey`,

    hotel: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your bookings coming through OTAs like MakeMyTrip, or do you also get direct bookings?\n\n` +
        `— Dhyey`,

    pharmacy: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers walk-ins, or are some also ordering through WhatsApp?\n\n` +
        `— Dhyey`,

    generic: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers coming through referrals and word of mouth, or also through Google?\n\n` +
        `— Dhyey`,
};

function buildAnalysisMessage(name, issues) {
    const issueList = issues.map(i => `• ${i}`).join('\n');
    return (
        `Hi —\n\n` +
        `I checked *${name}*'s website and found a few things that are stopping customers from reaching you:\n\n` +
        `${issueList}\n\n` +
        `These are straightforward fixes — businesses that sort them typically see 10–20 more enquiries/month from the same traffic.\n\n` +
        `Want me to walk you through what to change?\n\n` +
        `— Dhyey`
    );
}

function buildMessage(lead) {
    const name = lead.title || lead.name || 'there';
    const industry = detectIndustry(lead);
    const hasWebsite = !!(lead.website);
    const rating = lead.rating ? parseFloat(lead.rating) : null;
    const reviews = lead.reviews || 0;
    const templates = IS_FOLLOWUP ? STAGE2 : STAGE1;
    const fn = templates[industry] || templates.generic;

    // Use real website issues if analyze.js has been run for this lead
    if (!IS_FOLLOWUP && hasWebsite && lead._analysis && lead._analysis.issues && lead._analysis.issues.length > 0) {
        return buildAnalysisMessage(name, lead._analysis.issues);
    }

    return fn(name, hasWebsite, rating, reviews);
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function normaliseRaw(raw) {
    let num = String(raw).replace(/[\s\-+]/g, '');
    if (num.length === 10) num = '91' + num;
    return num;
}

function normalisePhone(raw) {
    return normaliseRaw(raw) + '@c.us';
}

function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

function progressBar(current, total) {
    const pct = Math.round((current / total) * 100);
    const filled = Math.round(pct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    process.stdout.write(`\r  Progress: [${bar}] ${pct}%  (${current}/${total})`);
    if (current === total) process.stdout.write('\n');
}

// ─────────────────────────────────────────────
//  MAIN SENDER LOOP
// ─────────────────────────────────────────────
async function sendAll(client, leads, progressAll) {
    const total = leads.length;
    let sent = 0, failed = 0, skipped = 0;
    const stage = IS_FOLLOWUP ? 2 : 1;
    const attemptedThisBatch = [];

    logger('info', '', '', `Stage ${stage} batch — ${total} leads, ${CONFIG.DELAY_BETWEEN_MESSAGES_MS / 1000}s delay`, stage);

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const waId = normalisePhone(lead.phone);
        const message = buildMessage(lead);

        progressBar(i, total);

        try {
            const isRegistered = await client.isRegisteredUser(waId);
            if (!isRegistered) {
                logger('skipped', lead.phone, lead.title || lead.name, 'Not on WhatsApp', stage);
                skipped++;
            } else {
                await client.sendMessage(waId, message);
                logger('sent', lead.phone, lead.title || lead.name, `Stage ${stage} OK | ${detectIndustry(lead)}`, stage);
                sent++;
            }
        } catch (err) {
            logger('failed', lead.phone, lead.title || lead.name, err.message || 'Unknown error', stage);
            failed++;
        }

        // Mark attempted regardless of outcome so we never retry in the next batch
        attemptedThisBatch.push(normaliseRaw(lead.phone));

        if (i < leads.length - 1) {
            await delay(CONFIG.DELAY_BETWEEN_MESSAGES_MS);
        }
    }

    progressBar(total, total);

    // Persist batch progress
    markAttempted(progressAll, attemptedThisBatch);
    saveProgress(progressAll);

    console.log('\n──────────────────────────────────────');
    console.log(`  BATCH COMPLETE  (Stage ${stage})`);
    console.log(`  ✅ Sent    : ${sent}`);
    console.log(`  ❌ Failed  : ${failed}`);
    console.log(`  ⏭️  Skipped : ${skipped}`);
    console.log(`  📦 Batch progress saved → ${CONFIG.PROGRESS_FILE}`);
    console.log(`  ▶️   Run again to send next batch of ${CONFIG.BATCH_SIZE}`);
    console.log('──────────────────────────────────────\n');

    saveLog();
    process.exit(0);
}

// ─────────────────────────────────────────────
//  WHATSAPP CLIENT SETUP
// ─────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: CONFIG.SESSION_DIR }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,800',
        ],
    },
});

client.on('qr', (qr) => {
    console.log('\n📱  Scan this QR code in WhatsApp → Linked Devices → Link a device\n');
    console.log('QR data (paste at https://qr.io if terminal rendering fails):');
    console.log(qr);
    console.log();
    try {
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
    } catch (_) { }
});

client.on('loading_screen', (percent, message) => {
    process.stdout.write(`\r⏳  Loading WhatsApp … ${percent}%  ${message}   `);
    if (percent === 100) process.stdout.write('\n');
});

client.on('authenticated', () => {
    console.log('\n🔐  Authenticated – session saved locally.');
});

client.on('auth_failure', (msg) => {
    console.error('❌  Authentication failed:', msg);
    process.exit(1);
});

client.on('disconnected', (reason) => {
    console.warn('⚠️   Client disconnected:', reason);
    saveLog();
    process.exit(1);
});

client.on('ready', async () => {
    console.log('\n✅  WhatsApp Web is ready!\n');
    const leads = loadLeads(progressAll);
    if (leads.length === 0) {
        if (IS_FOLLOWUP) {
            console.log('⚠️   No leads ready for follow-up. Run Stage 1 first and wait 2–3 days.');
        } else {
            console.log('⚠️   All leads in this file have been batched. Use --reset to start over.');
        }
        process.exit(0);
    }
    await sendAll(client, leads, progressAll);
});

// ─────────────────────────────────────────────
//  AUTO-PICK
//  Scans all leads/ files and returns the first one that still has
//  untouched leads for this stage.
// ─────────────────────────────────────────────
function autoPickLeadsFile(progressAll) {
    const files = discoverLeadsFiles();
    const contacted = getContactedPhones();

    for (const file of files) {
        let data;
        try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (_) { continue; }

        const seen = new Set();
        const unique = data.filter(l => {
            if (!l.phone) return false;
            const k = normaliseRaw(l.phone);
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        const eligible = IS_FOLLOWUP
            ? unique.filter(l => contacted.get(normaliseRaw(l.phone)) === 1)
            : unique.filter(l => !contacted.has(normaliseRaw(l.phone)));

        // Temporarily swap key context to check this file's progress
        const origFile = CONFIG.LEADS_FILE;
        CONFIG.LEADS_FILE = file;
        const attemptedForFile = getAttemptedPhones(progressAll);
        CONFIG.LEADS_FILE = origFile;

        const remaining = eligible.filter(l => !attemptedForFile.has(normaliseRaw(l.phone)));
        if (remaining.length > 0) return file;
    }
    return null;
}

// ─────────────────────────────────────────────
//  STATUS REPORT
// ─────────────────────────────────────────────
function printStatus(progressAll) {
    const files = discoverLeadsFiles();
    if (files.length === 0) {
        console.log('⚠️   No files found in leads/');
        return;
    }
    const stage = IS_FOLLOWUP ? 2 : 1;
    const contacted = getContactedPhones();

    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  OUTREACH STATUS  (Stage ${stage}${IS_FOLLOWUP ? ' — follow-up' : ' — first contact'})`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  ${'Industry'.padEnd(18)} ${'Total'.padStart(6)} ${'Eligible'.padStart(9)} ${'Attempted'.padStart(10)} ${'Remaining'.padStart(10)}`);
    console.log(`  ${'─'.repeat(58)}`);

    for (const file of files) {
        const industry = path.basename(file).replace('_leads.json', '');
        let data;
        try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (_) { console.log(`  ${industry.padEnd(18)}  (unreadable)`); continue; }

        const seen = new Set();
        const unique = data.filter(l => {
            if (!l.phone) return false;
            const k = normaliseRaw(l.phone);
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        const eligible = IS_FOLLOWUP
            ? unique.filter(l => contacted.get(normaliseRaw(l.phone)) === 1)
            : unique.filter(l => !contacted.has(normaliseRaw(l.phone)));

        const origFile = CONFIG.LEADS_FILE;
        CONFIG.LEADS_FILE = file;
        const attemptedSet = getAttemptedPhones(progressAll);
        CONFIG.LEADS_FILE = origFile;

        const remaining = eligible.filter(l => !attemptedSet.has(normaliseRaw(l.phone))).length;
        const done = eligible.length - remaining;

        const bar = remaining === 0 ? '✅ done' : `▶️  ${remaining} left`;
        console.log(`  ${industry.padEnd(18)} ${String(unique.length).padStart(6)} ${String(eligible.length).padStart(9)} ${String(done).padStart(10)} ${String(remaining).padStart(10)}  ${bar}`);
    }
    console.log(`${'─'.repeat(62)}\n`);
}

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
loadExistingLog();
const progressAll = loadProgress();

// --status: print progress table and exit (no WhatsApp needed)
if (IS_STATUS) {
    printStatus(progressAll);
    process.exit(0);
}

// --reset: clear batch progress for one or all industries
if (IS_RESET) {
    if (CONFIG.LEADS_FILE) {
        // specific industry
        resetProgress(progressAll);
    } else {
        // all industries
        const files = discoverLeadsFiles();
        for (const file of files) {
            CONFIG.LEADS_FILE = file;
            resetProgress(progressAll);
        }
        saveProgress(progressAll);
    }
    process.exit(0);
}

// Auto-pick mode: find the next industry that still has pending leads
if (!CONFIG.LEADS_FILE) {
    const picked = autoPickLeadsFile(progressAll);
    if (!picked) {
        console.log('🎉  All industries fully batched for this stage!');
        console.log(`    Run with --followup for Stage 2, or --reset to start Stage 1 again.\n`);
        process.exit(0);
    }
    CONFIG.LEADS_FILE = picked;
    console.log(`🎯  Auto-picked: ${CONFIG.LEADS_FILE}`);
}

console.log(`🚀  Catalyq Outreach  [Stage ${IS_FOLLOWUP ? 2 : 1} | ${CONFIG.LEADS_FILE} | Batch: ${CONFIG.BATCH_SIZE} | Done so far: ${getAttemptedPhones(progressAll).size}]`);
client.initialize();
