#!/bin/sh
# Makes the remote button bindings load at every boot, and loads them now if they are not yet active.
set -eu
cp /media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/remote-hook/load-remote-hook.sh \
  /var/lib/webosbrew/init.d/60-remote-buttons
chmod 755 /var/lib/webosbrew/init.d/60-remote-buttons
sh /var/lib/webosbrew/init.d/60-remote-buttons
