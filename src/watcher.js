// -----------------------------------------------------------------------------
// The reading loop: every `poll_interval` seconds, the state of the router.
//
// Each round reads what moves (CPU and memory counters, traffic counters,
// uptime, internet link, Wi-Fi radios, client list, temperatures); what
// hardly moves (model, firmware, result of the router's last firmware check)
// is read every SLOW_INTERVAL_MS only.
//
// It keeps the snapshots the devices, widgets and scene actions read, and
// hands each round to the app with its transitions (tracker.js). A round
// never overlaps another one. The first request (CPU, memory, traffic) is the
// probe of the round: when it fails (unreachable, wrong password), the round
// fails (onError); any other read failing keeps its previous snapshot.
// -----------------------------------------------------------------------------

import {
  readJson,
  readCpuCounters,
  cpuUsage,
  memoryUsage,
  readNetdev,
  rates,
  readUptime,
  readWan,
  readTemperatures,
  readIdentity,
  readFirmware,
  radioHooks,
  readRadios,
  readClients,
} from './read.js';
import { nextPresence, diffInternet, diffReboot, diffFirmware } from './tracker.js';

const SLOW_INTERVAL_MS = 10 * 60 * 1000;
// A page missing on this model (no temperature page, older firmware) is not
// asked again before this delay.
const RETRY_MISSING_MS = 60 * 60 * 1000;

const PROBE_HOOKS = ['cpu_usage(appobj)', 'memory_usage(appobj)', 'netdev(appobj)'];
const WAN_HOOKS = [
  'get_wan_unit()',
  'nvram_get(link_internet)',
  ...[0, 1].flatMap((unit) => [
    `nvram_get(wan${unit}_ipaddr)`,
    `nvram_get(wan${unit}_gateway)`,
    `nvram_get(wan${unit}_proto)`,
  ]),
];
const IDENTITY_HOOKS = [
  'productid',
  'odmpid',
  'firmver',
  'buildno',
  'extendno',
  'label_mac',
  'lan_hwaddr',
  'lan_ipaddr',
].map((key) => `nvram_get(${key})`);
// The `netdev` counter of the internet link.
const WAN_COUNTER = 'INTERNET';

/**
 * @description Create the watcher.
 * @param {object} options - Options.
 * @param {object} options.api - The router client (asus-api.js).
 * @param {object} options.known - The known MAC addresses (store.js).
 * @param {Function} options.getConfig - `() => normalized config`.
 * @param {Function} options.isEnabled - `() => boolean`: address and account known.
 * @param {Function} options.onRound - `async (round) => void`.
 * @param {Function} options.onError - `async (err) => void`.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The watcher.
 * @example
 * const watcher = createWatcher({ api, known, getConfig, isEnabled, onRound, onError, logger });
 * watcher.start();
 */
function createWatcher({
  api,
  known,
  getConfig,
  isEnabled,
  onRound,
  onError,
  now = () => Date.now(),
  logger,
}) {
  let router = null;
  let identity = null;
  let firmware;
  let slowAt = null;
  let cpuCounters = null;
  let wanCounters = null;
  let bootAt;
  let radios = new Map();
  let clients = new Map();
  // Temperature sensors met since the start: a radio turned off stops
  // reporting its own, its feature must not vanish from the Discovery list.
  let sensors = new Set();
  let fetchedAt = null;
  let rebootExpected = false;
  // page -> time it was found missing
  let missing = new Map();
  let timer = null;
  let running = null;
  let started = false;

  /**
   * @description Read an optional part: undefined when it fails.
   * @param {string} name - A name for the logs and the missing map.
   * @param {Function} read - `async () => answer`.
   * @returns {Promise<unknown>} The answer.
   */
  async function readOptional(name, read) {
    const since = missing.get(name);
    if (since !== undefined && now() - since < RETRY_MISSING_MS) {
      return undefined;
    }
    try {
      const answer = await read();
      missing.delete(name);
      return answer;
    } catch (err) {
      if (err.kind === 'not_found') {
        if (since === undefined) {
          logger.info(`Router ${name}: ${err.message}, skipped`);
        }
        missing.set(name, now());
      } else {
        logger.warn(`Router ${name}: ${err.message}`);
      }
      return undefined;
    }
  }

  /**
   * @description The parts read every SLOW_INTERVAL_MS.
   * @param {boolean} force - Read them now.
   * @returns {Promise<void>}
   */
  async function readSlow(force) {
    const at = now();
    if (!force && slowAt !== null && at - slowAt < SLOW_INTERVAL_MS) {
      return;
    }
    const identityAnswer = await readOptional('identity', () => api.appGet(IDENTITY_HOOKS));
    if (identityAnswer !== undefined) {
      identity = readIdentity(readJson(identityAnswer));
    }
    const firmwarePage = await readOptional('firmware', () => api.page('detect_firmware.asp'));
    if (firmwarePage !== undefined) {
      firmware = readFirmware(firmwarePage, identity?.firmware ?? null);
    }
    slowAt = at;
  }

  /**
   * @description One reading of the router.
   * @param {boolean} forceSlow - Read the slow parts too.
   * @returns {Promise<void>}
   */
  async function readAll(forceSlow) {
    // The probe: a failure here fails the round.
    const probe = await api.appGet(PROBE_HOOKS);
    const at = now();
    const baseline = fetchedAt === null;
    const previousFirmware = baseline ? undefined : (firmware ?? null);
    await readSlow(forceSlow);
    const config = getConfig();
    const round = {
      baseline,
      presence: [],
      newClients: [],
      internet: null,
      rebooted: false,
      firmware: null,
    };

    // --- system -----------------------------------------------------------------
    const probeJson = readJson(probe);
    const counters = readCpuCounters(probeJson.cpu_usage);
    const cpu = cpuUsage(counters, cpuCounters);
    cpuCounters = counters.length > 0 ? counters : cpuCounters;
    const netdev = readNetdev(probe)[WAN_COUNTER];
    const wanRates = rates(netdev, wanCounters, at);
    wanCounters = netdev ? { ...netdev, at } : wanCounters;

    const uptimeAnswer = await readOptional('uptime', () => api.appGet(['uptime()']));
    const uptime = uptimeAnswer === undefined ? null : readUptime(uptimeAnswer);
    const nextBoot = uptime === null ? null : at - uptime * 1000;
    if (nextBoot !== null) {
      if (!baseline && diffReboot(bootAt, nextBoot)) {
        // A reboot asked from Gladys fires no scene event.
        round.rebooted = !rebootExpected;
        rebootExpected = false;
      }
      bootAt = nextBoot;
    }

    const temperaturePage = await readOptional('temperatures', () => api.page('ajax_coretmp.asp'));
    const temperatures =
      temperaturePage === undefined
        ? (router?.temperatures ?? {})
        : readTemperatures(temperaturePage);
    Object.keys(temperatures).forEach((key) => sensors.add(key));

    // --- internet link and Wi-Fi radios -----------------------------------------
    const wanAnswer = await readOptional('wan', () => api.appGet([...WAN_HOOKS, ...radioHooks()]));
    let wan = router?.wan ?? null;
    if (wanAnswer !== undefined) {
      const wanJson = readJson(wanAnswer);
      const nextWan = readWan(wanJson);
      if (!baseline) {
        round.internet = diffInternet(wan ?? undefined, nextWan);
      }
      wan = nextWan;
      const read = readRadios(wanJson);
      if (read.length > 0) {
        radios = new Map(read.map((radio) => [radio.unit, radio]));
      }
    }

    // --- clients and presence ---------------------------------------------------
    const clientAnswer = await readOptional('clients', () => api.appGet(['get_clientlist()']));
    if (clientAnswer !== undefined) {
      const absenceMs = config.absenceDelay * 60000;
      const read = new Map(
        readClients(readJson(clientAnswer), identity?.mac ?? null).map((c) => [c.mac, c]),
      );
      const next = new Map();
      for (const mac of new Set([...clients.keys(), ...read.keys()])) {
        const before = clients.get(mac);
        const fresh = read.get(mac);
        const client = { ...(before ?? {}), ...(fresh ?? { online: false }) };
        // A name, an address once known stays known.
        client.mac = mac;
        client.name = client.name ?? before?.name ?? null;
        client.ip = client.ip ?? before?.ip ?? null;
        client.vendor = client.vendor ?? before?.vendor ?? null;
        client.connection = client.online ? client.connection : (before?.connection ?? null);
        const presence = nextPresence(baseline ? undefined : before, client.online, at, absenceMs);
        client.present = presence.present;
        client.lastSeen = presence.lastSeen;
        if (presence.event) {
          round.presence.push({ client, event: presence.event });
        }
        next.set(mac, client);
      }
      clients = next;
      const online = [...read.values()].filter((c) => c.online).map((c) => c.mac);
      const unknown = online.filter((mac) => !known.has(mac));
      if (unknown.length > 0) {
        if (known.initialized()) {
          unknown.forEach((mac) => round.newClients.push({ client: clients.get(mac) }));
        }
        await known.add(unknown);
      } else if (!known.initialized()) {
        await known.add([]);
      }
    }

    // --- firmware ---------------------------------------------------------------
    if (firmware && diffFirmware(previousFirmware ?? undefined, firmware)) {
      round.firmware = firmware;
    }

    router = {
      identity,
      cpu,
      memory: memoryUsage(probeJson.memory_usage),
      temperatures,
      uptimeDays: uptime === null ? null : Math.round((uptime / 86400) * 100) / 100,
      bootAt: bootAt ?? null,
      downMbps: wanRates.downMbps,
      upMbps: wanRates.upMbps,
      wan,
      clientsOnline:
        clientAnswer === undefined
          ? (router?.clientsOnline ?? null)
          : [...clients.values()].filter((c) => c.online).length,
      firmware: firmware ?? null,
    };
    fetchedAt = at;
    await onRound(round);
  }

  /**
   * @description Plan the next round.
   */
  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (started) {
      timer = setTimeout(() => {
        round().finally(schedule);
      }, getConfig().pollInterval * 1000);
      timer.unref?.();
    }
  }

  /**
   * @description Read the router now; joins a round already running.
   * @param {object} [options] - `{ slow }`: read the slow parts too.
   * @returns {Promise<void>} Never rejects: failures go to onError.
   */
  function round({ slow: forceSlow = false } = {}) {
    if (running) {
      return running;
    }
    if (!isEnabled()) {
      return Promise.resolve();
    }
    running = readAll(forceSlow)
      .catch(async (err) => {
        logger.warn(`Router reading failed: ${err.message}`);
        await onError(err);
      })
      .catch((err) => logger.error('Unable to report a reading failure', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    round,
    start: () => {
      started = true;
      schedule();
    },
    stop: () => {
      started = false;
      clearTimeout(timer);
      timer = null;
    },
    reschedule: schedule,
    /** @description Forget everything: the next round is a new baseline. */
    reset: () => {
      router = null;
      identity = null;
      firmware = undefined;
      slowAt = null;
      cpuCounters = null;
      wanCounters = null;
      bootAt = undefined;
      radios = new Map();
      clients = new Map();
      sensors = new Set();
      fetchedAt = null;
      rebootExpected = false;
      missing = new Map();
    },
    router: () => router,
    radios: () => [...radios.values()],
    radio: (unit) => radios.get(unit) ?? null,
    clients: () => [...clients.values()],
    client: (mac) => clients.get(mac) ?? null,
    sensors: () => [...sensors],
    fetchedAt: () => fetchedAt,
    /**
     * @description Apply a radio switched from Gladys: no event.
     * @param {number} unit - The wireless unit.
     * @param {boolean} enabled - Its new state.
     * @returns {object|null} The new snapshot.
     */
    patchRadio: (unit, enabled) => {
      const current = radios.get(unit);
      if (!current) {
        return null;
      }
      const next = { ...current, enabled };
      radios.set(unit, next);
      return next;
    },
    /**
     * @description Apply a firmware check run from Gladys: no event.
     * @param {string} page - detect_firmware.asp after the check.
     * @returns {object} readFirmware.
     */
    patchFirmware: (page) => {
      firmware = readFirmware(page, identity?.firmware ?? null);
      if (router) {
        router = { ...router, firmware };
      }
      return firmware;
    },
    /** @description The next reboot is one asked from Gladys: no event. */
    expectReboot: () => {
      rebootExpected = true;
    },
  };
}

export { createWatcher, SLOW_INTERVAL_MS, PROBE_HOOKS, WAN_HOOKS, IDENTITY_HOOKS };
