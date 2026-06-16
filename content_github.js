// content_github.js — scrapes GitHub Copilot data from github.com/settings/* pages

// Plan name patterns — most specific first
const PLAN_PATTERNS = [
  { re: /copilot\s+enterprise/i,          type: 'Enterprise' },
  { re: /copilot\s+for\s+enterprise/i,    type: 'Enterprise' },
  { re: /copilot\s+business/i,            type: 'Business'   },
  { re: /copilot\s+for\s+business/i,      type: 'Business'   },
  { re: /copilot\s+pro/i,                 type: 'Pro'        },
  { re: /copilot\s+individual/i,          type: 'Individual' },
  { re: /copilot\s+for\s+individuals?/i,  type: 'Individual' },
  { re: /github\s+copilot\s+free/i,       type: 'Free'       },
  { re: /copilot\s+free/i,                type: 'Free'       },
];

const BILLING_CONTEXT_RE = /(?:billing|renews?|next\s+payment|current\s+period|resets?\s+on|cycle\s+ends?|paid\s+through)/i;
const DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+\w+\s+\d{4})\b/;

let lastSent = null;
let lastApiFetchTime = 0;
const API_COOLDOWN_MS = 30000;

function stripCommas(s) {
  return Number(String(s).replace(/,/g, ''));
}

// Try GitHub's REST API endpoints (session cookies are sent automatically)
async function fetchCopilotFromAPI() {
  // Primary: /user/copilot — available since 2024, returns plan info
  try {
    const r = await fetch('https://api.github.com/user/copilot', {
      credentials: 'include',
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    });
    if (r.ok) return { source: 'user_copilot', data: await r.json() };
    if (r.status === 401 || r.status === 403) lastApiFetchTime = 0;
  } catch (_) {}

  return null;
}

function parsePlanFromAPI(result) {
  if (!result) return null;
  const { source, data } = result;
  if (!data) return null;

  let type = null;
  let startDate = null;
  let endDate = null;

  if (source === 'user_copilot') {
    // Response shape: { skus, assignee, plan_type, ... }
    const raw = (data.plan_type || data.subscription_type || '').toLowerCase();
    if (raw.includes('enterprise'))          type = 'Enterprise';
    else if (raw.includes('business'))       type = 'Business';
    else if (raw.includes('individual') || raw.includes('for_individuals')) type = 'Individual';
    else if (raw.includes('free'))           type = 'Free';
    else if (raw)                            type = 'Individual'; // unknown paid → assume Individual
    startDate = data.created_at || null;
    endDate   = data.next_billing_date || data.billing_cycle_end || null;
  }

  return type ? { type, startDate, endDate } : null;
}

function detectPlan() {
  const bodyText = document.body.innerText || '';

  // Full plan name patterns in body text
  for (const { re, type } of PLAN_PATTERNS) {
    if (re.test(bodyText)) return type;
  }

  // Check badges, headings, subscription-related elements
  const els = document.querySelectorAll(
    'h1,h2,h3,h4,h5,[class*="plan"],[class*="tier"],[class*="badge"],[class*="label"],[class*="subscription"],[data-testid]'
  );
  for (const el of els) {
    const t = el.textContent || '';
    for (const { re, type } of PLAN_PATTERNS) {
      if (re.test(t)) return type;
    }
  }

  // Copilot present but no full plan name matched — don't guess from sidebar nav keywords
  return null;
}

function detectBillingDates() {
  let startDate = null;
  let endDate   = null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  const billingNodes = [];
  while ((node = walker.nextNode())) {
    const txt = node.textContent || '';
    if (BILLING_CONTEXT_RE.test(txt)) billingNodes.push(txt);
  }

  const dates = [];
  for (const txt of billingNodes) {
    const m = txt.match(DATE_PATTERN);
    if (m) dates.push(m[1]);
  }

  if (dates.length >= 2) {
    try { startDate = new Date(dates[0]).toISOString().slice(0, 10); } catch (_) {}
    try { endDate   = new Date(dates[dates.length - 1]).toISOString().slice(0, 10); } catch (_) {}
  } else if (dates.length === 1) {
    try { endDate = new Date(dates[0]).toISOString().slice(0, 10); } catch (_) {}
  }

  return { startDate, endDate };
}

function detectPct() {
  // Strategy 1: aria progress bars
  for (const bar of document.querySelectorAll('[role="progressbar"],[aria-valuenow]')) {
    const now = parseFloat(bar.getAttribute('aria-valuenow'));
    const max = parseFloat(bar.getAttribute('aria-valuemax') || '100');
    if (!isNaN(now) && max > 0) return Math.min(100, Math.round((now / max) * 100));
  }

  // Strategy 2: "X of Y" count pattern
  const m = (document.body.innerText || '').match(
    /(\d[\d,]*)\s+of\s+(\d[\d,]*)\s*(?:completions?|chat\s+messages?|requests?|prompts?|uses?)?/i
  );
  if (m) {
    const used = stripCommas(m[1]), total = stripCommas(m[2]);
    if (total > 0) return Math.min(100, Math.round((used / total) * 100));
  }

  // Strategy 3: inline style width % on bar elements
  for (const el of document.querySelectorAll('[class*="progress"],[class*="meter"],[class*="bar"]')) {
    const w = el.style.width;
    if (w && w.endsWith('%')) {
      const pct = parseFloat(w);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) return Math.round(pct);
    }
  }

  return null;
}

function detectSeats() {
  const t = document.body.innerText || '';
  let m;
  if ((m = t.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*seats?/i))) return { used: stripCommas(m[1]), total: stripCommas(m[2]) };
  if ((m = t.match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)\s*seats?/i)))  return { used: stripCommas(m[1]), total: stripCommas(m[2]) };
  if ((m = t.match(/(\d[\d,]*)\s*seats?\s+(?:used|active)/i)))   return { used: stripCommas(m[1]), total: null };
  return null;
}

function detectAiCredits() {
  const bodyText = document.body.innerText || '';

  // "1,480 / 1,500 AI credits" or "1480 of 1500 AI credits"
  let m = bodyText.match(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s+AI\s+credits/i)
         || bodyText.match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+AI\s+credits/i);
  if (!m) return null;

  const used  = stripCommas(m[1]);
  const total = stripCommas(m[2]);
  if (total <= 0) return null;

  // "Resets in 15 days on Jul 1, 2026"
  const resetMatch = bodyText.match(/resets?\s+in\s+\d+\s+days?\s+on\s+([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i);
  const resetText = resetMatch ? `Resets on ${resetMatch[1]}` : null;

  return { used, total, resetText };
}

// Extract billing spend from github.com/settings/billing/* pages.
// Looks for "Current metered usage" card first, then any non-zero $ amount.
function detectSpend() {
  if (!/settings\/billing/i.test(window.location.href)) return null;

  // Strategy 1: find the "Current metered usage" card and read its dollar value
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (/current\s+metered\s+usage/i.test(node.textContent)) {
      // Dollar amount is typically in a sibling/nearby element — check the card container
      const card = node.parentElement?.closest('div,section,article') || node.parentElement;
      if (card) {
        const m = (card.innerText || card.textContent || '').match(/\$\s*([\d,]+\.?\d*)/);
        if (m) {
          const val = stripCommas(m[1]);
          if (val >= 0 && val < 100000) return { amount: parseFloat(val.toFixed(2)), currency: 'USD' };
        }
      }
    }
  }

  return null;
}

async function extractUsage(force = false) {
  const now = Date.now();
  let planFromAPI = null;

  if (force || now - lastApiFetchTime > API_COOLDOWN_MS) {
    lastApiFetchTime = now;
    planFromAPI = parsePlanFromAPI(await fetchCopilotFromAPI());
  }

  const planFromDOM              = detectPlan();
  const { startDate, endDate }   = detectBillingDates();
  const pct                      = detectPct();
  const seats                    = detectSeats();
  const spend                    = detectSpend();

  // API plan wins; fall back to DOM; merge dates from DOM when API has none
  const plan = planFromAPI
    ? {
        ...planFromAPI,
        startDate: planFromAPI.startDate || startDate,
        endDate:   planFromAPI.endDate   || endDate,
      }
    : { type: planFromDOM || 'Free', startDate, endDate };

  // Subscription cost per plan type (monthly, USD)
  const PLAN_COSTS = { Pro: 10, Individual: 10, Business: 19, Enterprise: 39, Free: 0 };
  const subscriptionCost = PLAN_COSTS[plan.type] ?? 0;

  // Compute dollar-based pct: spend / subscription cost.
  // Default spend to 0 for paid plans so we always show something meaningful.
  const spendAmount = spend?.amount ?? null;
  const dollarPct = (subscriptionCost > 0 && spendAmount !== null)
    ? Math.min(100, Math.round((spendAmount / subscriptionCost) * 100))
    : pct;  // fall back to DOM-detected pct (e.g. aria progress bar) if no cost known

  const aiCredits = detectAiCredits();
  const hasMeaningfulData = planFromAPI || planFromDOM || pct !== null || seats || spend || aiCredits;
  if (!hasMeaningfulData) return null;

  const payload = {
    source: 'github-dom',
    pct: dollarPct,
    subscriptionCost,
    plan,
    seats,
    spend,
    aiCredits,
    ts: Date.now(),
  };

  if (JSON.stringify(payload) !== JSON.stringify(lastSent)) {
    lastSent = payload;
    chrome.runtime.sendMessage({ type: 'COPILOT_USAGE_UPDATE', payload }).catch(() => {});
  }
  return payload;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'REQUEST_COPILOT_REFRESH') {
    extractUsage(true)
      .then(payload => sendResponse({ success: !!payload, payload }))
      .catch(err   => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
});

function isAlive() {
  try { return !!chrome.runtime?.id; } catch (_) { return false; }
}

let _observerTimer = null;
const observer = new MutationObserver(() => {
  if (!isAlive()) { observer.disconnect(); return; }
  clearTimeout(_observerTimer);
  _observerTimer = setTimeout(() => extractUsage().catch(() => {}), 500);
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });

const intervalId = setInterval(() => {
  if (!isAlive()) { clearInterval(intervalId); return; }
  extractUsage(false).catch(() => {});
}, 60_000);

extractUsage().catch(() => {});
