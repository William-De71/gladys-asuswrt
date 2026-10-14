// -----------------------------------------------------------------------------
// Snapshots -> scene trigger transitions. Pure logic, no I/O.
//
// One event per transition, never a periodic snapshot. A `previous` of
// undefined is the baseline (first reading after a start or a new address):
// nothing fires from it, so a restart never replays what happened before.
// -----------------------------------------------------------------------------

// A boot time that moves by less than this is the jitter of the uptime
// (rounded seconds, the time of the request), not a reboot.
const REBOOT_JITTER_MS = 120000;

/**
 * @description The presence of a client after a reading. A client is present
 * as soon as the router lists it online, and absent once it has been gone for
 * the absence delay (a phone asleep on Wi-Fi drops off for a while).
 * @param {object|undefined} previous - `{ present, lastSeen }` of the last
 * reading, undefined for the baseline.
 * @param {boolean} seen - Whether the client is online now.
 * @param {number} now - Now, in ms.
 * @param {number} absenceMs - The absence delay, in ms.
 * @returns {{ present: boolean, lastSeen: number|null, event: string|null }}
 * `event` is `arrived`, `left` or null.
 * @example
 * nextPresence({ present: true, lastSeen: 0 }, false, 600000, 300000); // left
 */
function nextPresence(previous, seen, now, absenceMs) {
  if (seen) {
    return {
      present: true,
      lastSeen: now,
      event: previous && previous.present === false ? 'arrived' : null,
    };
  }
  const lastSeen = previous?.lastSeen ?? null;
  if (!previous) {
    return { present: false, lastSeen, event: null };
  }
  if (previous.present && lastSeen !== null && now - lastSeen < absenceMs) {
    return { present: true, lastSeen, event: null };
  }
  return { present: false, lastSeen, event: previous.present ? 'left' : null };
}

/**
 * @description Whether the internet link is up: `connecting` counts as down
 * (the router has no address yet), `unknown` is no reading at all.
 * @param {string|undefined} status - readWan().status.
 * @returns {boolean|null} The link, null when unknown.
 */
function internetUp(status) {
  if (status === 'connected') {
    return true;
  }
  return status === 'connecting' || status === 'disconnected' ? false : null;
}

/**
 * @description The internet link change between two readings.
 * @param {object|undefined} previous - The previous readWan, undefined for the baseline.
 * @param {object} current - The readWan of now.
 * @returns {{ status: string, previous: string }|null} `status`: connected or
 * disconnected.
 */
function diffInternet(previous, current) {
  const before = internetUp(previous?.status);
  const now = internetUp(current?.status);
  if (before === null || now === null || before === now) {
    return null;
  }
  return {
    status: now ? 'connected' : 'disconnected',
    previous: before ? 'connected' : 'disconnected',
  };
}

/**
 * @description Whether the router rebooted between two readings: its boot
 * time moved forward.
 * @param {number|null|undefined} previousBoot - The previous boot time in ms,
 * undefined for the baseline.
 * @param {number|null} currentBoot - The boot time of now.
 * @returns {boolean} True after a reboot.
 * @example
 * diffReboot(1000, 1000 + 3600000); // -> true
 */
function diffReboot(previousBoot, currentBoot) {
  if (typeof previousBoot !== 'number' || typeof currentBoot !== 'number') {
    return false;
  }
  return currentBoot - previousBoot > REBOOT_JITTER_MS;
}

/**
 * @description Whether a firmware the previous reading did not offer became
 * available.
 * @param {object|null|undefined} previous - The previous readFirmware,
 * undefined for the baseline.
 * @param {object|null} current - The readFirmware of now.
 * @returns {boolean} True when an update became available.
 */
function diffFirmware(previous, current) {
  if (!previous || !current?.available) {
    return false;
  }
  return !previous.available || previous.latest !== current.latest;
}

export { nextPresence, internetUp, diffInternet, diffReboot, diffFirmware, REBOOT_JITTER_MS };
