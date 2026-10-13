/* Clinic API transport. No bearer, Apple token or encryption key is persisted. */

export class APIError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "APIError";
    this.status = status;
  }
}

export function validateEndpoint(value) {
  let url;
  try { url = new URL(String(value).trim()); }
  catch { throw new APIError("Enter the HTTPS origin of the clinic server."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new APIError("Use an HTTPS server origin without credentials, a path, or query parameters.");
  }
  return url.origin;
}

export function validateAppleRedirect(value) {
  let url;
  try { url = new URL(String(value)); }
  catch { throw new APIError("Enter the exact registered Apple return URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new APIError("Apple web sign-in requires a registered HTTPS return URL.");
  }
  return url.href;
}

export function buildAPIURL(baseURL, path, query = {}) {
  const base = validateEndpoint(baseURL);
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(path) || path.includes("//")) {
    throw new APIError("Invalid clinic API path.");
  }
  const url = new URL(`/v1/${path}`, base);
  for (const [key, value] of query instanceof URLSearchParams ? query.entries() : Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.append(key, String(value));
  }
  return url;
}

function assertConnectedAllowed(allowed) {
  const host = (globalThis.location?.hostname || "").toLowerCase().replace(/\.+$/, "");
  if (!allowed || host === "github.io" || host.endsWith(".github.io")) {
    throw new APIError("This public demonstration cannot connect to clinical services. Use the clinic-approved deployment.");
  }
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

let appleSDKPromise;
function loadAppleSDK() {
  if (globalThis.AppleID?.auth) return Promise.resolve(globalThis.AppleID);
  if (appleSDKPromise) return appleSDKPromise;
  appleSDKPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    const timeout = setTimeout(() => {
      script.remove(); appleSDKPromise = undefined;
      reject(new APIError("Apple sign-in could not be loaded. Check the clinic's network policy."));
    }, 15000);
    script.onload = () => {
      clearTimeout(timeout);
      if (globalThis.AppleID?.auth) resolve(globalThis.AppleID);
      else { appleSDKPromise = undefined; reject(new APIError("Apple sign-in is unavailable.")); }
    };
    script.onerror = () => {
      clearTimeout(timeout); script.remove(); appleSDKPromise = undefined;
      reject(new APIError("Apple sign-in could not be loaded."));
    };
    document.head.append(script);
  });
  return appleSDKPromise;
}

export class APIClient {
  #baseURL;
  #session = null;
  #preparedApple = null;
  #onUnauthorized;
  #allowConnected;
  #authEpoch = 0;

  constructor({ baseURL, onUnauthorized = () => {}, allowConnected = false } = {}) {
    this.#baseURL = baseURL ? validateEndpoint(baseURL) : null;
    this.#onUnauthorized = onUnauthorized;
    this.#allowConnected = allowConnected;
  }

  get baseURL() { return this.#baseURL; }
  get hasSession() {
    return Boolean(this.#session && Date.parse(this.#session.expires_at) > Date.now());
  }
  get session() {
    return this.#session ? Object.freeze({ user_id: this.#session.user_id, expires_at: this.#session.expires_at }) : null;
  }
  get appleSignInReady() { return Boolean(this.#preparedApple && this.#preparedApple.expires > Date.now()); }

  configure({ baseURL, allowConnected = false }) {
    this.clearSession();
    this.#baseURL = validateEndpoint(baseURL);
    this.#allowConnected = allowConnected;
  }

  setSession(session) {
    assertConnectedAllowed(this.#allowConnected);
    if (!session || typeof session.access_token !== "string" || session.access_token.length < 32 ||
        session.access_token.length > 256 || !session.user_id || !Number.isFinite(Date.parse(session.expires_at)) ||
        Date.parse(session.expires_at) <= Date.now()) throw new APIError("The clinic returned an invalid session.");
    this.#authEpoch++;
    this.#session = { access_token: session.access_token, user_id: session.user_id, expires_at: session.expires_at };
    return this.session;
  }

  clearSession() { this.#authEpoch++; this.#session = null; this.#preparedApple = null; }

  #requireSession() {
    assertConnectedAllowed(this.#allowConnected);
    if (!this.hasSession) {
      this.clearSession();
      this.#onUnauthorized();
      throw new APIError("Your session has expired. Sign in again.", 401);
    }
    return this.#session;
  }

  authorizationHeaders() { return { Authorization: `Bearer ${this.#requireSession().access_token}` }; }
  streamAuthMessage() { return { type: "authenticate", access_token: this.#requireSession().access_token }; }

  streamURL(noteId) {
    this.#requireSession();
    const url = buildAPIURL(this.#baseURL, `notes/${noteId}/stream`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }

  async #perform(url, { method = "GET", body, authenticated = true, signal } = {}) {
    assertConnectedAllowed(this.#allowConnected);
    const headers = { Accept: "application/json", ...(authenticated ? this.authorizationHeaders() : {}) };
    const authEpoch = this.#authEpoch;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit", cache: "no-store", redirect: "error", mode: "cors",
        referrerPolicy: "no-referrer", signal: controller.signal,
      });
      if (!response.ok) {
        let message = "The clinic request could not be completed.";
        try {
          const data = await response.json();
          if (typeof data.detail === "string" && data.detail.length < 1000) message = data.detail;
        } catch { /* No raw error bodies enter the interface. */ }
        if (response.status === 401 && authEpoch === this.#authEpoch) { this.clearSession(); this.#onUnauthorized(); }
        throw new APIError(message, response.status);
      }
      if (response.status === 204) return undefined;
      try { return await response.json(); }
      catch { throw new APIError("The clinic returned an unreadable response."); }
    } catch (error) {
      if (error instanceof APIError) throw error;
      if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      throw new APIError("The clinic server could not be reached. Check the connection and the approved web origin.");
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
    }
  }

  request(path, { method = "GET", body, query = {}, authenticated = true, signal } = {}) {
    if (!this.#baseURL) throw new APIError("Configure the clinic server first.");
    return this.#perform(buildAPIURL(this.#baseURL, path, query), { method, body, authenticated, signal });
  }
  health() {
    if (!this.#baseURL) throw new APIError("Configure the clinic server first.");
    return this.#perform(new URL("/health", this.#baseURL), { authenticated: false });
  }
  challenge() { return this.request("auth/challenge", { method: "POST", body: {}, authenticated: false }); }

  async prepareAppleSignIn({ clientId, redirectURI }) {
    assertConnectedAllowed(this.#allowConnected);
    if (!clientId || typeof clientId !== "string" || clientId.length > 200) throw new APIError("Configure the clinic's Apple Services ID.");
    const redirect = validateAppleRedirect(redirectURI);
    if (globalThis.location && new URL(redirect).origin !== globalThis.location.origin) {
      throw new APIError("The registered Apple return URL must belong to this clinic web origin.");
    }
    this.#preparedApple = null;
    const authEpoch = this.#authEpoch;
    const [sdk, challenge] = await Promise.all([loadAppleSDK(), this.challenge()]);
    if (typeof challenge.nonce !== "string" || typeof challenge.challenge_id !== "string") throw new APIError("The clinic returned an invalid sign-in challenge.");
    const state = randomState();
    const nonce = await sha256(challenge.nonce);
    if (authEpoch !== this.#authEpoch) throw new APIError("The workspace changed. Prepare Apple sign-in again.");
    sdk.auth.init({ clientId, redirectURI: redirect, state, nonce, usePopup: true });
    this.#preparedApple = { state, challengeId: challenge.challenge_id, expires: Date.now() + 240000 };
    return true;
  }

  async signInWithApple() {
    assertConnectedAllowed(this.#allowConnected);
    if (!this.appleSignInReady || !globalThis.AppleID?.auth) throw new APIError("Prepare Apple sign-in again, then tap Sign in with Apple.");
    const prepared = this.#preparedApple;
    const authEpoch = this.#authEpoch;
    this.#preparedApple = null;
    let result;
    try {
      // Invoke immediately from the user's click, before the first await.
      result = await globalThis.AppleID.auth.signIn();
    } catch { throw new APIError("Apple sign-in was cancelled or could not finish."); }
    if (authEpoch !== this.#authEpoch) throw new APIError("The workspace changed during sign-in. Prepare Apple sign-in again.");
    const authorization = result?.authorization;
    if (authorization?.state !== prepared.state || typeof authorization.id_token !== "string") {
      throw new APIError("Apple sign-in did not match this request. Start sign-in again.");
    }
    const session = await this.request("auth/apple", {
      method: "POST", authenticated: false,
      body: { identity_token: authorization.id_token, challenge_id: prepared.challengeId },
    });
    if (authEpoch !== this.#authEpoch) throw new APIError("The workspace changed during sign-in. Sign in again.");
    return this.setSession(session);
  }

  async logout() {
    try {
      if (this.hasSession) await this.request("auth/logout", { method: "POST" });
    } finally { this.clearSession(); }
  }
}
