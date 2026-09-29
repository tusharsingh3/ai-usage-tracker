// background.js — service worker. Stores usage, updates the badge,
// schedules refresh/reset alarms, and fires notifications.

const DEFAULT_REFRESH_MINUTES = 15;
const ENABLE_AUTO_FETCH = true;

let usageByService = {
  claude: null,
  chatgpt: null,
  codex: null,
  copilot: null,
};

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

function getLimitEntries(service, payload) {
  if (!payload) return [];
  if (service === 'claude') {
    if (payload.source === 'api') {
      return [
        ['Session', payload.five_hour?.utilization, payload.five_hour?.resets_at],
        ['Weekly', payload.seven_day?.utilization, payload.seven_day?.resets_at],
      ];
    }
    return [['Messages', payload.pct, null]];
  }
  if (service === 'codex') {
    return Object.entries(payload.limits || {}).map(([key, value]) => [value.label || key, value.utilization, value.resetsAt]);
  }
  if (service === 'chatgpt') {
    return (payload.quotas || []).map(value => [value.label || 'Quota', value.utilization, value.resetsAt]);
  }
  if (service === 'copilot') {
    const credits = payload.aiCredits;
    const pct = credits?.total ? Math.round((credits.used / credits.total) * 100) : payload.pct;
    return [['AI credits', pct, null]];
  }
  return [];
}

function getServicePct(service, payload) {
  const values = getLimitEntries(service, payload)
    .map(([, pct]) => Number(pct))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function updateBadge() {
  chrome.storage.local.get(['badgeService', 'activeService', 'showChatGPT', 'showCodex', 'showCopilot'], settings => {
    const enabled = ['claude'];
    if (settings.showChatGPT !== false) enabled.push('chatgpt');
    if (settings.showCodex !== false) enabled.push('codex');
    if (settings.showCopilot !== false) enabled.push('copilot');

    const labels = { claude: 'Claude', chatgpt: 'ChatGPT', codex: 'Codex', copilot: 'Copilot' };
    const candidates = enabled.map(service => ({
      service,
      payload: usageByService[service],
      pct: getServicePct(service, usageByService[service]),
    }));

    const tooltip = candidates.map(({ service, payload, pct }) => {
      const firstReset = getLimitEntries(service, payload).find(([, value, reset]) => Number.isFinite(Number(value)) && reset)?.[2];
      const resetText = formatToolbarTime(firstReset);
      return `${labels[service]} - ${pct == null ? '—' : `${Math.round(pct)}%`}${resetText ? ` / ${resetText}` : ''}`;
    }).join('\n');
    chrome.action.setTitle({ title: tooltip || 'AI Usage Tracker' });

    let selected;
    const badgeMode = settings.badgeService || 'highest';
    if (badgeMode === 'active') {
      selected = candidates.find(item => item.service === settings.activeService);
    } else if (badgeMode !== 'highest') {
      selected = candidates.find(item => item.service === badgeMode);
    }
    if (!selected || selected.pct == null) {
      selected = candidates.filter(item => item.pct != null).sort((a, b) => b.pct - a.pct)[0];
    }

    if (!selected || selected.pct == null) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(selected.pct)));
    chrome.action.setBadgeText({ text: `${pct}%` });
    chrome.action.setBadgeBackgroundColor({ color: getBadgeColor(pct) });
    if (typeof chrome.action.setBadgeTextColor === 'function') chrome.action.setBadgeTextColor({ color: '#ffffff' });
  });
}

function maybeNotify(service, payload) {
  const entries = getLimitEntries(service, payload);
  if (!entries.length) return;
  chrome.storage.local.get(['notificationState', 'notify50', 'notify80', 'notify100'], data => {
    const state = data.notificationState || {};
    state[service] ||= {};
    const labels = { claude: 'Claude', chatgpt: 'ChatGPT', codex: 'Codex', copilot: 'Copilot' };
    const enabled = { 50: data.notify50 !== false, 80: data.notify80 !== false, 100: data.notify100 !== false };

    for (const [label, rawPct, resetsAt] of entries) {
      const pct = Math.round(Number(rawPct));
      if (!Number.isFinite(pct)) continue;
      const key = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      state[service][key] ||= { p50: false, p80: false, p100: false };
      const limitState = state[service][key];
      for (const threshold of [50, 80, 100]) {
        const flag = `p${threshold}`;
        if (pct >= threshold && !limitState[flag]) {
          if (enabled[threshold]) {
            const resetText = formatToolbarTime(resetsAt);
            chrome.notifications.create(`${service}-${key}-${threshold}`, {
              type: 'basic', iconUrl: 'icons/icon48.png',
              title: `${labels[service]} ${label}: ${threshold}% crossed`,
              message: `${label} usage is at ${pct}%.${resetText ? ` Resets in ${resetText}.` : ''}`,
            });
          }
          limitState[flag] = true;
        } else if (pct < threshold) {
          limitState[flag] = false;
        }
      }
    }
    chrome.storage.local.set({ notificationState: state });
  });
}

function applyRefreshAlarm(minutes) {
  chrome.alarms.clear('refresh', () => {
    chrome.alarms.create('refresh', { periodInMinutes: minutes });
  });
}

function ensureRefreshAlarm() {
  if (!ENABLE_AUTO_FETCH) return;
  chrome.storage.local.get(['refreshInterval'], ({ refreshInterval }) => {
    const minutes = refreshInterval || DEFAULT_REFRESH_MINUTES;
    chrome.alarms.get('refresh', (alarm) => {
      if (!alarm || alarm.periodInMinutes !== minutes) {
        applyRefreshAlarm(minutes);
      }
    });
  });
}

function formatResetText(resetsAt) {
  if (!resetsAt) return null;
  const rawDiff = new Date(resetsAt).getTime() - Date.now();
  if (rawDiff <= 0) return '0m';
  
  // Round to nearest minute to prevent off-by-one errors from millisecond diffs
  const diff = Math.round(rawDiff / 60000) * 60000;
  if (diff <= 0) return '0m';
  
  const d = Math.floor(diff / (24 * 3600 * 1000));
  const h = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const m = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

async function fetchClaudeUsage() {
  try {
    const orgsResponse = await fetch('https://claude.ai/api/organizations');
    if (!orgsResponse.ok) return null;
    const orgs = await orgsResponse.json();
    if (!orgs || orgs.length === 0) return null;

    // Loop through all organizations to find the highest subscription plan tier
    let planType = 'Free';
    let chosenSub = {};
    let chosenOrg = orgs[0];

    for (const o of orgs) {
      const oSub = o.active_billing_subscription || o.subscription || {};
      const oCapabilities = o.capabilities || [];
      const oTier = (oSub.tier || o.pricing_tier || o.tier || '').toLowerCase();

      let currentType = 'Free';
      if (oTier.includes('enterprise') || oCapabilities.some(c => c.toLowerCase().includes('enterprise'))) {
        currentType = 'Enterprise';
      } else if (oTier.includes('team') || oCapabilities.some(c => c.toLowerCase().includes('team'))) {
        currentType = 'Team';
      } else if (oTier.includes('pro') || oCapabilities.some(c => c.toLowerCase().includes('pro'))) {
        currentType = 'Pro';
      } else if (oTier) {
        currentType = oTier.charAt(0).toUpperCase() + oTier.slice(1);
      }

      // Elevate planType if a higher one is found
      if (currentType === 'Enterprise') {
        planType = 'Enterprise';
        chosenSub = oSub;
        chosenOrg = o;
      } else if (currentType === 'Team' && planType !== 'Enterprise') {
        planType = 'Team';
        chosenSub = oSub;
        chosenOrg = o;
      } else if (currentType === 'Pro' && planType !== 'Enterprise' && planType !== 'Team') {
        planType = 'Pro';
        chosenSub = oSub;
        chosenOrg = o;
      } else if (planType === 'Free' && currentType !== 'Free') {
        planType = currentType;
        chosenSub = oSub;
        chosenOrg = o;
      }
    }

    const orgId = chosenOrg.uuid;
    const orgName = chosenOrg.name || 'Claude Limits';

    const plan = {
      type: planType,
      startDate: chosenSub.current_period_start || chosenSub.start_date || null,
      endDate: chosenSub.current_period_end || chosenSub.end_date || null,
      provider: chosenSub.provider || chosenSub.payment_processor || null
    };

    const usageResponse = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`);
    if (!usageResponse.ok) return null;
    const usageData = await usageResponse.json();

    const maxPct = Math.round(Math.max(
      usageData.five_hour?.utilization || 0,
      usageData.seven_day?.utilization || 0,
      usageData.seven_day_sonnet?.utilization || 0,
      usageData.seven_day_opus?.utilization || 0
    ));

    return {
      source: 'api',
      orgName,
      orgId,
      five_hour: usageData.five_hour,
      seven_day: usageData.seven_day,
      seven_day_sonnet: usageData.seven_day_sonnet,
      seven_day_opus: usageData.seven_day_opus,
      extra_usage: usageData.extra_usage,
      pct: maxPct,
      used: Math.round(usageData.seven_day?.utilization || 0),
      total: 100,
      resetText: formatResetText(usageData.seven_day?.resets_at),
      ts: Date.now(),
      plan,
      debug_org: chosenOrg
    };
  } catch (err) {
    console.debug('[AI Usage Tracker] Background Claude API fetch failed:', err);
    return null;
  }
}

function handleServiceUsageUpdate(service, payload) {
  if (!Object.prototype.hasOwnProperty.call(usageByService, service) || !payload) return;
  usageByService[service] = payload;
  const legacy = {};
  if (service === 'claude') legacy.usage = payload;
  if (service === 'copilot') legacy.copilotUsage = payload;
  chrome.storage.local.set({ usageByService, ...legacy });
  updateBadge();
  maybeNotify(service, payload);
}

async function sendRefreshToTab(url, message) {
  const tabs = await chrome.tabs.query({ url });
  const target = tabs.find(tab => tab.active) || tabs.find(tab => !tab.discarded) || tabs[0];
  if (!target?.id) return { success: false, error: 'PAGE_REQUIRED' };
  try {
    return await chrome.tabs.sendMessage(target.id, message);
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function refreshService(service) {
  if (service === 'claude') {
    const payload = await fetchClaudeUsage();
    if (payload) handleServiceUsageUpdate('claude', payload);
    return { success: Boolean(payload), payload };
  }
  if (service === 'chatgpt' || service === 'codex') {
    return sendRefreshToTab('https://chatgpt.com/*', { type: 'REQUEST_OPENAI_REFRESH', force: true });
  }
  if (service === 'copilot') {
    return sendRefreshToTab('https://github.com/settings/*', { type: 'REQUEST_COPILOT_REFRESH', force: true });
  }
  return { success: false, error: 'UNKNOWN_SERVICE' };
}

async function refreshEnabledServices() {
  const settings = await chrome.storage.local.get(['showChatGPT', 'showCodex', 'showCopilot']);
  const services = ['claude'];
  if (settings.showChatGPT !== false || settings.showCodex !== false) services.push('chatgpt');
  if (settings.showCopilot !== false) services.push('copilot');
  await Promise.allSettled(services.map(refreshService));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'USAGE_UPDATE') handleServiceUsageUpdate('claude', msg.payload);
  if (msg.type === 'COPILOT_USAGE_UPDATE') handleServiceUsageUpdate('copilot', msg.payload);
  if (msg.type === 'SERVICE_USAGE_UPDATE') handleServiceUsageUpdate(msg.service, msg.payload);
  if (msg.type === 'TRIGGER_REFRESH') {
    refreshService('claude').then(sendResponse).catch(error => sendResponse({ success: false, error: String(error) }));
    return true;
  }
  if (msg.type === 'TRIGGER_SERVICE_REFRESH') {
    refreshService(msg.service).then(sendResponse).catch(error => sendResponse({ success: false, error: String(error) }));
    return true;
  }
  return undefined;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') {
    if (ENABLE_AUTO_FETCH) refreshEnabledServices().catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(() => {
  updateBadge();
});

chrome.tabs.onUpdated.addListener((_, info) => {
  if (info.status === 'complete') updateBadge();
});

function restoreFromStorage() {
  chrome.storage.local.get(['usageByService', 'usage', 'copilotUsage'], data => {
    usageByService = {
      ...usageByService,
      ...(data.usageByService || {}),
      claude: data.usageByService?.claude || data.usage || null,
      copilot: data.usageByService?.copilot || data.copilotUsage || null,
    };
    chrome.storage.local.set({ usageByService, schemaVersion: 2 });
    updateBadge();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  if (ENABLE_AUTO_FETCH) ensureRefreshAlarm();
  restoreFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  if (ENABLE_AUTO_FETCH) ensureRefreshAlarm();
  restoreFromStorage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.refreshInterval) {
    if (ENABLE_AUTO_FETCH) {
      applyRefreshAlarm(changes.refreshInterval.newValue || DEFAULT_REFRESH_MINUTES);
    }
  }
  if (changes.badgeService || changes.activeService || changes.showChatGPT || changes.showCodex || changes.showCopilot) updateBadge();
});

restoreFromStorage();
