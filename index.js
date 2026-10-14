// -----------------------------------------------------------------------------
// Entry point of the ASUSWRT external integration.
//
// Brings an ASUS router (stock ASUSWRT or Asuswrt-Merlin) into Gladys, over
// the web API of the router on the LAN:
//   - devices: the router (CPU, memory, temperatures, uptime, internet rates
//     and link, clients, firmware), its Wi-Fi radios (switches) and the
//     clients of the network (presence), offered on the Discovery screen
//     (see src/device.js);
//   - scene triggers: internet down or back, device arrived or left, new
//     device on the network, router rebooted, firmware update available;
//   - scene actions: read the status, restart a service, check for a
//     firmware update, reboot;
//   - dashboard widgets: overview, internet, network devices.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the ASUSWRT integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
