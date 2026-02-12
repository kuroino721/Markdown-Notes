---
name: tauri-card-markdown-preview
description:
  Tauri アプリケーションのノート一覧（グリッド表示）などで、Markdown
  をレンダリングした状態でプレビュー表示し、かつレイアウトを維持するためのベストプラクティス。
---

# Tauri Card Markdown Preview

ノート一覧画面などで、Markdown をプレビューモードの見た目で表示しつつ、カードのサイズを一定に保つための実装方法。

## 課題

- プレビューをプレーンテキストではなく、レンダリングされた HTML で表示したい。
- ユーザーが入力した任意の Markdown 要素（大きな見出し、長いリストなど）がカードのレイアウトを崩す可能性がある。
- 大量のノートを表示する場合、全コンテンツをレンダリングするとパフォーマンスが低下する。

## 解決策

### 1. ライブラリの選定とレンダリング

`marked`
などの軽量な Markdown パーサーを使用し、プレビュー用にコンテンツを切り出してからレンダリングします。

```typescript
import { marked } from "marked";

export function renderPreview(content: string): string {
  // パフォーマンスとサイズ制限のため、最初の数百文字のみを抽出
  const truncated = content.substring(0, 500);
  return marked.parse(truncated) as string;
}
```

### 2. CSS によるレイアウト制御

カード内での表示を制限し、はみ出し部分を綺麗に見せるためのスタイル設定。

```css
.note-card .preview {
  font-size: 13px;
  line-height: 1.5;
  flex: 1;
  overflow: hidden;
  position: relative;
  max-height: 120px; /* カード内の最大高さを指定 */

  /* 下部にフェードアウト効果を適用して、連続性を表現 */
  -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
}

/* プレビュー内のMarkdown要素の微調整 */
.markdown-body h1,
.markdown-body h2 {
  font-size: 1.1em;
  margin: 0.5em 0 0.2em;
}
.markdown-body ul,
.markdown-body ol {
  padding-left: 1.2em;
}
```

## 注意点

- **HTMLのサニタイズ**: ユーザー入力をそのままレンダリングする場合は XSS に注意してください（`marked`
  のデフォルト設定やサニタイザーの使用を検討）。
- **タグの破断**: 文字数で単純に切り出してレンダリングすると、Markdownの構文（コードブロックの閉じなど）が壊れる可能性があります。必要に応じて構文を意識した切り出しを行ってください。
