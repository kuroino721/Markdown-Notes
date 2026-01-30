use eframe::egui::{self, Color32, RichText, Sense, Ui, TextEdit};
use pulldown_cmark::{Event, Parser, Tag, TagEnd, HeadingLevel};

/// Typoraスタイルのライブエディタコンポーネント
/// 編集中の行はテキスト入力、他の行はレンダリング済みプレビューとして表示
pub struct LiveEditor {
    /// 現在フォーカスされている行のインデックス
    focused_line: Option<usize>,
}

impl LiveEditor {
    pub fn new() -> Self {
        Self {
            focused_line: Some(0),
        }
    }

    /// ライブエディタUIを表示し、変更があればtrueを返す
    pub fn show(&mut self, ui: &mut Ui, content: &mut String) -> bool {
        let mut changed = false;
        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        
        // 空の場合は1行追加
        if lines.is_empty() {
            lines.push(String::new());
        }

        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                let mut new_focus: Option<usize> = self.focused_line;
                let mut insert_line_after: Option<usize> = None;
                let mut delete_line: Option<usize> = None;
                let lines_len = lines.len();

                for i in 0..lines_len {
                    let is_focused = self.focused_line == Some(i);

                    if is_focused {
                        // 編集モード：テキスト入力として表示
                        ui.horizontal(|ui| {
                            let response = ui.add(
                                TextEdit::singleline(&mut lines[i])
                                    .font(egui::TextStyle::Monospace)
                                    .desired_width(ui.available_width() - 20.0)
                                    .frame(false)
                            );

                            if response.changed() {
                                changed = true;
                            }

                            // Enterキーで新しい行を追加
                            if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                                insert_line_after = Some(i);
                                new_focus = Some(i + 1);
                            }

                            // Backspaceで空の行を削除（最初の行以外）
                            if lines[i].is_empty() && i > 0 && ui.input(|i| i.key_pressed(egui::Key::Backspace)) {
                                delete_line = Some(i);
                                new_focus = Some(i.saturating_sub(1));
                            }

                            // 上下矢印キーでフォーカス移動
                            if ui.input(|i| i.key_pressed(egui::Key::ArrowUp)) && i > 0 {
                                new_focus = Some(i - 1);
                            }
                            if ui.input(|i| i.key_pressed(egui::Key::ArrowDown)) && i < lines_len - 1 {
                                new_focus = Some(i + 1);
                            }

                            // 自動フォーカス
                            response.request_focus();
                        });
                    } else {
                        // プレビューモード：レンダリング済みとして表示
                        let response = self.render_line_preview(ui, &lines[i], i);
                        
                        // クリックでフォーカス
                        if response.clicked() {
                            new_focus = Some(i);
                        }
                    }
                }

                // 行の挿入
                if let Some(after) = insert_line_after {
                    lines.insert(after + 1, String::new());
                    changed = true;
                }

                // 行の削除
                if let Some(del_idx) = delete_line {
                    if lines.len() > 1 {
                        lines.remove(del_idx);
                        changed = true;
                    }
                }

                self.focused_line = new_focus;

                // 最後の行の後にクリック可能な空白エリアを追加
                let remaining = ui.available_size();
                if remaining.y > 20.0 {
                    let response = ui.allocate_response(
                        egui::vec2(remaining.x, remaining.y.min(200.0)),
                        Sense::click()
                    );
                    if response.clicked() {
                        // 最後の行にフォーカス、または新しい行を追加
                        if lines.last().map(|l| !l.is_empty()).unwrap_or(true) {
                            lines.push(String::new());
                            changed = true;
                        }
                        self.focused_line = Some(lines.len() - 1);
                    }
                }
            });

        // 変更があった場合は content を更新
        if changed {
            *content = lines.join("\n");
        }

        changed
    }

    /// 1行をプレビューとしてレンダリング
    fn render_line_preview(&self, ui: &mut Ui, line: &str, _line_idx: usize) -> egui::Response {
        let response = ui.horizontal(|ui| {
            if line.is_empty() {
                // 空行は最小限の高さを確保
                ui.allocate_space(egui::vec2(ui.available_width(), 16.0));
            } else {
                self.render_markdown_line(ui, line);
            }
        });

        // 行全体をクリック可能にする
        response.response.interact(Sense::click())
    }

    /// 1行のマークダウンをレンダリング
    fn render_markdown_line(&self, ui: &mut Ui, line: &str) {
        let parser = Parser::new(line);
        
        let mut in_heading: Option<HeadingLevel> = None;
        let mut in_strong = false;
        let mut in_emphasis = false;
        let mut text_parts: Vec<(String, bool, bool, Option<HeadingLevel>)> = Vec::new();
        let mut current_text = String::new();

        for event in parser {
            match event {
                Event::Start(tag) => match tag {
                    Tag::Heading { level, .. } => {
                        in_heading = Some(level);
                    }
                    Tag::Strong => {
                        if !current_text.is_empty() {
                            text_parts.push((current_text.clone(), in_strong, in_emphasis, in_heading));
                            current_text.clear();
                        }
                        in_strong = true;
                    }
                    Tag::Emphasis => {
                        if !current_text.is_empty() {
                            text_parts.push((current_text.clone(), in_strong, in_emphasis, in_heading));
                            current_text.clear();
                        }
                        in_emphasis = true;
                    }
                    Tag::List(_) => {
                        // リストアイテムのマーカーを追加
                    }
                    Tag::Item => {
                        current_text.push_str("• ");
                    }
                    _ => {}
                },
                Event::End(tag_end) => match tag_end {
                    TagEnd::Strong => {
                        if !current_text.is_empty() {
                            text_parts.push((current_text.clone(), in_strong, in_emphasis, in_heading));
                            current_text.clear();
                        }
                        in_strong = false;
                    }
                    TagEnd::Emphasis => {
                        if !current_text.is_empty() {
                            text_parts.push((current_text.clone(), in_strong, in_emphasis, in_heading));
                            current_text.clear();
                        }
                        in_emphasis = false;
                    }
                    _ => {}
                },
                Event::Text(text) => {
                    current_text.push_str(&text);
                }
                Event::Code(code) => {
                    if !current_text.is_empty() {
                        text_parts.push((current_text.clone(), in_strong, in_emphasis, in_heading));
                        current_text.clear();
                    }
                    // インラインコードとして表示
                    text_parts.push((format!("`{}`", code), false, false, None));
                }
                _ => {}
            }
        }

        // 残りのテキストを追加
        if !current_text.is_empty() {
            text_parts.push((current_text, in_strong, in_emphasis, in_heading));
        }

        // 空の場合は元のテキストをそのまま表示
        if text_parts.is_empty() && !line.is_empty() {
            ui.label(line);
            return;
        }

        // テキストパーツをレンダリング
        for (text, strong, emphasis, heading) in text_parts {
            let mut rich_text = RichText::new(&text);

            // ヘッダーのスタイル
            if let Some(level) = heading {
                let size = match level {
                    HeadingLevel::H1 => 28.0,
                    HeadingLevel::H2 => 24.0,
                    HeadingLevel::H3 => 20.0,
                    HeadingLevel::H4 => 18.0,
                    HeadingLevel::H5 => 16.0,
                    HeadingLevel::H6 => 14.0,
                };
                rich_text = rich_text.size(size).strong();
            }

            if strong {
                rich_text = rich_text.strong();
            }
            if emphasis {
                rich_text = rich_text.italics();
            }

            // インラインコードの検出（`で囲まれている）
            if text.starts_with('`') && text.ends_with('`') && text.len() > 2 {
                let code_text = &text[1..text.len()-1];
                ui.label(
                    RichText::new(code_text)
                        .monospace()
                        .background_color(Color32::from_rgb(230, 230, 230))
                );
            } else {
                ui.label(rich_text);
            }
        }
    }
}

impl Default for LiveEditor {
    fn default() -> Self {
        Self::new()
    }
}
