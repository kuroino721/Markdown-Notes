use eframe::egui;

use crate::editor::Editor;
use crate::live_editor::LiveEditor;
use crate::preview::Preview;
use crate::shortcuts::handle_shortcuts;

/// 表示モード
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ViewMode {
    /// Typoraスタイルのライブプレビュー（デフォルト）
    Live,
    /// エディタのみ表示
    Editor,
    /// プレビューのみ表示
    Preview,
    /// 左右分割表示
    Split,
}

/// メインアプリケーション状態
pub struct MarkdownApp {
    /// エディタのテキスト内容
    pub content: String,
    /// 現在の表示モード
    pub view_mode: ViewMode,
    /// 現在開いているファイルパス
    pub current_file: Option<String>,
    /// 変更フラグ
    pub modified: bool,
    /// ライブエディタの状態
    pub live_editor: LiveEditor,
}

impl MarkdownApp {
    pub fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        Self {
            content: String::from("# Welcome to Markdown Editor\n\nStart typing your **Markdown** here!\n\n## Features\n- Live preview\n- Typora-like shortcuts\n- Split view\n\nPress `Ctrl+/` to toggle between views."),
            view_mode: ViewMode::Live,
            current_file: None,
            modified: false,
            live_editor: LiveEditor::new(),
        }
    }

    /// ファイルを開く
    pub fn open_file(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Markdown", &["md", "markdown"])
            .add_filter("Text", &["txt"])
            .add_filter("All files", &["*"])
            .pick_file()
        {
            if let Ok(content) = std::fs::read_to_string(&path) {
                self.content = content;
                self.current_file = Some(path.display().to_string());
                self.modified = false;
            }
        }
    }

    /// ファイルを保存
    pub fn save_file(&mut self) {
        if let Some(ref path) = self.current_file {
            if std::fs::write(path, &self.content).is_ok() {
                self.modified = false;
            }
        } else {
            self.save_file_as();
        }
    }

    /// 名前を付けて保存
    pub fn save_file_as(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter("Markdown", &["md"])
            .set_file_name("untitled.md")
            .save_file()
        {
            if std::fs::write(&path, &self.content).is_ok() {
                self.current_file = Some(path.display().to_string());
                self.modified = false;
            }
        }
    }

    /// 表示モードを切り替え（Editor と Preview/Live のみ）
    pub fn toggle_view(&mut self) {
        self.view_mode = match self.view_mode {
            ViewMode::Live | ViewMode::Preview => ViewMode::Editor,
            ViewMode::Editor | ViewMode::Split => ViewMode::Live,
        };
    }
}

impl eframe::App for MarkdownApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // キーボードショートカットを処理
        handle_shortcuts(ctx, self);

        // メニューバー
        egui::TopBottomPanel::top("menu_bar").show(ctx, |ui| {
            egui::menu::bar(ui, |ui| {
                ui.menu_button("File", |ui| {
                    if ui.button("Open (Ctrl+O)").clicked() {
                        self.open_file();
                        ui.close_menu();
                    }
                    if ui.button("Save (Ctrl+S)").clicked() {
                        self.save_file();
                        ui.close_menu();
                    }
                    if ui.button("Save As...").clicked() {
                        self.save_file_as();
                        ui.close_menu();
                    }
                });
                ui.menu_button("View", |ui| {
                    if ui.button("Toggle View (Ctrl+/)").clicked() {
                        self.toggle_view();
                        ui.close_menu();
                    }
                    ui.separator();
                    if ui.radio_value(&mut self.view_mode, ViewMode::Split, "Split View").clicked() {
                        ui.close_menu();
                    }
                    if ui.radio_value(&mut self.view_mode, ViewMode::Editor, "Editor Only").clicked() {
                        ui.close_menu();
                    }
                    if ui.radio_value(&mut self.view_mode, ViewMode::Preview, "Preview Only").clicked() {
                        ui.close_menu();
                    }
                });
                ui.menu_button("Format", |ui| {
                    if ui.button("Bold (Ctrl+B)").clicked() {
                        ui.close_menu();
                    }
                    if ui.button("Italic (Ctrl+I)").clicked() {
                        ui.close_menu();
                    }
                    if ui.button("Link (Ctrl+K)").clicked() {
                        ui.close_menu();
                    }
                });
            });

            // ステータス表示
            ui.horizontal(|ui| {
                let title = if let Some(ref path) = self.current_file {
                    let modified_mark = if self.modified { " *" } else { "" };
                    format!("{}{}", path, modified_mark)
                } else {
                    let modified_mark = if self.modified { " *" } else { "" };
                    format!("Untitled{}", modified_mark)
                };
                ui.label(title);

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let mode_text = match self.view_mode {
                        ViewMode::Live => "Live Preview",
                        ViewMode::Split => "Split View",
                        ViewMode::Editor => "Editor Only",
                        ViewMode::Preview => "Preview Only",
                    };
                    ui.label(mode_text);
                });
            });
        });

        // メインコンテンツエリア
        egui::CentralPanel::default().show(ctx, |ui| {
            match self.view_mode {
                ViewMode::Live => {
                    // Typoraスタイルのライブプレビュー
                    if self.live_editor.show(ui, &mut self.content) {
                        self.modified = true;
                    }
                }
                ViewMode::Split => {
                    // 左右分割表示
                    ui.columns(2, |columns| {
                        // 左側：エディタ
                        columns[0].vertical(|ui| {
                            ui.heading("Editor");
                            ui.separator();
                            let editor = Editor::new();
                            if editor.show(ui, &mut self.content) {
                                self.modified = true;
                            }
                        });

                        // 右側：プレビュー
                        columns[1].vertical(|ui| {
                            ui.heading("Preview");
                            ui.separator();
                            let preview = Preview::new();
                            preview.show(ui, &self.content);
                        });
                    });
                }
                ViewMode::Editor => {
                    ui.heading("Editor");
                    ui.separator();
                    let editor = Editor::new();
                    if editor.show(ui, &mut self.content) {
                        self.modified = true;
                    }
                }
                ViewMode::Preview => {
                    // プレビューモードでもライブエディタを使用（直接編集可能）
                    if self.live_editor.show(ui, &mut self.content) {
                        self.modified = true;
                    }
                }
            }
        });
    }
}
