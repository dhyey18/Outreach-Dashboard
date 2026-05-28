const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
//  CLI ARGS
//  node analyze.js                    → analyze all industries
//  node analyze.js --industry=dental  → one industry only
//  node analyze.js --force            → re-analyze already-cached leads
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const industryArg = args.find(a => a.startsWith('--industry='));
const ONLY_INDUSTRY = industryArg ? industryArg.split('=')[1] : null;

const LEADS_DIR = './leads';
const CONCURRENCY = 3;   // sites analyzed in parallel
const TIMEOUT_MS = 15000;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function discoverLeadsFiles() {
    if (!fs.existsSync(LEADS_DIR)) return [];
    return fs.readdirSync(LEADS_DIR)
        .filter(f => f.endsWith('_leads.json'))
        .map(f => path.join(LEADS_DIR, f))
        .sort();
}

function analysisFilePath(leadsFile) {
    return leadsFile.replace('_leads.json', '_analysis.json');
}

function loadAnalysis(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return {}; }
}

function saveAnalysis(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function progressBar(done, total) {
    const pct = Math.round((done / total) * 100);
    const filled = Math.round(pct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}%  (${done}/${total})`);
    if (done === total) process.stdout.write('\n');
}

// ─────────────────────────────────────────────
//  SITE ANALYSIS
//  Returns { url, title, issues[], checkedAt }
// ─────────────────────────────────────────────
async function analyzeSite(url) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    const result = { url, title: '', issues: [], checkedAt: new Date().toISOString() };

    try {
        const start = Date.now();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        const loadMs = Date.now() - start;

        result.title = (await page.title()).trim();

        // ── Mobile friendliness ──────────────────────
        const hasViewport = await page.$('meta[name="viewport"]');
        if (!hasViewport) result.issues.push('not mobile-friendly (missing viewport tag)');

        // ── WhatsApp CTA ────────────────────────────
        const hasWhatsApp = await page.$('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="whatsapp"]');
        if (!hasWhatsApp) result.issues.push('no WhatsApp contact button');

        // ── Phone number ─────────────────────────────
        const bodyText = await page.innerText('body').catch(() => '');
        const hasPhone = /(\+91[\s-]?\d{5}[\s-]?\d{5}|\d{10}|\d{5}[\s-]\d{5})/.test(bodyText);
        if (!hasPhone) result.issues.push('no phone number visible on the page');

        // ── Booking / enquiry form ───────────────────
        const hasForm = await page.$('form');
        const hasBookingText = /book\s*now|appointment|enquir|get.?a.?quote|contact.?us|schedule/i.test(bodyText);
        if (!hasForm && !hasBookingText) result.issues.push('no booking or enquiry form');

        // ── Clickable CTAs ───────────────────────────
        const ctaCount = await page.$$eval(
            'a[class*="btn"], button:not([type="hidden"]), a[class*="cta"], [class*="button"]',
            els => els.filter(el => el.offsetParent !== null).length
        ).catch(() => 0);
        if (ctaCount < 1) result.issues.push('no visible call-to-action buttons');

        // ── Page speed ───────────────────────────────
        if (loadMs > 5000) result.issues.push(`slow load time (${(loadMs / 1000).toFixed(1)}s — should be under 3s)`);

        // ── HTTPS ────────────────────────────────────
        if (!url.startsWith('https')) result.issues.push('not on HTTPS (insecure — hurts Google ranking)');

        // ── Google Maps embed ────────────────────────
        const hasMap = await page.$('iframe[src*="google.com/maps"], iframe[src*="maps.google"]');
        if (!hasMap) result.issues.push('no Google Maps embed (customers can\'t find you easily)');

    } catch (err) {
        result.issues.push('website could not be loaded');
        result.loadError = err.message;
    }

    await browser.close();
    return result;
}

// ─────────────────────────────────────────────
//  PROCESS ONE INDUSTRY FILE
// ─────────────────────────────────────────────
async function processIndustry(leadsFile) {
    const industryName = path.basename(leadsFile).replace('_leads.json', '');
    const analysisFile = analysisFilePath(leadsFile);

    let data;
    try { data = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); }
    catch (_) { console.log(`⚠️   Could not read ${leadsFile}`); return; }

    const withWebsite = data.filter(l => l.website && l.phone);
    if (withWebsite.length === 0) {
        console.log(`  ${industryName}: no website leads to analyze — skipping`);
        return;
    }

    const existing = loadAnalysis(analysisFile);
    const toAnalyze = FORCE
        ? withWebsite
        : withWebsite.filter(l => !existing[l.phone]);

    if (toAnalyze.length === 0) {
        console.log(`  ${industryName}: all ${withWebsite.length} website leads already analyzed ✅  (use --force to re-run)`);
        return;
    }

    console.log(`\n📋  [${industryName.toUpperCase()}]  ${toAnalyze.length} to analyze, ${withWebsite.length - toAnalyze.length} cached`);

    let done = 0;
    for (let i = 0; i < toAnalyze.length; i += CONCURRENCY) {
        const batch = toAnalyze.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(lead => analyzeSite(lead.website)));

        for (let j = 0; j < batch.length; j++) {
            existing[batch[j].phone] = results[j];
            done++;
            progressBar(done, toAnalyze.length);
        }

        saveAnalysis(analysisFile, existing); // save after each batch in case of crash
    }

    const withIssues = Object.values(existing).filter(r => r.issues && r.issues.length > 0).length;
    console.log(`  ✅  Saved → ${analysisFile}  (${withIssues}/${withWebsite.length} sites had issues)\n`);
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
(async () => {
    let files = discoverLeadsFiles();

    if (ONLY_INDUSTRY) {
        const target = path.join(LEADS_DIR, `${ONLY_INDUSTRY}_leads.json`);
        if (!files.includes(target)) {
            console.error(`❌  No leads file found for: ${ONLY_INDUSTRY}`);
            console.error(`    Available: ${files.map(f => path.basename(f).replace('_leads.json', '')).join(', ')}`);
            process.exit(1);
        }
        files = [target];
    }

    console.log(`\n🔍  Catalyq Website Analyzer`);
    console.log(`    Checking ${files.length} ${files.length === 1 ? 'industry' : 'industries'} — ${CONCURRENCY} sites at a time\n`);

    for (const file of files) {
        await processIndustry(file);
    }

    console.log(`\n✅  Analysis complete.`);
    console.log(`    Run: node whatsapp.js --industry=<name>  to send personalized outreach\n`);
})();
