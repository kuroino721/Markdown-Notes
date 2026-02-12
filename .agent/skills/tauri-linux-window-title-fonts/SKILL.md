---
name: tauri-linux-window-title-fonts
description:
  Linux (WSL2) 環境で Tauri
  アプリのウィンドウタイトルバーが文字化け（豆腐化）する問題の解決方法
---

# Tauri Linux Window Title Fonts Fix

Linux
(特に WSL2) 環境で Tauri アプリケーションを実行すると、ウィンドウのタイトルバー（Window
Decoration）に表示される日本語などの非 ASCII 文字が「□（豆腐）」のように文字化けすることがあります。これは、Webview 内のコンテンツとは異なり、ウィンドウ装飾部分はシステムフォントに依存しているにもかかわらず、最低限の Linux 環境には日本語フォントが含まれていないことが原因です。

## 症状

- アプリ内の HTML/CSS コンテンツ（Web
  Fonts 利用時など）は正しく日本語が表示される。
- ウィンドウ上部のタイトルバーだけが文字化けする。
- `fc-list :lang=ja` を実行しても何も出力されない。

## 解決策

システムに日本語フォント（Noto CJK など）をインストールします。

### Debian / Ubuntu (WSL2) の場合

以下のコマンドを実行して、Google Noto Fonts (CJK) をインストールします。

```bash
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk fonts-noto-cjk-extra fonts-noto-color-emoji
```

### 確認方法

インストール後、以下のコマンドで日本語フォントが認識されているか確認します。

```bash
fc-list :lang=ja
```

出力があればインストール成功です。Tauri アプリを再起動すると、タイトルバーの文字化けが解消されます。

## 補足

- `fonts-noto-cjk` は基本セット、`fonts-noto-cjk-extra`
  はより多くのウェイトやバリアントを含みます。ディスク容量を節約したい場合は
  `fonts-noto-cjk` のみでも解決する場合がありますが、`extra`
  も入れておくのが無難です。
- 絵文字も文字化けする場合があるため、`fonts-noto-color-emoji`
  も同時にインストールすることを推奨します。
