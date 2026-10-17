import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

// ─ RSS Parser ─
function parseRSS(xml) {
  const items = [];
  const blocks = [...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []), ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [])];
  for (const block of blocks) {
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
    const link = block.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim()
      || block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const desc = block.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/i)?.[1]?.trim() || '';
    const date = block.match(/<(?:pubDate|published|updated)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|published|updated)>/i)?.[1]?.trim();
    if (title && link) {
      items.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        link: link.trim(),
        description: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
        pubDate: date,
      });
    }
  }
  return items;
}

// ── Security Keywords ──
const SECURITY_KEYWORDS = [
  'cve', 'vulnerability', 'exploit', 'zero-day', 'zero day', 'ransomware', 'malware',
  'phishing', 'data breach', 'cyberattack', 'cyber security', 'cybersecurity',
  'ssh', 'vnc', 'remote access', 'remote desktop', 'server security', 'linux security',
  'kernel vulnerability', 'privilege escalation', 'buffer overflow', 'sql injection',
  'xss', 'cross-site', 'denial of service', 'ddos', 'botnet', 'backdoor', 'rootkit',
  'patch', 'security update', 'security advisory', 'openssl', 'openssh', 'nginx',
  'apache', 'docker security', 'kubernetes security', 'cloud security', 'network security',
  'firewall', 'intrusion', 'threat', 'apt', 'security research', 'proof of concept',
  'cisa', 'nist', 'mitre', 'cvss',
];

// ── Categories ──
const CATEGORIES = {
  'Vulnerability': ['cve', 'vulnerability', 'zero-day', 'zero day', 'exploit', 'patch', 'cvss'],
  'Server Security': ['ssh', 'vnc', 'remote access', 'remote desktop', 'server', 'linux', 'openssh', 'openssl', 'nginx', 'apache'],
  'Network Security': ['network', 'firewall', 'ddos', 'denial of service', 'botnet', 'intrusion', 'apt'],
  'Malware': ['ransomware', 'malware', 'phishing', 'backdoor', 'rootkit', 'trojan'],
  'Cloud & Infra': ['cloud', 'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'infrastructure', 'devops'],
  'Data Breach': ['data breach', 'data leak', 'exposure', 'unauthorized access', 'credential'],
};

// ── RSS Sources ──
const RSS_SOURCES = [
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News' },
  { url: 'https://thehackernews.com/feeds/posts/default', source: 'THN Atom' },
  { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', source: 'CISA' },
  { url: 'https://www.bleepingcomputer.com/feed/', source: 'BleepingComputer' },
];

// Get last 72 hours range
function getLast72HoursRange() {
  const now = Date.now();
  const start = now - 72 * 60 * 60 * 1000;
  const end = now;
  return { start, end };
}

function getTodayCST() {
  const now = new Date();
  const cstNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cstNow.toISOString().slice(0, 10);
}

function cleanText(v) {
  return String(v || '').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferCategory(item) {
  const text = [item.title, item.description, item.link].join(' ').toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    if (kws.some(k => text.includes(k))) return cat;
  }
  return 'Security Industry';
}

function filterItems(items) {
  const kws = SECURITY_KEYWORDS.map(k => k.toLowerCase());
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const text = [item.title, item.description, item.link].join(' ').toLowerCase();
    if (!kws.some(k => text.includes(k))) continue;
    const key = (item.link || item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const idBase = item.link || item.title;
    const idSuffix = Buffer.from(idBase).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
    result.push({
      id: `item_${idSuffix}`,
      source: item.source,
      title: cleanText(item.title),
      url: item.link,
      score: item.score || 0,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      summary: cleanText(item.description),
      category: inferCategory(item),
    });
  }
  return result;
}

async function collectRSS() {
  const all = [];
  const { start, end } = getLast72HoursRange();
  const results = await Promise.allSettled(RSS_SOURCES.map(async rs => {
    const res = await fetch(rs.url, { headers: { 'User-Agent': 'FoxTerm-Security-Bot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRSS(xml).map(e => ({ ...e, source: rs.source }));
  }));
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const today = r.value.filter(item => {
        if (!item.pubDate) return true;
        const d = new Date(item.pubDate).getTime();
        return !isNaN(d) && d >= start && d < end;
      });
      all.push(...today);
    }
  }
  return filterItems(all);
}

async function collectHN() {
  try {
    const { start, end } = getLast72HoursRange();
    const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json').then(r => r.json());
    const items = await Promise.all(ids.slice(0, 200).map(async id => {
      const item = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json());
      if (item.type !== 'story') return null;
      const pubTime = item.time * 1000;
      if (pubTime < start || pubTime >= end) return null;
      return {
        id: `hn_${id}`,
        source: 'Hacker News',
        title: item.title || '',
        url: item.url || `https://news.ycombinator.com/item?id=${id}`,
        score: item.score || 0,
        publishedAt: new Date(pubTime).toISOString(),
        description: '',
      };
    }));
    return filterItems(items.filter(Boolean));
  } catch { return []; }
}

async function collectGitHub() {
  try {
    const { start, end } = getLast72HoursRange();
    const data = await fetch('https://api.github.com/advisories?per_page=100&sort=updated&direction=desc').then(r => r.json());
    return filterItems(data
      .filter(adv => {
        if (!adv.published_at) return true;
        const d = new Date(adv.published_at).getTime();
        return d >= start && d < end;
      })
      .map((adv, i) => ({
        id: `ghsa_${adv.ghsa_id || i}`,
        source: 'GitHub Advisory',
        title: adv.summary || adv.cve_id || 'Security Advisory',
        link: adv.html_url || `https://github.com/advisories/${adv.ghsa_id}`,
        score: 0,
        publishedAt: adv.published_at || new Date().toISOString(),
        description: adv.description || adv.summary || '',
      })));
  } catch { return []; }
}

// ── Index management ──
function readIndex() {
  const indexPath = path.join(DATA_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (!Array.isArray(data)) return [];
    // Handle both old format (strings) and new format (objects)
    return data.map(item => typeof item === 'string' ? { date: item, count: 0 } : item);
  } catch { return []; }
}

function writeIndex(entries) {
  const sorted = [...new Map(entries.map(e => [e.date, e])).values()]
    .sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(sorted));
  return sorted;
}

// Scan all date directories to build a dedup set of known item IDs
function buildKnownIdsSet() {
  const known = new Set();
  if (!fs.existsSync(DATA_DIR)) return known;
  for (const entry of fs.readdirSync(DATA_DIR)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    const reportPath = path.join(DATA_DIR, entry, 'report.json');
    if (!fs.existsSync(reportPath)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      if (Array.isArray(report.items)) {
        for (const item of report.items) {
          if (item.id) known.add(item.id);
        }
      }
    } catch {}
  }
  return known;
}

// Load existing report for today (if any) to merge new items into it
function loadExistingReport(date) {
  const reportPath = path.join(DATA_DIR, date, 'report.json');
  if (!fs.existsSync(reportPath)) return null;
  try { return JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch { return null; }
}

function generateReportMarkdown(items) {
  const title = '# FoxTerm Security Intel';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const header = `${title}\n\n**${date}**\n\n---\n\n`;

  const grouped = {};
  for (const item of items) {
    const cat = item.category || 'Security Industry';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  let body = '';
  for (const [cat, catItems] of Object.entries(grouped)) {
    body += `## ${cat} (${catItems.length})\n\n`;
    for (const item of catItems) {
      const summary = item.summary ? ` — ${item.summary.slice(0, 150)}` : '';
      if (item.url) {
        body += `- [${item.title}](${item.url})${summary}\n`;
      } else {
        body += `- **${item.title}**${summary}\n`;
      }
    }
    body += '\n';
  }

  const footer = `---\n\n*Total ${items.length} security intelligence items, auto-collected by FoxTerm*\n`;
  return header + body + footer;
}

// ── Main Pipeline ──
async function main() {
  console.log('=== FoxTerm Security Intelligence Generator ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const today = getTodayCST();
  console.log(`[1/3] Collecting sources for last 72 hours (archive: ${today})...`);
  const [rss, hn, gh] = await Promise.all([collectRSS(), collectHN(), collectGitHub()]);
  const candidates = [...rss, ...hn, ...gh];
  console.log(`  RSS=${rss.length}, HN=${hn.length}, GH=${gh.length}, Total=${candidates.length}`);

  // Build dedup set from ALL existing date reports
  const knownIds = buildKnownIdsSet();
  console.log(`  Known items across all dates: ${knownIds.size}`);

  // Load existing report for today to merge
  const existingReport = loadExistingReport(today);
  const existingItems = existingReport?.items || [];
  const existingById = new Map(existingItems.map(i => [i.id, i]));
  console.log(`  Existing items for ${today}: ${existingItems.length}`);

  if (!candidates.length && !existingItems.length) {
    console.log('  No items collected.');
    const dateDir = path.join(DATA_DIR, today);
    if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
    const empty = {
      runId: `run_${Date.now()}`, status: 'success', trigger: 'schedule',
      generatedAt: new Date().toISOString(), itemCount: 0, newItemCount: 0,
      summary: 'No security intelligence collected',
      reportMarkdown: '# FoxTerm Security Intel\n\nNo security intelligence collected.',
      trends: [], items: [],
    };
    fs.writeFileSync(path.join(dateDir, 'report.json'), JSON.stringify(empty));

    // Update index
    const entries = readIndex();
    const existing = entries.find(e => e.date === today);
    if (!existing) entries.push({ date: today, count: 0 });
    writeIndex(entries);
    console.log(`Saved: data/${today}/report.json (empty)`);
    return;
  }

  // Merge: keep existing items, add new ones
  let newCount = 0;
  const now = new Date().toISOString();
  for (const item of candidates) {
    if (!existingById.has(item.id)) {
      existingById.set(item.id, { ...item, firstSeenAt: now, lastSeenAt: now, seenCount: 1 });
      newCount++;
    } else {
      const existing = existingById.get(item.id);
      existingById.set(item.id, { ...existing, lastSeenAt: now, seenCount: (existing.seenCount || 0) + 1 });
    }
  }

  const allItems = Array.from(existingById.values())
    .map(item => ({ ...item, summary: (item.summary || '').slice(0, 500) }));

  console.log(`[2/3] Merged: ${allItems.length} total, ${newCount} new items`);

  console.log('[3/3] Generating report...');
  const markdown = generateReportMarkdown(allItems);
  console.log(`  Report: ${markdown.length} chars`);

  const grouped = {};
  for (const item of allItems) {
    const cat = item.category || 'Security Industry';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const trends = Object.entries(grouped).map(([cat, catItems]) => ({
    category: cat,
    summary: catItems.map(i => i.title).join('; '),
    count: catItems.length,
    itemIds: catItems.map(i => i.id),
  }));

  const report = {
    runId: `run_${Date.now()}`,
    status: 'success',
    trigger: 'schedule',
    generatedAt: new Date().toISOString(),
    itemCount: allItems.length,
    newItemCount: newCount,
    summary: `${allItems.length} security intelligence items`,
    reportMarkdown: markdown,
    trends,
    items: allItems,
  };

  // Save to date directory
  const dateDir = path.join(DATA_DIR, today);
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
  fs.writeFileSync(path.join(dateDir, 'report.json'), JSON.stringify(report));
  console.log(`\nSaved: data/${today}/report.json`);

  // Update index.json
  const entries = readIndex();
  const existing = entries.find(e => e.date === today);
  if (existing) {
    existing.count = report.items.length;
  } else {
    entries.push({ date: today, count: report.items.length });
  }
  const sorted = writeIndex(entries);
  console.log(`Updated: data/index.json (${sorted.length} dates)`);

  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
