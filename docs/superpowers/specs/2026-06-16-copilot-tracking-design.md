# Design: GitHub Copilot Usage Tracking

**Date:** 2026-06-16  
**Status:** Approved

---

## Context

The extension currently tracks only Claude.ai usage (session %, weekly %, plan details, extra charges). The user wants it to also track GitHub Copilot usage so both AI subscriptions are visible in one place. Users switch between Claude and Copilot via a toggle in the popup header. The badge always shows the highest % from either service, and the tooltip shows both at a glance.

---

## Architecture

### Data Flow

```
content.js (claude.ai)         → USAGE_UPDATE         → background.js → storage: usage
content_github.js (github.com) → COPILOT_USAGE_UPDATE → background.js → storage: copilotUsage

popup.js reads activeService ('claude'|'copilot') from storage
→ renders the appropriate dashboard
```

### Storage Keys (additions)

| Key | Type | Purpose |
|-----|------|---------|
| `copilotUsage` | object | Copilot data payload (parallel to `usage`) |
| `activeService` | `'claude'\|'copilot'` | Which tab is selected in popup |

### Copilot Usage Payload Structure

```javascript
{
  source: 'github-dom',
  pct: number | null,          // null if no usage % found on page
  plan: {
    type: 'Free' | 'Individual' | 'Business' | 'Enterprise',
    startDate: string | null,   // ISO date or null
    endDate: string | null,
  },
  seats: { used: number, total: number } | null,  // for Business/Enterprise
  ts: number,                  // Date.now()
}
```

---

## Components

### 1. `content_github.js` (new)

Runs on `https://github.com/settings/copilot*`.

- Scrapes DOM for: plan type, billing dates, usage %, seat counts
- Sends `COPILOT_USAGE_UPDATE` message to background on change
- 30-second polling + MutationObserver (mirrors content.js pattern)
- Deduplication: only sends if payload differs from `lastSent`
- Responds to `REQUEST_COPILOT_REFRESH` message from background

**Scraping targets on `github.com/settings/copilot`:**
- Plan badge/label text → plan type
- Billing period text → startDate / endDate
- Any usage %, seat counts, or completion limits shown
- Falls back gracefully: if no usage % found, `pct: null`

### 2. `manifest.json` (modified)

Additions:
- Host permission: `https://github.com/*`
- Second content script entry: `content_github.js` on `https://github.com/settings/copilot*`

### 3. `background.js` (modified)

**New message handler:** `COPILOT_USAGE_UPDATE` → saves to `copilotUsage` storage, calls `updateBadge`

**`updateBadge` changes:**
- Reads both `usage` (Claude) and `copilotUsage` (Copilot) 
- Badge text = highest pct from either (or whichever has data)
- Badge color = color of that highest pct

**Tooltip format** (user-specified):
```
Claude - 60% / 3 Hours 20 Mins
Copilot - 60%
```
- Claude line: `Session %` or `Weekly %` (whichever is higher) + reset time if available
- Copilot line: `pct%` or `—` if null
- If only one service has data, still shows both lines (other shows `—`)

**Refresh alarm changes:**
- `refresh` alarm now also pings `github.com/settings/copilot` tabs with `REQUEST_COPILOT_REFRESH`

**Reset alarm:** remains Claude-only (Copilot doesn't have a window reset concept)

### 4. `popup.js` (modified)

**Header changes:**
- Replace static `<div class="logo-badge">C</div>` + title with a segmented toggle:  
  `[Claude] [Copilot]` pill — active side highlighted
- Toggle click saves `activeService` to storage, re-renders

**`renderUI` changes:**
- Reads `activeService` from storage
- `activeService === 'claude'` → existing Claude dashboard (no change to logic)
- `activeService === 'copilot'` → new `renderCopilotDashboard(copilotUsage)`

**`renderCopilotDashboard(cu)`:**
- Empty state: "No Copilot data. Visit github.com/settings/copilot"
- With `pct` data: top card with % + progress bar, grid row with plan card
- With `pct: null` (plan-only data): top card shows plan type prominently, no % bar
- Plan details card: mirrors Claude's plan card (type badge + billing + dates)
- Seats card (if `cu.seats`): `Used: X / Total: Y`
- Refresh button → pings GitHub settings tab (shows "No GitHub Copilot settings tab open" if none)
- Footer: "Open GitHub Copilot →" link to `github.com/settings/copilot`

**Storage listener:**
- Existing: reacts to `changes.usage`
- New: also reacts to `changes.copilotUsage` and `changes.activeService`

### 5. `popup.html` (modified)

- Add CSS for the segmented toggle (`.service-toggle`, `.service-btn`, `.service-btn.active`)
- Keep all existing styles intact

---

## Badge Behavior

| Scenario | Badge shows |
|----------|-------------|
| Only Claude data | Claude highest % |
| Only Copilot data | Copilot % |
| Both data | `max(claudePct, copilotPct)` |
| Neither | empty |

Badge color always reflects the displayed %.

---

## Tooltip Format

```
Claude - 45% / 2 Hours 15 Mins
Copilot - 60%
```

- Claude time = `formatToolbarTime(resets_at)` of whichever limit is highest (session or weekly)
- Copilot time omitted if no reset window applies
- If either service has no data yet: `Claude - —` or `Copilot - —`

---

## Verification

1. Load extension with no data → badge empty, both dashboard tabs show empty states
2. Visit `claude.ai` → Claude dashboard populates, badge shows Claude %
3. Visit `github.com/settings/copilot` → Copilot dashboard populates
4. Badge = max of both %s
5. Hover badge → tooltip shows both lines in correct format
6. Toggle Claude ↔ Copilot in popup → correct dashboard shown each time
7. `activeService` persists across popup open/close
8. Refresh button on Claude tab → pings claude.ai tab
9. Refresh button on Copilot tab → pings github settings tab (or shows "no tab" message)
