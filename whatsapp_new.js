require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
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
        .map(f => path.join(LEADS_DIR, f))
        .sort();
}

const CONFIG = {
    BATCH_SIZE: 20,
    DELAY_BETWEEN_MESSAGES_MS: 25000,
    LEADS_FILE: leadsFileArg
        ? leadsFileArg.replace('--leads=', '')
        : industryArg
        ? path.join(LEADS_DIR, industryArg.replace('--industry=', '') + '_leads.json')
        : null,
};

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD ANALYSIS DATA
// ─────────────────────────────────────────────────────────────────────────────
function loadAnalysis(leadsFile) {
    const analysisFile = leadsFile.replace('_leads.json', '_analysis.json');
    try { return JSON.parse(fs.readFileSync(analysisFile, 'utf8')); }
    catch (_) { return {}; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOAD LEADS
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
//  DETECT INDUSTRY
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
//  MESSAGE TEMPLATES  (SIMPLIFIED)
//
//  Stage 1: Two branches only
//    — No website: Build a website to increase online presence
//    — Has website: Update your website to increase online presence & conversions
//
//  Stage 2: Fresh follow-up question (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const STAGE1 = {
    dental: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's live — but not optimised to convert visitors into appointment bookings.\n\nA focused update brings 15–20 more appointment requests/month from Google.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for *${name}* in Ahmedabad — you don't have a website.\n\nPatients searching online can't find or book with you. A professional dental website brings 10–15 appointment requests/month from Google — no ads needed.\n\nWorth setting up?\n\n— Dhyey`,

    clinic: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for patient conversions.\n\nA focused update brings 8–12 new patient inquiries/month from Google.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for clinics in Ahmedabad — *${name}* doesn't have a website.\n\nPatients researching online can't find you. A simple clinic website brings 8–12 new patient inquiries/month — no ads needed.\n\nWant to know more?\n\n— Dhyey`,

    restaurant: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised for online orders.\n\nAn improved site brings 20–30 extra orders/month from people researching online.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for restaurants in Ahmedabad — *${name}* doesn't have a website or online menu.\n\nPeople research online before choosing where to eat. A website + menu page brings 20–30 extra orders/month.\n\nWorth building one?\n\n— Dhyey`,

    realestate: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised to attract buyer inquiries.\n\nA focused update brings more direct buyer calls from Google.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for property agents in Ahmedabad — *${name}* doesn't have a website.\n\nBuyers search online before calling agents. A professional site brings consistent buyer inquiries without OTA commissions.\n\nWorth building?\n\n— Dhyey`,

    fitness: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's live — but not optimised to convert visitors into memberships.\n\nA focused update brings 15–25 more trial inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for gyms in Ahmedabad — *${name}* doesn't have a website.\n\nPeople researching gyms online want to see pricing, classes, and trial options. A gym website brings 15–25 trial inquiries/month.\n\nWorth setting up?\n\n— Dhyey`,

    education: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for student conversions.\n\nA focused update brings 30–40 more student inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for coaching institutes in Ahmedabad — *${name}* doesn't have a website.\n\nParents and students research online before enrolling. A professional site brings 30–40 student inquiries/month.\n\nWorth building?\n\n— Dhyey`,

    interior: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\n\nA focused update brings more project inquiries.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for interior designers in Ahmedabad — *${name}* doesn't have a website or portfolio.\n\nClients want to see your work before reaching out. A portfolio site brings consistent project inquiries.\n\nWorth creating one?\n\n— Dhyey`,

    clothing: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised for online sales.\n\nAn updated site brings 25–40 more orders/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for clothing stores in Ahmedabad — *${name}* doesn't have a website or catalogue.\n\nCustomers want to browse online. A catalogue + WhatsApp brings 25–40 extra orders/month.\n\nWorth setting up?\n\n— Dhyey`,

    jewellery: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised to attract buyers.\n\nA focused update brings more WhatsApp and in-store inquiries.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for jewellery shops in Ahmedabad — *${name}* doesn't have a website or catalogue.\n\nBuyers want to see designs and prices online. A catalogue brings consistent inquiries.\n\nWorth creating one?\n\n— Dhyey`,

    manufacturing: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised for B2B inquiries.\n\nAn improved site brings more inbound leads.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for manufacturers in Ahmedabad — *${name}* doesn't have a website.\n\nB2B buyers search online before shortlisting vendors. A professional site brings consistent inquiries.\n\nWorth building?\n\n— Dhyey`,

    immigration: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for client conversions.\n\nA focused update brings 15–20 more inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for immigration consultants in Ahmedabad — *${name}* doesn't have a website.\n\nClients want to verify credibility before calling. A professional site brings 15–20 client inquiries/month.\n\nWorth building?\n\n— Dhyey`,

    photography: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\n\nA focused update brings 10–15 more inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for photographers in Ahmedabad — *${name}* doesn't have a website or portfolio.\n\nClients want to see your work before booking. A portfolio site brings 10–15 direct bookings/month.\n\nWorth creating?\n\n— Dhyey`,

    ca: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for client conversions.\n\nA focused update brings 10–15 more inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for CAs and tax consultants in Ahmedabad — *${name}* doesn't have a website.\n\nClients research before hiring. A professional site brings 10–15 client inquiries/month.\n\nWorth building?\n\n— Dhyey`,

    events: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised to showcase work.\n\nA focused update brings more event inquiries.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for event planners in Ahmedabad — *${name}* doesn't have a website or portfolio.\n\nClients want to see your work before booking. A portfolio site brings consistent event inquiries.\n\nWorth creating?\n\n— Dhyey`,

    automobile: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for service bookings.\n\nA focused update brings more service inquiries.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for car service centres in Ahmedabad — *${name}* doesn't have a website.\n\nCustomers search online before visiting. A professional site brings consistent service bookings.\n\nWorth building?\n\n— Dhyey`,

    hotel: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's there — but not optimised for direct bookings.\n\nA focused update reduces OTA dependency.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for hotels in Ahmedabad — *${name}* doesn't have a website.\n\nGuests book online before arriving. A professional site brings direct bookings without OTA commissions.\n\nWorth building?\n\n— Dhyey`,

    pharmacy: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's up — but not optimised for orders.\n\nA focused update brings more WhatsApp orders.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for pharmacies in Ahmedabad — *${name}* doesn't have a website.\n\nCustomers order online now. A site + WhatsApp brings orders without app commissions.\n\nWorth building?\n\n— Dhyey`,

    generic: (name, hasWebsite) => hasWebsite
        ? `Hi —\n\nChecked *${name}*'s website. It's live — but not optimised to convert visitors.\n\nA focused update brings 10–20 more inquiries/month.\n\nWant to know what to improve?\n\n— Dhyey`
        : `Hi —\n\nSearched for *${name}* in Ahmedabad — you don't have a website.\n\nCustomers search online now. A professional site brings 10–20 new inquiries/month.\n\nWorth building?\n\n— Dhyey`,
};

const STAGE2 = {
    dental: (name) => `Hi *${name}* —\n\nQuick question, genuinely curious — are most of your new patients coming through referrals, or are some finding you through Google?\n\n— Dhyey`,
    clinic: (name) => `Hi *${name}* —\n\nOut of curiosity — right now, how are most new patients finding your clinic? Referrals, walk-ins, or online?\n\n— Dhyey`,
    restaurant: (name) => `Hi *${name}* —\n\nQuick question — are you currently getting online orders or mostly walk-in customers?\n\n— Dhyey`,
    realestate: (name) => `Hi *${name}* —\n\nGenuine question — are most of your buyer inquiries coming through referrals, or also from Google and social media?\n\n— Dhyey`,
    fitness: (name) => `Hi *${name}* —\n\nQuick question — are new members mostly finding you through word of mouth, or also through Google and Instagram?\n\n— Dhyey`,
    education: (name) => `Hi *${name}* —\n\nGenuine question — are most student inquiries coming through referrals, or are some parents finding you on Google?\n\n— Dhyey`,
    interior: (name) => `Hi *${name}* —\n\nQuick question — are most of your project leads coming through referrals, or are clients also finding you online?\n\n— Dhyey`,
    clothing: (name) => `Hi *${name}* —\n\nQuick question — are most of your customers walk-ins, or are some ordering through WhatsApp or Instagram?\n\n— Dhyey`,
    jewellery: (name) => `Hi *${name}* —\n\nGenuine question — are most customers coming to your shop directly, or are some also reaching out through WhatsApp or Instagram?\n\n— Dhyey`,
    manufacturing: (name) => `Hi *${name}* —\n\nQuick question — are most of your B2B inquiries coming through existing contacts and referrals, or also from online?\n\n— Dhyey`,
    immigration: (name) => `Hi *${name}* —\n\nGenuine question — are most of your clients coming through referrals, or are some finding you through Google?\n\n— Dhyey`,
    photography: (name) => `Hi *${name}* —\n\nQuick question — are most of your bookings coming through referrals, or are some clients also finding you through Google or Instagram?\n\n— Dhyey`,
    ca: (name) => `Hi *${name}* —\n\nGenuine question — are most of your new clients coming through referrals, or are some finding you through Google?\n\n— Dhyey`,
    events: (name) => `Hi *${name}* —\n\nQuick question — are most event enquiries coming through referrals, or are some clients also finding you online?\n\n— Dhyey`,
    automobile: (name) => `Hi *${name}* —\n\nQuick question — are most customers coming through word of mouth, or are some also finding you through Google?\n\n— Dhyey`,
    hotel: (name) => `Hi *${name}* —\n\nGenuine question — are most of your bookings coming through OTAs like MakeMyTrip, or do you also get direct bookings?\n\n— Dhyey`,
    pharmacy: (name) => `Hi *${name}* —\n\nQuick question — are most of your customers walk-ins, or are some also ordering through WhatsApp?\n\n— Dhyey`,
    generic: (name) => `Hi *${name}* —\n\nQuick question — are most of your customers coming through referrals and word of mouth, or also through Google?\n\n— Dhyey`,
};

function buildMessage(lead) {
    const name = lead.title || lead.name || 'there';
    const industry = detectIndustry(lead);
    const hasWebsite = !!(lead.website);
    const templates = IS_FOLLOWUP ? STAGE2 : STAGE1;
    const fn = templates[industry] || templates.generic;
    return fn(name, hasWebsite);
}

// The rest of the file remains the same...
// Continuing after message templates...

