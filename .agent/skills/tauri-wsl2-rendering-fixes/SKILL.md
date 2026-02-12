---
name: tauri-wsl2-rendering-fixes
description:
  Tauri アプリを WSL2 (WSLg)
  で実行する際の文字化け（mojibake）や絵文字の描画不具合を解消するためのベストプラクティス。
---

# Tauri WSL2 Rendering Fixes

WSL2
(WSLg) 上で Tauri アプリケーションを実行すると、環境に日本語フォントや絵文字フォントがインストールされていないことが原因で、文字化け（Boxes/豆腐）が発生することがあります。

## 主な症状

- 日本語が含まれるボタンやテキストが「□」と表示される。
- プレースホルダー（`<input placeholder="...">`）の日本語が文字化けする。
- 絵文字（📝, 🔄 など）が正しく表示されない、または消える。

## 解決策

### 1. Web Fonts (Google Fonts) の利用

OS のローカルフォントに依存せず、Google Fonts などの Web
Fonts を明示的に読み込むことで、フォントが未設定の Linux 環境でも正しく表示されます。

- **`index.html` / `note.html` に追加:**
  ```html
  <link
    href="https://fonts.googleapis.com/css2?family=Inter&family=Noto+Sans+JP&display=swap"
    rel="stylesheet"
  />
  ```

### 2. CSS でのフォントファミリー指定

`body` だけでなく、`input` や `textarea`、その `::placeholder`
にも明示的にフォントを指定する必要があります。

- **`style.css` の更新:**

  ```css
  :root {
    --font-main: "Inter", "Noto Sans JP", sans-serif;
  }

  body,
  input,
  textarea {
    font-family: var(--font-main);
  }

  /* プレースホルダーは個別に指定が必要な場合がある */
  input::placeholder {
    font-family: var(--font-main);
  }
  ```

### 3. 絵文字から SVG アイコンへの移行

WSLg などの Linux デスクトップ環境では絵文字フォントのサポートが不完全な場合が多いため、重要な UI 要素には絵文字の代わりに SVG アイコン（Lucide,
Heroicons など）を使用します。

- **Before:** `<span class="icon">📝</span>`
- **After:**
  ```html
  <span class="icon">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ...>
      <!-- SVG path -->
    </svg>
  </span>
  ```

## 注意事項

- ブラウザ版で正常に表示されていても、デスクトップ版（WebView）では動作環境（WSL2内のLinux）のフォント設定に左右されるため、常に Web
  Fonts と SVG アイコンを優先的に使用することが望ましいです。
