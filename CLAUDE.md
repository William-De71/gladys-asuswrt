# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for ASUS routers (stock ASUSWRT
firmware and Asuswrt-Merlin): a Node.js service (Node 22+, ESM, no build step)
that runs in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the web API of the router on the LAN
(`login.cgi`, `appGet.cgi` hooks, `.asp` pages, `applyapp.cgi`) with the
administrator account, every 30 seconds by default. The client is a rewrite
after the asusrouter Python library (Apache 2.0, see NOTICE). Transport:
local only.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect()
src/asus-api.js         web API client (login, kept session, lockout guard, error kinds)
src/read.js             router answers -> plain snapshots (null, never 0, when unknown)
src/watcher.js          the timer loop: fast reads every round, slow ones every 10 min
src/tracker.js          snapshots -> scene trigger transitions, presence (pure logic)
src/store.js            MAC addresses already met, in /data/known-hosts.json
src/events.js           scene trigger payloads and scene action outputs
src/device.js           router, Wi-Fi radio and client devices, their states
src/widgets.js          overview, internet and network dashboard widgets
src/config.js           configuration (address, account, TLS, intervals, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (router `main`, radio `wl<unit>`, client MAC without
  separators: never a name), feature `category` / `type` / `unit` / `min` /
  `max` / `step`, the keys of `config_schema`, `actions`, the widgets and
  their settings, scene triggers (fields, options, variables) and scene
  actions (fields, outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs** come from the SDK constants and have an icon in
  the Gladys front (`test/devices.test.js` lists them). CPU and memory are
  `level-sensor` / `decimal` in %: Gladys has no category of their own. Do not
  change them without a migration (the Discovery "Update" button compares
  category, type and unit).
- **`should_poll` stays false**: the router is read on the integration's own
  timer, one round for every device. It never resyncs on existing devices.
- **One login, kept.** The router locks the account after a few failed
  logins: never log in per request, never retry a refused password before
  15 minutes (asus-api.js), respect `remaining_lock_time`. The User-Agent must
  stay `asusrouter-…-DUTUtil-…`: the router then answers JSON and does not log
  the web interface out.
- **Presence** is `presence-sensor` / `push`, like the Bluetooth presence of
  Gladys: 1 re-published every minute while the client is online in the
  router's list, 0 once, after the absence delay.
- **The first round is a baseline**: no scene event replays history after a
  restart or a configuration change. A change the integration makes itself (a
  radio switched, a reboot or a firmware check run from Gladys) never fires a
  scene trigger.
- **Optional pages** (temperatures, firmware state) are skipped for an hour
  when they answer 404; only the first appGet request decides whether the
  round failed. Old firmwares send malformed JSON: read.js repairs it, add a
  test with the real answer when a new shape shows up.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the password; never put it in an URL.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["local"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (a local server on 127.0.0.1 at
  most).
