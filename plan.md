# Claude Limit Tracker — Browser Extension Spec

> Hand this file to Claude Code. It contains everything needed to build, structure, and verify the complete extension from scratch. Follow every section in order. Do not skip steps.

---

## What this builds

A Chrome/Edge browser extension (Manifest V3) that:

1. Silently reads Claude's message usage from `claude.ai` via a content script
2. Displays `{pct}%` as a coloured badge on the extension icon — **visible on every tab**, not just claude.ai
3. Auto-refreshes usage every **5 minutes** via `chrome.alarms`, even when claude.ai is not the active tab
4. Shows a popup with a ring progress chart, message count, and reset countdown when the badge is clicked
5. Fires a browser notification when usage crosses 80%
6. Resets the badge automatically when the usage window expires
7. Uses a **gauge arc icon** (purple background, white arc + needle) — not the bolt icon

---

## File structure to create

```
claude-limit-tracker/
├── manifest.json
├── content.js
├── background.js
├── popup.html
├── popup.js
├── generate_icons.py      ← run once to produce PNGs
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 1. `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Claude Limit Tracker",
  "version": "1.0",
  "description": "Shows Claude usage % and reset time on every tab — always visible, always in sync.",
  "permissions": ["storage", "alarms", "tabs", "notifications"],
  "host_permissions": ["https://claude.ai/*"],
  "content_scripts": [
    {
      "matches": ["https://claude.ai/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "Claude Usage Tracker",
    "default_icon": {
      "16":  "icons/icon16.png",
      "32":  "icons/icon32.png",
      "48":  "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16":  "icons/icon16.png",
    "32":  "icons/icon32.png",
    "48":  "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## 2. `content.js`

### Responsibilities
- Extract usage data from the claude.ai DOM
- Watch for DOM changes via `MutationObserver` (catches lazy-rendered updates)
- Send data to `background.js` via `chrome.runtime.sendMessage`
- Deduplicate — only send when data actually changes
- **Do NOT** set any alarms or timers here — that is background's job

### Extraction logic

Claude renders usage in plain text somewhere in the DOM. Try **multiple strategies in order**:

**Strategy A — known selectors (try first, fastest):**
```js
const SELECTORS = [
  '[data-testid="usage-limit"]',
  '[data-testid="token-count"]',
  '.usage-limit',
  '[class*="UsageLimit"]',
  '[class*="usage-limit"]',
  '[class*="tokenCount"]',
];
```

**Strategy B — text node walk (fallback, most resilient):**
Walk all text nodes in `document.body` looking for the pattern `/(\d+)\s+of\s+(\d+)\s+message/i`. Extract `used` and `total` from capture groups 1 and 2.

**Strategy C — innerText scan (last resort):**
Run `document.body.innerText.match(/(\d+)\s+of\s+(\d+)\s+message/i)`.

**Reset time extraction:**
After finding usage text, also scan `document.body.innerText` for `/resets?\s+in\s+([\d]+h?\s*[\d]*m?)/i` to get the reset countdown string.

### Message format to send
```js
chrome.runtime.sendMessage({
  type: 'USAGE_UPDATE',
  payload: {
    used: Number,      // e.g. 18
    total: Number,     // e.g. 45
    pct: Number,       // Math.round(used/total*100)
    resetText: String|null,  // e.g. "3h 20m" or null
    ts: Date.now()
  }
});
```

### Deduplication
Store last sent payload as `let lastSent = null`. Only call `sendMessage` if `JSON.stringify(payload) !== JSON.stringify(lastSent)`. Update `lastSent` after sending.

### Observer + polling
```js
// Watch for DOM mutations (usage updates on new messages)
const observer = new MutationObserver(() => extractUsage());
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});

// Fallback poll every 30s in case observer misses something
setInterval(extractUsage, 30_000);
```

---

## 3. `background.js`

### Responsibilities
- Receive messages from `content.js`
- Store latest usage in `chrome.storage.local`
- Update the badge on all tabs
- **Schedule a `chrome.alarms` alarm every 5 minutes** to trigger a re-read
- Fire a browser notification when pct ≥ 80 (once per threshold crossing, not every poll)
- Reset badge when the alarm named `'reset'` fires after usage window expires

### Alarm strategy (critical — MV3 service workers die after ~30s idle)

```
Alarm name: 'refresh'       → fires every 5 minutes, triggers content script re-read
Alarm name: 'reset'         → fires once at the estimated reset time
```

Create the refresh alarm once on startup:
```js
chrome.alarms.create('refresh', { periodInMinutes: 5 });
```

On `'refresh'` alarm: query all claude.ai tabs and inject a one-shot script to call `extractUsage()` — or use `chrome.scripting.executeScript` if `scripting` permission is added. Alternatively, send a message to the content script tab asking it to re-run extraction.

> Add `"scripting"` to `permissions` in `manifest.json` if using `chrome.scripting.executeScript`.

### Badge color logic
```js
function getBadgeColor(pct) {
  if (pct < 50) return '#1D9E75';  // green
  if (pct < 80) return '#BA7517';  // amber
  return '#E24B4A';                // red
}
```

### Badge update function
```js
function updateBadge(u) {
  const color = getBadgeColor(u.pct);
  chrome.action.setBadgeText({ text: u.pct + '%' });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({
    title: `Claude: ${u.used}/${u.total} messages (${u.pct}%)` +
           (u.resetText ? `\nResets in ${u.resetText}` : '')
  });
}
```

### Notification logic
Track `let notifiedAt = null`. Only fire if `u.pct >= 80 && notifiedAt !== u.pct`:
```js
chrome.notifications.create('limit-warning', {
  type: 'basic',
  iconUrl: 'icons/icon48.png',
  title: 'Claude limit warning',
  message: `${u.pct}% used (${u.used}/${u.total}).` +
           (u.resetText ? ` Resets in ${u.resetText}.` : '')
});
notifiedAt = u.pct;
```

### Reset alarm scheduling
Parse `resetText` into hours:
```js
function parseResetHours(text) {
  if (!text) return 0;
  const h = parseInt(text.match(/(\d+)h/)?.[1] ?? 0);
  const m = parseInt(text.match(/(\d+)m/)?.[1] ?? 0);
  return h + m / 60;
}
```
Schedule: `chrome.alarms.create('reset', { delayInMinutes: Math.ceil(hrs * 60) })`.

On `'reset'` alarm fire:
```js
usage = null;
notifiedAt = null;
chrome.storage.local.remove('usage');
chrome.action.setBadgeText({ text: '' });
chrome.action.setBadgeBackgroundColor({ color: '#888780' });
```

### On startup — restore from storage
```js
chrome.storage.local.get(['usage'], ({ usage: saved }) => {
  if (saved) { usage = saved; updateBadge(saved); }
});
```

### Re-apply badge on tab changes
```js
chrome.tabs.onActivated.addListener(() => { if (usage) updateBadge(usage); });
chrome.tabs.onUpdated.addListener((_, info) => {
  if (info.status === 'complete' && usage) updateBadge(usage);
});
```

---

## 4. `popup.html`

Minimal shell — all rendering done in `popup.js`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 236px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1a1a1a;
      background: #fff;
      font-size: 13px;
    }
    /* --- Layout --- */
    .head { padding: 12px 14px 10px; border-bottom: 0.5px solid #e5e5e5; display: flex; align-items: center; gap: 9px; }
    .head-ico { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .head-title { font-size: 13px; font-weight: 500; }
    .head-sub { font-size: 11px; color: #888; margin-top: 1px; }
    .body { padding: 13px 14px; }
    .ring-row { display: flex; align-items: center; gap: 12px; }
    .ring-wrap { position: relative; width: 68px; height: 68px; flex-shrink: 0; }
    .ring-wrap svg { transform: rotate(-90deg); display: block; }
    .ring-inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .ring-pct { font-size: 16px; font-weight: 500; line-height: 1; }
    .ring-tag { font-size: 9px; color: #aaa; letter-spacing: .5px; margin-top: 2px; }
    .stats { display: flex; flex-direction: column; gap: 9px; }
    .stat-lbl { font-size: 11px; color: #888; margin-bottom: 2px; }
    .stat-val { font-size: 13px; font-weight: 500; }
    .stat-sub { font-size: 11px; color: #bbb; margin-top: 1px; }
    .divider { height: 0.5px; background: #eee; margin: 0 14px; }
    .reset-row { padding: 9px 14px; display: flex; align-items: center; gap: 7px; font-size: 12px; color: #666; }
    .reset-val { font-weight: 500; color: #1a1a1a; margin-left: auto; }
    .foot { padding: 8px 14px 11px; border-top: 0.5px solid #eee; display: flex; align-items: center; justify-content: space-between; }
    .sync { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #aaa; }
    .sync-dot { width: 6px; height: 6px; border-radius: 50%; }
    .open-link { font-size: 11px; color: #534AB7; text-decoration: none; }
    /* --- No data state --- */
    .empty { padding: 22px 16px; text-align: center; line-height: 1.6; color: #888; }
    .empty a { color: #534AB7; }
    /* --- Last updated --- */
    .last-updated { font-size: 10px; color: #bbb; text-align: center; padding: 0 14px 10px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="popup.js"></script>
</body>
</html>
```

---

## 5. `popup.js`

### Colour helper
```js
function getTheme(pct) {
  if (pct < 50) return { bg: '#1D9E75', lt: '#E1F5EE' };
  if (pct < 80) return { bg: '#BA7517', lt: '#FAEEDA' };
  return { bg: '#E24B4A', lt: '#FCEBEB' };
}
```

### Gauge SVG helper
Renders a semicircular gauge icon (same design as the PNG icons).
- Arc spans 210° → 510° (300° sweep) on a circle centred at `(cx, cy)` where `cy = size * 0.56`
- Track arc: full 300°, white at 25% opacity
- Fill arc: 0° → `pct/100 * 300°`, white full opacity
- Needle: line from centre pivot to arc tip
- Hub: filled circle at pivot

```js
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
```

### Clock icon helper (inline SVG, no external deps)
```js
function clockIcon(color) {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="${color}" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`;
}
```

### Format timestamp
```js
function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  return Math.floor(diff / 3600) + 'h ago';
}
```

### Main render
```js
chrome.storage.local.get(['usage'], ({ usage }) => {
  const root = document.getElementById('root');

  if (!usage) {
    root.innerHTML = `
      <div class="empty">
        No data yet.<br>
        Visit <a href="https://claude.ai" target="_blank">claude.ai</a> and send a message.
      </div>`;
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
      <a class="open-link" href="https://claude.ai" target="_blank">Open Claude →</a>
    </div>

    <div class="last-updated">Auto-refreshes every 5 min</div>`;
});
```

---

## 6. `generate_icons.py`

Run this once from the project root to produce the 4 PNG icon files. Requires `cairosvg` and `Pillow`.

```bash
pip install cairosvg Pillow
python generate_icons.py
```

```python
import cairosvg, os, math

BASE = "icons"
os.makedirs(BASE, exist_ok=True)

def make_svg(size):
    c = size / 2
    cy = size * 0.56
    r = size * 0.34
    sw = size * 0.075
    nl = size * 0.28
    hr = size * 0.07
    rx = size * 0.18          # corner radius of background rect
    pct = 0.30                 # needle resting at 30% for the icon

    def arc(start_deg, end_deg, large):
        sr = math.radians(start_deg)
        er = math.radians(end_deg)
        sx = c + r * math.cos(sr);  sy = cy + r * math.sin(sr)
        ex = c + r * math.cos(er);  ey = cy + r * math.sin(er)
        return f"M{sx:.2f} {sy:.2f} A{r:.2f} {r:.2f} 0 {large} 1 {ex:.2f} {ey:.2f}"

    track = arc(210, 510, 1)
    sweep = pct * 300
    fill  = arc(210, 210 + sweep, 1 if sweep > 180 else 0)
    na = math.radians(210 + sweep)
    nx = c  + nl * math.cos(na)
    ny = cy + nl * math.sin(na)

    return f"""<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{size}" height="{size}" rx="{rx:.1f}" fill="#534AB7"/>
  <path d="{track}" fill="none" stroke="#ffffff" stroke-width="{sw:.2f}" stroke-linecap="round" opacity="0.25"/>
  <path d="{fill}" fill="none" stroke="#ffffff" stroke-width="{sw:.2f}" stroke-linecap="round"/>
  <line x1="{c:.2f}" y1="{cy:.2f}" x2="{nx:.2f}" y2="{ny:.2f}" stroke="#ffffff" stroke-width="{sw*0.75:.2f}" stroke-linecap="round"/>
  <circle cx="{c:.2f}" cy="{cy:.2f}" r="{hr:.2f}" fill="#ffffff"/>
</svg>"""

for size in [16, 32, 48, 128]:
    svg = make_svg(size)
    cairosvg.svg2png(
        bytestring=svg.encode(),
        write_to=f"{BASE}/icon{size}.png",
        output_width=size,
        output_height=size
    )
    print(f"icons/icon{size}.png ✓")

print("Done.")
```

---

## 7. Auto-refresh every 5 minutes — implementation detail

The refresh works via `chrome.alarms` because MV3 service workers are terminated by Chrome after ~30 seconds of inactivity. `setTimeout` / `setInterval` inside `background.js` will not survive.

### Setup in `background.js` (run on service worker start):
```js
// Create persistent 5-minute alarm (idempotent — safe to call multiple times)
chrome.alarms.get('refresh', (existing) => {
  if (!existing) {
    chrome.alarms.create('refresh', { periodInMinutes: 5 });
  }
});
```

### On alarm fire:
```js
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh') {
    // Find all claude.ai tabs and ask content script to re-extract
    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_REFRESH' }, () => {
          // Ignore errors if tab has no content script loaded yet
          if (chrome.runtime.lastError) {}
        });
      });
    });
  }

  if (alarm.name === 'reset') {
    // ... reset logic above
  }
});
```

### In `content.js` — listen for refresh request:
```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REQUEST_REFRESH') {
    extractUsage();
  }
});
```

This means:
- User opens claude.ai → content script extracts immediately
- Every 5 min → background pings claude.ai tabs → content re-extracts → badge updates
- Badge stays accurate even during long sessions on other tabs

---

## 8. Permissions summary

In `manifest.json` `"permissions"` array:

| Permission    | Why needed |
|---------------|------------|
| `storage`     | Persist usage across service worker restarts |
| `alarms`      | 5-min refresh + reset timer |
| `tabs`        | Query claude.ai tabs for refresh ping |
| `notifications` | Fire warning at 80% |
| `scripting`   | (Optional) inject script into claude.ai tabs if sendMessage approach fails |

In `"host_permissions"`:

| Pattern | Why |
|---------|-----|
| `https://claude.ai/*` | Allow content script injection and tab messaging |

---

## 9. Edge cases to handle

| Scenario | Handling |
|----------|----------|
| claude.ai not open | Badge shows last known value from `storage`; refresh alarm still runs but finds no tabs |
| DOM selectors change | Fall through Strategy A → B → C; log a warning if all fail |
| `resetText` missing | Show `—` in popup; skip scheduling reset alarm |
| Service worker restarts | On `chrome.runtime.onInstalled` and startup: restore from storage, recreate alarms |
| Usage hits 100% | Badge shows `100%`, red; notification fires once |
| Multiple claude.ai tabs | `chrome.tabs.query` returns all; content script deduplication means only new payloads send |
| User clears extension storage | Badge clears; repopulates on next visit to claude.ai |
| `chrome.runtime.lastError` on sendMessage | Always check and swallow — tab may not have content script |

---

## 10. How to load and test

```bash
# 1. Generate icons (one time)
pip install cairosvg Pillow
python generate_icons.py

# 2. Open Chrome
# 3. Navigate to chrome://extensions
# 4. Toggle "Developer mode" ON (top-right)
# 5. Click "Load unpacked"
# 6. Select the claude-limit-tracker/ folder

# 7. Visit https://claude.ai and send a message
# 8. Badge should populate within seconds

# 9. To test 5-min refresh without waiting:
#    Open chrome://extensions → find the extension → click "Service Worker"
#    In the DevTools console that opens:
chrome.alarms.getAll(console.log)          // verify 'refresh' alarm exists
chrome.alarms.create('refresh', {delayInMinutes: 0.1})  // fire in 6 seconds
```

---

## 11. Common bugs to avoid

| Bug | Fix |
|-----|-----|
| `chrome.action.setBadgeText` not updating on all tabs | It updates globally — no tab ID needed. Do not pass `tabId`. |
| Badge disappears after browser restart | Restore from `chrome.storage.local` on startup event |
| `chrome.alarms` alarm not firing | Only one alarm with a given name can exist; use `.get()` before `.create()` |
| Content script errors on `sendMessage` when background is asleep | Background wakes on alarm; content → background messages wake it automatically |
| Needle angle math off | Gauge spans 210°–510° (300° sweep). At 0%: needle at 210°. At 100%: needle at 510° (= 150°). Convert to radians before `Math.cos`/`Math.sin`. |
| `stroke-dashoffset` wrong on ring | Circumference = `2 * π * r`. For r=28: `2 * π * 28 ≈ 175.93`. At 0%: offset = 175.93. At 100%: offset = 0. Formula: `offset = CIRC - (CIRC * pct / 100)`. |
| Extension icon not showing gauge | Chrome uses `default_icon` from `action`; if missing it falls back to generic puzzle piece |
| Notification fires on every poll | Gate with `notifiedAt` variable; reset it to `null` when usage resets |

---

## 12. Final checklist before handing off

- [ ] `manifest.json` has `"manifest_version": 3`
- [ ] All 4 icon sizes present in `icons/`
- [ ] `content.js` uses 3-strategy extraction with deduplication
- [ ] `content.js` listens for `REQUEST_REFRESH` messages
- [ ] `background.js` creates `'refresh'` alarm with `periodInMinutes: 5`
- [ ] `background.js` creates `'reset'` alarm based on parsed `resetText`
- [ ] `background.js` restores from storage on startup
- [ ] `background.js` re-applies badge on `tabs.onActivated` and `tabs.onUpdated`
- [ ] `popup.js` reads from `chrome.storage.local` (not live DOM)
- [ ] Popup shows ring chart, message count, reset time, last-updated timestamp
- [ ] Notification fires once at ≥80%, not repeatedly
- [ ] All `chrome.runtime.lastError` cases are caught and swallowed
- [ ] No `setInterval` / `setTimeout` used in `background.js`
