// CEDT Hub extension: keeps the Intern Portal session cookie synced with the user's hub.
// It only reads cookies of the Intern Portal (host_permissions) and only talks to the paired hub.

const DEFAULT_PORTAL = "https://cedtintern.cp.eng.chula.ac.th";
const RESEND_AFTER_MS = 6 * 60 * 60 * 1000; // re-send an unchanged cookie at most every 6 h
const PAIR_TIMEOUT_MS = 10 * 60 * 1000;

const store = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (v) => chrome.storage.local.set(v),
  remove: (keys) => chrome.storage.local.remove(keys),
};

async function config() {
  const c = await store.get([
    "hubUrl",
    "token",
    "portalUrl",
    "last",
    "lastSentHash",
    "lastSentAt",
    "pending",
  ]);
  return { ...c, portalUrl: c.portalUrl || DEFAULT_PORTAL };
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cookieHeader(portalUrl) {
  const cookies = await chrome.cookies.getAll({ url: portalUrl });
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

const BADGE = {
  ok: { text: "", color: "#43a047" },
  "needs-login": { text: "!", color: "#f4511e" },
  unpaired: { text: "!", color: "#757575" },
  error: { text: "!", color: "#c62828" },
  "not-connected": { text: "", color: "#757575" },
};

async function setStatus(last) {
  const entry = { ...last, at: Date.now() };
  await store.set({ last: entry });
  const b = BADGE[entry.state] ?? BADGE.error;
  await chrome.action.setBadgeText({ text: b.text });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
  return entry;
}

/** Send the portal cookie to the hub if it changed (or when forced). */
async function syncCookie({ force = false } = {}) {
  const c = await config();
  if (!c.token || !c.hubUrl) return setStatus({ state: "not-connected" });
  const header = await cookieHeader(c.portalUrl);
  if (!header) return setStatus({ state: "needs-login" });

  const hash = await sha256(header);
  const fresh =
    c.last?.state === "ok" &&
    hash === c.lastSentHash &&
    Date.now() - (c.lastSentAt ?? 0) < RESEND_AFTER_MS;
  if (fresh && !force) return c.last;

  try {
    const res = await fetch(`${c.hubUrl}/api/extension/intern-cookie`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cookie: header }),
    });
    if (res.status === 401) {
      await store.remove(["token", "lastSentHash", "lastSentAt"]);
      return setStatus({ state: "unpaired" });
    }
    if (res.status === 422) return setStatus({ state: "needs-login" });
    if (!res.ok) return setStatus({ state: "error", message: `CEDT Hub answered ${res.status}` });
    const body = await res.json().catch(() => ({}));
    await store.set({ lastSentHash: hash, lastSentAt: Date.now() });
    return setStatus({ state: "ok", openings: body.openings ?? null });
  } catch {
    return setStatus({ state: "error", message: "Can't reach CEDT Hub" });
  }
}

// ---- Triggers ---------------------------------------------------------------

let debounce;
chrome.cookies.onChanged.addListener(async ({ cookie }) => {
  const { portalUrl } = await config();
  const host = new URL(portalUrl).hostname;
  const domain = cookie.domain.replace(/^\./, "");
  if (host !== domain && !host.endsWith(`.${domain}`)) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => syncCookie(), 1500);
});

const ensureAlarm = () => chrome.alarms.create("sync", { periodInMinutes: 30 });
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  syncCookie();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "sync") syncCookie();
});

// ---- Messages from the popup and the hub's pairing page ---------------------

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function handle(msg, sender) {
  switch (msg?.type) {
    case "get-state": {
      const c = await config();
      return {
        hubUrl: c.hubUrl ?? null,
        paired: Boolean(c.token),
        last: c.last ?? null,
        portalUrl: c.portalUrl,
      };
    }
    case "set-portal": {
      await store.set({ portalUrl: msg.portalUrl || DEFAULT_PORTAL });
      return { ok: true };
    }
    case "start-pair": {
      const hubUrl = new URL(msg.hubUrl).origin;
      const state = randomState();
      await store.set({ pending: { state, hubUrl, at: Date.now() } });
      await chrome.tabs.create({ url: `${hubUrl}/extension/connect?state=${state}` });
      return { ok: true };
    }
    case "pair": {
      // Only from our content script, on the hub the user chose, for the pairing the user started.
      if (sender.id !== chrome.runtime.id || !sender.tab) return { ok: false };
      const { pending } = await store.get(["pending"]);
      const origin = new URL(sender.url ?? "about:blank").origin;
      const valid =
        pending &&
        msg.state === pending.state &&
        origin === pending.hubUrl &&
        Date.now() - pending.at < PAIR_TIMEOUT_MS &&
        typeof msg.token === "string" &&
        msg.token.startsWith("cedtx_");
      if (!valid) return { ok: false };
      await store.set({ hubUrl: pending.hubUrl, token: msg.token });
      await store.remove(["pending", "lastSentHash", "lastSentAt"]);
      syncCookie({ force: true });
      return { ok: true };
    }
    case "sync-now":
      return syncCookie({ force: true });
    case "disconnect":
      await store.remove(["token", "hubUrl", "last", "lastSentHash", "lastSentAt"]);
      await chrome.action.setBadgeText({ text: "" });
      return { ok: true };
    default:
      return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply, () => reply({ ok: false }));
  return true; // async reply
});
