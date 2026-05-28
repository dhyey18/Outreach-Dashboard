require('dotenv').config();
const SerpApi = require("google-search-results-nodejs");
const fs = require("fs");
const path = require("path");

const apikey = process.env.SERPAPI_KEY;
if (!apikey) { console.error('❌  SERPAPI_KEY not set. Add it to your .env file.'); process.exit(1); }
const search = new SerpApi.GoogleSearch(apikey);

const LEADS_DIR = "./leads";

// ─────────────────────────────────────────────
//  REQUEST BUDGET CONTROLS
//  MAX_PAGES        — stop paginating a query after this many pages (1 page = 20 results)
//  MIN_FRESH        — stop paginating if fewer than this many NEW unique results came back
//                     (catches queries that overlap heavily with earlier ones)
// ─────────────────────────────────────────────
const MAX_PAGES = 2;     // 2 pages × 20 results = 40 results max per query
const MIN_FRESH = 3;     // stop early if a page yields < 3 new unique leads

// ─────────────────────────────────────────────
//  CLI ARGS
//  node googlesearch.js                   → all industries, skip existing files
//  node googlesearch.js --industry=dental → only dental
//  node googlesearch.js --force           → re-fetch even if file exists
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const industryArg = args.find(a => a.startsWith('--industry='));
const ONLY_INDUSTRY = industryArg ? industryArg.split('=')[1] : null;

// ─────────────────────────────────────────────
//  QUERIES PER INDUSTRY
//  Each query hits Google Maps. Kept focused to avoid overlap.
//  Matches detectIndustry() in whatsapp.js
// ─────────────────────────────────────────────
const INDUSTRIES = {
    dental: [
        "dental clinic Ahmedabad",
        "dentist Ahmedabad",
    ],
    clinic: [
        "general physician Ahmedabad",
        "dermatologist Ahmedabad",
        "gynaecologist Ahmedabad",
        "paediatrician Ahmedabad",
        "orthopedic doctor Ahmedabad",
        "eye clinic Ahmedabad",
        "multispeciality clinic Ahmedabad",
        "physiotherapy clinic Ahmedabad",
        "ayurvedic clinic Ahmedabad",
    ],
    restaurant: [
        "restaurant Ahmedabad",
        "cafe Ahmedabad",
        "dhaba Ahmedabad",
        "bakery Ahmedabad",
        "caterer Ahmedabad",
    ],
    realestate: [
        "real estate agent Ahmedabad",
        "property dealer Ahmedabad",
        "builder Ahmedabad",
        "apartment developer Ahmedabad",
    ],
    fitness: [
        "gym Ahmedabad",
        "yoga studio Ahmedabad",
        "fitness center Ahmedabad",
    ],
    education: [
        "coaching class Ahmedabad",
        "education institute Ahmedabad",
        "tutor Ahmedabad",
    ],
    interior: [
        "interior designer Ahmedabad",
        "architect Ahmedabad",
        "home renovation Ahmedabad",
    ],
    clothing: [
        "clothing store Ahmedabad",
        "boutique Ahmedabad",
        "saree shop Ahmedabad",
        "garment shop Ahmedabad",
    ],
    jewellery: [
        "jewellery shop Ahmedabad",
        "gold jewellery Ahmedabad",
        "diamond jewellery Ahmedabad",
    ],
    manufacturing: [
        "manufacturer Ahmedabad",
        "engineering company Ahmedabad",
        "fabrication Ahmedabad",
    ],
    immigration: [
        "immigration consultant Ahmedabad",
        "visa consultant Ahmedabad",
        "tour operator Ahmedabad",
    ],
    photography: [
        "wedding photographer Ahmedabad",
        "portrait studio Ahmedabad",
        "videographer Ahmedabad",
        "event photographer Ahmedabad",
    ],
    ca: [
        "chartered accountant Ahmedabad",
        "tax consultant Ahmedabad",
        "GST consultant Ahmedabad",
        "auditor Ahmedabad",
        "accounting firm Ahmedabad",
    ],
    events: [
        "wedding planner Ahmedabad",
        "event organiser Ahmedabad",
        "event decorator Ahmedabad",
        "wedding decorator Ahmedabad",
        "party organiser Ahmedabad",
    ],
    automobile: [
        "car service center Ahmedabad",
        "car dealer Ahmedabad",
        "auto repair Ahmedabad",
        "car detailing Ahmedabad",
        "bike service center Ahmedabad",
    ],
    hotel: [
        "hotel Ahmedabad",
        "guest house Ahmedabad",
        "service apartment Ahmedabad",
        "lodge Ahmedabad",
    ],
    pharmacy: [
        "medical store Ahmedabad",
        "chemist Ahmedabad",
        "pharmacy Ahmedabad",
        "drug store Ahmedabad",
    ],
};

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
if (!fs.existsSync(LEADS_DIR)) {
    fs.mkdirSync(LEADS_DIR);
    console.log(`📁  Created ${LEADS_DIR}/ directory`);
}

// ─────────────────────────────────────────────
//  LEAD KEY  (canonical identifier for dedup)
// ─────────────────────────────────────────────
function leadKey(r) {
    return r.place_id || `${r.title}|${r.address || ''}`;
}

// ─────────────────────────────────────────────
//  FETCH ONE INDUSTRY
//  globalSeenIds is shared across all industries so the same
//  business never appears in more than one leads file.
// ─────────────────────────────────────────────
function fetchIndustry(industryName, queries, globalSeenIds) {
    return new Promise((resolve) => {
        let allResults = [];
        let requestsUsed = 0;
        let crossIndustrySkipped = 0;

        function dedup(results) {
            return results.filter(r => {
                const key = leadKey(r);
                if (globalSeenIds.has(key)) {
                    crossIndustrySkipped++;
                    return false;
                }
                globalSeenIds.add(key);
                return true;
            });
        }

        function fetchQuery(queryIndex = 0, pageNum = 1) {
            if (queryIndex >= queries.length) {
                const outFile = path.join(LEADS_DIR, `${industryName}_leads.json`);
                fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2));
                console.log(`  ✅  ${industryName}: ${allResults.length} unique leads (${requestsUsed} requests, ${crossIndustrySkipped} cross-industry dupes removed) → ${outFile}`);
                resolve({ count: allResults.length, requests: requestsUsed });
                return;
            }

            const start = (pageNum - 1) * 20;
            const params = {
                engine: "google_maps",
                q: queries[queryIndex],
                start,
            };

            requestsUsed++;
            search.json(params, (data) => {
                const results = data.local_results || [];
                const fresh = dedup(results);
                allResults = allResults.concat(fresh);

                const label = `"${queries[queryIndex]}" [p${pageNum}]`;

                // Stop paginating this query if:
                //   (a) Google returned no results
                //   (b) hit page cap
                //   (c) too few new unique results (heavy overlap — not worth another request)
                if (results.length === 0 || pageNum >= MAX_PAGES || fresh.length < MIN_FRESH) {
                    const reason = results.length === 0 ? 'empty' : pageNum >= MAX_PAGES ? 'page cap' : 'low fresh';
                    process.stdout.write(`    ${label} → +${fresh.length} unique  [stop: ${reason}]  total: ${allResults.length}\n`);
                    fetchQuery(queryIndex + 1, 1);
                } else {
                    process.stdout.write(`    ${label} → +${fresh.length} unique  total: ${allResults.length}\n`);
                    fetchQuery(queryIndex, pageNum + 1);
                }
            });
        }

        fetchQuery();
    });
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
async function fetchAll() {
    let industryNames = Object.keys(INDUSTRIES);

    // Filter to one industry if --industry= was passed
    if (ONLY_INDUSTRY) {
        if (!INDUSTRIES[ONLY_INDUSTRY]) {
            console.error(`❌  Unknown industry: "${ONLY_INDUSTRY}"`);
            console.error(`    Available: ${Object.keys(INDUSTRIES).join(', ')}`);
            process.exit(1);
        }
        industryNames = [ONLY_INDUSTRY];
    }

    // Separate industries into skip vs fetch
    const toFetch = [];
    const skipped = [];
    for (const name of industryNames) {
        const outFile = path.join(LEADS_DIR, `${name}_leads.json`);
        if (!FORCE && fs.existsSync(outFile)) {
            const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
            skipped.push({ name, count: existing.length });
        } else {
            toFetch.push(name);
        }
    }

    if (skipped.length) {
        console.log(`⏭️   Skipping ${skipped.length} already-fetched industries (use --force to re-fetch):`);
        skipped.forEach(s => console.log(`     • ${s.name}: ${s.count} leads already saved`));
        console.log();
    }

    if (toFetch.length === 0) {
        console.log('✅  All industries already fetched. Nothing to do.\n');
        return;
    }

    // ── Build global seen set from ALL existing lead files (skipped industries).
    //    Industries being fetched fresh are excluded so they get re-populated cleanly.
    //    This ensures no business ever appears in more than one leads file.
    const globalSeenIds = new Set();
    const allKnownFiles = Object.keys(INDUSTRIES).filter(n => !toFetch.includes(n));
    for (const name of allKnownFiles) {
        const outFile = path.join(LEADS_DIR, `${name}_leads.json`);
        if (!fs.existsSync(outFile)) continue;
        const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        for (const r of data) globalSeenIds.add(leadKey(r));
    }
    if (globalSeenIds.size > 0) {
        console.log(`🔒  Loaded ${globalSeenIds.size} existing lead IDs — cross-industry dupes will be removed\n`);
    }

    const maxRequests = toFetch.reduce((s, n) => s + INDUSTRIES[n].length * MAX_PAGES, 0);
    console.log(`🚀  Fetching ${toFetch.length} industries  |  max ${maxRequests} API requests\n`);

    let grandTotal = 0;
    let grandRequests = 0;
    for (const name of toFetch) {
        console.log(`\n📋  [${name.toUpperCase()}]  ${INDUSTRIES[name].length} queries × max ${MAX_PAGES} pages`);
        const { count, requests } = await fetchIndustry(name, INDUSTRIES[name], globalSeenIds);
        grandTotal += count;
        grandRequests += requests;
    }

    console.log(`\n${'─'.repeat(52)}`);
    console.log(`🎉  Done!  ${grandTotal} leads  |  ${grandRequests} requests used`);
    console.log(`${'─'.repeat(52)}\n`);
    if (!ONLY_INDUSTRY) {
        console.log(`Run outreach:  node whatsapp.js --industry=<name>`);
        console.log(`Follow-up:     node whatsapp.js --industry=<name> --followup\n`);
    }
}

fetchAll();
