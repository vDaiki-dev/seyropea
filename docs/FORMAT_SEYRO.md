# Formato `.seyro` v1

`.seyro` es el contenedor nativo de SeyroPea: autocontenido, versionado y sin pérdida. Está implementado en `src-tauri/src/seyro.rs` y validado por tests unitarios de ida y vuelta.

## Estructura binaria

| Offset | Tipo | Contenido |
| --- | --- | --- |
| `0..8` | bytes | Magic: `53 45 59 52 4f 76 31 00` (`SEYROv1\0`) |
| `8..12` | `u32 LE` | Longitud en bytes del manifiesto JSON UTF-8 |
| `12..12+N` | JSON | Manifiesto del documento y metadatos de capas |
| `12+N..` | por capa | `u64 LE` bytes RGBA sin comprimir, `u64 LE` bytes comprimidos, datos zlib/DEFLATE |

Los buffers de capa aparecen **en el mismo orden** que `manifest.layers`. Cada buffer es RGBA8, fila a fila, sin padding (`width * height * 4` bytes) y se comprime con zlib nivel 6.

## Manifiesto (v1)

```json
{
  "format": "seyro",
  "version": 1,
  "name": "Mi diseño",
  "width": 1200,
  "height": 800,
  "dpi": 72,
  "layers": [
    {
      "id": "layer-1",
      "name": "Fondo",
      "kind": "raster",
      "x": 0,
      "y": 0,
      "width": 1200,
      "height": 800,
      "opacity": 1.0,
      "blend": "normal",
      "visible": true,
      "locked": false,
      "dataLen": 3840000,
      "text": null,
      "shape": null
    }
  ]
}
```

- `kind`: `raster`, `text` o `shape`.
- `blend`: uno de los 15 modos soportados (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `luminosity`).
- `dataLen`: tamaño exacto del buffer RGBA sin comprimir. Se valida antes de escribir y al leer.
- `text`: cuando `kind === "text"`: `{ text, fontFamily, fontSize, weight, color, align, lineHeight }`.
- `shape`: cuando `kind === "shape"`: `{ shape, fill, stroke, strokeWidth, radius }`.

## Compatibilidad y versionado

- `format` y `version` se validan estrictamente. v0.2.0 solo acepta `seyro` y `1`.
- El magic incluye la versión principal para detectar de un vistazo si un archivo pertenece a otra generación.
- Versiones futuras pueden añadir campos opcionales al manifiesto; un lector v1 debe ignorar campos desconocidos y conservarlos si reescribe el archivo.
- La selección activa **no** se guarda en v1 (no forma parte del documento).

## Garantías

- Sin pérdida: RGBA8 exacto, sin cuantización.
- Determinista: el mismo documento produce el mismo manifiesto y la misma compresión.
- Validación: magic, `format`, `version`, longitudes, número de capas, `dataLen` y tamaño esperado `width*height*4`; la descompresión está acotada al tamaño declarado.

## Ejemplo de lectura desde Rust

```rust
use seyropea_lib::seyro;
let project = seyro::load(std::path::Path::new("diseno.seyro"))?;
println!("{}: {}×{}, {} capas",
    project.manifest.name, project.manifest.width,
    project.manifest.height, project.manifest.layers.len());
```
