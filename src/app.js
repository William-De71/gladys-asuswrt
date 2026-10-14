// -----------------------------------------------------------------------------
// The ASUSWRT integration: every handler, registered on a Gladys client.
//
// Brings an ASUS router (stock ASUSWRT or Asuswrt-Merlin) into Gladys, over
// the web API of the router on the LAN:
//   - devices (device.js): the router (CPU, memory, temperatures, uptime,
//     internet rates, link, WAN address, clients, firmware), its Wi-Fi radios
//     as switches, and the clients of the network as presence sensors;
//   - scene triggers (tracker.js, events.js): internet down or back, device
//     arrived or left, new device on the network, router rebooted, firmware
//     update available;
//   - scene actions: read the status, restart a service (Wi-Fi, internet,
//     DNS), check for a firmware update, reboot;
//   - dashboard widgets (widgets.js): overview, internet, network devices.
//
// Transport: local only. Nothing leaves the network, except what the router
// itself contacts (the ASUS update server, on a firmware check).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasCredentials,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createAsusClient } from './asus-api.js';
import { createKnownHosts, DEFAULT_PATH } from './store.js';
import { createWatcher, IDENTITY_HOOKS } from './watcher.js';
import { readJson, readIdentity, readFirmware } from './read.js';
import {
  DEVICE_TYPES,
  ROUTER_ID,
  idsOf,
  macId,
  radioId,
  idFromExternalId,
  routerName,
  buildRouterDevice,
  buildRouterStates,
  buildRadioDevice,
  buildRadioStates,
  buildClientDevice,
  presenceFeatureId,
} from './device.js';
import {
  internetEvent,
  presenceEvent,
  newClientEvent,
  rebootEvent,
  firmwareEvent,
  firmwareSummary,
  statusOutputs,
  firmwareOutputs,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  messageContent,
  readInternetSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
} from './widgets.js';
import { t, all, LANGUAGES } from './i18n.js';

const ACTIONS = { TEST_CONNECTION: 'test_connection', FORGET_DEVICES: 'forget_network_devices' };
const SCENE_ACTIONS = {
  GET_STATUS: 'get_status',
  RESTART_SERVICE: 'restart_service',
  CHECK_UPDATES: 'check_updates',
  REBOOT: 'reboot',
};
// The services a scene can restart, and the rc_service the router runs.
const SERVICES = {
  wireless: () => 'restart_wireless',
  internet: (wan) => `restart_wan_if ${wan?.unit ?? 0}`,
  dns: () => 'restart_dnsmasq',
};
// A present client is dated again in Gladys this often (the "check presence"
// action of Gladys reads the date of the last value, as for Bluetooth).
const PRESENCE_HEARTBEAT_MS = 60000;
// The Discovery list never exceeds what the host API accepts in one batch.
const MAX_DISCOVERED = 2000;
// A firmware check of the router takes a few seconds to a minute.
const FIRMWARE_CHECK = { delayMs: 3000, timeoutMs: 75000 };

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.request] - HTTP transport of the router client (tests).
 * @param {string} [options.knownHostsPath] - File of the known MAC addresses.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {{ watcher: object, known: object, api: object, getConfig: Function }} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    request,
    knownHostsPath = DEFAULT_PATH,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  let configLoaded = false;
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  // Device external ids the user created (states are only published for them).
  let createdDevices = new Set();
  // Last connection status and Discovery list sent, to send them again only
  // when they change.
  let lastStatus = null;
  let lastDiscovery = null;

  const api = createAsusClient({
    getConfig: () => config,
    now,
    ...(request ? { request } : {}),
  });
  const known = createKnownHosts({ path: knownHostsPath, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language
   * (feature names, states, scene summaries and outputs).
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The multi-language message of a failed call.
   * @param {Error} err - An AsusError.
   * @returns {object} The message.
   */
  function errorMessage(err) {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    switch (err.kind) {
      case 'auth':
        return all('statusAuth');
      case 'locked':
        return all('statusLocked', {
          minutes: Math.max(1, Math.ceil((err.retryAfter ?? 300) / 60)),
        });
      case 'tls':
        return all('statusTls');
      case 'not_found':
        return all('statusNotFound');
      case 'unreachable':
        return all('statusUnreachable', { url: config.url });
      default:
        return all('statusError');
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  const isCreated = (type, id) => createdDevices.has(idsOf(gladys, type, id).device);

  /**
   * @description Publish the states of the created devices. The SDK remembers
   * what it sent (publishChangedStates) and forgets a device when the user
   * creates it: its states then go out again in full.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const lang = textLanguage();
    const states = [];
    const router = watcher.router();
    if (router && isCreated(DEVICE_TYPES.ROUTER, ROUTER_ID)) {
      states.push(...buildRouterStates(gladys, router, lang));
    }
    watcher
      .radios()
      .filter((radio) => isCreated(DEVICE_TYPES.RADIO, radioId(radio.unit)))
      .forEach((radio) => states.push(...buildRadioStates(gladys, radio)));
    const clients = watcher
      .clients()
      .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)));
    const absent = clients
      .filter((client) => !client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 0,
      }));
    const present = clients
      .filter((client) => client.present)
      .map((client) => ({
        device_feature_external_id: presenceFeatureId(gladys, client.mac),
        state: 1,
      }));
    if (states.length + absent.length > 0) {
      await gladys.publishChangedStates([...states, ...absent]);
    }
    if (present.length > 0) {
      await gladys.publishChangedStates(present, { heartbeat: PRESENCE_HEARTBEAT_MS });
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Ask the dashboards to read the widgets again.
   */
  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) => gladys.requestWidgetRefresh(key));
  }

  /**
   * @description Publish a scene event; a failure is only logged.
   * @param {{ key: string, data: object }} event - The event.
   * @returns {Promise<void>}
   */
  async function publishEvent({ key, data }) {
    logger.info(`Scene event ${key}: ${data.summary}`);
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  /**
   * @description The devices offered on the Discovery screen.
   * @returns {Array<object>} The devices.
   */
  function discoveredDevices() {
    const router = watcher.router();
    if (!hasCredentials(config) || !router) {
      return [];
    }
    const lang = textLanguage();
    const devices = [
      buildRouterDevice(gladys, router, watcher.sensors(), lang),
      ...watcher.radios().map((radio) => buildRadioDevice(gladys, radio, router.identity, lang)),
    ];
    const clients = watcher
      .clients()
      .filter(
        (client) =>
          isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)) ||
          config.networkDevices === 'all' ||
          (config.networkDevices === 'named' && client.name),
      );
    devices.push(...clients.map((client) => buildClientDevice(gladys, client, lang)));
    return devices.slice(0, MAX_DISCOVERED);
  }

  /**
   * @description Offer the devices, only when the list changed.
   * @param {boolean} [force] - Send it even when unchanged.
   * @returns {Promise<number>} How many devices are offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = discoveredDevices();
    const signature = JSON.stringify(
      devices.map((d) => [d.external_id, d.name, d.features.length]),
    );
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- The watcher -----------------------------------------------------------------
  const watcher = createWatcher({
    api,
    known,
    getConfig: () => config,
    isEnabled: () => hasCredentials(config),
    onRound: async (round) => {
      const lang = textLanguage();
      const router = watcher.router();
      if (!round.baseline) {
        if (round.rebooted) {
          await publishEvent(rebootEvent(router, lang));
        }
        if (round.internet) {
          await publishEvent(internetEvent(round.internet, router?.wan, lang));
        }
        for (const change of round.presence) {
          await publishEvent(presenceEvent(gladys, change, lang));
        }
        for (const change of round.newClients) {
          await publishEvent(newClientEvent(change, lang));
        }
        if (round.firmware) {
          await publishEvent(firmwareEvent(round.firmware, lang));
        }
      }
      await publishQuietly();
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      refreshWidgets();
      await reportStatus(
        true,
        Object.fromEntries(
          LANGUAGES.map((l) => [
            l,
            t('statusConnected', l, {
              model: router?.identity?.model ?? 'ASUSWRT',
              internet: t(`internet_${router?.wan?.status ?? 'unknown'}`, l).toLowerCase(),
              clients: router?.clientsOnline ?? 0,
            }),
          ]),
        ),
      );
    },
    onError: async (err) => {
      await reportStatus(false, errorMessage(err));
    },
    now,
    logger,
  });

  /**
   * @description Read the router if it never was, before an answer that needs it.
   * @returns {Promise<void>}
   */
  async function ensureRead() {
    if (!hasCredentials(config)) {
      throw new Error('No router address, user name or password is configured');
    }
    if (watcher.fetchedAt() === null) {
      await watcher.round();
    }
    if (watcher.fetchedAt() === null) {
      throw new Error('The router could not be read: see the connection status');
    }
  }

  /**
   * @description Ask the router to check for a firmware, and wait for the
   * result. No scene event comes out of it.
   * @returns {Promise<object>} readFirmware.
   */
  async function checkFirmware() {
    await api.apply('start_webs_update');
    const deadline = now() + FIRMWARE_CHECK.timeoutMs;
    let page;
    do {
      await sleep(FIRMWARE_CHECK.delayMs);
      page = await api.page('detect_firmware.asp');
    } while (readFirmware(page).checking && now() < deadline);
    const firmware = watcher.patchFirmware(page);
    refreshWidgets();
    return firmware;
  }

  /**
   * @description Reboot the router; the reboot it causes fires no scene event.
   * @returns {Promise<void>}
   */
  async function reboot() {
    watcher.expectReboot();
    await api.apply('reboot');
    logger.info('Reboot of the router asked from Gladys');
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description Common checks of a widget request.
   * @param {string} lang - The user language.
   * @returns {object|null} A message content, null when the widget can be built.
   */
  function widgetProblem(lang) {
    if (!hasCredentials(config)) {
      return messageContent(t('noCredentials', lang));
    }
    if (watcher.fetchedAt() === null) {
      return messageContent(t('notReadYet', lang), 30);
    }
    return null;
  }

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildOverviewWidget({
        router: watcher.router(),
        language: lang,
        now: now(),
        fetchedAt: watcher.fetchedAt(),
        pollSeconds: config.pollInterval,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.INTERNET, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildInternetWidget({
        router: watcher.router(),
        language: lang,
        pollSeconds: config.pollInterval,
        interval: readInternetSettings(settings).interval,
        featureId: isCreated(DEVICE_TYPES.ROUTER, ROUTER_ID)
          ? idsOf(gladys, DEVICE_TYPES.ROUTER, ROUTER_ID).feature
          : null,
      })
    );
  });

  gladys.onWidgetGet(WIDGETS.NETWORK, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    return (
      widgetProblem(lang) ??
      buildNetworkWidget({
        clients: watcher.clients(),
        language: lang,
        now: now(),
        pollSeconds: config.pollInterval,
        show: readNetworkSettings(settings).show,
        created: new Set(
          watcher
            .clients()
            .filter((client) => isCreated(DEVICE_TYPES.CLIENT, macId(client.mac)))
            .map((client) => client.mac),
        ),
      })
    );
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      if (actionKey === WIDGET_ACTIONS.CHECK_UPDATES) {
        const firmware = await checkFirmware();
        return Object.fromEntries(LANGUAGES.map((l) => [l, firmwareSummary(firmware, l)]));
      }
      if (actionKey === WIDGET_ACTIONS.REBOOT) {
        await reboot();
        return all('rebooting');
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey}: ${err.message}`);
      return errorMessage(err);
    }
    return all('unknownAction');
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_STATUS, async () => {
    await ensureRead();
    return statusOutputs({ router: watcher.router(), clients: watcher.clients() }, textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.RESTART_SERVICE, async (fields) => {
    await ensureRead();
    const service = String(fields.service ?? '');
    if (!SERVICES[service]) {
      throw new Error(`Unknown service: ${service}`);
    }
    await api.apply(SERVICES[service](watcher.router()?.wan));
    logger.info(`Service ${service} of the router restarted by a scene`);
    return { service };
  });

  gladys.onSceneAction(SCENE_ACTIONS.CHECK_UPDATES, async () => {
    await ensureRead();
    return firmwareOutputs(await checkFirmware(), textLanguage());
  });

  gladys.onSceneAction(SCENE_ACTIONS.REBOOT, async () => {
    await ensureRead();
    await reboot();
  });

  // --- Device commands (the Wi-Fi radio switches) ------------------------------------
  gladys.onSetValue(async (device, deviceFeature, value) => {
    const id = idFromExternalId(device.external_id, DEVICE_TYPES.RADIO);
    if (
      !id ||
      deviceFeature.external_id !== idsOf(gladys, DEVICE_TYPES.RADIO, id).feature('enabled')
    ) {
      throw new Error(`Read-only feature: ${deviceFeature.external_id}`);
    }
    const unit = Number(id.slice(2));
    const enabled = Number(value) === 1;
    // The router restarts its Wi-Fi to apply it: every band drops for a few seconds.
    await api.apply('restart_wireless', { [`wl${unit}_radio`]: enabled ? 1 : 0 });
    watcher.patchRadio(unit, enabled);
    await publishQuietly();
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      const identity = readIdentity(readJson(await api.appGet(IDENTITY_HOOKS)));
      return Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          t('testOk', l, {
            model: routerName(identity, l),
            firmware: identity.firmware ?? '?',
          }),
        ]),
      );
    } catch (err) {
      return errorMessage(err);
    }
  });

  gladys.onAction(ACTIONS.FORGET_DEVICES, async () => {
    await known.clear();
    return all('forgotten');
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await watcher.round({ slow: true });
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} ASUSWRT device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  /**
   * @description Read the router now; report missing settings.
   * @returns {Promise<void>}
   */
  async function refreshAll() {
    if (!hasCredentials(config)) {
      await reportStatus(false, all('noCredentials'));
      return;
    }
    await watcher.round({ slow: true });
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousUrl = config.url;
    await loadConfig(rawConfig);
    logger.info(`Configuration updated: router read every ${config.pollInterval} s`);
    // New password, address or interval: log in again, start from a fresh baseline.
    api.reset();
    watcher.reset();
    lastDiscovery = null;
    if (configLoaded && config.url !== previousUrl) {
      // Maybe another router: its network is new.
      await known.clear();
    }
    configLoaded = true;
    watcher.reschedule();
    await refreshAll();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each step on its own: a failing one must not keep the watcher from starting.
  gladys.on('connected', async () => {
    await loadConfig();
    configLoaded = true;
    await known.load();
    await refreshCreatedDevices();
    lastStatus = null;
    lastDiscovery = null;
    await refreshAll();
    watcher.start();
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    watcher.stop();
    // Free the session on the router (it holds only a few).
    await api.logout();
  });

  return { watcher, known, api, getConfig: () => config };
}

export { createApp, ACTIONS, SCENE_ACTIONS, SERVICES, PRESENCE_HEARTBEAT_MS, FIRMWARE_CHECK };
