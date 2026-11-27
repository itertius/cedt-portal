// Runs only on the hub's /extension/connect page. Relays the pairing token from the page to the
// extension, after the user clicks Allow there. It never reads anything else on the page.
const reply = (data) =>
  window.postMessage({ source: "cedt-hub-extension", ...data }, location.origin);

reply({ type: "ready" });
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (d?.source !== "cedt-hub") return;
  if (d.type === "hello") reply({ type: "ready" });
  if (d.type === "pair") {
    chrome.runtime.sendMessage({ type: "pair", token: d.token, state: d.state }, (r) =>
      reply({ type: "paired", ok: Boolean(r?.ok) }),
    );
  }
});
