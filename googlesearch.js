const SerpApi = require("google-search-results-nodejs");
const fs = require("fs");

const apikey = "07f5579e95c1ba42f62b3dd06395c595369086f34ddf26f5c0dd4a42d3e30166";
const search = new SerpApi.GoogleSearch(apikey);

const queries = [
    "clinic Ahmedabad",
    "doctor Ahmedabad",
    "general physician Ahmedabad",
    "dermatologist Ahmedabad",
    "dentist Ahmedabad",
    "gynaecologist Ahmedabad",
    "paediatrician Ahmedabad",
    "orthopedic doctor Ahmedabad",
    "eye clinic Ahmedabad",
    "multispeciality clinic Ahmedabad"
];

let allResults = [];
const seenIds = new Set();

function dedup(results) {
    return results.filter(r => {
        const key = r.place_id || r.title + '|' + (r.address || '');
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
    });
}

function fetchQuery(queryIndex = 0, start = 0) {
    if (queryIndex >= queries.length) {
        fs.writeFileSync("clinic_leads.json", JSON.stringify(allResults, null, 2));
        console.log(`All leads saved — ${allResults.length} unique results.`);
        return;
    }

    const params = {
        engine: "google_maps",
        q: queries[queryIndex],
        start: start
    };

    search.json(params, (data) => {
        const results = data.local_results || [];

        if (results.length === 0 || start >= 100) { // 5 pages = 0,20,40,60,80
            fetchQuery(queryIndex + 1, 0);
            return;
        }

        allResults = allResults.concat(dedup(results));
        fetchQuery(queryIndex, start + 20);
    });
}

fetchQuery();