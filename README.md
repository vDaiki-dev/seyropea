# SeyroPea

**Estudio de edición de imágenes de escritorio: nativo, ligero, gratuito, offline y sin IA.**

SeyroPea v0.1.0 es una aplicación de escritorio real construida con **Tauri v2** y **Canvas2D puro** (JavaScript sin frameworks ni bundler en runtime). El núcleo en Rust gestiona códecs, diálogos nativos, el formato `.seyro`, temas, fuentes, detección de fondo y actualizaciones opcionales.

> Sin cuentas, sin telemetría, sin CDNs, sin modelos generativos. La edición es 100% algorítmica y determinista sobre buffers RGBA.

---

## Características

- **Interfaz estilo Photoshop/Photopea**: barra de menú nativa, barra de opciones de herramienta, toolbar, pestañas de documento, reglas, cuadrícula, ajedrezado, panel de color, historial (≥50 pasos), capas con 15 modos de fusión y barra de estado.
- **Herramientas**: mover (`V`), transformar (`Ctrl+T`), marco (`M`), lazo (`L`), varita (`W`), recorte (`C`), cuentagotas (`I`), pincel (`B`), borrador (`E`), bote (`G`), texto editable (`T`), formas (`U`), mano (`H`) y zoom (`Z`).
- **Filtros y ajustes con vista previa en vivo y comparación**: desenfoque gaussiano y de caja, unsharp, viñeta, ruido determinista, pixelado, brillo/contraste, tono/saturación, niveles, exposición, invertir, desaturar, teñir y transformaciones (rotar/voltear).
- **Capas**: opacidad, visibilidad, bloqueo, duplicado, reordenación, combinación, acoplado y 15 modos Porter-Duff/Photoshop (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `luminosity`).
- **Historial eficiente**: los cambios de píxeles se guardan como parches acotados por *bounding box*; los cambios estructurales usan snapshots. Deshacer/rehacer y salto a cualquier paso.
- **Formato propio `.seyro` v1**: manifiesto JSON + capas RGBA8 comprimidas con DEFLATE. Sin pérdida y versionado. Ver [`docs/FORMAT_SEYRO.md`](docs/FORMAT_SEYRO.md).
- **Temas**: Seyro Dark Orange (por defecto), Dracula, Tokyo Night, Catppuccin Mocha, Nord, Gruvbox Dark y OLED Obsidian; clonación, edición, importación/exportación JSON y tema derivado del fondo de pantalla.
- **Fondo de pantalla**: detección best-effort en X11/Wayland/GNOME/KDE/Hyprland/swww/macOS/Windows, **siempre** con alternativa manual de imagen local. Paleta determinista por cuantización + k-means en HSL.
- **Fuentes del sistema** listadas por Rust; tamaño de UI ajustable y números monoespaciados.
- **Exportación**: PNG, JPEG, WebP y BMP. PNG optimizado con **UPNG.js + pako incluidos localmente** (MIT), con opción de cuantización sin pérdida o con número de colores.
- **Actualizaciones**: consulta opcional a GitHub Releases solo si está activada; si no hay red, falla en silencio.

## Requisitos

 Para ejecutar una compilación ya publicada no se instala Rust: se descarga el paquete de tu plataforma y se abre.

 Para compilar desde el código:

- Rust **1.90+** (se recomienda 1.100 o superior) con `rustup`.
- Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `pkg-config`, `build-essential`.
- macOS: Xcode Command Line Tools.
- Windows: MSVC Build Tools y WebView2.

## Compilación y ejecución

```bash
# Clonar
git clone https://github.com/vDaiki-dev/seyropea.git
cd seyropea

# Cargar Rust en la sesión actual
. "$HOME/.cargo/env"

# Verificación rápida
cargo check --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml

# Desarrollo (requiere tauri-cli: cargo install tauri-cli --version '^2')
cargo tauri dev

# Compilación de producción (genera installers en src-tauri/target/release/bundle)
cargo tauri build
```

El frontend se sirve desde `src/frontend`, dentro del binario. **No hay servidor web, npm install ni recursos remotos**.

## Atajos principales

| Tecla | Acción |
| --- | --- |
| `V M L W C I B E G T U H Z` | Herramientas |
| `Ctrl+N` / `Ctrl+O` | Nuevo documento / Abrir imagen |
| `Ctrl+S` / `Ctrl+Shift+S` | Guardar `.seyro` / Guardar como |
| `Ctrl+Alt+Shift+S` | Exportar imagen |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Deshacer / Rehacer |
| `Ctrl+T` | Transformación libre |
| `Ctrl+K` | Preferencias, temas y fuentes |
| `Ctrl+0` / `Ctrl+1` | Ajustar a pantalla / Píxeles reales |
| `Ctrl+R` / `Ctrl+'` | Reglas / Cuadrícula |
| `Espacio` | Mano temporal |

La lista completa está en **Ayuda → Atajos de teclado**.

## Arquitectura

Resumen (detalles en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

```
src-tauri/src/        Rust: codecs, .seyro, settings, temas, fuentes, wallpaper, updater, menú, IPC
src/frontend/         JavaScript + Canvas2D: documento, capas, historial, herramientas, filtros, UI
src/frontend/vendor/  UPNG.js + pako (MIT), incluidos localmente
assets/brand/         SVG maestro, iconos y script de regeneración
docs/                 Arquitectura, formato, hoja de ruta
.github/workflows/    CI y publicación multiplataforma
```

Registros extensibles: `ToolRegistry`, `FilterRegistry`, `BlendModeRegistry` (modos en `document.js`), `FormatCodecRegistry` (formatos en `codec.rs`/`filters.js`), `ThemeEngine` y `CommandHistory`.

## Licencias

- **SeyroPea**: GPL-3.0-only. Ver [`LICENSE`](LICENSE). Se eligió GPL-3.0 para garantizar que cualquier redistribución modificada mantenga el código abierto, coherente con el carácter comunitario del proyecto.
- **UPNG.js** y **pako**: MIT. sus textos están en `src/frontend/vendor/upng/`.
- El resto del stack (Tauri, crates Rust) mantiene sus licencias originales (MIT/Apache-2.0).

## Enlaces

- Repositorio: <https://github.com/vDaiki-dev/seyropea>
- Releases: <https://github.com/vDaiki-dev/seyropea/releases>
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Contribuciones: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Hoja de ruta: [`docs/ROADMAP.md`](docs/ROADMAP.md)
