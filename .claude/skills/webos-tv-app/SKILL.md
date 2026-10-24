---
name: webos-tv-app
description: Create, package, deploy and test web apps for the rooted LG webOS TV in this repo. Use when adding a new app under apps/, installing a changed app on the TV, or checking an app on the TV over SSH.
---

# webOS TV apps

Each app is a plain webOS web app (HTML, CSS and plain script files, no framework, no bundler) packaged into an IPK with `ares-package` and installed over root SSH. Privileged calls go through the Homebrew Channel root exec service.

## TV connection (.env)

The TV address and SSH key live in `.env` at the repo root. It is gitignored; `.env.example` is the committed template.

```sh
TV_HOST=192.168.1.50            # TV IP address
TV_SSH_KEY=tv_key              # key name in ~/.ssh, or a full path
```

If `.env` is missing or `TV_HOST` is empty, ask the user for the values. Never commit `.env`, and never write the IP or key name into tracked files; use `TV_ADDRESS` and `~/.ssh/tv_key` as placeholders in docs.

App secrets such as API keys also go in `.env`. The app's `build` script adds them to the built app in `build/` (gitignored; see `apps/departures/scripts/write-config.js`), and the app must still work without them. An IPK built with a secret contains it, so never publish it.

For ad-hoc commands:

```sh
set -a; . ./.env; set +a
case "$TV_SSH_KEY" in */*) KEY=$TV_SSH_KEY ;; *) KEY=~/.ssh/$TV_SSH_KEY ;; esac
tv() { ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=5 root@"$TV_HOST" "exec </dev/null; $*"; }
tv 'uname -a'
```

**Always run remote commands through `tv`.** Over non-interactive SSH, `luna-send` exits 0 with no output if its stdin closes before the reply arrives. The call may or may not have happened, and it looks exactly like a dead TV. `exec </dev/null` prevents this. Only file uploads (`ssh ... 'cat > /tmp/x' < file`) skip `tv`, and those must not call `luna-send`.

The TV's shell is busybox `sh`: no bashisms such as `PIPESTATUS`, and limited `ls`/`ps` options.

## Create an app

First decide whether it should be an app at all. A screen reached from Home, like Settings, belongs inside Minimal Home as a view (see "Add a view to Minimal Home" below): switching views took 0.1–0.25 s on the TV, while launching any separate app takes about 0.9 s. Make a separate app only for something that runs on its own, like Departures.

1. Create `apps/<name>/` with this layout, using `apps/departures` as the reference:

   ```text
   apps/<name>/
     package.json        # name webos-<name>, devDependency "@webos-tools/cli": "3.2.6", scripts:
                         #   "build": "node ../../scripts/build-app.js .",
                         #   "package": "npm run build && ares-package build -o dist"
     README.md           # what it does, how to build
     app/
       appinfo.json
       index.html        # loads base.css, style.css, theme.js in <head>, then webos.js, ui.js, <name>-logic.js, app.js
       style.css
       <name>-logic.js   # the app's rules that need no page or network, for the tests
       app.js
       icon.png          # 80x80
       largeIcon.png     # 130x130
     test/
       <name>-logic.test.js
   ```

   `scripts/build-app.js` copies `app/` to `build/` and adds the shared files next to it: `base.css`, `webos.js`, `ui.js`, `theme.js` and `splash.png`. `build/` is what gets packaged, and `app/` alone lacks the shared files. (Inlining everything into `index.html` was tried and made no measurable difference.)

2. `appinfo.json`: copy the one from `departures` and change `id`, `title` and `version`. The id is `org.webosbrew.<name>` with no dashes. Keep `"requiredPermissions": ["all"]`, the 1920x1080/3840x2160 resolutions, `disableBackHistoryAPI`, `"vendor": "Local"`, and `"noSplashOnLaunch": false` with `"splashBackground": "splash.png"`: webOS then shows our background for the last ~0.3 s of the start instead of black. The first ~0.4 s after the previous app disappears stays black whatever we do. `shared/splash.png` is a 1280x720 render of `shared/base.css`'s default background, which webOS stretches to full screen. Smaller splashes appear about 50 ms sooner but can stay on screen (root README, "Keeping Minimal Home open"). When a theme is chosen, Home copies the splash of its background (Minimal Home's `splashes/`) over the `splash.png` of each app in `SPLASH_APPS` in `shared/theme.js`, and `deploy.sh` copies it in again after an install: add a new app's id there. After changing `base.css`'s background or the backgrounds in `theme.js`, run `node scripts/render-splashes.js`. Add `"visible": false` if the app should not appear in the launcher. (Opening apps as transparent overlays, `"defaultWindowType": "overlay"`, also hides the black and was about 0.3 s faster, but did not feel faster and was not adopted.)
3. Keep `version` identical in `package.json` and `appinfo.json`. The IPK is named `<id>_<version>_all.ipk`.
4. Follow the existing code style in `app.js`:
   - One IIFE with `"use strict"`, `var`, plain functions, started on `DOMContentLoaded`.
   - `var KEY = WebOS.KEY;` and one `keydown` handler that calls `preventDefault()`. Back in a separate app calls `WebOS.backToHome()`, which brings Minimal Home to the front. Don't use `webOSSystem.close()`: webOS then shows its last-input screen first, and Back took about 1.7 s to reach Home instead of 0.65 s. Don't use `platformBack()` either: it shows a "Do you want to exit the app?" prompt.
   - Every interactive element has the `focusable` class and is highlighted only through the app's `.is-focused` class, never `:hover`: the browser keeps `:hover` on the last pointed-at element after an arrow press hides the Magic Remote pointer. Pointer movement (`mousemove`) moves the same focus, as in Home. The app must be fully usable with arrows, OK and Back.
   - For Luna and root calls use `shared/webos.js`: `WebOS.lunaCall`, `WebOS.rootLuna` for Luna calls that need root (launching apps, settings writes), and `WebOS.rootShell` for shell commands as root. Both root helpers reject when the call fails; `rootExec` doesn't, so use it only when the output matters even on failure. Every call fails after 15 s without a reply instead of waiting forever. Root calls can fail while webOS is busy (for example right after Home reloads), so wrap important ones in `WebOS.retry(task, delays)` before showing an error, as Home does with its app list. Pass text through a shell command with `WebOS.base64(text)` (UTF-8 safe), never by quoting it.
   - `shared/ui.js` has the status line (`UI.setStatus(id, message, "ok" | "error")`), focus (`UI.moveFocus(from, to)`) and `UI.keepInView(element, margin)` for scrolling lists.
   - Colours follow the theme chosen in Home (`shared/theme.js`): load `theme.js` in `<head>` after the CSS, so the first frame has the app's last theme, and call `Theme.sync()` once the app has started and whenever it is shown again, to take a theme changed since. Use `var(--accent)`, and `rgba(var(--accent-rgb), alpha)` for tints, never a literal accent colour.
   - Put the rules that need no page or network (parsing API answers, choosing what to show, stepping values) in `<name>-logic.js` as one object, ending with `if (typeof module !== "undefined") { module.exports = …; }`, and test them in `test/<name>-logic.test.js` with `node:test`. `app.js` keeps the page, keys and calls.
   - Listen for `webOSRelaunch` to refresh state when the app is reopened.
   - Fullscreen layout sized for 1920x1080. `shared/base.css` provides the page reset, background, font and the shared colours (`--accent`, `--accent-rgb`, `--bg`, `--glow-a`, `--glow-b` set by the theme, and `--text`, `--muted`, `--error`, `--ok`); the app's `style.css` adds only its own tokens and layout.
5. Run `npm install` in the app directory (Minimal Home also needs `git submodule update --init` once, for `vendor/lginputhook`), then add the app to the Apps list in the root `README.md`. Leave out the version: versions live only in `package.json` and `appinfo.json`.

## Add a view to Minimal Home

A view is a `<main id="NAME-view" hidden>` in `apps/minimal-home/app/index.html`, run by its own module (see `settings.js` and `remote.js`) loaded before `app.js`. Add it to `VIEWS` in `app.js` with the view Back leads to. The module returns `{ attach, open, close, handleKey, handlePointer }`:

- `attach(host)` runs once at start. `host.navigate(view)` switches views, `host.apps()` is the installed apps, and `host.setLinkValue(view, text)` shows a summary on a Settings row that leads to a view. Such a row is a Settings button with `data-view="NAME"`.
- `open()` and `close()` run when the view is shown and left; `close()` must leave nothing running.
- `handleKey(event)` gets every key while the view is shown and returns `"leave"` for Back to go to the view's `back`. `handlePointer(event)` gets pointer movement.
- A new Settings page needs no module or markup of its own: its rows go in `PAGES` in `settings-specs.js`, and `SettingsPage.create("NAME")` in `VIEWS` adds its `<main>` and runs it (Minimal Home's README, "Settings view").
- Settings-style views use `class="panel-view"`, which brings the shared header, rows, focus, footer and status styles from `style.css` and keeps the clock in place. Rows use OK to start changing a value and Left/Right to change it, with the footer hints `Arrows Move · OK Select · Back …` and, while changing, `Left/Right Change · OK Done · Back Done`.

## Deploy

A new app starts at `0.1.0`. Before redeploying an app that is already installed, bump the patch version in `package.json` and `appinfo.json` (the script refuses to run if they differ). With an unchanged version, the install check passes before the install has finished. Then run from the repo root:

```sh
scripts/deploy.sh apps/<name>
```

The script reads `.env`, packages the app, uploads the IPK, installs it, waits until the TV reports the new version, then relaunches the app. Pass `--no-launch` to skip the relaunch. The `requiredACG` warning from `ares-package` is harmless for these local installs.

For `apps/minimal-home` the script also unmounts the Home redirect before installing and puts it back afterwards if it was active (see "Upgrade Minimal Home safely" in the root README). Only when the redirect stub itself changed does it reboot the TV, so the boot script restarts the app manager: restarting it in place while Minimal Home is on screen can leave the next screensaver hanging (see "Why the screensaver hung").

## Test

`npm test` at the repository root runs the Node tests of `shared/` and every app's logic module, and `npm run test:browser` runs Minimal Home's views in headless Chrome against a fake TV (`apps/minimal-home/test/browser/`). Run both before deploying. When fixing a bug in a view, add a browser test that fails without the fix (the fake TV can delay, lose or fail any call); put rules that need no page in a logic module with a Node test. Only what needs the real TV is checked on the TV:

1. **Installed version:** the deploy script fails if the TV does not report the new version within 30 seconds.
2. **Launched:** `tv 'grep NL_APP_LAUNCH_BEGIN /var/log/messages | tail -n 5'` should show the app id. `tv "luna-send -n 1 -f luna://com.webos.service.applicationmanager/running '{}'"` lists running apps.
3. **Screenshot:** capture the screen, copy it back, and read the PNG to check the layout:

   ```sh
   tv "luna-send -n 1 -f luna://com.webos.service.capture/executeOneShot \
     '{\"path\":\"/tmp/capture.png\",\"method\":\"DISPLAY\",\"format\":\"PNG\",\"width\":1920,\"height\":1080}'"
   scp -i "$KEY" root@"$TV_HOST":/tmp/capture.png ./<name>-capture.png
   ```

   `*-capture.png` is gitignored. If the capture call fails on this firmware, ask the user to check the screen instead.
4. **Logs:** `tv 'grep <app-id> /var/log/messages | tail -n 50'` shows launch and visibility events only. JavaScript errors and `console` output are not logged, so have the app show failures in its own status line and check them in a screenshot.
5. **Startup time:** close the app, launch it, and compare the `NL_APP_LAUNCH_BEGIN` and first `NL_VSC` `"visible":true` timestamps for its id in `/var/log/messages`. Measure several cold starts before and after a change meant to speed things up. In October 2026 an empty test page needed about 690 ms to become visible: roughly 150 ms for webOS to start the page and 400 ms more before its first script ran. Our apps became visible at 850–880 ms, so about 80% of the black screen at launch is webOS. For a finer breakdown, temporarily report `performance.timing` and the paint entries from the page (for example appended to a file under `/tmp` via `WebOS.rootExec`), compare with an empty test app, and remove the instrumentation afterwards.
6. **Remote navigation:** `tv 'luna-send -n 1 luna://com.webos.service.networkinput/sendSpecialKey "{\"key\":\"BACK\"}"'` presses a key (also `HOME`), which is enough for timing tests. Arrow navigation and pointer behaviour still need the physical remote. Ask the user to check specific keys (for example "press Down twice, then OK; the Wi-Fi row should enter edit mode") rather than a vague "try it".

Layout-only checks can also run locally: `npm run build` in the app directory, then `python3 -m http.server -d apps/<name>/build 8000` in a 1920x1080 browser window. `app/` on its own lacks the shared code. Luna calls fail there because `PalmServiceBridge` only exists on the TV. Stop the server when you are done.

## When the TV doesn't respond as expected

Stop and ask the user. Don't retry in a loop. Retry once at most. If a call still returns nothing or the wrong result, or the screen doesn't match what you expect, collect this and show it to the user:

```sh
tv 'uptime; free -m; grep -E "NL_APP_LAUNCH_BEGIN|NL_APP_INSTALLED" /var/log/messages | tail -n 10'
```

Then ask what is on the screen. Known causes:

- **Closed stdin:** empty `luna-send` output with exit code 0 almost always means the command didn't go through `tv` (`exec </dev/null`). Check this first.
- **TV in standby or screensaver:** SSH can still answer while launched apps don't appear. `com.webos.app.screensaver` in the launch log points to this. Ask the user to wake the TV.
- **A system pop-up on screen:** an alert (`com.webos.app.alert` in the log) can sit in front of the app. Ask the user to dismiss it.
- **App manager restarting:** `use-minimal-home.sh` restarts it, and calls fail for about 10 seconds. Wait once, then ask.
- **Screensaver that keys can't end:** check `getPowerState` for `"processing": "Screen Saver Ready"`. It follows a forced restart of the app manager (see "Why the screensaver hung" in the root README); closing `com.webos.app.screensaver` with `applicationManager/closeByAppId` clears the screen, but only a reboot clears tvpowerd.
- **Low memory:** the TV has about 1.2 GB of RAM and usually runs close to the limit. webOS may kill or reload apps (Minimal Home `autoReload` in the log). Check `free -m`, and ask the user before closing other apps.
- **Load average around 28 is normal:** chip driver threads count as load without using CPU. It doesn't mean the TV is overloaded.

The user may be using the TV with the remote while you work. Launches from Minimal Home also show up as `com.webos.lunasend-*` in the log, so don't assume an unexpected launch came from you.

## Remove an app

```sh
tv "luna-send -n 1 -f luna://com.webos.appInstallService/dev/remove '{\"id\":\"<app-id>\"}'"
```

Do not remove `org.webosbrew.minimalhome` while it is the active Home. Run `/home/root/restore-stock-home.sh` on the TV first.
