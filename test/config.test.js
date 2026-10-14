import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConfig,
  normalizeUrl,
  hasCredentials,
  readLanguage,
  POLL_INTERVAL,
  ABSENCE_DELAY,
} from '../src/config.js';

test('the address: http by default (the LAN access of the router), no path, a port kept', () => {
  assert.equal(normalizeUrl('192.168.50.1'), 'http://192.168.50.1');
  assert.equal(
    normalizeUrl(' https://router.asus.com:8443/Main_Login.asp '),
    'https://router.asus.com:8443',
  );
  assert.equal(normalizeUrl('http://10.0.0.1:8080/'), 'http://10.0.0.1:8080');
  assert.equal(normalizeUrl('ftp://10.0.0.1'), null);
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('defaults, bounds and types of every field', () => {
  const config = normalizeConfig({});
  assert.equal(config.pollInterval, POLL_INTERVAL.default);
  assert.equal(config.absenceDelay, ABSENCE_DELAY.default);
  assert.equal(config.verifyTls, false);
  assert.equal(config.networkDevices, 'named');
  assert.equal(config.language, 'auto');
  assert.equal(normalizeConfig({ poll_interval: '2' }).pollInterval, POLL_INTERVAL.min);
  assert.equal(normalizeConfig({ poll_interval: 1e6 }).pollInterval, POLL_INTERVAL.max);
  assert.equal(normalizeConfig({ absence_delay: '' }).absenceDelay, ABSENCE_DELAY.default);
  assert.equal(normalizeConfig({ verify_tls: 'true' }).verifyTls, true);
  assert.equal(normalizeConfig({ network_devices: 'everything' }).networkDevices, 'named');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('credentials need an address, a user name and a password; a password is kept as typed', () => {
  const config = normalizeConfig({ url: '10.0.0.1', username: ' admin ', password: ' p ' });
  assert.equal(config.username, 'admin');
  assert.equal(config.password, ' p ');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ url: '10.0.0.1', username: 'admin' })), false);
});

test('the stored language of the last widget request', () => {
  assert.equal(readLanguage({ last_language: 'de' }, 'en'), 'de');
  assert.equal(readLanguage({ last_language: 'german' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
