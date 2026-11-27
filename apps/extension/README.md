# CEDT Hub browser extension

Keeps your CEDT Intern Portal session synced with your CEDT Hub, so you never paste a cookie.

- It can only read cookies of `cedtintern.cp.eng.chula.ac.th` and talk to CEDT Hub (see
  `host_permissions` in `manifest.json`).
- Linking uses a one-time token issued by the hub after you click **Allow**. The hub stores only a
  hash of it, and you can disconnect any browser in Settings.
- The cookie is sent only when it changes (or every 6 h at most), and the hub stores it encrypted.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder (`apps/extension`).
3. Pin the **CEDT Hub** icon, click it, then **Connect to CEDT Hub** → **Allow**.
4. Log in to the Intern Portal once. From then on your hub stays up to date by itself.

The icon shows **!** in orange when you need to log in to the Intern Portal again, and in grey
when the browser was disconnected in Settings.

## Development

- No build step. Edit the files, then press the reload button on `chrome://extensions`.
- `node make-icons.mjs` regenerates the icons.
- End-to-end test: `e2e/tests/phase4-extension.spec.ts` loads this folder into Chromium.
