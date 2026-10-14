// -----------------------------------------------------------------------------
// Router answers -> plain snapshots. Pure functions, no I/O.
//
// Formats come from the asusrouter library (see NOTICE) and its test dumps of
// real routers (RT-AX88U, GT-AX11000 Pro, MAP-AC1300, stock and Merlin):
//   - appGet.cgi answers JSON, sometimes malformed (empty values, trailing
//     commas, an unquoted `uptime`, a `get_clientlist` without braces on old
//     firmware, `INTERNET_rx` repeated once per WAN on dual-WAN routers);
//   - the .asp pages answer JavaScript assignments (`name = "value";`).
// Unknown values are null, never 0: a missing sensor is not a cold one.
// -----------------------------------------------------------------------------

// Malformed JSON some firmwares send (asusrouter tools/readers/raw.py).
const JSON_FIXES = [
  [/\s*,\s*,/g, ', '],
  [/^\s*{\s*,/, '{'],
  [/,\s*}\s*$/, '}'],
  [/:\s*(,|\})/g, ': null$1'],
  [/("get_clientlist":)\s*(".*?)(\s*,\s*"get_clientlist_from_json_database")/s, '$1{$2}$3'],
];
// Control characters (NUL to TAB) that break JSON.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x09]/g;

/**
 * @description Parse an appGet answer, repairing the JSON when needed.
 * @param {string} text - The raw answer.
 * @returns {object} The object, {} when it cannot be read.
 * @example
 * readJson('{"a":"1",}'); // -> { a: '1' }
 */
function readJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return {};
  }
  let content = text.replace(CONTROL, '');
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // Repaired below.
  }
  for (const [pattern, replacement] of JSON_FIXES) {
    content = content.replace(pattern, replacement);
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const JS_VARIABLE = /\b(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;]*?)\s*;/g;

/**
 * @description The JavaScript variables of an .asp page, as strings.
 * @param {string} text - The page.
 * @returns {object} `{ name: value }`, quotes removed.
 * @example
 * readJsVariables("webs_state_flag = '1';"); // -> { webs_state_flag: '1' }
 */
function readJsVariables(text) {
  const variables = {};
  for (const [, name, raw] of String(text ?? '').matchAll(JS_VARIABLE)) {
    const value = raw.trim();
    variables[name] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;
  }
  return variables;
}

/**
 * @description A number of a raw value, null when it is not one.
 * @param {unknown} raw - The value ("12", 12, "0x1f"...).
 * @returns {number|null} The number.
 */
function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const round = (value, digits = 1) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

const text = (raw) => (typeof raw === 'string' && raw.trim() ? raw.trim() : null);

/**
 * @description A MAC address in lower case with colons, null when invalid.
 * @param {unknown} raw - 'AA:BB:CC:DD:EE:FF', 'aa-bb-...', 'aabbccddeeff'.
 * @returns {string|null} 'aa:bb:cc:dd:ee:ff'.
 * @example
 * normalizeMac('A4-83-E7-12-34-56'); // -> 'a4:83:e7:12:34:56'
 */
function normalizeMac(raw) {
  const hex = String(raw ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12 || /^0+$/.test(hex)) {
    return null;
  }
  return hex.match(/../g).join(':');
}

/**
 * @description The cumulative CPU counters of the `cpu_usage` hook.
 * @param {object} raw - `{ cpu1_total, cpu1_usage, cpu2_total, ... }`.
 * @returns {Array<{ total: number, used: number }>} One entry per core.
 */
function readCpuCounters(raw) {
  const cores = [];
  for (let core = 1; raw && `cpu${core}_total` in raw; core += 1) {
    const total = toNumber(raw[`cpu${core}_total`]);
    const used = toNumber(raw[`cpu${core}_usage`]);
    if (total !== null && used !== null) {
      cores.push({ total, used });
    }
  }
  return cores;
}

/**
 * @description The CPU usage between two readings of the counters: the
 * counters count since boot, only their difference is the load of now.
 * @param {Array<object>} current - readCpuCounters of now.
 * @param {Array<object>|null} previous - readCpuCounters of the last round.
 * @returns {number|null} The usage in %, null on the first reading.
 * @example
 * cpuUsage([{ total: 200, used: 30 }], [{ total: 100, used: 10 }]); // -> 20
 */
function cpuUsage(current, previous) {
  if (!previous || previous.length !== current.length || current.length === 0) {
    return null;
  }
  let total = 0;
  let used = 0;
  current.forEach((core, index) => {
    total += core.total - previous[index].total;
    used += core.used - previous[index].used;
  });
  if (total <= 0 || used < 0) {
    return null;
  }
  return round(Math.min(100, (used / total) * 100));
}

/**
 * @description The memory usage of the `memory_usage` hook (KiB).
 * @param {object} raw - `{ mem_total, mem_free, mem_used }`.
 * @returns {number|null} The usage in %.
 * @example
 * memoryUsage({ mem_total: '1048576', mem_used: '813112' }); // -> 77.5
 */
function memoryUsage(raw) {
  const total = toNumber(raw?.mem_total);
  let used = toNumber(raw?.mem_used);
  if (used === null && total !== null && toNumber(raw?.mem_free) !== null) {
    used = total - toNumber(raw.mem_free);
  }
  if (!total || used === null) {
    return null;
  }
  return round(Math.min(100, Math.max(0, (used / total) * 100)));
}

const NETDEV_FLAT = /"(\w+)_(rx|tx)"\s*:\s*"(0x[0-9a-fA-F]+)"/g;

/**
 * @description The byte counters of the `netdev` hook, per interface. Read
 * from the raw answer, not as JSON: a dual-WAN router repeats `INTERNET_rx`
 * once per WAN, and the duplicates are summed.
 * @param {string} rawText - The raw appGet answer.
 * @returns {object} `{ INTERNET: { rx, tx }, WIRED: {...}, ... }` in bytes.
 */
function readNetdev(rawText) {
  const counters = {};
  for (const [, iface, kind, value] of String(rawText ?? '').matchAll(NETDEV_FLAT)) {
    counters[iface] ??= { rx: 0, tx: 0 };
    counters[iface][kind] += Number.parseInt(value, 16);
  }
  return counters;
}

/**
 * @description The rates of an interface between two readings of its counters.
 * @param {{ rx: number, tx: number }|undefined} current - Counters of now.
 * @param {{ rx: number, tx: number, at: number }|undefined} previous - Counters
 * of the last round, with their time in ms.
 * @param {number} at - Now, in ms.
 * @returns {{ downMbps: number|null, upMbps: number|null }} Mbit/s, null on
 * the first reading or after a counter reset (reboot, 32-bit wrap).
 */
function rates(current, previous, at) {
  const seconds = previous ? (at - previous.at) / 1000 : 0;
  if (!current || !previous || seconds <= 0) {
    return { downMbps: null, upMbps: null };
  }
  const rate = (delta) => (delta < 0 ? null : round((delta * 8) / 1e6 / seconds, 2));
  return { downMbps: rate(current.rx - previous.rx), upMbps: rate(current.tx - previous.tx) };
}

/**
 * @description The seconds since boot of the `uptime` hook. Read from the raw
 * answer: old firmwares do not quote the value, which breaks the JSON.
 * @param {string} rawText - `{"uptime":"Fri, 31 Jul 2026 10:24:04 +0200(2131043 secs since boot)"}`.
 * @returns {number|null} The seconds.
 * @example
 * readUptime('{"uptime":"Fri, 31 Jul 2026 10:24:04 +0200(2131043 secs since boot)"}'); // -> 2131043
 */
function readUptime(rawText) {
  const match = /"uptime"\s*:\s*([^}\n]+)/.exec(String(rawText ?? ''));
  const seconds = match ? /\((\d+)/.exec(match[1]) : null;
  const value = seconds ? Number(seconds[1]) : null;
  // No router runs for a hundred years: such a value is garbage.
  return value !== null && value < 100 * 365 * 86400 ? value : null;
}

/**
 * @description The internet link of the router.
 * @param {object} raw - appGet of `get_wan_unit()` and the nvram_get of
 * `link_internet`, `wan<unit>_ipaddr`, `wan<unit>_gateway`, `wan<unit>_proto`.
 * @returns {{ status: string, unit: number, ip: string|null, gateway: string|null, proto: string|null }}
 * `status`: connected, connecting, disconnected or unknown.
 */
function readWan(raw) {
  const unit = toNumber(raw?.get_wan_unit) ?? 0;
  const link = toNumber(raw?.link_internet);
  const status =
    link === 2
      ? 'connected'
      : link === 1
        ? 'connecting'
        : link === 0 || link === -1
          ? 'disconnected'
          : 'unknown';
  const address = (key) => {
    const value = text(raw?.[`wan${unit}_${key}`]);
    return value && value !== '0.0.0.0' ? value : null;
  };
  return {
    status,
    unit,
    ip: address('ipaddr'),
    gateway: address('gateway'),
    proto: text(raw?.[`wan${unit}_proto`]),
  };
}

// The JavaScript variables of ajax_coretmp.asp, per format (asusrouter
// modules/temperature/source.py): the first format whose key is present wins.
const TEMPERATURE_FORMATS = [
  {
    marker: 'curr_coreTmp_5_raw',
    keys: { curr_coreTmp_2_raw: '2g', curr_coreTmp_5_raw: '5g', curr_coreTmp_52_raw: '5g2' },
  },
  {
    marker: 'curr_coreTmp_0_raw',
    keys: {
      curr_coreTmp_0_raw: '2g',
      curr_coreTmp_1_raw: '5g',
      curr_coreTmp_2_raw: '5g2',
      curr_coreTmp_3_raw: '6g',
    },
  },
  {
    marker: 'curr_coreTmp_wl0_raw',
    keys: {
      curr_coreTmp_wl0_raw: '2g',
      curr_coreTmp_wl1_raw: '5g',
      curr_coreTmp_wl2_raw: '5g2',
      curr_coreTmp_wl3_raw: '6g',
    },
  },
];
const TEMPERATURE_RANGE = { min: 10, max: 150 };

/**
 * @description A temperature some routers report off by powers of ten, put
 * back between 10 and 150 °C (asusrouter "optimistic temperature").
 * @param {number} value - The raw value.
 * @returns {number} The value in °C.
 */
function scaleTemperature(value) {
  let scaled = value;
  for (let step = 0; step < 5 && scaled > 0 && scaled < TEMPERATURE_RANGE.min; step += 1) {
    scaled *= 10;
  }
  for (let step = 0; step < 5 && scaled > TEMPERATURE_RANGE.max; step += 1) {
    scaled /= 10;
  }
  return round(scaled);
}

/**
 * @description The temperatures of ajax_coretmp.asp.
 * @param {string} page - The page.
 * @returns {object} `{ cpu, '2g', '5g', '5g2', '6g' }`, only the sensors the
 * router has (a radio turned off answers "disabled": no value).
 */
function readTemperatures(page) {
  const variables = readJsVariables(page);
  const format = TEMPERATURE_FORMATS.find((candidate) => candidate.marker in variables);
  const raw = {};
  Object.entries(format?.keys ?? {}).forEach(([name, key]) => {
    raw[key] = variables[name];
  });
  raw.cpu = variables.curr_coreTmp_cpu ?? variables.curr_cpuTemp;
  const temperatures = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value || value.includes('disabled')) {
      return;
    }
    const number = toNumber(value.replace('&deg;C', '').trim());
    if (number !== null && number > 0) {
      temperatures[key] = scaleTemperature(number);
    }
  });
  return temperatures;
}

/**
 * @description A firmware version as the router shows it.
 * @param {string|null} firmver - '3.0.0.4'.
 * @param {string|null} buildno - '388' (or '388.7' on Merlin).
 * @param {string|null} extendno - '24198-g1d2f3a4' (or '0').
 * @returns {string|null} '3.0.0.4.388_24198-g1d2f3a4'.
 */
function formatFirmware(firmver, buildno, extendno) {
  const major = text(firmver);
  const minor = text(buildno);
  if (!major || !minor) {
    return null;
  }
  const build = text(extendno);
  return build ? `${major}.${minor}_${build}` : `${major}.${minor}`;
}

/**
 * @description An available firmware of detect_firmware.asp, as the router
 * shows a version: '3004_388_24198' -> '3.0.0.4.388_24198', Merlin's
 * '3004_388_4_0' -> '3.0.0.4.388.4_0'.
 * @param {string|null} raw - `webs_state_info`.
 * @returns {string|null} The version.
 */
function formatAvailableFirmware(raw) {
  const parts = String(raw ?? '')
    .trim()
    .split('_');
  if (parts.length < 2 || !/^\d{4}$/.test(parts[0])) {
    return null;
  }
  const major = parts[0].split('').join('.');
  return parts.length >= 4
    ? `${major}.${parts[1]}.${parts[2]}_${parts.slice(3).join('_')}`
    : `${major}.${parts[1]}_${parts.slice(2).join('_')}`;
}

/**
 * @description The identity of the router.
 * @param {object} raw - The nvram_get of productid, odmpid, firmver, buildno,
 * extendno, label_mac, lan_hwaddr, lan_ipaddr.
 * @returns {{ model: string|null, firmware: string|null, mac: string|null, lanIp: string|null }}
 */
function readIdentity(raw) {
  return {
    // odmpid is the name a re-branded model is sold under.
    model: text(raw?.odmpid) ?? text(raw?.productid),
    firmware: formatFirmware(raw?.firmver, raw?.buildno, raw?.extendno),
    mac: normalizeMac(raw?.label_mac) ?? normalizeMac(raw?.lan_hwaddr),
    lanIp: text(raw?.lan_ipaddr),
  };
}

/**
 * @description The firmware state of detect_firmware.asp: what the last
 * check of the router found (the router checks once a day by itself).
 * @param {string} page - The page.
 * @param {string|null} current - The running firmware.
 * @returns {{ checking: boolean, available: boolean, latest: string|null, current: string|null }}
 */
function readFirmware(page, current = null) {
  const variables = readJsVariables(page);
  const flag = toNumber(variables.webs_state_flag);
  const latest = formatAvailableFirmware(variables.webs_state_info);
  return {
    // webs_state_update: 0 while a check runs, 1 once done.
    checking: variables.webs_state_update === '0',
    available: flag === 1 || flag === 2,
    latest: flag === 1 || flag === 2 ? latest : null,
    current,
  };
}

// Broadcom radio codes of `wl<unit>_nband`: 2 = 2.4 GHz, 1 = 5 GHz, 4 = 6 GHz.
const NBAND = { 2: '2g', 1: '5g', 4: '6g' };
const RADIO_UNITS = [0, 1, 2, 3];

/**
 * @description The nvram keys of the Wi-Fi radios.
 * @returns {string[]} The nvram_get hooks.
 */
const radioHooks = () =>
  RADIO_UNITS.flatMap((unit) => [
    `nvram_get(wl${unit}_nband)`,
    `nvram_get(wl${unit}_radio)`,
    `nvram_get(wl${unit}_ssid)`,
  ]);

/**
 * @description The Wi-Fi radios of the router.
 * @param {object} raw - The nvram_get of wl<unit>_nband, _radio, _ssid.
 * @returns {Array<{ unit: number, band: string, ssid: string|null, enabled: boolean|null }>}
 * `band`: 2g, 5g, 5g2 (the second 5 GHz radio of a tri-band router), 6g, 6g2.
 */
function readRadios(raw) {
  const seen = {};
  return RADIO_UNITS.flatMap((unit) => {
    const base = NBAND[text(raw?.[`wl${unit}_nband`])];
    if (!base) {
      return [];
    }
    seen[base] = (seen[base] ?? 0) + 1;
    const radio = text(raw?.[`wl${unit}_radio`]);
    return [
      {
        unit,
        band: seen[base] === 1 ? base : `${base}${seen[base]}`,
        ssid: text(raw?.[`wl${unit}_ssid`]),
        enabled: radio === '1' ? true : radio === '0' ? false : null,
      },
    ];
  });
}

// `isWL` of a client: 0 wired, 1 2.4 GHz, 2 and 3 5 GHz, 4 6 GHz.
const CONNECTIONS = { 0: 'wired', 1: '2g', 2: '5g', 3: '5g', 4: '6g' };
// Keys of get_clientlist that are not clients.
const NOT_CLIENTS = new Set(['maclist', 'ClientAPILevel']);

/**
 * @description The clients of the `get_clientlist` hook. AiMesh nodes and
 * the router itself are left out.
 * @param {object} raw - The parsed appGet answer.
 * @param {string|null} routerMac - The MAC of the router.
 * @returns {Array<object>} `{ mac, name, ip, vendor, online, connection, rssi }`.
 */
function readClients(raw, routerMac = null) {
  const list = raw?.get_clientlist;
  if (!list || typeof list !== 'object') {
    return [];
  }
  return Object.entries(list).flatMap(([key, entry]) => {
    if (NOT_CLIENTS.has(key) || !entry || typeof entry !== 'object') {
      return [];
    }
    // Some firmwares end keys with a space ("conn_ts ").
    const client = Object.fromEntries(Object.entries(entry).map(([k, v]) => [k.trim(), v]));
    const mac = normalizeMac(client.mac ?? key);
    if (!mac || mac === routerMac || client.amesh_isRe === '1' || client.amesh_isRe === 1) {
      return [];
    }
    const wireless = toNumber(client.isWL);
    const ip = text(client.ip);
    return [
      {
        mac,
        name: text(client.nickName) ?? text(client.name),
        ip: ip && ip !== '0.0.0.0' ? ip : null,
        vendor: text(client.vendor),
        online: client.isOnline === '1' || client.isOnline === 1,
        connection: CONNECTIONS[wireless] ?? null,
        rssi: wireless ? toNumber(client.rssi) : null,
      },
    ];
  });
}

export {
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
  radioHooks,
  readRadios,
  readClients,
};
