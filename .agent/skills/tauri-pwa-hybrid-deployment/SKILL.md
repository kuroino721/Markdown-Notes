---
name: tauri-pwa-hybrid-deployment
description:
  Tauri (デスクトップ) と PWA (GitHub Pages)
  を同一リポジトリで管理・デプロイする際の Vite
  設定とナビゲーションのベストプラクティス。
---

# Tauri & PWA Hybrid Deployment Guide

Tauri によるデスクトップアプリと、GitHub
Pages 等での PWA 公開を並行して行う際の実装パターンと注意点。

## 1. Vite の Base Path 条件分岐

GitHub
Pages はサブディレクトリ（`/repo-name/`）で公開されますが、Tauri やローカル開発環境ではルート（`/`）が期待されます。

### 解決策

`vite.config.ts` で環境変数（GitHub Actions 等）を判定して `base`
を切り替えます。

```typescript
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/repo-name/" : "/",
  // ...
});
```

## 2. モバイル/PWA 用のナビゲーション切替

デスクトップ版（Tauri）や PC ブラウザでは「サイドパネル（iframe）」が便利ですが、モバイル（PWA）では画面幅の制約や iframe 内での認証制限により、直接の画面遷移が適しています。

### 実装パターン

Adapter 内で画面サイズや表示モードを判定し、遷移先を動的に切り替えます。

```typescript
async openNote(id: string) {
    const isMobile = window.innerWidth <= 768 || window.matchMedia('(display-mode: standalone)').matches;
    const baseUrl = import.meta.env.BASE_URL || '/';

    if (isMobile) {
        // モバイルPWA: 直接遷移
        window.location.href = `${baseUrl}note.html?id=${id}`;
    } else {
        // PC: カスタムイベントを発火してサイドパネル等で開く
        window.dispatchEvent(new CustomEvent('open-sidebar', { detail: { id } }));
    }
}
```

## 3. iframe 内での再帰・認証ループ防止

iframe 内で PWA の Service
Worker 登録や Google 認証初期化を行うと、リダイレクトループや不必要なリソース消費が発生することがあります。

### 解決策

`window.self !== window.top`
をチェックして、iframe 内では重い初期化処理をスキップまたは親へ委譲します。

```typescript
async initSync() {
    if (window.self !== window.top) return; // iframe内ならスキップ
    // ...認証初期化処理
}
```

## 4. パスの解決（BASE_URL の活用）

JS 内での `location.href` 遷移や iframe の `src` 指定の際、`BASE_URL`
を含めないとデプロイ環境で 404 エラーになります。

```typescript
const baseUrl = import.meta.env.BASE_URL || "/";
iframe.src = `${baseUrl}note.html?id=${id}`;
```

## 注意事項

- **Google OAuth**: デプロイ先のドメイン（`*.github.io`）を Google Cloud
  Console の承認済みオリジンに追加するのを忘れないようにしてください。
- **PWA Icons**: アイコン生成ツール（`tauri icon`
  等）は PNG を期待するため、JPEG 拡張子のファイルを渡すとデコードエラーになる場合があります。事前に
  `jimp` 等で変換してください。
