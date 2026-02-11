---
name: Tauri Compact Editor UI
description: 付箋（Sticky Notes）のような制約のあるウィンドウサイズで、Milkdown/Crepe などのエディタフレームワークのデフォルトスタイルを上書きし、最適なレイアウトを実現するためのベストプラクティス。
---

# Tauri Compact Editor UI 実装ガイド

付箋アプリのようにウィンドウサイズが小さい環境では、モダンなエディタフレームワーク（Milkdown, Crepe, Editor.js など）のデフォルトスタイルが「広すぎる余白」や「意図しない中央寄せ」を引き起こし、UX を損なうことがあります。このスキルでは、それらを解消するための手法をまとめます。

## 1. フレームワークによる「中央寄せ」と「最大幅」の解除

多くのエディタは、大きなディスプレイでの読みやすさを考慮して `max-width` や `margin: 0 auto` が設定されています。付箋のような小さなウィンドウでは、これらを強制的に解除する必要があります。

- **解決策**: `!important` を使用して、特定のコンテナ内（例: `.note-editor`）のスタイルを上書きします。

```css
/* グローバルなエディタ設定の上書き */
.note-editor #editor {
    max-width: none !important;
    margin: 0 !important;
}

/* フレームワーク内部のコンテナも解除 */
.note-editor .milkdown,
.note-editor .crepe {
    max-width: none !important;
    margin: 0 !important;
}
```

## 2. 内部パディング・マージンの完全なリセット

エディタフレームワーク（特に Crepe のようなフル機能版）は、内部に独自のパディングやマージンを持っています。外側のコンテナのパディングを極限まで絞っても、内部に残っていると「余白が広い」という印象を与えます。

- **解決策**: `ProseMirror`（多くのエディタが内部で使用しているエンジン）やフレームワーク固有のクラスに対してパディングを `0` にリセットします。

```css
.note-editor #editor .ProseMirror {
    padding: 0 !important;
    margin: 0 !important;
    outline: none;
}

.note-editor .milkdown,
.note-editor .crepe {
    padding: 0 !important;
}
```

## 3. ヘッダー・フッターとのバランス

ウィンドウが小さい場合、パディングは `8px` 〜 `12px` 程度が「タイトで機能的」に見えます。

- **ヘッダー/フッター**: コンテンツ（タイトルやステータス）が端に寄りすぎないよう、水平方向のパディングを確保し、垂直方向は最小限にします。
- **ボタン間隔**: アイコン同士が近すぎると誤操作の原因になるため、`4px` 〜 `8px` 程度の `gap` を維持します。

## 4. 視覚的一貫性 (Visual Alignment)

付箋のタイトルバー（ヘッダー）のテキスト開始位置と、エディタ内部のテキスト開始位置を揃えることで、統一感のあるデザインになります。

- **テクニック**: ヘッダーの `padding-left` と、エディタコンテナの `padding-left` を同じ値（例: `12px`）に設定します。

## 5. フレームワーク固有の「フレーム」の扱い

一部のフレームワークは `frame.css` のようなファイルを読み込み、太い枠線や影を追加することがあります。

- **解決策**: 不要な装飾を `background: transparent !important` や `border: none !important` で剥ぎ取り、アプリ独自の背景色（付箋の色など）が正しく表示されるようにします。
