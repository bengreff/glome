#!/bin/sh
# Serve the game locally at http://127.0.0.1:8650/
cd "$(dirname "$0")/.." && exec python3 -m http.server 8650 --bind 127.0.0.1
