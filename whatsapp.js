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
//    — No website: direct pitch — you're invisible online, here's what you're losing, here's the fix
//    — Low rating (<4.2): loss framing — "you're losing X because of this"
//    — Has website + good rating: upgrade pitch — site isn't converting, here's what to improve
//    — All messages are short, specific, end with a low-friction yes/no
//
//  Stage 2 strategy:
//    — Don't say "following up on my message" — everyone ignores that
//    — Ask a completely fresh, genuinely curious question about their business
//    — Question they want to answer even if they forgot Stage 1 existed
// ─────────────────────────────────────────────

// Stage 1 — (name, hasWebsite, rating, reviews)
const STAGE1 = {
    dental: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched "dental clinic Ahmedabad" — *${name}* doesn't have a website, so you're invisible to patients searching online right now.\n\n` +
            `Other clinics nearby are getting 10–15 appointment requests/month just from Google — without any ads.\n\n` +
            `Want me to show you exactly how? Takes 2 minutes.\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Clinics below 4.2 get ranked lower in Ahmedabad searches — you're likely losing 5–8 booking inquiries a month just because of this.\n\n` +
            `Is fixing that something you're thinking about?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐ on Google)` : ''}. It's live — but it's not converting. No online booking, no patient gallery, and almost certainly not ranking on "dental clinic near me" searches.\n\n` +
            `Clinics we've upgraded are getting 15–20 appointment requests/month from Google without ads.\n\n` +
            `Want me to show you what needs to change?\n\n` +
            `— Dhyey`
        );
    },

    clinic: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for clinics in Ahmedabad — *${name}* doesn't have a website, so patients looking online can't find or contact you.\n\n` +
            `A simple clinic website with a WhatsApp button typically brings 8–12 new patient inquiries/month — no ads needed.\n\n` +
            `Interested in seeing how?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick observation.\n\n` +
            `*${name}* is sitting at ${rating}⭐ on Google. Below 4.2, Google starts showing your clinic less in local searches — your competitors with higher ratings are getting your patients.\n\n` +
            `Is this on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Had a look at *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's up — but there's no appointment button, no WhatsApp link, and it's not optimised for local search.\n\n` +
            `A focused upgrade typically adds 8–12 new patient inquiries/month from the same Google traffic you already have.\n\n` +
            `Worth showing you what to fix?\n\n` +
            `— Dhyey`
        );
    },

    restaurant: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for restaurants in Ahmedabad — *${name}* doesn't show a website or menu online.\n\n` +
            `Restaurants with a basic menu page + WhatsApp order button are getting 20–30 extra orders/month from people who search before going out.\n\n` +
            `Worth setting up for you?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Restaurants below 4.2 appear lower in "restaurants near me" searches — which directly means fewer walk-ins and orders.\n\n` +
            `Is improving that something you're working on?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's there — but no online menu, no order button, and no WhatsApp integration.\n\n` +
            `Restaurants with a menu page + WhatsApp order button are getting 20–30 extra orders/month from people who browse before going out.\n\n` +
            `Worth a quick upgrade?\n\n` +
            `— Dhyey`
        );
    },

    realestate: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for property agents in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `Buyers today Google an agent before they call. Without a site, you're losing inquiries to agents with a basic online presence — even if your properties are better.\n\n` +
            `Want me to show you what a simple property site can do?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. For real estate, buyers check ratings before calling — a low rating is directly stopping inquiries from reaching you.\n\n` +
            `Is this something you're aware of?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's live — but there's no property listing page, no enquiry form, and buyers who land on it have no clear next step.\n\n` +
            `Agents who upgrade for search + lead capture typically see a clear jump in inbound calls without spending on ads.\n\n` +
            `Want me to show you what's missing?\n\n` +
            `— Dhyey`
        );
    },

    fitness: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for gyms in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `People searching "gym near me" click the ones with a site showing pricing, photos, and a trial form. Without that, you're invisible to the highest-intent leads.\n\n` +
            `Want to fix that quickly?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. People searching for a gym always check ratings first — below 4.2 and most of them pick a competitor before even calling you.\n\n` +
            `Is fixing this on your list?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's online — but no pricing page, no free trial form, and it's not ranking on "gym near me" searches.\n\n` +
            `Gyms we've upgraded for search + sign-ups are getting 15–25 trial enquiries/month from Google without any paid ads.\n\n` +
            `Want me to show you what to improve?\n\n` +
            `— Dhyey`
        );
    },

    education: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for coaching institutes in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `Parents and students check online before calling any institute now. A simple site with your courses, fees, and results page converts them directly — institutes I've worked with see 30–40 extra inquiries/month.\n\n` +
            `Want to see how?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Parents searching for coaching classes almost always pick institutes above 4.2 — you're losing students to lower-quality competitors just because of this number.\n\n` +
            `Is improving that on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's up — but no course listing, no fees page, and no clear call-to-action for parents or students searching online.\n\n` +
            `Institutes we've rebuilt for search + conversions see 40–50% more enquiries from the same Google traffic.\n\n` +
            `Want to see what needs to change?\n\n` +
            `— Dhyey`
        );
    },

    interior: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for interior designers in Ahmedabad — *${name}* doesn't have a website or portfolio online.\n\n` +
            `Clients with serious budgets always check a designer's work online before reaching out. Without a portfolio site, you're only getting referral clients — and missing everyone searching on Google.\n\n` +
            `Want me to show you what a portfolio site can bring in?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Clients looking for interior work always check ratings and photos before reaching out — a lower rating quietly filters you out before they even call.\n\n` +
            `Is this something you'd want to fix?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's live — but there's no portfolio gallery with project categories, no budget range guide, and no clear way for clients to enquire directly.\n\n` +
            `Clients with serious budgets check the portfolio before reaching out — a focused upgrade turns more visitors into actual project enquiries.\n\n` +
            `Want me to show you what to add?\n\n` +
            `— Dhyey`
        );
    },

    clothing: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for clothing stores in Ahmedabad — *${name}* doesn't have a website or online catalogue.\n\n` +
            `A WhatsApp catalogue + simple product page lets customers browse and order without stepping in — stores doing this are getting 25–40 extra orders/month from people who'd never have walked in.\n\n` +
            `Want to set this up?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Shoppers searching online skip stores below 4.2 — you're losing customers to competitors before they even see your collection.\n\n` +
            `Is improving this on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's there — but no online catalogue, no WhatsApp order button, and customers can't browse or buy without coming in.\n\n` +
            `Clothing stores we've upgraded with a catalogue + WhatsApp integration are getting 25–40 extra orders/month from people who never would have walked in.\n\n` +
            `Worth upgrading?\n\n` +
            `— Dhyey`
        );
    },

    jewellery: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for jewellery shops in Ahmedabad — *${name}* doesn't have a website or catalogue online.\n\n` +
            `Jewellery buyers browse online before visiting — they want to see designs, gold rates, and trust signals before stepping in. Without that, you're losing serious buyers to shops that show up online.\n\n` +
            `Worth setting up a catalogue page?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. For jewellery, trust is everything — buyers almost never visit a shop with less than 4.2 stars when there are options nearby.\n\n` +
            `Is fixing this something you're thinking about?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's up — but no digital catalogue, no gold rate section, and buyers can't browse designs before visiting.\n\n` +
            `Jewellers with an upgraded site + WhatsApp link see noticeably more serious enquiries from buyers who researched online first.\n\n` +
            `Want me to show you what's missing?\n\n` +
            `— Dhyey`
        );
    },

    manufacturing: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for manufacturers in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `B2B buyers and procurement teams search Google before shortlisting vendors. Without a site showing your products, certifications, and capacity, you're not even in their consideration set.\n\n` +
            `Want to fix that?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. B2B buyers increasingly check Google before reaching out — a low rating makes them hesitate, even if your quality is excellent.\n\n` +
            `Is this on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's live — but no product catalogue, no certifications page, and procurement teams searching for vendors can't evaluate you without calling.\n\n` +
            `Manufacturers who upgrade for B2B search + inbound typically get shortlisted more often without spending on ads.\n\n` +
            `Worth looking at?\n\n` +
            `— Dhyey`
        );
    },

    immigration: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for immigration consultants in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `People searching for visa help want to verify a consultant is legitimate before calling — a professional site with services, success cases, and a WhatsApp contact converts them instantly. Consultants I've worked with get 15–20 extra inquiry leads/month.\n\n` +
            `Want to know more?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. People looking for visa consultants are putting money and time on the line — they almost always pick someone with 4.2+ stars. You're losing leads before they even call.\n\n` +
            `Is improving this something you'd want to look at?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's there — but no services breakdown, no success stories, and no clear way for someone to verify your credibility before calling.\n\n` +
            `Consultants who upgrade for trust + local search see a clear jump in how many people actually reach out without spending on ads.\n\n` +
            `Want me to show you what to add?\n\n` +
            `— Dhyey`
        );
    },

    photography: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for photographers in Ahmedabad — *${name}* doesn't have a website or portfolio online.\n\n` +
            `Clients book photographers they can see — without a portfolio site showing your work, pricing, and a WhatsApp booking link, you're only getting referrals and missing everyone searching on Google.\n\n` +
            `Want me to show you what a portfolio site can bring in?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Clients searching for photographers always check ratings and sample work before booking — below 4.2 and most shortlist someone else first.\n\n` +
            `Is improving this something you're thinking about?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's up — but no gallery organised by event type, no clear pricing, and no booking/enquiry form.\n\n` +
            `Photographers we've upgraded are getting 10–15 direct booking enquiries/month from Google without any ads.\n\n` +
            `Want me to show you what to improve?\n\n` +
            `— Dhyey`
        );
    },

    ca: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for CAs and tax consultants in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `Clients looking for a CA Google before calling — a professional site listing your services (GST, ITR, audit, company registration) with a WhatsApp contact converts them instantly. Firms I've worked with get 10–15 extra client enquiries/month.\n\n` +
            `Want to know more?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. New clients searching for a CA almost always check reviews before reaching out — a lower rating is quietly costing you enquiries.\n\n` +
            `Is improving this on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's live — but no clear services list, no GST/ITR/audit breakdown, and no easy way for a prospect to reach you directly.\n\n` +
            `A focused upgrade turns your site into a steady source of inbound client enquiries without any ad spend.\n\n` +
            `Want me to show you what's missing?\n\n` +
            `— Dhyey`
        );
    },

    events: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for event planners and decorators in Ahmedabad — *${name}* doesn't have a website or portfolio online.\n\n` +
            `Couples and families planning events check work samples and pricing online before shortlisting anyone. Without a site, you're not even in the running for clients who search on Google.\n\n` +
            `Worth setting up?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Event clients always read reviews before committing — below 4.2 and most of them move on without calling you.\n\n` +
            `Is fixing this something you'd want to look at?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's there — but no event gallery organised by type, no budget range guide, and no direct booking or enquiry path.\n\n` +
            `Planners we've upgraded are getting 12–18 event enquiries/month from Google without spending on ads.\n\n` +
            `Want me to point out what to fix?\n\n` +
            `— Dhyey`
        );
    },

    automobile: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for car service centres in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `Car owners Google a service centre before going — without a site showing your services, pricing, and location with a WhatsApp button, they call a competitor instead.\n\n` +
            `Want me to show you how to fix that quickly?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. People searching for a garage or service centre almost always check ratings first — below 4.2 and they pick someone else before calling.\n\n` +
            `Is this something you're aware of?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's live — but no services/pricing list, no slot booking, and not optimised for "car service near me" searches.\n\n` +
            `A focused upgrade brings in steady service bookings from Google without any paid ads.\n\n` +
            `Worth showing you?\n\n` +
            `— Dhyey`
        );
    },

    hotel: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for hotels and stays in Ahmedabad — *${name}* doesn't have a website.\n\n` +
            `Guests compare and book online — without a site showing rooms, pricing, and a direct booking option, you're losing bookings to properties listed on OTAs who take 15–20% commission on every stay.\n\n` +
            `Want me to show you how a direct booking site saves that commission?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick note.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Guests check ratings before booking — below 4.2 and they pick a competitor or trust an OTA listing over you.\n\n` +
            `Is improving this something you're thinking about?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's up — but no direct booking form, no room gallery with pricing, and you're likely paying 15–20% commission to OTAs on bookings that could come directly.\n\n` +
            `An upgraded site with direct booking typically cuts OTA dependency significantly.\n\n` +
            `Want me to show you what to add?\n\n` +
            `— Dhyey`
        );
    },

    pharmacy: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for medical stores in Ahmedabad — *${name}* doesn't have a website or online presence.\n\n` +
            `Customers increasingly order medicines and health products online before visiting. A simple site with a WhatsApp order button lets you take orders without a delivery app taking commission.\n\n` +
            `Interested in setting this up?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — honest observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Customers searching for a pharmacy nearby check ratings — below 4.2 and they walk into a competitor's store instead.\n\n` +
            `Is fixing this on your radar?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐)` : ''}. It's there — but no product categories, no WhatsApp order button, and customers can't place an order without calling.\n\n` +
            `Pharmacies we've upgraded with a catalogue + WhatsApp ordering see a clear jump in repeat orders without paying commission to any app.\n\n` +
            `Want me to show you what to add?\n\n` +
            `— Dhyey`
        );
    },

    generic: (name, hasWebsite, rating) => {
        if (!hasWebsite) return (
            `Hi —\n\n` +
            `Searched for *${name}* in Ahmedabad — you don't have a website, so customers who search online can't find you.\n\n` +
            `A basic website with your services, location, and a WhatsApp button typically brings in 10–20 new inquiries/month from people who would never have found you otherwise.\n\n` +
            `Want to see what that looks like?\n\n` +
            `— Dhyey`
        );
        if (rating && rating < 4.2) return (
            `Hi — quick observation.\n\n` +
            `*${name}* is at ${rating}⭐ on Google. Businesses below 4.2 get ranked lower in local searches — you're likely losing customers to competitors before they even reach you.\n\n` +
            `Is this something you'd want to fix?\n\n` +
            `— Dhyey`
        );
        return (
            `Hi —\n\n` +
            `Checked *${name}*'s website${rating ? ` (${rating}⭐ on Google)` : ''}. It's live — but it's not set up to convert visitors into enquiries. No clear call-to-action, not optimised for local search, and likely missing a WhatsApp contact button.\n\n` +
            `A focused upgrade typically adds 10–20 new enquiries/month from the traffic you're already getting.\n\n` +
            `Want me to show you what to fix?\n\n` +
            `— Dhyey`
        );
    },
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
