---
name: tauri-version-sync
description:
  Tauri における NPM パッケージと Rust クレートのバージョン不一致（Version
  Mismatch）を解消し、同期させるためのベストプラクティス。
---

# Tauri Version Synchronization

Tauri アプリの開発において、フロントエンドの NPM パッケージ（`@tauri-apps/api`
など）とバックエンドの Rust クレート（`tauri`
など）のバージョンが一致していないと、起動時にエラーが発生することがあります。

## 症状

`pnpm tauri dev` 実行時に以下のようなエラーが表示される：

```text
Error Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on the same major/minor releases:
tauri (v2.9.5) : @tauri-apps/api (v2.10.1)
```

## 解決策

### 1. 手動でのバージョン同期

`Cargo.toml` と `package.json` の両方を編集して、バージョンを合わせます。

#### Cargo.toml (src-tauri/)

`tauri` クレートのバージョンを指定します。

```toml
[dependencies]
tauri = { version = "2.10", features = ["..."] }
```

> [!NOTE] `tauri-build` などのビルド用クレートは、コアの `tauri`
> と必ずしも同じバージョン番号である必要はありません。`cargo search`
> で最新の互換バージョンを確認してください。

#### package.json

`@tauri-apps/api` と `@tauri-apps/cli` のバージョンを合わせます。

```json
{
  "devDependencies": {
    "@tauri-apps/cli": "~2.10.0"
  },
  "dependencies": {
    "@tauri-apps/api": "~2.10.0"
  }
}
```

> [!WARNING] Tauri プラグイン（`@tauri-apps/plugin-dialog`
> など）は独自のバージョン番号を持っている場合が多いため、すべてを `2.10.0`
> に合わせようとすると「No matching version
> found」エラーになります。プラグインについては `pnpm view <pkg> versions`
> で実在する最新バージョンを確認して指定してください。

### 2. ロックファイルの更新

ファイルを修正した後、各マネージャーのロックファイルを更新します。

```bash
# Frontend
pnpm install

# Backend
cd src-tauri
cargo update -p tauri
```

## 注意事項

- **マイナーバージョンの不一致**: Tauri
  v2 では、マイナーバージョン（2.9 と 2.10 など）が異なると動作しない場合が多いです。
- **プラグインのバージョン**: 前述の通り、プラグインのバージョン番号はコアと同期していないことがあります。
- **Cargo のキャッシュ**: `cargo update` を行わなないと、`Cargo.toml`
  を書き換えても古いバージョンが使われ続けることがあります。
