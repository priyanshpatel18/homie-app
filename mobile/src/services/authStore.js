/**
 * authStore — bridges Privy auth into both the SDK and any remaining raw-fetch services.
 *
 * Privy tokens expire every ~6 hours. RootNavigator refreshes the token
 * when the user authenticates and on app foreground resume. This module:
 *   - Keeps a local token cache that raw-fetch services consume via getAuthHeaders().
 *   - Mirrors the token into @homie/sdk's config so SDK methods send Authorization automatically.
 *
 * Eventually all raw-fetch services should migrate to the SDK; until then this
 * keeps both pathways in sync from a single source.
 */

import { init } from "@homie/sdk";
import { API_URL } from "./api";

let _token = null;

init({ baseUrl: API_URL });

export function setAuthToken(token) {
  _token = token || null;
  init({ baseUrl: API_URL, token: _token ?? undefined });
}

export function getAuthToken() {
  return _token;
}

/** Returns auth header object, or empty object if not logged in. */
export function getAuthHeaders() {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}
