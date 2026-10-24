# webOS apps

Small, fast applications for a rooted LG webOS TV.

## Apps

- **Minimal Home** — a fullscreen launcher with a curated app grid, a Sources view for switching inputs, a built-in Settings view for frequently used picture, sound, network, and system settings, remote button bindings, colour themes shared by the apps, remote navigation, and a reversible stock-Home redirect.
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
scripts/render-splashes.js  draw the start splash for each theme background
scripts/switch-test.js  switch between two apps on the TV and report stuck splashes
package.json            npm test: the tests of shared/ and every app
```

Clone with `git clone --recurse-submodules`, or run `git submodule update --init` in an existing clone: Minimal Home's build takes two files from `vendor/lginputhook`.

Each app has its own `package.json` and can be packaged with:

```sh
cd apps/minimal-home   # or any other app
npm install
npm run package
```

Packaging first builds the app into its `build/` directory: a copy of its `app/` folder with the shared files (`base.css`, `webos.js`, `ui.js`, `theme.js`, `splash.png`) next to its own. The resulting IPK is written to that app's `dist/` directory as `<app id>_<version>_all.ipk`.

## Tests

Each app keeps the rules that need no page or TV (parsing departures, arranging the app grid, which remote buttons are listed, stepping settings) in a `*-logic.js` file with tests in its `test/` folder. Run them all from the repository root with Node 18 or later:

```sh
npm test
```

Minimal Home also has browser tests for its views (arranging apps, Remote buttons, Settings, Sources): `apps/minimal-home/test/browser/*.browser.js`, each run in headless Chrome against a fake TV (`fake-tv.js`) that answers Homebrew Channel's exec service and Home's Luna calls from memory, with delays, lost replies and failed reads where a test asks for them. They need Google Chrome or Chromium (or `CHROME` set to one) and take a few seconds:

```sh
npm run test:browser          # all of them
npm run test:browser -- Remove # only the tests whose name contains "Remove"
```

What only the TV can show (timing, its own services, the remote) is checked on the TV.

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

ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'sh /media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/appstub/replace-home.sh --keep-app-manager'
```

`--keep-app-manager` puts the redirect back without restarting the app manager, which already read the stub. That is only right if the stub's `appinfo.json` and `index.html` are unchanged; otherwise copy `replace-home.sh` to `/var/lib/webosbrew/init.d/50-minimal-home` and reboot, so the boot script restarts the app manager. `deploy.sh` compares the two before and after installing and does one or the other. Don't restart the app manager while Minimal Home is on screen (`use-minimal-home.sh` does): it can leave the next screensaver hanging (see "Why the screensaver hung"). At boot it is safe, because the app in front changes after the restart.

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

### Keeping Minimal Home open

When an app starts cold (it isn't running), LG's memory manager (`memchute`) closes the app you leave, unless that one is in its `KeepOnLaunchEx` list, where LG's own Home is; this happens with plenty of memory free. Switching to an app that is already running closes nothing. The window manager then starts the closed app again in the background (`"reason":"memoryReclaim"` in `getAppLifeEvents`, `"mode":"autoReload"` in `/var/log/messages`; `__processFullscreenLaunchByClosingPolicy` in `/usr/lib/qml/WebOSCompositor/controllers/StarfishFullscreenController.qml`). Without Minimal Home on the list, opening Departures closed Home and Back started Home cold and closed Departures, so every switch between them was a cold start.

Why a splash stays on screen (found on 2026-10-24; LG's code is in `/usr/lib/qml/WebOSCompositor`, and its log lines are kept when `luna://com.webos.pmlogd/setAllowDevLog` is on and land in `/var/log/dbg-log` when it is turned off again):

1. The splash webOS shows while an app starts cold (`splashBackground`) is one view with one app id (`views/StarfishImageSplash.qml`). It closes when that app's window opens (`onSurfaceOpened` compares the id), when the app stops, or after 120 s.
2. After a forced restart of the app manager (see "Why the screensaver hung" below), the window manager is sometimes subscribed to the app manager's `getAppLifeEvents` twice (`ls-monitor -s`: in 8 of 18 restarts), and then handles every `splash` event twice, so `open()` runs twice per launch (two `open, StarfishImageSplash Image path...` lines per launch in the log). With a single subscription it runs once and nothing sticks.
3. When the splash image is still decoded in Qt's image cache, the first `open()` starts showing it at once. The second `open()` then calls `wiper.skipToClosedLeft()`, whose `onClosed` clears the app id (`if (wiperAppId === splashAppId) splashAppId = ""`, logged as `splashAppId is invalid`), and shows the splash again without an id, so the app's window never closes it.
4. Our splash was a small 192x108 image, which stays cached for about 30 s after it was last used: by that app's previous splash, or by the window manager starting the app in the background. Full-size 1920x1080 splashes, like Homebrew Channel's and LG's, are not kept.

So a splash sticks when an app starts cold within about 30 s of its splash image last being used. Without Minimal Home on the list, every switch between Home and Departures was a cold start that also restarted the other app in the background, so switching back and forth quickly hit it nearly every time, while leaving an app open for a minute did not. `node scripts/switch-test.js --cold` reproduces it: 8 of 12 switches with today's builds and 5 of 8 with the builds from before themes (`42e4c55`); 0 of 6 with 32 s between switches (`--cold 3 32`); 0 of 24 with a 1920x1080 splash in both apps, and 8 of 12 again with the small one. Without `--cold`, both apps stay running and no splash shows at all. Back to Home also always meant a cold start.

Since 2026-10-24 our splashes are 1280x720, which aren't kept either (`scripts/render-splashes.js` draws one per theme background). With the window manager subscribed twice, `--cold` left a splash on screen in 8 to 9 of 12 switches with a 192x108 or 640x360 splash, and in none with 960x540 (12), 1280x720 (24) or 1920x1080 (36). A larger splash takes a little longer: side by side, the 1280x720 one appeared 592 ms after the launch instead of 543 ms, and the app's window 872 ms instead of 830 ms (medians).

Minimal Home was added to that list on 2026-10-24 with LG's config service, which keeps it as a user override in `/var/preferences/configd_factory_db.json`. `memchute` reads the list when it starts, so it takes effect after a reboot:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS "exec </dev/null; luna-send -n 1 luna://com.webos.service.config/setConfigs \
  '{\"configs\":{\"com.webos.memorymanager.KeepOnLaunchEx\":[\"com.webos.app.home\",\"com.webos.app.seniorhome\",\"google.assistant\",\"amazon.alexapr\",\"com.webos.app.familycare\",\"org.webosbrew.minimalhome\"]}}'"
```

To undo it, run the same command without `org.webosbrew.minimalhome` and reboot. `luna://com.webos.memorymanager/getConfigs` shows the list `memchute` is using.

### LG's background preloads

LG's preload manager (`preload-manager.service`) keeps some apps from a fixed list loaded in the background so they open faster, and loads them again after the memory manager closes them. `luna://com.webos.service.preloadmanager/getPreloadPolicy` shows the list. Taking apps off it (on 2026-10-24, when memory looked like a cause of the stuck splash, which it wasn't) was undone the same day: `setPreloadPolicy` only lasts until the next boot, and editing `/var/preferences/webos-preload-manager-conf.json` had no effect, so the file and every app's `isEnabled` are back as LG had them.

### Why the screensaver hung

Twice (on 2026-10-23 and 2026-10-24) LG's power service, tvpowerd, started the screensaver and then waited for it forever: `luna://com.webos.service.tvpower/power/getPowerState` kept reporting `"processing": "Screen Saver Ready"`, every key, power included, was ignored, `turnOnScreen` answered `com.webos.service.tvpower/power is busy`, and only a reboot cleared it. Found on 2026-10-24 with LG's own log lines (`luna://com.webos.pmlogd/setAllowDevLog`, dumped to `/var/log/dbg-log`):

1. tvpowerd keeps a record of the app in front, from the app manager's `foregroundAppsEx` updates. It switches to "Screen Saver" (`Change to Screen Saver state`) when an update shows the screensaver while that record is unchanged.
2. When the app manager is killed, tvpowerd clears the record (`Card Type is changed : previous(org.webosbrew.minimalhome), current()`) and subscribes again once it is back. Normally the restarted app manager then announces the app in front within about a second (`previous(), current(org.webosbrew.minimalhome)`).
3. That announcement races with the window manager's report to the restarted app manager (`[LSM->SAM] ForeGroundAppInfo` in the log). When the report arrives before the services have subscribed again, they get an empty app in their first reply, and since nothing changes afterwards, nobody is told: tvpowerd's record stays empty until the next app switch.
4. If the next change is the screensaver itself, the update that shows it also changes tvpowerd's record from nothing to the app in front; tvpowerd handles that as an app switch, never logs `Change to Screen Saver state`, and stays busy.

Reproduced by restarting the app manager the way our scripts did (`systemctl kill --kill-who=all --signal=KILL sam.service`, then `systemctl start`) and starting the screensaver with `luna://com.webos.service.tvpower/power/turnOnScreenSaver` without switching apps in between: 3 hangs in 48 restarts, one of them with the whole sequence in the log (record cleared, no announcement for 40 s, the record set by the screensaver's update, no switch to "Screen Saver"); 0 hangs in 30 screensaver starts without a restart. Without a forced restart there is no hang, and the boot script's restart (`app/appstub/replace-home.sh`, about a minute into boot) is safe: then the app in front changes after the restart, from LG's Home, which dies with the app manager, to Minimal Home, so tvpowerd's record is set again (4 of 4 boots, no hang). Two ways to avoid that restart were tried and failed: closing only LG's Home after mounting the stub (the app manager keeps LG's Flutter Home cached, the close fails with `no_handling_info`, and launching Home never finishes), and mounting before the app manager starts (it starts about 7 s into boot, Homebrew's boot hook at about 44 s, and `/etc` is read-only). A clean `systemctl restart sam.service` is no better: the app manager ignores the stop signal, so systemd kills it after 90 s, and the screensaver still hung after 1 of 5. Deploys therefore never restart the app manager in place (a changed stub reboots the TV).

A watchdog that closed a hung screensaver was removed: its `getPowerState` subscription reports changes of `state`, not of `processing`, so it never saw "Screen Saver Ready", and closing the screensaver does not free tvpowerd anyway.
