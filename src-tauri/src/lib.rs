pub mod codec;
pub mod commands;
pub mod fonts;
pub mod settings;
pub mod seyro;
pub mod themes;
pub mod updater;
pub mod wallpaper;

use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter};

fn item(app: &AppHandle, id: &str, text: &str) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItemBuilder::with_id(id, text).build(app)
}

fn build_menu(app: &AppHandle) -> tauri::Result<()> {
    let file = SubmenuBuilder::new(app, "Archivo")
        .item(&item(app, "file.new", "Nuevo\tCtrl+N")?)
        .item(&item(app, "file.open", "Abrir...\tCtrl+O")?)
        .item(&item(app, "file.openRecent", "Abrir recientes")?)
        .separator()
        .item(&item(app, "file.save", "Guardar proyecto\tCtrl+S")?)
        .item(&item(app, "file.saveAs", "Guardar como...\tCtrl+Shift+S")?)
        .item(&item(
            app,
            "file.export",
            "Exportar imagen...\tCtrl+Alt+Shift+S",
        )?)
        .separator()
        .item(&item(app, "file.close", "Cerrar documento\tCtrl+W")?)
        .item(&item(app, "file.quit", "Salir\tCtrl+Q")?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Editar")
        .item(&item(app, "edit.undo", "Deshacer\tCtrl+Z")?)
        .item(&item(app, "edit.redo", "Rehacer\tCtrl+Shift+Z")?)
        .separator()
        .item(&item(app, "edit.cut", "Cortar\tCtrl+X")?)
        .item(&item(app, "edit.copy", "Copiar\tCtrl+C")?)
        .item(&item(app, "edit.paste", "Pegar\tCtrl+V")?)
        .separator()
        .item(&item(
            app,
            "edit.transform",
            "Transformación libre\tCtrl+T",
        )?)
        .item(&item(
            app,
            "edit.preferences",
            "Preferencias, temas y fuentes\tCtrl+K",
        )?)
        .build()?;

    let image = SubmenuBuilder::new(app, "Imagen")
        .item(&item(app, "image.size", "Tamaño de imagen...")?)
        .item(&item(app, "image.canvas", "Tamaño de lienzo...")?)
        .separator()
        .item(&item(app, "image.rotateCW", "Rotar 90° horario")?)
        .item(&item(app, "image.rotateCCW", "Rotar 90° antihorario")?)
        .item(&item(app, "image.rotate180", "Rotar 180°")?)
        .item(&item(app, "image.flipH", "Voltear horizontal")?)
        .item(&item(app, "image.flipV", "Voltear vertical")?)
        .separator()
        .item(&item(app, "image.brightness", "Brillo / Contraste...")?)
        .item(&item(app, "image.hueSat", "Tono / Saturación...")?)
        .item(&item(app, "image.levels", "Niveles...")?)
        .item(&item(app, "image.exposure", "Exposición...")?)
        .item(&item(app, "image.invert", "Invertir")?)
        .item(&item(app, "image.desaturate", "Desaturar")?)
        .build()?;

    let layer = SubmenuBuilder::new(app, "Capa")
        .item(&item(app, "layer.new", "Nueva capa\tCtrl+Shift+N")?)
        .item(&item(app, "layer.duplicate", "Duplicar capa\tCtrl+J")?)
        .item(&item(app, "layer.delete", "Eliminar capa")?)
        .separator()
        .item(&item(
            app,
            "layer.mergeDown",
            "Combinar hacia abajo\tCtrl+E",
        )?)
        .item(&item(app, "layer.flatten", "Acoplar imagen")?)
        .item(&item(app, "layer.up", "Subir capa")?)
        .item(&item(app, "layer.down", "Bajar capa")?)
        .build()?;

    let filter = SubmenuBuilder::new(app, "Filtro")
        .item(&item(app, "filter.gaussian", "Desenfoque Gaussiano...")?)
        .item(&item(app, "filter.box", "Desenfoque de Caja...")?)
        .item(&item(app, "filter.unsharp", "Enfoque (Unsharp Mask)...")?)
        .item(&item(app, "filter.vignette", "Viñeta...")?)
        .item(&item(app, "filter.noise", "Ruido...")?)
        .item(&item(app, "filter.pixelate", "Pixelar...")?)
        .build()?;

    let view = SubmenuBuilder::new(app, "Vista")
        .item(&item(app, "view.zoomIn", "Acercar\tCtrl++")?)
        .item(&item(app, "view.zoomOut", "Alejar\tCtrl+-")?)
        .item(&item(app, "view.fit", "Ajustar a pantalla\tCtrl+0")?)
        .item(&item(app, "view.actual", "Píxeles reales\tCtrl+1")?)
        .separator()
        .item(&item(app, "view.rulers", "Reglas\tCtrl+R")?)
        .item(&item(app, "view.grid", "Cuadrícula\tCtrl+'")?)
        .item(&item(app, "view.guides", "Guías inteligentes")?)
        .build()?;

    let help = SubmenuBuilder::new(app, "Ayuda")
        .item(&item(app, "help.shortcuts", "Atajos de teclado")?)
        .item(&item(app, "help.update", "Buscar actualizaciones")?)
        .item(&item(app, "help.about", "Acerca de SeyroPea")?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&file, &edit, &image, &layer, &filter, &view, &help])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let _ = app.emit("menu-action", event.id().as_ref().to_string());
    });
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            build_menu(app.handle())?;
            let _ = app.emit(
                "app-ready",
                serde_json::json!({ "version": env!("CARGO_PKG_VERSION") }),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_image_file,
            commands::pick_project_file,
            commands::save_project_file,
            commands::save_export_file,
            commands::decode_image,
            commands::encode_image,
            commands::write_file,
            commands::save_project,
            commands::load_project,
            commands::load_settings,
            commands::save_settings,
            commands::save_theme_file,
            commands::list_theme_files,
            commands::list_fonts,
            commands::wallpaper_palette,
            commands::detect_wallpaper,
            commands::check_updates,
            commands::app_info,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar SeyroPea");
}
