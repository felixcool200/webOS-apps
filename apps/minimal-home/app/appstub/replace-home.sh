#!/bin/sh
SOURCE=/media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/appstub
TARGET=/usr/palm/applications/com.webos.app.home

if ! grep -q " $TARGET " /proc/mounts; then
  mount --rbind "$SOURCE" "$TARGET"
fi

systemctl kill --kill-who=all --signal=KILL sam.service 2>/dev/null || true
sleep 1
systemctl --no-block start sam.service
