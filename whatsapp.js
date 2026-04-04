const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

// ─────────────────────────────────────────────
//  RUN MODE
//  node whatsapp.js              → Stage 1 (first contact) for new leads only
//  node whatsapp.js --followup   → Stage 2 (follow-up) for leads sent Stage 1
//  node whatsapp.js --leads clothing_leads.json  → use a specific leads file
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
const IS_FOLLOWUP = args.includes('--followup');
const leadsFileArg = args.find(a => a.startsWith('--leads='));

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const CONFIG = {
    DELAY_BETWEEN_MESSAGES_MS: 25000,  // 25s between sends (safer)
    LEADS_FILE: leadsFileArg ? leadsFileArg.split('=')[1] : 'clinic_leads.json',
    LOG_FILE: 'send_log.json',
    SESSION_DIR: './.wwebjs_auth',
};

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
function loadLeads() {
    let data;
    if (fs.existsSync(CONFIG.LEADS_FILE)) {
        const raw = fs.readFileSync(CONFIG.LEADS_FILE, 'utf8');
        data = JSON.parse(raw);
        console.log(`📋  Loaded ${data.length} leads from ${CONFIG.LEADS_FILE}`);
    } else {
        console.log(`⚠️   ${CONFIG.LEADS_FILE} not found.`);
        return [];
    }

    // Deduplicate
    const seen = new Set();
    const unique = data.filter(lead => {
        if (!lead.phone) return false;
        const key = normaliseRaw(lead.phone);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    console.log(`🔍  ${unique.length} unique leads after dedup (${data.length - unique.length} removed).`);

    const contacted = getContactedPhones();

    if (!IS_FOLLOWUP) {
        // Stage 1: only send to leads never contacted before
        const fresh = unique.filter(l => !contacted.has(normaliseRaw(l.phone)));
        console.log(`📨  ${fresh.length} fresh leads (not contacted before).`);
        return fresh;
    } else {
        // Stage 2: only send to leads that got Stage 1 but NOT Stage 2 yet
        const pending = unique.filter(l => {
            const stage = contacted.get(normaliseRaw(l.phone));
            return stage === 1;
        });
        console.log(`📨  ${pending.length} leads ready for follow-up (got Stage 1, no Stage 2 yet).`);
        return pending;
    }
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
    return 'generic';
}

// ─────────────────────────────────────────────
//  MESSAGE TEMPLATES
//  Rules: short, personal, no links in Stage 1, end with a yes/no question
// ─────────────────────────────────────────────

// Stage 1 — curiosity hook, NO pitch, NO portfolio link
const STAGE1 = {
    dental: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had 2–3 specific ideas to help your clinic get more patient bookings through WhatsApp & Google.\n\n` +
        `Can I share them quickly?\n\n` +
        `— Dhyey`,

    clinic: (name) =>
        `Hi! Is this *${name}*? 🙏\n\n` +
        `I've been working with a few clinics in Ahmedabad and had some ideas that could bring in more patient inquiries for you.\n\n` +
        `Worth a quick look? Can I share?\n\n` +
        `— Dhyey`,

    restaurant: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had a few ideas to help you get more orders and walk-ins through Google and WhatsApp.\n\n` +
        `Can I share them — takes 2 minutes?\n\n` +
        `— Dhyey`,

    realestate: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I work with property agents and builders in Ahmedabad — had some ideas to generate more buyer inquiries online.\n\n` +
        `Can I share them?\n\n` +
        `— Dhyey`,

    fitness: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had a couple of ideas to help your gym/studio get more member inquiries and trial sign-ups online.\n\n` +
        `Worth sharing quickly?\n\n` +
        `— Dhyey`,

    education: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had a few ideas to help you get more student inquiries through Google and WhatsApp.\n\n` +
        `Can I share them quickly?\n\n` +
        `— Dhyey`,

    interior: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had some ideas to help your interior/design studio get better project inquiries online.\n\n` +
        `Can I share?\n\n` +
        `— Dhyey`,

    clothing: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had a few ideas to help your store get more customers through WhatsApp catalogue and Google.\n\n` +
        `Can I share them quickly?\n\n` +
        `— Dhyey`,

    jewellery: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I work with jewellery businesses in Ahmedabad and had some specific ideas to help you get more customers online.\n\n` +
        `Worth sharing?\n\n` +
        `— Dhyey`,

    manufacturing: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had some ideas to help your business generate more B2B inquiries and leads online.\n\n` +
        `Can I share quickly?\n\n` +
        `— Dhyey`,

    immigration: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had a few ideas to help you get more visa/immigration inquiry leads through Google and your website.\n\n` +
        `Can I share?\n\n` +
        `— Dhyey`,

    generic: (name) =>
        `Hi, is this *${name}*? 🙏\n\n` +
        `I had 2–3 specific ideas to help your business get more customers online.\n\n` +
        `Can I share them quickly?\n\n` +
        `— Dhyey`,
};

// Stage 2 — follow-up, reference first message, still short
const STAGE2 = {
    dental: (name) =>
        `Hi *${name}*, just following up on my message from a few days ago 🙏\n\n` +
        `Had some ideas around online appointment booking and Google visibility for your clinic.\n\n` +
        `Didn't want them to go to waste — would you like to hear them?\n\n` +
        `— Dhyey | Catalyq`,

    clinic: (name) =>
        `Hi *${name}*, following up quickly 🙏\n\n` +
        `Had specific ideas for your clinic — more patient inquiries through WhatsApp and Google.\n\n` +
        `5 minutes, worth it?\n\n` +
        `— Dhyey | Catalyq`,

    restaurant: (name) =>
        `Hi *${name}*, just a quick follow-up 🙏\n\n` +
        `Had some ideas to bring more orders and walk-ins for you.\n\n` +
        `Can I share now?\n\n` +
        `— Dhyey | Catalyq`,

    realestate: (name) =>
        `Hi *${name}*, following up 🙏\n\n` +
        `Had ideas to bring you more property buyer/renter inquiries online.\n\n` +
        `Would you like to know?\n\n` +
        `— Dhyey | Catalyq`,

    fitness: (name) =>
        `Hi *${name}*, quick follow-up 🙏\n\n` +
        `Had some ideas for more member sign-ups and trial inquiries online.\n\n` +
        `Can I share?\n\n` +
        `— Dhyey | Catalyq`,

    education: (name) =>
        `Hi *${name}*, just following up 🙏\n\n` +
        `Had ideas for more student inquiries from Google and WhatsApp.\n\n` +
        `Worth 5 minutes?\n\n` +
        `— Dhyey | Catalyq`,

    interior: (name) =>
        `Hi *${name}*, quick follow-up 🙏\n\n` +
        `Had some ideas to bring you better project inquiries online.\n\n` +
        `Can I share?\n\n` +
        `— Dhyey | Catalyq`,

    clothing: (name) =>
        `Hi *${name}*, following up from my earlier message 🙏\n\n` +
        `Had ideas around WhatsApp catalogue and Google to bring more customers to your store.\n\n` +
        `Can I share now?\n\n` +
        `— Dhyey | Catalyq`,

    jewellery: (name) =>
        `Hi *${name}*, quick follow-up 🙏\n\n` +
        `Had specific ideas for your business to attract more customers online.\n\n` +
        `Would you like to hear?\n\n` +
        `— Dhyey | Catalyq`,

    manufacturing: (name) =>
        `Hi *${name}*, following up 🙏\n\n` +
        `Had ideas to help you get more B2B inquiries and leads online.\n\n` +
        `Worth 5 minutes?\n\n` +
        `— Dhyey | Catalyq`,

    immigration: (name) =>
        `Hi *${name}*, quick follow-up 🙏\n\n` +
        `Had ideas around getting more visa/immigration leads through Google.\n\n` +
        `Can I share now?\n\n` +
        `— Dhyey | Catalyq`,

    generic: (name) =>
        `Hi *${name}*, just following up on my earlier message 🙏\n\n` +
        `Had 2–3 specific ideas to bring your business more customers online.\n\n` +
        `Can I share them now?\n\n` +
        `— Dhyey | Catalyq`,
};

function buildMessage(lead) {
    const name = lead.title || lead.name || 'there';
    const industry = detectIndustry(lead);
    const templates = IS_FOLLOWUP ? STAGE2 : STAGE1;
    const fn = templates[industry] || templates.generic;
    return fn(name);
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
async function sendAll(client, leads) {
    const total = leads.length;
    let sent = 0, failed = 0, skipped = 0;
    const stage = IS_FOLLOWUP ? 2 : 1;

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

        if (i < leads.length - 1) {
            await delay(CONFIG.DELAY_BETWEEN_MESSAGES_MS);
        }
    }

    progressBar(total, total);

    console.log('\n──────────────────────────────────────');
    console.log(`  BATCH COMPLETE  (Stage ${stage})`);
    console.log(`  ✅ Sent    : ${sent}`);
    console.log(`  ❌ Failed  : ${failed}`);
    console.log(`  ⏭️  Skipped : ${skipped}`);
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
    const leads = loadLeads();
    if (leads.length === 0) {
        if (IS_FOLLOWUP) {
            console.log('⚠️   No leads are ready for follow-up yet. Run Stage 1 first and wait 2–3 days.');
        } else {
            console.log('⚠️   No new leads found. Add entries to the leads file and restart.');
        }
        process.exit(0);
    }
    await sendAll(client, leads);
});

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
loadExistingLog();
console.log(`🚀  Catalyq Outreach starting … [Mode: Stage ${IS_FOLLOWUP ? 2 : 1} | File: ${CONFIG.LEADS_FILE}]`);
client.initialize();
