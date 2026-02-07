# Markdown Editor

RustとeguiフレームワークでTyporaライクなMarkdownエディタを構築しています。

## 技術スタック

| 項目 | 技術 |
|------|------|
| 言語 | Rust |
| GUIフレームワーク | egui + eframe 0.29 |
| Markdownパーサー | pulldown-cmark 0.12 |
| ファイルダイアログ | rfd 0.15 |


## プロジェクト構成

```
src/
├── main.rs       # エントリーポイント、ウィンドウ初期化
├── app.rs        # メインアプリ状態、UI レイアウト、ファイル操作
├── editor.rs     # テキストエディタコンポーネント
├── preview.rs    # Markdownプレビューレンダリング
└── shortcuts.rs  # キーボードショートカット処理
```

## 環境構築

以下のコマンドで依存関係をインストール・起動してください。

```powershell
# 1. 依存関係のインストール（初回のみ）
npm install

# 2. 開発サーバーの起動（Rust + Vite）
npm run tauri dev
```

## ビルド

アプリケーションの配布用ビルドを作成するには：

```powershell
npm run tauri build
```

## 実装済み機能

### 1. ライブプレビュー
- Split View（左:エディタ、右:プレビュー）
- 入力と同時にプレビュー更新
- 対応Markdown: 見出し、太字、斜体、リスト、コードブロック、リンク

### 2. キーボードショートカット（Typora互換）

| キー | 機能 |
|------|------|
| `Ctrl+/` | 表示モード切替 |
| `Ctrl+B` | 太字挿入 |
| `Ctrl+I` | 斜体挿入 |
| `Ctrl+K` | リンク挿入 |
| `Ctrl+S` | 保存 |
| `Ctrl+O` | ファイルを開く |
| `Ctrl+1~6` | 見出しレベル |

### 3. ファイル操作
- 開く/保存/名前を付けて保存
- .md, .txt ファイル対応
- 変更検知（タイトルに * 表示）

## 今後の改善点

1. **選択範囲へのフォーマット適用** - 現在はテキスト末尾に追加するのみ、カーソル位置に挿入すべき
2. **シンタックスハイライト** - エディタ側のMarkdown構文ハイライト
3. **テーマ切り替え** - ダーク/ライトモード
4. **画像挿入** - ドラッグ&ドロップ対応
5. **アンドゥ/リドゥ** - 操作履歴管理
6. **検索・置換** - `Ctrl+F`, `Ctrl+H`

## コード解説

### app.rs
- `MarkdownApp` 構造体がアプリ状態を保持
- `ViewMode` enum で表示モード（Split/Editor/Preview）を管理
- `eframe::App` trait の `update()` で毎フレームUIを描画

### preview.rs
- `pulldown_cmark::Parser` でMarkdownをパース
- イベント駆動でタグを処理し、`egui::RichText` で描画
- 見出しはサイズ変更、コードブロックは背景色付き

### shortcuts.rs
- `ctx.input()` でキー入力を検知
- Modifiers（Ctrl）との組み合わせで処理を分岐
