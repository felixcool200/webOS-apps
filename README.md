# webOS apps

Small, fast applications for a rooted LG webOS TV.

## Apps

- **Minimal Home** — a fullscreen launcher with a curated app grid, Profile, remote navigation, and a reversible stock-Home redirect.
- **Minimal Settings** — a work-in-progress fullscreen frontend for frequently used picture, sound, and system settings.

Both apps are plain webOS web applications. Privileged operations use the root execution service supplied by [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel).

## Repository layout

```text
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

## Safety and recovery

Minimal Home's optional Home replacement is a runtime bind mount. It does not write to LG's system partition. The TV-side recovery script is installed as `/home/root/restore-stock-home.sh` during local deployment.
