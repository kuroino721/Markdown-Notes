use eframe::egui;

/// テキストエディタコンポーネント
pub struct Editor;

impl Editor {
    pub fn new() -> Self {
        Self
    }

    /// エディタUIを表示し、変更があればtrueを返す
    pub fn show(&self, ui: &mut egui::Ui, content: &mut String) -> bool {
        let available_size = ui.available_size();

        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                let response = ui.add_sized(
                    [available_size.x, available_size.y - 10.0],
                    egui::TextEdit::multiline(content)
                        .font(egui::TextStyle::Monospace)
                        .code_editor()
                        .desired_width(f32::INFINITY)
                        .lock_focus(true),
                );
                response.changed()
            })
            .inner
    }
}

impl Default for Editor {
    fn default() -> Self {
        Self::new()
    }
}
