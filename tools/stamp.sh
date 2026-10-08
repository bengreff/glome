#!/bin/sh
# Stamp every module URL with a fresh version so browsers never mix cached and new files after a deploy
# (GitHub Pages serves everything with a 10-minute cache). Run before committing a release.
# The page loads its modules through an import map in index.html that maps each js/*.js to js/*.js?v=<version>,
# so the module files themselves keep plain imports. Workers don't see import maps, so the terrain worker's
# import chain (terrain-worker.js -> world.js -> noise.js, laws.js) is stamped in place.
cd "$(dirname "$0")/.." || exit 1
v=$(date +%Y%m%d%H%M%S)
map=$(for f in js/*.js; do printf '"./%s": "./%s?v=%s", ' "$f" "$f" "$v"; done | sed 's/, $//')
sed -i '' -E "s#<script type=\"importmap\">.*</script>#<script type=\"importmap\">{\"imports\": {$map}}</script>#" index.html
sed -i '' -E "s#(src=\"js/main\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#" index.html
for f in js/terrain-worker.js js/world.js js/noise.js; do
  sed -i '' -E "s#(from '\./[a-z0-9-]+\.js)(\?v=[0-9]+)?'#\1?v=$v'#g" "$f"
done
echo "stamped $v"
