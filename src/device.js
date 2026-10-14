// -----------------------------------------------------------------------------
// The devices of the ASUSWRT integration, offered on the Discovery screen.
//
// Category / type pairs come from DEVICE_FEATURE_CATEGORIES of the SDK, with
// an icon and a unit list in the Gladys front (front/src/utils/consts.js,
// server/utils/constants.js, master of 2026-10-14). Gladys has no CPU nor
// memory category: `level-sensor` / `decimal` in % is its plain numeric
// level, the name of each feature tells them apart.
//
// One router, "ASUS <model>":
//   - cpu, memory           level-sensor / decimal, %
//   - temperature_cpu,      device-temperature-sensor / decimal, °C (only the
//     temperature_2g, _5g,  sensors the router reports)
//     _5g2, _6g
//   - uptime                duration / decimal, days
//   - download, upload      datarate / rate, Mbit/s (the internet link)
//   - internet              text / text (connected, connecting, disconnected)
//   - wan_ip                text / text
//   - clients               counter-sensor / integer: clients connected now
//   - firmware              text / text
// One device per Wi-Fi radio, "Wi-Fi <band>":
//   - enabled               switch / binary, a command (turns the radio on or
//                           off; the router restarts its Wi-Fi to apply it)
// One device per client of the network, "<client name>":
//   - presence              presence-sensor / push, as the Bluetooth presence
//                           of Gladys: 1 while it is online, 0 once it left
//
// External ids: the router is "main" (one per integration), a radio its
// wireless unit (wl0, wl1...), a client its MAC address without separators.
// Never a name.
//
// The router is read on the integration's own timer (one round for all
// devices), so `should_poll` is false.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPES = { ROUTER: 'router', RADIO: 'radio', CLIENT: 'client' };
const ROUTER_ID = 'main';
// Fastest internet link of an ASUS router (10 Gbit/s), in Mbit/s.
const MAX_RATE_MBPS = 10000;
const TEMPERATURE_SENSORS = ['cpu', '2g', '5g', '5g2', '6g'];

const sensor = { read_only: true, has_feedback: false, keep_history: true };
const text = {
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  min: 0,
  max: 0,
};
const percent = {
  ...sensor,
  category: CATEGORIES.LEVEL_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
};
const rate = {
  ...sensor,
  category: CATEGORIES.DATARATE,
  type: TYPES.DATARATE.RATE,
  unit: UNITS.MEGABITS_PER_SECOND,
  min: 0,
  max: MAX_RATE_MBPS,
};
const temperature = {
  ...sensor,
  category: CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.CELSIUS,
  min: 0,
  max: 150,
};

const INTERNET_STATUSES = ['connected', 'connecting', 'disconnected'];

// The features of the router: key, name (TEXTS key), shape, and the state of
// a snapshot (a number, `{ text }`, or null when unknown: not published).
const ROUTER_FEATURES = [
  { key: 'cpu', name: 'featureCpu', shape: percent, state: (s) => s.cpu },
  { key: 'memory', name: 'featureMemory', shape: percent, state: (s) => s.memory },
  ...TEMPERATURE_SENSORS.map((sensorKey) => ({
    key: `temperature_${sensorKey}`,
    name: `featureTemperature_${sensorKey}`,
    optional: sensorKey,
    shape: temperature,
    state: (s) => s.temperatures?.[sensorKey] ?? null,
  })),
  {
    key: 'uptime',
    name: 'featureUptime',
    shape: {
      ...sensor,
      category: CATEGORIES.DURATION,
      type: TYPES.DURATION.DECIMAL,
      unit: UNITS.DAYS,
      min: 0,
      max: 10000,
    },
    state: (s) => s.uptimeDays,
  },
  { key: 'download', name: 'featureDownload', shape: rate, state: (s) => s.downMbps },
  { key: 'upload', name: 'featureUpload', shape: rate, state: (s) => s.upMbps },
  {
    key: 'internet',
    name: 'featureInternet',
    shape: text,
    state: (s, language) =>
      INTERNET_STATUSES.includes(s.wan?.status)
        ? { text: t(`internet_${s.wan.status}`, language) }
        : null,
  },
  {
    key: 'wan_ip',
    name: 'featureWanIp',
    shape: text,
    state: (s) => (s.wan?.ip ? { text: s.wan.ip } : null),
  },
  {
    key: 'clients',
    name: 'featureClients',
    shape: {
      ...sensor,
      category: CATEGORIES.COUNTER_SENSOR,
      type: TYPES.SENSOR.INTEGER,
      min: 0,
      max: 10000,
    },
    state: (s) => s.clientsOnline ?? null,
  },
  {
    key: 'firmware',
    name: 'featureFirmware',
    shape: text,
    state: (s) => (s.identity?.firmware ? { text: s.identity.firmware } : null),
  },
];

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - A DEVICE_TYPES value.
 * @param {string} id - The platform id (see macId for a client).
 * @returns {{ device: string, feature: Function }} The ids.
 * @example
 * idsOf(gladys, 'radio', 'wl1').device; // -> 'ext:asuswrt:radio:wl1'
 */
function idsOf(gladys, type, id) {
  return gladys.externalIds(type, id);
}

/**
 * @description The platform id of a client: its MAC address without separators.
 * @param {string} mac - 'aa:bb:cc:dd:ee:ff'.
 * @returns {string} 'aabbccddeeff'.
 */
const macId = (mac) => mac.replace(/:/g, '');

/**
 * @description The MAC address of a client id.
 * @param {string} id - 'aabbccddeeff'.
 * @returns {string} 'aa:bb:cc:dd:ee:ff'.
 */
const macOf = (id) => id.match(/../g).join(':');

/**
 * @description The platform id of a Wi-Fi radio.
 * @param {number} unit - The wireless unit.
 * @returns {string} 'wl0'.
 */
const radioId = (unit) => `wl${unit}`;

const ID_PATTERNS = {
  [DEVICE_TYPES.ROUTER]: '[a-z]+',
  [DEVICE_TYPES.RADIO]: 'wl[0-9]',
  [DEVICE_TYPES.CLIENT]: '[0-9a-f]{12}',
};

/**
 * @description The platform id a device (or feature) external id stands for.
 * @param {unknown} externalId - The external id.
 * @param {string} type - A DEVICE_TYPES value.
 * @returns {string|null} The id.
 * @example
 * idFromExternalId('ext:asuswrt:client:aabbccddeeff:presence', 'client'); // -> 'aabbccddeeff'
 */
function idFromExternalId(externalId, type) {
  const match = new RegExp(`:${type}:(${ID_PATTERNS[type]})(?::[a-z0-9_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description A feature of a spec.
 * @param {object} ids - The ids of the device.
 * @param {object} spec - The feature spec.
 * @param {string} language - Language of the name.
 * @returns {object} The feature.
 */
const featureOf = (ids, spec, language) => ({
  name: t(spec.name, language),
  external_id: ids.feature(spec.key),
  ...spec.shape,
});

/**
 * @description The features of the router, given the temperature sensors it has.
 * @param {string[]} sensors - Keys of TEMPERATURE_SENSORS the router reports.
 * @returns {Array<object>} The specs.
 */
const routerSpecs = (sensors = []) =>
  ROUTER_FEATURES.filter((spec) => !spec.optional || sensors.includes(spec.optional));

/**
 * @description The name of the router device.
 * @param {object|null} identity - readIdentity.
 * @param {string} language - The language.
 * @returns {string} "ASUS RT-AX88U".
 */
const routerName = (identity, language) =>
  t('routerDeviceName', language, { model: identity?.model ?? 'ASUSWRT' });

/**
 * @description The router device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot (watcher.router()).
 * @param {string[]} sensors - The temperature sensors met so far.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 * @example
 * buildRouterDevice(gladys, { identity: { model: 'RT-AX88U' } }, ['cpu'], 'fr');
 */
function buildRouterDevice(gladys, router, sensors, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  const identity = router?.identity ?? null;
  return {
    name: routerName(identity, language),
    external_id: ids.device,
    model: identity?.model ?? 'ASUSWRT',
    should_poll: false,
    params: [
      ...(identity?.mac ? [{ name: 'MAC', value: identity.mac }] : []),
      ...(identity?.firmware ? [{ name: 'FIRMWARE', value: identity.firmware }] : []),
    ],
    features: routerSpecs(sensors).map((spec) => featureOf(ids, spec, language)),
  };
}

/**
 * @description The states of the router.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} router - The router snapshot.
 * @param {string} language - Language of the texts.
 * @returns {Array<object>} The states.
 */
function buildRouterStates(gladys, router, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID);
  return ROUTER_FEATURES.flatMap((spec) => {
    const value = spec.state(router, language);
    if (value === null || value === undefined) {
      return [];
    }
    const id = ids.feature(spec.key);
    return [
      typeof value === 'object'
        ? { device_feature_external_id: id, text: value.text }
        : { device_feature_external_id: id, state: value },
    ];
  });
}

/**
 * @description The name of a radio: "Wi-Fi 5 GHz (Home)".
 * @param {object} radio - The radio snapshot (readRadios).
 * @param {string} language - The language.
 * @returns {string} The name.
 */
function radioName(radio, language) {
  const band = t(`band_${radio.band}`, language);
  return radio.ssid
    ? t('radioDeviceNameSsid', language, { band, ssid: radio.ssid })
    : t('radioDeviceName', language, { band });
}

/**
 * @description The device of a Wi-Fi radio.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} radio - The radio snapshot.
 * @param {object|null} identity - readIdentity of the router.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildRadioDevice(gladys, radio, identity, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.RADIO, radioId(radio.unit));
  return {
    name: radioName(radio, language),
    external_id: ids.device,
    model: identity?.model ?? 'ASUSWRT',
    should_poll: false,
    params: [{ name: 'WIRELESS_UNIT', value: radioId(radio.unit) }],
    features: [
      {
        name: t('featureRadio', language),
        external_id: ids.feature('enabled'),
        category: CATEGORIES.SWITCH,
        type: TYPES.SWITCH.BINARY,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const buildRadioStates = (gladys, radio) =>
  typeof radio.enabled === 'boolean'
    ? [
        {
          device_feature_external_id: idsOf(
            gladys,
            DEVICE_TYPES.RADIO,
            radioId(radio.unit),
          ).feature('enabled'),
          state: radio.enabled ? 1 : 0,
        },
      ]
    : [];

/**
 * @description The name of a client: its name on the router, else its maker
 * and MAC.
 * @param {object} client - The client snapshot.
 * @returns {string} The name.
 */
function clientName(client) {
  if (client.name) {
    return client.name;
  }
  const vendor = client.vendor ? String(client.vendor).split(/[\s,]/)[0] : null;
  return vendor ? `${vendor} ${client.mac}` : client.mac;
}

/**
 * @description The device of a client of the network.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} client - The client snapshot (readClients).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildClientDevice(gladys, client, language = 'en') {
  const ids = idsOf(gladys, DEVICE_TYPES.CLIENT, macId(client.mac));
  return {
    name: clientName(client),
    external_id: ids.device,
    should_poll: false,
    params: [
      { name: 'MAC', value: client.mac },
      ...(client.vendor ? [{ name: 'VENDOR', value: String(client.vendor).slice(0, 100) }] : []),
    ],
    features: [
      {
        name: t('featurePresence', language),
        external_id: ids.feature('presence'),
        category: CATEGORIES.PRESENCE_SENSOR,
        type: TYPES.SENSOR.PUSH,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ],
  };
}

const presenceFeatureId = (gladys, mac) =>
  idsOf(gladys, DEVICE_TYPES.CLIENT, macId(mac)).feature('presence');

export {
  DEVICE_TYPES,
  ROUTER_ID,
  ROUTER_FEATURES,
  TEMPERATURE_SENSORS,
  INTERNET_STATUSES,
  idsOf,
  macId,
  macOf,
  radioId,
  idFromExternalId,
  routerSpecs,
  routerName,
  radioName,
  clientName,
  buildRouterDevice,
  buildRouterStates,
  buildRadioDevice,
  buildRadioStates,
  buildClientDevice,
  presenceFeatureId,
};
