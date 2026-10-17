import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

// ─ RSS Parser ─
function parseRSS(xml, limit) {
  const items = [];
  const blocks = [...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []), ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [])];
  for (const block of blocks.slice(0, limit * 2)) {
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
  return items.slice(0, limit);
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
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News', limit: 30 },
  { url: 'https://thehackernews.com/feeds/posts/default', source: 'THN Atom', limit: 20 },
  { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', source: 'CISA', limit: 20 },
  { url: 'https://www.bleepingcomputer.com/feed/', source: 'BleepingComputer', limit: 25 },
];

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
  const results = await Promise.allSettled(RSS_SOURCES.map(async rs => {
    const res = await fetch(rs.url, { headers: { 'User-Agent': 'FoxTerm-Security-Bot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRSS(xml, rs.limit).map(e => ({ ...e, source: rs.source }));
  }));
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return filterItems(all);
}

async function collectHN(limit = 50) {
  try {
    const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json').then(r => r.json());
    const items = await Promise.all(ids.slice(0, limit).map(async id => {
      const item = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json());
      if (item.type !== 'story') return null;
      return {
        id: `hn_${id}`,
        source: 'Hacker News',
        title: item.title || '',
        url: item.url || `https://news.ycombinator.com/item?id=${id}`,
        score: item.score || 0,
        publishedAt: new Date(item.time * 1000).toISOString(),
        description: '',
      };
    }));
    return filterItems(items.filter(Boolean));
  } catch { return []; }
}

async function collectGitHub(limit = 20) {
  try {
    const data = await fetch(`https://api.github.com/advisories?per_page=${limit}&sort=updated&direction=desc`).then(r => r.json());
    return filterItems(data.map((adv, i) => ({
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

function generateReportMarkdown(items) {
  const title = '# FoxTerm Security Intel Daily';
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
      body += `- [${item.title}](${item.url})${summary}\n`;
    }
    body += '\n';
  }

  const footer = `---\n\n*Total ${items.length} security intelligence items, auto-collected by FoxTerm*\n`;

  return header + body + footer;
}

// ── Main Pipeline ──
async function main() {
  console.log('=== FoxTerm Security Intelligence Generator ===');
  console.log('Mode: Template-based (English only)');
  console.log('');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const libPath = path.join(DATA_DIR, 'library.json');
  let library = [];
  if (fs.existsSync(libPath)) {
    try { library = JSON.parse(fs.readFileSync(libPath, 'utf-8')); } catch {}
  }

  console.log('[1/2] Collecting sources...');
  const [rss, hn, gh] = await Promise.all([collectRSS(), collectHN(50), collectGitHub(20)]);
  const candidates = [...rss, ...hn, ...gh];
  console.log(`  RSS=${rss.length}, HN=${hn.length}, GH=${gh.length}, Total=${candidates.length}`);

  if (!candidates.length) {
    console.log('  No items collected.');
    const empty = {
      runId: `run_${Date.now()}`, status: 'success', trigger: 'schedule',
      generatedAt: new Date().toISOString(), itemCount: 0, newItemCount: 0,
      summary: 'No security intelligence collected',
      reportMarkdown: '# FoxTerm Security Intel Daily\n\nNo security intelligence collected.',
      trends: [], items: [],
    };
    fs.writeFileSync(path.join(DATA_DIR, 'latest.json'), JSON.stringify(empty, null, 2));
    return;
  }

  const existingIds = new Set(library.map(i => i.id));
  const items = candidates.map(item => ({
    ...item,
    isNew: !existingIds.has(item.id),
    seenCount: (library.find(e => e.id === item.id)?.seenCount || 0) + 1,
  }));

  console.log('[2/2] Generating report...');
  const markdown = generateReportMarkdown(items);
  console.log(`  Report: ${markdown.length} chars`);

  const grouped = {};
  for (const item of items) {
    const cat = item.category || 'Security Industry';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const trends = Object.entries(grouped).map(([cat, catItems]) => ({
    category: cat,
    summary: catItems.map(i => i.title).join('; '),
    count: catItems.length,
    items: catItems,
  }));

  const report = {
    runId: `run_${Date.now()}`,
    status: 'success',
    trigger: 'schedule',
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    newItemCount: items.filter(i => i.isNew).length,
    summary: `${items.length} security intelligence items`,
    reportMarkdown: markdown,
    trends,
    items,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  console.log(`\nSaved: data/latest.json`);

  for (const item of items) {
    const existing = library.find(e => e.id === item.id);
    if (existing) { existing.seenCount = (existing.seenCount || 1) + 1; existing.lastSeenAt = new Date().toISOString(); }
    else { library.push({ ...item, firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }); }
  }
  library = library.slice(-500);
  fs.writeFileSync(libPath, JSON.stringify(library, null, 2));

  const histPath = path.join(DATA_DIR, 'history.json');
  let history = [];
  if (fs.existsSync(histPath)) { try { history = JSON.parse(fs.readFileSync(histPath, 'utf-8')); } catch {} }
  history.unshift({
    runId: report.runId, status: report.status, trigger: report.trigger,
    generatedAt: report.generatedAt, itemCount: report.itemCount, newItemCount: report.newItemCount,
    summary: report.summary,
  });
  fs.writeFileSync(histPath, JSON.stringify(history.slice(0, 30), null, 2));

  console.log(`Library: ${library.length} items, History: ${history.length} entries`);
  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
