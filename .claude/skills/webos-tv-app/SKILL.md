---
name: webos-tv-app
description: Create, package, deploy and test web apps for the rooted LG webOS TV in this repo. Use when adding a new app under apps/, installing a changed app on the TV, or checking an app on the TV over SSH.
---

# webOS TV apps

Each app is a plain webOS web app (HTML, CSS, one JS file, no framework, no build step) packaged into an IPK with `ares-package` and installed over root SSH. Privileged calls go through the Homebrew Channel root exec service.

## TV connection (.env)

The TV address and SSH key live in `.env` at the repo root. It is gitignored; `.env.example` is the committed template.

```sh
TV_HOST=192.168.1.50            # TV IP address
TV_SSH_KEY=tv_key              # key name in ~/.ssh, or a full path
```

If `.env` is missing or `TV_HOST` is empty, ask the user for the values. Never commit `.env`, and never write the IP or key name into tracked files; use `TV_ADDRESS` and `~/.ssh/tv_key` as placeholders in docs.

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

1. Create `apps/<name>/` with this layout, using `apps/minimal-settings` as the reference:

   ```text
   apps/<name>/
     package.json        # name webos-<name>, script "package": "ares-package app -o dist",
                         # devDependency "@webos-tools/cli": "3.2.6"
     README.md           # what it does, how to build
     app/
       appinfo.json
       index.html
       style.css
       app.js
       icon.png          # 80x80
       largeIcon.png     # 130x130
   ```

2. `appinfo.json`: copy the one from `minimal-settings` and change `id`, `title` and `version`. The id is `org.webosbrew.<name>` with no dashes. Keep `"requiredPermissions": ["all"]`, the 1920x1080/3840x2160 resolutions, `disableBackHistoryAPI`, `noSplashOnLaunch` and `"vendor": "Local"`. Drop `"visible": false` if the app should appear in the launcher.
3. Keep `version` identical in `package.json` and `appinfo.json`. The IPK is named `<id>_<version>_all.ipk`.
4. Follow the existing code style in `app.js`:
   - One IIFE with `"use strict"`, `var`, plain functions, started on `DOMContentLoaded`.
   - `var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 461 };` and one `keydown` handler that calls `preventDefault()`. Back closes the app with `window.webOSSystem.close()`.
   - Every interactive element has the `focusable` class and a visible focus state. The app must be fully usable with arrows, OK and Back.
   - For luna and root calls, copy `lunaCall`, `rootExec` and `rootLuna` from `apps/minimal-settings/app/app.js`. Use `rootLuna` for anything that needs root (launching apps, settings writes).
   - Listen for `webOSRelaunch` to refresh state when the app is reopened.
   - Fullscreen layout sized for 1920x1080, `overflow: hidden`, colour tokens on `:root` as in the existing `style.css`.
5. Run `npm install` in the app directory, then add the app with its version to the Apps list in the root `README.md`.

## Deploy

A new app starts at `0.1.0`. Before redeploying an app that is already installed, bump the patch version in `package.json`, `appinfo.json` and the root README. With an unchanged version, the install check passes before the install has finished. Then run from the repo root:

```sh
.claude/skills/webos-tv-app/scripts/deploy.sh apps/<name>
```

The script reads `.env`, packages the app, uploads the IPK, installs it, waits until the TV reports the new version, then relaunches the app. Pass `--no-launch` to skip the relaunch. The `requiredACG` warning from `ares-package` is harmless for these local installs.

For `apps/minimal-home` the script also unmounts the Home redirect before installing and re-runs `/home/root/use-minimal-home.sh` afterwards if the redirect was active (see "Upgrade Minimal Home safely" in the root README). That restarts the app manager, so the screen goes black for a few seconds.

## Test

There is no automated test suite. Check each change on the TV:

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
5. **Remote navigation:** this needs the physical remote. Ask the user to check specific keys (for example "press Down twice, then OK; the Wi-Fi row should enter edit mode") rather than a vague "try it".

Layout-only checks can also run locally with `python3 -m http.server -d apps/<name>/app 8000` in a 1920x1080 browser window. Luna calls fail there because `PalmServiceBridge` only exists on the TV. Stop the server when you are done.

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
- **Low memory:** the TV has about 1.2 GB of RAM and usually runs close to the limit. webOS may kill or reload apps (Minimal Home `autoReload` in the log). Check `free -m`, and ask the user before closing other apps.
- **Load average around 28 is normal:** chip driver threads count as load without using CPU. It doesn't mean the TV is overloaded.

The user may be using the TV with the remote while you work. Launches from Minimal Home also show up as `com.webos.lunasend-*` in the log, so don't assume an unexpected launch came from you.

## Remove an app

```sh
tv "luna-send -n 1 -f luna://com.webos.appInstallService/dev/remove '{\"id\":\"<app-id>\"}'"
```

Do not remove `org.webosbrew.minimalhome` while it is the active Home. Run `/home/root/restore-stock-home.sh` on the TV first.
