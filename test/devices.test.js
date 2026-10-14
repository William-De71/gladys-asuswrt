// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildRouterDevice,
  buildRouterStates,
  buildRadioDevice,
  buildRadioStates,
  buildClientDevice,
  idFromExternalId,
  clientName,
  macId,
  macOf,
  TEMPERATURE_SENSORS,
} from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, PHONE_MAC } from './helpers/fixtures.js';

const router = { identity: { model: 'RT-AX88U', firmware: '3.0.0.4.388.8_4' } };
const radio = { unit: 1, band: '5g', ssid: 'Home_5G', enabled: true };
const client = { mac: PHONE_MAC, name: 'Phone of Alex', vendor: 'Google' };

/**
 * @description Every device, in a language.
 * @param {string} language - The language.
 * @returns {Array<object>} The devices.
 */
const devices = (language) => [
  buildRouterDevice(fakeGladys, router, TEMPERATURE_SENSORS, language),
  buildRadioDevice(fakeGladys, radio, router.identity, language),
  buildRadioDevice(fakeGladys, { unit: 0, band: '2g', ssid: null }, null, language),
  buildClientDevice(fakeGladys, client, language),
];

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core (server/utils/constants.js,
// master of 2026-10-14), for the categories used here.
const UNITS = {
  'level-sensor': [DEVICE_FEATURE_UNITS.PERCENT],
  'device-temperature-sensor': [DEVICE_FEATURE_UNITS.CELSIUS, DEVICE_FEATURE_UNITS.FAHRENHEIT],
  duration: [DEVICE_FEATURE_UNITS.MILLISECONDS, DEVICE_FEATURE_UNITS.DAYS],
  datarate: [DEVICE_FEATURE_UNITS.MEGABITS_PER_SECOND],
};
// Pairs with an icon in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DEVICE_TEMPERATURE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.DECIMAL],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER],
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT],
  [DEVICE_FEATURE_CATEGORIES.DATARATE, DEVICE_FEATURE_TYPES.DATARATE.RATE],
  [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY],
  [DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.PUSH],
];

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(typeof feature.read_only, 'boolean', feature.external_id);
        assert.equal(typeof feature.has_feedback, 'boolean', feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('every category / type pair has an icon in Gladys, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (feature.unit) {
        assert.ok(
          UNITS[feature.category]?.includes(feature.unit),
          `${feature.external_id}: ${feature.unit}`,
        );
      }
    }
  }
});

test('only the Wi-Fi radio switch is a command', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      const command = feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH;
      assert.equal(feature.read_only, !command, feature.external_id);
      assert.equal(feature.has_feedback, command, feature.external_id);
    }
  }
});

test('names tell the devices apart; a client without a name shows its maker and MAC', () => {
  assert.deepEqual(
    devices('fr').map((device) => device.name),
    ['ASUS RT-AX88U', 'Wi-Fi 5 GHz (Home_5G)', 'Wi-Fi 2,4 GHz', 'Phone of Alex'],
  );
  assert.equal(devices('de')[1].name, 'WLAN 5 GHz (Home_5G)');
  assert.equal(
    clientName({ mac: PHONE_MAC, name: null, vendor: 'Google, Inc.' }),
    `Google ${PHONE_MAC}`,
  );
  assert.equal(clientName({ mac: PHONE_MAC, name: null, vendor: null }), PHONE_MAC);
  // Distinct feature names on the router: the dashboard shows them.
  const names = devices('en')[0].features.map((feature) => feature.name);
  assert.equal(new Set(names).size, names.length);
});

test('the router offers only the temperature sensors it has', () => {
  const bare = buildRouterDevice(fakeGladys, router, ['cpu'], 'en');
  const keys = bare.features.map((feature) => feature.external_id.split(':').pop());
  assert.deepEqual(keys, [
    'cpu',
    'memory',
    'temperature_cpu',
    'uptime',
    'download',
    'upload',
    'internet',
    'wan_ip',
    'clients',
    'firmware',
  ]);
  assert.equal(buildRouterDevice(fakeGladys, null, [], 'en').name, 'ASUS ASUSWRT');
});

test('external ids are built on stable platform ids and read back', () => {
  const ids = devices('en').map((device) => device.external_id);
  assert.deepEqual(ids, [
    'ext:asuswrt:router:main',
    'ext:asuswrt:radio:wl1',
    'ext:asuswrt:radio:wl0',
    'ext:asuswrt:client:a483e7123456',
  ]);
  assert.equal(idFromExternalId(`${ids[3]}:presence`, 'client'), 'a483e7123456');
  assert.equal(idFromExternalId(`${ids[1]}:enabled`, 'radio'), 'wl1');
  assert.equal(idFromExternalId(ids[1], 'client'), null);
  assert.equal(idFromExternalId('ext:asuswrt:radio:wl1x', 'radio'), null);
  assert.equal(macOf(macId(PHONE_MAC)), PHONE_MAC);
});

test('unknown values are not published; texts follow the language', () => {
  const states = buildRouterStates(
    fakeGladys,
    {
      cpu: 12.5,
      memory: null,
      temperatures: { cpu: 65.5 },
      wan: { status: 'connected', ip: '90.12.34.56' },
      identity: { firmware: '3.0.0.4.388.8_4' },
    },
    'fr',
  );
  const id = (key) => `ext:asuswrt:router:main:${key}`;
  assert.deepEqual(states, [
    { device_feature_external_id: id('cpu'), state: 12.5 },
    { device_feature_external_id: id('temperature_cpu'), state: 65.5 },
    { device_feature_external_id: id('internet'), text: 'Connecté' },
    { device_feature_external_id: id('wan_ip'), text: '90.12.34.56' },
    { device_feature_external_id: id('firmware'), text: '3.0.0.4.388.8_4' },
  ]);
  assert.deepEqual(buildRadioStates(fakeGladys, { unit: 0, enabled: false }), [
    { device_feature_external_id: 'ext:asuswrt:radio:wl0:enabled', state: 0 },
  ]);
  assert.deepEqual(buildRadioStates(fakeGladys, { unit: 0, enabled: null }), []);
});
