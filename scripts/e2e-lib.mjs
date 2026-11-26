// Shared helpers for the e2e scripts: a cookie jar, page fetching and server-action form posts.
import { readFileSync } from "node:fs";

export const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
export const pass = (msg) => console.log(`ok - ${msg}`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bangkok-local "YYYY-MM-DD", `days` from today. */
export const bkkDay = (days) =>
  new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

export class Client {
  constructor(base, curlJarPath) {
    this.base = base;
    this.cookies = new Map();
    if (curlJarPath) {
      for (const line of readFileSync(curlJarPath, "utf8").split("\n")) {
        const l = line.replace(/^#HttpOnly_/, "");
        if (!l || l.startsWith("#")) continue;
        const p = l.split("\t");
        if (p.length >= 7) this.cookies.set(p[5], p[6]);
      }
    }
  }

  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** Request with our cookies. Absolute URLs to other hosts get no cookies. */
  async request(pathOrUrl, init = {}) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : this.base + pathOrUrl;
    const ours = url.startsWith(this.base);
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...(ours ? { cookie: this.header(), origin: this.base } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (ours) this.absorb(res);
    return res;
  }

  async get(path) {
    const res = await this.request(path);
    return { status: res.status, html: await res.text(), location: res.headers.get("location") };
  }

  async postJson(path, body) {
    const res = await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  /** Submit a server-action <form> (from forms()) with extra fields, like a browser without JS. */
  async submit(path, form, fields) {
    const body = new FormData();
    for (const [k, v] of form.hidden) body.append(k, v);
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    const res = await this.request(path, { method: "POST", body });
    return { status: res.status, location: res.headers.get("location") };
  }
}

/** Every <form> on the page with its hidden inputs. */
export function forms(html) {
  return [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((m) => {
    const hidden = [...m[1].matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)]
      .map((i) => [
        /name="([^"]*)"/.exec(i[0])?.[1],
        (/value="([^"]*)"/.exec(i[0])?.[1] ?? "")
          .replaceAll("&quot;", '"')
          .replaceAll("&amp;", "&"),
      ])
      .filter(([n]) => n);
    return { html: m[0], hidden };
  });
}

export async function waitFor(fn, what, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) fail(`timed out waiting for ${what}`);
    await sleep(500);
  }
}
