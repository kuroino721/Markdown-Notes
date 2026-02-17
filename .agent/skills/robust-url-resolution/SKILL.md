---
name: robust-url-resolution
description:
  Vite, Tauri, GitHub Pages
  などのハイブリッド環境において、ベースパス（BASE_URL）に依存せず、相対パスを安定して絶対URLに解決するためのベストプラクティス。特に
  GitHub Pages
  のようなサブディレクトリ構成で、URL末尾のスラッシュの有無によって相対パス解決が壊れる問題（404
  や index.html へのリダイレクト）を防ぐために使用します。
---

# Robust URL Resolution

Vite を使用したプロジェクトを GitHub Pages などのサブディレクトリ（例:
`https://user.github.io/repo-name/`）にデプロイする場合、標準的な
`new URL('file.html', window.location.href)`
による相対パス解決は非常に脆くなります。

## 症状と背景

- **スラッシュ問題**:
  `.../repo-name`（スラッシュなし）でアクセスすると、相対パス `note.html` は
  `.../note.html`（ルート直下）に解決され 404 になります。
- **SPA リダイレクト**: GitHub Pages 等で 404 を `index.html`
  にリダイレクト設定している場合、iframe 内で `note.html`
  を読もうとしてメイン画面（`index.html`）が再ロードされ、UI が複製されるバグが発生します。

## 具体的な解決策

Vite のビルド時定数 `import.meta.env.BASE_URL`
を活用し、手動でパスを結合する堅牢なユーティリティを導入します。

### 実装例

```typescript
/**
 * Resolve a relative path to a robust URL using Vite's BASE_URL.
 * @param {string} path - Relative path (e.g., 'note.html')
 * @param {object} options - Options including baseUrl override for testing
 * @returns {string} Fully resolved URL
 */
export function resolveRelativeUrl(
  path: string,
  options: { baseUrl?: string } = {},
): string {
  // Vite がビルド時に置換する定数。テスト用に override 可能にする
  const baseUrl = options.baseUrl || (import.meta as any).env.BASE_URL || "/";

  // すでに絶対URLの場合はそのまま返す
  if (path.match(/^[a-z]+:\/\//i)) return path;

  // ルート相対パス（/から始まる）の場合は origin に結合
  if (path.startsWith("/")) {
    return new URL(path, window.location.origin).href;
  }

  // 相対パスの場合は BASE_URL と結合する
  // normalizedBase を "/base/" の形式に整える
  let normalizedBase = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  if (!normalizedBase.endsWith("/")) normalizedBase += "/";

  // 文字列結合により、URL コンストラクタのルート相対解決の影響を避ける
  const fullPath = normalizedBase + path;
  return new URL(fullPath, window.location.origin).href;
}
```

### 使用方法

```typescript
// iframe の src 設定時など
const url = resolveRelativeUrl("note.html");
iframe.src = url;
```

## 注意事項

1. **テスト環境の整備**: `window` や `URL`
   を使用するため、Vitest 等のテスト環境では `jsdom` を使用する必要があります。
2. **BASE_URL のモック**: `import.meta.env.BASE_URL`
   はビルド時に静的置換されるため、テストコードからモックすることが困難です。上記実装例のようにオプション引数で
   `baseUrl` を渡せるようにすることで、テスト可能性を高めることができます。
