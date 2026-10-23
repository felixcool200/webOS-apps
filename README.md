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
vendor/lginputhook/     LG Input Hook (git submodule), source of the remote button hook binaries
third_party/            notices and licences for those binaries
shared/                 palette, page reset, Luna and page helpers used by every app
scripts/build-app.js    copies an app and shared/ into the app's build/
scripts/deploy.sh       package, install and launch an app on the TV
package.json            npm test: the tests of shared/ and every app
```

Clone with `git clone --recurse-submodules`, or run `git submodule update --init` in an existing clone: Minimal Home's build takes two files from `vendor/lginputhook`.

Each app has its own `package.json` and can be packaged with:

```sh
cd apps/minimal-home   # or any other app
npm install
npm run package
```

Packaging first builds the app into its `build/` directory: a copy of its `app/` folder with the shared files (`base.css`, `webos.js`, `ui.js`, `splash.png`) next to its own. The resulting IPK is written to that app's `dist/` directory as `<app id>_<version>_all.ipk`.

## Tests

Each app keeps the rules that need no page or TV (parsing departures, arranging the app grid, which remote buttons are listed, stepping settings) in a `*-logic.js` file with tests in its `test/` folder. Run them all from the repository root with Node 18 or later:

```sh
npm test
```

Everything else is checked on the TV.

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

## Remote button hook

Minimal Home's Remote buttons page needs LG Input Hook's library loaded into the TV's input programs (`lginput2`, `micomservice`). Minimal Home ships the two prebuilt binaries from [LG Input Hook](https://github.com/Simon34545/lginputhook) v1.5.1 and a boot script that loads them, so the LG Input Hook app (and its settings web server on port 1842) is not needed. Install the boot script once:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /home/root/use-remote-buttons.sh' \
  < apps/minimal-home/scripts/use-remote-buttons.sh

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'chmod 755 /home/root/use-remote-buttons.sh && /home/root/use-remote-buttons.sh'
```

It copies `remote-hook/load-remote-hook.sh` to `/var/lib/webosbrew/init.d/60-remote-buttons`, which loads the library at every boot unless it is already loaded. It waits for the input program in the background, so later boot scripts aren't held up, and writes LG Input Hook's `/tmp/inputhook` marker so that app, if installed again, doesn't load the library a second time. To stop it, remove that file and reboot; the remote then works as from the factory.

The binaries are `ezinject` (Zlib) and `libinputhookpp.so` (GPL-3.0, with Frida Gum under the wxWindows Library Licence). Their notices and licences are in `third_party/remote-hook/` and are packaged with Minimal Home. A Minimal Home IPK therefore contains GPL-3.0 code: publish it only together with those notices.

## Safety and recovery

Minimal Home's optional Home replacement is a runtime bind mount. It does not write to LG's system partition. A reboot clears the mount before the Homebrew boot hook reapplies it.

Restore LG Home over SSH with:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS '/home/root/restore-stock-home.sh'
```

The recovery script removes the boot hook, unmounts the redirect, restores `com.webos.app.home` as the default Home app, and restarts the webOS application manager.
