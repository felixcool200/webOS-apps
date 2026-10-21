# Minimal Home for webOS

A small, local launcher for a rooted LG webOS TV. It shows installed, visible apps and only two system actions: Profile and Settings.

The local hidden-app list excludes Alexa, Camera, Sports, Home Hub, LG Channels, LG Gallery+, and Media Player.

YouTube, Netflix, Disney+, Sveriges Radio, Viaplay, and Spotify are pinned to the start of the app grid in that order. Other apps keep their order from webOS.

The launcher installs as a normal removable app. Its optional Home replacement uses a reversible runtime bind mount containing a redirect stub; it does not write to the stock system partition.

## Build

```sh
npm install
npm run package
```

The packaged app is written to `dist/`.

## Home selection

Run `scripts/use-minimal-home.sh` on the TV to assign the Home category to Minimal Home and redirect any stock-Home fallback to it. Run `scripts/restore-stock-home.sh` to remove the runtime mount and restore LG Home.
