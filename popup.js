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
        chrome.storage.local.get(['usage'], ({ usage }) => {
          renderUI(usage);
        });
      });
    });
  });
}

function renderUI(usage) {
  const root = document.getElementById('root');

  if (!usage) {
    root.innerHTML = `
      <div class="app-container">
        <div class="header">
          <div class="logo-section">
            <div class="logo-badge">C</div>
            <div class="app-title">Claude Limits</div>
          </div>
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
          <span>Not updated</span>
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

    // Defaults (Weekly is top, Session is left, Org is right)
    topLabel = 'WEEKLY USAGE';
    topPct = weeklyPct;
    topResetStr = weeklyResetText ? `Resets in ${weeklyResetText}` : 'Resets in —';

    let leftLabel = 'Session';
    let leftPct = sessionPct;
    let leftResetStr = sessionResetStr;

    let rightLabel = orgName;
    let rightPct = orgPct;
    let rightResetStr = orgResetStr;

    // Dynamically elevate the highest percentage limit to the top card to match the badge
    if (sessionPct > weeklyPct && sessionPct > orgPct) {
      topLabel = 'SESSION LIMIT';
      topPct = sessionPct;
      topResetStr = sessionResetText ? `Resets in ${sessionResetText}` : 'Resets in —';

      leftLabel = 'Weekly';
      leftPct = weeklyPct;
      leftResetStr = weeklyResetStr;
    } else if (orgPct > weeklyPct && orgPct > sessionPct) {
      topLabel = `${orgName.toUpperCase()} LIMIT`;
      topPct = orgPct;
      topResetStr = orgResetText ? `Resets in ${orgResetText}` : 'Resets in —';

      rightLabel = 'Weekly';
      rightPct = weeklyPct;
      rightResetStr = weeklyResetStr;
    }

    // Resolve dynamic colors based on percentages
    const leftColor = getColorForPct(leftPct).circle;
    const rightColor = getColorForPct(rightPct).circle;

    const leftOffset = (113.1 - (113.1 * leftPct) / 100).toFixed(1);
    const rightOffset = (113.1 - (113.1 * rightPct) / 100).toFixed(1);

    middleGridHtml = `
      <div class="grid-row">
        <!-- Left Limit Card -->
        <div class="bento-card">
          <span class="card-label" title="${leftLabel}">${leftLabel}</span>
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
          <span class="card-label" title="${rightLabel}">${rightLabel}</span>
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
    const usageOffset = (113.1 - (113.1 * pct) / 100).toFixed(1);
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
            <span>Subscribed via ${providerName} app. Manage subscription on your ${deviceName}.</span>
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
        <div class="logo-section">
          <div class="logo-badge">C</div>
          <div class="app-title">Claude Limits</div>
        </div>
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
            <span class="plan-type-badge ${planBadgeClass}">${planType}</span>
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
        <span>Updated ${ts ? timeAgo(ts) : '—'}</span>
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

  chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      // Prefer the active tab, then any non-discarded tab, fallback to tabs[0]
      const targetTab = tabs.find(t => t.active) || tabs.find(t => !t.discarded) || tabs[0];
      
      chrome.tabs.sendMessage(targetTab.id, { type: 'REQUEST_REFRESH', force: true })
        .then((response) => {
          btn.classList.remove('loading');
          if (!response || !response.success) {
            chrome.storage.local.get(['usage'], ({ usage: savedUsage }) => {
              renderUI(savedUsage);
            });
            return;
          }
          if (response.payload) {
            renderUI(response.payload);
          }
        })
        .catch((err) => {
          btn.classList.remove('loading');
          chrome.storage.local.get(['usage'], ({ usage: savedUsage }) => {
            renderUI(savedUsage);
          });
        });
    } else {
      btn.innerHTML = `${refreshIcon} <span>No Claude tab open</span>`;
      setTimeout(() => {
        btn.classList.remove('loading');
        chrome.storage.local.get(['usage'], ({ usage: savedUsage }) => {
          renderUI(savedUsage);
        });
      }, 1500);
    }
  });
}

// Listen to storage changes reactively to sync updates
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.usage) {
    renderUI(changes.usage.newValue);
  }
});

// Initial draw
chrome.storage.local.get(['usage', 'theme'], ({ usage, theme }) => {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  renderUI(usage);
});
