// -----------------------------------------------------------------------------
// Dashboard widgets of the ASUSWRT integration.
//
//   - `overview`  the router at a glance: CPU and memory gauges, temperature
//                 and connected clients tiles, the internet link, uptime and
//                 firmware, and two buttons (check for a firmware update,
//                 reboot, with a confirmation);
//   - `internet`  the internet link: download and upload rates, their history
//                 once the router device exists in Gladys, link status, WAN
//                 address and gateway;
//   - `network`   the clients online now (or the ones gone), with their
//                 connection (wired, Wi-Fi band).
//
// The contents come from the snapshots of the last reading: a widget never
// costs a router call. Every text exists in the four languages (the content
// is cached per language and units). Content budget of a card: 8
// components, 1 main one (chart or card-list), 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { t, formatNumber, ago } from './i18n.js';
import { clientName } from './device.js';
import { firmwareSummary } from './events.js';

const WIDGETS = { OVERVIEW: 'overview', INTERNET: 'internet', NETWORK: 'network' };
const WIDGET_ACTIONS = { CHECK_UPDATES: 'check_updates', REBOOT: 'reboot' };

const CHART_INTERVALS = [
  'last-hour',
  'last-twelve-hours',
  'last-day',
  'last-three-days',
  'last-week',
];
const DEFAULT_INTERVAL = 'last-day';
const NETWORK_SHOW = ['present', 'absent', 'all'];
const DEFAULT_SHOW = 'present';
const MAX_LIST_ITEMS = 8;
const TTL = { min: 10, max: 3600, message: 60 };

const INTERNET_COLORS = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'danger',
  unknown: 'neutral',
};

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 * @example
 * messageContent('The router has not been read yet');
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

const ttlOf = (pollSeconds) => Math.min(TTL.max, Math.max(TTL.min, Math.round(pollSeconds)));

/**
 * @description A tile color for a load in %.
 * @param {number|null} value - The load.
 * @returns {string} The color.
 */
function loadColor(value) {
  if (typeof value !== 'number') {
    return 'neutral';
  }
  if (value >= 90) {
    return 'danger';
  }
  return value >= 75 ? 'warning' : 'success';
}

/**
 * @description "12 d 4 h" out of days.
 * @param {number|null} days - The uptime.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function formatUptime(days, language) {
  if (typeof days !== 'number') {
    return '?';
  }
  const hours = Math.floor((days * 24) % 24);
  return t('uptimeValue', language, { days: Math.floor(days), hours });
}

/**
 * @description "Connected · 90.12.34.56" for the internet link.
 * @param {object|null} wan - readWan.
 * @param {string} language - The language.
 * @returns {string} The value.
 */
function internetValue(wan, language) {
  const status = t(`internet_${wan?.status ?? 'unknown'}`, language);
  return wan?.status === 'connected' && wan.ip ? `${status} · ${wan.ip}` : status;
}

/**
 * @description The hottest sensor of the router, the CPU first.
 * @param {object} temperatures - `{ cpu, '2g', ... }`.
 * @returns {number|null} The temperature.
 */
function mainTemperature(temperatures = {}) {
  if (typeof temperatures.cpu === 'number') {
    return temperatures.cpu;
  }
  const values = Object.values(temperatures).filter((value) => typeof value === 'number');
  return values.length > 0 ? Math.max(...values) : null;
}

/**
 * @description The `overview` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.fetchedAt - Time of the reading, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @returns {object} The content.
 * @example
 * buildOverviewWidget({ router, language: 'fr', now, fetchedAt, pollSeconds: 30 });
 */
function buildOverviewWidget({ router, language, now, fetchedAt, pollSeconds }) {
  const identity = router.identity ?? {};
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('overviewCaption', language, {
          model: identity.model ?? 'ASUSWRT',
          ip: identity.lanIp ?? '?',
          ago: ago(fetchedAt, now, language),
        }),
        80,
      ),
    },
  ];
  // An unknown load is no gauge at all rather than a misleading 0 %.
  [
    [router.cpu, 'tileCpu', 'cpu'],
    [router.memory, 'tileMemory', 'layers'],
  ]
    .filter(([value]) => typeof value === 'number')
    .forEach(([value, label, icon]) =>
      components.push({
        type: 'gauge',
        value,
        min: 0,
        max: 100,
        unit: '%',
        label: t(label, language),
        icon,
        color: loadColor(value),
      }),
    );
  const temperature = mainTemperature(router.temperatures);
  if (temperature !== null) {
    components.push({
      type: 'value',
      value: formatNumber(temperature, language, 0),
      unit: '°C',
      label: t(
        typeof router.temperatures?.cpu === 'number' ? 'tileCpuTemperature' : 'tileTemperature',
        language,
      ),
      icon: 'thermometer',
      color: temperature >= 90 ? 'danger' : temperature >= 75 ? 'warning' : 'info',
    });
  }
  if (typeof router.clientsOnline === 'number') {
    components.push({
      type: 'value',
      value: String(router.clientsOnline),
      label: t('tileClients', language),
      icon: 'smartphone',
      color: 'primary',
    });
  }

  const firmware = router.firmware;
  components.push({
    type: 'status',
    items: [
      {
        label: t('rowInternet', language),
        value: clip(internetValue(router.wan, language), 40),
        icon: 'globe',
        color: INTERNET_COLORS[router.wan?.status ?? 'unknown'],
      },
      {
        label: t('rowUptime', language),
        value: clip(formatUptime(router.uptimeDays, language), 40),
        icon: 'clock',
      },
      {
        label: t('rowFirmware', language),
        value: clip(
          firmware?.available
            ? t('updateAvailable', language, { version: firmware.latest ?? '' }).trim()
            : (identity.firmware ?? '?'),
          40,
        ),
        icon: 'download',
        color: firmware?.available ? 'warning' : firmware ? 'success' : 'neutral',
      },
    ],
  });

  components.push(
    {
      type: 'button',
      label: t('buttonCheckUpdates', language),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.CHECK_UPDATES },
    },
    {
      type: 'button',
      label: t('buttonReboot', language),
      icon: 'power',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.REBOOT, confirm: true },
    },
  );
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The settings of the `internet` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ interval: string }} The settings.
 */
const readInternetSettings = (settings = {}) => ({
  interval: CHART_INTERVALS.includes(settings.interval) ? settings.interval : DEFAULT_INTERVAL,
});

/**
 * @description The `internet` widget.
 * @param {object} options - Options.
 * @param {object} options.router - The router snapshot.
 * @param {string} options.language - The user language.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.interval] - The chart period.
 * @param {Function|null} [options.featureId] - `(key) => external id` of the
 * router features, null when its device is not created (no chart then: the
 * core has no history of it).
 * @returns {object} The content.
 */
function buildInternetWidget({
  router,
  language,
  pollSeconds,
  interval = DEFAULT_INTERVAL,
  featureId = null,
}) {
  const wan = router.wan;
  if (!wan) {
    return messageContent(t('noWan', language), ttlOf(pollSeconds));
  }
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(
        t('internetCaption', language, {
          proto: wan.proto ? wan.proto.toUpperCase() : '?',
          unit: wan.unit,
        }),
        80,
      ),
    },
    {
      type: 'value',
      value: typeof router.downMbps === 'number' ? formatNumber(router.downMbps, language, 1) : '–',
      unit: 'Mbit/s',
      label: t('tileDownload', language),
      icon: 'download',
      color: 'info',
    },
    {
      type: 'value',
      value: typeof router.upMbps === 'number' ? formatNumber(router.upMbps, language, 1) : '–',
      unit: 'Mbit/s',
      label: t('tileUpload', language),
      icon: 'upload',
      color: 'primary',
    },
  ];
  if (featureId) {
    components.push({
      type: 'chart',
      device_features: [featureId('download'), featureId('upload')],
      interval,
      chart_type: 'area',
      title: t('chartTraffic', language),
      unit: 'Mbit/s',
    });
  }
  components.push({
    type: 'status',
    items: [
      {
        label: t('rowInternet', language),
        value: t(`internet_${wan.status}`, language),
        icon: 'globe',
        color: INTERNET_COLORS[wan.status] ?? 'neutral',
      },
      ...(wan.ip
        ? [{ label: t('rowWanIp', language), value: clip(wan.ip, 40), icon: 'map-pin' }]
        : []),
      ...(wan.gateway
        ? [{ label: t('rowGateway', language), value: clip(wan.gateway, 40), icon: 'git-commit' }]
        : []),
    ],
  });
  return { ttl_seconds: ttlOf(pollSeconds), components };
}

/**
 * @description The settings of the `network` widget.
 * @param {object} [settings] - The raw settings.
 * @returns {{ show: string }} The settings.
 */
const readNetworkSettings = (settings = {}) => ({
  show: NETWORK_SHOW.includes(settings.show) ? settings.show : DEFAULT_SHOW,
});

/**
 * @description The badge text of a client's connection.
 * @param {string|null} connection - wired, 2g, 5g, 6g.
 * @param {string} language - The language.
 * @returns {string} "WIRED", "5 GHz".
 */
function connectionBadge(connection, language) {
  if (!connection) {
    return t('badgeHere', language);
  }
  return connection === 'wired' ? t('badgeWired', language) : t(`band_${connection}`, language);
}

/**
 * @description The `network` widget: clients with a name first, then by name.
 * @param {object} options - Options.
 * @param {Array<object>} options.clients - The client snapshots.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @param {number} options.pollSeconds - The reading interval.
 * @param {string} [options.show] - present, absent or all.
 * @param {Set<string>} [options.created] - MACs of the clients created in Gladys.
 * @returns {object} The content.
 */
function buildNetworkWidget({
  clients,
  language,
  now,
  pollSeconds,
  show = DEFAULT_SHOW,
  created = new Set(),
}) {
  const present = clients.filter((client) => client.present);
  const listed = clients
    .filter((client) =>
      show === 'all' ? true : show === 'present' ? client.present : !client.present,
    )
    .filter((client) => show !== 'absent' || client.lastSeen)
    .sort((a, b) => {
      if (show === 'absent') {
        return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
      }
      if (Boolean(a.name) !== Boolean(b.name)) {
        return a.name ? -1 : 1;
      }
      return clientName(a).localeCompare(clientName(b), language);
    });
  const caption = t('networkCaption', language, {
    present: present.length,
    total: clients.length,
  });
  if (listed.length === 0) {
    return {
      ttl_seconds: ttlOf(pollSeconds),
      components: [
        { type: 'text', variant: 'caption', text: clip(caption, 80) },
        { type: 'text', variant: 'body', text: t(`networkEmpty_${show}`, language) },
      ],
    };
  }
  const extra = listed.length - MAX_LIST_ITEMS;
  return {
    ttl_seconds: ttlOf(pollSeconds),
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          extra > 0 ? `${caption} · ${t('networkMore', language, { count: extra })}` : caption,
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        items: listed.slice(0, MAX_LIST_ITEMS).map((client) => ({
          title: clip(clientName(client), 60),
          // The IP first: the line is cut to one line by the front.
          subtitle: clip(
            [
              client.ip,
              client.present
                ? client.vendor
                : client.lastSeen && ago(client.lastSeen, now, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: client.present
            ? {
                text: clip(connectionBadge(client.connection, language), 16),
                color: created.has(client.mac) ? 'success' : 'info',
              }
            : { text: clip(t('badgeGone', language), 16), color: 'neutral' },
        })),
      },
    ],
  };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  CHART_INTERVALS,
  DEFAULT_INTERVAL,
  NETWORK_SHOW,
  clip,
  messageContent,
  formatUptime,
  mainTemperature,
  firmwareSummary,
  readInternetSettings,
  readNetworkSettings,
  buildOverviewWidget,
  buildInternetWidget,
  buildNetworkWidget,
};
