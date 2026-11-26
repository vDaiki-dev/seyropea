# Changelog

Todos los cambios notables de SeyroPea se documentan aquí. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado [Semantic Versioning](https://semver.org/lang/es/).

## [0.2.0] — 2026-11-25

### Añadido

- Componentes reutilizables `Toast`, `Modal`, `Tooltip`, `Badge` y `SkeletonLoader` en `src/frontend/components.js`, integrados en la UI.
- `SkeletonLoader` inspirado en DIVAE: matriz de puntos de tres tamaños, secuencia determinista, colores del tema y soporte de `prefers-reduced-motion`.
- Módulos puros de validación `src/frontend/security.js` y `src-tauri/src/security.rs` con pruebas deterministas.
- CSP estricto en `tauri.conf.json`, capacidades Tauri reducidas a eventos y diálogos, y drag&drop desactivado sin handler.

### Cambiado

- Bump de versión a `0.2.0` en backend, config, frontend, About, temas exportados y mensajes de formato.
- Los IDs de capa y los nombres de temas/importaciones se normalizan antes de renderizarse; las plantillas escapan texto y atributos.
- `settings.json` se normaliza y acota en Rust y en el frontend; los recientes se validan como rutas absolutas `.seyro`.
- `open_url` usa parseo de URL con host permitido y `Command` sin shell en Windows/Linux/macOS.
- Los comandos IPC validan rutas, extensiones y longitudes antes de cualquier E/S.

### Corregido

- Cadena XSS persistente desde IDs de capa de un `.seyro` hasta IPC de escritura arbitraria.
- Bomba de descompresión y OOM al abrir `.seyro` manipulados: longitud verificada antes de reservar, `take()` sobre el decoder y validación de `format`.
- Decodificación de imágenes con límites de dimensiones y asignación antes de `to_rgba8()`.
- Pantalla de error de arranque sin `innerHTML` ni volcados de stack; errores de settings silenciosos.

[0.2.0]: https://github.com/vDaiki-dev/seyropea/releases/tag/v0.2.0

## [0.1.0] — 2026-11-25

### Añadido

- Aplicación de escritorio Tauri v2 con backend Rust y frontend Canvas2D sin frameworks.
- Menú nativo en español (Archivo, Editar, Imagen, Capa, Filtro, Vista, Ayuda) y atajos de teclado.
- Herramientas: mover, transformar, marco, lazo, varita, recorte, cuentagotas, pincel, borrador, bote, texto, formas, mano y zoom.
- 15 modos de fusión, opacidad, visibilidad, bloqueo, duplicado y reordenación de capas.
- 18 operaciones deterministas: filtros, ajustes tonales y transformaciones, con vista previa y comparación.
- Historial reversible con parches por bounding box y snapshots estructurales (≥50 pasos).
- Formato nativo `.seyro` v1 con manifiesto JSON y capas RGBA8 comprimidas con DEFLATE.
- Exportación PNG/JPEG/WebP/BMP; PNG optimizado con UPNG.js + pako incluidos localmente.
- ThemeEngine con 7 temas integrados, edición, clonado, importación/exportación JSON y paleta derivada del fondo de pantalla.
- Detección best-effort de wallpaper en GNOME/KDE/Hyprland/swww y macOS/Windows, con selector manual.
- Listado de fuentes del sistema, escala de UI y persistencia local de preferencias.
- Actualización opcional desde GitHub Releases con fallo silencioso offline.
- Iconografía propia (SVG maestro + PNG/ICO/ICNS) con script de regeneración.
- CI y workflows de release multiplataforma con SHA256.
- Documentación: README, arquitectura, formato, roadmap, contribuciones y licencia GPL-3.0-only.

### Notas

- Primera versión pública. No incluye soporte PSD, APNG ni transformación warp; ver `docs/ROADMAP.md`.

[0.1.0]: https://github.com/vDaiki-dev/seyropea/releases/tag/v0.1.0
