// Luogu has no official public API. This uses the same JSON that the Luogu
// website loads for a user's "练习" page. If Luogu changes its site, this is
// the file to fix.

const BASE = "https://www.luogu.com.cn";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export class LuoguError extends Error {}

function headers(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    "x-lentille-request": "content-only",
    Accept: "application/json, text/plain, */*",
    Referer: BASE + "/",
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

let log: (line: string) => void = () => {};
/** Lets the extension show request details in its output panel. */
export function setLogger(fn: (line: string) => void) {
  log = fn;
}

/**
 * Luogu sometimes answers with an anti-bot page that sets a C3VK cookie and
 * reloads. Returns the cookie value if the page is that challenge.
 */
export function challengeCookie(body: string): string | undefined {
  return body.match(/C3VK=([A-Za-z0-9]+)/)?.[1];
}

/**
 * Cookies Luogu hands out while we talk to it (session id, anti-bot value).
 * Fetch does not keep cookies across redirects by itself, and Luogu keeps
 * redirecting until the cookie it just set comes back, so we keep them here.
 */
const jar = new Map<string, string>();

/** Read "name=value" pairs from Set-Cookie headers. */
export function parseSetCookie(headers: Headers): [string, string][] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const raw = h.getSetCookie
    ? h.getSetCookie()
    : (headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,=\s]+=)/);
  const out: [string, string][] = [];
  for (const line of raw) {
    const m = line.trim().match(/^([^=;\s]+)=([^;]*)/);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

function cookieHeader(userCookie?: string): string | undefined {
  // The user's own cookie (logged-in session) wins over ones we picked up.
  const merged = new Map(jar);
  for (const part of (userCookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) merged.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  if (merged.size === 0) return undefined;
  return [...merged].map(([k, v]) => `${k}=${v}`).join("; ");
}

const MAX_HOPS = 8;

/** GET a URL and parse JSON, following redirects by hand so cookies are kept. */
export async function getJson(url: string, userCookie?: string): Promise<unknown> {
  let current = url;
  let challenged = false;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const cookie = cookieHeader(userCookie);
    log(`请求 ${current}${cookie ? `（带 Cookie：${[...jar.keys(), userCookie ? "你的登录 Cookie" : ""].filter(Boolean).join("、")}）` : ""}`);
    let res: Response;
    try {
      res = await fetch(current, { headers: headers(cookie), redirect: "manual" });
    } catch (e) {
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const detail = err.cause?.code ?? err.cause?.message ?? err.message;
      log(`网络错误：${err.message} ${detail}`);
      throw new LuoguError(`连不上洛谷（${detail}）。请确认浏览器能打开洛谷；如果你的网络需要代理，插件目前用不了代理。`);
    }
    for (const [k, v] of parseSetCookie(res.headers)) jar.set(k, v);

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, current).toString();
      log(`状态 ${res.status}，跳转到 ${next}`);
      if (/\/auth\/login/.test(next)) {
        throw new LuoguError("洛谷要求登录才能看练习记录，请用“设置洛谷 Cookie”命令填上登录 Cookie。");
      }
      current = next;
      continue;
    }

    const text = await res.text();
    log(`状态 ${res.status}，类型 ${res.headers.get("content-type")}，前 300 字：${text.slice(0, 300).replace(/\s+/g, " ")}`);
    const c3vk = challengeCookie(text);
    if (c3vk && !challenged) {
      log("遇到洛谷防爬验证，带上 C3VK 重试");
      jar.set("C3VK", c3vk);
      challenged = true;
      continue;
    }
    if (!res.ok) throw new LuoguError(`洛谷返回了错误 ${res.status}。`);
    try {
      return JSON.parse(text);
    } catch {
      throw new LuoguError("洛谷返回的是网页而不是数据，可能需要用“设置洛谷 Cookie”命令填上登录 Cookie。");
    }
  }
  throw new LuoguError("洛谷一直在跳转，可能需要用“设置洛谷 Cookie”命令填上登录 Cookie。");
}

/** Pull problem ids out of the practice-page JSON. Handles the old and new page formats. */
export function parsePassed(json: unknown): string[] {
  const j = json as any;
  const list =
    j?.data?.passed ?? // new format (x-lentille-request)
    j?.currentData?.passedProblems ?? // old format (_contentOnly=1)
    null;
  if (!Array.isArray(list)) {
    if (j?.data?.user && j?.data?.passed === undefined) {
      throw new LuoguError("这个账号的练习记录不公开，需要在设置里填写洛谷 Cookie。");
    }
    throw new LuoguError("没有在洛谷的返回数据里找到 AC 记录，洛谷可能改了网页。");
  }
  return list.map((p: any) => (typeof p === "string" ? p : p?.pid)).filter((x: any) => typeof x === "string");
}

/** Turn a username or numeric UID into a UID. */
export async function resolveUid(user: string, cookie?: string): Promise<string> {
  const u = user.trim();
  if (/^\d+$/.test(u)) return u;
  const json = (await getJson(`${BASE}/api/user/search?keyword=${encodeURIComponent(u)}`, cookie)) as any;
  const users: any[] = json?.users ?? [];
  const hit = users.find((x) => x?.name === u) ?? users[0];
  if (!hit?.uid) throw new LuoguError(`洛谷上找不到用户「${u}」。`);
  return String(hit.uid);
}

export async function fetchPassed(user: string, cookie?: string): Promise<string[]> {
  const uid = await resolveUid(user, cookie);
  try {
    return parsePassed(await getJson(`${BASE}/user/${uid}/practice`, cookie));
  } catch (e) {
    // Fall back to the older page format before giving up.
    log(`新接口失败（${(e as Error).message}），试旧接口`);
    try {
      return parsePassed(await getJson(`${BASE}/user/${uid}?_contentOnly=1`, cookie));
    } catch {
      throw e;
    }
  }
}

export function problemUrl(pid: string): string {
  return `${BASE}/problem/${pid}`;
}
