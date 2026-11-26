/** MyCourseVille public API. Override the host with MCV_BASE_URL (e.g. the local mock). */
export function mcvBaseUrl(): string {
  return (process.env.MCV_BASE_URL ?? "https://www.mycourseville.com").replace(/\/$/, "");
}

export function mcvUrls(base = mcvBaseUrl()) {
  return {
    authorize: `${base}/api/oauth/authorize`,
    token: `${base}/api/oauth/access_token`,
    me: `${base}/api/v1/public/users/me`,
    courses: `${base}/api/v1/public/get/user/courses?detail=1`,
    assignments: (cvCid: string) =>
      `${base}/api/v1/public/get/course/assignments?cv_cid=${encodeURIComponent(cvCid)}&detail=1`,
  };
}

/** Links that open the item on mycourseville.com (always the real site, never the mock). */
export const mcvLinks = {
  home: "https://www.mycourseville.com",
  course: (cvCid: string) =>
    `https://www.mycourseville.com/?q=courseville/course/${encodeURIComponent(cvCid)}`,
  assignment: (cvCid: string, itemId: string) =>
    `https://www.mycourseville.com/?q=courseville/worksheet/${encodeURIComponent(cvCid)}/${encodeURIComponent(itemId)}`,
};

export class McvApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "McvApiError";
  }
}

export async function mcvGet<T>(
  url: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new McvApiError(`MCV ${res.status} for ${new URL(url).pathname}`, res.status);
  return (await res.json()) as T;
}
