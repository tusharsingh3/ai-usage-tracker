// content.js — extracts Claude usage info from the claude.ai DOM and
// forwards it to the background service worker.

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

function extractUsage() {
  let usage = findUsageFromSelectors();
  if (!usage) usage = findUsageFromTextNodes();
  if (!usage) usage = findUsageFromInnerText();

  if (!usage) {
    console.warn('[Claude Limit Tracker] Could not find usage info in DOM.');
    return;
  }

  const { used, total } = usage;
  const payload = {
    used,
    total,
    pct: Math.round((used / total) * 100),
    resetText: findResetText(),
    ts: Date.now(),
  };

  if (JSON.stringify(payload) === JSON.stringify(lastSent)) return;
  lastSent = payload;

  chrome.runtime.sendMessage({ type: 'USAGE_UPDATE', payload }, () => {
    if (chrome.runtime.lastError) {
      // Background may be asleep; it wakes automatically on message receipt.
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REQUEST_REFRESH') {
    extractUsage();
  }
});

const observer = new MutationObserver(() => extractUsage());
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

setInterval(extractUsage, 30_000);

extractUsage();
