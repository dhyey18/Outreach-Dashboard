# Outreach Dashboard

Automated B2B outreach system for Ahmedabad businesses — scrapes Google Maps leads, analyzes websites, finds LinkedIn founders, and sends personalized WhatsApp messages.

## Scripts

| Script | Purpose |
|---|---|
| `googlesearch.js` | Scrape leads from Google Maps via SerpAPI |
| `whatsapp.js` | Send personalized WhatsApp outreach |
| `analyze.js` | Audit business websites for issues |
| `linkedin.js` | Find founder LinkedIn profiles via Google |
| `build-dashboard.js` | Generate a static `dashboard.html` |
| `dashboard.js` | Serve the dashboard on localhost:4000 |

## Setup

```bash
npm install
cp .env.example .env
# Add your SERPAPI_KEY to .env
```

## Workflow

```bash
# 1. Scrape leads for an industry
node googlesearch.js --industry=dental

# 2. Analyze websites
node analyze.js --industry=dental

# 3. Find LinkedIn profiles
node linkedin.js --industry=dental

# 4. Send WhatsApp outreach
node whatsapp.js --industry=dental

# 5. Check progress
node whatsapp.js --status

# 6. Build dashboard
node build-dashboard.js
```

## Supported Industries

dental · clinic · restaurant · realestate · fitness · education · interior · clothing · jewellery · manufacturing · immigration · photography · ca · events · automobile · hotel · pharmacy

## Environment Variables

| Variable | Description |
|---|---|
| `SERPAPI_KEY` | SerpAPI key for Google Maps & LinkedIn search |

## Notes

- WhatsApp login required on first run (scan QR code)
- SerpAPI free plan has monthly search limits
- Lead data is gitignored — contains real business phone numbers
