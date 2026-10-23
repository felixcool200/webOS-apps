# Minimal Home for webOS

A small, local launcher for a rooted LG webOS TV. It shows a clock and date, installed apps in two rows, and one system action: a Settings cog. (LG's Profile panel was dropped: it loads LG's online account page and took about 6 s to appear.)

The local hidden-app list excludes Alexa, Camera, Sports, Home Hub, LG Channels, LG Gallery+, and Media Player.

The large top row holds the apps used day to day. YouTube, Netflix, Disney+, Sveriges Radio, Viaplay, and Spotify start it in that order; other apps keep their order from webOS. A smaller Tools row at the bottom holds setup apps, by default LG's Apps list, Homebrew Channel, LG Input Hook, and Life's Good Without Spying.

## Edit mode

Hold OK (or the pointer button) on an app for about half a second to pick it up, like LG's old launcher. Left/Right move it, Down moves it between the two rows, Up hides it, and OK or Back puts it down. A short press still opens the app.

While apps are hidden, a "Hidden apps" tile ends the Tools row. It opens a view of the hidden apps, where OK on one shows it again. Alexa, Camera, Home Hub, LG Channels, LG Gallery+, Media Player, and Sports start out hidden.

The order, the Tools row, and the hidden list are kept in `localStorage` on the TV (WebAppMgr's storage under `/var/lib/wam`), so they survive reinstalling Home. Apps installed later appear after the saved order.

## Settings view

The Settings action opens a Settings view inside Minimal Home, so no separate app has to start: it appears in about 0.2 s instead of about 1 s. Its code is `app/settings.js` and `app/settings.css`. Home reads the current values in the background about a second after it comes on screen, so they are already filled in when the view opens, and refreshes them on every open.

The view exposes a deliberately small set of verified controls: picture mode, panel brightness, black level, contrast, colour temperature, energy saving, sound mode, Quick Start+, live Wi-Fi and Ethernet status, and a Wi-Fi on/off control. Detailed network setup and less common options remain available through the Open LG Settings button.

Settings are read immediately before context-sensitive writes so picture changes stay scoped to the active input and picture mode.

Arrows navigate without changing values. Press OK to enter edit mode, use Left/Right to change a value, and press OK or Back to leave edit mode. Back outside edit mode, or the Home key, returns to the app grid.

The launcher installs as a normal removable app. Its optional Home replacement uses a reversible runtime bind mount containing a redirect stub; it does not write to the stock system partition.

## Build

```sh
npm install
npm run package
```

The packaged app is written to `dist/`.

## Home selection

Run `scripts/use-minimal-home.sh` on the TV to assign the Home category to Minimal Home and redirect any stock-Home fallback to it. Run `scripts/restore-stock-home.sh` to remove the runtime mount and restore LG Home.

The activation script copies the packaged `appstub/replace-home.sh` into `/var/lib/webosbrew/init.d/50-minimal-home`, so the redirect is reapplied after a reboot. The redirect is a runtime bind mount and does not modify LG's Home files on the system partition.

Copy and run it from the repository with:

```sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'cat > /home/root/use-minimal-home.sh' < scripts/use-minimal-home.sh
ssh -i ~/.ssh/tv_key root@TV_ADDRESS \
  'chmod 755 /home/root/use-minimal-home.sh && /home/root/use-minimal-home.sh'
```

See the repository-level README for full installation, safe-upgrade, and recovery instructions.
