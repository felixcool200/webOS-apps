# Minimal Home for webOS

A small, local launcher for a rooted LG webOS TV. It shows a clock and date, installed apps in two rows, and one system action: a Settings cog. (LG's Profile panel was dropped: it loads LG's online account page and took about 6 s to appear.)

The local hidden-app list excludes Alexa, Camera, Sports, Home Hub, LG Channels, LG Gallery+, and Media Player.

The large top row holds the apps used day to day. YouTube, Netflix, Disney+, Sveriges Radio, Viaplay, and Spotify start it in that order; other apps keep their order from webOS. A smaller Tools row at the bottom holds setup apps, by default LG's Apps list, Homebrew Channel, LG Input Hook, and Life's Good Without Spying.

## Remote buttons

Settings has a Remote buttons page that decides what each button on the remote (an LG MR24 Magic Remote) does: Normal, Disabled, Screen on/off (LG's own Screen Off mode, picture dark and sound on), Acts as Back, OK, an arrow or Home (so another remote's buttons can work the TV), or Open an app. It lists every button except Power, which never reaches the TV's software, and OK, the arrows, Back, and Home, which stay as they are so the remote remains usable.

As in the Settings view, OK on a row lets Left/Right change its action, and OK or Back finishes. Each row shows the button's code under its name. Next to the list is a drawing of the remote that outlines the button of the selected row. Right from the list moves into the drawing, where the arrows (or the pointer) move between buttons and OK opens that button's row to change it; Up and Down past its edges lead to Test remote and the remote choice. Changes take effect right away. A binding made some other way shows as Custom and stays on offer after choosing something else, so it can be chosen again.

Test remote, above the drawing (Right from the list), finds a button by pressing it: buttons light up as the TV receives them, and pressing a listed button selects its row. During the test every bindable button and Home are temporarily disabled and the page ignores the other buttons, so every press only lights a button up. Press any button three times quickly to stop the test; it works with any remote, because presses are read from the hook's log. Stop test with the pointer, or leaving the page, also stops it. The test also stops when Home goes out of sight. If Home is reloaded or the TV restarts during a test, the bindings are put back when Home next reads them or at boot.

### Custom remote

Remote, below the drawing, switches between LG MR24 and Custom (OK, then Left/Right). Custom lists your own buttons, for another remote or buttons the MR24 list lacks: Add a button, at the end of the list, waits 15 seconds for a button press and adds that button (Back cancels). Name it with the on-screen keyboard and OK. A card replaces the drawing and shows the selected button's name and code, with Rename and Remove below it; Remove also undoes what the button was set to do. Codes bound on the other remote are listed too, so every binding can be seen. Each remote shows its own names, so renaming a button on Custom leaves the MR24 list as it is; what a button does is shared, because the TV sees the same code from either. If another remote's Back sends its own code, add it and set it to Acts as Back. The Custom buttons and the chosen remote are kept in `localStorage`.

The bindings are stored in `/home/root/.config/lginputhook/keybinds.json` and applied by LG Input Hook's library, which Minimal Home ships in `remote-hook/` (see "Remote button hook" in the repository README). At each button press the library rereads the file if its modification time has moved to a later second, so the page makes sure every write does.

The page's rules (which buttons are listed, what they can do, reading presses from the hook's log) are in `app/remote-logic.js`, tested by `test/remote-logic.test.js`.

## Edit mode

Hold OK (or the pointer button) on an app for about half a second to pick it up, like LG's old launcher. Left/Right move it, Down moves it between the two rows, Up hides it, and OK or Back puts it down. A short press still opens the app.

While apps are hidden, a "Hidden apps" tile ends the Tools row. It opens a view of the hidden apps, where OK on one shows it again. Alexa, Camera, Home Hub, LG Channels, LG Gallery+, Media Player, and Sports start out hidden.

The order, the Tools row, and the hidden list are kept in `localStorage` on the TV (WebAppMgr's storage under `/var/lib/wam`), so they survive reinstalling Home. Apps installed later appear after the saved order.

## Settings view

The Settings action opens a Settings view inside Minimal Home, so no separate app has to start: it appears in about 0.2 s instead of about 1 s. Its code is `app/settings.js`, `app/settings-logic.js` (tested by `test/home-logic.test.js`) and `app/settings.css`. Home reads the current values in the background about a second after it comes on screen, so they are already filled in when the view opens, and refreshes them on every open.

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
