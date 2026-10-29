# Minimal Home for webOS

A small, local launcher for a rooted LG webOS TV. It shows a clock and date, installed apps in two rows, and three system actions: Sources, a Settings cog and a power button. (LG's Profile panel was dropped: it loads LG's online account page and took about 6 s to appear.)

The local hidden-app list excludes Alexa, Camera, Sports, Home Hub, LG Channels, LG Gallery+, and Media Player.

The large top row holds the apps used day to day. YouTube, Netflix, Disney+, Sveriges Radio, Viaplay, and Spotify start it in that order; other apps keep their order from webOS. A smaller Tools row at the bottom holds setup apps, by default LG's Apps list, Homebrew Channel, LG Input Hook, and Life's Good Without Spying.

## Sources

The Sources button, left of the Settings cog, opens a view of Live TV and the TV's inputs (HDMI and any others the TV has), with the names given to them in LG's settings, LG's icons, and whether a device is on, connected, or nothing is detected (dimmed). For HDMI that comes from `hdmiPlugIn`, as in LG's own picker: eim's `connected` stays true for ports with nothing plugged in. The input used last is selected and tagged. OK switches to an input by launching its input app, as LG's own input picker does; Back returns Home.

The remote's Input button opens this view, and its Settings button opens Home's Settings view: the boot script sets these bindings up on a new TV, and they can be changed on the Remote buttons page. A button set to Open Sources opens the view straight away from anywhere: it launches Home with `{"view": "sources"}`. Open Home settings does the same for the Settings view. The inputs are read with `luna://com.webos.service.eim/getAllInputStatus` and `getLastInput`, a second after Home comes on screen and again on every open. The rules are in `app/sources-logic.js`, tested by `test/sources-logic.test.js`.

## Power

The power button, right of the Settings cog, opens a popup with Turn off, Restart and Cancel; the focus starts on Cancel, and Back closes it. Turn off calls `tvpower/power/powerOff` with the reason the remote's power button gives (`remoteKey`), so with Quick Start+ on the TV goes to standby, as with the remote. Restart is a full restart, `tvpower/power2/reboot` with reason `micomReset`, as LG Settings restarts the TV: every service and app starts over and the Home redirect is set up again, which cleared YouTube's black video on 2026-10-26 (a power-button press does not restart anything while Quick Start+ keeps the TV in standby).

## Remote buttons

Settings has a Remote buttons page that decides what each button on the remote (an LG MR24 Magic Remote) does: Normal, Disabled, Screen on/off (LG's own Screen Off mode, picture dark and sound on), Restart the app on screen (closes it through the app manager, waits up to 5 s for it to stop, kills its process if it has one, and opens it again; Home is left alone; the hook runs every command with " &" appended, in the background, so a command must not end with "&" itself, or the shell gets "& &" and runs nothing), Open Sources or Open Home settings, Acts as Back, OK, an arrow or Home (so another remote's buttons can work the TV), or Open an app. It lists every button except Power, which never reaches the TV's software, and OK, the arrows, Back, and Home, which stay as they are so the remote remains usable.

As in the Settings view, OK on a row lets Left/Right change its action, and OK or Back finishes. Each row shows the button's code under its name. Next to the list is a drawing of the remote (with presets made from the LG MR24 template) that outlines the button of the selected row. Right from the list moves into the drawing, where the arrows (or the pointer) move between buttons and OK opens that button's row to change it; Up and Down past its edges lead to Test remote and the remote choice. Changes take effect right away. A binding made some other way shows as Custom and stays on offer after choosing something else, so it can be chosen again.

Test remote, above the drawing (Right from the list), finds a button by pressing it: buttons light up as the TV receives them, and pressing a listed button selects its row. During the test every bindable button and Home are temporarily disabled and the page ignores the other buttons, so every press only lights a button up. Press any button three times quickly to stop the test; it works with any remote, because presses are read from the hook's log. Stop test with the pointer, or leaving the page, also stops it. The test also stops when Home goes out of sight. If Home is reloaded or the TV restarts during a test, the bindings are put back when Home next reads them or at boot.

### Presets

The bindings come in presets. Preset, below the drawing, switches between them (OK, then Left/Right): the one shown becomes active right away, and its bindings are written to the bindings file. The ⋯ button beside it (Right from the preset row) opens a menu for that preset: New preset… (from the LG MR24 or Blank template), Rename, and Delete, which asks first; the last preset can't be deleted. Names are typed with the on-screen keyboard. An LG MR24 preset starts with Input opening Sources and Settings opening Home's settings; a Blank one starts with nothing bound.

A Blank preset lists your own buttons, for another remote or buttons the MR24 list lacks: Add a button, at the end of the list, waits 15 seconds for a button press and adds that button (Back cancels); name it with the on-screen keyboard and OK. A card the size of the MR24 drawing shows the selected button's name and code, with Rename and Remove below it; Remove also undoes what the button was set to do. Codes bound but not on the preset's list are listed too, so every binding can be seen. If another remote's Back sends its own code, add it and set it to Acts as Back.

The presets (names, templates, buttons and bindings) are kept in `localStorage`. The active preset's bindings are always the ones in the bindings file, which is read again each time the page opens. A new TV starts with one LG MR24 preset; a TV that had the Custom remote before presets gets a Blank preset named Custom with those buttons.

The bindings are stored in `/home/root/.config/lginputhook/keybinds.json` and applied by LG Input Hook's library, which Minimal Home ships in `remote-hook/` (see "Remote button hook" in the repository README). At each button press the library rereads the file if its modification time has moved to a later second, so the page makes sure every write does.

The page's rules (which buttons are listed, what they can do, reading presses from the hook's log) are in `app/remote-logic.js`, tested by `test/remote-logic.test.js`.

## Startup

Home shows the app list it read at the last start straight away (kept in `localStorage` as `home.appList`) while it asks the TV for the current one, and only redraws if that differs: the tiles appear about 0.35 s sooner (0.62 s instead of 0.97 s after the page starts, measured on the TV). A second after it comes on screen it reads what Settings, Remote buttons and Sources show, each in one root call that runs its Luna calls side by side (`WebOS.rootLunaBatch`): 5 root calls at start instead of 14, using about 40% less of the TV's processor for the same reads.

## Grid

Home's apps, Tools and (while arranging) Hidden are one grid: Up/Down move a line at a time and between the sections at the same place across the screen, Left/Right move along a line and wrap at its ends, and Up from the top line reaches the Sources and Settings buttons. The same grid model (`gridNeighbor` and `moveInLayout` in `app/home-logic.js`) moves the focus and, while arranging, a picked-up app.

## Arranging apps

Hold OK (or the pointer button) on an app for about half a second to start arranging, like LG's own launcher: the app is picked up, and a Hidden box opens below the Tools row with the hidden apps. The arrows move the picked-up app around the grid: Left/Right along its line, Up/Down a line at a time, and down from the last line of the apps into Tools and then into Hidden (and back up), keeping its column where it can. Moving it into Hidden hides it, and moving it back up shows it again, so a mistake is one press to undo. OK puts it down and arranging goes on: move to another app, including one in the Hidden box, and press OK to pick it up. Back finishes at once, also with an app picked up (it stays where it is), and the Hidden box closes; arranging also ends by itself after 20 seconds with nothing picked up. While arranging, an accent banner at the top says so and the tiles wiggle gently, so it can't be mistaken for normal use. A short press of OK outside arranging still opens the app.

While apps are hidden, a "Hidden apps" tile with their count ends the Tools row. It opens a view of the hidden apps, in the order they have in the Hidden box, where OK launches one: for apps used too rarely to keep on Home. Alexa, Camera, Home Hub, LG Channels, LG Gallery+, Media Player, and Sports start out hidden.

The order, the Tools row, and the hidden list are kept in `localStorage` on the TV (WebAppMgr's storage under `/var/lib/wam`), so they survive reinstalling Home. Apps installed later appear after the saved order, and tools or hidden apps that are uninstalled keep their place in case they come back. Home keeps running, so it asks the TV for the app list again each time it opens on the app grid (the Home key, or Back from our apps), and an app installed or removed meanwhile shows without restarting Home; an unchanged list redraws nothing. The moves are in `app/home-logic.js`, tested by `test/home-logic.test.js`.

## Appearance

Settings has an Appearance row (under Apps) that opens the colour theme of Home and the other apps in this repo. A theme is an accent colour (focus rings, highlights, bars) on a background (the page colour and the glow in two corners). Theme steps through seven presets and your own themes, shown as cards beside the rows; Accent and Background step through a palette of 12 accents and 7 backgrounds. Changing the accent or background of a preset makes a theme of your own from it ("Custom 1", "Custom 2", ...), which later changes then edit, and which Delete this theme removes after a second OK.

A change shows at once. `shared/theme.js`, loaded in each app's `<head>`, sets the theme as CSS variables (`--accent`, `--accent-rgb`, `--bg`, `--glow-a`, `--glow-b`) from the app's own `localStorage` before the first frame (about 2 ms in desktop Chrome). Half a second after the last change, or when the view closes, Home writes the theme to `/home/root/.config/minimal-suite/theme.json`, one write at a time and retried if the TV is busy; if it still fails, Home writes it again after its next start. The other apps read that file after they start and when they come back on screen (`Theme.sync()`), and switch if it changed. With the theme Home also writes the splash webOS shows while each app starts, drawn in the theme's colours. Your own themes are kept in Home's `localStorage` as `theme.custom`. The rules are in `app/appearance-logic.js` and `shared/theme.js`, tested by `test/appearance-logic.test.js`, `shared/test/theme.test.js` and `test/browser/appearance.browser.js`.

## Settings view

The Settings action opens a Settings view inside Minimal Home, so no separate app has to start: it appears in about 0.2 s instead of about 1 s. It is a hub. On the left are quick rows (picture mode, panel brightness, energy saving, sound mode and the sleep timer) and the links to Remote buttons and Appearance. On the right are links to the Settings pages, each with a short summary: Picture, Sound, Network, Power and energy, General, Accessibility and About this TV. Its code is `app/settings.js`, `app/settings-logic.js` (tested by `test/settings-logic.test.js`) and `app/settings.css`. Home reads the hub's values in the background about a second after it comes on screen, so they are already filled in when the view opens, and refreshes them on every open.

A Settings page is a scrolling list drawn from `app/settings-specs.js` by `app/settings-page.js`, with LG's names, value names and help, and LG's rules. For example, Panel brightness is greyed while Energy saving is Auto or Maximum (on the hub too), and the high-contrast options also turn Grayscale and Invert colours off, as in LG Settings. The TV says which rows and values it offers and their ranges, so a row it doesn't have is left out. Some rows only show while they apply: Sound's delay row is the one of the sound output in use, and audio description volume shows while audio description is on.

A page reads everything in one root call when it opens, never at Home's start: a `settingsservice/batch` for the settings, and the other services beside it (the sleep timer from `tvReservationAgent`, Wi-Fi and Ethernet from `connectionmanager` and `wifi`, the model and software version from `tv.systemproperty` and `osInfo`). It writes each change at once; holding Left or Right keeps changing the value. Pages write as LG Settings does, without naming a dimension, so per-input sound settings change what is playing now. Rows that can't be set from Home, such as the time zone, menu language, TV name and sound output, are shown read-only. Turning Wi-Fi off asks for OK twice, since the TV may be reached over Wi-Fi. A card beside the list, level with its top (a page's first section has no title, so the list starts with a box), explains the focused row, and Right reaches "Open in LG Settings", which opens LG at the same panel (Network opens LG's network screens).

The TV keeps picture settings per input (the apps, live TV and each HDMI input, each with its own picture mode and its own values per mode), so the Picture page starts with "Applies to": the input that played last, which LG Settings changes too, and Left/Right chooses another. Another input's values are read in two steps (its picture mode, then that mode's values), and writes name the input and mode explicitly; the first change in a mode also sets LG's flag that shows the mode as "(User Settings)", as LG does. Energy saving, Reduce blue light and FILMMAKER MODE auto start apply to every input and say so.

Some rows need more than one key or another way of writing, as LG Settings does them. TruMotion and the aspect ratio are written for an app rather than for an input (on this TV TruMotion is one value for whatever plays, and the aspect ratio one value for all inputs), so they show only while "Applies to" is the input that played last, and the aspect ratio not for apps. Power on screen (Home or the input used last), Always Ready, Sound out and Grayscale and Invert colours are made of LG's keys and written as LG writes them. Apply to all inputs and the picture and sound resets are actions: the first OK asks, the second runs them, and moving away cancels; the sound reset is offered only in the Standard sound mode, as in LG, and the picture's Apply to all inputs only for the input that played last, since the TV copies from what plays. Switches go Left for off and Right for on, whatever order the TV lists them in. Screen zoom stays in LG Settings: it zooms the screen at once, and the arrows then pan the zoom, so Home couldn't turn it off again. Always Ready, turning on via Wi-Fi and Minimum brightness ask first, as LG does, because they can raise the energy used.

Arrows navigate without changing values. Press OK to enter edit mode, use Left/Right to change a value, and press OK or Back to leave edit mode. Back outside edit mode returns to the hub, and from the hub to the app grid.

To add a page: its rows in `PAGES` in `settings-specs.js` (a row from another service needs a source in `SOURCES` in `settings-logic.js`), an entry in `VIEWS` in `app.js` (`SettingsPage.create("NAME")`, which adds the view's `<main>`), and a link row on the hub with `data-view="NAME"`. Bluetooth, channels, locks, the power on and off timers, software updates and LG's other flows stay in LG Settings (`docs/settings-plan.md`).

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
