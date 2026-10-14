// The router client: login, session kept, expired session, refusals, lock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAsusClient, quote, USER_AGENT } from '../src/asus-api.js';
import { asusRouter, USERNAME, PASSWORD, NOW } from './helpers/fixtures.js';

const config = (overrides = {}) => ({
  url: 'http://192.168.50.1',
  username: USERNAME,
  password: PASSWORD,
  verifyTls: false,
  ...overrides,
});

/**
 * @description A client on a fake router.
 * @param {object} [options] - `{ settings, router }`.
 * @returns {{ api: object, router: Function, clock: object, settings: object }} The client.
 */
function client({ settings = config(), router = asusRouter() } = {}) {
  const clock = { now: NOW };
  const api = createAsusClient({
    getConfig: () => settings,
    request: router,
    now: () => clock.now,
  });
  return { api, router, clock, settings };
}

test('the body is percent-encoded like the asusrouter library sends it', () => {
  assert.equal(
    quote('hook=nvram_get(productid);uptime()'),
    'hook%3Dnvram_get%28productid%29%3Buptime%28%29',
  );
  assert.equal(quote('a/b c'), 'a/b%20c');
});

test('logs in once, as the ASUS app, and keeps the token', async () => {
  const { api, router } = client();
  await api.appGet(['uptime()']);
  await api.appGet(['uptime()']);
  assert.equal(router.logins, 1);
  const [login, first] = router.calls;
  assert.equal(login.page, 'login.cgi');
  assert.equal(login.headers['User-Agent'], USER_AGENT);
  assert.match(USER_AGENT, /^asusrouter-.*DUTUtil/);
  assert.equal(login.body, `login_authorization=${Buffer.from('admin:secret').toString('base64')}`);
  assert.equal(first.headers.Cookie, 'asus_token=tok-1');
  assert.equal(first.headers.Referer, 'http://192.168.50.1/');
});

test('an expired session logs in again once, transparently', async () => {
  const { api, router } = client();
  await api.appGet(['uptime()']);
  router.token = 'tok-2';
  const answer = await api.appGet(['uptime()']);
  assert.match(answer, /secs since boot/);
  assert.equal(router.logins, 2);
});

test('a wrong password is an auth error, and no new login for 15 minutes (lockout)', async () => {
  const { api, router, clock } = client({ settings: config({ password: 'wrong' }) });
  await assert.rejects(api.appGet(['uptime()']), { kind: 'auth' });
  await assert.rejects(api.appGet(['uptime()']), { kind: 'auth' });
  assert.equal(router.logins, 1, 'no second attempt');
  clock.now += 16 * 60000;
  await assert.rejects(api.appGet(['uptime()']), { kind: 'auth' });
  assert.equal(router.logins, 2);
  api.reset();
  await assert.rejects(api.appGet(['uptime()']), { kind: 'auth' });
  assert.equal(router.logins, 3, 'a configuration change tries again');
});

test('a login lock of the router is respected', async () => {
  const { api, router, clock } = client();
  router.lock = 120;
  await assert.rejects(api.appGet(['uptime()']), { kind: 'locked', retryAfter: 120 });
  router.lock = null;
  await assert.rejects(api.appGet(['uptime()']), { kind: 'locked' });
  assert.equal(router.calls.length, 1);
  clock.now += 121000;
  await api.appGet(['uptime()']);
});

test('a new password uses a new session', async () => {
  const { api, router, settings } = client();
  await api.appGet(['uptime()']);
  settings.password = 'new';
  router.state.password = 'new';
  await api.appGet(['uptime()']);
  assert.equal(router.logins, 2);
});

test('network, TLS, 404 and missing settings', async () => {
  const refused = client({ router: asusRouter({ statuses: { all: 'ECONNREFUSED' } }) });
  await assert.rejects(refused.api.appGet(['uptime()']), { kind: 'unreachable' });
  const tls = createAsusClient({
    getConfig: () => config({ url: 'https://192.168.50.1:8443', verifyTls: true }),
    request: async () => {
      throw Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    },
  });
  await assert.rejects(tls.appGet(['uptime()']), { kind: 'tls' });
  const missing = client({ router: asusRouter({ statuses: { 'ajax_coretmp.asp': 404 } }) });
  await assert.rejects(missing.api.page('ajax_coretmp.asp'), { kind: 'not_found' });
  const noLogin = client({ router: asusRouter({ statuses: { 'login.cgi': 404 } }) });
  await assert.rejects(noLogin.api.appGet(['uptime()']), { kind: 'not_found' });
  const empty = client({ settings: config({ password: '' }) });
  await assert.rejects(empty.api.appGet(['uptime()']), { kind: 'auth' });
  assert.equal(empty.router.calls.length, 0);
});

test('commands: applyapp with a JSON body; logout frees the session', async () => {
  const { api, router } = client();
  await api.apply('restart_wireless', { wl0_radio: 0 });
  assert.deepEqual(router.applied, [
    { action_mode: 'apply', rc_service: 'restart_wireless', wl0_radio: 0 },
  ]);
  assert.equal(api.hasSession(), true);
  await api.logout();
  assert.equal(api.hasSession(), false);
  assert.equal(router.count('Logout.asp'), 1);
});

test('real sockets: the node:http transport against a fake router on 127.0.0.1', async (t) => {
  const { createServer } = await import('node:http');
  const fake = asusRouter();
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const answer = await fake({
        url: `http://127.0.0.1${req.url}`,
        method: req.method,
        headers: { Cookie: req.headers.cookie, 'User-Agent': req.headers['user-agent'] },
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(answer.body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const api = createAsusClient({
    getConfig: () => config({ url: `http://127.0.0.1:${server.address().port}` }),
  });
  const answer = await api.appGet(['nvram_get(productid)', 'uptime()']);
  assert.match(answer, /"productid":"RT-AX88U"/);
  assert.equal(fake.logins, 1);
  assert.equal(fake.calls[1].headers['User-Agent'], USER_AGENT);
  await api.logout();
});
