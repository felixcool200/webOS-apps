# webOS apps

Small, fast applications for a rooted LG webOS TV.

## Apps

- **Minimal Home 0.1.7** — a fullscreen launcher with a curated app grid, Profile, remote navigation, and a reversible stock-Home redirect.
- **Minimal Settings 0.3.4** — a fullscreen frontend for frequently used picture, sound, network, and system settings.
- **Departures 0.2.0** — a fullscreen board of live SL departures from Torsvikstorg, Torsvik and Ropsten.

All apps are plain webOS web applications. Privileged operations use the root execution service supplied by [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).

## Repository layout

```text
apps/departures/
apps/minimal-home/
apps/minimal-settings/
```

Each app has its own `package.json` and can be packaged with:

```sh
cd apps/minimal-home   # or apps/minimal-settings
npm install
npm run package
```

The resulting IPK is written to that app's `dist/` directory.

Built IPKs are not committed. They can later be published as GitHub release assets and exposed through a Homebrew Channel repository manifest.

## Install on a rooted TV

The following example uses root SSH. Replace `TV_ADDRESS` and the key path with your own values.

Build both packages:

```sh
(cd apps/minimal-settings && npm install && npm run package)
(cd apps/minimal-home && npm install && npm run package)
```

Upload and install Minimal Settings first:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /tmp/org.webosbrew.minimalsettings_0.3.4_all.ipk' \
  < apps/minimal-settings/dist/org.webosbrew.minimalsettings_0.3.4_all.ipk

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "luna-send -n 1 -f 'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"org.webosbrew.minimalsettings\",\"ipkUrl\":\"/tmp/org.webosbrew.minimalsettings_0.3.4_all.ipk\",\"subscribe\":true}'"
```

Then upload and install Minimal Home:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /tmp/org.webosbrew.minimalhome_0.1.7_all.ipk' \
  < apps/minimal-home/dist/org.webosbrew.minimalhome_0.1.7_all.ipk

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "luna-send -n 1 -f 'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"org.webosbrew.minimalhome\",\"ipkUrl\":\"/tmp/org.webosbrew.minimalhome_0.1.7_all.ipk\",\"subscribe\":true}'"
```

Verify both versions before changing the Home app:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/getAppInfo' \
  '{\"id\":\"org.webosbrew.minimalsettings\"}'"

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  "luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/getAppInfo' \
  '{\"id\":\"org.webosbrew.minimalhome\"}'"
```

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

The redirect source lives inside the installed Minimal Home directory. Unmount the active redirect before replacing the app, then reactivate it after installation:

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
