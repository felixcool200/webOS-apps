# webOS apps

Small, fast applications for a rooted LG webOS TV.

## Apps

- **Minimal Home** — a fullscreen launcher with a curated app grid, a built-in Settings view for frequently used picture, sound, network, and system settings, remote navigation, and a reversible stock-Home redirect.
- **Departures** — a fullscreen board of live SL departures from Torsvikstorg, Torsvik and Ropsten.

All apps are plain webOS web applications. Privileged operations use the root execution service supplied by [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).

Each app's version is in its `app/appinfo.json` and `package.json`.

## Repository layout

```text
apps/departures/
apps/minimal-home/
shared/                 palette, page reset and Luna helpers used by every app
scripts/build-app.js    merges shared/ into each app's style.css and app.js
scripts/deploy.sh       package, install and launch an app on the TV
```

Each app has its own `package.json` and can be packaged with:

```sh
cd apps/minimal-home   # or any other app
npm install
npm run package
```

Packaging first builds the app into its `build/` directory, where `shared/base.css` and `shared/webos.js` are put in front of the app's own `style.css` and `app.js`. The resulting IPK is written to that app's `dist/` directory as `<app id>_<version>_all.ipk`.

Built IPKs are not committed. They can later be published as GitHub release assets and exposed through a Homebrew Channel repository manifest. Do not publish a Departures IPK built with a Trafiklab key; see its README.

## Install on a rooted TV

Copy `.env.example` to `.env` and fill in the TV's address and the name of your SSH key in `~/.ssh`. `.env` is gitignored.

```sh
TV_HOST=TV_ADDRESS
TV_SSH_KEY=tv_key
```

Then install the apps:

```sh
scripts/deploy.sh apps/minimal-home
scripts/deploy.sh apps/departures
```

`deploy.sh` runs `npm install` if needed, packages the app, uploads and installs it over root SSH, waits until the TV reports the new version, and launches it. Pass `--no-launch` to skip the launch. For Minimal Home it also handles the Home redirect described under "Upgrade Minimal Home safely".

### Manual install

Without the script, upload and install one app at a time. `<version>` is the version in the app's `app/appinfo.json`:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS 'cat > /tmp/app.ipk' \
  < apps/departures/dist/org.webosbrew.departures_<version>_all.ipk

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "exec </dev/null; luna-send -n 1 -f 'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"org.webosbrew.departures\",\"ipkUrl\":\"/tmp/app.ipk\",\"subscribe\":true}'"
```

Check the installed version, then remove the uploaded file:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "exec </dev/null; luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/getAppInfo' \
  '{\"id\":\"org.webosbrew.departures\"}' | grep version; rm -f /tmp/app.ipk"
```

`exec </dev/null` matters when these commands run from a script: without it `luna-send` can exit with no output before the TV replies.

## Make Minimal Home the default

Copy the activation and recovery scripts to the TV:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /home/root/use-minimal-home.sh' \
  < apps/minimal-home/scripts/use-minimal-home.sh

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /home/root/restore-stock-home.sh' \
  < apps/minimal-home/scripts/restore-stock-home.sh

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'chmod 755 /home/root/use-minimal-home.sh /home/root/restore-stock-home.sh && /home/root/use-minimal-home.sh'
```

`use-minimal-home.sh` performs two related actions:

1. Assigns the webOS `home` category to `org.webosbrew.minimalhome`.
2. Installs `/var/lib/webosbrew/init.d/50-minimal-home`, which applies the reversible stock-Home redirect after each boot. This also makes Back from another app return to Minimal Home.

The screen may briefly go black while the webOS application manager restarts. Press Home after it returns.

## Upgrade Minimal Home safely

The redirect source lives inside the installed Minimal Home directory, so the active redirect must be unmounted before the app is replaced and reactivated afterwards. `scripts/deploy.sh apps/minimal-home` does this when the redirect is active. By hand:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'umount /usr/palm/applications/com.webos.app.home 2>/dev/null || true'

# Upload and install the new Minimal Home IPK here.

ssh -i ~/.ssh/tv_key root@TV_ADDRESS '/home/root/use-minimal-home.sh'
```

## Safety and recovery

Minimal Home's optional Home replacement is a runtime bind mount. It does not write to LG's system partition. A reboot clears the mount before the Homebrew boot hook reapplies it.

Restore LG Home over SSH with:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS '/home/root/restore-stock-home.sh'
```

The recovery script removes the boot hook, unmounts the redirect, restores `com.webos.app.home` as the default Home app, and restarts the webOS application manager.
