require('dotenv').config();
const SerpApi = require("google-search-results-nodejs");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────
//  CLI ARGS
//  node linkedin.js                    → enrich all industries
//  node linkedin.js --industry=dental  → one industry only
//  node linkedin.js --force            → re-search already-found leads
//  node linkedin.js --status           → show enrichment progress
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const IS_STATUS = args.includes('--status');
const industryArg = args.find(a => a.startsWith('--industry='));
const ONLY_INDUSTRY = industryArg ? industryArg.split('=')[1] : null;

const API_KEY = process.env.SERPAPI_KEY;
if (!API_KEY) { console.error('❌  SERPAPI_KEY not set. Add it to your .env file.'); process.exit(1); }
const search = new SerpApi.GoogleSearch(API_KEY);
const LEADS_DIR = "./leads";
const DELAY_MS = 1200; // stay within SerpAPI rate limits

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

function linkedinFilePath(leadsFile) {
    return leadsFile.replace('_leads.json', '_linkedin.json');
}

function loadLinkedin(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return {}; }
}

function saveLinkedin(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// ─────────────────────────────────────────────
//  LINKEDIN SEARCH
//  Searches Google for the founder/owner's
//  LinkedIn profile using site:linkedin.com/in
// ─────────────────────────────────────────────
class QuotaExhaustedError extends Error {}

function searchLinkedIn(businessName, city = 'Ahmedabad') {
    return new Promise((resolve, reject) => {
        const query = `site:linkedin.com/in "${businessName}" founder OR owner OR director OR proprietor ${city}`;

        search.json({
            engine: 'google',
            q: query,
            num: 5,
            hl: 'en',
            gl: 'in',
        }, (result) => {
            if (result && result.error && /run out of searches/i.test(result.error)) {
                return reject(new QuotaExhaustedError(result.error));
            }
            if (!result || !result.organic_results || result.organic_results.length === 0) {
                // Fallback: broader search without quotes
                const fallbackQuery = `site:linkedin.com/in ${businessName} founder OR owner Ahmedabad`;
                search.json({
                    engine: 'google',
                    q: fallbackQuery,
                    num: 5,
                    hl: 'en',
                    gl: 'in',
                }, (fallback) => {
                    if (fallback && fallback.error && /run out of searches/i.test(fallback.error)) {
                        return reject(new QuotaExhaustedError(fallback.error));
                    }
                    resolve(parseLinkedInResults(fallback));
                });
                return;
            }
            resolve(parseLinkedInResults(result));
        });
    });
}

function parseLinkedInResults(result) {
    if (!result || !result.organic_results) return [];

    return result.organic_results
        .filter(r => r.link && r.link.includes('linkedin.com/in/'))
        .map(r => ({
            name: r.title ? r.title.replace(/ - LinkedIn$| \| LinkedIn$/i, '').trim() : '',
            profile_url: r.link,
            snippet: r.snippet || '',
            title: extractTitle(r.snippet || r.title || ''),
        }))
        .slice(0, 3); // top 3 candidates
}

function extractTitle(text) {
    // Try to pull job title from snippet (e.g. "Founder at XYZ | ...")
    const match = text.match(/^([^|•–\n]+(?:founder|owner|director|ceo|proprietor|partner|head)[^|•–\n]*)/i);
    return match ? match[1].trim() : '';
}

// ─────────────────────────────────────────────
//  STATUS REPORT
// ─────────────────────────────────────────────
function printStatus() {
    const files = discoverLeadsFiles();
    console.log(`\n${'─'.repeat(62)}`);
    console.log(`  LINKEDIN ENRICHMENT STATUS`);
    console.log(`${'─'.repeat(62)}`);
    console.log(`  ${'Industry'.padEnd(18)} ${'Total'.padStart(6)} ${'Enriched'.padStart(9)} ${'Found'.padStart(7)} ${'Remaining'.padStart(10)}`);
    console.log(`  ${'─'.repeat(55)}`);

    for (const file of files) {
        const industry = path.basename(file).replace('_leads.json', '');
        let data;
        try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (_) { continue; }

        const withPhone = data.filter(l => l.phone);
        const linkedinFile = linkedinFilePath(file);
        const linkedin = loadLinkedin(linkedinFile);

        const enriched = Object.keys(linkedin).length;
        const found = Object.values(linkedin).filter(v => v.profiles && v.profiles.length > 0).length;
        const remaining = withPhone.length - enriched;

        const bar = remaining === 0 ? '✅ done' : `▶️  ${remaining} left`;
        console.log(`  ${industry.padEnd(18)} ${String(withPhone.length).padStart(6)} ${String(enriched).padStart(9)} ${String(found).padStart(7)} ${String(remaining).padStart(10)}  ${bar}`);
    }
    console.log(`${'─'.repeat(62)}\n`);
}

// ─────────────────────────────────────────────
//  PROCESS ONE INDUSTRY
// ─────────────────────────────────────────────
async function processIndustry(leadsFile) {
    const industryName = path.basename(leadsFile).replace('_leads.json', '');
    const linkedinFile = linkedinFilePath(leadsFile);

    let data;
    try { data = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); }
    catch (_) { console.log(`⚠️   Could not read ${leadsFile}`); return; }

    const leads = data.filter(l => l.phone && (l.title || l.name));
    if (leads.length === 0) {
        console.log(`  ${industryName}: no leads with names — skipping`);
        return;
    }

    const existing = loadLinkedin(linkedinFile);
    const toSearch = FORCE ? leads : leads.filter(l => !existing[l.phone]);

    if (toSearch.length === 0) {
        const found = Object.values(existing).filter(v => v.profiles && v.profiles.length > 0).length;
        console.log(`  ${industryName}: all ${leads.length} leads searched (${found} founders found) ✅`);
        return;
    }

    console.log(`\n📋  [${industryName.toUpperCase()}]  ${toSearch.length} to search, ${leads.length - toSearch.length} cached`);

    let done = 0, found = 0;

    for (const lead of toSearch) {
        const businessName = lead.title || lead.name;
        process.stdout.write(`\r  Searching: ${(businessName).substring(0, 40).padEnd(40)}  (${done + 1}/${toSearch.length})`);

        try {
            const profiles = await searchLinkedIn(businessName);
            existing[lead.phone] = {
                business: businessName,
                profiles,
                searchedAt: new Date().toISOString(),
            };
            if (profiles.length > 0) found++;
        } catch (err) {
            if (err instanceof QuotaExhaustedError) {
                process.stdout.write('\n');
                console.log(`\n⚠️   SerpAPI quota exhausted — progress saved (${done}/${toSearch.length} done).`);
                console.log(`    Upgrade your plan at serpapi.com or wait for monthly reset.`);
                console.log(`    Re-run linkedin.js to continue from where it left off.\n`);
                saveLinkedin(linkedinFile, existing);
                process.exit(0);
            }
            // Non-fatal error — skip this lead
            existing[lead.phone] = { business: businessName, profiles: [], searchedAt: new Date().toISOString(), error: err.message };
        }

        done++;
        saveLinkedin(linkedinFile, existing); // save incrementally
        await delay(DELAY_MS);
    }

    process.stdout.write('\n');
    console.log(`  ✅  ${found}/${toSearch.length} founders found → ${linkedinFile}\n`);
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
if (IS_STATUS) {
    printStatus();
    process.exit(0);
}

(async () => {
    let files = discoverLeadsFiles();

    if (ONLY_INDUSTRY) {
        const target = path.join(LEADS_DIR, `${ONLY_INDUSTRY}_leads.json`);
        if (!files.includes(target)) {
            console.error(`❌  No leads file for: ${ONLY_INDUSTRY}`);
            console.error(`    Available: ${files.map(f => path.basename(f).replace('_leads.json', '')).join(', ')}`);
            process.exit(1);
        }
        files = [target];
    }

    const totalLeads = files.reduce((sum, f) => {
        try { return sum + JSON.parse(fs.readFileSync(f, 'utf8')).filter(l => l.phone).length; }
        catch (_) { return sum; }
    }, 0);

    console.log(`\n🔗  Catalyq LinkedIn Enrichment`);
    console.log(`    ${files.length} ${files.length === 1 ? 'industry' : 'industries'} | ~${totalLeads} leads | ${DELAY_MS / 1000}s between searches\n`);

    for (const file of files) {
        await processIndustry(file);
    }

    console.log(`\n✅  Done. Results saved to leads/*_linkedin.json`);
    console.log(`    Run: node linkedin.js --status  to see enrichment summary\n`);
})();
