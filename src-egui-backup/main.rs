mod app;
mod editor;
mod live_editor;
mod preview;
mod shortcuts;

use app::MarkdownApp;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1200.0, 800.0])
            .with_min_inner_size([600.0, 400.0]),
        ..Default::default()
    };


    eframe::run_native(
        "Markdown Editor",
        options,
        Box::new(|cc| Ok(Box::new(MarkdownApp::new(cc)))),
    )
}
