// background.js — service worker. Stores usage, updates the badge,
// schedules refresh/reset alarms, and fires notifications.

const DEFAULT_REFRESH_MINUTES = 5;

let usage = null;
let notifiedAt = null;

function getBadgeColor(pct) {
  if (pct < 50) return '#1D9E75';  // green
  if (pct < 80) return '#BA7517';  // amber
  return '#E24B4A';                // red
}

function updateBadge(u) {
  const color = getBadgeColor(u.pct);
  chrome.action.setBadgeText({ text: u.pct + '%' });
  chrome.action.setBadgeBackgroundColor({ color });
  
  let titleStr = '';
  if (u.source === 'api') {
    titleStr = `Claude Limits: ${u.pct}% used` +
               (u.resetText ? `\nWeekly resets in ${u.resetText}` : '');
  } else {
    titleStr = `Claude: ${u.used}/${u.total} messages (${u.pct}%)` +
               (u.resetText ? `\nResets in ${u.resetText}` : '');
  }
  chrome.action.setTitle({ title: titleStr });
}

function maybeNotify(u) {
  if (u.pct >= 80 && notifiedAt !== u.pct) {
    const detail = u.source === 'api' ? `${u.pct}% used` : `${u.pct}% used (${u.used}/${u.total})`;
    chrome.notifications.create('limit-warning', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Claude limit warning',
      message: `${detail}.` +
               (u.resetText ? ` Resets in ${u.resetText}.` : '')
    });
    notifiedAt = u.pct;
  }
}

function parseResetHours(text) {
  if (!text) return 0;
  const h = parseInt(text.match(/(\d+)h/)?.[1] ?? 0);
  const m = parseInt(text.match(/(\d+)m/)?.[1] ?? 0);
  return h + m / 60;
}

function scheduleResetAlarm(resetText) {
  if (!resetText) return;
  const hrs = parseResetHours(resetText);
  if (hrs <= 0) return;
  chrome.alarms.create('reset', { delayInMinutes: Math.ceil(hrs * 60) });
}

function applyRefreshAlarm(minutes) {
  chrome.alarms.clear('refresh', () => {
    chrome.alarms.create('refresh', { periodInMinutes: minutes });
  });
}

function ensureRefreshAlarm() {
  chrome.storage.local.get(['refreshInterval'], ({ refreshInterval }) => {
    applyRefreshAlarm(refreshInterval || DEFAULT_REFRESH_MINUTES);
  });
}

function handleUsageUpdate(payload) {
  usage = payload;
  chrome.storage.local.set({ usage });
  updateBadge(usage);
  maybeNotify(usage);
  scheduleResetAlarm(usage.resetText);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'USAGE_UPDATE') {
    handleUsageUpdate(msg.payload);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') {
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_REFRESH' }, () => {
          if (chrome.runtime.lastError) {
            // No content script in this tab yet — ignore.
          }
        });
      });
    });
  }

  if (alarm.name === 'reset') {
    usage = null;
    notifiedAt = null;
    chrome.storage.local.remove('usage');
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#888780' });
  }
});

chrome.tabs.onActivated.addListener(() => {
  if (usage) updateBadge(usage);
});

chrome.tabs.onUpdated.addListener((_, info) => {
  if (info.status === 'complete' && usage) updateBadge(usage);
});

function restoreFromStorage() {
  chrome.storage.local.get(['usage'], ({ usage: saved }) => {
    if (saved) {
      usage = saved;
      updateBadge(saved);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRefreshAlarm();
  restoreFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  ensureRefreshAlarm();
  restoreFromStorage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.refreshInterval) {
    applyRefreshAlarm(changes.refreshInterval.newValue || DEFAULT_REFRESH_MINUTES);
  }
});

ensureRefreshAlarm();
restoreFromStorage();
