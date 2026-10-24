#!/usr/bin/env bash
# Package an app under apps/ and install it on the TV configured in .env.
# Usage: scripts/deploy.sh apps/<name> [--no-launch]
set -euo pipefail

usage="usage: scripts/deploy.sh apps/<name> [--no-launch]"
app_dir=${1:?$usage}
launch=1
[ "${2:-}" = "--no-launch" ] && launch=0

root=$(git rev-parse --show-toplevel)
[ -f "$root/.env" ] || { echo "Missing $root/.env; copy .env.example and fill it in" >&2; exit 1; }
set -a; . "$root/.env"; set +a
: "${TV_HOST:?TV_HOST is not set in .env}"
: "${TV_SSH_KEY:?TV_SSH_KEY is not set in .env}"
case "$TV_SSH_KEY" in */*) key=$TV_SSH_KEY ;; *) key=$HOME/.ssh/$TV_SSH_KEY ;; esac

app_dir=$(cd "$app_dir" && pwd)
info=$app_dir/app/appinfo.json
id=$(node -p "require(process.argv[1]).id" "$info")
version=$(node -p "require(process.argv[1]).version" "$info")
pkg_version=$(node -p "require(process.argv[1]).version" "$app_dir/package.json")
[ "$version" = "$pkg_version" ] || { echo "Version mismatch: appinfo.json $version, package.json $pkg_version" >&2; exit 1; }
ipk=${id}_${version}_all.ipk

# luna-send exits 0 with no output if its stdin hits EOF before the reply arrives,
# which happens over non-interactive SSH. Give remote commands /dev/null as stdin.
tv() { ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=5 "root@$TV_HOST" "exec </dev/null; $*"; }
tv_upload() { ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=5 "root@$TV_HOST" "cat > $1"; }

echo "Packaging $id $version"
(cd "$app_dir" && { [ -d node_modules ] || npm install; } && npm run --silent package)
[ -f "$app_dir/dist/$ipk" ] || { echo "Expected $app_dir/dist/$ipk was not built" >&2; exit 1; }

# With the version already installed, the install check below would pass before the install ran.
installed_version=$(tv "luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/getAppInfo' '{\"id\":\"$id\"}'" |
  sed -n 's/.*"version": "\([^"]*\)".*/\1/p' | head -n 1)
if [ "$installed_version" = "$version" ]; then
  echo "$id $version is already installed; bump the version in package.json and app/appinfo.json" >&2
  exit 1
fi

home_redirect=0
uploaded=0
# If anything fails from here on, put the Home redirect back and remove the upload, so the Home key
# doesn't open LG's own Home until the next reboot. Only the mount: the app manager still has the stub
# it read at boot, and restarting it can leave the screensaver hanging.
cleanup() {
  status=$?
  if [ "$uploaded" = 1 ]; then tv "rm -f /tmp/$ipk" || true; fi
  if [ "$status" != 0 ] && [ "$home_redirect" = 1 ]; then
    echo "Putting the Home redirect back after the failure" >&2
    tv "sh $home_stub/replace-home.sh --keep-app-manager" || echo "Could not; reboot the TV to get Minimal Home back" >&2
  fi
}
trap cleanup EXIT

# What the app manager reads of Minimal Home's stub (mounted over LG's Home), as a checksum.
home_stub=/media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/appstub
stub_sum() { tv "cat $1/appinfo.json $1/index.html 2>/dev/null | md5sum"; }
stub_before=
if [ "$id" = org.webosbrew.minimalhome ] && tv 'test -e /var/lib/webosbrew/init.d/50-minimal-home'; then
  home_redirect=1
  stub_before=$(stub_sum /usr/palm/applications/com.webos.app.home)
  echo "Unmounting the Home redirect before upgrading"
  tv 'umount /usr/palm/applications/com.webos.app.home 2>/dev/null || true'
fi

echo "Uploading"
uploaded=1
tv_upload "/tmp/$ipk" < "$app_dir/dist/$ipk"

echo "Installing"
tv "luna-send -n 1 -f 'luna://com.webos.appInstallService/dev/install' \
  '{\"id\":\"$id\",\"ipkUrl\":\"/tmp/$ipk\",\"subscribe\":true}'" >/dev/null

installed=0
reply=
for _ in $(seq 30); do
  reply=$(tv "luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/getAppInfo' '{\"id\":\"$id\"}'")
  case "$reply" in *"\"version\": \"$version\""*) installed=1; break ;; esac
  sleep 1
done
tv "rm -f /tmp/$ipk"
uploaded=0
if [ "$installed" != 1 ]; then
  if [ -z "$reply" ]; then
    echo "No reply from the TV's app manager. Stop and ask the user (see .claude/skills/webos-tv-app/SKILL.md)." >&2
  else
    echo "TV did not report $id $version after 30 s. Last reply:" >&2
    echo "$reply" | grep -E '"version"|errorText' >&2 || true
  fi
  exit 1
fi
echo "Installed $id $version"

# The install brought back the default splash; put the one in the theme's colours over it (shared/theme.js).
tv "if [ -f /home/root/.config/minimal-suite/splash.png ] && [ -f /media/developer/apps/usr/palm/applications/$id/splash.png ]; then \
  cp /home/root/.config/minimal-suite/splash.png /media/developer/apps/usr/palm/applications/$id/splash.png; fi"

# The boot scripts run copies in init.d (made by use-minimal-home.sh and use-remote-buttons.sh); bring
# the remote buttons' copy up to date. Home's is refreshed below.
if [ "$id" = org.webosbrew.minimalhome ]; then
  tv "if [ -f /var/lib/webosbrew/init.d/60-remote-buttons ]; then \
    cp /media/developer/apps/usr/palm/applications/$id/remote-hook/load-remote-hook.sh /var/lib/webosbrew/init.d/60-remote-buttons; fi"
fi

# The app manager only reads a changed stub when it restarts. Restarting it while Minimal Home is on
# screen can leave the screensaver hanging (root README, "Why the screensaver hung"); at boot it is
# safe, so a changed stub takes a reboot.
if [ "$home_redirect" = 1 ]; then
  tv "cp $home_stub/replace-home.sh /var/lib/webosbrew/init.d/50-minimal-home && chmod 755 /var/lib/webosbrew/init.d/50-minimal-home"
  if [ "$(stub_sum "$home_stub")" = "$stub_before" ]; then
    echo "Reactivating Minimal Home"
    tv "sh $home_stub/replace-home.sh --keep-app-manager"
    home_redirect=0
  else
    echo "Minimal Home's stub changed: rebooting the TV so the app manager reads it"
    home_redirect=0
    tv 'sync; (sleep 1; reboot) >/dev/null 2>&1 &'
    exit 0
  fi
fi

if [ "$launch" = 1 ]; then
  tv "luna-send -n 1 'luna://com.webos.service.applicationmanager/closeByAppId' '{\"id\":\"$id\"}' >/dev/null 2>&1; \
    luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/launch' '{\"id\":\"$id\"}'" >/dev/null
  echo "Launched $id"
fi
