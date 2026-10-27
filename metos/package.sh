#!/bin/sh
# Builds the folder to copy onto a USB stick: dist/METOS/
#
#   sh package.sh
#
# Needs: node (for build.js), zip, and the redbean program at
# server/bin/redbean.com (see server/README.md for where it comes from).
#
# The stick gets:
#   metos.com          double-click: starts metos and opens the browser
#   index.html + app   the fallback: open index.html in any browser
#   kb/                the knowledge, plain Markdown, readable with no program
#   CONTENTS.md        list of every entry
#   READ-ME-FIRST.txt  how to use the stick
set -e
cd "$(dirname "$0")"

REDBEAN=${REDBEAN:-server/bin/redbean.com}
if [ ! -f "$REDBEAN" ]; then
  echo "Missing $REDBEAN. See server/README.md." >&2
  exit 1
fi
command -v zip >/dev/null || { echo "The zip command is needed." >&2; exit 1; }

node build.js

OUT=dist/METOS
rm -rf dist
mkdir -p "$OUT"

# the app, as plain files (also the no-program fallback)
cp index.html app.js engine.js pic.js editor.js kb.js manifest.json sw.js vocab.txt CONTENTS.md "$OUT/"
cp -R fonts kb "$OUT/"
cp server/READ-ME-FIRST.txt "$OUT/"

# metos.com = redbean + the metos server script inside its zip
cp "$REDBEAN" "$OUT/metos.com"
chmod +x "$OUT/metos.com"
TMP=$(mktemp -d)
cp server/init.lua "$TMP/.init.lua"
(cd "$TMP" && zip -q -X "$OLDPWD/$OUT/metos.com" .init.lua)
rm -rf "$TMP"

echo "Ready: $OUT ($(du -sh "$OUT" | cut -f1)). Copy the METOS folder onto the stick."
