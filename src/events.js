// -----------------------------------------------------------------------------
// Scene trigger payloads and scene action outputs.
//
// Event data is flat (at most 30 keys, scalar values, strings of at most
// 1,000 characters); a field of a trigger filters on the data key of the same
// name (`device`, `event`, `status`, `medium`). Outputs are the declared ones
// only, never null: -1 for an unknown number, "" for an unknown text.
// -----------------------------------------------------------------------------

import { idsOf, macId, clientName, DEVICE_TYPES } from './device.js';
import { t, formatNumber } from './i18n.js';

const TRIGGERS = {
  INTERNET_STATUS_CHANGED: 'internet_status_changed',
  NETWORK_DEVICE_PRESENCE: 'network_device_presence',
  NEW_NETWORK_DEVICE: 'new_network_device',
  ROUTER_REBOOTED: 'router_rebooted',
  FIRMWARE_UPDATE_AVAILABLE: 'firmware_update_available',
};

const MAX_STRING = 1000;
const text = (value) => String(value ?? '').slice(0, MAX_STRING);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : -1);
const mediumOf = (connection) =>
  connection === 'wired' ? 'wired' : connection ? 'wifi' : 'unknown';

/**
 * @description The short name of a connection: "Wi-Fi 5 GHz", "Wired".
 * @param {string|null} connection - wired, 2g, 5g, 6g.
 * @param {string} language - The language.
 * @returns {string} The name, "" when unknown.
 */
function connectionName(connection, language) {
  if (!connection) {
    return '';
  }
  return connection === 'wired'
    ? t('connectionWired', language)
    : t('connectionWifi', language, { band: t(`band_${connection}`, language) });
}

/**
 * @description The event of the internet link that went down or came back.
 * @param {{ status: string, previous: string }} change - The transition.
 * @param {object|null} wan - The readWan of now.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function internetEvent(change, wan, language) {
  return {
    key: TRIGGERS.INTERNET_STATUS_CHANGED,
    data: {
      status: change.status,
      previous_status: change.previous,
      wan_ip: text(wan?.ip),
      summary: text(t(`summaryInternet_${change.status}`, language, { ip: wan?.ip ?? '?' })),
    },
  };
}

/**
 * @description The event of a client that arrived or left.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ client: object, event: string }} change - The transition.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function presenceEvent(gladys, { client, event }, language) {
  const name = clientName(client);
  return {
    key: TRIGGERS.NETWORK_DEVICE_PRESENCE,
    data: {
      device: idsOf(gladys, DEVICE_TYPES.CLIENT, macId(client.mac)).device,
      device_name: text(name),
      event,
      mac: client.mac,
      ip: text(client.ip),
      connection: text(connectionName(client.connection, language)),
      summary: text(t(`summaryPresence_${event}`, language, { name })),
    },
  };
}

/**
 * @description The event of a MAC address never met before.
 * @param {{ client: object }} change - The new client.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function newClientEvent({ client }, language) {
  const connection = connectionName(client.connection, language);
  return {
    key: TRIGGERS.NEW_NETWORK_DEVICE,
    data: {
      mac: client.mac,
      ip: text(client.ip),
      name: text(client.name),
      vendor: text(client.vendor),
      medium: mediumOf(client.connection),
      connection: text(connection),
      summary: text(
        t('summaryNewClient', language, {
          name: clientName(client),
          ip: client.ip ?? '?',
          connection: connection || '?',
        }),
      ),
    },
  };
}

/**
 * @description The event of a reboot of the router.
 * @param {object} router - The router snapshot.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function rebootEvent(router, language) {
  const model = router?.identity?.model ?? 'ASUSWRT';
  return {
    key: TRIGGERS.ROUTER_REBOOTED,
    data: {
      model: text(model),
      firmware: text(router?.identity?.firmware),
      summary: text(t('summaryRebooted', language, { model })),
    },
  };
}

/**
 * @description One sentence about the firmware.
 * @param {object|null} firmware - readFirmware.
 * @param {string} language - The language.
 * @returns {string} The sentence.
 */
function firmwareSummary(firmware, language) {
  if (!firmware) {
    return t('firmwareUnchecked', language);
  }
  if (firmware.available) {
    return t('firmwareAvailable', language, {
      version: firmware.latest ? ` (${firmware.latest})` : '',
    });
  }
  return t('firmwareUpToDate', language, { version: firmware.current ?? '?' });
}

/**
 * @description The event of a firmware the router offers.
 * @param {object} firmware - readFirmware.
 * @param {string} language - Language of the summary.
 * @returns {{ key: string, data: object }} The event.
 */
function firmwareEvent(firmware, language) {
  return {
    key: TRIGGERS.FIRMWARE_UPDATE_AVAILABLE,
    data: {
      current_version: text(firmware.current),
      new_version: text(firmware.latest),
      summary: text(firmwareSummary(firmware, language)),
    },
  };
}

/**
 * @description The outputs of the "read the status" scene action.
 * @param {{ router: object, clients: Array<object> }} snapshot - The snapshots.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
function statusOutputs({ router, clients }, language) {
  const present = clients.filter((c) => c.present).length;
  const temperatures = Object.values(router?.temperatures ?? {});
  const temperature =
    router?.temperatures?.cpu ?? (temperatures.length ? Math.max(...temperatures) : null);
  const status = router?.wan?.status ?? 'unknown';
  const summary = [
    t('summaryStatus', language, {
      cpu: formatNumber(router?.cpu, language, 0),
      memory: formatNumber(router?.memory, language, 0),
    }),
    t(`summaryStatusInternet_${status}`, language, { ip: router?.wan?.ip ?? '?' }),
    t('summaryStatusClients', language, { count: present }),
    router?.firmware?.available ? firmwareSummary(router.firmware, language) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    cpu: number(router?.cpu),
    memory: number(router?.memory),
    temperature: number(temperature),
    uptime_days: number(router?.uptimeDays),
    download: number(router?.downMbps),
    upload: number(router?.upMbps),
    internet: status,
    wan_ip: text(router?.wan?.ip),
    devices_present: present,
    firmware: text(router?.identity?.firmware),
    update_available: Boolean(router?.firmware?.available),
    summary: text(summary),
  };
}

/**
 * @description The outputs of the "check for a firmware update" scene action.
 * @param {object} firmware - readFirmware.
 * @param {string} language - Language of the summary.
 * @returns {object} The outputs.
 */
const firmwareOutputs = (firmware, language) => ({
  update_available: Boolean(firmware?.available),
  current_version: text(firmware?.current),
  new_version: text(firmware?.latest),
  summary: text(firmwareSummary(firmware, language)),
});

export {
  TRIGGERS,
  connectionName,
  internetEvent,
  presenceEvent,
  newClientEvent,
  rebootEvent,
  firmwareEvent,
  firmwareSummary,
  statusOutputs,
  firmwareOutputs,
};
