# AI Usage Tracker

A Chrome extension that tracks your Claude and GitHub Copilot usage limits — always visible from the toolbar.

## Features

- **Claude** — session limits, weekly limits, plan type, reset times, extra charges, org name
- **GitHub Copilot** — AI credits, billing spend, seats, plan type, cycle dates
- **Unified badge** — toolbar icon shows combined usage at a glance
- **Notifications** — alerts at 50%, 80%, and 100% usage (configurable)
- **Auto-refresh** — polls in the background every 5–30 minutes (configurable)
- **Dark / Light theme** — toggle in the popup
- **All data stays local** — nothing sent to any server; stored in `chrome.storage.local`

## Supported Services

| Service | Data Source |
|---------|-------------|
| Claude (claude.ai) | `/api/organizations` — reads plan and usage via your active session |
| GitHub Copilot | `api.github.com/user/copilot` — reads plan info via your active session |

## Installation

### From Chrome Web Store
*(Link will be added after publication)*

### Manual (Developer Mode)
1. Clone or download this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Saves usage data, settings, and theme preference locally |
| `alarms` | Schedules background refresh and daily reset detection |
| `tabs` | Sends refresh messages to open claude.ai and github.com/settings tabs |
| `notifications` | Shows alerts when usage crosses 50%, 80%, or 100% |
| `host_permissions: claude.ai` | Injects content script to read usage data |
| `host_permissions: github.com` | Injects content script to read Copilot plan data |

## Settings

Open the extension options page to configure:

- **Refresh interval** — 5 / 10 / 15 / 30 minutes
- **Notifications** — enable/disable at 50%, 80%, 100% thresholds
- **Show Copilot** — toggle GitHub Copilot section in the popup

## Privacy

No data is collected, transmitted, or shared. Usage data is read from your active browser sessions on claude.ai and github.com and stored locally on your device only.

See [CWS_SUBMISSION.md](CWS_SUBMISSION.md) for Chrome Web Store submission status.

## Development

```
ai-usage-tracker/
├── manifest.json
├── background.js        # service worker — refresh scheduling, notifications
├── content.js           # runs on claude.ai — scrapes usage data
├── content_github.js    # runs on github.com/settings/* — scrapes Copilot data
├── popup.html / popup.js
├── options.html / options.js
├── fonts/               # self-hosted Outfit font (woff2)
└── icons/
```

No build step required. Load unpacked directly.
