// A fake ASUS router for the tests: the answers of its web API as the dumps
// of real routers in the asusrouter library show them (RT-AX88U on
// Asuswrt-Merlin 388), with the values of a small home network, served
// through the `request` transport of the client. Tests never touch the
// network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-15T18:00:00Z');
const MINUTE = 60000;
const ROUTER_MAC = '04:d4:c4:00:00:01';
const PHONE_MAC = 'a4:83:e7:12:34:56';
const NAS_MAC = '00:11:32:aa:bb:cc';
const TV_MAC = '3c:2a:f4:01:02:03';
const TOKEN = 'tok-1';
const USERNAME = 'admin';
const PASSWORD = 'secret';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary file path for the known MAC addresses.
 * @returns {string} The path (its directory exists, the file does not).
 */
const knownPath = () => join(mkdtempSync(join(tmpdir(), 'asuswrt-')), 'known-hosts.json');

/**
 * @description A client entry of get_clientlist.
 * @param {string} mac - The MAC (upper case, as the router writes it).
 * @param {object} values - The fields.
 * @returns {object} The entry.
 */
const clientEntry = (mac, values) => ({
  type: '0',
  defaultType: '0',
  name: '',
  nickName: '',
  ip: '',
  mac: mac.toUpperCase(),
  from: 'networkmapd',
  macRepeat: '0',
  isGateway: '0',
  isWebServer: '0',
  isPrinter: '0',
  isITunes: '0',
  dpiType: '',
  dpiDevice: '',
  vendor: '',
  isWL: '0',
  isGN: '',
  isOnline: '1',
  ssid: '',
  isLogin: '0',
  opMode: '0',
  rssi: '0',
  curTx: '',
  curRx: '',
  totalTx: '',
  totalRx: '',
  wlConnectTime: '',
  ipMethod: 'DHCP',
  ROG: '0',
  group: '',
  callback: '',
  keeparp: '',
  qosLevel: '',
  wtfast: '0',
  internetMode: 'allow',
  internetState: '1',
  amesh_isReClient: '1',
  amesh_papMac: ROUTER_MAC.toUpperCase(),
  ...values,
});

/**
 * @description The default state of the router.
 * @returns {object} The state.
 */
function defaultState() {
  return {
    nvram: {
      productid: 'RT-AX88U',
      odmpid: '',
      firmver: '3.0.0.4',
      buildno: '388.8',
      extendno: '4',
      label_mac: ROUTER_MAC.toUpperCase(),
      lan_hwaddr: ROUTER_MAC.toUpperCase(),
      lan_ipaddr: '192.168.50.1',
      link_internet: '2',
      wan0_ipaddr: '90.12.34.56',
      wan0_gateway: '90.12.34.1',
      wan0_proto: 'pppoe',
      wan1_ipaddr: '0.0.0.0',
      wan1_gateway: '0.0.0.0',
      wan1_proto: 'dhcp',
      wl0_nband: '2',
      wl0_radio: '1',
      wl0_ssid: 'Home',
      wl1_nband: '1',
      wl1_radio: '1',
      wl1_ssid: 'Home_5G',
      wl2_nband: '',
      wl2_radio: '',
      wl2_ssid: '',
      wl3_nband: '',
      wl3_radio: '',
      wl3_ssid: '',
    },
    wanUnit: 0,
    // Seconds since the start of the test: drives the counters.
    elapsed: 0,
    uptime: 2131043,
    // Old firmwares answer the uptime unquoted.
    uptimeQuoted: true,
    clients: {
      [PHONE_MAC.toUpperCase()]: clientEntry(PHONE_MAC, {
        name: 'Pixel-8',
        nickName: 'Phone of Alex',
        ip: '192.168.50.23',
        vendor: 'Google',
        isWL: '2',
        rssi: '-52',
      }),
      [NAS_MAC.toUpperCase()]: clientEntry(NAS_MAC, {
        name: 'DS220',
        ip: '192.168.50.10',
        vendor: 'Synology',
        isWL: '0',
      }),
      [TV_MAC.toUpperCase()]: clientEntry(TV_MAC, {
        ip: '192.168.50.40',
        vendor: 'Samsung',
        isWL: '1',
        rssi: '-70',
      }),
    },
    temperatures: { wl0: '44', wl1: '47', cpu: '65.514' },
    firmware: { update: '1', flag: '0', info: '3004_388_8_4' },
    // What the next firmware check finds.
    firmwareAfterCheck: { flag: '1', info: '3004_388_9_0' },
  };
}

/**
 * @description The JSON of the hooks of an appGet request.
 * @param {object} state - The router state.
 * @param {string[]} hooks - The hooks.
 * @returns {string} The raw answer.
 */
function appGet(state, hooks) {
  const parts = [];
  for (const hook of hooks) {
    const [, name, arg] = /^(\w+)\((.*)\)$/.exec(hook);
    const s = state.elapsed;
    if (name === 'nvram_get') {
      parts.push(`"${arg}":${JSON.stringify(state.nvram[arg] ?? '')}`);
    } else if (name === 'cpu_usage') {
      const core = (n, load) =>
        `"cpu${n}_total":"${50000000 + s * 400}","cpu${n}_usage":"${4000000 + s * 400 * load}"`;
      parts.push(`"cpu_usage":{${[core(1, 0.2), core(2, 0.1)].join(',')}}`);
    } else if (name === 'memory_usage') {
      parts.push('"memory_usage":{"mem_total":"1048576","mem_free":"235464","mem_used":"813112"}');
    } else if (name === 'netdev') {
      // 80 Mbit/s down, 20 up on the internet link; INTERNET twice (dual WAN).
      const hex = (value) => `0x${Math.round(value).toString(16)}`;
      parts.push(
        `"netdev":{ "BRIDGE_rx":"0x30a0b6bba","BRIDGE_tx":"0x134ce06712",` +
          `"INTERNET_rx":"${hex(1e9 + s * 10e6)}","INTERNET_tx":"${hex(5e8 + s * 2.5e6)}",` +
          `"INTERNET_rx":"0x0","INTERNET_tx":"0x0","WIRED_rx":"0x39ddba16c","WIRED_tx":"0x80c855eba"}`,
      );
    } else if (name === 'uptime') {
      const value = `Thu, 15 Oct 2026 20:00:00 +0200(${state.uptime + s} secs since boot)`;
      parts.push(state.uptimeQuoted ? `"uptime":"${value}"` : `"uptime":${value}`);
    } else if (name === 'get_wan_unit') {
      parts.push(`"get_wan_unit":${state.wanUnit}`);
    } else if (name === 'get_clientlist') {
      const list = { ...state.clients, maclist: Object.keys(state.clients), ClientAPILevel: '2' };
      parts.push(`"get_clientlist":${JSON.stringify(list)}`);
    }
  }
  return `{\n${parts.join(',\n')}\n}\n`;
}

/**
 * @description ajax_coretmp.asp, as the RT-AX88U answers it.
 * @param {object} state - The router state.
 * @returns {string} The page.
 */
function coretmp(state) {
  const raw = (value) => (value ? `"${value}&deg;C"` : '"<i>disabled</i>"');
  const lines = [0, 1, 2, 3].map(
    (unit) =>
      `curr_coreTmp_wl${unit}_raw = ${raw(state.temperatures[`wl${unit}`])};\n` +
      `curr_coreTmp_wl${unit} = (curr_coreTmp_wl${unit}_raw.indexOf("disabled") > 0 ? 0 : curr_coreTmp_wl${unit}_raw.replace("&deg;C", ""));`,
  );
  return `\ufeff${lines.join('\n')}\ncurr_cpuTemp = "${state.temperatures.cpu}";\nfanctrl_info = "";\n`;
}

/**
 * @description detect_firmware.asp.
 * @param {object} state - The router state.
 * @returns {string} The page.
 */
const detectFirmware = ({ firmware }) =>
  `\ufeffwebs_state_update = '${firmware.update}';\nwebs_state_error = '0';\n` +
  `webs_state_info = '${firmware.info}';\nwebs_state_info_beta = '';\nwebs_state_REQinfo = '';\n` +
  `webs_state_flag = '${firmware.flag}';\nwebs_state_upgrade = '';\nwebs_state_level = '0';\n`;

/**
 * @description A fake router behind the `request` transport.
 * @param {object} [options] - `{ state, statuses }`: overrides of the state,
 * and per page an HTTP status (404...) or 'ECONNREFUSED'.
 * @returns {Function} The transport, with `state`, `statuses`, `calls`, `applied`.
 */
function asusRouter({ state: overrides = {}, statuses = {} } = {}) {
  const state = { ...defaultState(), ...overrides };
  const request = async ({ url, method, headers, body }) => {
    const page = new URL(url).pathname.slice(1);
    const decoded = decodeURIComponent(body ?? '');
    request.calls.push({ page, method, headers, body: decoded });
    if (request.statuses[page] === 'ECONNREFUSED' || request.statuses.all === 'ECONNREFUSED') {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (typeof request.statuses[page] === 'number') {
      return { status: request.statuses[page], body: '' };
    }
    if (page === 'login.cgi') {
      if (request.lock) {
        return {
          status: 200,
          body: `{"error_status":"7","remaining_lock_time":"${request.lock}"}`,
        };
      }
      const expected = Buffer.from(`${USERNAME}:${state.password ?? PASSWORD}`).toString('base64');
      request.logins += 1;
      return decoded === `login_authorization=${expected}`
        ? { status: 200, body: `{"asus_token":"${request.token}","batch_token":""}` }
        : { status: 200, body: '{"error_status":"3"}' };
    }
    if (page === 'Logout.asp') {
      return { status: 200, body: '' };
    }
    if (headers.Cookie !== `asus_token=${request.token}`) {
      return { status: 200, body: '{"error_status":"2"}' };
    }
    if (page === 'appGet.cgi') {
      return { status: 200, body: appGet(state, decoded.replace(/^hook=/, '').split(';')) };
    }
    if (page === 'ajax_coretmp.asp') {
      return { status: 200, body: coretmp(state) };
    }
    if (page === 'detect_firmware.asp') {
      return { status: 200, body: detectFirmware(state) };
    }
    if (page === 'applyapp.cgi') {
      const command = JSON.parse(decoded);
      request.applied.push(command);
      Object.entries(command)
        .filter(([key]) => !['action_mode', 'rc_service'].includes(key))
        .forEach(([key, value]) => {
          state.nvram[key] = String(value);
        });
      if (command.rc_service === 'start_webs_update') {
        state.firmware = { update: '1', ...state.firmwareAfterCheck };
      }
      return {
        status: 200,
        body: `{"modify":"1","run_service":"${command.rc_service}","restart_needed_time":"5"}`,
      };
    }
    return { status: 404, body: '' };
  };
  request.state = state;
  request.statuses = { ...statuses };
  request.calls = [];
  request.applied = [];
  request.logins = 0;
  request.token = TOKEN;
  request.lock = null;
  request.count = (page) => request.calls.filter((call) => call.page === page).length;
  return request;
}

// A Gladys-like object for the pure builders.
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:asuswrt:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  NOW,
  MINUTE,
  ROUTER_MAC,
  PHONE_MAC,
  NAS_MAC,
  TV_MAC,
  USERNAME,
  PASSWORD,
  silent,
  knownPath,
  clientEntry,
  defaultState,
  appGet,
  coretmp,
  detectFirmware,
  asusRouter,
  fakeGladys,
};
