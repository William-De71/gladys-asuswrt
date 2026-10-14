// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices and the states like the host API does, and a fake ASUS router.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  asusRouter,
  clientEntry,
  silent,
  knownPath,
  NOW,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
} from './helpers/fixtures.js';

const CONFIG = { url: '192.168.50.1', username: 'admin', password: 'secret' };
const PREFIX = 'ext:test-integration';
const ROUTER = `${PREFIX}:router:main`;
const WIFI_2G = `${PREFIX}:radio:wl0`;
const WIFI_5G = `${PREFIX}:radio:wl1`;
const PHONE = `${PREFIX}:client:${PHONE_MAC.replace(/:/g, '')}`;
const NAS = `${PREFIX}:client:${NAS_MAC.replace(/:/g, '')}`;
const TV = `${PREFIX}:client:${TV_MAC.replace(/:/g, '')}`;

/**
 * @description The integration, connected to a fake Gladys and a fake router.
 * @param {object} [options] - `{ config, fake, path }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, path }`.
 */
async function startApp({ config = CONFIG, fake = asusRouter(), path = knownPath() } = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    request: fake,
    knownHostsPath: path,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.now += ms;
    },
    logger: silent,
  });
  await gladys.connect();
  return { gladys, app, fake, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

/**
 * @description The next reading, `seconds` later.
 * @param {object} context - `{ app, fake, clock }`.
 * @param {number} seconds - Seconds to move the clock.
 * @returns {Promise<void>}
 */
async function nextRound({ app, fake, clock }, seconds = 30) {
  clock.now += seconds * 1000;
  fake.state.elapsed = (clock.now - NOW) / 1000;
  await app.watcher.round();
}

test('the router, its radios and the named clients are offered, accepted by the host API checks', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  // Clients with a name only (default): the phone and the NAS, not the TV.
  assert.deepEqual(ids, [ROUTER, WIFI_2G, WIFI_5G, PHONE, NAS]);
  assert.ok(gladys.fake.discoveredDevices.every((device) => device.should_poll === false));
  const router = gladys.fake.discoveredDevices[0];
  assert.equal(router.name, 'ASUS RT-AX88U');
  assert.deepEqual(
    router.features.map((f) => f.external_id.split(':').pop()),
    [
      'cpu',
      'memory',
      'temperature_cpu',
      'temperature_2g',
      'temperature_5g',
      'uptime',
      'download',
      'upload',
      'internet',
      'wan_ip',
      'clients',
      'firmware',
    ],
  );
  assert.equal(gladys.fake.discoveredDevices[2].name, 'Wi-Fi 5 GHz (Home_5G)');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'RT-AX88U : Internet connecté, 3 appareil(s) sur le réseau.',
  );
  assert.equal(gladys.fake.states.length, 0, 'nothing before a device exists');
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first reading is a baseline');
  assert.equal(fake.logins, 1, 'one session for every request');
  assert.ok(fake.calls.every((call) => !call.page.includes('secret')));
});

test('creating the router publishes its states; CPU and rates from two readings', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  assert.equal(gladys.fake.lastState(`${ROUTER}:cpu`), undefined, 'no load from one reading');
  assert.equal(gladys.fake.lastState(`${ROUTER}:memory`), 77.5);
  assert.equal(gladys.fake.lastState(`${ROUTER}:temperature_cpu`), 65.5);
  assert.equal(gladys.fake.lastState(`${ROUTER}:temperature_5g`), 47);
  assert.equal(gladys.fake.lastState(`${ROUTER}:uptime`), 24.66);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Connected');
  assert.equal(gladys.fake.lastState(`${ROUTER}:wan_ip`), '90.12.34.56');
  assert.equal(gladys.fake.lastState(`${ROUTER}:clients`), 3);
  assert.equal(gladys.fake.lastState(`${ROUTER}:firmware`), '3.0.0.4.388.8_4');
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${ROUTER}:cpu`), 15);
  assert.equal(gladys.fake.lastState(`${ROUTER}:download`), 80);
  assert.equal(gladys.fake.lastState(`${ROUTER}:upload`), 20);
  const count = gladys.fake.states.length;
  await nextRound(context);
  // Only the uptime moves (and stays rounded to the same value within a minute).
  assert.ok(gladys.fake.states.length - count <= 1);
});

test('internet down then back fires one event per transition', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  fake.state.nvram.link_internet = '0';
  fake.state.nvram.wan0_ipaddr = '0.0.0.0';
  await nextRound(context);
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${ROUTER}:internet`), 'Disconnected');
  fake.state.nvram.link_internet = '1';
  await nextRound(context);
  fake.state.nvram.link_internet = '2';
  fake.state.nvram.wan0_ipaddr = '90.12.34.57';
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.INTERNET_STATUS_CHANGED);
  assert.deepEqual(
    events.map((event) => [event.data.status, event.data.previous_status, event.data.wan_ip]),
    [
      ['disconnected', 'connected', ''],
      ['connected', 'disconnected', '90.12.34.57'],
    ],
  );
  assert.equal(gladys.fake.lastState(`${ROUTER}:wan_ip`), '90.12.34.57');
});

test('presence: arrived at once, left after the absence delay only', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  const phone = fake.state.clients[PHONE_MAC.toUpperCase()];
  phone.isOnline = '0';
  await nextRound(context, 120);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).length, 0, 'not yet');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
  // Some firmwares drop the client from the list instead.
  delete fake.state.clients[PHONE_MAC.toUpperCase()];
  await nextRound(context, 240);
  const [left] = eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE);
  assert.equal(left.data.event, 'left');
  assert.equal(left.data.device, PHONE);
  assert.equal(left.data.connection, 'Wi-Fi 5 GHz');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 0);
  fake.state.clients[PHONE_MAC.toUpperCase()] = { ...phone, isOnline: '1' };
  await nextRound(context);
  assert.equal(eventsOf(gladys, TRIGGERS.NETWORK_DEVICE_PRESENCE).at(-1).data.event, 'arrived');
  assert.equal(gladys.fake.lastState(`${PHONE}:presence`), 1);
});

test('presence: a present client is dated again every minute', async (t) => {
  // The SDK dates its heartbeat with Date.now().
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, PHONE);
  const count = () =>
    gladys.fake.states.filter((s) => s.device_feature_external_id === `${PHONE}:presence`).length;
  const first = count();
  t.mock.timers.tick(30000);
  await nextRound(context, 30);
  assert.equal(count(), first, 'within the heartbeat');
  t.mock.timers.tick(40000);
  await nextRound(context, 40);
  assert.equal(count(), first + 1, 'heartbeat');
});

test('a MAC address never met fires "new device" once, and survives a restart', async (t) => {
  const path = knownPath();
  const context = await startApp({ path });
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const mac = 'de:ad:be:ef:00:01';
  fake.state.clients[mac.toUpperCase()] = clientEntry(mac, {
    ip: '192.168.50.77',
    vendor: 'Espressif',
    isWL: '1',
  });
  await nextRound(context);
  await nextRound(context);
  const events = eventsOf(gladys, TRIGGERS.NEW_NETWORK_DEVICE);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.mac, mac);
  assert.equal(events[0].data.medium, 'wifi');
  assert.equal(events[0].data.connection, 'Wi-Fi 2.4 GHz');
  // Offline clients of the list are not "new": the TV is known from the start.
  const again = await startApp({ path, fake });
  t.after(() => again.gladys.fake.shutdown());
  await nextRound(again);
  assert.equal(eventsOf(again.gladys, TRIGGERS.NEW_NETWORK_DEVICE).length, 0);
});

test('a reboot of the router fires "rebooted"; a reboot asked from Gladys does not', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  await nextRound(context);
  fake.state.uptime = -fake.state.elapsed - 30 + 90;
  await nextRound(context, 60);
  assert.equal(eventsOf(gladys, TRIGGERS.ROUTER_REBOOTED).length, 1);
  assert.match(eventsOf(gladys, TRIGGERS.ROUTER_REBOOTED)[0].data.summary, /RT-AX88U rebooted/);
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.REBOOT, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(fake.applied.at(-1).rc_service, 'reboot');
  fake.state.uptime = -fake.state.elapsed - 600 + 60;
  await nextRound(context, 600);
  assert.equal(eventsOf(gladys, TRIGGERS.ROUTER_REBOOTED).length, 1, 'no event of our own');
});

test('a Wi-Fi radio switch sets the radio, restarts the Wi-Fi, never fires an event', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, WIFI_5G);
  assert.equal(gladys.fake.lastState(`${WIFI_5G}:enabled`), 1);
  const ack = await gladys.fake.setValue(device, device.features[0], 0);
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(fake.applied, [
    { action_mode: 'apply', rc_service: 'restart_wireless', wl1_radio: 0 },
  ]);
  assert.equal(gladys.fake.lastState(`${WIFI_5G}:enabled`), 0);
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${WIFI_5G}:enabled`), 0, 'read back from the router');
  assert.equal(gladys.fake.sceneEvents.length, 0);
  // The radio turned on from the router interface comes back as a state.
  fake.state.nvram.wl1_radio = '1';
  await nextRound(context);
  assert.equal(gladys.fake.lastState(`${WIFI_5G}:enabled`), 1);
});

test('read-only features refuse a command', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, PHONE);
  const ack = await gladys.fake.setValue(device, device.features[0], 1);
  assert.equal(ack.success, false);
});

test('scene action get_status returns every declared output', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await nextRound(context);
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_STATUS, {});
  assert.equal(ack.success, true, ack.error);
  const { outputs } = ack.data;
  assert.equal(outputs.cpu, 15);
  assert.equal(outputs.temperature, 65.5);
  assert.equal(outputs.download, 80);
  assert.equal(outputs.internet, 'connected');
  assert.equal(outputs.devices_present, 3);
  assert.equal(outputs.update_available, false);
  assert.match(outputs.summary, /CPU 15 %/);
});

test('scene action restart_service runs the right rc_service', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const [service, rc] of [
    ['wireless', 'restart_wireless'],
    ['internet', 'restart_wan_if 0'],
    ['dns', 'restart_dnsmasq'],
  ]) {
    const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.RESTART_SERVICE, { service });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(ack.data.outputs, { service });
    assert.equal(fake.applied.at(-1).rc_service, rc);
  }
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.RESTART_SERVICE, { service: 'reboot' });
  assert.equal(bad.success, false);
});

test('check_updates asks the router, waits for the result, never fires the trigger itself', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.CHECK_UPDATES, {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    update_available: true,
    current_version: '3.0.0.4.388.8_4',
    new_version: '3.0.0.4.388.9_0',
    summary: 'A firmware update is available (3.0.0.4.388.9_0).',
  });
  assert.equal(fake.applied[0].rc_service, 'start_webs_update');
  await nextRound(context, 700);
  assert.equal(eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE).length, 0);
});

test('a firmware found by the daily check of the router fires the update trigger', async (t) => {
  const context = await startApp();
  const { gladys, fake } = context;
  t.after(() => gladys.fake.shutdown());
  fake.state.firmware = { update: '1', flag: '1', info: '3004_388_9_0' };
  await nextRound(context, 30);
  assert.equal(eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE).length, 0, 'read every 10 min');
  await nextRound(context, 600);
  const [event] = eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE);
  assert.equal(event.data.new_version, '3.0.0.4.388.9_0');
  await nextRound(context, 600);
  assert.equal(eventsOf(gladys, TRIGGERS.FIRMWARE_UPDATE_AVAILABLE).length, 1, 'once');
});

test('every widget content is valid for the core, in the four languages', async (t) => {
  const context = await startApp();
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  await created(gladys, ROUTER);
  await nextRound(context);
  for (const key of Object.values(WIDGETS)) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const ack = await gladys.fake.widgetGet(key, { language, settings: {} });
      assert.equal(ack.success, true, `${key}: ${ack.error}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  const internet = await gladys.fake.widgetGet(WIDGETS.INTERNET, { settings: {} });
  assert.ok(internet.data.content.components.some((c) => c.type === 'chart'));
  const network = await gladys.fake.widgetGet(WIDGETS.NETWORK, { settings: { show: 'all' } });
  assert.equal(network.data.content.components[1].items.length, 3);
});

test('widget buttons: check for a firmware, reboot', async (t) => {
  const { gladys, fake } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const check = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.CHECK_UPDATES);
  assert.equal(check.success, true, check.error);
  assert.match(check.data.message.fr, /mise à jour du micrologiciel est disponible/);
  const reboot = await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REBOOT);
  assert.match(reboot.data.message.en, /rebooting/);
  assert.equal(fake.applied.at(-1).rc_service, 'reboot');
});

test('configuration actions: test the connection, forget the known devices', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(ack.data.message.fr, 'Connecté à ASUS RT-AX88U (micrologiciel 3.0.0.4.388.8_4).');
  const forget = await gladys.fake.action(ACTIONS.FORGET_DEVICES);
  assert.match(forget.data.message.en, /forgotten/);
});

test('errors become clear connection statuses', async (t) => {
  for (const [config, fake, pattern] of [
    [{ ...CONFIG, password: 'wrong' }, asusRouter(), /refuse le nom d’utilisateur/],
    [CONFIG, asusRouter({ statuses: { 'login.cgi': 404 } }), /ne répond pas comme un routeur ASUS/],
    [
      CONFIG,
      asusRouter({ statuses: { all: 'ECONNREFUSED' } }),
      /ne répond pas à http:\/\/192\.168\.50\.1/,
    ],
  ]) {
    const { gladys } = await startApp({ config, fake });
    t.after(() => gladys.fake.shutdown());
    assert.equal(gladys.fake.connectionStatus.connected, false);
    assert.match(gladys.fake.connectionStatus.message.fr, pattern);
  }
  const locked = asusRouter();
  locked.lock = 600;
  const { gladys } = await startApp({ fake: locked });
  t.after(() => gladys.fake.shutdown());
  assert.match(gladys.fake.connectionStatus.message.en, /new attempt in 10 min/);
  const empty = await startApp({ config: {} });
  t.after(() => empty.gladys.fake.shutdown());
  assert.match(empty.gladys.fake.connectionStatus.message.en, /Enter the address of the router/);
});

test('a page missing on this model is skipped, the rest is read', async (t) => {
  const fake = asusRouter({ statuses: { 'ajax_coretmp.asp': 404, 'detect_firmware.asp': 404 } });
  const context = await startApp({ fake });
  const { gladys } = context;
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const router = gladys.fake.discoveredDevices[0];
  assert.ok(!router.features.some((f) => f.external_id.includes(':temperature_')));
  await nextRound(context);
  assert.equal(fake.count('ajax_coretmp.asp'), 1, 'not asked again for an hour');
});

test('a new address starts again: new session, new baseline', async (t) => {
  const { gladys, app, fake } = await startApp({ config: { ...CONFIG, network_devices: 'all' } });
  t.after(() => gladys.fake.shutdown());
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id === TV));
  await gladys.fake.configUpdated({ ...CONFIG, url: '10.0.0.1' });
  assert.equal(app.getConfig().url, 'http://10.0.0.1');
  assert.equal(fake.logins, 2);
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.ok(!gladys.fake.discoveredDevices.some((d) => d.external_id === TV), 'named only');
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.external_id === NAS));
});

test('shutdown logs out of the router', async () => {
  const { gladys, fake } = await startApp();
  await gladys.fake.shutdown();
  assert.equal(fake.count('Logout.asp'), 1);
});
