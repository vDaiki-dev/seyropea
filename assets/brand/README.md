# Identidad visual de SeyroPea

Archivos:

- `seyropea-icon.svg`: **maestro vectorial**. Cuadrado redondeado oscuro, letra `S` en degradado naranja y guisante verde.
- `icon.png`: PNG 1024×1024 de referencia.
- `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png` (512), `icon.ico`, `icon.icns`: iconos usados por el bundle de Tauri.

## Regeneración

Requiere ImageMagick 7 (`magick`) y Python 3. No se descarga nada.

```bash
bash assets/brand/generate-icons.sh
```

El script reescribe todos los iconos a partir del SVG y verifica las salidas. Debe ejecutarse tras cualquier cambio en `seyropea-icon.svg`.

## Uso

Los iconos se incluyen en el binario mediante `bundle.icon` en `src-tauri/tauri.conf.json`. No hay iconos remotos ni fuentes CDN: la aplicación funciona sin conexión desde el primer arranque.

## Terceros

La marca es original del proyecto. Las bibliotecas incluidas localmente para exportación (UPNG.js y pako) son MIT; sus licencias están en `src/frontend/vendor/upng/`.
