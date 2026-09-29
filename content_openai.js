// content_openai.js — collects ChatGPT plan/quota data and Codex usage from
// chatgpt.com. Authentication tokens are used only in memory and are never
// included in messages or persisted by the extension.

const OPENAI_USAGE_COOLDOWN_MS = 30_000;
let lastOpenAIFetchTime = 0;
let lastOpenAISent = { chatgpt: null, codex: null };

function toIsoReset(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeWindow(windowData, fallbackLabel) {
  if (!windowData || typeof windowData !== 'object') return null;
  const rawPct = windowData.used_percent ?? windowData.utilization ?? windowData.percentage;
  const utilization = Number(rawPct);
  if (!Number.isFinite(utilization)) return null;

  let resetsAt = toIsoReset(windowData.reset_at ?? windowData.resets_at);
  if (!resetsAt && Number.isFinite(Number(windowData.reset_after_seconds))) {
    resetsAt = new Date(Date.now() + Number(windowData.reset_after_seconds) * 1000).toISOString();
  }

  return {
    label: windowData.label || fallbackLabel,
    utilization: Math.max(0, Math.min(100, Math.round(utilization))),
    resetsAt,
  };
}

function readPlanType(session, usageData) {
  const raw = usageData?.plan_type
    || usageData?.plan
    || session?.account?.plan_type
    || session?.user?.plan_type
    || session?.user?.plan
    || 'Unknown';
  const text = String(raw).replace(/[_-]+/g, ' ').trim();
  return text ? text.replace(/\b\w/g, char => char.toUpperCase()) : 'Unknown';
}

function readWorkspace(session) {
  return session?.account?.name
    || session?.user?.workspace_name
    || session?.user?.name
    || null;
}

function normalizeCredits(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const balance = Number(raw.balance ?? raw.remaining ?? raw.amount);
  const used = Number(raw.used ?? raw.used_credits);
  const normalized = {
    hasCredits: raw.has_credits ?? raw.enabled ?? Number.isFinite(balance),
    unlimited: raw.unlimited === true,
    balance: Number.isFinite(balance) ? balance : null,
    used: Number.isFinite(used) ? used : null,
  };
  return normalized.hasCredits || normalized.unlimited || normalized.balance != null || normalized.used != null
    ? normalized
    : null;
}

function normalizeCodexUsage(usageData, session) {
  const rateLimit = usageData?.rate_limit || usageData?.rate_limits || usageData?.limits || {};
  const sessionWindow = normalizeWindow(
    rateLimit.primary_window || rateLimit.five_hour || usageData?.five_hour,
    'Session'
  );
  const weeklyWindow = normalizeWindow(
    rateLimit.secondary_window || rateLimit.seven_day || usageData?.seven_day,
    'Weekly'
  );
  if (!sessionWindow && !weeklyWindow && !usageData) return null;

  const limits = {};
  if (sessionWindow) limits.session = sessionWindow;
  if (weeklyWindow) limits.weekly = weeklyWindow;

  const values = Object.values(limits).map(limit => limit.utilization);
  return {
    source: 'openai-usage-api',
    plan: { type: readPlanType(session, usageData), workspace: readWorkspace(session) },
    limits,
    credits: normalizeCredits(usageData?.credits || usageData?.credit_balance),
    pct: values.length ? Math.max(...values) : null,
    ts: Date.now(),
  };
}

function extractResetFromText(text) {
  const relative = text.match(/resets?\s+in\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m)\s*)+)/i);
  if (!relative) return null;
  const value = relative[1];
  const days = Number(value.match(/(\d+)\s*(?:days?|d)\b/i)?.[1] || 0);
  const hours = Number(value.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i)?.[1] || 0);
  return new Date(Date.now() + ((days * 24 + hours) * 60 + minutes) * 60_000).toISOString();
}

function detectChatGPTQuotas() {
  // Limit parsing to account banners, dialogs, and limit-labelled controls so
  // ordinary conversation text cannot be mistaken for account usage.
  const candidates = document.querySelectorAll([
    '[role="alert"]',
    '[role="dialog"]',
    '[data-testid*="limit" i]',
    '[aria-label*="limit" i]',
    '[class*="usage-limit" i]',
  ].join(','));
  const texts = Array.from(candidates, element => element.innerText || element.textContent || '')
    .filter(Boolean);
  const text = texts.join('\n');
  const quotas = [];
  const exhausted = text.match(/(?:reached|hit)\s+(?:the\s+|your\s+)?([^\n.]{0,60}?)(?:usage\s+)?limit/i);
  if (exhausted) {
    quotas.push({
      id: 'active-limit',
      label: exhausted[1].trim() || 'Current model',
      utilization: 100,
      exhausted: true,
      resetsAt: extractResetFromText(text),
    });
  }

  const countPattern = /(\d[\d,]*)\s+(?:of|\/)\s+(\d[\d,]*)\s+(messages?|requests?|generations?|uses?)(?:[^\n]{0,80}?resets?\s+in\s+[^\n.]+)?/gi;
  let match;
  while ((match = countPattern.exec(text)) && quotas.length < 8) {
    const used = Number(match[1].replace(/,/g, ''));
    const total = Number(match[2].replace(/,/g, ''));
    if (!total) continue;
    quotas.push({
      id: `${match[3].toLowerCase()}-${quotas.length}`,
      label: match[3][0].toUpperCase() + match[3].slice(1),
      used,
      total,
      utilization: Math.min(100, Math.round((used / total) * 100)),
      resetsAt: extractResetFromText(match[0]),
    });
  }
  return quotas;
}

function normalizeChatGPTUsage(session) {
  const quotas = detectChatGPTQuotas();
  const percentages = quotas.map(quota => quota.utilization).filter(Number.isFinite);
  return {
    source: quotas.length ? 'chatgpt-dom' : 'chatgpt-session',
    plan: { type: readPlanType(session, null), workspace: readWorkspace(session) },
    quotas,
    pct: percentages.length ? Math.max(...percentages) : null,
    ts: Date.now(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) return null;
  return response.json();
}

async function fetchOpenAIData() {
  const session = await fetchJson('https://chatgpt.com/api/auth/session');
  if (!session?.user && !session?.accessToken) {
    return { loginRequired: true, session: null, usageData: null };
  }

  const headers = session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
  const accountId = session?.account?.id || session?.user?.account_id;
  if (accountId) headers['chatgpt-account-id'] = accountId;
  const usageData = await fetchJson('https://chatgpt.com/backend-api/wham/usage', { headers });
  return { loginRequired: false, session, usageData };
}

function sendUsage(service, payload) {
  if (!payload || JSON.stringify(payload) === JSON.stringify(lastOpenAISent[service])) return;
  lastOpenAISent[service] = payload;
  chrome.runtime.sendMessage({ type: 'SERVICE_USAGE_UPDATE', service, payload }).catch(() => {});
}

async function extractOpenAIUsage(force = false) {
  const now = Date.now();
  if (!force && now - lastOpenAIFetchTime < OPENAI_USAGE_COOLDOWN_MS) return lastOpenAISent;
  lastOpenAIFetchTime = now;

  try {
    const { loginRequired, session, usageData } = await fetchOpenAIData();
    if (loginRequired) {
      const state = { source: 'chatgpt-session', error: 'LOGIN_REQUIRED', ts: Date.now() };
      sendUsage('chatgpt', state);
      sendUsage('codex', state);
      return { chatgpt: state, codex: state };
    }

    const chatgpt = normalizeChatGPTUsage(session);
    const codex = normalizeCodexUsage(usageData, session) || {
      source: 'openai-usage-api',
      plan: chatgpt.plan,
      limits: {},
      credits: null,
      pct: null,
      error: 'USAGE_UNAVAILABLE',
      ts: Date.now(),
    };
    sendUsage('chatgpt', chatgpt);
    sendUsage('codex', codex);
    return { chatgpt, codex };
  } catch (error) {
    console.debug('[AI Usage Tracker] OpenAI usage fetch failed:', error);
    return lastOpenAISent;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'REQUEST_OPENAI_REFRESH') return undefined;
  extractOpenAIUsage(true)
    .then(payload => sendResponse({ success: !!payload, payload }))
    .catch(error => sendResponse({ success: false, error: String(error) }));
  return true;
});

function extensionIsAlive() {
  try { return Boolean(chrome.runtime?.id); } catch (_) { return false; }
}

let observerTimer = null;
const observer = new MutationObserver(() => {
  if (!extensionIsAlive()) return observer.disconnect();
  clearTimeout(observerTimer);
  observerTimer = setTimeout(() => extractOpenAIUsage(false).catch(() => {}), 750);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

const intervalId = setInterval(() => {
  if (!extensionIsAlive()) return clearInterval(intervalId);
  extractOpenAIUsage(false).catch(() => {});
}, 60_000);

window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
extractOpenAIUsage(true).catch(() => {});
