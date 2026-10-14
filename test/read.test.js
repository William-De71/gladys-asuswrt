// The readers against the answers of real routers, as the dumps of the
// asusrouter library show them (RT-AX88U on Asuswrt-Merlin 388), and the
// malformed answers some firmwares send.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readJson,
  readJsVariables,
  normalizeMac,
  readCpuCounters,
  cpuUsage,
  memoryUsage,
  readNetdev,
  rates,
  readUptime,
  readWan,
  readTemperatures,
  scaleTemperature,
  formatFirmware,
  formatAvailableFirmware,
  readIdentity,
  readFirmware,
  readRadios,
  readClients,
} from '../src/read.js';
import {
  defaultState,
  appGet,
  coretmp,
  detectFirmware,
  ROUTER_MAC,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
} from './helpers/fixtures.js';

// The RT-AX88U dump of asusrouter (tests/test_data/_v1/rt_ax88u_merlin_388/hook_001.content).
const HOOK_001 = `{
"cpu_usage":{"cpu1_total":"52557468","cpu1_usage":"4733197","cpu2_total":"52587131","cpu2_usage":"1731814","cpu3_total":"52621020","cpu3_usage":"1821047","cpu4_total":"52620879","cpu4_usage":"1720689"},
"memory_usage":{"mem_total":"1048576","mem_free":"235464","mem_used":"813112"},
"netdev":{ "BRIDGE_rx":"0x30a0b6bba","BRIDGE_tx":"0x134ce06712","INTERNET_rx":"0xe5d193f41","INTERNET_tx":"0x2000941dd","INTERNET_rx":"0xeb9a134fe","INTERNET_tx":"0x227d6b665","WIRED_rx":"0x39ddba16c","WIRED_tx":"0x80c855eba","WIRELESS0_rx":"0x1d09911e","WIRELESS0_tx":"0x610f01c4","WIRELESS1_rx":"0x2f570951","WIRELESS1_tx":"0x32ed23b8c","LACP1_rx":"0x0","LACP1_tx":"0x5e9c7a8c","LACP2_rx":"0xf5b08c18","LACP2_tx":"0x4408840"}
}
`;
// rt_ax88u_merlin_388/temperature_001.content
const TEMPERATURE_001 = `\ufeffcurr_coreTmp_wl0_raw = "44&deg;C";
curr_coreTmp_wl0 = (curr_coreTmp_wl0_raw.indexOf("disabled") > 0 ? 0 : curr_coreTmp_wl0_raw.replace("&deg;C", ""));
curr_coreTmp_wl1_raw = "44&deg;C";
curr_coreTmp_wl1 = (curr_coreTmp_wl1_raw.indexOf("disabled") > 0 ? 0 : curr_coreTmp_wl1_raw.replace("&deg;C", ""));
curr_coreTmp_wl2_raw = "<i>disabled</i>";
curr_coreTmp_wl2 = (curr_coreTmp_wl2_raw.indexOf("disabled") > 0 ? 0 : curr_coreTmp_wl2_raw.replace("&deg;C", ""));
curr_coreTmp_wl3_raw = "<i>disabled</i>";
curr_coreTmp_wl3 = (curr_coreTmp_wl3_raw.indexOf("disabled") > 0 ? 0 : curr_coreTmp_wl3_raw.replace("&deg;C", ""));
curr_cpuTemp = "65.514";
fanctrl_info = "";
`;
// rt_ax88u_merlin_388/firmware_001.content (beginning)
const FIRMWARE_001 = `\ufeffwebs_state_update = '1';
webs_state_error = '0';
webs_state_info = '3004_388_4_0';
webs_state_info_beta = '';
webs_state_REQinfo = '';
webs_state_flag = '0';
webs_state_upgrade = '';
webs_state_level = '0';
`;

test('JSON of appGet, repaired when a firmware sends it malformed', () => {
  assert.deepEqual(readJson('{"a":"1"}'), { a: '1' });
  assert.deepEqual(readJson('{"a":"1",}'), { a: '1' }, 'trailing comma');
  assert.deepEqual(readJson('{,"a":"1"}'), { a: '1' }, 'leading comma');
  assert.deepEqual(readJson('{"a":,"b":"2"}'), { a: null, b: '2' }, 'empty value');
  assert.deepEqual(readJson('{"a":"1",,"b":"2"}'), { a: '1', b: '2' }, 'double comma');
  assert.deepEqual(
    readJson(
      '{"get_clientlist":"AA:BB:CC:DD:EE:FF":{"mac":"AA:BB:CC:DD:EE:FF"},"get_clientlist_from_json_database":{}}',
    ),
    {
      get_clientlist: { 'AA:BB:CC:DD:EE:FF': { mac: 'AA:BB:CC:DD:EE:FF' } },
      get_clientlist_from_json_database: {},
    },
    'old firmwares send the client list without braces',
  );
  assert.deepEqual(readJson('<html>login</html>'), {});
  assert.deepEqual(readJson(''), {});
  assert.deepEqual(readJson('[1]'), {});
});

test('JavaScript variables of the .asp pages', () => {
  assert.deepEqual(readJsVariables(FIRMWARE_001), {
    webs_state_update: '1',
    webs_state_error: '0',
    webs_state_info: '3004_388_4_0',
    webs_state_info_beta: '',
    webs_state_REQinfo: '',
    webs_state_flag: '0',
    webs_state_upgrade: '',
    webs_state_level: '0',
  });
});

test('MAC addresses', () => {
  assert.equal(normalizeMac('A4-83-E7-12-34-56'), 'a4:83:e7:12:34:56');
  assert.equal(normalizeMac('a483e7123456'), 'a4:83:e7:12:34:56');
  assert.equal(normalizeMac('00:00:00:00:00:00'), null);
  assert.equal(normalizeMac('incomplete'), null);
});

test('CPU: the load between two readings of the counters, none on the first', () => {
  const json = readJson(HOOK_001);
  const counters = readCpuCounters(json.cpu_usage);
  assert.equal(counters.length, 4);
  assert.equal(cpuUsage(counters, null), null);
  const later = counters.map(({ total, used }) => ({ total: total + 1000, used: used + 250 }));
  assert.equal(cpuUsage(later, counters), 25);
  assert.equal(cpuUsage(counters, later), null, 'counters reset by a reboot');
  assert.equal(cpuUsage([], []), null);
});

test('memory in %', () => {
  assert.equal(memoryUsage(readJson(HOOK_001).memory_usage), 77.5);
  assert.equal(memoryUsage({ mem_total: '1000', mem_free: '250' }), 75);
  assert.equal(memoryUsage({}), null);
});

test('traffic: the internet counters of every WAN summed, rates in Mbit/s', () => {
  const netdev = readNetdev(HOOK_001);
  assert.equal(netdev.INTERNET.rx, 0xe5d193f41 + 0xeb9a134fe);
  assert.equal(netdev.WIRED.tx, 0x80c855eba);
  const first = { rx: 1e9, tx: 5e8, at: 0 };
  assert.deepEqual(rates({ rx: 1e9 + 300e6, tx: 5e8 + 75e6 }, first, 30000), {
    downMbps: 80,
    upMbps: 20,
  });
  assert.deepEqual(rates({ rx: 10, tx: 10 }, first, 30000), { downMbps: null, upMbps: null });
  assert.deepEqual(rates(netdev.INTERNET, undefined, 30000), { downMbps: null, upMbps: null });
});

test('uptime, quoted or not (old firmwares)', () => {
  const value = 'Fri, 31 Jul 2026 10:24:04 +0200(2131043 secs since boot)';
  assert.equal(readUptime(`{"uptime":"${value}"}`), 2131043);
  assert.equal(readUptime(`{\n"uptime":${value}\n}`), 2131043);
  assert.equal(readUptime('{"uptime":""}'), null);
  assert.equal(readUptime('{}'), null);
});

test('the internet link of the active WAN', () => {
  // rt_ax88u_merlin_388/hook_006.content, reduced.
  const wan = readWan({
    get_wan_unit: 0,
    link_internet: '2',
    wan0_ipaddr: '111.222.111.222',
    wan0_gateway: '111.222.111.1',
    wan0_proto: 'pppoe',
    wan1_ipaddr: '0.0.0.0',
  });
  assert.deepEqual(wan, {
    status: 'connected',
    unit: 0,
    ip: '111.222.111.222',
    gateway: '111.222.111.1',
    proto: 'pppoe',
  });
  assert.equal(readWan({ link_internet: '1' }).status, 'connecting');
  assert.equal(readWan({ link_internet: '0' }).status, 'disconnected');
  assert.equal(readWan({}).status, 'unknown');
  assert.equal(readWan({ get_wan_unit: 1, link_internet: '2', wan1_ipaddr: '0.0.0.0' }).ip, null);
});

test('temperatures: the sensors the router has, a radio turned off has none', () => {
  assert.deepEqual(readTemperatures(TEMPERATURE_001), { '2g': 44, '5g': 44, cpu: 65.5 });
  assert.deepEqual(
    readTemperatures('curr_coreTmp_2_raw = "48&deg;C";\ncurr_coreTmp_5_raw = "53&deg;C";\n'),
    { '2g': 48, '5g': 53 },
    'older format',
  );
  assert.deepEqual(readTemperatures(''), {});
  assert.equal(scaleTemperature(4.8), 48, 'some routers report a tenth');
  assert.equal(scaleTemperature(480), 48);
  assert.equal(scaleTemperature(65.514), 65.5);
});

test('firmware versions as the router shows them', () => {
  assert.equal(formatFirmware('3.0.0.4', '388', '24198-g1d2f3a4'), '3.0.0.4.388_24198-g1d2f3a4');
  assert.equal(formatFirmware('3.0.0.4', '388.7', '0'), '3.0.0.4.388.7_0');
  assert.equal(formatFirmware('', '388', '0'), null);
  assert.equal(formatAvailableFirmware('3004_388_24198'), '3.0.0.4.388_24198');
  assert.equal(formatAvailableFirmware('3004_388_4_0'), '3.0.0.4.388.4_0');
  assert.equal(formatAvailableFirmware(''), null);
});

test('identity: the name a model is sold under first, the label MAC first', () => {
  const state = defaultState();
  assert.deepEqual(readIdentity(state.nvram), {
    model: 'RT-AX88U',
    firmware: '3.0.0.4.388.8_4',
    mac: ROUTER_MAC,
    lanIp: '192.168.50.1',
  });
  assert.equal(readIdentity({ productid: 'RT-AX58U', odmpid: 'RT-AX3000' }).model, 'RT-AX3000');
  assert.equal(
    readIdentity({ label_mac: '', lan_hwaddr: '04:D4:C4:00:00:02' }).mac,
    '04:d4:c4:00:00:02',
  );
});

test('firmware state: up to date, available, being checked', () => {
  assert.deepEqual(readFirmware(FIRMWARE_001, '3.0.0.4.388.4_0'), {
    checking: false,
    available: false,
    latest: null,
    current: '3.0.0.4.388.4_0',
  });
  const available = readFirmware(
    detectFirmware({ firmware: { update: '1', flag: '1', info: '3004_388_9_0' } }),
  );
  assert.equal(available.available, true);
  assert.equal(available.latest, '3.0.0.4.388.9_0');
  assert.equal(
    readFirmware(detectFirmware({ firmware: { update: '0', flag: '0', info: '' } })).checking,
    true,
  );
});

test('Wi-Fi radios: bands from the radio codes, the second 5 GHz of a tri-band', () => {
  assert.deepEqual(readRadios(defaultState().nvram), [
    { unit: 0, band: '2g', ssid: 'Home', enabled: true },
    { unit: 1, band: '5g', ssid: 'Home_5G', enabled: true },
  ]);
  assert.deepEqual(
    readRadios({
      wl0_nband: '2',
      wl1_nband: '1',
      wl2_nband: '1',
      wl2_radio: '0',
      wl3_nband: '4',
    }).map((radio) => [radio.band, radio.enabled]),
    [
      ['2g', null],
      ['5g', null],
      ['5g2', false],
      ['6g', null],
    ],
  );
});

test('clients: name, connection, online; AiMesh nodes and the router left out', () => {
  const state = defaultState();
  state.clients['04:D4:C4:00:00:09'] = { mac: '04:D4:C4:00:00:09', amesh_isRe: '1', isOnline: '1' };
  state.clients[ROUTER_MAC.toUpperCase()] = { mac: ROUTER_MAC.toUpperCase(), isOnline: '1' };
  state.clients[NAS_MAC.toUpperCase()].isOnline = '0';
  const clients = readClients(readJson(appGet(state, ['get_clientlist()'])), ROUTER_MAC);
  assert.deepEqual(clients, [
    {
      mac: PHONE_MAC,
      name: 'Phone of Alex',
      ip: '192.168.50.23',
      vendor: 'Google',
      online: true,
      connection: '5g',
      rssi: -52,
    },
    {
      mac: NAS_MAC,
      name: 'DS220',
      ip: '192.168.50.10',
      vendor: 'Synology',
      online: false,
      connection: 'wired',
      rssi: null,
    },
    {
      mac: TV_MAC,
      name: null,
      ip: '192.168.50.40',
      vendor: 'Samsung',
      online: true,
      connection: '2g',
      rssi: -70,
    },
  ]);
  assert.deepEqual(readClients({}), []);
});

test('the fake router answers what the readers expect', () => {
  const state = defaultState();
  assert.deepEqual(readTemperatures(coretmp(state)), { '2g': 44, '5g': 47, cpu: 65.5 });
});
