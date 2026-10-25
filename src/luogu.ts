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

// C3VK value from the last anti-bot challenge, reused for later requests.
let c3vkJar: string | undefined;

async function getJson(url: string, userCookie?: string, retried = false): Promise<unknown> {
  const cookie = [userCookie, c3vkJar && `C3VK=${c3vkJar}`].filter(Boolean).join("; ") || undefined;
  let res: Response;
  log(`请求 ${url}${cookie ? "（带 Cookie）" : ""}`);
  try {
    res = await fetch(url, { headers: headers(cookie), redirect: "follow" });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const detail = err.cause?.code ?? err.cause?.message ?? err.message;
    log(`网络错误：${err.message} ${detail}`);
    throw new LuoguError(`连不上洛谷（${detail}）。请确认浏览器能打开洛谷；如果你的网络需要代理，插件目前用不了代理。`);
  }
  const text = await res.text();
  log(`状态 ${res.status}，类型 ${res.headers.get("content-type")}，前 300 字：${text.slice(0, 300).replace(/\s+/g, " ")}`);

  const c3vk = challengeCookie(text);
  if (c3vk && !retried) {
    log("遇到洛谷防爬验证，带上 C3VK 重试");
    c3vkJar = c3vk;
    return getJson(url, userCookie, true);
  }
  if (!res.ok) throw new LuoguError(`洛谷返回了错误 ${res.status}。`);
  try {
    return JSON.parse(text);
  } catch {
    throw new LuoguError("洛谷返回的是网页而不是数据，可能需要在设置里填写洛谷 Cookie。");
  }
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
  let json = await getJson(`${BASE}/user/${uid}/practice`, cookie);
  try {
    return parsePassed(json);
  } catch (e) {
    // Fall back to the older endpoint before giving up.
    try {
      json = await getJson(`${BASE}/user/${uid}?_contentOnly=1`, cookie);
      return parsePassed(json);
    } catch {
      throw e;
    }
  }
}

export function problemUrl(pid: string): string {
  return `${BASE}/problem/${pid}`;
}
