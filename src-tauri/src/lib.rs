pub mod codec;
pub mod commands;
pub mod fonts;
pub mod security;
pub mod settings;
pub mod seyro;
pub mod themes;
pub mod updater;
pub mod wallpaper;

use std::collections::HashMap;

use serde_json::Value;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter};

const MENU_ES: &[(&str, &str)] = &[
    ("menu.file", "Archivo"),
    ("menu.edit", "Editar"),
    ("menu.image", "Imagen"),
    ("menu.layer", "Capa"),
    ("menu.filter", "Filtro"),
    ("menu.view", "Vista"),
    ("menu.help", "Ayuda"),
    ("file.new", "Nuevo\tCtrl+N"),
    ("file.open", "Abrir...\tCtrl+O"),
    ("file.openRecent", "Abrir recientes"),
    ("file.save", "Guardar proyecto\tCtrl+S"),
    ("file.saveAs", "Guardar como...\tCtrl+Shift+S"),
    ("file.export", "Exportar imagen...\tCtrl+Alt+Shift+S"),
    ("file.close", "Cerrar documento\tCtrl+W"),
    ("file.quit", "Salir\tCtrl+Q"),
    ("edit.undo", "Deshacer\tCtrl+Z"),
    ("edit.redo", "Rehacer\tCtrl+Shift+Z"),
    ("edit.cut", "Cortar\tCtrl+X"),
    ("edit.copy", "Copiar\tCtrl+C"),
    ("edit.paste", "Pegar\tCtrl+V"),
    ("edit.transform", "Transformación libre\tCtrl+T"),
    ("edit.preferences", "Preferencias, temas e idioma\tCtrl+K"),
    ("image.size", "Tamaño de imagen..."),
    ("image.canvas", "Tamaño de lienzo..."),
    ("image.rotateCW", "Rotar 90° horario"),
    ("image.rotateCCW", "Rotar 90° antihorario"),
    ("image.rotate180", "Rotar 180°"),
    ("image.flipH", "Voltear horizontal"),
    ("image.flipV", "Voltear vertical"),
    ("image.brightness", "Brillo / Contraste..."),
    ("image.hueSat", "Tono / Saturación..."),
    ("image.levels", "Niveles..."),
    ("image.exposure", "Exposición..."),
    ("image.invert", "Invertir"),
    ("image.desaturate", "Desaturar"),
    ("layer.new", "Nueva capa\tCtrl+Shift+N"),
    ("layer.duplicate", "Duplicar capa\tCtrl+J"),
    ("layer.delete", "Eliminar capa"),
    ("layer.mergeDown", "Combinar hacia abajo\tCtrl+E"),
    ("layer.flatten", "Acoplar imagen"),
    ("layer.up", "Subir capa"),
    ("layer.down", "Bajar capa"),
    ("filter.gaussian", "Desenfoque Gaussiano..."),
    ("filter.box", "Desenfoque de Caja..."),
    ("filter.unsharp", "Enfoque (Unsharp Mask)..."),
    ("filter.vignette", "Viñeta..."),
    ("filter.noise", "Ruido..."),
    ("filter.pixelate", "Pixelar..."),
    ("view.home", "Inicio / editor\tEsc"),
    ("view.zoomIn", "Acercar\tCtrl++"),
    ("view.zoomOut", "Alejar\tCtrl+-"),
    ("view.fit", "Ajustar a pantalla\tCtrl+0"),
    ("view.actual", "Píxeles reales\tCtrl+1"),
    ("view.rulers", "Reglas\tCtrl+R"),
    ("view.grid", "Cuadrícula\tCtrl+'"),
    ("view.guides", "Guías inteligentes"),
    ("help.shortcuts", "Atajos de teclado"),
    ("help.readme", "Ver README local"),
    ("help.github", "Proyecto en GitHub"),
    ("help.update", "Buscar actualizaciones"),
    ("help.about", "Acerca de SeyroPea"),
];

const MENU_EN: &[(&str, &str)] = &[
    ("menu.file", "File"),
    ("menu.edit", "Edit"),
    ("menu.image", "Image"),
    ("menu.layer", "Layer"),
    ("menu.filter", "Filter"),
    ("menu.view", "View"),
    ("menu.help", "Help"),
    ("file.new", "New\tCtrl+N"),
    ("file.open", "Open...\tCtrl+O"),
    ("file.openRecent", "Open recent"),
    ("file.save", "Save project\tCtrl+S"),
    ("file.saveAs", "Save as...\tCtrl+Shift+S"),
    ("file.export", "Export image...\tCtrl+Alt+Shift+S"),
    ("file.close", "Close document\tCtrl+W"),
    ("file.quit", "Quit\tCtrl+Q"),
    ("edit.undo", "Undo\tCtrl+Z"),
    ("edit.redo", "Redo\tCtrl+Shift+Z"),
    ("edit.cut", "Cut\tCtrl+X"),
    ("edit.copy", "Copy\tCtrl+C"),
    ("edit.paste", "Paste\tCtrl+V"),
    ("edit.transform", "Free transform\tCtrl+T"),
    (
        "edit.preferences",
        "Preferences, themes and language\tCtrl+K",
    ),
    ("view.home", "Home / editor\tEsc"),
    ("help.shortcuts", "Keyboard shortcuts"),
    ("help.readme", "View local README"),
    ("help.github", "Project on GitHub"),
    ("help.update", "Check for updates"),
    ("help.about", "About SeyroPea"),
];

const MENU_PT: &[(&str, &str)] = &[
    ("menu.file", "Arquivo"),
    ("menu.edit", "Editar"),
    ("menu.image", "Imagem"),
    ("menu.layer", "Camada"),
    ("menu.filter", "Filtro"),
    ("menu.view", "Exibir"),
    ("menu.help", "Ajuda"),
    ("file.new", "Novo\tCtrl+N"),
    ("file.open", "Abrir...\tCtrl+O"),
    ("file.openRecent", "Abrir recentes"),
    ("file.save", "Salvar projeto\tCtrl+S"),
    ("file.saveAs", "Salvar como...\tCtrl+Shift+S"),
    ("file.export", "Exportar imagem...\tCtrl+Alt+Shift+S"),
    ("file.close", "Fechar documento\tCtrl+W"),
    ("file.quit", "Sair\tCtrl+Q"),
    ("edit.undo", "Desfazer\tCtrl+Z"),
    ("edit.redo", "Refazer\tCtrl+Shift+Z"),
    ("view.home", "Início / editor\tEsc"),
    ("help.shortcuts", "Atalhos de teclado"),
    ("help.readme", "Ver README local"),
    ("help.github", "Projeto no GitHub"),
    ("help.update", "Buscar atualizações"),
    ("help.about", "Sobre o SeyroPea"),
];

const MENU_HI: &[(&str, &str)] = &[
    ("menu.file", "फ़ाइल"),
    ("menu.edit", "संपादन"),
    ("menu.view", "दृश्य"),
    ("menu.help", "सहायता"),
    ("file.new", "नया\tCtrl+N"),
    ("file.open", "खोलें\tCtrl+O"),
    ("view.home", "होम / एडिटर\tEsc"),
    ("help.shortcuts", "कीबोर्ड शॉर्टकट"),
    ("help.readme", "स्थानीय README देखें"),
    ("help.github", "GitHub पर प्रोजेक्ट"),
    ("help.about", "SeyroPea के बारे में"),
];

const MENU_RU: &[(&str, &str)] = &[
    ("menu.file", "Файл"),
    ("menu.edit", "Правка"),
    ("menu.image", "Изображение"),
    ("menu.layer", "Слой"),
    ("menu.filter", "Фильтр"),
    ("menu.view", "Вид"),
    ("menu.help", "Справка"),
    ("file.new", "Новый\tCtrl+N"),
    ("file.open", "Открыть...\tCtrl+O"),
    ("file.save", "Сохранить проект\tCtrl+S"),
    ("edit.undo", "Отменить\tCtrl+Z"),
    ("edit.redo", "Повторить\tCtrl+Shift+Z"),
    ("view.home", "Главная / редактор\tEsc"),
    ("help.shortcuts", "Горячие клавиши"),
    ("help.readme", "Открыть локальный README"),
    ("help.github", "Проект на GitHub"),
    ("help.about", "О SeyroPea"),
];

const MENU_ZH: &[(&str, &str)] = &[
    ("menu.file", "文件"),
    ("menu.edit", "编辑"),
    ("menu.image", "图像"),
    ("menu.layer", "图层"),
    ("menu.filter", "滤镜"),
    ("menu.view", "视图"),
    ("menu.help", "帮助"),
    ("file.new", "新建\tCtrl+N"),
    ("file.open", "打开...\tCtrl+O"),
    ("file.save", "保存项目\tCtrl+S"),
    ("edit.undo", "撤销\tCtrl+Z"),
    ("edit.redo", "重做\tCtrl+Shift+Z"),
    ("view.home", "首页 / 编辑器\tEsc"),
    ("help.shortcuts", "键盘快捷键"),
    ("help.readme", "查看本地 README"),
    ("help.github", "GitHub 项目"),
    ("help.about", "关于 SeyroPea"),
];

const MENU_FR: &[(&str, &str)] = &[
    ("menu.file", "Fichier"),
    ("menu.edit", "Édition"),
    ("menu.view", "Affichage"),
    ("menu.help", "Aide"),
    ("view.home", "Accueil / éditeur\tEsc"),
    ("help.readme", "Voir le README local"),
    ("help.github", "Projet sur GitHub"),
];

const MENU_DE: &[(&str, &str)] = &[
    ("menu.file", "Datei"),
    ("menu.edit", "Bearbeiten"),
    ("menu.view", "Ansicht"),
    ("menu.help", "Hilfe"),
    ("view.home", "Start / Editor\tEsc"),
    ("help.readme", "Lokale README anzeigen"),
    ("help.github", "Projekt auf GitHub"),
];

const MENU_JA: &[(&str, &str)] = &[
    ("menu.file", "ファイル"),
    ("menu.edit", "編集"),
    ("menu.view", "表示"),
    ("menu.help", "ヘルプ"),
    ("view.home", "ホーム / エディター\tEsc"),
    ("help.readme", "ローカル README を見る"),
    ("help.github", "GitHub のプロジェクト"),
];

const MENU_AR: &[(&str, &str)] = &[
    ("menu.file", "ملف"),
    ("menu.edit", "تحرير"),
    ("menu.view", "عرض"),
    ("menu.help", "مساعدة"),
    ("view.home", "الرئيسية / المحرر\tEsc"),
    ("help.readme", "عرض README المحلي"),
    ("help.github", "المشروع على GitHub"),
];

fn menu_labels(locale: &str) -> HashMap<String, String> {
    let mut labels: HashMap<String, String> = MENU_ES
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect();
    let overrides: &[(&str, &str)] = match locale {
        "en" => MENU_EN,
        "pt" => MENU_PT,
        "hi" => MENU_HI,
        "ru" => MENU_RU,
        "zh" => MENU_ZH,
        "fr" => MENU_FR,
        "de" => MENU_DE,
        "ja" => MENU_JA,
        "ar" => MENU_AR,
        _ => &[],
    };
    for (key, value) in overrides {
        labels.insert((*key).to_string(), (*value).to_string());
    }
    labels
}

fn label<'a>(labels: &'a HashMap<String, String>, key: &str) -> &'a str {
    labels.get(key).map(String::as_str).unwrap_or("")
}

fn item(
    app: &AppHandle,
    id: &str,
    labels: &HashMap<String, String>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    let text = labels.get(id).map(String::as_str).unwrap_or(id);
    MenuItemBuilder::with_id(id, text).build(app)
}

pub(crate) fn build_menu(app: &AppHandle, locale: &str) -> tauri::Result<()> {
    let l = menu_labels(locale);

    let file = SubmenuBuilder::new(app, label(&l, "menu.file"))
        .item(&item(app, "file.new", &l)?)
        .item(&item(app, "file.open", &l)?)
        .item(&item(app, "file.openRecent", &l)?)
        .separator()
        .item(&item(app, "file.save", &l)?)
        .item(&item(app, "file.saveAs", &l)?)
        .item(&item(app, "file.export", &l)?)
        .separator()
        .item(&item(app, "file.close", &l)?)
        .item(&item(app, "file.quit", &l)?)
        .build()?;

    let edit = SubmenuBuilder::new(app, label(&l, "menu.edit"))
        .item(&item(app, "edit.undo", &l)?)
        .item(&item(app, "edit.redo", &l)?)
        .separator()
        .item(&item(app, "edit.cut", &l)?)
        .item(&item(app, "edit.copy", &l)?)
        .item(&item(app, "edit.paste", &l)?)
        .separator()
        .item(&item(app, "edit.transform", &l)?)
        .item(&item(app, "edit.preferences", &l)?)
        .build()?;

    let image = SubmenuBuilder::new(app, label(&l, "menu.image"))
        .item(&item(app, "image.size", &l)?)
        .item(&item(app, "image.canvas", &l)?)
        .separator()
        .item(&item(app, "image.rotateCW", &l)?)
        .item(&item(app, "image.rotateCCW", &l)?)
        .item(&item(app, "image.rotate180", &l)?)
        .item(&item(app, "image.flipH", &l)?)
        .item(&item(app, "image.flipV", &l)?)
        .separator()
        .item(&item(app, "image.brightness", &l)?)
        .item(&item(app, "image.hueSat", &l)?)
        .item(&item(app, "image.levels", &l)?)
        .item(&item(app, "image.exposure", &l)?)
        .item(&item(app, "image.invert", &l)?)
        .item(&item(app, "image.desaturate", &l)?)
        .build()?;

    let layer = SubmenuBuilder::new(app, label(&l, "menu.layer"))
        .item(&item(app, "layer.new", &l)?)
        .item(&item(app, "layer.duplicate", &l)?)
        .item(&item(app, "layer.delete", &l)?)
        .separator()
        .item(&item(app, "layer.mergeDown", &l)?)
        .item(&item(app, "layer.flatten", &l)?)
        .item(&item(app, "layer.up", &l)?)
        .item(&item(app, "layer.down", &l)?)
        .build()?;

    let filter = SubmenuBuilder::new(app, label(&l, "menu.filter"))
        .item(&item(app, "filter.gaussian", &l)?)
        .item(&item(app, "filter.box", &l)?)
        .item(&item(app, "filter.unsharp", &l)?)
        .item(&item(app, "filter.vignette", &l)?)
        .item(&item(app, "filter.noise", &l)?)
        .item(&item(app, "filter.pixelate", &l)?)
        .build()?;

    let view = SubmenuBuilder::new(app, label(&l, "menu.view"))
        .item(&item(app, "view.home", &l)?)
        .separator()
        .item(&item(app, "view.zoomIn", &l)?)
        .item(&item(app, "view.zoomOut", &l)?)
        .item(&item(app, "view.fit", &l)?)
        .item(&item(app, "view.actual", &l)?)
        .separator()
        .item(&item(app, "view.rulers", &l)?)
        .item(&item(app, "view.grid", &l)?)
        .item(&item(app, "view.guides", &l)?)
        .build()?;

    let help = SubmenuBuilder::new(app, label(&l, "menu.help"))
        .item(&item(app, "help.shortcuts", &l)?)
        .item(&item(app, "help.readme", &l)?)
        .item(&item(app, "help.github", &l)?)
        .item(&item(app, "help.update", &l)?)
        .item(&item(app, "help.about", &l)?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&file, &edit, &image, &layer, &filter, &view, &help])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref().to_string());
        })
        .setup(|app| {
            let locale = crate::settings::load()
                .get("language")
                .and_then(Value::as_str)
                .unwrap_or("es")
                .to_string();
            build_menu(app.handle(), &locale)?;
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
            commands::recent_projects,
            commands::backup_project,
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
            commands::set_menu_locale,
            commands::close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar SeyroPea");
}
