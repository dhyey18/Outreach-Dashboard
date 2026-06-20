require('dotenv').config();
const SerpApi = require("google-search-results-nodejs");
const fs = require("fs");
const path = require("path");

const apikey = process.env.SERPAPI_KEY;
if (!apikey) { console.error('❌  SERPAPI_KEY not set. Add it to your .env file.'); process.exit(1); }
const search = new SerpApi.GoogleSearch(apikey);

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
//  node googlesearch.js                        → all industries, Ahmedabad, skip existing
//  node googlesearch.js --city=vadodara        → all industries for Vadodara
//  node googlesearch.js --industry=dental      → only dental
//  node googlesearch.js --force                → re-fetch even if file exists
// ─────────────────────────────────────────────
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const industryArg = args.find(a => a.startsWith('--industry='));
const cityArg     = args.find(a => a.startsWith('--city='));
const ONLY_INDUSTRY = industryArg ? industryArg.split('=')[1] : null;
const CITY = cityArg ? cityArg.split('=')[1].charAt(0).toUpperCase() + cityArg.split('=')[1].slice(1) : 'Ahmedabad';
const LEADS_DIR = cityArg ? `./leads/${cityArg.split('=')[1].toLowerCase()}` : './leads';

// ─────────────────────────────────────────────
//  QUERIES PER INDUSTRY
//  Each query hits Google Maps. Kept focused to avoid overlap.
//  Matches detectIndustry() in whatsapp.js
// ─────────────────────────────────────────────
const INDUSTRIES = {
    dental: [
        "dental clinic " + CITY,
        "dentist " + CITY,
    ],
    clinic: [
        "general physician " + CITY,
        "dermatologist " + CITY,
        "gynaecologist " + CITY,
        "paediatrician " + CITY,
        "orthopedic doctor " + CITY,
        "eye clinic " + CITY,
        "multispeciality clinic " + CITY,
        "physiotherapy clinic " + CITY,
        "ayurvedic clinic " + CITY,
    ],
    restaurant: [
        "restaurant " + CITY,
        "cafe " + CITY,
        "dhaba " + CITY,
        "bakery " + CITY,
        "caterer " + CITY,
    ],
    realestate: [
        "real estate agent " + CITY,
        "property dealer " + CITY,
        "builder " + CITY,
        "apartment developer " + CITY,
    ],
    fitness: [
        "gym " + CITY,
        "yoga studio " + CITY,
        "fitness center " + CITY,
    ],
    education: [
        "coaching class " + CITY,
        "education institute " + CITY,
        "tutor " + CITY,
    ],
    interior: [
        "interior designer " + CITY,
        "architect " + CITY,
        "home renovation " + CITY,
    ],
    clothing: [
        "clothing store " + CITY,
        "boutique " + CITY,
        "saree shop " + CITY,
        "garment shop " + CITY,
    ],
    jewellery: [
        "jewellery shop " + CITY,
        "gold jewellery " + CITY,
        "diamond jewellery " + CITY,
    ],
    manufacturing: [
        "manufacturer " + CITY,
        "engineering company " + CITY,
        "fabrication " + CITY,
    ],
    immigration: [
        "immigration consultant " + CITY,
        "visa consultant " + CITY,
        "tour operator " + CITY,
    ],
    photography: [
        "wedding photographer " + CITY,
        "portrait studio " + CITY,
        "videographer " + CITY,
        "event photographer " + CITY,
    ],
    ca: [
        "chartered accountant " + CITY,
        "tax consultant " + CITY,
        "GST consultant " + CITY,
        "auditor " + CITY,
        "accounting firm " + CITY,
    ],
    events: [
        "wedding planner " + CITY,
        "event organiser " + CITY,
        "event decorator " + CITY,
        "wedding decorator " + CITY,
        "party organiser " + CITY,
    ],
    automobile: [
        "car service center " + CITY,
        "car dealer " + CITY,
        "auto repair " + CITY,
        "car detailing " + CITY,
        "bike service center " + CITY,
    ],
    hotel: [
        "hotel " + CITY,
        "guest house " + CITY,
        "service apartment " + CITY,
        "lodge " + CITY,
    ],
    pharmacy: [
        "medical store " + CITY,
        "chemist " + CITY,
        "pharmacy " + CITY,
        "drug store " + CITY,
    ],
    beauty: [
        "beauty parlour " + CITY,
        "salon " + CITY,
        "spa " + CITY,
        "nail art studio " + CITY,
        "makeup artist " + CITY,
    ],
    legal: [
        "advocate " + CITY,
        "lawyer " + CITY,
        "law firm " + CITY,
        "legal consultant " + CITY,
    ],
    diagnostic: [
        "pathology lab " + CITY,
        "diagnostic centre " + CITY,
        "blood test lab " + CITY,
        "radiology centre " + CITY,
    ],
    logistics: [
        "packers and movers " + CITY,
        "courier service " + CITY,
        "transport company " + CITY,
        "cargo service " + CITY,
    ],
    printing: [
        "printing press " + CITY,
        "flex printing " + CITY,
        "digital printing " + CITY,
        "visiting card printing " + CITY,
    ],
    financial: [
        "insurance agent " + CITY,
        "mutual fund advisor " + CITY,
        "financial advisor " + CITY,
        "loan agent " + CITY,
    ],
    hospital: [
        "nursing home " + CITY,
        "hospital " + CITY,
        "surgical centre " + CITY,
        "maternity hospital " + CITY,
    ],
    wedding_venue: [
        "marriage hall " + CITY,
        "banquet hall " + CITY,
        "wedding venue " + CITY,
        "party hall " + CITY,
    ],
    travel: [
        "tour and travel " + CITY,
        "travel agency " + CITY,
        "holiday package " + CITY,
    ],
    electronics: [
        "mobile repair shop " + CITY,
        "laptop repair " + CITY,
        "electronics store " + CITY,
        "computer repair " + CITY,
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
