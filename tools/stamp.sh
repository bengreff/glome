#!/bin/sh
# Stamp every module URL with a fresh version so browsers never mix cached and new files after a deploy
# (GitHub Pages serves everything with a 10-minute cache). Run before committing a release.
cd "$(dirname "$0")/.." || exit 1
v=$(date +%Y%m%d%H%M%S)
sed -i '' -E "s#(src=\"js/main\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#" index.html
for f in js/*.js; do
  sed -i '' -E "s#(from '\./[a-z-]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g; s#(new URL\('\./terrain-worker\.js)(\?v=[0-9]+)?'#\1?v=$v'#g" "$f"
done
echo "stamped $v"
