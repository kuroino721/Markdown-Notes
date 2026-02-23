---
name: prosemirror-empty-space-click-focus
description: Best practices for handling clicks in the empty space around a ProseMirror/Milkdown/Crepe editor to correctly focus and place the cursor at the end of the document. Use this when you need to enable clicking anywhere in the note/editor container to start typing.
---

# ProseMirror/Milkdown Empty Space Click Focus

## 症状や背景
MilkdownやProseMirror等のエディタを実装した際、エディタのテキスト本文が短く下部・周辺に余白がある場合、その余白部分（コンテナ要素など）をクリックしてもエディタにフォーカスが当たらず、すぐに入力を開始できないという問題が頻出します。ユーザー体験を向上させるためには、ノートエリアのどこをクリックしても書き始められるようにする必要があります。

## 具体的な解決策
エディタをラップしている親コンテナにクリックイベントリスナーを追加し、余白部分（特定のクラスやIDを持つラッパー要素自体）がクリックされたことを検知します。検知した場合、明示的に `editorView.focus()` を呼び出すだけでなく、`TextSelection` を用いてドキュメントの末尾にカーソル位置（キャレット）を移動させるトランザクションを発行します。

### コード例（TypeScript）

```typescript
import { TextSelection } from '@milkdown/prose/state';

// editorView は Milkdown / ProseMirror の EditorView インスタンス
const editorContainer = document.getElementById('editor-container');

if (editorContainer) {
  editorContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // テキスト要素自体ではなく、余白部分（コンテナ自体や全体を囲むラッパー要素）か判定
    if (
      target === editorContainer ||
      target.id === 'editor' ||
      target.classList.contains('milkdown') ||
      target.classList.contains('crepe')
    ) {
      if (editorView) {
        try {
          // まずフォーカスを当てる
          editorView.focus();
          
          const { state, dispatch } = editorView;
          if (state && dispatch) {
            // ドキュメントの末尾のポジション（サイズ）を取得
            const endPos = state.doc.content.size;
            
            // カーソルを末尾に設定するトランザクションを生成してディスパッチ
            const tr = state.tr.setSelection(TextSelection.create(state.doc, endPos));
            dispatch(tr);
          }
        } catch (err) {
          console.error('Failed to move cursor to end:', err);
        }
      }
    }
  });
}
```

## 注意事項や制約
- `editorView` の取得・保持方法は使用しているフレームワーク・バージョンにより異なります。
- `TextSelection` のインポート元は `@milkdown/prose/state` や `prosemirror-state` など、プロジェクトの構成に合わせてください。
- クリックされた要素がPタグやLIタグなど、既に文字が存在する行の要素である場合は、ProseMirror標準のクリック処理（カーソル移動）に任せるべきです。そのため判定条件（`e.target === ...`）を適切に絞り込み、テキスト要素へのクリックをフックしないように注意してください。
