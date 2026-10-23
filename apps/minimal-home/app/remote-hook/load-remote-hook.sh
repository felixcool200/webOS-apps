#!/bin/sh
# Loads LG Input Hook's library (vendor/lginputhook, BSD-3-Clause) into the TV's input programs, the
# way its own service does, so the button bindings in keybinds.json apply. Runs at every boot from
# /var/lib/webosbrew/init.d (see scripts/use-remote-buttons.sh). The library rereads keybinds.json by
# itself at a key press once the file's modification time has moved on.
DIR=/media/developer/apps/usr/palm/applications/org.webosbrew.minimalhome/remote-hook
CONFIG=/home/root/.config/lginputhook/keybinds.json

[ -f "$DIR/libinputhookpp.so" ] || exit 0
mkdir -p "$(dirname "$CONFIG")"
# Minimal Home's Remote buttons page sets the real bindings aside while it is open; if a restart
# interrupted it, put them back, with the current time so a library that is already loaded notices.
[ ! -f "$CONFIG.before-test" ] || { mv "$CONFIG.before-test" "$CONFIG" && touch "$CONFIG"; }
[ -f "$CONFIG" ] || echo '{}' > "$CONFIG"
chmod 755 "$DIR/ezinject"

# The remote's input program may not be running yet this early in the boot, so wait for it (up to a
# minute) in the background instead of holding up the boot scripts after this one.
(
  i=0
  while [ -z "$(pidof lginput2)" ] && [ "$i" -lt 60 ]; do
    sleep 1
    i=$((i + 1))
  done

  for name in RELEASE lginput2 micomservice tvservice testapp; do
    for pid in $(pidof "$name"); do
      # Already loaded, by an earlier run or by the LG Input Hook app.
      grep -q libinputhookpp "/proc/$pid/maps" && continue
      : > "/tmp/lginput-hook-$name.log"
      "$DIR/ezinject" -l "/tmp/lginput-hook-$name.log" "$pid" "$DIR/libinputhookpp.so" > "/tmp/ezinject-$name.log" 2>&1
    done
  done
  # LG Input Hook's own service loads the library only when this marker is missing, so a reinstalled
  # LG Input Hook app won't load it a second time (every binding would then fire twice).
  : > /tmp/inputhook
) </dev/null >/dev/null 2>&1 &
