---
name: Tauri Icon Update Consistency
description: Tauri アプリケーションでアイコン（icon.png）を更新した際に、Windows のタスクバーやインストーラーに古いアイコンが残る問題を解決するためのベストプラクティス。
---

# Tauri Icon Update Consistency

Tauri アプリケーションでソースとなるロゴ画像（`src-tauri/icons/icon.png` など）を差し替えただけでは、Windows のタスクバーやインストーラーに古いアイコン（黒い縁がある旧デザインなど）が残り続けることがあります。これを完全に解消するための手順をまとめます。

## 症状
- `icon.png` を更新したが、ビルドしたアプリをタスクバーにピン留めすると古いアイコンが表示される。
- インストーラー（NSIS/WiX）に含まれるアイコンが更新されていない。
- デバッグ実行（`tauri dev`）では新しいのに、リリースビルド（`tauri build`）では古い。

## 原因
1. **未同期**: `icon.png` だけ更新し、`.ico`（Windows）や `.icns`（macOS）などの各解像度バリアントが再生成されていない。
2. **ビルドキャッシュ**: `src-tauri/target` 内に古いアイコンリソースがキャッシュされている。
3. **OSのキャッシュ**: Windows のシェル（タスクバーなど）が以前のアイコンをキャッシュしている。

## 解決策

### 1. 全アイコンバリアントの強制再生成
Tauri CLI を使用して、ソース画像から全てのプラットフォーム用アイコンを生成し直します。

```bash
# pnpm を使用している場合
pnpm tauri icon src-tauri/icons/icon.png
```

これにより、`src-tauri/icons/` 配下の `icon.ico`, `icon.icns`, `32x32.png` などの全てのファイルが最新の状態に同期されます。

### 2. ビルドターゲットのクリーンアップ
ビルドプロセスで古いリソースが混入しないよう、`target` ディレクトリを削除してからビルドします。

```powershell
# Windows (PowerShell) の場合
Remove-Item -Path src-tauri/target -Recurse -Force -ErrorAction SilentlyContinue
```

### 3. Windows アイコンキャッシュのクリア（必要に応じて）
もし再インストール後もピン留めアイコンが古い場合、以下の手順を試してください。

- **ピン留めのやり直し**: 一度タスクバーからピン留めを外し、再度アプリを起動してピン留めし直す。
- **キャッシュクリアコマンド**:
  ```powershell
  ie4uinit.exe -show
  ```
  または、`%LocalAppData%\IconCache.db` を削除してエクスプローラーを再起動します。

## 注意事項
- `tauri.conf.json` の `bundle > icon` リストに、正しく `src-tauri/icons/icon.ico` などが含まれているか確認してください。
- `AppUserModelID`（プロダクト名や識別子）が変更されていない場合、Windows は同じアプリと認識して古いキャッシュを使い回す傾向があります。
