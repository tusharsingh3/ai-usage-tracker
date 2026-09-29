# AI Usage Tracker

A Chrome extension that tracks your Claude, ChatGPT, Codex, and GitHub Copilot usage limits — always visible from the toolbar.

## Features

- **Claude** — session limits, weekly limits, plan type, reset times, extra charges, org name
- **ChatGPT** — plan/workspace details and measurable model or tool quotas exposed by the current account UI
- **Codex** — session and weekly limits, reset times, plan/workspace details, and available credits
- **GitHub Copilot** — AI credits, billing spend, seats, plan type, cycle dates
- **Badge** — shows the highest enabled usage, active service, or a selected service
- **Notifications** — per-service alerts at 50%, 80%, and 100% for measurable quotas
- **Auto-refresh** — polls enabled services in the background every 5–30 minutes (configurable)
- **Dark / Light theme** — toggle in the popup
- **All data stays local** — nothing sent to any server; stored in `chrome.storage.local`

## Supported Services

| Service | Data Source |
|---------|-------------|
| Claude (claude.ai) | `/api/organizations` — reads plan and usage via your active session |
| ChatGPT (chatgpt.com) | Active ChatGPT session and visible model/tool quota notices |
| Codex (chatgpt.com) | Codex account usage surface — reads session/weekly limits and credits via your active session |
| GitHub Copilot | `api.github.com/user/copilot` — reads plan info via your active session |

ChatGPT does not provide one combined usage percentage across chat models and tools. The extension displays individual measurable quotas when ChatGPT exposes them and never invents a combined percentage.

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
| `tabs` | Sends refresh messages to open ChatGPT and GitHub settings tabs |
| `notifications` | Shows alerts when usage crosses 50%, 80%, or 100% |
| `host_permissions: claude.ai` | Injects content script to read usage data |
| `host_permissions: chatgpt.com` | Reads ChatGPT plan/quota notices and Codex usage through your active session |
| `host_permissions: github.com` | Injects content script to read Copilot plan data |

## Settings

Open the extension options page to configure:

- **Refresh interval** — 5 / 10 / 15 / 20 / 25 / 30 minutes
- **Notifications** — enable/disable at 50%, 80%, 100% thresholds
- **Show ChatGPT / Codex / Copilot** — choose which service tabs are visible
- **Toolbar badge** — highest usage, active tab, or a fixed service

## Privacy

No data is collected, transmitted, or shared. Usage data is read from your active browser sessions on claude.ai, chatgpt.com, and github.com and stored locally on your device only. ChatGPT session tokens are used only in memory for the account usage request and are never stored by the extension.

See [CWS_SUBMISSION.md](CWS_SUBMISSION.md) for Chrome Web Store submission status.

## Development

```
ai-usage-tracker/
├── manifest.json
├── background.js        # service worker — refresh scheduling, notifications
├── content.js           # runs on claude.ai — scrapes usage data
├── content_openai.js    # runs on chatgpt.com — ChatGPT and Codex usage
├── content_github.js    # runs on github.com/settings/* — scrapes Copilot data
├── popup.html / popup.js
├── options.html / options.js
├── fonts/               # self-hosted Outfit font (woff2)
└── icons/
```

No build step required. Load unpacked directly.
