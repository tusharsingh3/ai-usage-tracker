const refreshIcon = `
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
  <path d="M23 4v6h-6"></path>
  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
</svg>`;

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

function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
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
          <div class="status-badge" style="color: #706a65;">
            <div class="status-dot" style="background-color: #706a65; box-shadow: none;"></div>
            <span>Offline</span>
          </div>
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
        <div class="footer-row" style="justify-content: center;">
          <button class="footer-link" id="settings-btn" style="background:none; border:none; cursor:pointer;" type="button">Settings</button>
        </div>
      </div>`;
    
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
    let leftColor = '#58b385'; // mint green
    let leftResetStr = sessionResetStr;

    let rightLabel = orgName;
    let rightPct = orgPct;
    let rightColor = '#dfb86c'; // gold
    let rightResetStr = orgResetStr;

    // Dynamically elevate the highest percentage limit to the top card to match the badge
    if (sessionPct > weeklyPct && sessionPct > orgPct) {
      // Session is highest
      topLabel = 'SESSION LIMIT';
      topPct = sessionPct;
      topResetStr = sessionResetText ? `Resets in ${sessionResetText}` : 'Resets in —';

      leftLabel = 'Weekly';
      leftPct = weeklyPct;
      leftColor = '#e58c77'; // coral
      leftResetStr = weeklyResetStr;
    } else if (orgPct > weeklyPct && orgPct > sessionPct) {
      // Org is highest
      topLabel = `${orgName.toUpperCase()} LIMIT`;
      topPct = orgPct;
      topResetStr = orgResetText ? `Resets in ${orgResetText}` : 'Resets in —';

      rightLabel = 'Weekly';
      rightPct = weeklyPct;
      rightColor = '#e58c77'; // coral
      rightResetStr = weeklyResetStr;
    }

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
                <circle cx="22" cy="22" r="18" fill="none" stroke="#2b2826" stroke-width="4"/>
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
                <circle cx="22" cy="22" r="18" fill="none" stroke="#2b2826" stroke-width="4"/>
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

    middleGridHtml = `
      <div class="grid-row">
        <!-- Messages Used Card -->
        <div class="bento-card">
          <span class="card-label">Used</span>
          <div class="circle-card-content">
            <div class="circle-svg-wrap">
              <svg width="44" height="44" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="#2b2826" stroke-width="4"/>
                <circle cx="22" cy="22" r="18" fill="none"
                  stroke="#e58c77" stroke-width="4" stroke-linecap="round"
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

  root.innerHTML = `
    <div class="app-container">
      <!-- Header -->
      <div class="header">
        <div class="logo-section">
          <div class="logo-badge">C</div>
          <div class="app-title">Claude Limits</div>
        </div>
        <div class="status-badge">
          <div class="status-dot"></div>
          <span>Live</span>
        </div>
      </div>

      <!-- Top Usage Card (Highest Limit) -->
      <div class="bento-card">
        <span class="card-label">${topLabel}</span>
        <span class="weekly-value">${topPct}%</span>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${topPct}%"></div>
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

      <!-- Action Button -->
      <button class="btn-refresh" id="refresh-btn" type="button">
        ${refreshIcon} <span>Refresh Usage Data</span>
      </button>

      <!-- Footer Info -->
      <div class="footer-row">
        <span>Updated ${ts ? timeAgo(ts) : '—'}</span>
        <div style="display: flex; gap: 10px;">
          <button class="footer-link" id="settings-btn" style="background:none; border:none; cursor:pointer;" type="button">Settings</button>
          <a class="footer-link" href="https://claude.ai" target="_blank">Open Claude →</a>
        </div>
      </div>
    </div>`;

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
      chrome.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_REFRESH', force: true }, () => {
        if (chrome.runtime.lastError) {
          // Ignore tab refresh errors if connection fails
        }
        
        // Give content script 1s to fetch from API and save
        setTimeout(() => {
          chrome.storage.local.get(['usage'], ({ usage: updatedUsage }) => {
            btn.classList.remove('loading');
            renderUI(updatedUsage);
          });
        }, 1000);
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

// Initial draw
chrome.storage.local.get(['usage'], ({ usage }) => {
  renderUI(usage);
});
