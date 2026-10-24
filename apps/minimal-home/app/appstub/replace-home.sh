#!/bin/sh
# Minimal Home's boot script, copied to /var/lib/webosbrew/init.d/50-minimal-home. It mounts this stub
# over LG's Home app, so the Home button opens Minimal Home, and restarts the app manager so it reads
# the stub. With --keep-app-manager (a deploy that left the stub as it was) the app manager, which
# read this stub already, keeps running: restarting it can leave the screensaver hanging. It also
# starts the screensaver watchdog.
APP=/media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome
SOURCE=$APP/appstub
TARGET=/usr/palm/applications/com.webos.app.home

if ! grep -q " $TARGET " /proc/mounts; then
  mount --rbind "$SOURCE" "$TARGET"
fi

if [ "${1:-}" != --keep-app-manager ]; then
  systemctl kill --kill-who=all --signal=KILL sam.service 2>/dev/null || true
  sleep 1
  systemctl --no-block start sam.service
fi

setsid sh "$APP/boot/screensaver-watchdog.sh" </dev/null >/dev/null 2>&1 &
