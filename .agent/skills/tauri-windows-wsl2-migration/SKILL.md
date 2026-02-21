---
name: tauri-windows-wsl2-migration
description: WSL2の環境では起動しないTauriアプリケーション向けに、Windowsネイティブのビルド・開発環境へ安全に移行するためのベストプラクティス。cross-envの導入によるnpmスクリプトのクロスプラットフォーム化やWindows側の必須ツールチェーンのセットアップを含む。
---

# TauriアプリのWSL2からWindowsネイティブ環境への移行

Tauriを用いたWindowsデスクトップアプリを開発する際、WSL2上からの `tauri dev` 実行ではWebView2のウィンドウが正常に立ち上がらないか、GUI体験が損なわれる場合があります。このスキルは、そのようなアプリケーションの開発環境を Windows ネイティブ側に移行するためのベストプラクティスです。

## 問題の背景と症状

- WSL2環境で `pnpm tauri dev` などを実行した際、GUI（WebView2）ウィンドウが真っ白になる、またはフリーズする問題が発生する。
- Linux版のビルドが走り、本来のWindowsデスクトップアプリとしての検証が行いにくい。

## 解決アプローチ

Windowsのターミナル（PowerShellやCommand Prompt）から直接Node.jsコマンドおよびRustビルドを走らせることで、ネイティブのWindowsとしてアプリケーションを起動・デバッグします。

### 1. npm/pnpm スクリプトのクロスプラットフォーム対応

Windows上で開発を行う際、`package.json` 等でよく使われるインライン環境変数指定（例: `GITHUB_ACTIONS=true pnpm build`）はデフォルトのコマンドプロンプトやPowerShellでは動作しません。

#### 対策: `cross-env` の導入

`package.json` に `cross-env` を追加し、スクリプト実行時は必ず `cross-env` 経由とするか、または `npx cross-env` を使用してパスの不一致問題を防ぎます。

```json
// package.json の修正例
{
  "scripts": {
    // 修正前: "test:e2e": "GITHUB_ACTIONS=true pnpm build && npx playwright test"
    "test:e2e": "npx cross-env GITHUB_ACTIONS=true pnpm build && npx playwright test"
  }
}
```

```javascript
// playwright.config.ts 等の修正例
webServer: {
  // 修正前: command: 'GITHUB_ACTIONS=true pnpm vite preview',
  command: 'npx cross-env GITHUB_ACTIONS=true pnpm vite preview',
  // ...
}
```

### 2. Windows側必須要件（ユーザーへの案内事項）

Windowsネイティブ環境でTauriをビルドし、開発環境を構築するためには、**WSL側ではなくWindowsホスト側**に以下のツール群が揃っている必要があります。環境移行を案内する際は必ず以下のインストールを指示してください。

1. **Node.js**: Windows用のNode環境。
2. **pnpm (Corepack)**: Node.js インストール後に `corepack enable pnpm` をPowerShellから管理者権限なしでも実行して有効化しておくこと。
3. **Rust ツールチェーン**: Windows用の `rustup-init.exe` を利用してインストール。
4. **Microsoft Visual Studio C++ Build Tools**: RustからWindows向けアプリケーションをコンパイルする際に必要。「C++によるデスクトップ開発」ワークロードに加えて、Windows 10/11 SDKがインストールされている必要があります。

### 3. E2Eテストツールのブラウザ（Playwright）インストール

移行後、初めてPlaywright等のE2EテストをWindowsネイティブ側で実行する際は、ブラウザバイナリがないためエラーになることがあります。Windows側で再度ブラウザバイナリをインストールしてください。

```powershell
npx playwright install
```

## 注意事項

- Node.jsのパッケージ（`node_modules`）はWSL側とWindows側でバイナリ構成が異なる場合があります。移行時はWindows側で必ず `pnpm install` を再実行（またはクリーンインストール）してください。
