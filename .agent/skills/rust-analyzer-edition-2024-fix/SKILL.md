---
name: rust-analyzer-edition-2024-fix
description:
  rust-analyzer が "unknown variant 2024"
  エラーでワークスペースのロードに失敗する場合の対処法。
---

# rust-analyzer Edition 2024 Mismatch

Rust の新しいバージョン（1.85 以降、特に開発版や先行リリース）を使用している際、`rust-analyzer`
が `cargo metadata` の出力に含まれる `edition: "2024"`
（または内部的な列挙型バリアント）を認識できず、ワークスペースのロードに失敗することがあります。

## 症状

以下のようなエラーが `rust-analyzer` のログや IDE の通知に表示されます：

```
failed to interpret `cargo metadata`'s json: unknown variant `2024`, expected one of `2015`, `2018`, `2021` at line ...
```

## 原因

インストールされている `rust-analyzer`
のバージョンが、使用している Rust ツールチェーンの `cargo`
が出力するメタデータ形式（Edition
2024 のサポートを含む）に対応していないために発生します。特に VS
Code 拡張機能などは**内蔵の古いバイナリ**を優先して使用することがあり、OS側のツールチェーンを更新しただけでは解消されない場合があります。

## 解決策

### 1. rustup を使用して rust-analyzer コンポーネントを最新にする

システムパスにある古い `rust-analyzer`
ではなく、現在のツールチェーンに適合するコンポーネント版をインストール・更新します。

```bash
rustup component add rust-analyzer
```

### 2. VS Code の設定でサーバーパスを強制指定する

拡張機能が内蔵バイナリを使っている場合、プロジェクトの `.vscode/settings.json`
で最新のバイナリパスを明示的に指定します。

```json
{
  "rust-analyzer.server.path": "/home/kuroino721/.cargo/bin/rust-analyzer"
}
```

※ パスは `which rust-analyzer` で確認してください。

## 注意事項

- **再起動**: 設定変更後は必ず `Rust Analyzer: Restart server`
  を実行してください。
- **Edition 2024**: Rust
  1.85 以降で導入されるため、古い解析ツールはこの新しいメタデータ形式を解釈できずエラーを吐きます。
- **環境の乖離**: ターミナルで `cargo check` が通るのに VS
  Code でエラーが出る場合は、ほぼ確実にこのバイナリの不一致が原因です。
