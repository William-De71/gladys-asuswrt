// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on a made-up home network (fixed date, seeded
// randomness): an RT-AX88U with a firmware update available, the internet
// traffic of the last 24 hours, and the devices connected right now. A
// device-bound chart reads the history Gladys keeps for the features: here
// the history is made up, the content around it is real.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildInternetWidget, buildNetworkWidget } =
  await load('src/widgets.js');
const { LANGUAGES, t } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Thursday 15 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-15T18:00:00Z');
const MINUTE = 60000;

// mulberry32: the same "random" history on every run.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// One point every 15 minutes over the last 24 hours: busier in the evening.
function history(seed, base, peak) {
  const next = random(seed);
  const points = [];
  for (let m = 24 * 60; m >= 0; m -= 15) {
    const at = NOW - m * MINUTE;
    const hour = (new Date(at).getUTCHours() + 2) % 24;
    const evening = hour >= 18 && hour <= 23 ? 1 : hour >= 8 && hour < 18 ? 0.35 : 0.05;
    const value = base + peak * evening * (0.6 + next() * 0.8);
    points.push({ t: new Date(at).toISOString(), v: Math.round(value * 10) / 10 });
  }
  return points;
}

const router = {
  identity: { model: 'RT-AX88U', firmware: '3.0.0.4.388.8_4', lanIp: '192.168.50.1' },
  cpu: 12,
  memory: 61.4,
  temperatures: { cpu: 66, '2g': 45, '5g': 48 },
  uptimeDays: 24.66,
  downMbps: 186.4,
  upMbps: 23.1,
  wan: { status: 'connected', unit: 0, ip: '90.12.34.56', gateway: '90.12.34.1', proto: 'pppoe' },
  clientsOnline: 17,
  firmware: { available: true, latest: '3.0.0.4.388.9_0', current: '3.0.0.4.388.8_4' },
};
const client = (mac, name, ip, vendor, connection, minutes, present = true) => ({
  mac,
  name,
  ip,
  vendor,
  connection,
  present,
  lastSeen: NOW - minutes * MINUTE,
});
const clients = [
  client('a4:83:e7:12:34:56', 'Phone of Alex', '192.168.50.23', 'Google', '5g', 0),
  client('3c:2a:f4:01:02:03', 'Living room TV', '192.168.50.40', 'Samsung', 'wired', 0),
  client('00:11:32:aa:bb:cc', 'NAS', '192.168.50.10', 'Synology', 'wired', 0),
  client('f0:18:98:44:55:66', 'MacBook Claire', '192.168.50.31', 'Apple', '5g', 0),
  client('b8:27:eb:77:88:99', 'Gladys', '192.168.50.5', 'Raspberry Pi', 'wired', 0),
  client('24:0a:c4:10:20:30', 'Boiler ESP32', '192.168.50.62', 'Espressif', '2g', 0),
  client('dc:a6:32:00:00:01', 'Printer', '192.168.50.70', 'Brother', '2g', 0),
  client('44:65:0d:ab:cd:ef', null, '192.168.50.88', 'Amazon', '2g', 0),
  client('9c:b6:d0:11:22:33', 'iPhone Tom', '192.168.50.27', 'Apple', '5g', 95, false),
];
const created = new Set(['a4:83:e7:12:34:56', '9c:b6:d0:11:22:33', 'f0:18:98:44:55:66']);
const download = history(3, 4, 260);
const upload = history(5, 1, 30);

const contents = {};
for (const language of LANGUAGES) {
  const internet = buildInternetWidget({
    router,
    language,
    pollSeconds: 30,
    interval: 'last-day',
    featureId: (key) => `ext:asuswrt:router:main:${key}`,
  });
  // The front reads the history of a device-bound chart from Gladys, and
  // names the series after the features.
  internet.components = internet.components.map((component) =>
    component.type === 'chart'
      ? {
          ...component,
          series: [
            { name: t('featureDownload', language), points: download },
            { name: t('featureUpload', language), points: upload },
          ],
        }
      : component,
  );
  contents[language] = {
    overview: buildOverviewWidget({
      router,
      language,
      now: NOW,
      fetchedAt: NOW - 20000,
      pollSeconds: 30,
    }),
    internet,
    network: buildNetworkWidget({ clients, language, now: NOW, pollSeconds: 30, created }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
