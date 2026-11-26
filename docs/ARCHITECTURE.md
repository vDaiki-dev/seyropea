# Arquitectura de SeyroPea v0.2.0

## 1. Objetivo y restricciones

- Aplicación **de escritorio real**, ligera, arranque objetivo < 1.5 s y consumo moderado de RAM/CPU.
- **100% offline en producción**: sin HTTP obligatorio, sin fuentes CDN, sin iconos remotos, sin telemetría.
- **Sin IA generativa**: todo el procesamiento es algorítmico y determinista (convolución, curvas, histogramas/cuantización, modos Porter-Duff/Photoshop, máscaras, transformaciones afines).
- Multiplataforma: Linux (AppImage, .deb), Windows (.msi, .exe) y macOS (.dmg, .app).
- Extensibilidad modular mediante registros: herramientas, filtros, modos de fusión, códecs, temas e historial.

## 2. Decisión de stack: Tauri v2 vs Rust/C++ nativo

Se evaluaron tres alternativas:

| Alternativa | Ventajas | Coste / riesgo | Resultado |
| --- | --- | --- | --- |
| **Tauri v2.12.7 (elegida)** | Rust para núcleo y sistemas; webview del SO para UI densa; packaging maduro con GitHub Actions; binario pequeño; menús y diálogos nativos; sin React/Vite en runtime; frontend servido desde el propio binario. | La webview añade memoria base y una capa IPC; requiere `withGlobalTauri` y una capa delgada de JS. | **Elegida.** Permite llegar a v0.1.0 con UI completa de editor sin reimplementar widgets, layout, eventos de puntero ni tipografía desde cero. |
| Rust nativo puro (e.g. `egui`/`iced`) | Máximo control de memoria y arranque; sin webview. | Ecosystem de widgets insuficiente para una UI tipo Photoshop (menús nativos ricos, paneles complejos, texto editable, reglas, tabs). Coste de implementación muy alto para v0.1.0. | Descartado para v0.1.0; candidato para un modo "ultraligero" futuro. |
| C++ nativo (Qt/GTK) | Rendimiento y control total; GTK/Qt son maduros. | Build matrix y dependencias de sistema más pesadas; licencias y complejidad de distribución; ciclo de desarrollo más lento. | Descartado: Tauri ofrece el mismo packaging multi-OS con menos fricción. |

La webview **no convierte SeyroPea en una web app**: no hay URL remota, servidor, navegador externo ni descarga de assets. `build.frontendDist` apunta a `../src/frontend`, que Tauri incrusta en el ejecutable.

### Versiones fijadas

- `tauri = 2.12.7`, `tauri-build = 2.7.6`, `tauri-plugin-dialog = 2.8.4`.
- `image = 0.25.10` (PNG/JPEG/WebP/BMP/TIFF), `flate2 = 1` (DEFLATE/zlib), `serde`/`serde_json`, `dirs = 7`, `ureq = 3.5.2` con rustls, `url = 2.5` para validar URLs en `open_url`.
- Rust mínimo declarado: **1.90**; verificado con 1.100.0.

## 3. Estructura

```
src-tauri/src/
  main.rs         Punto de entrada; windows_subsystem en release.
  lib.rs          Builder de Tauri, menú nativo y registro de comandos IPC.
  commands.rs     Comandos invocados desde JS (diálogos, codecs, settings, .seyro, etc.).
  security.rs     Validación pura de rutas, IDs, colores, dimensiones y tamaños de buffer.
  codec.rs        Decodificación/codificación RGBA8 con límites y miniaturas PNG en base64.
  seyro.rs        Contenedor .seyro v1: manifiesto validado + capas zlib acotadas.
  settings.rs     settings.json normalizado, sobrescritura de temas, archivos de tema.
  themes.rs       Extracción determinista de paleta (cuantización + k-means en HSL).
  fonts.rs        Fuentes instaladas en el sistema, sin red.
  wallpaper.rs    Detección best-effort por compositor/SO.
  updater.rs      GitHub Releases opcional, con timeouts cortos y fallo silencioso.

src/frontend/
  main.js         Bootstrap.
  editor.js       Controlador: documentos, historial, menú/atajos, exportación.
  document.js     Modelo de documento/capas, composición, selección, serialización.
  history.js      CommandHistory con parches y snapshots.
  tools.js        ToolRegistry con 14 herramientas (incluida la cubeta).
  filters.js      FilterRegistry con 18 operaciones deterministas.
  theme.js        ThemeEngine: temas, personalización, wallpaper → paleta.
  ui.js           Canvas2D, paneles, diálogos y atajos.
  components.js   Toast, Modal, Tooltip, Badge y SkeletonLoader (matriz de puntos, theme-aware).
  security.js     Sanitización de texto, IDs, rutas, colores, thumbnails y settings.
  api.js / util.js
  vendor/upng/    UPNG.js + pako (MIT), carga local bajo demanda.
```

## 4. Flujo de datos

1. **Entrada**: un diálogo nativo devuelve una ruta; Rust decodifica el archivo a RGBA8 y lo envía a JS como base64.
2. **Edición**: JS mantiene un `<canvas>` por capa. Cada herramienta modifica el `ImageData` de la capa activa; la vista compone todas las capas en un canvas offscreen y lo dibuja escalado con el zoom/pan actual.
3. **Historial**: antes de cada cambio se conserva el buffer previo. Al terminar, `diffRect` calcula el rectángulo mínimo modificado y se almacenan solo esos bytes (patch `pixels`). Las operaciones estructurales (capas, recorte, rotación) guardan snapshots completos.
4. **Salida**: JS construye el manifiesto `.seyro` y llama a Rust, que comprime cada capa con zlib y escribe el contenedor. Para exportar PNG optimizado se usa UPNG.js local; el resto de formatos se codifican en Rust.

## 5. Modos de fusión

`document.js` mapea los 15 modos a `globalCompositeOperation` de Canvas2D, que implementa Porter-Duff y modos de Photoshop de forma nativa y determinista. Las capas se dibujan en orden de abajo hacia arriba con `globalAlpha = opacity`.

## 6. Determinismo y sin IA

- El ruido usa `mulberry32` con semilla fija (`0x5eed1234`).
- La paleta derivada del fondo usa bins de color 8×8×8 como semillas, **12 iteraciones fijas** de k-means y orden estable por peso; la misma imagen produce siempre la misma paleta.
- No se usa ningún modelo, inferencia, peso neuronales ni llamada a servicios externos para procesar píxeles.

## 7. Offline y seguridad

- CSP estricto: `default-src 'self'`, `script-src 'self'`, `connect-src` limitado a IPC local, `object-src 'none'` y `base-uri 'none'`. No hay CDNs ni orígenes remotos; la frontend es solo `tauri://localhost`/assets incrustados.
- Capacidades mínimas: `core:event:allow-listen`, `core:event:allow-unlisten`, `dialog:allow-open` y `dialog:allow-save`. El menú nativo se construye en Rust y no requiere permisos del frontend; drag&drop está desactivado.
- `open_url` valida esquema, host y credenciales con `url::Url`, permite solo el repositorio del proyecto o `localhost` y lanza el navegador sin `cmd /c start`.
- Todas las rutas que llegan por IPC se comprueban como absolutas, sin traversal y con la extensión esperada; `write_file` solo acepta formatos de imagen.
- IDs de capa/tema y nombres visibles se normalizan en ambos lados de la frontera; el visor de README y los tooltips usan texto, no HTML arbitrario.
- `.seyro`: `format`/`version` validados, longitudes comprobadas antes de reservar buffers, `ZlibDecoder::take(raw_len + 1)` y límite de capas; las imágenes se decodifican con `image::Limits`.
- Settings y temas se normalizan y acotan antes de persistirse en `dirs::config_dir()/seyropea`; los errores de archivos corruptos son silenciosos y no sustituyen la UI por HTML.
- La updater tiene timeouts de 3–5 s y su fallo se ignora; nunca bloquea el arranque.

## 8. Rendimiento

- Un `<canvas>` por capa evita recomponer desde píxeles en cada frame; la composición se cachea hasta que una capa cambia (`_compositeDirty`).
- `requestAnimationFrame` coordina el dibujo; el pincel agrupa trazos en un canvas temporal y aplica la máscara de selección una sola vez.
- El historial de píxeles almacena solo regiones cambiadas; el de operaciones estructurales usa snapshots comprimibles en memoria.
- Perfil de release con `lto = "thin"`, `codegen-units = 1`, `panic = "abort"` y `strip = true`.

## 9. Puntos de extensión

- Añadir herramienta: `ToolRegistry.register({ id, key, label, options, onDown, onMove, onUp })`.
- Añadir filtro: `FilterRegistry.register({ id, label, defaults, controls, apply })`.
- Añadir formato de exportación: ampliar `codec.rs` y `save_export_file` en `commands.rs`.
- Añadir tema: entrada en `BUILTIN_THEMES` o importación JSON en `ThemeEngine`.

## 10. Limitaciones de v0.2.0

- No hay soporte PSD (evaluado para roadmap, ver `ROADMAP.md`).
- La transformación libre cubre traslación, escala y rotación; aún no incluye deformación por persistencia (*warp*).
- La detección de fondo depende de lo que exponga cada compositor; siempre existe el fallback manual.
- El historial de selección no se registra como paso reversible (comportamiento habitual en editores).
