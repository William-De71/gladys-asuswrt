# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.2.0] - 2026-10-25

### Added

- require Gladys 5.3 and declare catalog keywords ([e93b25d](https://github.com/William-De71/gladys-asuswrt/commit/e93b25d8dd4ab8497d1fad6bdd17b9592a44c52d))

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([f7eeb69](https://github.com/William-De71/gladys-asuswrt/commit/f7eeb69e607cb6bc7b32d4f7d15a32782ce4c1e3))

## [0.1.0] - 2026-10-14

### Added

- An ASUS router device (stock ASUSWRT firmware and Asuswrt-Merlin): CPU and memory usage, temperatures of the CPU and the radios, uptime, internet download and upload rates, internet status, WAN IP address, connected clients and firmware version.
- A switch per Wi-Fi radio (2.4 GHz, 5 GHz, 6 GHz): turn a band on or off from a dashboard or a scene.
- Devices of the network as presence sensors, from the client list of the router, with an absence delay.
- Scene triggers: internet down or back, device arrived or left, new device on the network, router rebooted, firmware update available.
- Scene actions: read the status, restart a service (Wi-Fi, internet connection, DNS and DHCP), check for a firmware update, reboot.
- Dashboard widgets: router overview (with "check firmware" and "reboot" buttons), internet link with its traffic chart, network devices.
- Local transport only: the integration logs in to the web interface of the router on the LAN, keeps its session, and never retries a refused password before 15 minutes so that the router does not lock the account.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.2.0]: https://github.com/William-De71/gladys-asuswrt/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-asuswrt/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-asuswrt/releases/tag/v0.1.0
