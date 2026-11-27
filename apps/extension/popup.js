const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function showStatus(last) {
  const el = $("intern-status");
  $("open-portal").hidden = true;
  el.className = "";
  if (!last || last.state === "not-connected") {
    el.textContent = "Not synced yet.";
  } else if (last.state === "ok") {
    el.className = "ok";
    el.textContent = `Intern Portal synced ${ago(last.at)}${last.openings != null ? ` · ${last.openings} openings` : ""}.`;
  } else if (last.state === "needs-login") {
    el.className = "warn";
    el.textContent = "Log in to the Intern Portal to sync.";
    $("open-portal").hidden = false;
  } else if (last.state === "unpaired") {
    el.className = "error";
    el.textContent = "This browser was disconnected in CEDT Hub. Connect it again.";
  } else {
    el.className = "error";
    el.textContent = last.message ?? "Sync failed.";
  }
}

async function render() {
  const s = await send({ type: "get-state" });
  $("portal").value = s.portalUrl;
  $("paired").hidden = !s.paired;
  $("unpaired").hidden = s.paired;
  if (s.paired) {
    $("who").textContent = `Connected to ${new URL(s.hubUrl).host}.`;
    showStatus(s.last);
    // Ask the hub who we are (best effort; works offline-safe).
    try {
      const { token } = await chrome.storage.local.get(["token"]);
      const res = await fetch(`${s.hubUrl}/api/extension/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json();
        if (body.user?.name)
          $("who").textContent = `Connected to ${new URL(s.hubUrl).host} as ${body.user.name}.`;
      }
    } catch {}
  } else if (s.last?.state === "unpaired") {
    $("unpaired").querySelector("p").textContent =
      "This browser was disconnected in CEDT Hub. Connect it again to keep syncing.";
  }
}

$("hub").addEventListener("change", () => {
  $("hub-custom").hidden = $("hub").value !== "custom";
});
$("connect").addEventListener("click", async () => {
  const hubUrl = $("hub").value === "custom" ? $("hub-custom").value : $("hub").value;
  try {
    new URL(hubUrl);
  } catch {
    $("hub-custom").focus();
    return;
  }
  await send({ type: "start-pair", hubUrl });
  window.close();
});
$("sync").addEventListener("click", async () => {
  $("sync").disabled = true;
  showStatus(await send({ type: "sync-now" }));
  $("sync").disabled = false;
});
$("open-portal").addEventListener("click", async () => {
  const s = await send({ type: "get-state" });
  chrome.tabs.create({ url: s.portalUrl });
});
$("disconnect").addEventListener("click", async () => {
  await send({ type: "disconnect" });
  render();
});
$("save-portal").addEventListener("click", async () => {
  await send({ type: "set-portal", portalUrl: $("portal").value });
  render();
});

// Live status: re-render whenever the background worker records a new sync result.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.last || changes.token)) render();
});

render();
