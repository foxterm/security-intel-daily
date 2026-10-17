# FoxTerm Security Intel

> Automated security intelligence — collects from public security sources and generates traceable intelligence reports.

**Category:** Security Intelligence · **Language:** English · **No AI Required**

## Overview

FoxTerm Security Intel automatically collects security intelligence from multiple public sources (The Hacker News, CISA, BleepingComputer, Hacker News, GitHub Advisory) and generates structured reports in Markdown format.

- **Multi-source collection** — RSS feeds, Hacker News API, GitHub Advisory API
- **No AI/LLM required** — template-based report generation, zero API costs
- **Automated updates** — GitHub Actions runs every 12 hours
- **Categorized intelligence** — Vulnerability, Server Security, Network Security, Malware, Cloud & Infra, Data Breach
- **Historical tracking** — cross-run deduplication with seenCount, firstSeenAt, lastSeenAt

## Features

### Data Collection
- **RSS Feeds**: The Hacker News, CISA, BleepingComputer
- **Hacker News**: Top stories via Firebase API
- **GitHub Advisory**: Latest security advisories
- **Keyword filtering**: Security-focused content only (CVE, vulnerability, exploit, malware, etc.)

### Report Generation
- **Template-based**: No LLM API calls, instant generation
- **English-only**: All content in English
- **Markdown format**: Structured by category with item counts
- **Date-based archival**: Reports organized by date in `data/YYYY-MM-DD/report.json`

### Automation
- **Schedule**: GitHub Actions runs every 12 hours
- **Manual trigger**: Can be triggered manually via workflow_dispatch
- **Data-only commits**: Only `data/` files are committed, no build artifacts
- **Date index**: `data/index.json` maintains sorted list of available dates

## Local Development

**Prerequisites:** Node.js ≥ 18, npm or yarn

```bash
# Install dependencies
npm install

# Generate security report
npm run generate

# Build static site
npm run build

# Start dev server
npm run dev
```

## Project Structure

```text
trends-security/
├── scripts/
│   └── generate.js           # Data collection & report generation (no AI)
├── src/                      # Frontend (React + Vite)
│   ├── App.tsx               # Main UI: SecurityFeed, ReportSidebar, Drawer
│   ├── App.module.css        # Orange-red gradient color scheme
│   ├── ReportContext.tsx      # Centralized data management
│   ├── api.ts                # API helpers
│   ├── i18n.tsx              # English-only translations
│   ├── MarkdownReport.tsx    # Markdown renderer
│   ├── reportModel.ts        # Report normalization
│   └── types.ts              # TypeScript type definitions
├── data/
│   ├── index.json            # Sorted array of available dates
│   └── YYYY-MM-DD/
│       └── report.json       # Daily report data
├── .github/
│   └── workflows/
│       └── daily-report.yml  # GitHub Actions workflow
├── index.html                # Entry HTML (English meta tags)
└── package.json
```

## Data Structure

### data/index.json
Simple array of available dates, sorted descending:
```json
["2026-10-18", "2026-10-17", "2026-10-16"]
```

### data/YYYY-MM-DD/report.json
```json
{
  "runId": "run_1234567890",
  "status": "success",
  "generatedAt": "2026-10-18T00:00:00.000Z",
  "itemCount": 40,
  "newItemCount": 5,
  "summary": "40 security intelligence items",
  "reportMarkdown": "# FoxTerm Security Intel\n\n...",
  "trends": [
    {
      "category": "Vulnerability",
      "summary": "Item1; Item2; Item3",
      "count": 3,
      "itemIds": ["id1", "id2", "id3"]
    }
  ],
  "items": [...]
}
```

### Categories
- **Vulnerability**: CVE, exploits, zero-day, patches
- **Server Security**: SSH, VNC, remote access, Linux, nginx, Apache
- **Network Security**: Firewall, DDoS, botnet, intrusion, APT
- **Malware**: Ransomware, phishing, backdoor, rootkit
- **Cloud & Infra**: Docker, Kubernetes, AWS, Azure, GCP
- **Data Breach**: Data leaks, unauthorized access, credentials

## GitHub Actions Workflow

The workflow runs automatically:

1. **Checkout** repository
2. **Generate** security report (collects data, generates markdown)
3. **Commit** data changes (`data/` only)

**Schedule:** Every 12 hours  
**Manual trigger:** Available via `workflow_dispatch`

## Color Scheme

Orange-red gradient:
- Primary: `#ff5e00`
- Dark: `#e03e00`
- Light backgrounds: `#fff7ed`, `#ffedd5`
- Borders: `#fed7aa`, `#ff8000`

## Environment Variables

**No API keys required!** The generator uses only public APIs and RSS feeds.

## Deployment

### Static Site
```bash
npm run build
# Deploy dist/ to any static hosting (Vercel, Netlify, GitHub Pages, etc.)
```

### Automated Data Updates
GitHub Actions automatically commits updated data files every 12 hours. The frontend reads from `data/index.json` to list available dates and `data/YYYY-MM-DD/report.json` for report content.

## Resources

- [FoxTerm](https://foxterm.app) — Server management tools
- [The Hacker News](https://thehackernews.com/) — Security news source
- [CISA](https://www.cisa.gov/) — Cybersecurity advisories
- [BleepingComputer](https://www.bleepingcomputer.com/) — Security news

## License

MIT
