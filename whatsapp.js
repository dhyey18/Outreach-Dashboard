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
const IS_FOLLOWUP = args.includes('--followup');
const IS_RESET = args.includes('--reset');
const IS_STATUS = args.includes('--status');
const leadsFileArg = args.find(a => a.startsWith('--leads='));
const industryArg = args.find(a => a.startsWith('--industry='));
const cityArg = args.find(a => a.startsWith('--city='));
const CITY = cityArg ? cityArg.split('=')[1].toLowerCase() : null;

const LEADS_DIR = CITY ? `./leads/${CITY}` : './leads';

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
    BATCH_SIZE: 40,
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

    const isSocialOnly = url => url && /facebook\.com|fb\.com|fb\.me|instagram\.com/i.test(url);
    const hasRealWebsite = l => l.website && !isSocialOnly(l.website);

    const withRealWebsite = unique.filter(l => hasRealWebsite(l)).length;
    const socialOnly = unique.filter(l => isSocialOnly(l.website)).length;
    const noWebsite = unique.filter(l => !hasRealWebsite(l)); // includes no-website AND social-only
    console.log(`🌐  ${noWebsite.length} leads to contact (${withRealWebsite} with real website skipped, ${socialOnly} social-only → new website pitch).`);

    const contacted = getContactedPhones();

    let eligible;
    if (!IS_FOLLOWUP) {
        // Stage 1: only send to no-website leads never contacted before
        eligible = noWebsite.filter(l => !contacted.has(normaliseRaw(l.phone)));
        console.log(`📨  ${eligible.length} fresh leads (not contacted before).`);
    } else {
        // Stage 2: only send to leads that got Stage 1 but NOT Stage 2 yet
        eligible = noWebsite.filter(l => contacted.get(normaliseRaw(l.phone)) === 1);
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
    if (/nursing.?home|surgical|maternity.?hosp/.test(allTypes)) return 'hospital';
    if (/patholog|diagnostic|radiol|blood.?test/.test(allTypes)) return 'diagnostic';
    if (/clinic|doctor|physician|medical|health|physiotherapy|ayurved/.test(allTypes)) return 'clinic';
    if (/restaurant|cafe|food|dhaba|bakery/.test(allTypes)) return 'restaurant';
    if (/real.?estate|property|builder|developer|apartment/.test(allTypes)) return 'realestate';
    if (/marriage.?hall|banquet|wedding.?venue|party.?hall/.test(allTypes)) return 'wedding_venue';
    if (/gym|fitness|yoga|pilates|sports/.test(allTypes)) return 'fitness';
    if (/school|college|coaching|tutor|education|institute/.test(allTypes)) return 'education';
    if (/interior|architect|renovation|decor/.test(allTypes)) return 'interior';
    if (/cloth|apparel|fashion|boutique|saree|garment/.test(allTypes)) return 'clothing';
    if (/jewel|gold|silver|diamond/.test(allTypes)) return 'jewellery';
    if (/manufact|factory|industri|engineer|fabricat/.test(allTypes)) return 'manufacturing';
    if (/packer|mover|courier|transport|cargo|logistics/.test(allTypes)) return 'logistics';
    if (/print|flex.?print|digital.?print|visiting.?card/.test(allTypes)) return 'printing';
    if (/insurance|mutual.?fund|financial.?advis|loan.?agent/.test(allTypes)) return 'financial';
    if (/immigr|visa/.test(allTypes)) return 'immigration';
    if (/tour|travel.?agenc|holiday/.test(allTypes)) return 'travel';
    if (/photo|studio|videograph|cinemat/.test(allTypes)) return 'photography';
    if (/chartered.?account|ca firm|tax.?consult|audit|gst.?consult/.test(allTypes)) return 'ca';
    if (/advocate|lawyer|law.?firm|legal/.test(allTypes)) return 'legal';
    if (/event|wedding.?plan|decorator|caterer/.test(allTypes)) return 'events';
    if (/beauty|parlour|salon|spa|nail|makeup/.test(allTypes)) return 'beauty';
    if (/mobile.?repair|laptop.?repair|computer.?repair|electronic/.test(allTypes)) return 'electronics';
    if (/auto|car|vehicle|garage|mechanic|bike|motorcycle|tyre/.test(allTypes)) return 'automobile';
    if (/hotel|lodge|guest.?house|hostel|resort|stay/.test(allTypes)) return 'hotel';
    if (/pharmac|chemist|drug.?store|medicine/.test(allTypes)) return 'pharmacy';
    return 'generic';
}

// ─────────────────────────────────────────────
//  MESSAGE TEMPLATES
// ─────────────────────────────────────────────

const CONTACT = '+91 94291 84788';

// Stage 1 — human, first-person, casual. No corporate structure.
const STAGE1 = {
    dental: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's up but honestly doesn't seem like it's pulling patients from Google.

Small changes usually make a big difference for local clinics. Happy to take a proper look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only an Instagram page came up.

Most patients use Google when they're looking for a dentist, not social media. A proper website gets you into those results. I build them for ₹8,000, usually up in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up dental clinics in ${city} and noticed *${name}* doesn't show up on Google at all.

Patients searching online right now are just going to whoever comes up first. I build websites for dental clinics — ₹8,000 one-time, ready in about a week.

Worth a chat?

Dhyey
${CONTACT}`
        );
    },

    clinic: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — it's there, but doesn't seem to be showing up in local Google searches the way it should.

A few tweaks usually sort this out. Happy to take a look if you're interested.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* — only a social media page showed up on Google.

Patients searching for a clinic on Google need an actual website to find and contact you directly. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up *${name}* in ${city} — no website came up.

People searching for a doctor online in ${city} are just calling whoever shows up on Google first. I build clinic websites — ₹8,000, done in about a week.

Interested?

Dhyey
${CONTACT}`
        );
    },

    restaurant: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Had a look at *${name}*'s website — it's live but I don't think it's doing much for online orders or walk-ins from search.

A few changes can really help with this. Let me know if you want me to take a closer look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* — only Facebook came up, no website.

People searching for a restaurant in ${city} online usually want to see a menu or place an order. Hard to do that on a Facebook page. I build restaurant websites for ₹8,000, ready in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up *${name}* in ${city} — no website, just a Google Maps listing.

People searching for somewhere to eat right now can't really find you online. I build restaurant websites — ₹8,000, up in about a week.

Worth it?

Dhyey
${CONTACT}`
        );
    },

    realestate: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — it's there, but I don't think it's generating buyer inquiries on its own.

Fixing a few things usually starts bringing in leads without having to share commission with anyone. Happy to look into it.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — just a social media page came up.

Buyers searching for a property agent in ${city} on Google won't find you there. A proper website puts you in front of them directly — no OTA cut. I build them for ₹8,000, live in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up property agents in ${city} and *${name}* doesn't come up on Google.

Buyers searching online are going to whoever shows up first. A website gets you there — and every inquiry comes straight to you, no commission to anyone. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    fitness: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's live but I don't think it's pulling in new members from Google search.

Usually a few changes make a real difference for gyms and studios. Happy to take a look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only Instagram came up.

People searching for a gym in ${city} use Google, not just Instagram. A proper website gets you in those results. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up gyms and fitness studios in ${city} — *${name}* doesn't show up on Google.

People searching for a place to work out are signing up wherever comes up first. I build websites for gyms and studios — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    education: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Had a look at *${name}*'s website — it's up, but I don't think parents searching on Google are finding it easily.

A few things usually fix this for coaching institutes. Happy to check properly if you're interested.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

Parents looking for coaching classes in ${city} search on Google, not Instagram. A website gets you on that list. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was searching for coaching institutes in ${city} — *${name}* doesn't show up on Google.

Parents looking for classes are enrolling wherever comes up first. I build websites for coaching institutes — ₹8,000, ready in about a week.

Interested?

Dhyey
${CONTACT}`
        );
    },

    interior: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — the portfolio looks good, but it's not showing up well when people search for interior designers in ${city} on Google.

Happy to look at what's holding it back if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — just Instagram came up, no website.

Clients searching for an interior designer in ${city} on Google won't find your work there. A proper website puts your portfolio in front of them. I build them for ₹8,000, live in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up interior designers in ${city} — *${name}* doesn't come up on Google.

Clients searching online are reaching out to whoever shows up. A website puts your work in front of them directly. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    clothing: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's there, but I don't think it's driving many sales from Google search.

A few changes usually help a lot with this for clothing stores. Let me know if you want me to check.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for clothing stores in ${city} online can't browse or order from a Facebook page easily. A proper website fixes that. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up clothing stores in ${city} — *${name}* doesn't come up on Google.

People searching to buy clothes online in ${city} right now are going to whoever shows up. I build clothing store websites — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    jewellery: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Had a look at *${name}*'s website — it's up, but I don't think buyers searching on Google are finding it.

Happy to check what's going on and see if it's an easy fix.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* — only Facebook came up on Google.

People searching for jewellery in ${city} online want to see the collection before visiting. A website makes that easy. I build them for ₹8,000, ready in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up jewellery shops in ${city} — *${name}* doesn't come up on Google at all.

Buyers searching online are walking into whoever they find first. A website puts your shop on that list. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    manufacturing: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's live but not really showing up when buyers search on Google.

For B2B this can mean missing a lot of inbound orders. Happy to look at it if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

B2B buyers searching for manufacturers in ${city} won't find you there. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up *${name}* in ${city} — no website came up on Google.

Buyers searching for manufacturers online are going to whoever shows up. A website gets you in front of them — I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    immigration: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — it's there, but I don't think it's pulling in client inquiries from Google search.

A few things usually fix this for immigration consultancies. Happy to take a look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for an immigration consultant in ${city} use Google, not social media. A website gets you in front of them. I build them for ₹8,000, live in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up immigration consultants in ${city} — *${name}* doesn't show up on Google.

People searching for visa help are contacting whoever comes up first. I build websites for consultancies — ₹8,000, ready in about a week.

Interested?

Dhyey
${CONTACT}`
        );
    },

    photography: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Had a look at *${name}*'s website — the work looks great, but Google isn't really surfacing it for people searching locally.

Happy to look at what's going on if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only Instagram came up.

Clients searching for a photographer in ${city} on Google can't find your portfolio there. A proper website puts it in front of them. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up photographers in ${city} — *${name}* doesn't come up on Google.

Clients searching for photography right now are booking whoever they find first. I build websites for photographers — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    ca: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's up, but doesn't seem to be showing in local Google results for CA and tax services.

Usually a straightforward fix. Happy to check if you're interested.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

Businesses searching for a CA in ${city} on Google won't find you there. A proper website gets you in front of them. I build them for ₹8,000, ready in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up CA firms in ${city} — *${name}* doesn't come up on Google.

Businesses looking for tax and accounting help are going to whoever they find first. A website gets you on that list. I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    events: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — it's live, but I don't think clients searching for event planners in ${city} are finding it.

A few things usually help with this. Happy to take a look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only Facebook came up.

Clients planning an event in ${city} search on Google first. A proper website shows them your work and gets you the inquiry. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up event planners in ${city} — *${name}* doesn't show up on Google.

Clients planning events are reaching out to whoever they find first. A website puts you in front of them. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    automobile: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's there, but I don't think it's bringing in bookings from Google search.

A few changes usually make a real difference for service centres. Happy to check if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for a car service centre in ${city} on Google won't find you there. A website puts you on that list. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Was looking up car service centres in ${city} — *${name}* doesn't come up on Google.

People searching for a mechanic or service centre online are going to whoever shows up. I build websites for auto businesses — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    hotel: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Had a look at *${name}*'s website — it's live, but guests are probably still finding you through OTAs and you're paying commission every time.

A proper direct booking setup on your own site fixes that. Happy to look into it.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a Facebook page came up.

Guests looking for a hotel in ${city} can't book directly with you — they go to MakeMyTrip or OYO instead and you lose a cut on every booking. A proper website sorts that out. I build them for ₹8,000, up in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up hotels in ${city} — *${name}* doesn't come up on Google directly.

Guests searching online end up booking through OTAs and you pay commission on every stay. A website lets them book directly with you. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    pharmacy: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Checked *${name}*'s website — it's there, but I don't think it's pulling orders from Google.

A few changes usually help a lot with this. Happy to take a proper look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only a social media page came up.

People ordering medicines online in ${city} use apps like PharmEasy and you pay commission every time. A proper website lets them order directly from you. I build them for ₹8,000, up in a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up *${name}* in ${city} — no website came up.

People ordering medicines online go to PharmEasy or 1mg by default — and you pay commission on every order. A website lets them order straight from you. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    generic: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
            `Hi —

Looked at *${name}*'s website — it's up, but I don't think it's bringing in inquiries from Google.

Usually a few straightforward changes help a lot. Happy to take a look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
            `Hi —

Searched for *${name}* on Google — only social media came up.

Customers searching on Google can't find you there. A proper website puts you in front of them. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
            `Hi —

Looked up *${name}* in ${city} — no website came up on Google.

Customers searching online right now are going to whoever shows up. I build local business websites — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    beauty: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Checked *${name}*'s website — it's up, but I don't think it's pulling in bookings from Google search.

People searching for salons and parlours in ${city} usually just call whoever comes up first. Happy to take a look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only Instagram came up.

Most clients search Google when they want to book a salon or spa — Instagram is for discovery, not bookings. A website gets you on that list. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Was looking up salons in ${city} — *${name}* doesn't come up on Google.

People searching for a parlour or spa nearby are just calling whoever shows up. I build websites for salons — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    legal: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Looked at *${name}*'s website — it's live, but I don't think clients searching on Google are finding it easily.

People looking for a lawyer usually go with whoever comes up first. Happy to take a look if you're interested.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for an advocate in ${city} use Google, not social media. A proper website gets you in front of them. I build them for ₹8,000, live in a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Was looking up advocates in ${city} — *${name}* doesn't come up on Google.

Clients searching for legal help online contact whoever shows up first. A website gets you on that list. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    diagnostic: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Checked *${name}*'s website — it's there, but I don't think it's showing up when people search for labs in ${city} on Google.

Patients booking blood tests or scans usually go with whoever they find first. Happy to look at what's holding it back.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

Patients searching for a diagnostic lab in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Looked up diagnostic labs in ${city} — *${name}* doesn't come up on Google.

Patients booking blood tests or scans online go to whoever they find first. A website puts you on that list. I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    logistics: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Had a look at *${name}*'s website — it's up, but I don't think it's generating inquiries from Google.

People searching for packers and movers usually call whoever comes up first. Happy to take a look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for movers or transport in ${city} use Google, not Facebook. A proper website gets you in front of them. I build them for ₹8,000, live in a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Looked up packers and movers in ${city} — *${name}* doesn't come up on Google.

People searching for transport or moving services just call whoever shows up first. I build websites for logistics businesses — ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    printing: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Checked *${name}*'s website — it's live, but I don't think it's pulling in orders from Google search.

Businesses searching for printing shops usually just go with whoever shows up first. Happy to take a look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

Clients searching for a printing press in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Looked up printing shops in ${city} — *${name}* doesn't come up on Google.

Businesses searching for flex or digital printing just go with whoever shows up first. A website puts you on that list. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    financial: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Looked at *${name}*'s website — it's there, but I don't think it's generating client inquiries from Google.

People searching for insurance or investment advice usually go with whoever they find first. Happy to check what's going on.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for a financial advisor in ${city} use Google. A website gets you in front of them directly. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Was looking up financial advisors in ${city} — *${name}* doesn't show up on Google.

Clients searching for investment or insurance help go to whoever comes up first. A website gets you on that list. I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    hospital: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Checked *${name}*'s website — it's up, but I don't think patients searching on Google are easily finding it.

A few changes usually make a real difference for nursing homes and hospitals. Happy to take a proper look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

Patients searching for a hospital or nursing home in ${city} use Google. A proper website gets you in those results. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Looked up hospitals and nursing homes in ${city} — *${name}* doesn't come up on Google.

Patients searching online for medical care go to whoever shows up first. A website gets you on that list. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    wedding_venue: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Had a look at *${name}*'s website — it's live, but I don't think couples searching for venues in ${city} are finding it.

A few things usually fix this for banquet halls and marriage venues. Happy to take a look.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only Facebook came up.

Couples searching for a wedding or party venue in ${city} use Google. A proper website puts your hall in front of them directly. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Was looking up banquet halls in ${city} — *${name}* doesn't come up on Google.

Couples planning weddings search online and book whoever they find first. A website puts your venue on that list. I build them for ₹8,000, ready in about a week.

Dhyey
${CONTACT}`
        );
    },

    travel: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Checked *${name}*'s website — it's there, but I don't think it's pulling in inquiries from Google.

People searching for travel packages usually book with whoever they find first. Happy to look into it.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for a travel agent in ${city} use Google. A proper website gets you in front of them. I build them for ₹8,000, live in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Looked up travel agencies in ${city} — *${name}* doesn't come up on Google.

People searching for holiday packages or tours just book with whoever shows up. A website gets you there. I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },

    electronics: (name, hasWebsite, socialOnly, city = "Ahmedabad") => {
        if (hasWebsite) return (
`Hi —

Looked at *${name}*'s website — it's up, but I don't think it's bringing in customers from Google search.

People searching for mobile or laptop repair in ${city} call whoever they find first. Happy to take a look if you want.

Dhyey
${CONTACT}`
        );
        if (socialOnly) return (
`Hi —

Searched for *${name}* on Google — only a social media page came up.

People searching for phone or laptop repair in ${city} use Google, not Instagram. A proper website gets you in front of them. I build them for ₹8,000, up in about a week.

Dhyey
${CONTACT}`
        );
        return (
`Hi —

Was looking up mobile and laptop repair shops in ${city} — *${name}* doesn't come up on Google.

People searching for a repair shop just go to whoever shows up first. A website puts you on that list. I build them for ₹8,000, done in about a week.

Dhyey
${CONTACT}`
        );
    },
};
// Stage 2 — don't say "following up". Ask a fresh question they WANT to answer.
// Their natural instinct is to explain how their business works — that opens the door.
const STAGE2 = {
    dental: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question, genuinely curious — are most of your new patients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    clinic: (name) =>
        `Hi *${name}* —\n\n` +
        `Out of curiosity — right now, how are most new patients finding your clinic? Referrals, walk-ins, or online?\n\n` +
        `— Dhyey (${CONTACT})`,

    restaurant: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are you currently getting online orders or mostly walk-in customers?\n\n` +
        `— Dhyey (${CONTACT})`,

    realestate: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your buyer inquiries coming through referrals, or also from Google and social media?\n\n` +
        `— Dhyey (${CONTACT})`,

    fitness: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are new members mostly finding you through word of mouth, or also through Google and Instagram?\n\n` +
        `— Dhyey (${CONTACT})`,

    education: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most student inquiries coming through referrals, or are some parents finding you on Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    interior: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your project leads coming through referrals, or are clients also finding you online?\n\n` +
        `— Dhyey (${CONTACT})`,

    clothing: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers walk-ins, or are some ordering through WhatsApp or Instagram?\n\n` +
        `— Dhyey (${CONTACT})`,

    jewellery: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most customers coming to your shop directly, or are some also reaching out through WhatsApp or Instagram?\n\n` +
        `— Dhyey (${CONTACT})`,

    manufacturing: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your B2B inquiries coming through existing contacts and referrals, or also from online?\n\n` +
        `— Dhyey (${CONTACT})`,

    immigration: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your clients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    photography: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your bookings coming through referrals, or are some clients also finding you through Google or Instagram?\n\n` +
        `— Dhyey (${CONTACT})`,

    ca: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    events: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most event enquiries coming through referrals, or are some clients also finding you online?\n\n` +
        `— Dhyey (${CONTACT})`,

    automobile: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most customers coming through word of mouth, or are some also finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    hotel: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your bookings coming through OTAs like MakeMyTrip, or do you also get direct bookings?\n\n` +
        `— Dhyey (${CONTACT})`,

    pharmacy: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers walk-ins, or are some also ordering through WhatsApp?\n\n` +
        `— Dhyey (${CONTACT})`,

    beauty: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your bookings coming through walk-ins and referrals, or are some clients also finding you on Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    legal: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    diagnostic: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most patients booking through a doctor's referral, or are some finding and calling you directly?\n\n` +
        `— Dhyey (${CONTACT})`,

    logistics: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your bookings coming through referrals, or are some customers also finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    printing: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your orders coming from existing clients, or are some businesses also finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    financial: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most of your clients coming through referrals, or are some finding you through Google or LinkedIn?\n\n` +
        `— Dhyey (${CONTACT})`,

    hospital: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most patients coming through referrals and walk-ins, or are some also finding you online?\n\n` +
        `— Dhyey (${CONTACT})`,

    wedding_venue: (name) =>
        `Hi *${name}* —\n\n` +
        `Genuine question — are most bookings coming through referrals, or are some couples also finding you through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    travel: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your clients coming through referrals, or are some also finding your agency through Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    electronics: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most customers finding you through word of mouth, or are some also finding you on Google?\n\n` +
        `— Dhyey (${CONTACT})`,

    generic: (name) =>
        `Hi *${name}* —\n\n` +
        `Quick question — are most of your customers coming through referrals and word of mouth, or also through Google?\n\n` +
        `— Dhyey (${CONTACT})`,
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

function isSocialUrl(url) {
    return url && /facebook\.com|fb\.com|fb\.me|instagram\.com/i.test(url);
}

function buildMessage(lead) {
    const name = lead.title || lead.name || 'there';
    const industry = detectIndustry(lead);
    const socialOnly = isSocialUrl(lead.website);
    const hasWebsite = !!(lead.website) && !socialOnly;
    const templates = IS_FOLLOWUP ? STAGE2 : STAGE1;
    const fn = templates[industry] || templates.generic;

    // Use real website issues if analyze.js has been run for this lead
    if (!IS_FOLLOWUP && hasWebsite && lead._analysis && lead._analysis.issues && lead._analysis.issues.length > 0) {
        return buildAnalysisMessage(name, lead._analysis.issues);
    }

    const cityLabel = CITY ? CITY.charAt(0).toUpperCase() + CITY.slice(1) : 'Ahmedabad';
    return fn(name, hasWebsite, socialOnly, cityLabel);
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
