#!/bin/sh
set -eu
luna-send -n 1 -f 'luna://com.webos.service.applicationmanager/setDefaultApp' \
  '{"category":"home","appId":"org.webosbrew.minimalhome"}'
cp /media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/appstub/replace-home.sh \
  /var/lib/webosbrew/init.d/50-minimal-home
chmod 755 /var/lib/webosbrew/init.d/50-minimal-home
sh /var/lib/webosbrew/init.d/50-minimal-home
