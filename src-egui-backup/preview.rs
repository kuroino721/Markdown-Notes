use eframe::egui::{self, RichText, Color32, Ui};
use pulldown_cmark::{Event, Parser, Tag, TagEnd, HeadingLevel};

/// Markdownプレビューコンポーネント
pub struct Preview;

impl Preview {
    pub fn new() -> Self {
        Self
    }

    /// プレビューUIを表示
    pub fn show(&self, ui: &mut Ui, markdown: &str) {
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                self.render_markdown(ui, markdown);
            });
    }

    /// MarkdownをeguiのUIにレンダリング
    fn render_markdown(&self, ui: &mut Ui, markdown: &str) {
        let parser = Parser::new(markdown);

        let mut in_heading: Option<HeadingLevel> = None;
        let mut in_emphasis = false;
        let mut in_strong = false;
        #[allow(unused_variables)]
        let _in_code = false;
        let mut in_code_block = false;
        let mut code_block_content = String::new();
        let mut in_list = false;
        let mut list_item_text = String::new();
        let mut current_text = String::new();

        for event in parser {
            match event {
                Event::Start(tag) => match tag {
                    Tag::Heading { level, .. } => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                        in_heading = Some(level);
                    }
                    Tag::Paragraph => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                    }
                    Tag::Emphasis => {
                        in_emphasis = true;
                    }
                    Tag::Strong => {
                        in_strong = true;
                    }
                    Tag::CodeBlock(_) => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                        in_code_block = true;
                        code_block_content.clear();
                    }
                    Tag::List(_) => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                        in_list = true;
                    }
                    Tag::Item => {
                        list_item_text.clear();
                    }
                    Tag::Link { dest_url, .. } => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                        current_text.push_str(&format!("[link: {}]", dest_url));
                    }
                    _ => {}
                },
                Event::End(tag_end) => match tag_end {
                    TagEnd::Heading(_) => {
                        if let Some(level) = in_heading.take() {
                            let size = match level {
                                HeadingLevel::H1 => 28.0,
                                HeadingLevel::H2 => 24.0,
                                HeadingLevel::H3 => 20.0,
                                HeadingLevel::H4 => 18.0,
                                HeadingLevel::H5 => 16.0,
                                HeadingLevel::H6 => 14.0,
                            };
                            ui.label(RichText::new(&current_text).size(size).strong());
                            current_text.clear();
                            ui.add_space(8.0);
                        }
                    }
                    TagEnd::Paragraph => {
                        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                        ui.add_space(8.0);
                    }
                    TagEnd::Emphasis => {
                        in_emphasis = false;
                    }
                    TagEnd::Strong => {
                        in_strong = false;
                    }
                    TagEnd::CodeBlock => {
                        in_code_block = false;
                        ui.group(|ui| {
                            ui.style_mut().visuals.extreme_bg_color = Color32::from_rgb(40, 44, 52);
                            ui.label(
                                RichText::new(&code_block_content)
                                    .monospace()
                                    .background_color(Color32::from_rgb(40, 44, 52))
                                    .color(Color32::from_rgb(171, 178, 191)),
                            );
                        });
                        code_block_content.clear();
                        ui.add_space(8.0);
                    }
                    TagEnd::List(_) => {
                        in_list = false;
                        ui.add_space(8.0);
                    }
                    TagEnd::Item => {
                        if in_list {
                            ui.horizontal(|ui| {
                                ui.label("•");
                                ui.label(&list_item_text);
                            });
                        }
                        list_item_text.clear();
                    }
                    _ => {}
                },
                Event::Text(text) => {
                    if in_code_block {
                        code_block_content.push_str(&text);
                    } else if in_list {
                        list_item_text.push_str(&text);
                    } else {
                        current_text.push_str(&text);
                    }
                }
                Event::Code(code) => {
                    self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(code.as_ref())
                                .monospace()
                                .background_color(Color32::from_rgb(230, 230, 230)),
                        );
                    });
                }
                Event::SoftBreak | Event::HardBreak => {
                    self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
                }
                _ => {}
            }
        }

        // 残りのテキストをフラッシュ
        self.flush_text(ui, &mut current_text, in_strong, in_emphasis);
    }

    /// テキストをUIに出力してクリア
    fn flush_text(&self, ui: &mut Ui, text: &mut String, strong: bool, emphasis: bool) {
        if !text.is_empty() {
            let mut rich_text = RichText::new(text.as_str());
            if strong {
                rich_text = rich_text.strong();
            }
            if emphasis {
                rich_text = rich_text.italics();
            }
            ui.label(rich_text);
            text.clear();
        }
    }
}

impl Default for Preview {
    fn default() -> Self {
        Self::new()
    }
}
