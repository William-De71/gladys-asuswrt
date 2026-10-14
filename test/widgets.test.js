// Every widget content through validateWidgetContent (the checks of the core,
// which only run in debug mode in production) and the content budget of a
// card, in the four languages and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
  readInternetSettings,
  readNetworkSettings,
  formatUptime,
  mainTemperature,
  messageContent,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, MINUTE, PHONE_MAC, NAS_MAC, TV_MAC } from './helpers/fixtures.js';

const types = (content) => content.components.map((component) => component.type);

/**
 * @description Assert a content is valid and within the budget of a card.
 * @param {object} content - The content.
 * @param {string} label - For the messages.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
  const count = (list) => types(content).filter((type) => list.includes(type)).length;
  assert.ok(content.components.length <= 8, label);
  assert.ok(count(['value', 'gauge']) <= 6, label);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1, label);
  assert.ok(count(['text']) <= 2, label);
  assert.ok(count(['status']) <= 1, label);
  assert.ok(count(['button']) <= 4, label);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600, label);
  for (const component of content.components) {
    for (const item of component.items ?? []) {
      if (component.type === 'status') {
        assert.ok(item.value, `${label}: a status row without value is dropped`);
      }
    }
  }
}

const router = {
  identity: { model: 'RT-AX88U', firmware: '3.0.0.4.388.8_4', lanIp: '192.168.50.1' },
  cpu: 23.5,
  memory: 77.5,
  temperatures: { cpu: 65.5, '2g': 44, '5g': 47 },
  uptimeDays: 24.66,
  downMbps: 80,
  upMbps: 20,
  wan: { status: 'connected', unit: 0, ip: '90.12.34.56', gateway: '90.12.34.1', proto: 'pppoe' },
  clientsOnline: 17,
  firmware: { available: true, latest: '3.0.0.4.388.9_0', current: '3.0.0.4.388.8_4' },
};
const clients = [
  {
    mac: PHONE_MAC,
    name: 'Phone of Alex',
    ip: '192.168.50.23',
    vendor: 'Google',
    present: true,
    connection: '5g',
    lastSeen: NOW,
  },
  {
    mac: NAS_MAC,
    name: 'DS220',
    ip: '192.168.50.10',
    vendor: 'Synology',
    present: true,
    connection: 'wired',
    lastSeen: NOW,
  },
  {
    mac: TV_MAC,
    name: null,
    ip: '192.168.50.40',
    vendor: 'Samsung',
    present: false,
    connection: '2g',
    lastSeen: NOW - 30 * MINUTE,
  },
];

test('overview: gauges, tiles, status, buttons, in every language', () => {
  for (const language of LANGUAGES) {
    const content = buildOverviewWidget({
      router,
      language,
      now: NOW,
      fetchedAt: NOW - MINUTE,
      pollSeconds: 30,
    });
    assertValid(content, language);
    assert.deepEqual(types(content), [
      'text',
      'gauge',
      'gauge',
      'value',
      'value',
      'status',
      'button',
      'button',
    ]);
    assert.equal(content.components.at(-1).action.confirm, true, 'reboot asks for a confirmation');
  }
  const fr = buildOverviewWidget({
    router,
    language: 'fr',
    now: NOW,
    fetchedAt: NOW - MINUTE,
    pollSeconds: 30,
  });
  assert.equal(fr.components[0].text, 'RT-AX88U · 192.168.50.1 · il y a 1 min');
  assert.equal(fr.components[5].items[0].value, 'Connecté · 90.12.34.56');
  assert.equal(fr.components[5].items[2].value, 'Mise à jour 3.0.0.4.388.9_0');
});

test('overview: unknown values make no gauge, rather than a misleading 0', () => {
  const content = buildOverviewWidget({
    router: {
      identity: null,
      cpu: null,
      memory: null,
      temperatures: {},
      wan: null,
      firmware: null,
    },
    language: 'en',
    now: NOW,
    fetchedAt: NOW,
    pollSeconds: 5,
  });
  assertValid(content, 'bare');
  assert.deepEqual(types(content), ['text', 'status', 'button', 'button']);
  assert.equal(content.ttl_seconds, 10);
});

test('internet: rates, history once the router device exists, link', () => {
  for (const language of LANGUAGES) {
    const content = buildInternetWidget({
      router,
      language,
      pollSeconds: 30,
      interval: 'last-hour',
      featureId: (key) => `ext:asuswrt:router:main:${key}`,
    });
    assertValid(content, language);
    assert.deepEqual(types(content), ['text', 'value', 'value', 'chart', 'status']);
    assert.deepEqual(content.components[3].device_features, [
      'ext:asuswrt:router:main:download',
      'ext:asuswrt:router:main:upload',
    ]);
  }
  const without = buildInternetWidget({
    router: { ...router, downMbps: null },
    language: 'en',
    pollSeconds: 30,
  });
  assertValid(without, 'no device');
  assert.equal(without.components[1].value, '–');
  assert.ok(!types(without).includes('chart'));
  assertValid(
    buildInternetWidget({ router: { wan: null }, language: 'de', pollSeconds: 30 }),
    'no wan',
  );
  assert.equal(readInternetSettings({ interval: 'nope' }).interval, 'last-day');
});

test('network: present, absent, all, empty; connection badges', () => {
  for (const language of LANGUAGES) {
    for (const show of ['present', 'absent', 'all']) {
      const content = buildNetworkWidget({
        clients,
        language,
        now: NOW,
        pollSeconds: 30,
        show,
        created: new Set([PHONE_MAC]),
      });
      assertValid(content, `${language} ${show}`);
    }
    assertValid(
      buildNetworkWidget({ clients: [], language, now: NOW, pollSeconds: 30 }),
      `${language} empty`,
    );
  }
  const present = buildNetworkWidget({
    clients,
    language: 'fr',
    now: NOW,
    pollSeconds: 30,
    created: new Set([PHONE_MAC]),
  });
  assert.equal(present.components[0].text, '2 connecté(s) sur 3 connu(s)');
  assert.deepEqual(
    present.components[1].items.map((item) => [item.title, item.badge.text, item.badge.color]),
    [
      ['DS220', 'Filaire', 'info'],
      ['Phone of Alex', '5 GHz', 'success'],
    ],
  );
  const absent = buildNetworkWidget({
    clients,
    language: 'en',
    now: NOW,
    pollSeconds: 30,
    show: 'absent',
  });
  assert.equal(absent.components[1].items[0].subtitle, '192.168.50.40 · 30 min ago');
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...clients[0],
    mac: `aa:00:00:00:00:${String(i).padStart(2, '0')}`,
    name: `Device ${i}`,
  }));
  const long = buildNetworkWidget({ clients: many, language: 'en', now: NOW, pollSeconds: 30 });
  assertValid(long, 'many');
  assert.equal(long.components[1].items.length, 8);
  assert.match(long.components[0].text, /4 more/);
  assert.equal(readNetworkSettings({ show: 'x' }).show, 'present');
});

test('helpers', () => {
  assert.equal(formatUptime(24.66, 'fr'), '24 j 15 h');
  assert.equal(formatUptime(null, 'en'), '?');
  assert.equal(mainTemperature({ '2g': 44, '5g': 51 }), 51);
  assert.equal(mainTemperature({}), null);
  assertValid(messageContent('x'.repeat(500)), 'message');
});
