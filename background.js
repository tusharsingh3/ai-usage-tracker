// background.js — service worker. Stores usage, updates the badge,
// schedules refresh/reset alarms, and fires notifications.

const DEFAULT_REFRESH_MINUTES = 5;

let usage = null;
let copilotUsage = null;

function getBadgeColor(pct) {
  if (pct < 50) return '#1D9E75';  // green
  if (pct < 80) return '#BA7517';  // amber
  return '#E24B4A';                // red
}

function formatToolbarTime(resetsAt) {
  if (!resetsAt) return null;
  const rawDiff = new Date(resetsAt).getTime() - Date.now();
  if (rawDiff <= 0) return null;
  
  // Round to nearest minute to prevent off-by-one errors from millisecond diffs
  const diff = Math.round(rawDiff / 60000) * 60000;
  if (diff <= 0) return null;
  
  const d = Math.floor(diff / (24 * 3600 * 1000));
  const h = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const m = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  
  const parts = [];
  if (d > 0) {
    parts.push(`${d} ${d === 1 ? 'Day' : 'Days'}`);
  }
  if (h > 0) {
    parts.push(`${h} ${h === 1 ? 'Hour' : 'Hours'}`);
  }
  if (m > 0 || parts.length === 0) {
    parts.push(`${m} ${m === 1 ? 'Min' : 'Mins'}`);
  }
  return parts.join(' ');
}

function updateBadge(u, cu) {
  // Badge shows session usage for Claude (five_hour), not the overall max
  const claudePct = u
    ? (u.source === 'api' ? Math.round(u.five_hour?.utilization || 0) : u.pct || 0)
    : 0;
  const copilotPct = (cu?.pct != null) ? cu.pct : 0;
  const displayPct = Math.max(claudePct, copilotPct);
  const hasAnyData = u || cu;

  if (!hasAnyData) return;

  const color = getBadgeColor(displayPct);
  chrome.action.setBadgeText({ text: Math.min(displayPct, 100) + '%' });
  chrome.action.setBadgeBackgroundColor({ color });
  if (typeof chrome.action.setBadgeTextColor === 'function') {
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }

  // Build tooltip — Claude line shows session usage with reset time
  let claudeLine = '';
  if (u) {
    if (u.source === 'api') {
      const sessionPct = Math.round(u.five_hour?.utilization || 0);
      const resetStr   = formatToolbarTime(u.five_hour?.resets_at);
      claudeLine = `Claude - ${sessionPct}%` + (resetStr ? ` / ${resetStr}` : '');
    } else {
      claudeLine = `Claude - ${u.pct}%` + (u.resetText ? ` / ${u.resetText}` : '');
    }
  } else {
    claudeLine = 'Claude - —';
  }

  // Copilot line: just pct, no reset time
  const copilotLine = cu ? `Copilot - ${cu.pct != null ? cu.pct + '%' : '—'}` : 'Copilot - —';

  chrome.action.setTitle({ title: claudeLine + '\n' + copilotLine });
}

function maybeNotify(u) {
  chrome.storage.local.get([
    'notifiedThresholds',
    'notify50',
    'notify80',
    'notify100'
  ], (data) => {
    const notified = data.notifiedThresholds || { p50: false, p80: false, p100: false };
    
    // Check if notifications are enabled (default to true)
    const en50 = data.notify50 !== false;
    const en80 = data.notify80 !== false;
    const en100 = data.notify100 !== false;
    
    const sessionPct = u.source === 'api' ? Math.round(u.five_hour?.utilization || 0) : u.pct;
    const overallPct = u.pct;
    
    let updated = false;
    
    // 1. Cross 50% session usage
    if (sessionPct >= 50 && !notified.p50) {
      if (en50) {
        chrome.notifications.create('limit-50', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Claude Limit: 50% Session Crossed',
          message: `Session usage is at ${sessionPct}%.` +
                   (u.resetText ? ` Resets in ${u.resetText}.` : '')
        });
      }
      notified.p50 = true;
      updated = true;
    }
    
    // 2. Cross 80% overall limit
    if (overallPct >= 80 && !notified.p80) {
      if (en80) {
        chrome.notifications.create('limit-80', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Claude Limit: 80% Crossed',
          message: `Overall limit is at ${overallPct}%.` +
                   (u.resetText ? ` Resets in ${u.resetText}.` : '')
        });
      }
      notified.p80 = true;
      updated = true;
    }
    
    // 3. Cross 100% (finished)
    if (overallPct >= 100 && !notified.p100) {
      if (en100) {
        chrome.notifications.create('limit-100', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Claude Limit reached (100%)',
          message: `You have reached 100% of your Claude message limit.` +
                   (u.resetText ? ` Resets in ${u.resetText}.` : '')
        });
      }
      notified.p100 = true;
      updated = true;
    }
    
    // Reset flags if values drop back down (meaning a reset happened)
    if (sessionPct < 50 && notified.p50) {
      notified.p50 = false;
      updated = true;
    }
    if (overallPct < 80 && notified.p80) {
      notified.p80 = false;
      updated = true;
    }
    if (overallPct < 100 && notified.p100) {
      notified.p100 = false;
      updated = true;
    }
    
    if (updated) {
      chrome.storage.local.set({ notifiedThresholds: notified });
    }
  });
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
  updateBadge(usage, copilotUsage);
  maybeNotify(usage);
  scheduleResetAlarm(usage.resetText);
}

function handleCopilotUsageUpdate(payload) {
  copilotUsage = payload;
  chrome.storage.local.set({ copilotUsage });
  updateBadge(usage, copilotUsage);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'USAGE_UPDATE') {
    handleUsageUpdate(msg.payload);
  }
  if (msg.type === 'COPILOT_USAGE_UPDATE') {
    handleCopilotUsageUpdate(msg.payload);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') {
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_REFRESH' })
          .catch((err) => {
            // No content script in this tab or tab was closed — ignore.
          });
      });
    });
    chrome.tabs.query({ url: 'https://github.com/settings/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_COPILOT_REFRESH' })
          .catch(() => {});
      });
    });
  }

  if (alarm.name === 'reset') {
    usage = null;
    chrome.storage.local.remove(['usage', 'notifiedThresholds']);
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setBadgeBackgroundColor({ color: '#888780' });
    // If copilot still has data, restore its badge
    if (copilotUsage) updateBadge(null, copilotUsage);
  }
});

chrome.tabs.onActivated.addListener(() => {
  if (usage || copilotUsage) updateBadge(usage, copilotUsage);
});

chrome.tabs.onUpdated.addListener((_, info) => {
  if (info.status === 'complete' && (usage || copilotUsage)) updateBadge(usage, copilotUsage);
});

function restoreFromStorage() {
  chrome.storage.local.get(['usage', 'copilotUsage'], ({ usage: u, copilotUsage: cu }) => {
    if (u) usage = u;
    if (cu) copilotUsage = cu;
    if (u || cu) updateBadge(usage, copilotUsage);
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
  if (area !== 'local') return;
  if (changes.refreshInterval) {
    applyRefreshAlarm(changes.refreshInterval.newValue || DEFAULT_REFRESH_MINUTES);
  }
  if (changes.showCopilot && changes.showCopilot.newValue === false) {
    copilotUsage = null;
    chrome.storage.local.remove('copilotUsage');
    updateBadge(usage, null);
  }
});

ensureRefreshAlarm();
restoreFromStorage();
