---
name: Tauri Google OAuth
description: Tauri における Google OAuth の「Desktop App」クライアントタイプ利用、PKCE フロー、および Windows での URL 切断問題を回避するベストプラクティス。
---

# Tauri Google OAuth 実装ガイド

Tauri デスクトップアプリで Google OAuth を実装する際、WebView の制限や OS ごとのシェルの挙動により、多くの落とし穴があります。このスキルは、それらを回避し安定した認証を実現するための最新の手法をまとめます。

## 1. クライアントタイプとフローの選択

デスクトップアプリ（Tauri）では、従来の「ウェブ アプリケーション」タイプや「インプリシットフロー（token）」は `invalid_request` (Error 400) の原因となります。

- **クライアントタイプ**: **「デスクトップ アプリ (Desktop App)」** を使用します。
- **認可フロー**: **「認可コードフロー (Authorization Code Flow) + PKCE」** を採用します。
- **リダイレクト URI**: `http://localhost:51737/` などのループバックアドレスを使用します（`tauri.localhost` は Google によって禁止されています）。

## 2. Windows での URL 切断問題 (重要)

Tauri (Rust) からシステムブラウザを起動する際、Windows の標準的な `cmd /C start <URL>` 実行では、URL に含まれる `&` 記号がコマンド区切りとして解釈され、URL が途中で途切れる（`response_type` 等のパラメータが消失する）問題が発生します。

### 解決策: `opener` クレートの使用
シェルを介さず OS API を直接呼ぶことで、特殊文字を含む長い URL を安全にブラウザへ渡せます。

**Rust (Cargo.toml)**
```toml
opener = "0.7"
```

**Rust (lib.rs / auth.rs)**
```rust
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    opener::open_browser(&url).map_err(|e| e.to_string())
}
```

## 3. PKCE (Proof Key for Code Exchange) の実装

フロントエンドで `code_challenge` と `code_verifier` を生成し、認可コードとアクセストークンの交換時の安全性を確保します。

```typescript
async generatePKCE() {
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { verifier, challenge };
}
```

## 4. マルチ環境（Web/Desktop）での認証情報の出し分け

ブラウザ版とデスクトップ版で異なるクライアント ID を使用する場合、環境を動的に検出し使い分けます。

```typescript
const isTauri = () => !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
const getClientId = () => isTauri() ? VITE_CLIENT_ID_DESKTOP : VITE_CLIENT_ID_WEB;

// signIn 関数内
if (isTauri()) {
    // 認可コードフロー + PKCE
} else {
    // インプリシットフロー (GIS SDK 等)
}
```

## 5. ループバックサーバーの簡略化

認可コードフローでは、Rust 側のサーバーはクエリパラメータから `code` を抽出するだけで済みます。

```rust
if url.contains("code=") {
    // URLSearchParams 的な処理で code を抽出し、フロントエンドへ返す
}
```

## 6. チェックリスト
- [ ] Google Cloud Console で「デスクトップ アプリ」として ID を作成したか？
- [ ] `http://localhost:<PORT>/` が承認済みリダイレクト先として登録されているか？
- [ ] Windows で URL が `&` の位置で途切れていないか（`opener` を使っているか）？
- [ ] PKCE の `code_challenge` と `code_verifier` が正しく交換に利用されているか？
