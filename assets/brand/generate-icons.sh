#!/usr/bin/env bash
# Regenera todos los iconos de SeyroPea a partir del SVG maestro.
# Requiere ImageMagick 7 (`magick`) y Python 3. No descarga nada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SVG="$ROOT/assets/brand/seyropea-icon.svg"
OUT="$ROOT/src-tauri/icons"
mkdir -p "$OUT" "$ROOT/assets/brand"

magick -background none "$SVG" -resize 1024x1024 "$ROOT/assets/brand/icon.png"
magick "$ROOT/assets/brand/icon.png" -resize 32x32 "$OUT/32x32.png"
magick "$ROOT/assets/brand/icon.png" -resize 128x128 "$OUT/128x128.png"
magick "$ROOT/assets/brand/icon.png" -resize 256x256 "$OUT/128x128@2x.png"
magick "$ROOT/assets/brand/icon.png" -resize 512x512 "$OUT/icon.png"
magick "$ROOT/assets/brand/icon.png" -define icon:auto-resize=256,128,64,48,32,16 "$OUT/icon.ico"

python3 - "$ROOT/assets/brand/icon.png" "$OUT/icon.icns" <<'PY'
import struct, sys
png = open(sys.argv[1], 'rb').read()
# ICNS: entradas PNG (ic07=128, ic08=256, ic09=512, ic10=1024).
# Reutilizamos el PNG maestro para todas las entradas; macOS escala según contexto.
types = [b'ic07', b'ic08', b'ic09', b'ic10']
entries = b''.join(t + struct.pack('>I', 8 + len(png)) + png for t in types)
blob = b'icns' + struct.pack('>I', 8 + len(entries)) + entries
open(sys.argv[2], 'wb').write(blob)
print(f"icon.icns: {len(blob)} bytes")
PY

ls -lh "$OUT" "$ROOT/assets/brand/icon.png"
