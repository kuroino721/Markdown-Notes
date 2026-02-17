# Markdown Notes

TauriとMilkdownで構築された、マルチウィンドウ対応のMarkdownメモ帳アプリです。各ノートを独立したウィンドウ（付箋のような感覚）として開くことができ、メインウィンドウで一元管理できます。

## 特徴

- **マルチウィンドウ**: 複数のノートを同時に独立したウィンドウとして開くことができます。
- **WYSIWYG編集**: Milkdown
  (Crepe) を採用し、Typoraライクな直感的なMarkdown編集が可能です。
- **ソースモード**: WYSIWYGと生のMarkdown表示をワンクリックで切り替えられます。
- **自動保存**: 内容は自動的に保存され、ウィンドウの位置やサイズも記憶されます。
- **ダッシュボード**: 作成したノートを一覧表示し、管理（作成・削除・検索）できます。
- **カスタマイズ**: 行間の調整などが可能です。
- **ファイル連携**: `.md` ファイルをアプリに関連付けて開くことができます。

## 技術スタック

| 領域           | 技術                                      |
| -------------- | ----------------------------------------- |
| フロントエンド | Vanilla JavaScript, HTML, CSS             |
| エディタコア   | [Milkdown](https://milkdown.dev/) (Crepe) |
| バックエンド   | Rust (Tauri)                              |
| ビルドツール   | Vite                                      |

## プロジェクト構成

```
src/
├── index.html      # メインウィンドウ（ノート一覧/ダッシュボード）
├── main.js         # メインウィンドウのロジック
├── note.html       # ノート編集ウィンドウ
├── note.js         # エディタのロジック（Milkdown初期化、自動保存など）
├── style.css       # グローバルスタイル
└── src-tauri/      # Rustバックエンド（ファイル操作、ウィンドウ管理、コマンド）
```

## 環境構築

開発環境をセットアップするには以下のコマンドを実行してください。

```powershell
# 依存関係のインストール
pnpm install

# 開発サーバーの起動（ホットリロード有効）
pnpm tauri dev
```

## テストの実行

### unit test

    ### フロントエンド

    Vitest を使用して `src/utils.js` などのユーティリティ関数のテストを実行します。

    ```powershell
    pnpm test
    ```

    ### バックエンド

    `src-tauri` ディレクトリ内の Rust コードのテストを実行します。

    ```powershell
    cd src-tauri
    cargo test
    ```

### integration test

    `src-tauri` ディレクトリ内の Rust コードのテストを実行します。

    ```powershell
    cd src-tauri
    cargo test --test integration_tests
    ```

## ビルド

配布用のインストーラを作成するには：

```powershell
pnpm tauri build
```

### インストーラ

`src-tauri\target\release\bundle\msi\Markdown Editor_0.1.0_x64_en-US.msi`

## デプロイ & PWA (GitHub Pages)

本アプリは PWA 化されており、GitHub
Pages にデプロイすることでスマホ（Android/iOS）からも利用可能です。

### 1. GitHub プロジェクトの設定

- **Secrets の設定**: `Settings > Secrets and variables > Actions`
  に以下を追加してください。
  - `VITE_GOOGLE_CLIENT_ID_WEB`: Google Cloud のウェブクライアントID
  - `VITE_GOOGLE_API_KEY`: Google APIキー
- **Pages の設定**: `Settings > Pages` の `Build and deployment > Source` を
  **"GitHub Actions"** に変更してください。
- **デプロイ**: `main` ブランチにプッシュすると、GitHub
  Actions により自動的にデプロイされます。

### 2. Google Cloud Console の設定

GitHub Pages のドメインを許可リストに追加する必要があります。

- **承認済みのリダイレクト URI**:
  `https://<ユーザー名>.github.io/Markdown-Notes/`
- **承認済みの JavaScript 生成元**: `https://<ユーザー名>.github.io`

### 3. スマホでの利用開始 (PWA)

1. デプロイされたプロジェクトの URL（例:
   `https://kuroino721.github.io/Markdown-Notes/`）にブラウザでアクセスします。
2. ブラウザのメニュー（三点リーダーなど）から **「ホーム画面に追加」** または
   **「アプリをインストール」** を選択します。
3. ホーム画面からアプリを起動し、Google ログインを行えば PC との同期が開始されます。

## 実装済み機能

### 1. モバイル & PWA 対応

- **レスポンシブ UI**: スマホに最適化された1カラムレイアウト。
- **オフラインサポート**:
  PWA により、インターネット未接続時でもノートの閲覧・編集が可能です。
- **直接ナビゲーション**: モバイル環境では操作性を考慮し、サイドパネルではなく画面遷移による編集を採用しています。

### 2. ライブプレビュー

- 入力と同時にプレビュー更新
- 対応Markdown: 見出し、太字、斜体、リスト、コードブロック、リンク

### 3. キーボードショートカット（Typora互換）

| キー       | 機能           |
| ---------- | -------------- |
| `Ctrl+/`   | 表示モード切替 |
| `Ctrl+B`   | 太字挿入       |
| `Ctrl+I`   | 斜体挿入       |
| `Ctrl+K`   | リンク挿入     |
| `Ctrl+S`   | 保存           |
| `Ctrl+O`   | ファイルを開く |
| `Ctrl+1~6` | 見出しレベル   |

### 4. ファイル操作

- 開く/保存/名前を付けて保存
- .md, .txt ファイル対応
- 変更検知（タイトルに \* 表示）

## 今後の改善点

### AIが生成

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
