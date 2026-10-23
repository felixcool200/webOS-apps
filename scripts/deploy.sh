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

home_redirect=0
if [ "$id" = org.webosbrew.minimalhome ] && tv 'test -e /var/lib/webosbrew/init.d/50-minimal-home'; then
  home_redirect=1
  echo "Unmounting the Home redirect before upgrading"
  tv 'umount /usr/palm/applications/com.webos.app.home 2>/dev/null || true'
fi

echo "Uploading"
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

if [ "$home_redirect" = 1 ]; then
  echo "Reactivating Minimal Home (the screen may go black briefly)"
  tv '/home/root/use-minimal-home.sh' >/dev/null
fi

if [ "$launch" = 1 ]; then
  tv "luna-send -n 1 'luna://com.webos.service.applicationmanager/closeByAppId' '{\"id\":\"$id\"}' >/dev/null 2>&1; \
    luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/launch' '{\"id\":\"$id\"}'" >/dev/null
  echo "Launched $id"
fi
