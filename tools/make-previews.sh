#!/bin/sh
# Regenerates the start-menu pictures in img/ from the running app.
# Start the local server first (python3 -m http.server 8660), then run: sh tools/make-previews.sh
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="${1:-http://localhost:8660}"
PROFILE="$(mktemp -d)"   # throwaway profile: never touches your own Chrome
cd "$(dirname "$0")/.."
shot() { # synth, width, height, [page: studio.html for the StudioLab units]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFILE" \
    --default-background-color=00000000 --window-size="$2,$3" --virtual-time-budget=8000 \
    --screenshot="img/preview-$1.png" "$URL/${4:-}?synth=$1&preview=1" 2>/dev/null
  echo "img/preview-$1.png"
}
# a throwaway first shot: a cold Chrome sometimes captures an empty page the first time
shot nf1 1600 680 >/dev/null
shot nf1 1600 680
shot nf3 1600 940
shot nfm 1600 760
shot nfmod 1880 1080
shot nfc1 1360 540 studio.html
shot nf4 1680 680 studio.html
rm -rf "$PROFILE"
# new pictures: bump the version in the start menu so browsers do not keep showing the old ones
V=$(date +%Y%m%d%H%M)
sed -i '' "s/^const PREVIEW_VERSION = .*/const PREVIEW_VERSION = '$V';/" js/startMenu.js
echo "start menu pictures: version $V"
