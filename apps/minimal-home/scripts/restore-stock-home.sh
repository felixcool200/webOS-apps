#!/bin/sh
set -eu
unlink /var/lib/webosbrew/init.d/50-minimal-home 2>/dev/null || true
umount /usr/palm/applications/com.webos.app.home 2>/dev/null || true
luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/setDefaultApp' \
  '{"category":"home","appId":"com.webos.app.home"}'
systemctl kill --kill-who=all --signal=KILL sam.service 2>/dev/null || true
sleep 1
systemctl --no-block start sam.service
