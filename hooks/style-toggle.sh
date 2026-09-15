#!/usr/bin/env bash
# Toggle the style directive off or on. Paired with hooks/style-gate.mjs, which
# stays silent while a matching sentinel file exists under state/.
#
#   style-toggle.sh off             turn off for THIS session only
#   style-toggle.sh on              turn back on for this session
#   style-toggle.sh off --global    turn off everywhere until turned back on
#   style-toggle.sh on  --global    clear the global off
#   style-toggle.sh status          report current state
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/state"
mkdir -p "$DIR"
SID="${CLAUDE_CODE_SESSION_ID:-}"
GLOBAL="$DIR/GLOBAL"

# Drop session sentinels older than 7 days so the folder does not accumulate.
find "$DIR" -maxdepth 1 -type f ! -name GLOBAL -mtime +7 -delete 2>/dev/null || true

action="${1:-status}"
scope="${2:-session}"

state() {
  if [ -f "$GLOBAL" ]; then echo "OFF (global)"
  elif [ -n "$SID" ] && [ -f "$DIR/$SID" ]; then echo "OFF (this session)"
  else echo "ON"; fi
}

case "$action" in
  off)
    if [ "$scope" = "--global" ]; then : > "$GLOBAL"; echo "Style directive OFF globally."
    elif [ -z "$SID" ]; then echo "No CLAUDE_CODE_SESSION_ID. Use --global."; exit 1
    else : > "$DIR/$SID"; echo "Style directive OFF for this session."; fi ;;
  on)
    if [ "$scope" = "--global" ]; then rm -f "$GLOBAL"; echo "Global off cleared."
    else rm -f "$GLOBAL"; [ -n "$SID" ] && rm -f "$DIR/$SID"; echo "Style directive ON."; fi ;;
  status) echo "Style directive: $(state)" ;;
  *) echo "usage: style-toggle.sh {off|on|status} [--global]"; exit 2 ;;
esac
