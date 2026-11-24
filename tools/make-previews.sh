#!/bin/sh
# Regenerates the start-menu pictures in img/ from the running app.
# Start the local server first (python3 -m http.server 8660), then run: sh tools/make-previews.sh
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="${1:-http://localhost:8660}"
PROFILE="$(mktemp -d)"   # throwaway profile: never touches your own Chrome
cd "$(dirname "$0")/.."
shot() { # synth, width, height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFILE" \
    --default-background-color=00000000 --window-size="$2,$3" --virtual-time-budget=4000 \
    --screenshot="img/preview-$1.png" "$URL/?synth=$1&preview=1" 2>/dev/null
  echo "img/preview-$1.png"
}
shot nf1 1600 680
shot nf3 1600 940
shot nfm 1600 760
shot nfmod 1600 1120
rm -rf "$PROFILE"
