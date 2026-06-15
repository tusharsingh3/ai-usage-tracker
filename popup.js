function getTheme(pct) {
  if (pct < 50) return { bg: '#1D9E75', lt: '#E1F5EE' };
  if (pct < 80) return { bg: '#BA7517', lt: '#FAEEDA' };
  return { bg: '#E24B4A', lt: '#FCEBEB' };
}

function gaugeIcon(pct, color, size = 18) {
  const c = size / 2;
  const cy = size * 0.56;
  const r = size * 0.34;
  const sw = size * 0.075;
  const nl = size * 0.28;
  const hr = size * 0.07;

  function arcPath(startDeg, endDeg, large) {
    const toRad = a => a * Math.PI / 180;
    const sx = c + r * Math.cos(toRad(startDeg));
    const sy = cy + r * Math.sin(toRad(startDeg));
    const ex = c + r * Math.cos(toRad(endDeg));
    const ey = cy + r * Math.sin(toRad(endDeg));
    return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  const track = arcPath(210, 510, 1);
  const sweep = (pct / 100) * 300;
  const fillPath = sweep > 0 ? arcPath(210, 210 + sweep, sweep > 180 ? 1 : 0) : '';
  const na = ((210 + sweep) * Math.PI) / 180;
  const nx = (c + nl * Math.cos(na)).toFixed(2);
  const ny = (cy + nl * Math.sin(na)).toFixed(2);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <path d="${track}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" opacity="0.25"/>
      ${fillPath ? `<path d="${fillPath}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round"/>` : ''}
      <line x1="${c.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${nx}" y2="${ny}"
            stroke="${color}" stroke-width="${(sw * 0.75).toFixed(2)}" stroke-linecap="round"/>
      <circle cx="${c.toFixed(2)}" cy="${cy.toFixed(2)}" r="${hr.toFixed(2)}" fill="${color}"/>
    </svg>`;
}

function clockIcon(color) {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="${color}" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`;
}

function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}

chrome.storage.local.get(['usage'], ({ usage }) => {
  const root = document.getElementById('root');

  if (!usage) {
    root.innerHTML = `
      <div class="empty">
        No data yet.<br>
        Visit <a href="https://claude.ai" target="_blank">claude.ai</a> and send a message.
      </div>
      <div class="foot" style="justify-content:center; border-top: 0.5px solid #eee;">
        <button class="settings-link" id="settings-btn" type="button">Settings</button>
      </div>`;
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  const { pct, used, total, resetText, ts } = usage;
  const { bg, lt } = getTheme(pct);
  const rem = total - used;
  const CIRC = 175.9;
  const offset = (CIRC - (CIRC * pct) / 100).toFixed(1);
  const stateLabel = pct < 50 ? 'All good' : pct < 80 ? 'Getting close' : 'Almost at limit';

  root.innerHTML = `
    <div class="head">
      <div class="head-ico" style="background:${lt}">
        ${gaugeIcon(pct, bg, 18)}
      </div>
      <div>
        <div class="head-title">Claude usage</div>
        <div class="head-sub">${stateLabel}${resetText ? ' · resets in ' + resetText : ''}</div>
      </div>
    </div>

    <div class="body">
      <div class="ring-row">
        <div class="ring-wrap">
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r="28" fill="none" stroke="#eee" stroke-width="6"/>
            <circle cx="34" cy="34" r="28" fill="none"
              stroke="${bg}" stroke-width="6" stroke-linecap="round"
              stroke-dasharray="175.9" stroke-dashoffset="${offset}"/>
          </svg>
          <div class="ring-inner">
            <span class="ring-pct" style="color:${bg}">${pct}%</span>
            <span class="ring-tag">USED</span>
          </div>
        </div>
        <div class="stats">
          <div>
            <div class="stat-lbl">Messages used</div>
            <div class="stat-val">${used} / ${total}</div>
          </div>
          <div>
            <div class="stat-lbl">Remaining</div>
            <div class="stat-val">${rem}</div>
            <div class="stat-sub">messages left</div>
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="reset-row">
      ${clockIcon(bg)}
      <span>Resets in</span>
      <span class="reset-val">${resetText || '—'}</span>
    </div>

    <div class="divider"></div>

    <div class="foot">
      <div class="sync">
        <div class="sync-dot" style="background:${bg}"></div>
        <span>Updated ${ts ? timeAgo(ts) : '—'}</span>
      </div>
      <div class="foot-links">
        <button class="settings-link" id="settings-btn" type="button">Settings</button>
        <a class="open-link" href="https://claude.ai" target="_blank">Open Claude →</a>
      </div>
    </div>

    <div class="last-updated" id="refresh-note">Auto-refreshes every 5 min</div>`;

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get(['refreshInterval'], ({ refreshInterval }) => {
    const minutes = refreshInterval || 5;
    document.getElementById('refresh-note').textContent = `Auto-refreshes every ${minutes} min`;
  });
});
