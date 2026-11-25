# Contribuir a SeyroPea

Gracias por tu interés. SeyroPea es un proyecto GPL-3.0-only; cualquier contribución se acepta bajo esa misma licencia.

## 1. Preparar el entorno

```bash
git clone https://github.com/vDaiki-dev/seyropea.git
cd seyropea
. "$HOME/.cargo/env"            # si usas rustup
rustc --version                  # >= 1.90
```

Dependencias de sistema en Linux:

```bash
sudo pacman -S webkit2gtk-4.1 gtk3 libayatana-appindicator librsvg openssl base-devel
# En Debian/Ubuntu:
# sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config build-essential
```

Para la CLI de Tauri:

```bash
cargo install tauri-cli --version '^2'
```

## 2. Verificación antes de abrir un PR

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Para el frontend (no hay npm install):

```bash
cd src/frontend
for f in *.js; do node --check "$f"; done
cd ..
node tests/frontend.test.mjs
```

Las pruebas frontend son puras: no necesitan navegador ni `npm install`. Comprueban el determinismo de los 18 filtros, utilidades RGBA/HSL y el historial.

Y una prueba manual de arranque:

```bash
cargo tauri dev
```

## 3. Estilo

- Rust: `rustfmt` por defecto; comentarios en español; errores `Result<T, String>` con mensajes descriptivos para el usuario.
- JavaScript: módulos ES sin bundler, sin dependencias npm en runtime, `camelCase`, sin frameworks. Nada de CDNs.
- Commits semánticos: `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `refactor:`, `test:`.
- No añadir inteligencia artificial generativa, modelos ni llamadas de red obligatorias. Todo procesamiento debe ser determinista y local.

## 4. Añadir funcionalidad

- **Herramienta**: regístrala en `ToolRegistry` (`src/frontend/tools.js`).
- **Filtro**: regístralo en `FilterRegistry` (`src/frontend/filters.js`) con `defaults`, `controls` y `apply(ImageData, params)`.
- **Formato**: amplía `codec.rs` y la lista de filtros en `save_export_file` (`commands.rs`).
- **Tema**: añade una entrada a `BUILTIN_THEMES` en `theme.js`.
- **Comando IPC**: implementa `#[tauri::command]` y regístralo en `generate_handler!` (`lib.rs`).

Toda función nueva de procesamiento de imagen debe incluir un test determinista (Rust o JS puro).

## 5. Reportar bugs

Abre un issue con:

1. Versión de SeyroPea y sistema operativo.
2. Pasos para reproducir.
3. Comportamiento esperado y observado.
4. Si es posible, un archivo `.seyro` mínimo que lo reproduzca (sin datos personales).

## 6. Licencia

Al enviar un PR confirmas que tu contribución se distribuye bajo **GPL-3.0-only**, igual que el proyecto. Las bibliotecas incluidas (UPNG.js, pako) mantienen su licencia MIT y sus textos en `src/frontend/vendor/upng/`.
