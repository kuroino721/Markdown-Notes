---
name: Tauri Google OAuth
description: Tauri (WebView2) における Google OAuth のポップアップ制限を回避し、クロスプラットフォーム同期を安定させるためのベストプラクティス。
---

# Tauri Google OAuth 実装ガイド

Tauri デスクトップアプリ（特に Windows WebView2）で Google OAuth を実装する際、ポップアップウィンドウがブロックされたり、正常に動作しないことがよくあります。このスキルは、それらの制限を回避し、ブラウザ版とのクロスプラットフォーム同期を安定させるための手法をまとめます。

## 1. ポップアップではなく「リダイレクト方式」を採用する

Tauri の WebView 内では Google のポップアップ SDK (`google.accounts.oauth2.initTokenClient`) が正常に動作しない、あるいは物理的にブロックされることが多いです。

### 解決策
アプリ全体を Google のログインページへ一度遷移させ、認証後にアプリへ戻ってくる「リダイレクト方式」を導入します。

- **OAuth URL の構築**: 手動で `https://accounts.google.com/o/oauth2/v2/auth` を構築します。
- **Redirect URI**: 使用しているオリジン（例: `http://localhost:1420/`）を指定します。
- **Response Type**: クライアントサイドのみで完結させる場合は `token` (Implicit Flow) を使用します。

```javascript
const redirectUri = window.location.origin + '/';
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=select_account`;
window.location.assign(authUrl);
```

## 2. 認証後のトークン処理 (Hash Fragment)

リダイレクト後にアプリに戻ってきた際、URL の `hash` 部分にアクセス・トークンが含まれます。これを起動時に解析して取得します。

- **取得と清掃**: トークンを取得したら、セキュリティと見た目のため `history.replaceState` で URL を綺麗にします。
- **初期化順序**: Google SDK (`gapi`) が初期化される前にトークンを検出し、初期化後に `gapi.client.setToken` でセットする必要があります。

## 3. クロスプラットフォーム・データの互換性 (Schema)

ブラウザ版とデスクトップ版で同期を行う場合、デスクトップ版のみで必要なフィールド（例: `window_state`）が欠落することがあります。

### 解決策: Rust Backend (Serde)
Rust 側の構造体で `#[serde(default)]` を使用し、欠落しているフィールドをデフォルト値で補完します。これにより、ブラウザ版から来た不完全な JSON でもエラーにならずに読み込めます。

```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    // ...
    #[serde(default)] // フィールドがない場合は Default::default() が使われる
    pub window_state: WindowState,
    #[serde(default = "default_color")]
    pub color: String,
}
```

## 4. UI の応答性 (Non-blocking Async)

起動時に Google API などの重い同期処理を行う際、単純に `await` してしまうと UI のイベントハンドラ（ボタンクリックなど）の登録が遅れ、ボタンが反応しなくなることがあります。

- **解決策**: 起動時の初期化処理は非同期（IIFE など）で実行し、UI のメインスレッドをブロックしないようにします。

## 5. Google Cloud Console の厳密な設定

- **Redirect URI**: 末尾の `/` (スラッシュ) の有無まで完全一致させる必要があります。例: `http://localhost:1420/` を必ず登録します。

## 6. 環境検出の安定化

`window.__TAURI__` の有無だけでなく、アダプターや専用のグローバルフラグ（`window.IS_TAURI_ADAPTER = true`）を併用することで、環境検出の失敗による誤った認証フローの選択を防ぎます。
