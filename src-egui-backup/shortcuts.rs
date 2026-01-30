use eframe::egui::{self, Key, Modifiers};

use crate::app::MarkdownApp;

/// キーボードショートカットの処理
pub fn handle_shortcuts(ctx: &egui::Context, app: &mut MarkdownApp) {
    let ctrl = Modifiers::CTRL;

    ctx.input(|i| {
        // Ctrl+/ : 表示モード切り替え
        if i.key_pressed(Key::Slash) && i.modifiers.matches_exact(ctrl) {
            app.toggle_view();
        }

        // Ctrl+O : ファイルを開く
        if i.key_pressed(Key::O) && i.modifiers.matches_exact(ctrl) {
            app.open_file();
        }

        // Ctrl+S : 保存
        if i.key_pressed(Key::S) && i.modifiers.matches_exact(ctrl) {
            app.save_file();
        }

        // Ctrl+B : 太字（選択テキストに適用）
        if i.key_pressed(Key::B) && i.modifiers.matches_exact(ctrl) {
            insert_format_markers(&mut app.content, "**", "**");
            app.modified = true;
        }

        // Ctrl+I : 斜体（選択テキストに適用）
        if i.key_pressed(Key::I) && i.modifiers.matches_exact(ctrl) {
            insert_format_markers(&mut app.content, "*", "*");
            app.modified = true;
        }

        // Ctrl+K : リンク
        if i.key_pressed(Key::K) && i.modifiers.matches_exact(ctrl) {
            insert_format_markers(&mut app.content, "[", "](url)");
            app.modified = true;
        }

        // Ctrl+` : インラインコード
        if i.key_pressed(Key::Backtick) && i.modifiers.matches_exact(ctrl) {
            insert_format_markers(&mut app.content, "`", "`");
            app.modified = true;
        }

        // Ctrl+1~6 : 見出しレベル
        for (key, level) in [
            (Key::Num1, 1),
            (Key::Num2, 2),
            (Key::Num3, 3),
            (Key::Num4, 4),
            (Key::Num5, 5),
            (Key::Num6, 6),
        ] {
            if i.key_pressed(key) && i.modifiers.matches_exact(ctrl) {
                insert_heading(&mut app.content, level);
                app.modified = true;
            }
        }
    });
}

/// フォーマットマーカーを挿入
fn insert_format_markers(content: &mut String, prefix: &str, suffix: &str) {
    // 現在のカーソル位置に挿入（簡易実装：末尾に追加）
    // 実際の選択範囲の取得はeguiの制限があるため、末尾にサンプルを追加
    content.push_str(&format!("{}{}{}", prefix, "text", suffix));
}

/// 見出しを挿入
fn insert_heading(content: &mut String, level: usize) {
    let heading = "#".repeat(level);
    content.push_str(&format!("\n{} Heading\n", heading));
}
