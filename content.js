// content.js — extracts Claude usage info from the claude.ai DOM and API
// and forwards it to the background service worker.

const SELECTORS = [
  '[data-testid="usage-limit"]',
  '[data-testid="token-count"]',
  '.usage-limit',
  '[class*="UsageLimit"]',
  '[class*="usage-limit"]',
  '[class*="tokenCount"]',
];

const USAGE_PATTERN = /(\d+)\s+of\s+(\d+)\s+message/i;
const RESET_PATTERN = /resets?\s+in\s+([\d]+h?\s*[\d]*m?)/i;

let lastSent = null;
let lastApiFetchTime = 0;
const API_COOLDOWN_MS = 30000;

function parseUsageText(text) {
  const match = text.match(USAGE_PATTERN);
  if (!match) return null;
  const used = Number(match[1]);
  const total = Number(match[2]);
  if (!total) return null;
  return { used, total };
}

function findUsageFromSelectors() {
  for (const selector of SELECTORS) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const text = el.textContent || '';
      const parsed = parseUsageText(text);
      if (parsed) return parsed;
    }
  }
  return null;
}

function findUsageFromTextNodes() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parsed = parseUsageText(node.textContent || '');
    if (parsed) return parsed;
  }
  return null;
}

function findUsageFromInnerText() {
  return parseUsageText(document.body.innerText || '');
}

function findResetText() {
  const match = (document.body.innerText || '').match(RESET_PATTERN);
  return match ? match[1].trim() : null;
}

function formatResetText(resetsAt) {
  if (!resetsAt) return null;
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return '0m';
  const d = Math.floor(diff / (24 * 3600 * 1000));
  const h = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const m = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

async function fetchUsageFromAPI() {
  try {
    const orgsResponse = await fetch('/api/organizations');
    if (!orgsResponse.ok) return null;
    const orgs = await orgsResponse.json();
    if (!orgs || orgs.length === 0) return null;

    const org = orgs[0];
    const orgId = org.uuid;
    const orgName = org.name || 'Claude Limits';

    const usageResponse = await fetch(`/api/organizations/${orgId}/usage`);
    if (!usageResponse.ok) return null;
    const usageData = await usageResponse.json();

    return {
      orgName,
      orgId,
      ...usageData
    };
  } catch (err) {
    console.warn('[Claude Limit Tracker] API fetch failed:', err);
    return null;
  }
}

async function extractUsage(force = false) {
  const now = Date.now();
  let apiSuccess = false;

  if (force || now - lastApiFetchTime > API_COOLDOWN_MS) {
    lastApiFetchTime = now;
    const apiData = await fetchUsageFromAPI();
    if (apiData) {
      apiSuccess = true;
      const maxPct = Math.round(Math.max(
        apiData.five_hour?.utilization || 0,
        apiData.seven_day?.utilization || 0,
        apiData.seven_day_sonnet?.utilization || 0,
        apiData.seven_day_opus?.utilization || 0
      ));
      
      const payload = {
        source: 'api',
        orgName: apiData.orgName,
        orgId: apiData.orgId,
        five_hour: apiData.five_hour,
        seven_day: apiData.seven_day,
        seven_day_sonnet: apiData.seven_day_sonnet,
        seven_day_opus: apiData.seven_day_opus,
        extra_usage: apiData.extra_usage,
        pct: maxPct,
        used: Math.round(apiData.seven_day?.utilization || 0),
        total: 100,
        resetText: formatResetText(apiData.seven_day?.resets_at),
        ts: now
      };

      if (JSON.stringify(payload) !== JSON.stringify(lastSent)) {
        lastSent = payload;
        chrome.runtime.sendMessage({ type: 'USAGE_UPDATE', payload }, () => {
          if (chrome.runtime.lastError) {
            // Background may be asleep
          }
        });
      }
      return;
    }
  }

  // Fallback to DOM scraping if API failed or within cooldown period and API wasn't fetched
  if (!apiSuccess) {
    let usage = findUsageFromSelectors();
    if (!usage) usage = findUsageFromTextNodes();
    if (!usage) usage = findUsageFromInnerText();

    if (!usage) {
      if (lastSent && lastSent.source === 'api') {
        // Don't overwrite rich API data with null DOM data
        return;
      }
      console.warn('[Claude Limit Tracker] Could not find usage info in DOM.');
      return;
    }

    const { used, total } = usage;
    const payload = {
      source: 'dom',
      used,
      total,
      pct: Math.round((used / total) * 100),
      resetText: findResetText(),
      ts: now,
    };

    if (JSON.stringify(payload) !== JSON.stringify(lastSent)) {
      lastSent = payload;
      chrome.runtime.sendMessage({ type: 'USAGE_UPDATE', payload }, () => {
        if (chrome.runtime.lastError) {
          // Background may be asleep
        }
      });
    }
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REQUEST_REFRESH') {
    extractUsage(msg.force || false);
  }
});

const observer = new MutationObserver(() => extractUsage());
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

setInterval(() => extractUsage(false), 30_000);

extractUsage();

