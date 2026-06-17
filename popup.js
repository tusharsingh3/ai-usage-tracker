const refreshIcon = `
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
  <path d="M23 4v6h-6"></path>
  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
</svg>`;

const sunIcon = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="5"></circle>
  <line x1="12" y1="1" x2="12" y2="3"></line>
  <line x1="12" y1="21" x2="12" y2="23"></line>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
  <line x1="1" y1="12" x2="3" y2="12"></line>
  <line x1="21" y1="12" x2="23" y2="12"></line>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
</svg>`;

const moonIcon = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
</svg>`;

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
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

function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return '—';
  }
}

function getColorForPct(pct) {
  if (pct < 50) {
    return {
      bar: 'linear-gradient(90deg, #1D9E75, #34d399)',
      circle: '#1D9E75'
    };
  }
  if (pct < 80) {
    return {
      bar: 'linear-gradient(90deg, #BA7517, #fbbf24)',
      circle: '#BA7517'
    };
  }
  return {
    bar: 'linear-gradient(90deg, #E24B4A, #f87171)',
    circle: '#E24B4A'
  };
}

function setupThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  // Wrap privacy badge + theme toggle in a group so they sit flush together
  if (!toggleBtn.parentElement.querySelector('.header-right')) {
    const group = document.createElement('div');
    group.className = 'header-right';

    const badge = document.createElement('div');
    badge.className = 'privacy-badge';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', 'Privacy information');
    badge.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <div class="privacy-tooltip">
        <strong>Privacy</strong>
        All data stored locally in Chrome. Nothing sent to any server. No analytics or tracking.
      </div>`;

    toggleBtn.parentElement.insertBefore(group, toggleBtn);
    group.appendChild(badge);
    group.appendChild(toggleBtn);
  }

  // Clone immediately to remove old listeners
  const newToggleBtn = toggleBtn.cloneNode(true);
  toggleBtn.replaceWith(newToggleBtn);

  chrome.storage.local.get(['theme'], ({ theme }) => {
    const currentTheme = theme || 'dark';
    if (currentTheme === 'light') {
      document.body.classList.add('light-theme');
      newToggleBtn.innerHTML = moonIcon;
      newToggleBtn.title = 'Switch to Dark Theme';
    } else {
      document.body.classList.remove('light-theme');
      newToggleBtn.innerHTML = sunIcon;
      newToggleBtn.title = 'Switch to Light Theme';
    }
  });

  newToggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['theme'], ({ theme }) => {
      const newTheme = (theme || 'dark') === 'light' ? 'dark' : 'light';
      chrome.storage.local.set({ theme: newTheme }, () => {
        if (newTheme === 'light') {
          document.body.classList.add('light-theme');
        } else {
          document.body.classList.remove('light-theme');
        }
        chrome.storage.local.get(['usage', 'copilotUsage', 'activeService', 'showCopilot'], (d) => {
          renderUI(d.activeService || 'claude', d.usage, d.copilotUsage, d.showCopilot);
        });
      });
    });
  });
}

function renderClaudeDashboard(usage) {
  const root = document.getElementById('root');

  if (!usage) {
    root.innerHTML = `
      <div class="app-container">
        <div class="header">
          <div id="service-toggle-placeholder"></div>
          <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
            <!-- sun/moon icon -->
          </button>
        </div>
        <div class="bento-card">
          <div class="empty-view">
            <span>No usage data found yet.</span>
            <a href="https://claude.ai" target="_blank">Open claude.ai →</a>
          </div>
        </div>
        <button class="btn-refresh" id="refresh-btn" type="button">
          ${refreshIcon} <span>Refresh Usage Data</span>
        </button>
        <div class="footer-row">
          <button class="footer-link" id="settings-btn" type="button">Settings</button>
          <a class="footer-link" href="https://claude.ai" target="_blank">Open Claude →</a>
        </div>
      </div>`;

    setupThemeToggle();
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);
    return;
  }

  // Common UI elements
  const { pct, used, total, resetText, ts } = usage;
  const isApi = usage.source === 'api';

  let topLabel = 'LIMIT USAGE';
  let topPct = pct;
  let topResetStr = resetText ? `Resets in ${resetText}` : 'Resets in —';
  let middleGridHtml = '';

  if (isApi) {
    const weeklyPct = Math.round(usage.seven_day?.utilization || 0);
    const weeklyResetText = formatResetText(usage.seven_day?.resets_at);
    const weeklyResetStr = weeklyResetText ? `${weeklyResetText} left` : '—';

    const sessionPct = Math.round(usage.five_hour?.utilization || 0);
    const sessionResetText = formatResetText(usage.five_hour?.resets_at);
    const sessionResetStr = sessionResetText ? `${sessionResetText} left` : '—';

    const orgName = usage.orgName || 'Workspace';
    let orgPct = 0;
    let orgResetAt = null;
    if (usage.seven_day_sonnet) {
      orgPct = Math.round(usage.seven_day_sonnet.utilization);
      orgResetAt = usage.seven_day_sonnet.resets_at;
    } else if (usage.seven_day_opus) {
      orgPct = Math.round(usage.seven_day_opus.utilization);
      orgResetAt = usage.seven_day_opus.resets_at;
    } else {
      orgPct = weeklyPct;
      orgResetAt = usage.seven_day?.resets_at;
    }
    const orgResetText = formatResetText(orgResetAt);
    const orgResetStr = orgResetText ? `${orgResetText} left` : '—';

    // Defaults (Session is top, Weekly is left, Org is right)
    topLabel = 'SESSION LIMIT';
    topPct = sessionPct;
    topResetStr = sessionResetText ? `Resets in ${sessionResetText}` : 'Resets in —';

    let leftLabel = 'Weekly';
    let leftPct = weeklyPct;
    let leftResetStr = weeklyResetStr;

    let rightLabel = orgName;
    let rightPct = orgPct;
    let rightResetStr = orgResetStr;

    // Dynamically elevate the highest percentage limit to the top card to match the badge
    if (weeklyPct > sessionPct && weeklyPct > orgPct) {
      topLabel = 'WEEKLY USAGE';
      topPct = weeklyPct;
      topResetStr = weeklyResetText ? `Resets in ${weeklyResetText}` : 'Resets in —';

      leftLabel = 'Session';
      leftPct = sessionPct;
      leftResetStr = sessionResetStr;
    } else if (orgPct > sessionPct && orgPct > weeklyPct) {
      topLabel = `${esc(orgName.toUpperCase())} LIMIT`;
      topPct = orgPct;
      topResetStr = orgResetText ? `Resets in ${orgResetText}` : 'Resets in —';

      rightLabel = 'Session';
      rightPct = sessionPct;
      rightResetStr = sessionResetStr;
    }

    // Resolve dynamic colors based on percentages
    const leftColor = getColorForPct(leftPct).circle;
    const rightColor = getColorForPct(rightPct).circle;

    const leftOffset = (113.1 - (113.1 * Math.min(leftPct, 100)) / 100).toFixed(1);
    const rightOffset = (113.1 - (113.1 * Math.min(rightPct, 100)) / 100).toFixed(1);

    middleGridHtml = `
      <div class="grid-row">
        <!-- Left Limit Card -->
        <div class="bento-card">
          <span class="card-label" title="${esc(leftLabel)}">${esc(leftLabel)}</span>
          <div class="circle-card-content">
            <div class="circle-svg-wrap">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--circle-empty)" stroke-width="4"/>
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="${leftColor}" stroke-width="4" stroke-linecap="round"
                  stroke-dasharray="113.1" stroke-dashoffset="${leftOffset}"/>
              </svg>
              <div class="circle-text-center">${leftPct}%</div>
            </div>
            <div class="circle-details">
              <span class="circle-val-text">${leftPct}%</span>
              <span class="circle-sub-text" title="${leftResetStr}">${leftResetStr}</span>
            </div>
          </div>
        </div>

        <!-- Right Limit Card -->
        <div class="bento-card">
          <span class="card-label" title="${esc(rightLabel)}">${esc(rightLabel)}</span>
          <div class="circle-card-content">
            <div class="circle-svg-wrap">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--circle-empty)" stroke-width="4"/>
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="${rightColor}" stroke-width="4" stroke-linecap="round"
                  stroke-dasharray="113.1" stroke-dashoffset="${rightOffset}"/>
              </svg>
              <div class="circle-text-center">${rightPct}%</div>
            </div>
            <div class="circle-details">
              <span class="circle-val-text">${rightPct}%</span>
              <span class="circle-sub-text" title="${rightResetStr}">${rightResetStr}</span>
            </div>
          </div>
        </div>
      </div>`;
  } else {
    // Fallback/Scraped DOM view
    const usageOffset = (113.1 - (113.1 * Math.min(pct, 100)) / 100).toFixed(1);
    const rem = total - used;
    const fallbackColor = getColorForPct(pct);

    middleGridHtml = `
      <div class="grid-row">
        <!-- Messages Used Card -->
        <div class="bento-card">
          <span class="card-label">Used</span>
          <div class="circle-card-content">
            <div class="circle-svg-wrap">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--circle-empty)" stroke-width="4"/>
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="${fallbackColor.circle}" stroke-width="4" stroke-linecap="round"
                  stroke-dasharray="113.1" stroke-dashoffset="${usageOffset}"/>
              </svg>
              <div class="circle-text-center">${pct}%</div>
            </div>
            <div class="circle-details">
              <span class="circle-val-text">${used}/${total}</span>
              <span class="circle-sub-text">messages</span>
            </div>
          </div>
        </div>

        <!-- Messages Left Card -->
        <div class="bento-card">
          <span class="card-label">Remaining</span>
          <div class="circle-card-content">
            <div class="circle-details" style="padding-left: 4px;">
              <span class="circle-val-text" style="font-size: 24px;">${rem}</span>
              <span class="circle-sub-text">messages left</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Extra Charges calculation
  const credits = usage.extra_usage?.used_credits || 0;
  const formattedCredits = typeof credits === 'number' ? `$${credits.toFixed(2)}` : `$${credits}`;
  const chargesActive = typeof credits === 'number' ? credits > 0 : false;
  const chargesBadgeText = chargesActive ? 'Charges active' : 'No charges';

  // Plan details extraction
  const plan = usage.plan || { type: 'Free', startDate: null, endDate: null };
  const planType = plan.type || 'Free';
  const startDateStr = formatDate(plan.startDate);
  const endDateStr = formatDate(plan.endDate);

  let billingText = '';
  if (planType === 'Free') billingText = '$0/mo';
  else if (planType === 'Pro') billingText = '$20/mo';
  else if (planType === 'Team') billingText = '$30/mo';
  else if (planType === 'Enterprise') billingText = 'Custom';
  else billingText = 'Active';

  // Determine what to render in the date section of the card
  let dateSectionHtml = '';
  if (planType === 'Free') {
    dateSectionHtml = `
          <div class="plan-dates">
            <div class="plan-date-col">
              <span class="date-label">Started</span>
              <span class="date-value">—</span>
            </div>
            <div class="plan-date-col">
              <span class="date-label">Ends</span>
              <span class="date-value">—</span>
            </div>
          </div>`;
  } else if (startDateStr === '—') {
    let providerName = 'iOS';
    let deviceName = 'iOS device';

    const detectProvider = (plan.provider || '').toLowerCase();
    if (detectProvider.includes('android') || detectProvider.includes('google') || detectProvider.includes('play')) {
      providerName = 'Android';
      deviceName = 'Android device';
    } else if (detectProvider.includes('stripe') || detectProvider.includes('web')) {
      providerName = 'Web';
      deviceName = 'web account settings';
    }

    dateSectionHtml = `
          <div class="plan-dates-warning" style="font-size: 10px; color: var(--label-color); border-top: 1px solid var(--bar-border); padding-top: 8px; margin-top: 4px; line-height: 1.4; display: flex; align-items: flex-start; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Subscribed via ${esc(providerName)} app. Manage subscription on your ${esc(deviceName)}.</span>
          </div>`;
  } else {
    dateSectionHtml = `
          <div class="plan-dates">
            <div class="plan-date-col">
              <span class="date-label">Started</span>
              <span class="date-value">${startDateStr}</span>
            </div>
            <div class="plan-date-col">
              <span class="date-label">Ends</span>
              <span class="date-value">${endDateStr}</span>
            </div>
          </div>`;
  }

  const planBadgeClass = `plan-${planType.toLowerCase()}`;
  const topColor = getColorForPct(topPct);

  root.innerHTML = `
    <div class="app-container">
      <!-- Header -->
      <div class="header">
        <div id="service-toggle-placeholder"></div>
        <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
          <!-- sun/moon icon -->
        </button>
      </div>

      <!-- Top Usage Card (Highest Limit) -->
      <div class="bento-card">
        <span class="card-label">${topLabel}</span>
        <span class="weekly-value" style="color: ${topColor.circle}">${topPct}%</span>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${topPct}%; background: ${topColor.bar};"></div>
        </div>
        <span class="reset-text">${topResetStr}</span>
      </div>

      <!-- Dynamic Grid Rows (Session & Org Specific Quota) -->
      ${middleGridHtml}

      <!-- Extra Charges Card -->
      <div class="bento-card extra-charges-card">
        <div class="extra-charges-left">
          <span class="card-label">Extra Charges</span>
          <span class="extra-charges-val">${formattedCredits}</span>
        </div>
        <div class="extra-charges-badge" style="${chargesActive ? 'color: #e58c77; background-color: rgba(229,140,119,0.08); border-color: rgba(229,140,119,0.2);' : ''}">
          ${chargesBadgeText}
        </div>
      </div>

      <!-- Plan Details Card -->
      <div class="bento-card plan-details-card">
        <span class="card-label">Plan Details</span>
        <div class="plan-details-content">
          <div class="plan-info-row">
            <span class="plan-type-badge ${planBadgeClass}">${esc(planType)}</span>
            <span class="plan-billing-cycle">${billingText}</span>
          </div>
          ${dateSectionHtml}
        </div>
      </div>

      <!-- Action Button -->
      <button class="btn-refresh" id="refresh-btn" type="button">
        ${refreshIcon} <span>Refresh Usage Data</span>
      </button>

      <!-- Footer Info -->
      <div class="footer-row">
        <button class="footer-link" id="settings-btn" type="button">Settings</button>
        <a class="footer-link" href="https://claude.ai" target="_blank">Open Claude →</a>
      </div>
    </div>`;

  setupThemeToggle();

  // Bind events
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);
}

function triggerRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (!btn || btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  btn.innerHTML = `${refreshIcon} <span>Refreshing...</span>`;

  chrome.runtime.sendMessage({ type: 'TRIGGER_REFRESH' })
    .then((response) => {
      btn.classList.remove('loading');
      chrome.storage.local.get(['usage', 'copilotUsage', 'activeService', 'showCopilot'], (d) => {
        const payload = (response && response.success) ? response.payload : d.usage;
        if (!response || !response.success) {
          btn.innerHTML = `${refreshIcon} <span>Failed to fetch usage</span>`;
          setTimeout(() => {
            btn.innerHTML = `${refreshIcon} <span>Refresh Usage Data</span>`;
          }, 2000);
        }
        renderUI(d.activeService || 'claude', payload, d.copilotUsage, d.showCopilot);
      });
    })
    .catch((err) => {
      btn.classList.remove('loading');
      chrome.storage.local.get(['usage', 'copilotUsage', 'activeService', 'showCopilot'], (d) => {
        renderUI(d.activeService || 'claude', d.usage, d.copilotUsage, d.showCopilot);
      });
    });
}

function triggerCopilotRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (!btn || btn.classList.contains('loading')) return;

  btn.classList.add('loading');
  btn.innerHTML = `${refreshIcon} <span>Refreshing...</span>`;

  chrome.tabs.query({ url: 'https://github.com/settings/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const targetTab = tabs.find(t => t.active) || tabs.find(t => !t.discarded) || tabs[0];
      chrome.tabs.sendMessage(targetTab.id, { type: 'REQUEST_COPILOT_REFRESH', force: true })
        .then((response) => {
          btn.classList.remove('loading');
          chrome.storage.local.get(['copilotUsage', 'activeService', 'showCopilot'], (d) => {
            renderUI(d.activeService || 'copilot', null, d.copilotUsage, d.showCopilot);
          });
        })
        .catch(() => {
          btn.classList.remove('loading');
          chrome.storage.local.get(['copilotUsage', 'activeService', 'showCopilot'], (data) => {
            renderUI(data.activeService || 'copilot', null, data.copilotUsage, data.showCopilot);
          });
        });
    } else {
      btn.innerHTML = `${refreshIcon} <span>Open GitHub Copilot settings tab first</span>`;
      setTimeout(() => {
        btn.classList.remove('loading');
        chrome.storage.local.get(['copilotUsage', 'activeService', 'showCopilot'], (data) => {
          renderUI(data.activeService || 'copilot', null, data.copilotUsage, data.showCopilot);
        });
      }, 1500);
    }
  });
}

function renderCopilotDashboard(cu) {
  const root = document.getElementById('root');

  // Copilot plan billing text mapping
  function copilotBillingText(type) {
    if (type === 'Free') return '$0/mo';
    if (type === 'Pro') return '$10/mo';
    if (type === 'Individual') return '$10/mo';
    if (type === 'Business') return '$19/seat/mo';
    if (type === 'Enterprise') return '$39/seat/mo';
    return 'Active';
  }

  if (!cu) {
    root.innerHTML = `
      <div class="app-container">
        <div class="header">
          <div id="service-toggle-placeholder"></div>
          <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme"></button>
        </div>
        <div class="bento-card">
          <div class="empty-view">
            <span>No Copilot data found yet.</span>
            <a href="https://github.com/settings/billing" target="_blank">Open GitHub Copilot settings →</a>
          </div>
        </div>
        <button class="btn-refresh" id="refresh-btn" type="button">
          ${refreshIcon} <span>Refresh Copilot Data</span>
        </button>
        <div class="footer-row">
          <button class="footer-link" id="settings-btn" type="button">Settings</button>
          <a class="footer-link" href="https://github.com/settings/billing/ai_usage" target="_blank">Open Billing →</a>
        </div>
      </div>`;
    setupThemeToggle();
    document.getElementById('settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('refresh-btn').addEventListener('click', triggerCopilotRefresh);
    return;
  }

  const plan = cu.plan || { type: 'Free', startDate: null, endDate: null };
  const planType = plan.type || 'Free';
  const planBadgeClass = `plan-${planType.toLowerCase()}`;
  const billingText = copilotBillingText(planType);
  const startDateStr = formatDate(plan.startDate);
  const endDateStr = formatDate(plan.endDate);

  const spend = cu.spend || null;
  const subscriptionCost = cu.subscriptionCost || 0;
  const spendAmount = spend?.amount ?? 0;
  const displayPct = cu.pct ?? 0;

  let topCardHtml = '';
  if (cu.aiCredits) {
    // AI credits card — primary display when available
    const { used, total, resetText } = cu.aiCredits;
    const creditPct = Math.min(100, Math.round((used / total) * 100));
    const topColor = getColorForPct(creditPct);
    const resetLine = resetText || (endDateStr !== '—' ? `Resets on ${endDateStr}` : '');
    topCardHtml = `
      <div class="bento-card">
        <span class="card-label">AI USAGE</span>
        <span class="weekly-value" style="color: ${topColor.circle}">${used.toLocaleString()} / ${total.toLocaleString()}</span>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${creditPct}%; background: ${topColor.bar};"></div>
        </div>
        <span class="reset-text">AI credits · ${creditPct}% used${resetLine ? ' · ' + resetLine : ''}</span>
      </div>`;
  } else if (subscriptionCost > 0) {
    topCardHtml = `
      <div class="bento-card">
        <span class="card-label">AI USAGE</span>
        <span class="weekly-value" style="font-size: 14px; color: var(--label-color);">No credit data yet</span>
        <span class="reset-text">Visit <a href="https://github.com/settings/billing" target="_blank" style="color:inherit;text-decoration:underline">GitHub billing</a> to load AI credits</span>
      </div>`;
  } else {
    // Free plan — no subscription cost to show usage against
    topCardHtml = `
      <div class="bento-card">
        <span class="card-label">COPILOT PLAN</span>
        <span class="weekly-value" style="font-size: 18px; color: var(--text-white);">${esc(planType)}</span>
        <span class="reset-text">Free plan · no usage limits</span>
      </div>`;
  }

  // Seats card (if present)
  let seatsHtml = '';
  if (cu.seats) {
    const seatTotal = cu.seats.total != null ? cu.seats.total : '?';
    const seatPct = cu.seats.total ? Math.round((cu.seats.used / cu.seats.total) * 100) : null;
    const seatColor = seatPct != null ? getColorForPct(seatPct).circle : 'var(--label-color)';
    const seatOffset = seatPct != null ? (113.1 - (113.1 * Math.min(seatPct, 100)) / 100).toFixed(1) : '113.1';
    seatsHtml = `
      <div class="bento-card">
        <span class="card-label">Seats</span>
        <div class="circle-card-content">
          <div class="circle-svg-wrap">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="var(--circle-empty)" stroke-width="4"/>
              <circle cx="22" cy="22" r="18" fill="none"
                stroke="${seatColor}" stroke-width="4" stroke-linecap="round"
                stroke-dasharray="113.1" stroke-dashoffset="${seatOffset}"/>
            </svg>
            <div class="circle-text-center" style="font-size: 9px;">${cu.seats.used}/${seatTotal}</div>
          </div>
          <div class="circle-details">
            <span class="circle-val-text">${cu.seats.used} / ${seatTotal}</span>
            <span class="circle-sub-text">seats used</span>
          </div>
        </div>
      </div>`;
  }

  // Plan details dates section
  let dateSectionHtml = '';
  if (startDateStr !== '—' || endDateStr !== '—') {
    dateSectionHtml = `
      <div class="plan-dates">
        <div class="plan-date-col">
          <span class="date-label">Started</span>
          <span class="date-value">${startDateStr}</span>
        </div>
        <div class="plan-date-col">
          <span class="date-label">Renews</span>
          <span class="date-value">${endDateStr}</span>
        </div>
      </div>`;
  }

  root.innerHTML = `
    <div class="app-container">
      <div class="header">
        <div id="service-toggle-placeholder"></div>
        <button id="theme-toggle" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme"></button>
      </div>

      ${topCardHtml}

      ${cu.seats ? `<div class="grid-row">${seatsHtml}<div class="bento-card plan-details-card">
        <span class="card-label">Plan Details</span>
        <div class="plan-details-content">
          <div class="plan-info-row">
            <span class="plan-type-badge ${planBadgeClass}">${esc(planType)}</span>
            <span class="plan-billing-cycle">${billingText}</span>
          </div>
          ${dateSectionHtml}
        </div>
      </div></div>` : `
      <div class="bento-card plan-details-card">
        <span class="card-label">Plan Details</span>
        <div class="plan-details-content">
          <div class="plan-info-row">
            <span class="plan-type-badge ${planBadgeClass}">${esc(planType)}</span>
            <span class="plan-billing-cycle">${billingText}</span>
          </div>
          ${dateSectionHtml}
        </div>
      </div>`}

      <button class="btn-refresh" id="refresh-btn" type="button">
        ${refreshIcon} <span>Refresh Copilot Data</span>
      </button>

      <div class="footer-row">
        <button class="footer-link" id="settings-btn" type="button">Settings</button>
        <a class="footer-link" href="https://github.com/settings/billing/ai_usage" target="_blank">Open Billing →</a>
      </div>
    </div>`;

  setupThemeToggle();
  document.getElementById('settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('refresh-btn').addEventListener('click', triggerCopilotRefresh);
}

function renderUI(activeService, usage, copilotUsage, showCopilot) {
  const copilotEnabled = showCopilot !== false;
  const svc = (activeService === 'copilot' && copilotEnabled) ? 'copilot' : 'claude';

  if (svc === 'copilot') {
    renderCopilotDashboard(copilotUsage);
  } else {
    renderClaudeDashboard(usage);
  }

  // Insert toggle switch into placeholder (both dashboards render one)
  const placeholder = document.getElementById('service-toggle-placeholder');
  if (placeholder) {
    const toggle = document.createElement('div');
    toggle.className = 'service-toggle';
    toggle.innerHTML = copilotEnabled
      ? `<button class="service-btn ${svc === 'claude' ? 'active' : ''}" id="btn-claude">Claude</button>
         <button class="service-btn ${svc === 'copilot' ? 'active' : ''}" id="btn-copilot">Copilot <span class="beta-badge">beta</span></button>`
      : `<button class="service-btn active" id="btn-claude">Claude</button>`;
    placeholder.replaceWith(toggle);

    document.getElementById('btn-claude').addEventListener('click', () => {
      chrome.storage.local.set({ activeService: 'claude' });
    });
    if (copilotEnabled) {
      document.getElementById('btn-copilot').addEventListener('click', () => {
        chrome.storage.local.set({ activeService: 'copilot' });
      });
    }
  }
}

let _renderTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.usage || changes.copilotUsage || changes.activeService || changes.showCopilot) {
    clearTimeout(_renderTimer);
    _renderTimer = setTimeout(() => {
      chrome.storage.local.get(['usage', 'copilotUsage', 'activeService', 'showCopilot'], (data) => {
        renderUI(data.activeService || 'claude', data.usage, data.copilotUsage, data.showCopilot);
      });
    }, 150);
  }
});

// Initial draw
chrome.storage.local.get(['usage', 'copilotUsage', 'activeService', 'theme', 'showCopilot'], (data) => {
  if (data.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  renderUI(data.activeService || 'claude', data.usage, data.copilotUsage, data.showCopilot);
});
