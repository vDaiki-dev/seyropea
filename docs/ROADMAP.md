# Hoja de ruta de SeyroPea

## v0.1.0 — Fundación (publicada)

- [x] Tauri v2 + Canvas2D, menú nativo y atajos.
- [x] Capas, 15 modos de fusión, selecciones y herramientas esenciales.
- [x] Filtros/ajustes deterministas con preview y comparación.
- [x] Historial eficiente y formato `.seyro` v1.
- [x] Temas, wallpaper → paleta y fuentes del sistema.
- [x] Exportación local (UPNG.js/pako) y CI/CD multiplataforma.

## v0.2.0 — Edición avanzada

- [ ] Máscaras de capa y recorte a grupo (*clipping mask*).
- [ ] Transformación con persistencia (*warp*) y perspectiva.
- [ ] Pinceles parametrizables (forma, textura, dinámica de presión) y estabilizador de trazo.
- [ ] Ajustes no destructivos con pila reordenable (por encima de la capa).
- [ ] Selección por color global y refinement de bordes.
- [ ] Historial con miniaturas y ramas.

## v0.3.0 — Compatibilidad de formatos

- [ ] Lectura/escritura PSD mediante `ag-psd` local (MIT), con capas y texto básico.
- [ ] TIFF/EXIF completo con **UTIF.js** local (MIT) y perfiles ICC.
- [ ] APNG y GIF animados mediante UPNG.js/UZIP.js locales.
- [ ] Importación de fuentes TTF/OTF y renderizado tipográfico preciso con **Typr.js** local (MIT).
- [ ] Formato `.seyro` v2: metadatos ICC, guías y ajustes no destructivos.

## v0.4.0 — Productividad

- [ ] Espacio de trabajo personalizable y atajos configurables.
- [ ] Grabación y reproducción de macros deterministas (sin IA).
- [ ] Gestor de recursos locales (pinceles, gradientes, patrones, temas).
- [ ] Comparación lado a lado y vista de lupa sincronizada.
- [ ] Perfiles de color y gestion de precision de 16 bit por canal.

## v1.0.0 — Estabilidad

- [ ] Auditoría de rendimiento y objetivo de arranque < 1.5 s verificado en CI.
- [ ] Pruebas E2E multiplataforma de los flujos principales.
- [ ] Traducciones completas (español base, inglés, portugués).
- [ ] Política de compatibilidad y migración de formatos.

## Bibliotecas del creador de Photopea evaluadas

El perfil oficial <https://github.com/photopea?tab=repositories> publica ~30% del código base como bibliotecas MIT. Evaluación para este proyecto:

| Librería | Licencia | Decisión |
| --- | --- | --- |
| **UPNG.js** | MIT | **Integrada en v0.1.0** para exportación PNG optimizada/cuantizada, cargada bajo demanda desde el bundle local. |
| **pako** | MIT | **Integrada en v0.1.0** como dependencia de compresión de UPNG.js (local). |
| UTIF.js | MIT | Roadmap v0.3.0: TIFF/EXIF avanzado y perfiles ICC. Hoy `image` (Rust) cubre TIFF básico. |
| Typr.js | MIT | Roadmap v0.3.0: tipografía TTF/OTF precisa. Hoy se usan fuentes del sistema vía Canvas2D. |
| UZIP.js | MIT | Roadmap v0.3.0: contenedores ZIP/APNG. Hoy `.seyro` usa zlib directo en Rust. |
| UTEX.js | MIT | No previsto: texturas comprimidas no son un objetivo del editor. |

Toda biblioteca integrada se vendoriza en el repositorio con su licencia; **nunca** se carga desde un CDN.
