import { getApiBaseUrl } from "./platform";

let lastTracked = "";

/** Fire-and-forget page view tracking. Dedupes consecutive identical pages. */
export function trackPage(page: string, userId?: number | null) {
  if (!page || page === lastTracked) return;
  lastTracked = page;

  fetch(`${getApiBaseUrl()}/api/track-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page, user_id: userId }),
  }).catch(() => {}); // fire-and-forget
}
