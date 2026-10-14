// -----------------------------------------------------------------------------
// Client of the web API of an ASUS router (ASUSWRT stock firmware and
// Asuswrt-Merlin), the one its web interface and the ASUS Router app use.
//
// Written after the asusrouter Python library (Vaskivskyi/asusrouter, Apache
// 2.0, the HTTP library of the Home Assistant ASUSWRT integration), see NOTICE:
//   - login: POST login.cgi `login_authorization=base64(user:password)`, the
//     answer carries an `asus_token`, sent back as a cookie;
//   - reading: POST appGet.cgi `hook=name(args);...` (JSON), and a few .asp
//     pages that answer JavaScript variables (ajax_coretmp.asp,
//     detect_firmware.asp);
//   - commands: POST applyapp.cgi with a JSON body `{ action_mode, rc_service,
//     <nvram>: <value> }`.
//
// The User-Agent must start with "asusrouter-" and carry "DUTUtil": the
// router then treats the client as the ASUS app, answers JSON and does not
// log the web interface out. A token is kept until the router refuses it:
// every login counts in the router's lockout of failed attempts.
//
// node:http(s) rather than fetch: the router's HTTPS certificate is
// self-signed, and only node:https lets the user skip its check without a
// dependency. Errors carry a `kind` the app turns into a message:
//   auth        wrong user name or password (error_status 3)
//   locked      too many failed logins, `retryAfter` seconds (error_status 7),
//               or a captcha asked (10)
//   tls         the certificate is refused (verify_tls on)
//   not_found   404: page absent on this model or firmware
//   unreachable network error, timeout
//   http        any other status or answer
// -----------------------------------------------------------------------------

import https from 'node:https';
import http from 'node:http';

const TIMEOUT_MS = 10000;
const USER_AGENT = 'asusrouter-Android-DUTUtil-1.0.0.245';
// Access error codes of the router (httpd), as the asusrouter library lists them.
const ACCESS = {
  NO_TOKEN: 1,
  AUTHORIZATION: 2,
  CREDENTIALS: 3,
  TRY_AGAIN: 7,
  LOGOUT: 8,
  CAPTCHA: 10,
  RESET_REQUIRED: 11,
};
// A login lock without a stated duration: the router's default is 5 minutes.
const DEFAULT_LOCK_SECONDS = 300;

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

class AsusError extends Error {
  /**
   * @param {string} kind - auth, locked, tls, not_found, unreachable, http.
   * @param {string} message - The message (never carries the password).
   * @param {object} [extra] - `{ status, retryAfter }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AsusError';
    this.kind = kind;
    this.status = extra.status;
    this.retryAfter = extra.retryAfter;
  }
}

/**
 * @description Percent-encode a body the way the asusrouter library sends it
 * (Python `quote`: everything but letters, digits, `_.-~/`).
 * @param {string} text - The body.
 * @returns {string} The encoded body.
 * @example
 * quote('hook=uptime()'); // -> 'hook%3Duptime%28%29'
 */
function quote(text) {
  return encodeURIComponent(text)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, '/');
}

/**
 * @description The access error code of an answer, null when it has none.
 * @param {string} body - The answer.
 * @returns {{ code: number, lock: number|null }|null} The error.
 */
function accessError(body) {
  if (!body.includes('error_status')) {
    return null;
  }
  const code = /"error_status"\s*:\s*"?(\d+)/.exec(body);
  const lock = /"remaining_lock_time"\s*:\s*"?(\d+)/.exec(body);
  return code ? { code: Number(code[1]), lock: lock ? Number(lock[1]) : null } : null;
}

/**
 * @description Whether an answer is the login page the router sends to a
 * client without a valid session (an HTML meta refresh), not data.
 * @param {string} body - The answer.
 * @returns {boolean} True for a bounce page.
 */
const isRedirectPage = (body) => /http-equiv\s*=\s*["']?\s*refresh/i.test(body);

/**
 * @description The error of a failed connection.
 * @param {Error} err - The socket error.
 * @returns {AsusError} The error.
 */
function networkError(err) {
  if (err instanceof AsusError) {
    return err;
  }
  if (TLS_CODES.has(err.code)) {
    return new AsusError('tls', `HTTPS certificate refused: ${err.code}`);
  }
  return new AsusError('unreachable', `Router unreachable: ${err.code ?? err.message}`);
}

/**
 * @description The default transport: one HTTP(S) request, its whole body.
 * @param {object} options - `{ url, method, headers, body, rejectUnauthorized, timeoutMs }`.
 * @returns {Promise<{ status: number, body: string }>} The answer.
 */
function nodeRequest({ url, method, headers, body, rejectUnauthorized, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      target,
      { method, headers, rejectUnauthorized, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
    );
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * @description Create the router client.
 * @param {object} options - Options.
 * @param {Function} options.getConfig - `() => ({ url, username, password, verifyTls })`.
 * @param {Function} [options.request] - Transport (tests): same contract as nodeRequest.
 * @param {Function} [options.now] - `() => number` in ms.
 * @returns {object} The client.
 * @example
 * const api = createAsusClient({ getConfig: () => config });
 * const raw = await api.appGet(['uptime()']);
 */
function createAsusClient({ getConfig, request = nodeRequest, now = () => Date.now() }) {
  let token = null;
  // The address and account the token belongs to.
  let tokenFor = null;
  let loggingIn = null;
  // No login before this instant (a lock of the router, or wrong credentials).
  let blockedUntil = 0;
  let blockedError = null;

  const accountOf = (config) => `${config.url}\n${config.username}\n${config.password}`;

  /**
   * @description Send one request to the router.
   * @param {string} page - The page (login.cgi, appGet.cgi...).
   * @param {string} [body] - The raw body (encoded here).
   * @param {object} [headers] - Extra headers.
   * @returns {Promise<{ status: number, body: string }>} The answer.
   */
  async function send(page, body, headers = {}) {
    const { url, verifyTls } = getConfig();
    const payload = body === undefined ? '' : quote(body);
    try {
      return await request({
        url: `${url}/${page}`,
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          Referer: `${url}/`,
          ...headers,
        },
        body: payload,
        rejectUnauthorized: verifyTls,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (err) {
      throw networkError(err);
    }
  }

  /**
   * @description Log in, unless a lock or a credentials error forbids it.
   * @returns {Promise<string>} The token.
   */
  async function login() {
    const config = getConfig();
    if (!config.url || !config.username || !config.password) {
      throw new AsusError('auth', 'No router address, user name or password configured');
    }
    if (now() < blockedUntil && blockedError) {
      throw blockedError;
    }
    const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const answer = await send('login.cgi', `login_authorization=${credentials}`);
    if (answer.status === 404) {
      throw new AsusError('not_found', 'This device has no ASUSWRT login page (login.cgi)', {
        status: 404,
      });
    }
    const error = accessError(answer.body);
    if (error) {
      throw block(error);
    }
    let parsed = null;
    try {
      parsed = JSON.parse(answer.body);
    } catch {
      // Handled below: no token.
    }
    if (answer.status !== 200 || !parsed?.asus_token) {
      throw new AsusError('http', `The router answered ${answer.status} without a session token`, {
        status: answer.status,
      });
    }
    token = parsed.asus_token;
    tokenFor = accountOf(config);
    blockedUntil = 0;
    blockedError = null;
    return token;
  }

  /**
   * @description Turn a login refusal into an error, and stop logging in for
   * a while: the router locks the account after a few failed attempts.
   * @param {{ code: number, lock: number|null }} error - The access error.
   * @returns {AsusError} The error.
   */
  function block(error) {
    let err;
    if (error.code === ACCESS.TRY_AGAIN || error.code === ACCESS.CAPTCHA) {
      const seconds = error.lock ?? DEFAULT_LOCK_SECONDS;
      err = new AsusError('locked', `The router locked the login for ${seconds} s`, {
        retryAfter: seconds,
      });
      blockedUntil = now() + seconds * 1000;
    } else if (error.code === ACCESS.CREDENTIALS || error.code === ACCESS.AUTHORIZATION) {
      err = new AsusError('auth', 'The router refused the user name or the password');
      // Trying again with the same password would only lock the account.
      blockedUntil = now() + 15 * 60 * 1000;
    } else if (error.code === ACCESS.RESET_REQUIRED) {
      err = new AsusError('auth', 'The router asks for its first setup (reset required)');
      blockedUntil = now() + 15 * 60 * 1000;
    } else {
      err = new AsusError('http', `The router refused the login (error ${error.code})`);
    }
    blockedError = err;
    return err;
  }

  /**
   * @description The token, logging in when there is none (one login at a time).
   * @returns {Promise<string>} The token.
   */
  async function session() {
    if (token && tokenFor === accountOf(getConfig())) {
      return token;
    }
    token = null;
    if (!loggingIn) {
      loggingIn = login().finally(() => {
        loggingIn = null;
      });
    }
    return loggingIn;
  }

  /**
   * @description Send an authenticated request; log in again once when the
   * session expired.
   * @param {string} page - The page.
   * @param {string} [body] - The raw body.
   * @returns {Promise<string>} The body of the answer.
   */
  async function call(page, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await session();
      const answer = await send(page, body, { Cookie: `asus_token=${current}` });
      if (answer.status === 404) {
        throw new AsusError('not_found', `The router has no ${page} (404)`, { status: 404 });
      }
      const error = accessError(answer.body);
      const expired =
        (error && [ACCESS.NO_TOKEN, ACCESS.AUTHORIZATION, ACCESS.LOGOUT].includes(error.code)) ||
        answer.status === 401 ||
        answer.status === 403 ||
        isRedirectPage(answer.body);
      if (expired) {
        // The router dropped the session (reboot, too many sessions): log in again.
        if (token === current) {
          token = null;
        }
        continue;
      }
      if (answer.status !== 200) {
        throw new AsusError('http', `The router answered ${answer.status} on ${page}`, {
          status: answer.status,
        });
      }
      return answer.body;
    }
    throw new AsusError('auth', `The router keeps refusing the session on ${page}`);
  }

  return {
    /**
     * @description Read appGet hooks.
     * @param {string[]} hooks - `['cpu_usage(appobj)', 'nvram_get(productid)']`.
     * @returns {Promise<string>} The raw answer (JSON, sometimes malformed: see read.js).
     */
    appGet: (hooks) => call('appGet.cgi', `hook=${hooks.join(';')}`),
    /**
     * @description Read a page that answers JavaScript variables.
     * @param {string} page - ajax_coretmp.asp, detect_firmware.asp...
     * @returns {Promise<string>} The raw answer.
     */
    page: (page) => call(page),
    /**
     * @description Run router services, optionally setting nvram values first.
     * @param {string} services - `restart_wireless`, `reboot`...
     * @param {object} [values] - nvram values, `{ wl0_radio: 1 }`.
     * @returns {Promise<string>} The raw answer.
     */
    apply: (services, values = {}) =>
      call(
        'applyapp.cgi',
        JSON.stringify({ action_mode: 'apply', rc_service: services, ...values }),
      ),
    /**
     * @description Close the session (best effort, on shutdown).
     * @returns {Promise<void>}
     */
    async logout() {
      if (!token) {
        return;
      }
      const current = token;
      token = null;
      await send('Logout.asp', undefined, { Cookie: `asus_token=${current}` }).catch(() => {});
    },
    /** @description Forget the session (configuration changed). */
    reset() {
      token = null;
      tokenFor = null;
      blockedUntil = 0;
      blockedError = null;
    },
    hasSession: () => token !== null,
  };
}

export { createAsusClient, AsusError, nodeRequest, quote, USER_AGENT };
