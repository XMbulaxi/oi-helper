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

async function getJson(url: string, cookie?: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: headers(cookie) });
  } catch (e) {
    throw new LuoguError(`连不上洛谷：${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new LuoguError(`洛谷返回了错误 ${res.status}`);
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
