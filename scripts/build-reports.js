import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const OUT_DIR = path.join(DIST_DIR, 'reports');
const SITE_URL = 'https://security.foxterm.app';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push('<div class="spacer"></div>'); continue; }
    if (line.startsWith('# ')) { out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('## ')) { out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`); continue; }
    if (line.startsWith('### ')) { out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); continue; }
    if (/^[-*_]{3,}$/.test(line)) { out.push('<hr>'); continue; }
    if (line.startsWith('- ')) { out.push(`<li>${renderInline(line.slice(2))}</li>`); continue; }
    const overviewMatch = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*[：:.]?\s*(.*)$/);
    if (overviewMatch) {
      out.push(`<div class="overview-item"><span class="overview-index">${overviewMatch[1]}</span><div><strong>${escapeHtml(overviewMatch[2])}</strong>${overviewMatch[3] ? `<p>${renderInline(overviewMatch[3])}</p>` : ''}</div></div>`);
      continue;
    }
    const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch && numMatch[2].includes('[')) {
      out.push(`<div class="overview-item"><span class="overview-index">${numMatch[1]}</span><div><p>${renderInline(numMatch[2])}</p></div></div>`);
      continue;
    }
    out.push(`<p>${renderInline(line)}</p>`);
  }
  return out.join('\n');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const SHARED_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.6; }
    .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 24px; border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(18px); background: rgba(255,255,255,0.8); }
    .brandBlock .eyebrow { color: #ff5e00; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 4px; }
    .brandBlock h1 { font-size: clamp(22px, 3vw, 30px); font-weight: 700; letter-spacing: -0.022em; color: #0f172a; margin: 0; line-height: 1.15; }
    .brandBlock .subtitle { color: #475569; font-size: 13px; line-height: 1.55; margin: 6px 0 0; max-width: 620px; }
    .brandBlock .schedule { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 3px 10px; border-radius: 6px; color: #7c3aed; font-size: 12px; font-weight: 700; }
    .brandBlock .schedule svg { width: 12px; height: 12px; }
    .topActions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .topActions a, .theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid #e2e8f0; border-radius: 8px; color: #475569; text-decoration: none; transition: border-color 0.15s, background 0.15s, color 0.15s; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
    .topActions a:hover, .theme-toggle:hover { border-color: #94a3b8; background: #f8fafc; color: #1e293b; }
    .topActions a svg, .theme-toggle svg { width: 16px; height: 16px; }
    .theme-toggle { cursor: pointer; background: #fff; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
    footer { text-align: center; padding: 32px 0 0; color: #94a3b8; font-size: 12px; }
    footer a { color: #ff5e00; text-decoration: none; }
    [data-theme="dark"] body { background: #0f172a; color: #e2e8f0; }
    [data-theme="dark"] .topbar { background: rgba(15,23,42,0.8); border-bottom-color: #1e293b; }
    [data-theme="dark"] .brandBlock h1 { color: #f1f5f9; }
    [data-theme="dark"] .brandBlock .subtitle { color: #94a3b8; }
    [data-theme="dark"] .topActions a, [data-theme="dark"] .theme-toggle { border-color: #334155; background: #1e293b; color: #94a3b8; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
    [data-theme="dark"] .topActions a:hover, [data-theme="dark"] .theme-toggle:hover { border-color: #475569; background: #334155; color: #e2e8f0; }
    [data-theme="dark"] footer { color: #475569; }
    @media (max-width: 640px) {
      .topbar { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px 16px; }
      .brandBlock h1 { font-size: 22px; }
    }
`;

const THEME_SCRIPT = `
<script>
(function(){
  var key = 'foxterm-theme';
  var saved = localStorage.getItem(key);
  var theme = saved || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  window.__theme = theme;
  var moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  function setIcon(t){ var b=document.getElementById('theme-btn'); if(b) b.innerHTML = t==='dark'?sunIcon:moonIcon; }
  window.__toggleTheme = function(){
    var next = window.__theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(key, next);
    window.__theme = next;
    setIcon(next);
  };
  document.addEventListener('DOMContentLoaded', function(){ setIcon(theme); });
})();
</script>`;

function buildTopbar() {
  return `
  <div class="topbar">
    <div class="brandBlock">
      <p class="eyebrow">FoxTerm Security Intel</p>
      <h1>FoxTerm Security Intel Daily</h1>
      <p class="subtitle">Automated aggregation of public security sources into traceable intelligence reports.</p>
      <p class="schedule"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Automated collection every 12 hours</p>
    </div>
    <div class="topActions">
      <a href="/" title="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></a>
      <button class="theme-toggle" id="theme-btn" type="button" onclick="__toggleTheme()" title="Toggle theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <a href="https://foxterm.app" target="_blank" rel="noreferrer" title="FoxTerm">
        <svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M69.189189 0l221.405406 387.459459L0 691.891892z" fill="#FF7700"/><path d="M69.189189 0l442.810811 387.459459h-221.405405z" fill="#FF5500"/><path d="M954.810811 0l69.189189 691.891892-290.594595-304.432433z" fill="#FF8800"/><path d="M954.810811 0l-221.405406 387.459459h-221.405405z" fill="#E63500"/><path d="M290.594595 387.459459h221.405405v636.540541z" fill="#D62B00"/><path d="M512 387.459459h221.405405l290.594595 304.432433-512 332.108108z" fill="#FF5500"/><path d="M290.594595 387.459459L0 691.891892l512 332.108108z" fill="#FF4500"/></svg>
      </a>
      <a href="https://github.com/foxterm" target="_blank" rel="noreferrer" title="GitHub"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg></a>
    </div>
  </div>`;
}

function buildRobotsTxt() {
  return `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml`;
}

function buildReportHtml(date, report) {
  const title = `Security Intel Report — ${date}`;
  const desc = report.summary || `FoxTerm Security Intelligence Report for ${date}. ${report.itemCount} items across ${report.trends?.length || 0} topics.`;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const itemsHtml = report.items.map(item => {
    const ts = item.publishedAt || item.firstSeenAt;
    const isNew = ts && new Date(ts).getTime() >= cutoff;
    return `
      <a class="item-card" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
        <div class="item-main">
          <div class="item-meta">
            <span class="source">${escapeHtml(item.source)}</span>
            <span class="time">${formatTime(item.publishedAt)}</span>
            ${isNew ? '<span class="badge-new">NEW</span>' : ''}
          </div>
          <strong>${escapeHtml(item.title)}</strong>
          ${item.summary ? `<p>${escapeHtml(item.summary.slice(0, 300))}</p>` : ''}
        </div>
        <div class="item-side">
          <span class="category">${escapeHtml(item.category || 'Security')}</span>
        </div>
      </a>`;
  }).join('\n');

  const trendsHtml = (report.trends || []).map(t => `
    <div class="trend-group">
      <h3>${escapeHtml(t.category)} <span class="count">${t.count}</span></h3>
      <p>${escapeHtml(t.summary || '')}</p>
    </div>`).join('\n');

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Report",
    "name": title,
    "datePublished": date,
    "dateModified": report.generatedAt || date,
    "description": desc,
    "publisher": {
      "@type": "Organization",
      "name": "FoxTerm",
      "url": "https://foxterm.app"
    },
    "url": `${SITE_URL}/reports/${date}.html`,
    "inLanguage": "en"
  });

  return `<!doctype html>
<html lang="en">
<head>${THEME_SCRIPT}
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | FoxTerm Security Intel</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/reports/${date}.html" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:url" content="${SITE_URL}/reports/${date}.html" />
  <meta property="og:site_name" content="FoxTerm Security Intel" />
  <meta property="article:published_time" content="${report.generatedAt || date}" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="icon" type="image/png" href="/logo.png" />
  <script type="application/ld+json">${jsonLd}</script>
  <style>${SHARED_STYLES}
    .page-header { margin-bottom: 32px; }
    .page-header h2 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 8px; }
    .page-header .meta { color: #64748b; font-size: 13px; }
    .page-header .meta strong { color: #0f172a; }
    .nav-links { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
    .nav-links a { padding: 6px 14px; border: 1px solid #e2e8f0; border-radius: 8px; text-decoration: none; color: #475569; font-size: 13px; background: #fff; transition: border-color 0.15s; }
    .nav-links a:hover { border-color: #ff5e00; color: #ff5e00; }
    .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
    .section h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.01em; }
    .report-content h2 { margin-top: 24px; margin-bottom: 12px; font-size: 20px; }
    .report-content h3 { margin-top: 18px; margin-bottom: 8px; font-size: 16px; color: #e03e00; }
    .report-content p { margin-bottom: 12px; color: #334155; font-size: 15px; }
    .report-content li { margin-left: 20px; margin-bottom: 6px; color: #334155; }
    .report-content a { color: #2563eb; text-decoration: none; border-bottom: 1px solid rgba(37,99,235,0.28); }
    .report-content strong { color: #0f172a; }
    .report-content hr { border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0; }
    .report-content .spacer { height: 12px; }
    .report-content .overview-item { display: grid; grid-template-columns: 28px 1fr; gap: 12px; margin: 12px 0; padding: 14px; border-left: 3px solid #ff8000; border-radius: 12px; background: #f8fafc; }
    .report-content .overview-index { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; background: #ff5e00; color: #fff; font-weight: 600; font-size: 13px; }
    .trend-group { margin-bottom: 16px; }
    .trend-group h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .trend-group h3 .count { font-size: 12px; color: #64748b; font-weight: 500; }
    .trend-group p { color: #475569; font-size: 13px; }
    .item-card { display: grid; grid-template-columns: 1fr 120px; gap: 16px; padding: 16px 0; border-bottom: 1px solid #e2e8f0; text-decoration: none; color: inherit; transition: background 0.15s; }
    .item-card:last-child { border-bottom: 0; }
    .item-card:hover { background: #f8fafc; margin: 0 -24px; padding-left: 24px; padding-right: 24px; }
    .item-main { min-width: 0; }
    .item-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .item-meta .source { padding: 2px 8px; border-radius: 999px; background: #fff7ed; color: #e03e00; font-weight: 600; font-size: 11px; }
    .item-meta .time { font-variant-numeric: tabular-nums; }
    .badge-new { padding: 2px 7px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; font-weight: 700; }
    .item-card strong { display: block; font-size: 15px; font-weight: 600; line-height: 1.35; margin-bottom: 4px; }
    .item-card p { color: #475569; font-size: 13px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .item-side { display: flex; align-content: start; justify-content: flex-end; }
    .item-side .category { padding: 4px 10px; border-radius: 999px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; height: fit-content; }
    @media (max-width: 640px) {
      .item-card { grid-template-columns: 1fr; }
      .item-side { justify-content: flex-start; }
      .page-header h2 { font-size: 22px; }
    }
    [data-theme="dark"] .page-header .meta { color: #94a3b8; }
    [data-theme="dark"] .page-header .meta strong { color: #e2e8f0; }
    [data-theme="dark"] .nav-links a { border-color: #334155; background: #1e293b; color: #94a3b8; }
    [data-theme="dark"] .nav-links a:hover { border-color: #ff5e00; color: #ff5e00; }
    [data-theme="dark"] .section { background: #1e293b; border-color: #334155; }
    [data-theme="dark"] .section h2 { color: #f1f5f9; }
    [data-theme="dark"] .report-content p { color: #cbd5e1; }
    [data-theme="dark"] .report-content li { color: #cbd5e1; }
    [data-theme="dark"] .report-content a { color: #60a5fa; }
    [data-theme="dark"] .report-content strong { color: #f1f5f9; }
    [data-theme="dark"] .report-content hr { border-color: #334155; }
    [data-theme="dark"] .report-content .overview-item { background: #0f172a; border-left-color: #ff8000; }
    [data-theme="dark"] .trend-group h3 { color: #e2e8f0; }
    [data-theme="dark"] .trend-group h3 .count { color: #94a3b8; }
    [data-theme="dark"] .trend-group p { color: #94a3b8; }
    [data-theme="dark"] .item-card { color: #e2e8f0; }
    [data-theme="dark"] .item-card:hover { background: #1e293b; }
    [data-theme="dark"] .item-card strong { color: #f1f5f9; }
    [data-theme="dark"] .item-card p { color: #94a3b8; }
    [data-theme="dark"] .item-meta { color: #94a3b8; }
    [data-theme="dark"] .item-meta .source { background: #422006; color: #fb923c; }
    [data-theme="dark"] .item-side .category { background: #334155; color: #94a3b8; }
  </style>
</head>
<body>
  ${buildTopbar()}
  <div class="container">
    <div class="page-header">
      <h2>${escapeHtml(title)}</h2>
      <div class="meta">
        Generated <strong>${formatDate(report.generatedAt)}</strong> at ${formatTime(report.generatedAt)}
        &middot; <strong>${report.itemCount}</strong> items
        &middot; <strong>${report.trends?.length || 0}</strong> topics
        ${report.newItemCount != null ? `&middot; <strong>${report.newItemCount}</strong> new` : ''}
      </div>
    </div>

    <nav class="nav-links">
      <a href="/">All Reports</a>
    </nav>

    <div class="section">
      <h2>Executive Summary</h2>
      <div class="report-content">${markdownToHtml(report.reportMarkdown || '')}</div>
    </div>

    ${report.trends?.length ? `
    <div class="section">
      <h2>Trend Topics</h2>
      ${trendsHtml}
    </div>` : ''}

    <div class="section">
      <h2>All Items (${report.itemCount})</h2>
      ${itemsHtml}
    </div>

    <footer>
      <a href="${SITE_URL}">FoxTerm Security Intel</a> &middot; Automated collection every 12 hours<br>
      <span id="copy"></span> <a href="https://foxterm.app" target="_blank" rel="noreferrer">FoxTerm</a>. Security intelligence powered by automated aggregation.
    </footer>
    <script>(function(){var y=new Date().getFullYear(),s=2026;document.getElementById('copy').textContent='\\u00A9 '+(y>s?s+' \\u2013 '+y:s);})();</script>
  </div>
</body>
</html>`;
}

function buildSitemap(dates) {
  const urls = dates.map(d => `  <url>
    <loc>${SITE_URL}/reports/${d}.html</loc>
    <lastmod>${d}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;
}

function buildIndexHtml(dates) {
  const dateCards = dates.map(d => {
    const report = JSON.parse(fs.readFileSync(path.join(DATA_DIR, d, 'report.json'), 'utf8'));
    return `
      <a class="date-card" href="/reports/${d}.html">
        <span class="date">${d}</span>
        <span class="count">${report.itemCount} items</span>
      </a>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>${THEME_SCRIPT}
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Security Intel Reports | FoxTerm</title>
  <meta name="description" content="Browse all FoxTerm Security Intelligence daily reports." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE_URL}/reports/" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="icon" type="image/png" href="/logo.png" />
  <style>${SHARED_STYLES}
    .page-header { margin-bottom: 32px; }
    .page-header h2 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
    .page-header p { color: #475569; font-size: 14px; margin-top: 8px; }
    .grid { display: grid; gap: 10px; }
    .date-card { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; text-decoration: none; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
    .date-card:hover { border-color: #ff5e00; box-shadow: 0 2px 12px rgba(255,94,0,0.1); }
    .date-card .date { font-weight: 600; font-size: 15px; }
    .date-card .count { color: #64748b; font-size: 13px; }
    [data-theme="dark"] .page-header h2 { color: #f1f5f9; }
    [data-theme="dark"] .page-header p { color: #94a3b8; }
    [data-theme="dark"] .date-card { background: #1e293b; border-color: #334155; color: #e2e8f0; }
    [data-theme="dark"] .date-card:hover { border-color: #ff5e00; }
    [data-theme="dark"] .date-card .date { color: #f1f5f9; }
    [data-theme="dark"] .date-card .count { color: #94a3b8; }
  </style>
</head>
<body>
  ${buildTopbar()}
  <div class="container">
    <div class="page-header">
      <h2>All Reports</h2>
      <p>${dates.length} daily reports available</p>
    </div>
    <div class="grid">${dateCards}
    </div>
    <footer>
      <a href="${SITE_URL}">Back to FoxTerm Security Intel</a><br>
      <span id="copy"></span> <a href="https://foxterm.app" target="_blank" rel="noreferrer">FoxTerm</a>. Security intelligence powered by automated aggregation.
    </footer>
    <script>(function(){var y=new Date().getFullYear(),s=2026;document.getElementById('copy').textContent='\\u00A9 '+(y>s?s+' \\u2013 '+y:s);})();</script>
  </div>
</body>
</html>`;
}

// Main
const indexData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const dates = indexData.map(e => e.date);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const date of dates) {
  const reportPath = path.join(DATA_DIR, date, 'report.json');
  if (!fs.existsSync(reportPath)) continue;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const html = buildReportHtml(date, report);
  fs.writeFileSync(path.join(OUT_DIR, `${date}.html`), html, 'utf8');
  console.log(`  ${date}.html (${report.itemCount} items)`);
}

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndexHtml(dates), 'utf8');
console.log(`  index.html (${dates.length} reports)`);

fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), buildSitemap(dates), 'utf8');
console.log(`  sitemap.xml (${dates.length + 1} URLs)`);

fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), buildRobotsTxt(), 'utf8');
console.log('  robots.txt');

console.log(`\nDone. ${dates.length} report pages generated.`);
