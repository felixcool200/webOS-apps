#!/bin/sh
# Closes the screensaver when LG's power service hangs while starting it. tvpowerd starts the
# screensaver app, then waits for it to show before it switches to "Screen Saver"; sometimes (after the
# app manager was restarted) that never happens, getPowerState keeps reporting processing "Screen Saver
# Ready", and every key, power included, is ignored until a reboot. When that lasts STUCK_SECONDS this
# closes the screensaver app, and logs the power state before and after to LOG.
# Started at boot by replace-home.sh; a new copy stops the one already running.
STUCK_SECONDS=${STUCK_SECONDS:-15}
PIDFILE=${PIDFILE:-/tmp/screensaver-watchdog.pid}
LOG=${LOG:-/tmp/screensaver-watchdog.log}
POWER=luna://com.webos.service.tvpower/power/getPowerState

# Each copy runs in its own process group (setsid), so this also stops its luna-send. The process is
# checked first, in case its number now belongs to something else.
old=$(cat "$PIDFILE" 2>/dev/null)
if [ -n "$old" ] && grep -q screensaver-watchdog "/proc/$old/cmdline" 2>/dev/null; then
  kill -TERM "-$old" 2>/dev/null
fi
echo $$ > "$PIDFILE"

unstick() {
  state=$(luna-send -n 1 "$POWER" '{}' </dev/null)
  case "$state" in *'"Screen Saver Ready"'*) ;; *) return ;; esac
  echo "$(date) stuck: $state" >> "$LOG"
  luna-send -n 1 luna://com.webos.service.applicationmanager/closeByAppId '{"id":"com.webos.app.screensaver"}' </dev/null >> "$LOG" 2>&1
  sleep 5
  echo "$(date) after closing: $(luna-send -n 1 "$POWER" '{}' </dev/null)" >> "$LOG"
}

# Every change of the power state arrives as one line. A timer starts when tvpowerd begins waiting
# and is cancelled by the next change; normally that comes within a second.
while :; do
  timer=
  luna-send -i "$POWER" '{"subscribe":true}' </dev/null | while read -r reply; do
    case "$reply" in
      *'"Screen Saver Ready"'*)
        if [ -z "$timer" ]; then
          (sleep "$STUCK_SECONDS"; unstick) &
          timer=$!
        fi ;;
      *)
        if [ -n "$timer" ]; then kill "$timer" 2>/dev/null; timer=; fi ;;
    esac
  done
  # The subscription ends if tvpowerd restarts.
  sleep 5
done
