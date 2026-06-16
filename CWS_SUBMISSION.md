# Chrome Web Store — Pending Submission Tasks

## 1. Privacy Policy (required — submission blocked without it)

Create a publicly accessible page with the following content:

> This extension reads usage data from claude.ai and github.com using your active browser session. All data is stored locally in Chrome (chrome.storage.local). No data is sent to any third-party servers. No analytics or tracking of any kind.

**Hosting options:** GitHub Pages, Notion, Google Doc, or any public URL.

**Where to add:** CWS Developer Dashboard → Store listing → Privacy practices → **Privacy policy URL**

---

## 2. `tabs` Permission Justification

**Where to add:** CWS Developer Dashboard → Store listing → **Permission justifications**

Add the following for the `tabs` permission:

> Used to send refresh messages to open claude.ai and github.com/settings tabs when usage data updates in the background.

---

## Status

| Task | Done |
|------|------|
| Remove `copilot_internal` API endpoint | ✅ |
| Self-host Outfit font (no Google Fonts CDN) | ✅ |
| Add privacy policy URL to CWS listing | ⬜ |
| Add `tabs` permission justification to CWS listing | ⬜ |
